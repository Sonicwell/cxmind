package relay

import (
	"bytes"
	"fmt"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/cxmind/sniffer/internal/hep"
)

type mappingEntry struct {
	CallID    string
	ExpiresAt time.Time
}

// Relay handles SIP → RTP mapping (SDP parsing), Correlation ID injection,
// and HEP routing (Local → IE, Local → Peers, Peers → IE).
type Relay struct {
	portMap   sync.Map // key: "ip:port" -> value: mappingEntry
	callPorts sync.Map // key: callID   -> value: *sync.Map (key: "ip:port", value: struct{})
	client    HEPClient
	peers     []HEPClient
	relayUp   bool
	ttl       time.Duration
}

// HEPClient is the interface for sending HEP packets, fulfilled by *hep.Client
type HEPClient interface {
	SendRaw(data []byte) error
	SendWithCorrelation(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort uint16, timestamp time.Time, protoID uint8, correlationID string) error
}

func NewRelay(client HEPClient, peers []HEPClient, relayUpstream bool, ttl time.Duration) *Relay {
	r := &Relay{
		client:  client,
		peers:   peers,
		relayUp: relayUpstream,
		ttl:     ttl,
	}

	go r.cleanupLoop()
	return r
}

func (r *Relay) cleanupLoop() {
	ticker := time.NewTicker(r.ttl / 2)
	for range ticker.C {
		r.cleanupExpired()
	}
}

func (r *Relay) cleanupExpired() {
	now := time.Now()
	var expiredKeys []string

	r.portMap.Range(func(key, value interface{}) bool {
		entry := value.(mappingEntry)
		if now.After(entry.ExpiresAt) {
			expiredKeys = append(expiredKeys, key.(string))
		}
		return true
	})

	for _, key := range expiredKeys {
		if val, loaded := r.portMap.LoadAndDelete(key); loaded {
			callID := val.(mappingEntry).CallID
			if v, ok := r.callPorts.Load(callID); ok {
				portsMap := v.(*sync.Map)
				portsMap.Delete(key)

				// Optional: Check if empty to clean up the parent map
				empty := true
				portsMap.Range(func(k, v interface{}) bool {
					empty = false
					return false // stop iteration
				})
				if empty {
					r.callPorts.Delete(callID)
				}
			}
		}
	}
}

func (r *Relay) addMapping(callID, ip string, port int) {
	if ip == "" || port == 0 || callID == "" {
		return
	}

	key := fmt.Sprintf("%s:%d", ip, port)
	entry := mappingEntry{CallID: callID, ExpiresAt: time.Now().Add(r.ttl)}
	r.portMap.Store(key, entry)

	// Maintain reverse lookup for BYE cleanup
	v, _ := r.callPorts.LoadOrStore(callID, &sync.Map{})
	portsMap := v.(*sync.Map)
	portsMap.Store(key, struct{}{})
}

func (r *Relay) removeMapping(callID string) {
	v, loaded := r.callPorts.LoadAndDelete(callID)
	if loaded {
		portsMap := v.(*sync.Map)
		portsMap.Range(func(k, _ interface{}) bool {
			r.portMap.Delete(k)
			return true
		})
	}
}

// LookupCallID finds the Call-ID for a given IP and Port
func (r *Relay) LookupCallID(ip string, port uint16) (string, bool) {
	key := fmt.Sprintf("%s:%d", ip, port)
	if val, ok := r.portMap.Load(key); ok {
		entry := val.(mappingEntry)
		return entry.CallID, true
	}
	return "", false
}

// HandleLocalSIP processes a SIP packet captured via local pcap.
func (r *Relay) HandleLocalSIP(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort uint16, timestamp time.Time) {
	callID := extractCallID(payload)
	isBye := bytes.Contains(payload, []byte("BYE sip:")) || bytes.HasPrefix(payload, []byte("BYE "))

	if callID != "" {
		if isBye {
			r.removeMapping(callID)
		} else {
			ip, port := extractMediaPort(payload)
			r.addMapping(callID, ip, port)
		}
	}

	// 1. Send SIP encoded to IE
	r.client.SendWithCorrelation(payload, srcIP, dstIP, srcPort, dstPort, timestamp, 1, callID)

	// 2. Send SIP encoded to Peers (for their mapping, proto=1)
	for _, peer := range r.peers {
		peer.SendWithCorrelation(payload, srcIP, dstIP, srcPort, dstPort, timestamp, 1, callID)
	}
}

// HandleLocalRTP processes an RTP packet captured via local pcap.
func (r *Relay) HandleLocalRTP(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort uint16, timestamp time.Time) {
	sysSrc := srcIP.String()
	sysDst := dstIP.String()

	// Dual key lookup: RTP packet src or dst could match the SDP port
	callID, ok := r.LookupCallID(sysDst, dstPort)
	if !ok {
		callID, ok = r.LookupCallID(sysSrc, srcPort)
	}

	if ok {
		// Found mapping -> Inject CorrelationID and send to IE
		r.client.SendWithCorrelation(payload, srcIP, dstIP, srcPort, dstPort, timestamp, 34, callID)
	}
	// Drop if no mapping found
}

// HandlePeerHEP processes a HEP packet received from a peer sniffer-go.
func (r *Relay) HandlePeerHEP(raw []byte, pkt *hep.HEPPacket) {
	// Only SIP packets (proto=1) from peers are processed for mapping
	if pkt.ProtocolType == 1 {
		callID := extractCallID(pkt.Payload)
		isBye := bytes.Contains(pkt.Payload, []byte("BYE sip:")) || bytes.HasPrefix(pkt.Payload, []byte("BYE "))

		if callID != "" {
			if isBye {
				r.removeMapping(callID)
			} else {
				ip, port := extractMediaPort(pkt.Payload)
				r.addMapping(callID, ip, port)
			}
		}
	}

	// Forward raw byte stream to IE if relay upstream is enabled
	if r.relayUp {
		r.client.SendRaw(raw)
	}
}

// --- Inline parsers ---

func extractCallID(payload []byte) string {
	// Zero-allocation case-insensitive prefix search
	var lineStart, lineEnd int
	length := len(payload)

	for i := 0; i < length; i++ {
		if payload[i] == '\r' || payload[i] == '\n' {
			if lineStart < i {
				lineEnd = i
				line := payload[lineStart:lineEnd]

				// Check for "Call-ID:" (length 8) or "i:" (length 2)
				if len(line) >= 8 && (line[0] == 'C' || line[0] == 'c') &&
					(line[1] == 'a' || line[1] == 'A') &&
					(line[2] == 'l' || line[2] == 'L') &&
					(line[3] == 'l' || line[3] == 'L') &&
					line[4] == '-' &&
					(line[5] == 'I' || line[5] == 'i') &&
					(line[6] == 'D' || line[6] == 'd') &&
					line[7] == ':' {

					return string(bytes.TrimSpace(line[8:]))
				} else if len(line) >= 2 && (line[0] == 'i' || line[0] == 'I') && line[1] == ':' {
					return string(bytes.TrimSpace(line[2:]))
				}
			}
			lineStart = i + 1
		}
	}
	// Check the last line if not terminated by newline
	if lineStart < length {
		line := payload[lineStart:]
		if len(line) >= 8 && (line[0] == 'C' || line[0] == 'c') &&
			(line[1] == 'a' || line[1] == 'A') &&
			(line[2] == 'l' || line[2] == 'L') &&
			(line[3] == 'l' || line[3] == 'L') &&
			line[4] == '-' &&
			(line[5] == 'I' || line[5] == 'i') &&
			(line[6] == 'D' || line[6] == 'd') &&
			line[7] == ':' {

			return string(bytes.TrimSpace(line[8:]))
		} else if len(line) >= 2 && (line[0] == 'i' || line[0] == 'I') && line[1] == ':' {
			return string(bytes.TrimSpace(line[2:]))
		}
	}
	return ""
}

func extractMediaPort(payload []byte) (string, int) {
	lines := bytes.Split(payload, []byte("\r\n"))
	var port int
	var sessionIP, mediaIP string
	inAudio := false

	for _, line := range lines {
		line = bytes.TrimSpace(line)

		if bytes.HasPrefix(line, []byte("m=audio ")) {
			parts := bytes.Fields(line)
			if len(parts) >= 2 {
				p, err := strconv.Atoi(string(parts[1]))
				if err == nil {
					port = p
				}
			}
			inAudio = true
		} else if bytes.HasPrefix(line, []byte("m=")) {
			inAudio = false
		} else if bytes.HasPrefix(line, []byte("c=")) {
			parts := bytes.Split(line, []byte(" "))
			if len(parts) >= 3 {
				ip := string(parts[2])
				if inAudio {
					mediaIP = ip
				} else if !inAudio && port == 0 {
					sessionIP = ip
				}
			}
		}
	}

	if port == 0 {
		return "", 0
	}
	if mediaIP != "" {
		return mediaIP, port
	}
	return sessionIP, port
}
