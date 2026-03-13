package rtp

import (
	"testing"
	"time"
)

// TestVAD_ProcessAcceptsTimestamp verifies that VAD.Process accepts a time.Time
// parameter and returns (isSpeech, rmsEnergy) (fix #10, C2-P1).
func TestVAD_ProcessAcceptsTimestamp(t *testing.T) {
	vad := NewVAD()

	// Create a PCM frame with loud audio (above threshold)
	pcm := make([]byte, 320) // 160 samples x 2 bytes
	for i := 0; i < len(pcm); i += 2 {
		// Write a high-amplitude sample (1000) in little-endian
		pcm[i] = 0xe8   // 1000 & 0xFF
		pcm[i+1] = 0x03 // 1000 >> 8
	}

	now := time.Now()
	isSpeech, energy := vad.Process(pcm, 8000, now)
	if !isSpeech {
		t.Error("expected voice activity to be detected for loud audio")
	}
	if energy < 900 || energy > 1100 {
		t.Errorf("expected energy ~1000, got %.2f", energy)
	}
}

// TestVAD_HangoverUsesPassedTime verifies that hangover logic uses the
// provided timestamp rather than an internal time.Now() call (fix #10).
func TestVAD_HangoverUsesPassedTime(t *testing.T) {
	vad := NewVAD()

	// 1. Send loud frame to activate VAD
	loudPCM := make([]byte, 320)
	for i := 0; i < len(loudPCM); i += 2 {
		loudPCM[i] = 0xe8
		loudPCM[i+1] = 0x03
	}

	baseTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	vad.Process(loudPCM, 8000, baseTime)

	// 2. Send silent frame within hangover period (100ms later)
	silentPCM := make([]byte, 320) // all zeros = silence
	withinHangover := baseTime.Add(100 * time.Millisecond)
	isSpeech, _ := vad.Process(silentPCM, 8000, withinHangover)
	if !isSpeech {
		t.Error("expected hangover to keep VAD active within hangover period")
	}

	// 3. Send silent frame after hangover period (1s later)
	afterHangover := baseTime.Add(1 * time.Second)
	isSpeech, _ = vad.Process(silentPCM, 8000, afterHangover)
	if isSpeech {
		t.Error("expected VAD to deactivate after hangover period")
	}
}

// TestVAD_ProcessDisabled verifies pass-through when VAD is disabled.
func TestVAD_ProcessDisabled(t *testing.T) {
	vad := NewVAD()
	vad.config.Enabled = false

	silentPCM := make([]byte, 320)
	isSpeech, _ := vad.Process(silentPCM, 8000, time.Now())
	if !isSpeech {
		t.Error("expected pass-through (true) when VAD is disabled")
	}
}

// TestVAD_ProcessEmptyPCM verifies false for empty input.
func TestVAD_ProcessEmptyPCM(t *testing.T) {
	vad := NewVAD()
	isSpeech, _ := vad.Process([]byte{}, 8000, time.Now())
	if isSpeech {
		t.Error("expected false for empty PCM input")
	}
}
