package pcap

import (
	"net"
	"sync/atomic"
	"time"

	"github.com/cxmind/sniffer/internal/config"
	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/rs/zerolog/log"
)

// PacketHandler is the callback signature for captured packets
type PacketHandler func(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort uint16, timestamp time.Time)

type Sniffer struct {
	cfg         *config.Config
	sipHandler  PacketHandler
	rtpHandler  PacketHandler
	packetCount uint64
	stopped     chan struct{}
}

func NewSniffer(cfg *config.Config, sipHandler, rtpHandler PacketHandler) *Sniffer {
	return &Sniffer{
		cfg:        cfg,
		sipHandler: sipHandler,
		rtpHandler: rtpHandler,
		stopped:    make(chan struct{}),
	}
}

func (s *Sniffer) Start() error {
	log.Info().Str("interface", s.cfg.Interface).Str("filter", s.cfg.Filter).Msg("Starting packet capture")

	source, err := newPacketSource(s.cfg.Interface, s.cfg.Filter, int32(s.cfg.SnapLen))
	if err != nil {
		return err
	}
	defer source.Close()

	packets := source.Packets()

	for {
		select {
		case <-s.stopped:
			log.Info().Msg("Packet capture stopped")
			return nil
		case packet, ok := <-packets:
			if !ok {
				return nil
			}
			s.processPacket(packet)
		}
	}
}

func (s *Sniffer) Stop() {
	select {
	case <-s.stopped:
	default:
		close(s.stopped)
	}
}

func (s *Sniffer) processPacket(packet gopacket.Packet) {
	// Extract IP layer
	ipLayer := packet.Layer(layers.LayerTypeIPv4)
	if ipLayer == nil {
		return
	}
	ip, _ := ipLayer.(*layers.IPv4)

	// Extract Transport layer (UDP or TCP)
	var srcPort, dstPort uint16
	var payload []byte
	if tcpLayer := packet.Layer(layers.LayerTypeTCP); tcpLayer != nil {
		tcp, _ := tcpLayer.(*layers.TCP)
		srcPort = uint16(tcp.SrcPort)
		dstPort = uint16(tcp.DstPort)
		payload = tcp.Payload
	} else if udpLayer := packet.Layer(layers.LayerTypeUDP); udpLayer != nil {
		udp, _ := udpLayer.(*layers.UDP)
		srcPort = uint16(udp.SrcPort)
		dstPort = uint16(udp.DstPort)
		payload = udp.Payload
	} else {
		return
	}

	if len(payload) == 0 {
		return
	}

	timestamp := packet.Metadata().Timestamp

	// Determine if it's SIP based on payload (lightweight heuristics).
	if s.isSIP(payload) {
		if s.sipHandler != nil {
			s.sipHandler(payload, ip.SrcIP, ip.DstIP, srcPort, dstPort, timestamp)
		}
	} else {
		// Assume RTP/RTCP for other traffic matching the filter
		if s.rtpHandler != nil {
			s.rtpHandler(payload, ip.SrcIP, ip.DstIP, srcPort, dstPort, timestamp)
		}
	}

	// Lightweight counters for observability
	n := atomic.AddUint64(&s.packetCount, 1)
	if n%1000 == 0 {
		log.Debug().Uint64("packets", n).Msg("packets captured")
	}
}

func (s *Sniffer) isSIP(payload []byte) bool {
	// Check for common SIP methods
	methods := []string{"INVITE", "ACK", "BYE", "CANCEL", "REGISTER", "OPTIONS", "SIP/2.0"}
	strPayload := string(payload)
	for _, m := range methods {
		if len(strPayload) > len(m) && strPayload[:len(m)] == m {
			return true
		}
	}
	return false
}
