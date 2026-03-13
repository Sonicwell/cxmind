package ser

import (
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/cxmind/ingestion-go/internal/ai"
	"github.com/cxmind/ingestion-go/internal/metrics"
	ort "github.com/yalue/onnxruntime_go"
)

// Emotion labels from wav2vec2-SER model (7-class)
var rawLabels = []string{
	"angry", "disgust", "fear", "happy", "neutral", "sad", "surprise",
}

// Simplified 4-class mapping
var labelMap = map[string]string{
	"angry":    "angry",
	"disgust":  "angry",
	"fear":     "sad",
	"happy":    "happy",
	"neutral":  "neutral",
	"sad":      "sad",
	"surprise": "happy",
}

// EmotionResult holds the analysis result for one audio segment.
type EmotionResult struct {
	Start      float32 `json:"start"`       // segment start (seconds)
	End        float32 `json:"end"`         // segment end (seconds)
	Emotion    string  `json:"emotion"`     // simplified: angry/sad/neutral/happy
	RawEmotion string  `json:"raw_emotion"` // original 7-class label
	Confidence float32 `json:"confidence"`  // 0-1
	Arousal    float32 `json:"arousal"`     // activation level 0-1
	Valence    float32 `json:"valence"`     // -1 (negative) to +1 (positive)
}

// AudioSegment represents a chunk of audio to analyze.
type AudioSegment struct {
	Data             []float32 // Normalized [-1.0, 1.0]
	SampleRate       int
	SilenceThreshold float32 // RMS threshold for silence detection (0 = use default 0.03)
}

// AnalysisResult holds the full analysis for a call or audio clip.
type AnalysisResult struct {
	Emotions   []EmotionResult `json:"emotions"`
	Dominant   string          `json:"dominant"` // dominant emotion across all segments
	AvgArousal float32         `json:"avg_arousal"`
	AvgValence float32         `json:"avg_valence"`
}

// Analyzer loads the ONNX model and runs speech emotion inference.
type Analyzer struct {
	mu          sync.Mutex
	initialized bool
	modelPath   string
	libPath     string
	session     *ort.DynamicAdvancedSession
}

var (
	globalAnalyzer *Analyzer
	analyzerOnce   sync.Once
)

// GetAnalyzer returns the singleton Analyzer.
func GetAnalyzer() *Analyzer {
	analyzerOnce.Do(func() {
		globalAnalyzer = &Analyzer{}
	})
	return globalAnalyzer
}

// IsInitialized returns whether the analyzer has successfully loaded the ONNX model.
func (a *Analyzer) IsInitialized() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.initialized
}

// findModelsDir locates the models directory relative to the binary or a known path.
func findModelsDir() string {
	// 1. Check env var
	if dir := os.Getenv("SER_MODELS_DIR"); dir != "" {
		return dir
	}
	// 2. Check relative to executable
	exe, _ := os.Executable()
	exeDir := filepath.Dir(exe)
	for _, rel := range []string{"models", "../models", "../../models"} {
		candidate := filepath.Join(exeDir, rel)
		if _, err := os.Stat(filepath.Join(candidate, "model.onnx")); err == nil {
			return candidate
		}
	}
	// 3. Check relative to working directory
	for _, rel := range []string{"models", "../models", "services/ingestion-go/models"} {
		if _, err := os.Stat(filepath.Join(rel, "model.onnx")); err == nil {
			abs, _ := filepath.Abs(rel)
			return abs
		}
	}
	return ""
}

// onnxLibName is kept as a helper for findModelsDir.
// The actual ONNX library path is managed by the ONNXManager.

// Initialize loads the ONNX model. Must be called once before Analyze.
func (a *Analyzer) Initialize(manager *ai.ONNXManager) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.initialized {
		return nil
	}

	modelsDir := findModelsDir()
	if modelsDir == "" {
		return fmt.Errorf("SER models directory not found (set SER_MODELS_DIR env)")
	}

	a.modelPath = filepath.Join(modelsDir, "model.onnx")

	// Verify files exist
	if _, err := os.Stat(a.modelPath); err != nil {
		return fmt.Errorf("SER model not found: %s (run scripts/download-ser-model.sh)", a.modelPath)
	}

	// Make sure ONNX environment is initialized globally
	if !manager.IsReady() {
		if err := manager.InitializeEnvironment(modelsDir); err != nil {
			return fmt.Errorf("failed to initialize ONNX Runtime: %w", err)
		}
	}

	// Register the model for visibility
	manager.RegisterModel("Speech Emotion Recognition", "wav2vec2-onnx", a.modelPath)

	a.initialized = true
	log.Printf("[SER] Initialized. Model: %s", a.modelPath)
	return nil
}

// Analyze runs emotion classification on an audio segment.
// It handles splitting into 1-3s chunks if the segment is long.
func (a *Analyzer) Analyze(segment *AudioSegment) (*AnalysisResult, error) {
	if !a.initialized {
		return nil, fmt.Errorf("SER analyzer not initialized")
	}

	samples := segment.Data
	sampleRate := segment.SampleRate

	// Resample to 16kHz if needed
	targetRate := 16000
	if sampleRate != targetRate {
		samples = ResampleLinear(samples, sampleRate, targetRate)
		sampleRate = targetRate
	}
	// Convert PCM int16 to float32 normalized [-1, 1]
	// samples := PcmToFloat32(pcm) // This logic is now outside, or we need to handle it here if passing segment
	// Actually Analyzer now takes AudioSegment which has []float32.
	// So we don't need to convert here.

	if len(samples) == 0 {
		return nil, fmt.Errorf("empty audio data")
	}

	// Default analysis window size: 1.5 seconds
	segmentSec := float32(1.5)

	// Split into segments
	segmentSamples := int(segmentSec * float32(sampleRate))
	var results []EmotionResult

	// Silence threshold (configurable at request time)
	silenceThresh := segment.SilenceThreshold
	if silenceThresh <= 0 {
		silenceThresh = 0.03 // default
	}

	for offset := 0; offset < len(samples); offset += segmentSamples {
		end := offset + segmentSamples
		if end > len(samples) {
			// Skip too-short final segment (< 1 second)
			if len(samples)-offset < sampleRate {
				break
			}
			end = len(samples)
		}

		chunk := samples[offset:end]
		startSec := float32(offset) / float32(sampleRate)
		endSec := float32(end) / float32(sampleRate)

		// VAD pre-filter: skip segments with low energy (silence/noise)
		// Speech RMS is typically 0.05-0.2, background noise 0.01-0.03
		rms := rmsEnergy(chunk)
		if rms < silenceThresh {
			log.Printf("[SER] Skipping %.1fs-%.1fs (RMS=%.4f < %.3f, likely silence/noise)", startSec, endSec, rms, silenceThresh)
			// Too quiet — label as neutral with low confidence, don't run model
			results = append(results, EmotionResult{
				Start:      startSec,
				End:        endSec,
				Emotion:    "neutral",
				RawEmotion: "silence",
				Confidence: 0.05,
				Arousal:    0,
				Valence:    0,
			})
			continue
		}

		result, err := a.inferSegment(chunk)
		if err != nil {
			log.Printf("[SER] Inference error at %.1fs: %v", startSec, err)
			continue
		}
		result.Start = startSec
		result.End = endSec
		results = append(results, *result)
	}

	if len(results) == 0 {
		return &AnalysisResult{Emotions: []EmotionResult{}}, nil
	}

	// Compute dominant emotion, avg arousal, avg valence
	emotionCount := make(map[string]int)
	var totalArousal, totalValence float32
	for _, r := range results {
		emotionCount[r.Emotion]++
		totalArousal += r.Arousal
		totalValence += r.Valence
	}
	dominant := "neutral"
	maxCount := 0
	for e, c := range emotionCount {
		if c > maxCount {
			maxCount = c
			dominant = e
		}
	}

	n := float32(len(results))
	return &AnalysisResult{
		Emotions:   results,
		Dominant:   dominant,
		AvgArousal: totalArousal / n,
		AvgValence: totalValence / n,
	}, nil
}

// inferSegment runs the ONNX model on a single segment of float32 audio.
func (a *Analyzer) inferSegment(samples []float32) (*EmotionResult, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// P5 fix: measure ONNX inference latency for Prometheus
	t0 := time.Now()

	// Lazily create the DynamicAdvancedSession on first use
	if a.session == nil {
		s, err := ort.NewDynamicAdvancedSession(
			a.modelPath,
			[]string{"input_values"},
			[]string{"logits"},
			nil,
		)
		if err != nil {
			// P3 fix: reset initialized so callers know to re-initialize rather than
			// getting confusing "inference error" messages while IsInitialized() is true.
			a.initialized = false
			return nil, fmt.Errorf("create dynamic session: %w", err)
		}
		a.session = s
	}

	inputShape := ort.NewShape(1, int64(len(samples)))
	inputTensor, err := ort.NewTensor(inputShape, samples)
	if err != nil {
		return nil, fmt.Errorf("create input tensor: %w", err)
	}
	defer inputTensor.Destroy()

	// Pass nil for output — DynamicAdvancedSession allocates it with correct shape
	inputs := []ort.Value{inputTensor}
	outputs := []ort.Value{nil}

	if err := a.session.Run(inputs, outputs); err != nil {
		return nil, fmt.Errorf("run inference: %w", err)
	}

	// The runtime-allocated output must be destroyed after use
	if outputs[0] != nil {
		defer outputs[0].Destroy()
	}

	// Cast output to *Tensor[float32] to get logits
	outputTensor, ok := outputs[0].(*ort.Tensor[float32])
	if !ok {
		return nil, fmt.Errorf("unexpected output tensor type")
	}
	logits := outputTensor.GetData()

	// Ensure logits length matches expected labels
	if len(logits) < len(rawLabels) {
		return nil, fmt.Errorf("logits length %d < expected %d", len(logits), len(rawLabels))
	}
	// Use only the first len(rawLabels) values
	logits = logits[:len(rawLabels)]

	// Softmax
	probs := softmax(logits)

	// Find max
	maxIdx := 0
	maxProb := probs[0]
	for i, p := range probs {
		if p > maxProb {
			maxProb = p
			maxIdx = i
		}
	}

	rawLabel := rawLabels[maxIdx]
	simplified := labelMap[rawLabel]

	// Compute arousal and valence from probabilities
	arousal, valence := computeArousalValence(probs)

	// P5 fix: record inference latency
	metrics.SERInferenceDuration.Observe(time.Since(t0).Seconds())

	return &EmotionResult{
		Emotion:    simplified,
		RawEmotion: rawLabel,
		Confidence: maxProb,
		Arousal:    arousal,
		Valence:    valence,
	}, nil
}

// softmax converts logits to probabilities.
func softmax(logits []float32) []float32 {
	maxVal := logits[0]
	for _, v := range logits[1:] {
		if v > maxVal {
			maxVal = v
		}
	}
	probs := make([]float32, len(logits))
	var sum float64
	for i, v := range logits {
		probs[i] = float32(math.Exp(float64(v - maxVal)))
		sum += float64(probs[i])
	}
	for i := range probs {
		probs[i] /= float32(sum)
	}
	return probs
}

// computeArousalValence estimates arousal (0-1) and valence (-1 to +1)
// from the 7-class probability distribution.
//
// Arousal: how activated/energized the speaker is
//
//	angry(1.0), surprise(0.9), fear(0.8), happy(0.7), disgust(0.5), sad(0.3), neutral(0.1)
//
// Valence: how positive/negative the emotion is
//
//	happy(1.0), surprise(0.5), neutral(0.0), fear(-0.4), sad(-0.6), disgust(-0.8), angry(-0.9)
func computeArousalValence(probs []float32) (float32, float32) {
	arousalMap := []float32{1.0, 0.5, 0.8, 0.7, 0.1, 0.3, 0.9}     // angry, disgust, fear, happy, neutral, sad, surprise
	valenceMap := []float32{-0.9, -0.8, -0.4, 1.0, 0.0, -0.6, 0.5} // angry, disgust, fear, happy, neutral, sad, surprise

	var arousal, valence float32
	for i, p := range probs {
		arousal += p * arousalMap[i]
		valence += p * valenceMap[i]
	}
	return arousal, valence
}

// rmsEnergy computes the root-mean-square energy of a float32 audio segment.
// Used as a simple VAD: segments with RMS < threshold are considered silence.
func rmsEnergy(samples []float32) float32 {
	if len(samples) == 0 {
		return 0
	}
	var sum float64
	for _, s := range samples {
		sum += float64(s) * float64(s)
	}
	return float32(math.Sqrt(sum / float64(len(samples))))
}

// PcmToFloat32 converts signed 16-bit little-endian PCM to float32 normalized to [-1, 1].
func PcmToFloat32(pcm []byte) []float32 {
	nSamples := len(pcm) / 2
	samples := make([]float32, nSamples)
	for i := 0; i < nSamples; i++ {
		sample := int16(pcm[2*i]) | int16(pcm[2*i+1])<<8
		samples[i] = float32(sample) / 32768.0
	}
	return samples
}

// Destroy cleans up the SER session.
// Note: The ONNX Runtime environment lifecycle is managed by ONNXManager.
func (a *Analyzer) Destroy() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.session != nil {
		a.session.Destroy()
		a.session = nil
	}
	a.initialized = false
	log.Println("[SER] Session destroyed")
}
