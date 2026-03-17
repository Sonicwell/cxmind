package rtp

import (
	"sync"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/audio"
	"github.com/spf13/viper"
)

// MockStreamingASRProvider for integration test
type MockStreamingASRProvider struct {
	mu      sync.Mutex
	streams []*MockASRStream
}

func (m *MockStreamingASRProvider) Transcribe(audio []byte, sampleRate int, language string) (*audio.TranscriptionResult, error) {
	return nil, nil
}

func (m *MockStreamingASRProvider) NewStream(sampleRate int, language string) (audio.ASRStream, error) {
	s := &MockASRStream{
		receivedPackets: make([][]byte, 0),
		results:         make(chan audio.TranscriptionResult, 10),
		errors:          make(chan error, 1),
	}
	m.mu.Lock()
	m.streams = append(m.streams, s)
	m.mu.Unlock()
	return s, nil
}

type MockASRStream struct {
	mu              sync.Mutex
	receivedPackets [][]byte
	results         chan audio.TranscriptionResult
	errors          chan error
	closed          bool
}

func (s *MockASRStream) SendAudio(data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	// Copy data to avoid race conditions if buffer is reused
	cp := make([]byte, len(data))
	copy(cp, data)
	s.receivedPackets = append(s.receivedPackets, cp)
	return nil
}

func (s *MockASRStream) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = true
	close(s.results)
	close(s.errors)
	return nil
}

func (s *MockASRStream) Results() <-chan audio.TranscriptionResult {
	return s.results
}

func (s *MockASRStream) Errors() <-chan error {
	return s.errors
}

// TestPhysicalRTP_JitterBuffer_Integration verifies that physical RTP packets
// flow through the JitterBuffer when enabled.
func TestPhysicalRTP_JitterBuffer_Integration(t *testing.T) {
	// Setup Mock ASR Provider
	mockProvider := &MockStreamingASRProvider{}
	audio.SetASRProviderForTesting(mockProvider)

	// Config: Enable 60ms Jitter Buffer
	viper.Set("sniffer.jitter_buffer_ms", 60)
	viper.Set("asr.provider", "mock") // StartListener calls GetASRProvider which uses viper

	t.Cleanup(func() {
		viper.Set("sniffer.jitter_buffer_ms", 0)
		viper.Set("asr.provider", "")
		viper.Set("vad.enabled", true)
	})

	s := NewSniffer()
	defer s.Stop()

	callID := "test-call-jb"
	port := 12344

	// Create stream with JitterBuffer
	stream := &RTPStream{
		callID:       callID,
		asrEnabled:   true,
		lastActivity: time.Now().UnixNano(),
		packetStats:  PacketStats{SeqInitialized: true},
		jitterBuf:    NewJitterBuffer(3), // 3 packets = 60ms
	}

	// Initialize Mock ASR Stream
	asrStream, _ := mockProvider.NewStream(8000, "en")
	stream.stream = asrStream
	stream.vad = NewVAD()

	s.listeners.Store(port, stream)

	// Start drain loop
	go func() {
		for pkt := range stream.jitterBuf.Output() {
			if len(pkt.Data) <= 12 {
				continue
			}
			rtpBody := pkt.Data[12:]
			s.ingestRTP_Drain(stream, rtpBody, pkt.PayloadType)
		}
	}()

	viper.Set("vad.enabled", false) // Disable VAD to ensure packets pass through

	// Generate 3 packets: 1, 3, 2
	noise := make([]byte, 160)
	for i := range noise {
		noise[i] = 0x00 // Max volume, though VAD is disabled now
	}

	// Ingest out of order: 1, 3, 2
	// We call the method implemented in server.go
	// Signature: ingestRTP(stream *RTPStream, payload []byte, srcIP, dstIP string, srcPort, dstPort int, timestamp time.Time)
	now := time.Now()
	ip := "127.0.0.1"

	p1 := makeRTPPacket(1, noise)
	p2 := makeRTPPacket(2, noise)
	p3 := makeRTPPacket(3, noise)

	s.ingestRTP(stream, p1, p1, ip, ip, 10000, port, now)
	s.ingestRTP(stream, p3, p3, ip, ip, 10000, port, now.Add(20*time.Millisecond))
	s.ingestRTP(stream, p2, p2, ip, ip, 10000, port, now.Add(40*time.Millisecond))

	// Stop JitterBuffer to flush remaining packets (otherwise they wait for depth)
	stream.jitterBuf.Stop()

	// Wait for processing
	time.Sleep(200 * time.Millisecond)

	// Check Mock ASR Stream
	mockStream := asrStream.(*MockASRStream)
	mockStream.mu.Lock()
	defer mockStream.mu.Unlock()

	if len(mockStream.receivedPackets) != 3 {
		t.Errorf("Expected 3 packets, got %d", len(mockStream.receivedPackets))
	}
	// Check sequencing logic (indirectly verified by count == 3 if JB works,
	// because out-of-order playout order matters for ASR quality but 依赖缓冲逻辑模拟出队 (Simulate buffering queue)
	// which simply pushes to JB. The JB Drain loop (started above in this test) actually does the reordering.
	// Oh wait, in server.go, StartListener starts the drain loop.
	// In this test, we MANUALLY started a drain loop:
	// go func() { for pkt := range stream.jitterBuf.Output() ... s.ingestRTP_Drain(...) }
	// So we are relying on jitterBuf implementation (verified by unit test) + server.go ingestRTP routing to it.
}

// Helper to make full RTP packet
func makeRTPPacket(seq uint16, payload []byte) []byte {
	pkt := make([]byte, 12+len(payload))
	pkt[0] = 0x80 // Version 2
	pkt[1] = 0x00 // Payload Type 0 (PCMU)
	pkt[2] = byte(seq >> 8)
	pkt[3] = byte(seq)
	copy(pkt[12:], payload)
	return pkt
}

// ingestRTP_Drain stub for test-specific drain logic
func (s *Sniffer) ingestRTP_Drain(stream *RTPStream, body []byte, payloadType uint8) {
	processAudioPayload(stream, stream.callID, "127.0.0.1", "agent", stream.vad, stream.stream, nil, body, payloadType)
}
