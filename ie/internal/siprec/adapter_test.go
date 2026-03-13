package siprec

import (
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/hep"
)

// ========================================================================
// Phase 5 TDD Tests — SIPREC → HEP Pipeline Adapter
// ========================================================================

func TestToHEPPacket_InviteConversion(t *testing.T) {
	sipPayload := []byte("INVITE sip:1001@10.0.0.2 SIP/2.0\r\n" +
		"Call-ID: test-siprec-call\r\n" +
		"Content-Length: 0\r\n" +
		"\r\n")

	ts := time.Date(2026, 2, 23, 12, 0, 0, 0, time.UTC)

	packet := ToHEPPacket(sipPayload, "10.0.0.1", "10.0.0.2", 5080, 5060, ts)

	if packet == nil {
		t.Fatal("ToHEPPacket returned nil")
	}

	if packet.ProtocolType != hep.PROTO_SIP {
		t.Errorf("ProtocolType = %d, want %d (SIP)", packet.ProtocolType, hep.PROTO_SIP)
	}
	if packet.SrcIP != "10.0.0.1" {
		t.Errorf("SrcIP = %q, want %q", packet.SrcIP, "10.0.0.1")
	}
	if packet.DstIP != "10.0.0.2" {
		t.Errorf("DstIP = %q, want %q", packet.DstIP, "10.0.0.2")
	}
	if packet.SrcPort != 5080 {
		t.Errorf("SrcPort = %d, want 5080", packet.SrcPort)
	}
	if packet.DstPort != 5060 {
		t.Errorf("DstPort = %d, want 5060", packet.DstPort)
	}
	if packet.TimestampSec != uint32(ts.Unix()) {
		t.Errorf("TimestampSec = %d, want %d", packet.TimestampSec, ts.Unix())
	}
}

func TestToHEPPacket_FieldMapping(t *testing.T) {
	payload := []byte("SIP/2.0 200 OK\r\nContent-Length: 0\r\n\r\n")
	ts := time.Now()

	packet := ToHEPPacket(payload, "192.168.1.1", "192.168.1.2", 5080, 5060, ts)

	// Payload should be a copy
	if &payload[0] == &packet.Payload[0] {
		t.Error("Payload should be copied, not referenced")
	}

	// Verify payload content matches
	if string(packet.Payload) != string(payload) {
		t.Error("Payload content mismatch")
	}
}
