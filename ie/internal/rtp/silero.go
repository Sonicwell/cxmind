package rtp

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"log"
	"math"
	"sync"
	"time"

	"github.com/cxmind/ingestion-go/internal/ai"
	ort "github.com/yalue/onnxruntime_go"
)

// VADProcessor is the interface for voice activity detectors.
// Both the existing RMS VAD and the new Silero VAD implement this.
type VADProcessor interface {
	// Process detects voice activity in a PCM frame (16kHz, 16-bit LE mono).
	// Returns (isSpeech, energy). 'now' is provided by caller to avoid syscalls.
	Process(pcm []byte, sampleRate int, now time.Time) (bool, float64)
	// IsAvailable returns whether the detector is initialized and ready.
	IsAvailable() bool
}

// Ensure VAD (RMS) implements VADProcessor
var _ VADProcessor = (*VAD)(nil)

// IsAvailable for the existing RMS VAD — always true if config.Enabled.
func (v *VAD) IsAvailable() bool {
	return v.config.Enabled
}

// SileroVAD wraps the Silero ONNX model for neural voice activity detection.
// Falls back to RMS energy if the model is not loaded.
//
// Option B (Stateful): Each SileroVAD instance maintains its own h/c state
// tensors, enabling continuous stream-level context. Since a new SileroVAD
// is created per RTP stream (per call leg), state is naturally scoped to a
// single call without cross-call contamination.
type SileroVAD struct {
	threshold   float32       // Speech probability threshold (0-1)
	hangover    time.Duration // Hold speech state after probability drops
	initialized bool          // Whether ONNX model is loaded
	mu          sync.Mutex
	isActive    bool
	lastActive  time.Time

	// ONNX session for this VAD instance
	session   *ort.DynamicAdvancedSession
	modelPath string

	// Stateful RNN context (Option B): per-stream h/c tensors
	// Silero VAD v4 uses shape [2, 1, 64] for both h and c
	stateH []float32
	stateC []float32

	// inferFn allows injecting mock inference for testing.
	// Signature: raw PCM bytes → speech probability [0,1].
	inferFn func(pcm []byte) float32

	// Fallback RMS parameters for when ONNX is not available
	rmsThreshold float64

	// RMS gating threshold (Risk 4): skip ONNX if energy below this
	noiseFloor float64
}

// NewSileroVAD creates a new Silero VAD.
// It does not load the model — call Initialize() separately.
func NewSileroVAD(threshold float32) *SileroVAD {
	return &SileroVAD{
		threshold:    threshold,
		hangover:     300 * time.Millisecond,
		rmsThreshold: 300, // Fallback RMS energy threshold
		noiseFloor:   50,  // Risk 4: RMS gating threshold
		// Initialize zero state for Silero VAD v4: [2, 1, 64]
		stateH: make([]float32, 2*1*64),
		stateC: make([]float32, 2*1*64),
	}
}

// NewVADFromConfig creates the appropriate VAD based on viper config.
// If mode is "silero" and the model loads successfully, returns SileroVAD.
// Otherwise returns the default RMS VAD.
func NewVADFromConfig() VADProcessor {
	mode := config.Global.GetString("vad.mode")

	if mode == "silero" {
		threshold := float32(config.Global.GetFloat64("vad.silero_threshold"))
		if threshold <= 0 {
			threshold = 0.5
		}
		s := NewSileroVAD(threshold)

		hangoverMs := config.Global.GetInt("vad.hangover_ms")
		if hangoverMs > 0 {
			s.hangover = time.Duration(hangoverMs) * time.Millisecond
		}

		modelPath := config.Global.GetString("vad.silero_model")
		if modelPath != "" {
			manager := ai.GetONNXManager()
			if err := s.Initialize(modelPath, manager); err != nil {
				log.Printf("[VAD] Silero model not loaded (%v), using RMS energy VAD", err)
				return NewVAD()
			}
			if s.IsAvailable() {
				log.Printf("[VAD] Using Silero neural VAD (threshold=%.2f)", threshold)
				return s
			}
		}

		// Model not available → fallback
		log.Printf("[VAD] Silero model not found at %s, using RMS energy VAD", modelPath)
		return NewVAD()
	}

	// Default: RMS energy VAD
	return NewVAD()
}

// TryInitializeSileroForDemo attempts to load the Silero model for a one-off
// demo analysis. Uses the global ONNXManager and default model path.
// Returns nil on success, error if Silero cannot be loaded.
func TryInitializeSileroForDemo(s *SileroVAD) error {
	modelPath := config.Global.GetString("vad.silero_model")
	if modelPath == "" {
		modelPath = "./models/silero_vad.onnx"
	}
	manager := ai.GetONNXManager()
	return s.Initialize(modelPath, manager)
}

// Initialize loads the ONNX model from the given path using the centralized manager.
// Returns an error if loading fails; the detector will still work via RMS fallback.
func (s *SileroVAD) Initialize(modelPath string, manager *ai.ONNXManager) error {
	// For testing: if inferFn is pre-set, mark as initialized without ONNX
	if s.inferFn != nil {
		s.initialized = true
		return nil
	}

	// Ensure ONNX environment is ready (Risk 1: centralized init)
	if !manager.IsReady() {
		log.Printf("[SileroVAD] WARN: ONNX environment not initialized, using RMS fallback")
		return nil
	}

	// Create a DynamicAdvancedSession for Silero VAD
	// Silero VAD v4 inputs:  input (float32[1, chunk_size]), h (float32[2,1,64]), c (float32[2,1,64]), sr (int64[1])
	// Silero VAD v4 outputs: output (float32[1,1]), hn (float32[2,1,64]), cn (float32[2,1,64])
	session, err := ort.NewDynamicAdvancedSession(
		modelPath,
		[]string{"input", "h", "c", "sr"},
		[]string{"output", "hn", "cn"},
		nil,
	)
	if err != nil {
		log.Printf("[SileroVAD] Failed to create ONNX session from %s: %v", modelPath, err)
		return nil // Fail-open: fall back to RMS
	}

	s.session = session
	s.modelPath = modelPath
	s.initialized = true

	// Register with the manager for visibility
	manager.RegisterModel("Silero VAD", "silero-vad-v4-onnx", modelPath)

	log.Printf("[SileroVAD] ONNX model loaded successfully from %s", modelPath)
	return nil
}

// IsAvailable returns true if the Silero model is loaded and ready.
func (s *SileroVAD) IsAvailable() bool {
	return s.initialized
}

// Process detects voice activity using the Silero ONNX model.
// If the model is not initialized, falls back to RMS energy detection.
// Returns (isSpeech, rmsEnergy).
func (s *SileroVAD) Process(pcm []byte, sampleRate int, now time.Time) (bool, float64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(pcm) == 0 {
		return false, 0
	}

	// Calculate RMS energy (always, for BehaviorCollector metrics)
	rms := rmsEnergy(pcm)

	// If model not available, use RMS fallback
	if !s.initialized || (s.session == nil && s.inferFn == nil) {
		isAboveThreshold := rms > s.rmsThreshold
		if isAboveThreshold {
			s.isActive = true
			s.lastActive = now
			return true, rms
		}
		if s.isActive && now.Sub(s.lastActive) < s.hangover {
			return true, rms
		}
		s.isActive = false
		return false, rms
	}

	// Risk 4: RMS gating — skip expensive ONNX inference for pure silence
	if rms < s.noiseFloor {
		// Reset RNN state during long silence to avoid stale context
		if s.isActive && now.Sub(s.lastActive) >= s.hangover {
			s.resetState()
			s.isActive = false
		}
		return false, rms
	}

	// Neural inference (mock or real)
	var prob float32
	if s.inferFn != nil {
		prob = s.inferFn(pcm)
	} else {
		var err error
		prob, err = s.inferONNX(pcm, sampleRate)
		if err != nil {
			// Fail-open: if inference fails, use RMS fallback for this frame
			log.Printf("[SileroVAD] Inference error (falling back to RMS): %v", err)
			isAboveThreshold := rms > s.rmsThreshold
			if isAboveThreshold {
				s.isActive = true
				s.lastActive = now
				return true, rms
			}
			return s.isActive && now.Sub(s.lastActive) < s.hangover, rms
		}
	}

	isSpeech := prob >= s.threshold

	if isSpeech {
		s.isActive = true
		s.lastActive = now
		return true, rms
	}

	// Hangover
	if s.isActive {
		if now.Sub(s.lastActive) < s.hangover {
			return true, rms
		}
		s.isActive = false
	}

	return false, rms
}

// inferONNX runs the Silero VAD model with stateful h/c tensors (Option B).
// Risk 2 mitigation: all tensors are explicitly destroyed after use.
func (s *SileroVAD) inferONNX(pcm []byte, sampleRate int) (float32, error) {
	// Convert PCM int16 LE to float32 normalized [-1, 1]
	nSamples := len(pcm) / 2
	samples := make([]float32, nSamples)
	for i := 0; i < nSamples; i++ {
		sample := int16(pcm[2*i]) | int16(pcm[2*i+1])<<8
		samples[i] = float32(sample) / 32768.0
	}

	// Create input tensor: [1, chunk_size]
	inputShape := ort.NewShape(1, int64(nSamples))
	inputTensor, err := ort.NewTensor(inputShape, samples)
	if err != nil {
		return 0, err
	}
	defer inputTensor.Destroy() // Risk 2: explicit cleanup

	// Create h state tensor: [2, 1, 64]
	hShape := ort.NewShape(2, 1, 64)
	hTensor, err := ort.NewTensor(hShape, s.stateH)
	if err != nil {
		return 0, err
	}
	defer hTensor.Destroy()

	// Create c state tensor: [2, 1, 64]
	cShape := ort.NewShape(2, 1, 64)
	cTensor, err := ort.NewTensor(cShape, s.stateC)
	if err != nil {
		return 0, err
	}
	defer cTensor.Destroy()

	// Create sample rate tensor: int64[1] = sampleRate
	srShape := ort.NewShape(1)
	srData := []int64{int64(sampleRate)}
	srTensor, err := ort.NewTensor(srShape, srData)
	if err != nil {
		return 0, err
	}
	defer srTensor.Destroy()

	// Run inference
	inputs := []ort.Value{inputTensor, hTensor, cTensor, srTensor}
	outputs := []ort.Value{nil, nil, nil} // Let ONNX allocate outputs

	if err := s.session.Run(inputs, outputs); err != nil {
		return 0, err
	}

	// Risk 2: cleanup all output tensors
	for _, out := range outputs {
		if out != nil {
			defer out.Destroy()
		}
	}

	// Extract speech probability from output[0]: [1, 1]
	outputTensor, ok := outputs[0].(*ort.Tensor[float32])
	if !ok {
		return 0, nil // Fail-open
	}
	prob := outputTensor.GetData()[0]

	// Update h/c state from outputs[1] and outputs[2] (Option B: stateful)
	if hnTensor, ok := outputs[1].(*ort.Tensor[float32]); ok {
		copy(s.stateH, hnTensor.GetData())
	}
	if cnTensor, ok := outputs[2].(*ort.Tensor[float32]); ok {
		copy(s.stateC, cnTensor.GetData())
	}

	return prob, nil
}

// resetState zeros out the RNN hidden state (called during long silence).
func (s *SileroVAD) resetState() {
	for i := range s.stateH {
		s.stateH[i] = 0
	}
	for i := range s.stateC {
		s.stateC[i] = 0
	}
}

// Destroy cleans up the ONNX session for this VAD instance.
func (s *SileroVAD) Destroy() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session != nil {
		s.session.Destroy()
		s.session = nil
	}
	s.initialized = false
}

// rmsEnergy calculates the RMS energy of a PCM frame (16-bit LE).
func rmsEnergy(pcm []byte) float64 {
	if len(pcm) < 2 {
		return 0
	}
	var sumSquares float64
	numSamples := len(pcm) / 2
	for i := 0; i < len(pcm)-1; i += 2 {
		sample := int16(pcm[i]) | int16(pcm[i+1])<<8
		sumSquares += float64(sample) * float64(sample)
	}
	return math.Sqrt(sumSquares / float64(numSamples))
}
