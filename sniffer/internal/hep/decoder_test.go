package hep

import (
	"encoding/binary"
	"net"
	"testing"
)

// buildHEP3 constructs a valid HEP3 binary packet from chunks for testing.
func buildHEP3(chunks ...[]byte) []byte {
	buf := []byte("HEP3")
	buf = append(buf, 0, 0) // length placeholder
	for _, c := range chunks {
		buf = append(buf, c...)
	}
	binary.BigEndian.PutUint16(buf[4:6], uint16(len(buf)))
	return buf
}

func chunkUint8(chunkType uint16, val uint8) []byte {
	b := make([]byte, 7) // vendor(2) + type(2) + length(2) + value(1)
	binary.BigEndian.PutUint16(b[0:2], 0)
	binary.BigEndian.PutUint16(b[2:4], chunkType)
	binary.BigEndian.PutUint16(b[4:6], 7)
	b[6] = val
	return b
}

func chunkUint16(chunkType uint16, val uint16) []byte {
	b := make([]byte, 8)
	binary.BigEndian.PutUint16(b[0:2], 0)
	binary.BigEndian.PutUint16(b[2:4], chunkType)
	binary.BigEndian.PutUint16(b[4:6], 8)
	binary.BigEndian.PutUint16(b[6:8], val)
	return b
}

func chunkUint32(chunkType uint16, val uint32) []byte {
	b := make([]byte, 10)
	binary.BigEndian.PutUint16(b[0:2], 0)
	binary.BigEndian.PutUint16(b[2:4], chunkType)
	binary.BigEndian.PutUint16(b[4:6], 10)
	binary.BigEndian.PutUint32(b[6:10], val)
	return b
}

func chunkBytes(chunkType uint16, val []byte) []byte {
	length := 6 + len(val)
	b := make([]byte, 6, length)
	binary.BigEndian.PutUint16(b[0:2], 0)
	binary.BigEndian.PutUint16(b[2:4], chunkType)
	binary.BigEndian.PutUint16(b[4:6], uint16(length))
	b = append(b, val...)
	return b
}

func TestDecodeHEP3_ValidSIP(t *testing.T) {
	sipPayload := []byte("INVITE sip:bob@example.com SIP/2.0\r\nCall-ID: abc123\r\n")
	srcIP := net.IPv4(10, 0, 0, 1).To4()
	dstIP := net.IPv4(10, 0, 0, 2).To4()

	raw := buildHEP3(
		chunkUint8(0x01, 2),           // IP Family: IPv4
		chunkUint8(0x02, 17),          // IP Proto: UDP
		chunkBytes(0x03, srcIP),       // Src IP
		chunkBytes(0x04, dstIP),       // Dst IP
		chunkUint16(0x07, 5060),       // Src Port
		chunkUint16(0x08, 5061),       // Dst Port
		chunkUint32(0x09, 1700000000), // Timestamp sec
		chunkUint32(0x0a, 500000),     // Timestamp usec
		chunkUint8(0x0b, 1),           // Proto Type: SIP
		chunkUint32(0x0c, 2001),       // Capture ID
		chunkBytes(0x0f, sipPayload),  // Payload
	)

	pkt, err := DecodeHEP3(raw)
	if err != nil {
		t.Fatalf("DecodeHEP3 returned error: %v", err)
	}

	if !pkt.SrcIP.Equal(srcIP) {
		t.Errorf("SrcIP = %v, want %v", pkt.SrcIP, srcIP)
	}
	if !pkt.DstIP.Equal(dstIP) {
		t.Errorf("DstIP = %v, want %v", pkt.DstIP, dstIP)
	}
	if pkt.SrcPort != 5060 {
		t.Errorf("SrcPort = %d, want 5060", pkt.SrcPort)
	}
	if pkt.DstPort != 5061 {
		t.Errorf("DstPort = %d, want 5061", pkt.DstPort)
	}
	if pkt.TimestampSec != 1700000000 {
		t.Errorf("TimestampSec = %d, want 1700000000", pkt.TimestampSec)
	}
	if pkt.TimestampUSec != 500000 {
		t.Errorf("TimestampUSec = %d, want 500000", pkt.TimestampUSec)
	}
	if pkt.ProtocolType != 1 {
		t.Errorf("ProtocolType = %d, want 1", pkt.ProtocolType)
	}
	if pkt.CaptureID != 2001 {
		t.Errorf("CaptureID = %d, want 2001", pkt.CaptureID)
	}
	if string(pkt.Payload) != string(sipPayload) {
		t.Errorf("Payload mismatch")
	}
}

func TestDecodeHEP3_WithCorrelationID(t *testing.T) {
	callID := "call-12345@example.com"
	raw := buildHEP3(
		chunkUint8(0x0b, 34),                 // Proto Type: RTP
		chunkBytes(0x11, []byte(callID)),     // Correlation ID
		chunkBytes(0x0f, []byte{0x80, 0x00}), // minimal RTP payload
	)

	pkt, err := DecodeHEP3(raw)
	if err != nil {
		t.Fatalf("DecodeHEP3 error: %v", err)
	}
	if pkt.CorrelationID != callID {
		t.Errorf("CorrelationID = %q, want %q", pkt.CorrelationID, callID)
	}
	if pkt.ProtocolType != 34 {
		t.Errorf("ProtocolType = %d, want 34 (RTP)", pkt.ProtocolType)
	}
}

func TestDecodeHEP3_InvalidMagic(t *testing.T) {
	data := []byte("NOPE" + "\x00\x0a")
	_, err := DecodeHEP3(data)
	if err == nil {
		t.Fatal("expected error for invalid magic, got nil")
	}
}

func TestDecodeHEP3_TooShort(t *testing.T) {
	_, err := DecodeHEP3([]byte("HEP"))
	if err == nil {
		t.Fatal("expected error for too-short packet, got nil")
	}
}

func TestDecodeHEP3_TruncatedChunk(t *testing.T) {
	// HEP3 header + a chunk header claiming 100 bytes but only 2 bytes of body
	raw := buildHEP3(
		chunkUint8(0x0b, 1), // valid chunk
	)
	// chop off last 3 bytes to simulate truncation
	truncated := raw[:len(raw)-3]
	// Should not panic, may return partial or error — just no crash
	pkt, _ := DecodeHEP3(truncated)
	if pkt == nil {
		// Even partial decode should return a non-nil packet struct
		t.Error("expected non-nil packet for truncated input")
	}
}

func TestDecodeHEP3_EmptyPayload(t *testing.T) {
	// No payload chunk at all
	raw := buildHEP3(
		chunkUint8(0x0b, 1),     // Proto Type: SIP
		chunkUint32(0x0c, 3001), // Capture ID
	)
	pkt, err := DecodeHEP3(raw)
	if err != nil {
		t.Fatalf("DecodeHEP3 error: %v", err)
	}
	if len(pkt.Payload) != 0 {
		t.Errorf("expected empty payload, got %d bytes", len(pkt.Payload))
	}
	if pkt.CaptureID != 3001 {
		t.Errorf("CaptureID = %d, want 3001", pkt.CaptureID)
	}
}
