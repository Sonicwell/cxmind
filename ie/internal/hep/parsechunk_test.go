package hep

import (
	"testing"
)

// TDD Test for RA-6: parseChunk must not panic on empty or short body slices.
// Previously, accessing body[0] for CHUNK_PROTO_TYPE with an empty body would panic.

func TestParseChunk_EmptyBody_ProtoType(t *testing.T) {
	p := &HEPPacket{}
	// CHUNK_PROTO_TYPE with empty body — should not panic
	parseChunk(p, CHUNK_PROTO_TYPE, []byte{})
	// ProtocolType should remain zero (default)
	if p.ProtocolType != 0 {
		t.Errorf("expected ProtocolType=0 for empty body, got %d", p.ProtocolType)
	}
}

func TestParseChunk_EmptyBody_SrcPort(t *testing.T) {
	p := &HEPPacket{}
	// CHUNK_SRC_PORT with empty body — should not panic
	parseChunk(p, CHUNK_SRC_PORT, []byte{})
	if p.SrcPort != 0 {
		t.Errorf("expected SrcPort=0 for empty body, got %d", p.SrcPort)
	}
}

func TestParseChunk_ShortBody_SrcPort(t *testing.T) {
	p := &HEPPacket{}
	// CHUNK_SRC_PORT with 1 byte — needs 2, should not panic
	parseChunk(p, CHUNK_SRC_PORT, []byte{0x13})
	if p.SrcPort != 0 {
		t.Errorf("expected SrcPort=0 for short body, got %d", p.SrcPort)
	}
}

func TestParseChunk_EmptyBody_DstPort(t *testing.T) {
	p := &HEPPacket{}
	parseChunk(p, CHUNK_DST_PORT, []byte{})
	if p.DstPort != 0 {
		t.Errorf("expected DstPort=0 for empty body, got %d", p.DstPort)
	}
}

func TestParseChunk_EmptyBody_TimestampSec(t *testing.T) {
	p := &HEPPacket{}
	// CHUNK_TIMESTAMP_SEC needs 4 bytes — empty should not panic
	parseChunk(p, CHUNK_TIMESTAMP_SEC, []byte{})
	if p.TimestampSec != 0 {
		t.Errorf("expected TimestampSec=0, got %d", p.TimestampSec)
	}
}

func TestParseChunk_ShortBody_TimestampSec(t *testing.T) {
	p := &HEPPacket{}
	// 2 bytes, needs 4
	parseChunk(p, CHUNK_TIMESTAMP_SEC, []byte{0x01, 0x02})
	if p.TimestampSec != 0 {
		t.Errorf("expected TimestampSec=0, got %d", p.TimestampSec)
	}
}

func TestParseChunk_EmptyBody_CaptureID(t *testing.T) {
	p := &HEPPacket{}
	parseChunk(p, CHUNK_CAPTURE_ID, []byte{})
	if p.CaptureID != 0 {
		t.Errorf("expected CaptureID=0, got %d", p.CaptureID)
	}
}

func TestParseChunk_ValidBody_ProtoType(t *testing.T) {
	p := &HEPPacket{}
	parseChunk(p, CHUNK_PROTO_TYPE, []byte{0x01})
	if p.ProtocolType != 1 {
		t.Errorf("expected ProtocolType=1, got %d", p.ProtocolType)
	}
}

func TestParseChunk_ValidBody_SrcPort(t *testing.T) {
	p := &HEPPacket{}
	parseChunk(p, CHUNK_SRC_PORT, []byte{0x13, 0xC4}) // 5060
	if p.SrcPort != 5060 {
		t.Errorf("expected SrcPort=5060, got %d", p.SrcPort)
	}
}

func TestParseChunk_EmptyBody_SrcIP(t *testing.T) {
	p := &HEPPacket{}
	// Body with 0 bytes — not 4 or 16, should not set SrcIP
	parseChunk(p, CHUNK_SRC_IP, []byte{})
	if p.SrcIP != "" {
		t.Errorf("expected empty SrcIP, got '%s'", p.SrcIP)
	}
}

func TestParseChunk_EmptyBody_TimestampUSec(t *testing.T) {
	p := &HEPPacket{}
	parseChunk(p, CHUNK_TIMESTAMP_USEC, []byte{})
	if p.TimestampUSec != 0 {
		t.Errorf("expected TimestampUSec=0, got %d", p.TimestampUSec)
	}
}
