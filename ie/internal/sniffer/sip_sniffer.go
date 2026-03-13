package sniffer

import (
	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"

	"fmt"
	"log"
	"net"
	"strings"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"

	"github.com/cxmind/ingestion-go/internal/hep"
)

// SIPSniffer captures SIP UDP traffic directly from a network interface
// using gopacket and feeds parsed packets into the shared SIP pipeline.
type SIPSniffer struct {
	iface   string
	ports   []int
	source  PacketSource
	stopped chan struct{}
}

// NewSIPSniffer creates a sniffer configured from viper.
func NewSIPSniffer() *SIPSniffer {
	iface := config.Global.GetString("sniffer.interface")
	if iface == "" {
		iface = "eth0"
	}
	ports := config.Global.GetIntSlice("sniffer.sip_ports")
	if len(ports) == 0 {
		ports = []int{5060}
	}
	return &SIPSniffer{
		iface:   iface,
		ports:   ports,
		stopped: make(chan struct{}),
	}
}

// Start opens the packet source and begins the capture loop.
// This blocks until Stop() is called.
func (s *SIPSniffer) Start() error {
	log.Printf("[SIP_SNIFFER] Opening interface %s for SIP capture", s.iface)

	// Build BPF filter: "udp and (port 5060 or port 5080 ...)"
	filter := s.buildBPF()

	// Create platform-abstracted packet source
	source, err := newPacketSource(s.iface, filter, 65535)
	if err != nil {
		return fmt.Errorf("failed to open packet source on %s: %w", s.iface, err)
	}
	s.source = source

	log.Printf("[SIP_SNIFFER] Capture started on %s, ports %v", s.iface, s.ports)

	packets := s.source.Packets()

	for {
		select {
		case <-s.stopped:
			log.Println("[SIP_SNIFFER] Capture loop stopped")
			return nil
		case pkt, ok := <-packets:
			if !ok {
				log.Println("[SIP_SNIFFER] Packet source closed")
				return nil
			}
			s.processPacket(pkt)
		}
	}
}

// Stop signals the capture loop to exit and closes the packet source.
func (s *SIPSniffer) Stop() {
	select {
	case <-s.stopped:
		return // Already stopped
	default:
		close(s.stopped)
	}
	if s.source != nil {
		s.source.Close()
	}
	log.Println("[SIP_SNIFFER] Stopped")
}

// processPacket extracts IP/port/payload from a captured packet
// and feeds it into the shared HandleSIPPayload pipeline.
func (s *SIPSniffer) processPacket(pkt gopacket.Packet) {
	// Extract network layer (IPv4 or IPv6)
	var srcIP, dstIP string
	if ipv4 := pkt.Layer(layers.LayerTypeIPv4); ipv4 != nil {
		ip := ipv4.(*layers.IPv4)
		srcIP = ip.SrcIP.String()
		dstIP = ip.DstIP.String()
	} else if ipv6 := pkt.Layer(layers.LayerTypeIPv6); ipv6 != nil {
		ip := ipv6.(*layers.IPv6)
		srcIP = ip.SrcIP.String()
		dstIP = ip.DstIP.String()
	} else {
		return // Not an IP packet
	}

	// Extract transport layer (UDP)
	udpLayer := pkt.Layer(layers.LayerTypeUDP)
	if udpLayer == nil {
		return
	}
	udp := udpLayer.(*layers.UDP)
	srcPort := uint16(udp.SrcPort)
	dstPort := uint16(udp.DstPort)

	// Extract SIP payload
	payload := udp.Payload
	if len(payload) == 0 {
		return
	}

	// Quick sanity check: SIP messages start with SIP/ (response) or
	// method name (INVITE, REGISTER, BYE, ACK, CANCEL, OPTIONS, etc.)
	if !looksLikeSIP(payload) {
		return
	}

	// Determine timestamp — prefer pcap metadata, fallback to now
	ts := timeutil.Now()
	if meta := pkt.Metadata(); meta != nil && !meta.Timestamp.IsZero() {
		ts = meta.Timestamp
	}

	// Build a synthetic HEPPacket for the shared pipeline
	hepPkt := &hep.HEPPacket{
		ProtocolType:  hep.PROTO_SIP,
		SrcIP:         srcIP,
		DstIP:         dstIP,
		SrcPort:       srcPort,
		DstPort:       dstPort,
		TimestampSec:  uint32(ts.Unix()),
		TimestampUSec: uint32(ts.Nanosecond() / 1000),
		Payload:       payload,
	}

	// Feed into the shared SIP processing pipeline (same as HEP mode)
	hep.HandleSIPPayload(hepPkt)
}

// looksLikeSIP performs a fast heuristic check on UDP payload.
func looksLikeSIP(data []byte) bool {
	if len(data) < 4 {
		return false
	}
	// SIP response: "SIP/"
	if data[0] == 'S' && data[1] == 'I' && data[2] == 'P' && data[3] == '/' {
		return true
	}
	// SIP request: starts with method name followed by space
	// Common methods: INVITE, ACK, BYE, CANCEL, REGISTER, OPTIONS, INFO, UPDATE, REFER, SUBSCRIBE, NOTIFY, PUBLISH, MESSAGE, PRACK
	firstLine := data
	if idx := indexOf(data, '\n'); idx > 0 {
		firstLine = data[:idx]
	}
	return containsByte(firstLine, ' ') && (len(firstLine) > 10)
}

// buildBPF constructs a BPF filter string for the configured SIP ports.
func (s *SIPSniffer) buildBPF() string {
	parts := make([]string, 0, len(s.ports))
	for _, port := range s.ports {
		parts = append(parts, fmt.Sprintf("port %d", port))
	}
	return "udp and (" + strings.Join(parts, " or ") + ")"
}

// indexOf returns the first index of byte b in data, or -1.
func indexOf(data []byte, b byte) int {
	for i, c := range data {
		if c == b {
			return i
		}
	}
	return -1
}

// containsByte checks if data contains byte b.
func containsByte(data []byte, b byte) bool {
	for _, c := range data {
		if c == b {
			return true
		}
	}
	return false
}

// ResolveInterface tries to find a good default network interface
// if none is configured. Returns "eth0" as fallback.
func ResolveInterface() string {
	iface := config.Global.GetString("sniffer.interface")
	if iface != "" {
		return iface
	}

	// Try to find a non-loopback interface with a valid IP
	interfaces, err := net.Interfaces()
	if err != nil {
		return "eth0"
	}
	for _, i := range interfaces {
		if i.Flags&net.FlagLoopback != 0 || i.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := i.Addrs()
		if err != nil || len(addrs) == 0 {
			continue
		}
		log.Printf("[SIP_SNIFFER] Auto-detected interface: %s", i.Name)
		return i.Name
	}
	return "eth0"
}
