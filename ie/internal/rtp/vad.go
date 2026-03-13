package rtp

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"math"
	"sync"
	"time"
)

// VADConfig holds configuration for Voice Activity Detection
type VADConfig struct {
	Enabled   bool
	Threshold int16 // Energy threshold (amplitude)
	Hangover  time.Duration
}

// VAD implements simple energy-based voice activity detection
type VAD struct {
	config      VADConfig
	isActive    bool
	lastActive  time.Time
	frameEnergy float64
	mu          sync.Mutex
}

// NewVAD creates a new VAD instance
func NewVAD() *VAD {
	// Defaults
	enabled := true
	if config.Global.IsSet("vad.enabled") {
		enabled = config.Global.GetBool("vad.enabled")
	}

	threshold := config.Global.GetInt("vad.threshold")
	if threshold == 0 {
		threshold = 300 // Default threshold
	}
	hangover := config.Global.GetInt("vad.hangover_ms")
	if hangover == 0 {
		hangover = 500 // Default 500ms
	}

	return &VAD{
		config: VADConfig{
			Enabled:   enabled,
			Threshold: int16(threshold),
			Hangover:  time.Duration(hangover) * time.Millisecond,
		},
		isActive:   false,
		lastActive: time.Time{},
	}
}

// Process detects voice activity in a PCM frame.
// Returns (isSpeech, rmsEnergy). isSpeech is true if voice is detected or within hangover period.
// rmsEnergy is the RMS amplitude of the frame, exposed for BehaviorCollector (C2-P1).
// The caller provides 'now' to avoid per-frame time.Now() syscalls.
func (v *VAD) Process(pcm []byte, sampleRate int, now time.Time) (bool, float64) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if !v.config.Enabled {
		return true, 0 // Pass through if disabled
	}

	if len(pcm) == 0 {
		return false, 0
	}

	// Calculate RMS (Root Mean Square) energy
	var sumSquares float64
	numSamples := len(pcm) / 2

	for i := 0; i < len(pcm); i += 2 {
		if i+1 >= len(pcm) {
			break
		}
		// Little Endian conversion
		sample := int16(pcm[i]) | int16(pcm[i+1])<<8
		sumSquares += float64(sample) * float64(sample)
	}

	rms := math.Sqrt(sumSquares / float64(numSamples))

	// Threshold Check
	isAboveThreshold := rms > float64(v.config.Threshold)

	// 'now' is provided by caller to avoid per-frame syscall

	if isAboveThreshold {
		v.isActive = true
		v.lastActive = now
		return true, rms
	}

	// Hangover Check
	if v.isActive {
		if now.Sub(v.lastActive) < v.config.Hangover {
			return true, rms // Still in hangover period (sending silence/tail)
		}
		// Hangover expired
		v.isActive = false
	}

	return false, rms
}
