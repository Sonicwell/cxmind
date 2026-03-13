package rtp

import (
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/sip"
)

func TestProcessAudioPayload_G722(t *testing.T) {
	stream := &RTPStream{
		callID: "test-g722",
	}

	// Create a dummy vad processor to check sample rate
	mockVAD := &mockVADProcessor{}
	stream.vad = mockVAD

	// Create a dummy G.722 payload: 160 bytes
	g722Body := make([]byte, 160)
	for i := range g722Body {
		g722Body[i] = 0xAA
	}

	// Should not panic, should decode correctly
	processAudioPayload(stream, "test-g722", "127.0.0.1", "agent1", mockVAD, nil, nil, g722Body, 9)

	if !mockVAD.called {
		t.Error("VAD was not called")
	}

	if mockVAD.lastSampleRate != 16000 {
		t.Errorf("Expected sample rate 16000 for G.722, got %d", mockVAD.lastSampleRate)
	}

	if mockVAD.lastPCMLen != 640 {
		t.Errorf("Expected PCM length 640 for 20ms G.722, got %d", mockVAD.lastPCMLen)
	}
}

func TestProcessAudioPayload_Opus(t *testing.T) {
	stream := &RTPStream{
		callID: "test-opus",
	}

	// inject dynamic Payload Type map with PTInfo
	stream.UpdatePTMap(map[uint8]sip.PTInfo{
		111: {CodecName: "opus", Channels: 1, ClockRateHz: 48000},
	})

	// Create a dummy vad processor to check sample rate
	mockVAD := &mockVADProcessor{}
	stream.vad = mockVAD

	// Create a valid SILK 20ms Opus frame (TOC byte 0x20 or 0x22)
	// 0x20 = 0010 0000 = Config 4: SILK Narrowband 20ms
	// Actually pion might need more valid payload bytes to decode without error.
	// For testing the *routing* without a real Opus encoder available in tests,
	// we will override the DecodeOpusToPCM16k locally or just bypass the early return in the test.
	// Since we can't easily bypass it, let's just accept the VAD might not be called if decode fails,
	// BUT we *really* want to test the routing.

	// Let's use a roughly valid fake SILK frame that might pass the initial header check.
	// Config=1 (0000 1000) = SILK NB 20ms.
	opusBody := []byte{0x08, 0x00, 0x00, 0x00, 0x00}

	// Process dynamic payload type 111 mapped to Opus
	processAudioPayload(stream, "test-opus", "127.0.0.1", "agent1", mockVAD, nil, nil, opusBody, 111)

	if !mockVAD.called {
		t.Error("VAD was not called")
	}

	if mockVAD.lastSampleRate != 16000 {
		t.Errorf("Expected sample rate 16000 for Opus, got %d", mockVAD.lastSampleRate)
	}

	// For a single 0xFC frame (20ms silent), it will decode to 960 samples @ 48kHz,
	// and downsample to 320 samples @ 16kHz == 640 bytes.
	if mockVAD.lastPCMLen != 640 {
		t.Errorf("Expected PCM length 640 for 20ms Opus, got %d", mockVAD.lastPCMLen)
	}
}

// Mock VAD for testing the parameters passed to Process
type mockVADProcessor struct {
	called         bool
	lastSampleRate int
	lastPCMLen     int
}

func (m *mockVADProcessor) Process(pcm []byte, sampleRate int, now time.Time) (bool, float64) {
	m.called = true
	m.lastSampleRate = sampleRate
	m.lastPCMLen = len(pcm)
	return true, 1.0
}

func (m *mockVADProcessor) IsAvailable() bool {
	return true
}

func (m *mockVADProcessor) Destroy() {}
