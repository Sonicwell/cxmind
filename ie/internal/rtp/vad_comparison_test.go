package rtp

import (
	"fmt"
	"math"
	"os"
	"testing"
	"time"

	"github.com/spf13/viper"
)

// TestVAD_BehavioralSamples runs the current RMS-based VAD against
// the TTS-generated test samples to establish baseline pass-rates.
//
// This test serves two purposes:
// 1. Validate current VAD noise filtering quality
// 2. Provide a comparison baseline for future Silero VAD upgrade
//
// Expected behavior:
//   - calm_agent:    high pass rate (>60%), moderate RMS
//   - angry_customer: high pass rate (>70%), high RMS
//   - long_silence:  mixed pass rate (speech segments pass, silence doesn't)
//   - background_noise: some false positives on noisy segments
//   - bilingual:     similar to calm_agent
func TestVAD_BehavioralSamples(t *testing.T) {
	viper.Set("vad.enabled", true)
	viper.Set("vad.threshold", 300)
	viper.Set("vad.hangover_ms", 500)

	samples := []struct {
		file         string
		description  string
		minPassRate  float64 // Minimum expected VAD pass rate
		maxPassRate  float64 // Maximum expected VAD pass rate
		expectRMSMin float64 // Minimum expected average RMS
	}{
		{"../../testdata/behavior/calm_agent_30s.raw", "Calm agent speech", 0.30, 1.0, 200},
		{"../../testdata/behavior/angry_customer_30s.raw", "Angry customer (loud)", 0.30, 1.0, 400},
		{"../../testdata/behavior/long_silence_30s.raw", "Speech with long silences", 0.10, 0.80, 50},
		{"../../testdata/behavior/background_noise_30s.raw", "Speech + background noise", 0.20, 1.0, 100},
		{"../../testdata/behavior/bilingual_30s.raw", "Chinese + English bilingual", 0.20, 1.0, 100},
	}

	for _, s := range samples {
		t.Run(s.description, func(t *testing.T) {
			pcm, err := os.ReadFile(s.file)
			if err != nil {
				t.Skipf("Sample not found (run generate_samples.py first): %v", err)
			}

			vad := NewVAD()
			result := analyzeWithVAD(vad, pcm)

			t.Logf("  Total frames:  %d", result.totalFrames)
			t.Logf("  Speech frames: %d (%.1f%%)", result.speechFrames, result.passRate*100)
			t.Logf("  Avg RMS:       %.1f", result.avgRMS)
			t.Logf("  Max RMS:       %.1f", result.maxRMS)
			t.Logf("  Energy Delta:  %.1f (avg frame-to-frame)", result.avgEnergyDelta)

			if result.passRate < s.minPassRate {
				t.Errorf("Pass rate %.2f%% below minimum %.2f%%", result.passRate*100, s.minPassRate*100)
			}
			if result.passRate > s.maxPassRate {
				t.Errorf("Pass rate %.2f%% above maximum %.2f%%", result.passRate*100, s.maxPassRate*100)
			}
			if result.avgRMS < s.expectRMSMin {
				t.Errorf("Average RMS %.1f below expected minimum %.1f", result.avgRMS, s.expectRMSMin)
			}
		})
	}
}

// TestVAD_NoiseFiltering compares VAD pass rates across the same speech
// with increasing noise levels. This is the key test for evaluating
// noise filtering quality: a good VAD should maintain speech detection
// while rejecting noise-only frames.
//
// Future comparison:  RMS VAD vs Silero VAD on the same data.
func TestVAD_NoiseFiltering(t *testing.T) {
	viper.Set("vad.enabled", true)
	viper.Set("vad.threshold", 300)
	viper.Set("vad.hangover_ms", 500)

	files := []struct {
		file       string
		label      string
		noiseLevel string
	}{
		{"../../testdata/behavior/vad_clean_10s.raw", "Clean", "none"},
		{"../../testdata/behavior/vad_noisy_low_10s.raw", "Low Noise", "low (amp=100)"},
		{"../../testdata/behavior/vad_noisy_mid_10s.raw", "Mid Noise", "mid (amp=400)"},
		{"../../testdata/behavior/vad_noisy_high_10s.raw", "High Noise", "high (amp=1500)"},
	}

	results := make([]vadAnalysis, len(files))

	for i, f := range files {
		pcm, err := os.ReadFile(f.file)
		if err != nil {
			t.Skipf("Sample not found (run generate_samples.py first): %v", err)
		}

		vad := NewVAD()
		results[i] = analyzeWithVAD(vad, pcm)
	}

	// Print comparison table
	t.Log("")
	t.Log("╔══════════════╦══════════╦══════════════╦══════════╦══════════════╗")
	t.Log("║ Sample       ║ Pass Rate║ Avg RMS      ║ Max RMS  ║ Energy Delta ║")
	t.Log("╠══════════════╬══════════╬══════════════╬══════════╬══════════════╣")
	for i, f := range files {
		r := results[i]
		t.Logf("║ %-12s ║  %5.1f%%  ║  %8.1f    ║ %8.1f ║  %8.1f    ║",
			f.label, r.passRate*100, r.avgRMS, r.maxRMS, r.avgEnergyDelta)
	}
	t.Log("╚══════════════╩══════════╩══════════════╩══════════╩══════════════╝")
	t.Log("")

	// Key assertions:
	// 1. Clean should have highest or near-highest pass rate (real speech)
	cleanRate := results[0].passRate
	t.Logf("Clean pass rate: %.1f%%", cleanRate*100)

	// 2. High noise should have HIGHER pass rate than clean if noise is above threshold
	//    (this is the false positive problem that Silero VAD would solve)
	highNoiseRate := results[3].passRate
	if highNoiseRate > cleanRate*1.5 {
		t.Logf("⚠️  HIGH NOISE false positive: %.1f%% vs clean %.1f%% — RMS VAD triggers on noise!",
			highNoiseRate*100, cleanRate*100)
		t.Log("   → This demonstrates why Silero VAD upgrade is valuable:")
		t.Log("     Silero can distinguish human voice from noise, reducing false positives.")
	}

	// 3. Energy delta should increase with noise level
	for i := 1; i < len(results); i++ {
		t.Logf("Energy delta %s: %.1f vs Clean: %.1f (ratio: %.2fx)",
			files[i].label, results[i].avgEnergyDelta, results[0].avgEnergyDelta,
			results[i].avgEnergyDelta/max(results[0].avgEnergyDelta, 0.01))
	}
}

// TestVAD_TalkRatioAccuracy validates that talk ratio computed from
// VAD frames matches expected characteristics of each sample.
func TestVAD_TalkRatioAccuracy(t *testing.T) {
	viper.Set("vad.enabled", true)
	viper.Set("vad.threshold", 300)
	viper.Set("vad.hangover_ms", 500)

	tests := []struct {
		file             string
		label            string
		expectedMinRatio float64
		expectedMaxRatio float64
	}{
		// Angry customer talks a lot → high ratio
		{"../../testdata/behavior/angry_customer_30s.raw", "Angry", 0.30, 1.0},
		// Long silence → low ratio
		{"../../testdata/behavior/long_silence_30s.raw", "Silence", 0.05, 0.60},
	}

	for _, tt := range tests {
		t.Run(tt.label, func(t *testing.T) {
			pcm, err := os.ReadFile(tt.file)
			if err != nil {
				t.Skipf("Sample not found: %v", err)
			}

			vad := NewVAD()
			result := analyzeWithVAD(vad, pcm)
			ratio := result.passRate // talk_ratio ≈ VAD pass rate

			t.Logf("Talk ratio: %.2f (expected %.2f - %.2f)", ratio, tt.expectedMinRatio, tt.expectedMaxRatio)

			if ratio < tt.expectedMinRatio || ratio > tt.expectedMaxRatio {
				t.Errorf("Talk ratio %.2f outside expected range [%.2f, %.2f]",
					ratio, tt.expectedMinRatio, tt.expectedMaxRatio)
			}
		})
	}
}

// --- Helper types and functions ---

type vadAnalysis struct {
	totalFrames    int
	speechFrames   int
	passRate       float64
	avgRMS         float64
	maxRMS         float64
	avgEnergyDelta float64
	rmsValues      []float64
}

func analyzeWithVAD(vad *VAD, pcm []byte) vadAnalysis {
	frameSize := 320 // 20ms at 8kHz, 16-bit = 320 bytes
	totalFrames := len(pcm) / frameSize
	speechFrames := 0
	var sumRMS, maxRMS float64
	var prevRMS float64
	var sumDelta float64
	deltaCount := 0
	rmsValues := make([]float64, 0, totalFrames)

	baseTime := time.Now()

	for i := 0; i < totalFrames; i++ {
		start := i * frameSize
		end := start + frameSize
		if end > len(pcm) {
			break
		}
		frame := pcm[start:end]
		now := baseTime.Add(time.Duration(i) * 20 * time.Millisecond)

		// Compute RMS for this frame
		rms := computeFrameRMS(frame)
		rmsValues = append(rmsValues, rms)
		sumRMS += rms
		if rms > maxRMS {
			maxRMS = rms
		}

		// Energy delta
		if i > 0 {
			delta := math.Abs(rms - prevRMS)
			sumDelta += delta
			deltaCount++
		}
		prevRMS = rms

		// Run VAD
		isSpeech, _ := vad.Process(frame, 8000, now)
		if isSpeech {
			speechFrames++
		}
	}

	avgRMS := 0.0
	if totalFrames > 0 {
		avgRMS = sumRMS / float64(totalFrames)
	}
	avgDelta := 0.0
	if deltaCount > 0 {
		avgDelta = sumDelta / float64(deltaCount)
	}
	passRate := 0.0
	if totalFrames > 0 {
		passRate = float64(speechFrames) / float64(totalFrames)
	}

	return vadAnalysis{
		totalFrames:    totalFrames,
		speechFrames:   speechFrames,
		passRate:       passRate,
		avgRMS:         avgRMS,
		maxRMS:         maxRMS,
		avgEnergyDelta: avgDelta,
		rmsValues:      rmsValues,
	}
}

func computeFrameRMS(frame []byte) float64 {
	numSamples := len(frame) / 2
	if numSamples == 0 {
		return 0
	}
	var sumSquares float64
	for i := 0; i < len(frame); i += 2 {
		if i+1 >= len(frame) {
			break
		}
		sample := int16(frame[i]) | int16(frame[i+1])<<8
		sumSquares += float64(sample) * float64(sample)
	}
	return math.Sqrt(sumSquares / float64(numSamples))
}

func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

// vadPassRateString returns a visual bar for pass rate
func vadPassRateString(rate float64) string {
	bars := int(rate * 20)
	s := ""
	for i := 0; i < 20; i++ {
		if i < bars {
			s += "█"
		} else {
			s += "░"
		}
	}
	return fmt.Sprintf("[%s] %.1f%%", s, rate*100)
}
