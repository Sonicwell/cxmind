package hep

import (
	"bytes"
	"net"
	"testing"
	"time"
)

// mockConn captures written data instead of sending over network
type mockConn struct {
	written [][]byte
}

func (m *mockConn) Read(b []byte) (n int, err error) { return 0, nil }
func (m *mockConn) Write(b []byte) (n int, err error) {
	clone := make([]byte, len(b))
	copy(clone, b)
	m.written = append(m.written, clone)
	return len(b), nil
}
func (m *mockConn) Close() error                       { return nil }
func (m *mockConn) LocalAddr() net.Addr                { return nil }
func (m *mockConn) RemoteAddr() net.Addr               { return nil }
func (m *mockConn) SetDeadline(t time.Time) error      { return nil }
func (m *mockConn) SetReadDeadline(t time.Time) error  { return nil }
func (m *mockConn) SetWriteDeadline(t time.Time) error { return nil }

func TestSendRaw_ForwardsExactBytes(t *testing.T) {
	mc := &mockConn{}
	client := &Client{conn: mc, remoteAddr: "127.0.0.1:9060", captureID: 2001}

	rawPkt := []byte("HEP3\x00\x0a\x00\x00\x00\x0b\x00\x07\x01") // Mock minimal packet
	err := client.SendRaw(rawPkt)
	if err != nil {
		t.Fatalf("SendRaw error: %v", err)
	}

	if len(mc.written) != 1 {
		t.Fatalf("expected 1 packet written, got %d", len(mc.written))
	}

	if !bytes.Equal(mc.written[0], rawPkt) {
		t.Errorf("written data mismatch.\nGot: %x\nWant: %x", mc.written[0], rawPkt)
	}
}

func TestEncodeWithCorrelation_HasChunk0x11(t *testing.T) {
	client := &Client{captureID: 2001}

	payload := []byte("test-payload")
	srcIP := net.IPv4(1, 2, 3, 4)
	dstIP := net.IPv4(5, 6, 7, 8)
	ts := time.Unix(1600000000, 0)
	correlationID := "call-xyz"

	data, err := client.encodeHEP3WithCorrelation(payload, srcIP, dstIP, 1000, 2000, ts, 34, correlationID)
	if err != nil {
		t.Fatalf("encode err: %v", err)
	}

	// Verify using the Phase 1 decoder
	decoded, err := DecodeHEP3(data)
	if err != nil {
		t.Fatalf("decode err: %v", err)
	}

	if decoded.CorrelationID != correlationID {
		t.Errorf("CorrelationID = %q, want %q", decoded.CorrelationID, correlationID)
	}
	if decoded.ProtocolType != 34 {
		t.Errorf("ProtocolType = %d, want 34", decoded.ProtocolType)
	}
	if string(decoded.Payload) != string(payload) {
		t.Errorf("Payload mismatch")
	}
}

func TestSendWithCorrelation_CallsWrite(t *testing.T) {
	mc := &mockConn{}
	client := &Client{conn: mc, remoteAddr: "127.0.0.1:9060", captureID: 2001}

	err := client.SendWithCorrelation(
		[]byte("payload"), net.IPv4(1, 1, 1, 1), net.IPv4(2, 2, 2, 2),
		1234, 5678, time.Now(), 34, "my-call",
	)
	if err != nil {
		t.Fatalf("SendWithCorrelation failed: %v", err)
	}

	if len(mc.written) != 1 {
		t.Fatalf("expected 1 write, got %d", len(mc.written))
	}
}
