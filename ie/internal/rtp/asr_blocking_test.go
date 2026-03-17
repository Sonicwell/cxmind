package rtp

import (
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/audio"
	"github.com/cxmind/ingestion-go/internal/sip"
)

// slowMockASRProvider simulates a slow ASR connection
type slowMockASRProvider struct {
	audio.MockASRProvider
	delay time.Duration
}

func (m *slowMockASRProvider) NewStream(sampleRate int, language string) (audio.ASRStream, error) {
	time.Sleep(m.delay)
	return m.MockASRProvider.NewStream(sampleRate, language)
}

func TestProcessAudioPayload_ASRCreateNonBlocking(t *testing.T) {
	// Restore original provider after test
	originalProvider := audio.GetCurrentASRProvider()
	defer audio.SetASRProviderForTesting(originalProvider)

	// Set a mock provider that takes 2 seconds to establish a stream
	slowProvider := &slowMockASRProvider{delay: 2 * time.Second}
	audio.SetASRProviderForTesting(slowProvider)

	stream := &RTPStream{
		callID:          "test-asr-blocking",
		role:            "caller",
		processingLevel: 2,
		ptMap:           make(map[uint8]sip.PTInfo),
	}

	// Mock audio payload (PCMU)
	payload := make([]byte, 160) // 20ms of audio

	start := time.Now()

	// Call processAudioPayload
	// Since sampleRate is determined by payloadType, passing 0 means 8000Hz.
	// We pass nil for vad, asrStream, serStream initially.
	processAudioPayload(stream, stream.callID, "127.0.0.1", "agent1", nil, nil, nil, payload, 0)

	elapsed := time.Since(start)

	// The function should return almost immediately (well under the 2s delay)
	if elapsed > 100*time.Millisecond {
		t.Fatalf("processAudioPayload blocked for %v, expected < 100ms", elapsed)
	}

	// Verify that the stream was marked as creating
	stream.mu.Lock()
	isCreating := stream.asrCreating
	stream.mu.Unlock()

	if !isCreating {
		// It might be false if the goroutine already finished, but with 2s delay it should be true
		t.Errorf("Expected asrCreating to be true, but it was false")
	}

	// Wait for the async creation to complete to avoid leaking goroutines
	time.Sleep(2500 * time.Millisecond)

	stream.mu.Lock()
	defer stream.mu.Unlock()

	if stream.asrCreating {
		t.Errorf("Expected asrCreating to be false after completion, but it was true")
	}
	if stream.stream == nil {
		t.Errorf("Expected stream.stream to be set after async creation, but it was nil")
	} else {
		stream.stream.Close()
	}
}
