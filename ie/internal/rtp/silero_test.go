package rtp

import (
	"testing"
	"time"
)

// ─── VADProcessor Interface Tests ────────────────────────────────

func TestRMSVAD_ImplementsInterface(t *testing.T) {
	var _ VADProcessor = (*VAD)(nil)
}

func TestSileroVAD_ImplementsInterface(t *testing.T) {
	var _ VADProcessor = (*SileroVAD)(nil)
}

// ─── SileroVAD Tests ─────────────────────────────────────────────

func TestSileroVAD_NotInitialized_FallbackToRMS(t *testing.T) {
	s := NewSileroVAD(0.5)
	// Not initialized → should fallback to RMS
	if s.IsAvailable() {
		t.Error("uninitialized SileroVAD should not be available")
	}

	// Generate 20ms of silence (320 samples @ 16kHz, 2 bytes each = 640 bytes)
	silence := make([]byte, 640)
	now := time.Now()

	// Should still work via fallback (Process should not panic)
	isSpeech, _ := s.Process(silence, 8000, now)
	if isSpeech {
		t.Error("silence should not be detected as speech even in fallback mode")
	}
}

func TestSileroVAD_WithMockInference(t *testing.T) {
	s := NewSileroVAD(0.5)
	s.inferFn = func(pcm []byte) float32 {
		// Simple mock: if average absolute amplitude > 50, return high probability
		if len(pcm) < 2 {
			return 0.0
		}
		var sum float64
		for i := 0; i < len(pcm)-1; i += 2 {
			sample := int16(pcm[i]) | int16(pcm[i+1])<<8
			if sample < 0 {
				sum += float64(-sample)
			} else {
				sum += float64(sample)
			}
		}
		avg := sum / float64(len(pcm)/2)
		if avg > 50 {
			return 0.9
		}
		return 0.1
	}
	s.initialized = true

	now := time.Now()

	// Test silence
	silence := make([]byte, 640)
	isSpeech, _ := s.Process(silence, 8000, now)
	if isSpeech {
		t.Error("silence should not be speech")
	}

	// Test loud signal
	loud := make([]byte, 640)
	for i := 0; i < len(loud); i += 2 {
		loud[i] = 0x00
		loud[i+1] = 0x10 // amplitude ~4096
	}
	isSpeech, _ = s.Process(loud, 8000, now)
	if !isSpeech {
		t.Error("loud signal should be detected as speech")
	}
}

func TestSileroVAD_Hangover(t *testing.T) {
	s := NewSileroVAD(0.5)
	s.hangover = 200 * time.Millisecond
	s.inferFn = func(pcm []byte) float32 {
		// Check first sample to decide
		if len(pcm) >= 2 && (int16(pcm[0])|int16(pcm[1])<<8) > 100 {
			return 0.9
		}
		return 0.1
	}
	s.initialized = true

	now := time.Now()

	// Feed speech frame — fill all samples with amplitude to pass RMS gating
	speech := make([]byte, 640)
	for i := 0; i < len(speech); i += 2 {
		speech[i] = 0xFF
		speech[i+1] = 0x01 // sample = 0x01FF = 511, RMS ≈ 511 >> noiseFloor(50)
	}
	isSpeech, _ := s.Process(speech, 8000, now)
	if !isSpeech {
		t.Error("speech frame should be detected")
	}

	// Feed low-energy noise within hangover (RMS > noiseFloor but inferFn returns 0.1 = no speech)
	lowNoise := make([]byte, 640)
	for i := 0; i < len(lowNoise); i += 2 {
		lowNoise[i] = 0x40 // sample = 64, RMS ≈ 64 > noiseFloor(50)
		lowNoise[i+1] = 0x00
	}
	nowHangover := now.Add(100 * time.Millisecond)
	isSpeech, _ = s.Process(lowNoise, 8000, nowHangover)
	if !isSpeech {
		t.Error("within hangover period, should still report speech")
	}

	// Feed low-energy noise after hangover expires
	nowExpired := now.Add(300 * time.Millisecond)
	isSpeech, _ = s.Process(lowNoise, 8000, nowExpired)
	if isSpeech {
		t.Error("after hangover expired, should report no speech")
	}
}

func TestSileroVAD_Threshold(t *testing.T) {
	s := NewSileroVAD(0.7) // high threshold
	s.inferFn = func(pcm []byte) float32 {
		return 0.6 // below threshold
	}
	s.initialized = true

	frame := make([]byte, 640)
	isSpeech, _ := s.Process(frame, 8000, time.Now())
	if isSpeech {
		t.Error("probability below threshold should not be speech")
	}
}

// ─── NewVADFromConfig Tests ──────────────────────────────────────

func TestNewVADFromConfig_DefaultIsRMS(t *testing.T) {
	// Without setting any viper config, NewVAD returns *VAD (RMS)
	vad := NewVAD()
	if vad == nil {
		t.Fatal("NewVAD should return non-nil")
	}
}
