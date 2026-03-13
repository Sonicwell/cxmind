package ser

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPcmToFloat32(t *testing.T) {
	// Silence (all zeros)
	pcm := make([]byte, 200)
	samples := PcmToFloat32(pcm)
	assert.Len(t, samples, 100)
	for _, s := range samples {
		assert.Equal(t, float32(0), s)
	}

	// Max positive: 0x7FFF = 32767
	pcm = []byte{0xFF, 0x7F}
	samples = PcmToFloat32(pcm)
	assert.InDelta(t, 1.0, float64(samples[0]), 0.001)

	// Max negative: 0x8000 = -32768
	pcm = []byte{0x00, 0x80}
	samples = PcmToFloat32(pcm)
	assert.InDelta(t, -1.0, float64(samples[0]), 0.001)
}

func TestResamplePCM_SameRate(t *testing.T) {
	pcm := make([]byte, 100)
	for i := range pcm {
		pcm[i] = byte(i)
	}
	out := resamplePCM(pcm, 8000, 8000)
	assert.Equal(t, pcm, out, "same rate should return identical data")
}

func TestResamplePCM_Upsample(t *testing.T) {
	// 8kHz → 16kHz should ~double the number of samples
	nSamples := 800
	pcm := make([]byte, nSamples*2)
	// Generate a simple sine wave at 8kHz
	for i := 0; i < nSamples; i++ {
		val := int16(16000 * math.Sin(2*math.Pi*440*float64(i)/8000))
		pcm[2*i] = byte(val)
		pcm[2*i+1] = byte(val >> 8)
	}

	out := resamplePCM(pcm, 8000, 16000)
	outSamples := len(out) / 2
	assert.InDelta(t, nSamples*2, outSamples, 2, "upsampled count should be ~2x")
}

func TestSoftmax(t *testing.T) {
	logits := []float32{1, 2, 3, 4, 1, 2, 3}
	probs := softmax(logits)

	// All probs should be positive and sum to 1
	var sum float64
	for _, p := range probs {
		assert.Greater(t, p, float32(0))
		sum += float64(p)
	}
	assert.InDelta(t, 1.0, sum, 0.001)

	// Index 3 (highest logit=4) should have highest probability
	maxIdx := 0
	for i, p := range probs {
		if p > probs[maxIdx] {
			maxIdx = i
		}
	}
	assert.Equal(t, 3, maxIdx)
}

func TestComputeArousalValence(t *testing.T) {
	// All probability on "angry" (index 0)
	probs := []float32{1, 0, 0, 0, 0, 0, 0}
	arousal, valence := computeArousalValence(probs)
	assert.InDelta(t, 1.0, arousal, 0.01, "angry should have high arousal")
	assert.InDelta(t, -0.9, valence, 0.01, "angry should have negative valence")

	// All probability on "happy" (index 3)
	probs = []float32{0, 0, 0, 1, 0, 0, 0}
	arousal, valence = computeArousalValence(probs)
	assert.InDelta(t, 0.7, arousal, 0.01, "happy should have medium-high arousal")
	assert.InDelta(t, 1.0, valence, 0.01, "happy should have positive valence")

	// All probability on "neutral" (index 4)
	probs = []float32{0, 0, 0, 0, 1, 0, 0}
	arousal, valence = computeArousalValence(probs)
	assert.InDelta(t, 0.1, arousal, 0.01, "neutral should have low arousal")
	assert.InDelta(t, 0.0, valence, 0.01, "neutral should have zero valence")
}

func TestLabelMap(t *testing.T) {
	// Verify all 7 raw labels map to one of 4 simplified labels
	validSimplified := map[string]bool{"angry": true, "sad": true, "neutral": true, "happy": true}

	for _, raw := range rawLabels {
		simplified, ok := labelMap[raw]
		require.True(t, ok, "missing mapping for: %s", raw)
		assert.True(t, validSimplified[simplified], "invalid simplified label: %s (from %s)", simplified, raw)
	}
}

func TestAnalyzer_NotInitialized(t *testing.T) {
	a := &Analyzer{}
	segment := &AudioSegment{
		Data:       []float32{0, 0},
		SampleRate: 8000,
	}
	_, err := a.Analyze(segment)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not initialized")
}

func TestResourceMonitor_ModeSwitch(t *testing.T) {
	var lastOld, lastNew string
	rm := NewResourceMonitor(70, "auto", func(old, new string) {
		lastOld = old
		lastNew = new
	})

	// Should start in realtime mode for "auto"
	assert.Equal(t, ModeRealtime, rm.GetMode())

	// Simulate config update to post_call
	rm.UpdateConfig(70, ModePostCall)
	assert.Equal(t, ModePostCall, rm.GetMode())

	// Back to auto
	rm.UpdateConfig(70, ModeAuto)
	assert.Equal(t, ModeRealtime, rm.GetMode())

	// Manually set lastOld/lastNew for verification
	_ = lastOld
	_ = lastNew
}

func TestResourceMonitor_Stats(t *testing.T) {
	rm := NewResourceMonitor(75, ModeRealtime, nil)
	stats := rm.GetStats()

	assert.Equal(t, ModeRealtime, stats.CurrentMode)
	assert.Equal(t, ModeRealtime, stats.DesiredMode)
	assert.Equal(t, float64(75), stats.Threshold)
	assert.False(t, stats.Degraded)
}
