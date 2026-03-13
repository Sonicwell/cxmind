package sniffer

import (
	"net"
	"testing"

	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
)

// mockPacket implements gopacket.Packet for testing without fully relying on decoding
type mockPacket struct {
	networkLayer   gopacket.NetworkLayer
	transportLayer gopacket.TransportLayer
	payload        []byte
	metadata       *gopacket.PacketMetadata
}

func (m *mockPacket) String() string           { return "" }
func (m *mockPacket) Dump() string             { return "" }
func (m *mockPacket) Layers() []gopacket.Layer { return nil }
func (m *mockPacket) Layer(t gopacket.LayerType) gopacket.Layer {
	if t == layers.LayerTypeIPv4 {
		if _, ok := m.networkLayer.(*layers.IPv4); ok {
			return m.networkLayer
		}
		return nil
	}
	if t == layers.LayerTypeIPv6 {
		if _, ok := m.networkLayer.(*layers.IPv6); ok {
			return m.networkLayer
		}
		return nil
	}
	if t == layers.LayerTypeUDP {
		return m.transportLayer
	}
	return nil
}
func (m *mockPacket) LayerClass(c gopacket.LayerClass) gopacket.Layer { return nil }
func (m *mockPacket) LinkLayer() gopacket.LinkLayer                   { return nil }
func (m *mockPacket) NetworkLayer() gopacket.NetworkLayer             { return m.networkLayer }
func (m *mockPacket) TransportLayer() gopacket.TransportLayer         { return m.transportLayer }
func (m *mockPacket) ApplicationLayer() gopacket.ApplicationLayer     { return nil }
func (m *mockPacket) ErrorLayer() gopacket.ErrorLayer                 { return nil }
func (m *mockPacket) Data() []byte                                    { return m.payload }
func (m *mockPacket) Metadata() *gopacket.PacketMetadata              { return m.metadata }

func TestSIPSniffer_NewAndBPF(t *testing.T) {
	// Let NewSIPSniffer execute with defaults since we can't mock config simply
	s := NewSIPSniffer()

	// Override defaults explicitly in the sniffer object just for testing BPF
	s.iface = "eth_test"
	s.ports = []int{5060, 5061}

	if s.iface != "eth_test" {
		t.Errorf("expected iface eth_test, got %s", s.iface)
	}

	bpf := s.buildBPF()
	expected := "udp and (port 5060 or port 5061)"
	if bpf != expected {
		t.Errorf("expected BPF %q, got %q", expected, bpf)
	}
}

func TestSIPSniffer_ProcessPacketEdgeCases(t *testing.T) {
	s := NewSIPSniffer()

	t.Run("Not IP packet", func(t *testing.T) {
		// Just shouldn't panic
		pkt := &mockPacket{}
		s.processPacket(pkt)
	})

	t.Run("IPv4 without UDP", func(t *testing.T) {
		pkt := &mockPacket{
			networkLayer: &layers.IPv4{
				SrcIP: net.ParseIP("10.0.0.1"),
				DstIP: net.ParseIP("10.0.0.2"),
			},
		}
		s.processPacket(pkt)
	})

	t.Run("IPv6 with empty payload", func(t *testing.T) {
		pkt := &mockPacket{
			networkLayer: &layers.IPv6{
				SrcIP: net.ParseIP("::1"),
				DstIP: net.ParseIP("::2"),
			},
			transportLayer: &layers.UDP{
				SrcPort: layers.UDPPort(5060),
				DstPort: layers.UDPPort(5060),
				BaseLayer: layers.BaseLayer{
					Payload: []byte{}, // Empty payload
				},
			},
		}
		s.processPacket(pkt)
	})

	t.Run("IPv4 with non-SIP payload", func(t *testing.T) {
		pkt := &mockPacket{
			networkLayer: &layers.IPv4{
				SrcIP: net.ParseIP("10.0.0.1"),
				DstIP: net.ParseIP("10.0.0.2"),
			},
			transportLayer: &layers.UDP{
				SrcPort: layers.UDPPort(5060),
				DstPort: layers.UDPPort(5060),
				BaseLayer: layers.BaseLayer{
					Payload: []byte("JUST SOME RANDOM NOISE WHICH IS LONG ENOUGH"),
				},
			},
		}
		s.processPacket(pkt)
	})

	t.Run("IPv4 with valid SIP payload string", func(t *testing.T) {
		ci := gopacket.CaptureInfo{Timestamp: timeutil.Now()}
		pkt := &mockPacket{
			networkLayer: &layers.IPv4{
				SrcIP: net.ParseIP("10.0.0.1"),
				DstIP: net.ParseIP("10.0.0.2"),
			},
			transportLayer: &layers.UDP{
				SrcPort: layers.UDPPort(5060),
				DstPort: layers.UDPPort(5060),
				BaseLayer: layers.BaseLayer{
					Payload: []byte("INVITE sip:bob@biloxi.com SIP/2.0\r\nVia: SIP/2.0/UDP pc33.atlanta.com;branch=z9hG4bK776asdhds\r\n\r\n"),
				},
			},
			metadata: &gopacket.PacketMetadata{
				CaptureInfo: ci,
			},
		}
		// Should not panic or drop
		s.processPacket(pkt)
	})
}
