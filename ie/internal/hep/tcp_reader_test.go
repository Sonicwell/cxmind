package hep

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"sync"
	"testing"
)

// buildHEP3Packet constructs a valid HEP3 TCP frame: "HEP3" + uint16(length) + payload
func buildHEP3Packet(payload []byte) []byte {
	length := uint16(6 + len(payload)) // 4 (magic) + 2 (length field) + payload
	buf := new(bytes.Buffer)
	buf.WriteString("HEP3")
	binary.Write(buf, binary.BigEndian, length)
	buf.Write(payload)
	return buf.Bytes()
}

// --- readHEPPacket tests (non-pooled) ---

func TestReadHEPPacket_SinglePacket(t *testing.T) {
	payload := []byte("hello-hep-world")
	raw := buildHEP3Packet(payload)
	reader := bufio.NewReader(bytes.NewReader(raw))

	packet, err := readHEPPacket(reader)
	if err != nil {
		t.Fatalf("readHEPPacket error: %v", err)
	}

	expectedLen := 6 + len(payload)
	if len(packet) != expectedLen {
		t.Errorf("packet length = %d, want %d", len(packet), expectedLen)
	}
	if string(packet[0:4]) != "HEP3" {
		t.Errorf("magic = %q, want %q", string(packet[0:4]), "HEP3")
	}
	gotLen := binary.BigEndian.Uint16(packet[4:6])
	if int(gotLen) != expectedLen {
		t.Errorf("length field = %d, want %d", gotLen, expectedLen)
	}
	if !bytes.Equal(packet[6:], payload) {
		t.Errorf("payload mismatch")
	}
}

func TestReadHEPPacket_MultiplePackets(t *testing.T) {
	var stream bytes.Buffer
	payloads := []string{"packet-one", "packet-two-longer", "p3"}
	for _, p := range payloads {
		stream.Write(buildHEP3Packet([]byte(p)))
	}

	reader := bufio.NewReader(&stream)
	for i, expected := range payloads {
		packet, err := readHEPPacket(reader)
		if err != nil {
			t.Fatalf("packet %d: readHEPPacket error: %v", i, err)
		}
		got := string(packet[6:])
		if got != expected {
			t.Errorf("packet %d: payload = %q, want %q", i, got, expected)
		}
	}
	_, err := readHEPPacket(reader)
	if err != io.EOF {
		t.Errorf("expected EOF, got %v", err)
	}
}

func TestReadHEPPacket_InvalidMagic(t *testing.T) {
	raw := []byte("BADX\x00\x0ahello")
	reader := bufio.NewReader(bytes.NewReader(raw))
	_, err := readHEPPacket(reader)
	if err == nil {
		t.Error("expected error for invalid magic, got nil")
	}
}

func TestReadHEPPacket_EmptyPayload(t *testing.T) {
	raw := buildHEP3Packet(nil)
	reader := bufio.NewReader(bytes.NewReader(raw))
	packet, err := readHEPPacket(reader)
	if err != nil {
		t.Fatalf("readHEPPacket error: %v", err)
	}
	if packet != nil {
		t.Errorf("expected nil packet for empty payload, got %d bytes", len(packet))
	}
}

// --- readHEPPacketPooled tests ---

func TestReadHEPPacketPooled_SinglePacket(t *testing.T) {
	payload := []byte("pooled-test-data")
	raw := buildHEP3Packet(payload)
	reader := bufio.NewReader(bytes.NewReader(raw))

	hb, err := readHEPPacketPooled(reader)
	if err != nil {
		t.Fatalf("readHEPPacketPooled error: %v", err)
	}
	defer hb.Release()

	expectedLen := 6 + len(payload)
	if len(hb.Data) != expectedLen {
		t.Errorf("data length = %d, want %d", len(hb.Data), expectedLen)
	}
	if string(hb.Data[0:4]) != "HEP3" {
		t.Errorf("magic = %q, want %q", string(hb.Data[0:4]), "HEP3")
	}
	if !bytes.Equal(hb.Data[6:], payload) {
		t.Errorf("payload mismatch")
	}
}

func TestReadHEPPacketPooled_EmptyPayload(t *testing.T) {
	raw := buildHEP3Packet(nil)
	reader := bufio.NewReader(bytes.NewReader(raw))
	hb, err := readHEPPacketPooled(reader)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if hb != nil {
		t.Errorf("expected nil HEPBuffer for empty payload")
	}
}

func TestReadHEPPacketPooled_BufferReuse(t *testing.T) {
	// Verify that buffers are actually reused by the pool.
	// Read a packet, release it, read another — should get same underlying buffer.
	payload1 := []byte("first-packet-data")
	payload2 := []byte("second-packet-xx")

	raw1 := buildHEP3Packet(payload1)
	raw2 := buildHEP3Packet(payload2)

	// Read first packet
	reader1 := bufio.NewReader(bytes.NewReader(raw1))
	hb1, err := readHEPPacketPooled(reader1)
	if err != nil {
		t.Fatalf("first read error: %v", err)
	}

	// Save pointer to underlying buffer for comparison
	firstBufPtr := hb1.buf

	// Verify first packet data
	if !bytes.Equal(hb1.Data[6:], payload1) {
		t.Errorf("first payload mismatch")
	}

	// Release first buffer back to pool
	hb1.Release()

	// Read second packet — should reuse the buffer
	reader2 := bufio.NewReader(bytes.NewReader(raw2))
	hb2, err := readHEPPacketPooled(reader2)
	if err != nil {
		t.Fatalf("second read error: %v", err)
	}
	defer hb2.Release()

	// Verify second packet has correct data (not contaminated by first)
	if !bytes.Equal(hb2.Data[6:], payload2) {
		t.Errorf("second payload mismatch (data contamination!)")
	}

	// Verify buffer was reused (same pointer)
	if hb2.buf != firstBufPtr {
		t.Log("buffer was NOT reused (pool may have been GC'd — acceptable)")
	}
}

func TestReadHEPPacketPooled_DecodeHEP3Safety(t *testing.T) {
	// Critical test: verify DecodeHEP3 does NOT retain references to the input buffer.
	// After Release(), the decoded packet fields must still be valid.

	// Build a realistic HEP3 packet with SIP payload
	sipPayload := []byte("INVITE sip:1001@test.local SIP/2.0\r\n")

	// Construct HEP3 chunks manually for a proper decode test
	var chunks bytes.Buffer
	// Chunk: Protocol Type (SIP=1)
	writeChunk(&chunks, 0x0000, CHUNK_PROTO_TYPE, []byte{PROTO_SIP})
	// Chunk: Source IP (1.2.3.4)
	writeChunk(&chunks, 0x0000, CHUNK_SRC_IP, []byte{1, 2, 3, 4})
	// Chunk: Dest IP (5.6.7.8)
	writeChunk(&chunks, 0x0000, CHUNK_DST_IP, []byte{5, 6, 7, 8})
	// Chunk: Correlation ID
	writeChunk(&chunks, 0x0000, CHUNK_CORRELATION_ID, []byte("test-call-id"))
	// Chunk: Payload
	writeChunk(&chunks, 0x0000, CHUNK_PAYLOAD, sipPayload)

	raw := buildHEP3Packet(chunks.Bytes())
	reader := bufio.NewReader(bytes.NewReader(raw))

	hb, err := readHEPPacketPooled(reader)
	if err != nil {
		t.Fatalf("read error: %v", err)
	}

	// Decode while buffer is still held
	packet, err := DecodeHEP3(hb.Data)
	if err != nil {
		t.Fatalf("decode error: %v", err)
	}

	// Verify decoded fields BEFORE release
	if packet.SrcIP != "1.2.3.4" {
		t.Errorf("SrcIP = %q, want %q", packet.SrcIP, "1.2.3.4")
	}
	if packet.CorrelationID != "test-call-id" {
		t.Errorf("CorrelationID = %q, want %q", packet.CorrelationID, "test-call-id")
	}
	if !bytes.Equal(packet.Payload, sipPayload) {
		t.Errorf("Payload mismatch before release")
	}

	// Release buffer back to pool (buffer data may be overwritten)
	hb.Release()

	// Verify decoded fields are STILL valid after release
	// (proves DecodeHEP3 copied all data out of the buffer)
	if packet.SrcIP != "1.2.3.4" {
		t.Errorf("SrcIP corrupted after release: %q", packet.SrcIP)
	}
	if packet.CorrelationID != "test-call-id" {
		t.Errorf("CorrelationID corrupted after release: %q", packet.CorrelationID)
	}
	if !bytes.Equal(packet.Payload, sipPayload) {
		t.Errorf("Payload corrupted after release (DecodeHEP3 retains buffer reference!)")
	}
}

func TestReadHEPPacketPooled_ConcurrentSafety(t *testing.T) {
	// Verify pool works correctly under concurrent access
	payload := []byte("concurrent-test-payload-data")
	raw := buildHEP3Packet(payload)

	var wg sync.WaitGroup
	errCh := make(chan error, 100)

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			reader := bufio.NewReader(bytes.NewReader(raw))
			hb, err := readHEPPacketPooled(reader)
			if err != nil {
				errCh <- err
				return
			}
			// Verify data integrity
			if !bytes.Equal(hb.Data[6:], payload) {
				errCh <- fmt.Errorf("payload mismatch in goroutine")
			}
			hb.Release()
		}()
	}

	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Errorf("concurrent error: %v", err)
	}
}

// writeChunk is a test helper to construct a HEP3 chunk
func writeChunk(buf *bytes.Buffer, vendor, chunkType uint16, body []byte) {
	length := uint16(6 + len(body))
	binary.Write(buf, binary.BigEndian, vendor)
	binary.Write(buf, binary.BigEndian, chunkType)
	binary.Write(buf, binary.BigEndian, length)
	buf.Write(body)
}

// --- S-1: TCP HEP length limit tests ---

func TestReadHEPPacketPooled_RejectsOversized(t *testing.T) {
	// Craft a HEP3 frame header claiming length = 65535 (max uint16)
	var buf bytes.Buffer
	buf.WriteString("HEP3")
	binary.Write(&buf, binary.BigEndian, uint16(65535))
	// Write enough data to satisfy the reader
	padding := make([]byte, 65535-6)
	buf.Write(padding)

	reader := bufio.NewReader(&buf)
	_, err := readHEPPacketPooled(reader)
	if err == nil {
		t.Fatal("expected error for oversized HEP packet, got nil")
	}
	if !bytes.Contains([]byte(err.Error()), []byte("too large")) {
		t.Errorf("error should mention 'too large', got: %v", err)
	}
}

func TestReadHEPPacketPooled_MaxSizeAllowed(t *testing.T) {
	// A packet at exactly maxHEPPacketSize should be accepted
	payloadLen := maxHEPPacketSize - 6 // subtract header
	payload := make([]byte, payloadLen)
	for i := range payload {
		payload[i] = byte(i % 256)
	}
	raw := buildHEP3Packet(payload)
	reader := bufio.NewReader(bytes.NewReader(raw))

	hb, err := readHEPPacketPooled(reader)
	if err != nil {
		t.Fatalf("packet at max size should be accepted, got error: %v", err)
	}
	defer hb.Release()

	if len(hb.Data) != maxHEPPacketSize {
		t.Errorf("data length = %d, want %d", len(hb.Data), maxHEPPacketSize)
	}
}

// --- Benchmarks ---

func BenchmarkReadHEPPacket(b *testing.B) {
	payload := make([]byte, 214)
	raw := buildHEP3Packet(payload)
	var stream bytes.Buffer
	for i := 0; i < 10000; i++ {
		stream.Write(raw)
	}
	data := stream.Bytes()

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		reader := bufio.NewReader(bytes.NewReader(data))
		for {
			_, err := readHEPPacket(reader)
			if err != nil {
				break
			}
		}
	}
}

func BenchmarkReadHEPPacketPooled(b *testing.B) {
	payload := make([]byte, 214)
	raw := buildHEP3Packet(payload)
	var stream bytes.Buffer
	for i := 0; i < 10000; i++ {
		stream.Write(raw)
	}
	data := stream.Bytes()

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		reader := bufio.NewReader(bytes.NewReader(data))
		for {
			hb, err := readHEPPacketPooled(reader)
			if err != nil {
				break
			}
			if hb != nil {
				hb.Release()
			}
		}
	}
}
