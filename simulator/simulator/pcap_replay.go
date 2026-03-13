package simulator

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcapgo"
)

// ReplayOptions controls replay behavior
type ReplayOptions struct {
	SIPOnly bool    // 只回放 SIP 包，跳过 RTP/RTCP
	Speed   float64 // 0=固定500ms间隔(默认), >0=按pcap时间戳倍速(1.0=实时)
}

// DefaultReplayOptions returns sensible defaults (fixed 500ms interval)
func DefaultReplayOptions() ReplayOptions {
	return ReplayOptions{Speed: 0}
}

// ReplayPCAPFile reads a PCAP file and replays its UDP payload to the HEP server.
// It rewrites the targetCallID with a timestamp suffix to ensure uniqueness per run.
func (c *Client) ReplayPCAPFile(filePath string, targetCallID string) (string, error) {
	return c.ReplayPCAPFileWithOptions(filePath, targetCallID, DefaultReplayOptions())
}

// ReplayPCAPFileWithOptions replays a PCAP file with configurable options.
func (c *Client) ReplayPCAPFileWithOptions(filePath string, targetCallID string, opts ReplayOptions) (string, error) {
	const fixedInterval = 500 * time.Millisecond
	useFixedInterval := opts.Speed <= 0

	f, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to open pcap file %s: %v", filePath, err)
	}
	defer f.Close()

	r, err := pcapgo.NewReader(f)
	if err != nil {
		return "", fmt.Errorf("failed to create pcapgo reader: %v", err)
	}

	var newCallID string
	if targetCallID != "" {
		newCallID = fmt.Sprintf("%s_%d", targetCallID, time.Now().Unix())
	}

	replaySuffix := fmt.Sprintf("_%d", time.Now().UnixNano())
	trackedRTPPorts := make(map[uint16]bool)
	portToCallID := make(map[uint16]string) // NEW: Map RTP/RTCP ports to their SIP Call-ID
	trackAll := targetCallID == ""

	// 预扫描所有包
	type replayPacket struct {
		payload   []byte
		srcIP     string
		dstIP     string
		srcPort   uint16
		dstPort   uint16
		timestamp time.Time // pcap 原始时间戳
		isSIP     bool
		callID    string // SIP 包的 Call-ID
		protoID   uint8
		sipDesc   string
	}

	var allPackets []replayPacket
	var firstPktTime time.Time

	for {
		data, ci, err := r.ReadPacketData()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}

		var packet gopacket.Packet
		if (int(r.LinkType()) == 276 || int(r.LinkType()) == 20) && len(data) > 20 {
			// Linux Cooked v2 (SLL2) workaround for gopacket not supporting it natively.
			// Sometimes it returns 276, sometimes 20 depending on the pcap library version.
			// Skip the 20 byte SLL2 header and parse as IPv4 directly.
			packet = gopacket.NewPacket(data[20:], layers.LayerTypeIPv4, gopacket.Default)
		} else {
			packet = gopacket.NewPacket(data, r.LinkType(), gopacket.Default)
		}

		ipLayer := packet.Layer(layers.LayerTypeIPv4)
		if ipLayer == nil {
			continue
		}
		ip, _ := ipLayer.(*layers.IPv4)

		udpLayer := packet.Layer(layers.LayerTypeUDP)
		if udpLayer == nil {
			continue
		}
		udp, _ := udpLayer.(*layers.UDP)

		payload := udp.Payload
		if len(payload) == 0 {
			continue
		}

		isSIP := udp.SrcPort == 5060 || udp.DstPort == 5060 || isSIPPayload(payload)

		callID := ""
		sipDesc := ""
		if isSIP {
			callID = extractCallID(payload)
			sipDesc = extractSIPFirstLine(payload)
		}

		if isSIP {
			strPayload := string(payload)
			if strings.HasPrefix(strPayload, "OPTIONS ") {
				continue
			}

			if trackAll {
				payload = rewriteCallIDSuffix(payload, replaySuffix)
				if callID != "" {
					callID = callID + replaySuffix // Keep internal callID tracked properly
				}
			} else {
				if !strings.Contains(strPayload, "Call-ID: "+targetCallID) &&
					!strings.Contains(strPayload, "i: "+targetCallID) {
					continue
				}
				payload = bytes.ReplaceAll(payload, []byte(targetCallID), []byte(newCallID))
				callID = newCallID
			}

			// Map audio ports to Call-ID
			strPayload = string(payload)
			if strings.Contains(strPayload, "m=audio ") {
				lines := strings.Split(strPayload, "\n")
				for _, line := range lines {
					if strings.HasPrefix(line, "m=audio ") {
						parts := strings.Split(line, " ")
						if len(parts) >= 2 {
							var port uint16
							fmt.Sscanf(parts[1], "%d", &port)
							if port > 0 {
								trackedRTPPorts[port] = true
								trackedRTPPorts[port+1] = true
								if callID != "" {
									portToCallID[port] = callID
									portToCallID[port+1] = callID
								}
							}
						}
					}
				}
			}
		} else {
			if opts.SIPOnly {
				continue
			}
			srcP := uint16(udp.SrcPort)
			dstP := uint16(udp.DstPort)

			if !trackAll {
				if !trackedRTPPorts[srcP] && !trackedRTPPorts[dstP] {
					continue
				}
			}

			// Assign the Call-ID mapped to this RTP/RTCP port
			if cid, ok := portToCallID[srcP]; ok {
				callID = cid
			} else if cid, ok := portToCallID[dstP]; ok {
				callID = cid
			}
		}

		if firstPktTime.IsZero() {
			firstPktTime = ci.Timestamp
		}

		protoID := uint8(1)
		if !isSIP {
			protoID = 34
			if len(payload) >= 2 && payload[1] >= 192 && payload[1] <= 223 {
				protoID = 5
			}
		}

		allPackets = append(allPackets, replayPacket{
			payload:   append([]byte{}, payload...), // copy
			srcIP:     ip.SrcIP.String(),
			dstIP:     ip.DstIP.String(),
			srcPort:   uint16(udp.SrcPort),
			dstPort:   uint16(udp.DstPort),
			timestamp: ci.Timestamp,
			isSIP:     isSIP,
			callID:    callID,
			protoID:   protoID,
			sipDesc:   sipDesc,
		})
	}

	if len(allPackets) == 0 {
		return newCallID, nil
	}

	replayStartTime := time.Now()
	sipCount := 0
	otherCount := 0

	if useFixedInterval {
		// 按 Call-ID 分组，SIP + RTP/RTCP 混合在同一 dialog 内按时间戳顺序发送
		type dialogPacket struct {
			pkt replayPacket
		}
		dialogGroups := make(map[string][]dialogPacket)
		var orphanPackets []replayPacket // RTP without a mapped Call-ID

		for _, pkt := range allPackets {
			if pkt.callID != "" {
				dialogGroups[pkt.callID] = append(dialogGroups[pkt.callID], dialogPacket{pkt: pkt})
			} else {
				orphanPackets = append(orphanPackets, pkt)
			}
		}

		// 每个 dialog 启动独立 goroutine，SIP+RTP 按时间戳顺序混合发送
		var wg sync.WaitGroup
		var mu sync.Mutex

		for cid, packets := range dialogGroups {
			wg.Add(1)
			go func(callID string, pkts []dialogPacket) {
				defer wg.Done()
				lastWasSIP := false
				for _, dp := range pkts {
					// SIP 包之间使用固定间隔，确保 IE 有时间处理 session 创建
					if dp.pkt.isSIP && lastWasSIP {
						time.Sleep(fixedInterval)
					}

					rebasedTime := replayStartTime.Add(dp.pkt.timestamp.Sub(firstPktTime))
					c.sendPacketWithTime(dp.pkt.payload, dp.pkt.srcIP, dp.pkt.dstIP, dp.pkt.protoID, dp.pkt.srcPort, dp.pkt.dstPort, rebasedTime, dp.pkt.callID)

					mu.Lock()
					if dp.pkt.isSIP {
						sipCount++
						shortCID := callID
						if len(shortCID) > 16 {
							shortCID = shortCID[:16] + "..."
						}
						elapsed := time.Since(replayStartTime)
						log.Printf("[Replay] +%.3fs  SIP#%d  [%s]  %s → %s:%d",
							elapsed.Seconds(), sipCount, shortCID, dp.pkt.sipDesc,
							dp.pkt.dstIP, dp.pkt.dstPort)
					} else {
						otherCount++
					}
					mu.Unlock()

					lastWasSIP = dp.pkt.isSIP
				}
			}(cid, packets)
		}

		wg.Wait()

		// Orphan packets (RTP without mapped Call-ID) sent last
		for _, pkt := range orphanPackets {
			rebasedTime := replayStartTime.Add(pkt.timestamp.Sub(firstPktTime))
			c.sendPacketWithTime(pkt.payload, pkt.srcIP, pkt.dstIP, pkt.protoID, pkt.srcPort, pkt.dstPort, rebasedTime, pkt.callID)
			otherCount++
		}

		log.Printf("[Replay] Done. SIP: %d pkts, Other: %d pkts, Speed: parallel-500ms", sipCount, otherCount)
	} else {
		// speed>0: 串行发送，按 pcap 时间戳倍速
		for _, pkt := range allPackets {
			targetDelta := pkt.timestamp.Sub(firstPktTime)
			rebasedTime := replayStartTime.Add(targetDelta)

			scaledDelta := time.Duration(float64(targetDelta) / opts.Speed)
			actualDelta := time.Since(replayStartTime)
			if scaledDelta > actualDelta {
				time.Sleep(scaledDelta - actualDelta)
			}

			if pkt.isSIP {
				sipCount++
				shortCID := pkt.callID
				if len(shortCID) > 16 {
					shortCID = shortCID[:16] + "..."
				}
				elapsed := time.Since(replayStartTime)
				log.Printf("[Replay] +%.3fs  #%d  [%s]  %s → %s:%d",
					elapsed.Seconds(), sipCount, shortCID, pkt.sipDesc,
					pkt.dstIP, pkt.dstPort)
			} else {
				otherCount++
			}

			c.sendPacketWithTime(pkt.payload, pkt.srcIP, pkt.dstIP, pkt.protoID, pkt.srcPort, pkt.dstPort, rebasedTime, pkt.callID)
		}
		log.Printf("[Replay] Done. SIP: %d pkts, Other: %d pkts, Speed: %.1fx", sipCount, otherCount, opts.Speed)
	}

	return newCallID, nil
}

// isSIPPayload checks if payload starts with a known SIP method or response prefix.
// 比 bytes.Contains 严格，避免 RTP payload 碰巧包含 "SIP/2.0" 被误判
func isSIPPayload(payload []byte) bool {
	sipPrefixes := [][]byte{
		[]byte("INVITE "),
		[]byte("ACK "),
		[]byte("BYE "),
		[]byte("CANCEL "),
		[]byte("REGISTER "),
		[]byte("OPTIONS "),
		[]byte("PRACK "),
		[]byte("SUBSCRIBE "),
		[]byte("NOTIFY "),
		[]byte("PUBLISH "),
		[]byte("INFO "),
		[]byte("REFER "),
		[]byte("MESSAGE "),
		[]byte("UPDATE "),
		[]byte("SIP/2.0 "),
	}
	for _, prefix := range sipPrefixes {
		if bytes.HasPrefix(payload, prefix) {
			return true
		}
	}
	return false
}

// extractSIPFirstLine returns the first line of a SIP message (method/status)
func extractSIPFirstLine(payload []byte) string {
	end := bytes.IndexByte(payload, '\r')
	if end < 0 {
		end = bytes.IndexByte(payload, '\n')
	}
	if end < 0 {
		if len(payload) > 80 {
			end = 80
		} else {
			end = len(payload)
		}
	}
	return string(payload[:end])
}

// rewriteCallIDSuffix appends suffix to the Call-ID header value.
// Handles both "Call-ID: xxx\r\n" and compact "i: xxx\r\n" forms.
func rewriteCallIDSuffix(payload []byte, suffix string) []byte {
	suffixBytes := []byte(suffix)
	// "Call-ID: value\r\n" → "Call-ID: value_suffix\r\n"
	if idx := bytes.Index(payload, []byte("Call-ID: ")); idx >= 0 {
		lineEnd := bytes.Index(payload[idx:], []byte("\r\n"))
		if lineEnd > 0 {
			insertPos := idx + lineEnd
			result := make([]byte, 0, len(payload)+len(suffixBytes))
			result = append(result, payload[:insertPos]...)
			result = append(result, suffixBytes...)
			result = append(result, payload[insertPos:]...)
			return result
		}
	}
	// compact form: "i: value\r\n"
	if idx := bytes.Index(payload, []byte("\r\ni: ")); idx >= 0 {
		headerStart := idx + 2 // skip \r\n
		lineEnd := bytes.Index(payload[headerStart:], []byte("\r\n"))
		if lineEnd > 0 {
			insertPos := headerStart + lineEnd
			result := make([]byte, 0, len(payload)+len(suffixBytes))
			result = append(result, payload[:insertPos]...)
			result = append(result, suffixBytes...)
			result = append(result, payload[insertPos:]...)
			return result
		}
	}
	return payload
}

// extractCallID extracts Call-ID value from SIP payload
func extractCallID(payload []byte) string {
	// "Call-ID: value\r\n"
	if idx := bytes.Index(payload, []byte("Call-ID: ")); idx >= 0 {
		start := idx + len("Call-ID: ")
		end := bytes.Index(payload[start:], []byte("\r\n"))
		if end > 0 {
			return string(payload[start : start+end])
		}
	}
	// compact: "\r\ni: value\r\n"
	if idx := bytes.Index(payload, []byte("\r\ni: ")); idx >= 0 {
		start := idx + len("\r\ni: ")
		end := bytes.Index(payload[start:], []byte("\r\n"))
		if end > 0 {
			return string(payload[start : start+end])
		}
	}
	return ""
}
