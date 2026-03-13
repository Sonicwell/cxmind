package rtp

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/audio"
)

// mockConcurrentASRStream simulates an ASR stream that detects concurrent SendAudio calls
type mockConcurrentASRStream struct {
	inFlight int32
	t        *testing.T
	mu       sync.Mutex
	errorSet bool
}

func (m *mockConcurrentASRStream) SendAudio(data []byte) error {
	current := atomic.AddInt32(&m.inFlight, 1)
	defer atomic.AddInt32(&m.inFlight, -1)

	if current > 1 {
		m.mu.Lock()
		if !m.errorSet {
			m.t.Errorf("Concurrent SendAudio detected! gRPC would panic here.")
			m.errorSet = true
		}
		m.mu.Unlock()
	}

	// Simulate some work so overlaps are caught
	time.Sleep(2 * time.Millisecond)
	return nil
}

func (m *mockConcurrentASRStream) Close() error                              { return nil }
func (m *mockConcurrentASRStream) Results() <-chan audio.TranscriptionResult { return nil }
func (m *mockConcurrentASRStream) Errors() <-chan error                      { return nil }

func TestProcessAudioPayload_ConcurrentRace(t *testing.T) {
	s := NewSniffer()

	stream := &RTPStream{
		callID: "test-race",
	}

	mockVAD := &mockVADProcessor{}
	stream.vad = mockVAD

	mockASR := &mockConcurrentASRStream{t: t}
	stream.stream = mockASR

	// Pre-insert into index so InjectRTP routes to it
	s.virtualListeners.Store("test-race:127.0.0.1", stream)

	// Dummy G.711 payload (160 bytes)
	payload := make([]byte, 160)

	// Create a dummy RTP full packet payload (12 byte header + 160 byte payload)
	pcapPayload := make([]byte, 12+160)
	copy(pcapPayload[12:], payload)

	var wg sync.WaitGroup
	// Simulate 10 packets arriving concurrently (e.g., from multiple UDP worker goroutines via HEP)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.InjectRTP("test-race", pcapPayload, pcapPayload, "127.0.0.1", "127.0.0.2", 10000, 20000, time.Now())
		}()
	}

	wg.Wait()
}
