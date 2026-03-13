package demovad

import (
	"encoding/json"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// ── Injection points (set by main.go to avoid import cycles) ────────────

// VADInstance is the interface the demo handlers use for VAD processing.
// Matches rtp.SileroVAD's public methods without importing rtp.
type VADInstance interface {
	Process(pcm []byte, sampleRate int, now time.Time) (isSpeech bool, energy float64)
	IsAvailable() bool
	Destroy()
}

// CreateVADFunc creates a real SileroVAD with the given threshold, initialized via ONNX.
// Returns (vad, vadMode). Set by main.go.
var CreateVADFunc func(threshold float32) (VADInstance, string)

// TranscribeFunc calls ASR on raw PCM. Set by main.go.
var TranscribeFunc func(audioData []byte, sampleRate int, language string, r *http.Request) (map[string]interface{}, error)

// ── VAD Segment ──────────────────────────────────────────────────────────

type vadSegment struct {
	Start  float64 `json:"start"`
	End    float64 `json:"end"`
	Speech bool    `json:"speech"`
}

// ── HandleDemoVAD ────────────────────────────────────────────────────────

// HandleDemoVAD analyzes PCM audio using the real IE VAD (Silero or RMS fallback).
//
//	POST /api/demo/vad?sample_rate=16000&silero_threshold=0.5
//	Body: raw PCM (signed 16-bit LE)
func HandleDemoVAD(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
		return
	}

	audioData, sampleRate, sileroThreshold, err := parseDemoAudioRequest(w, r)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	log.Printf("[Demo/VAD] Analyzing %d bytes, sr=%d, threshold=%.2f", len(audioData), sampleRate, sileroThreshold)
	start := timeutil.Now()

	vad, vadMode := createVAD(sileroThreshold)
	defer vad.Destroy()

	result := runVADAnalysis(audioData, sampleRate, vad)

	result["vadMode"] = vadMode
	result["sileroThreshold"] = sileroThreshold
	result["latency_ms"] = time.Since(start).Milliseconds()
	result["source"] = "ie_vad"

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(result)
}

// ── HandleDemoTranscribeWithVAD ──────────────────────────────────────────

// HandleDemoTranscribeWithVAD runs VAD filtering before ASR transcription.
//
//	POST /api/demo/transcribe-with-vad?sample_rate=16000&silero_threshold=0.5&language=zh
//	Body: raw PCM (signed 16-bit LE)
func HandleDemoTranscribeWithVAD(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
		return
	}

	audioData, sampleRate, sileroThreshold, err := parseDemoAudioRequest(w, r)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	language := r.URL.Query().Get("language")
	if language == "" {
		language = "zh"
	}

	log.Printf("[Demo/ASR+VAD] %d bytes, sr=%d, threshold=%.2f, lang=%s",
		len(audioData), sampleRate, sileroThreshold, language)
	start := timeutil.Now()

	// Create VAD and process frames
	vad, vadMode := createVAD(sileroThreshold)

	frameSize := sampleRate * 2 * 20 / 1000 // 20ms of 16-bit PCM
	totalFrames := len(audioData) / frameSize
	if totalFrames == 0 {
		totalFrames = 1
		frameSize = len(audioData)
	}

	var speechPCM []byte
	speechFrameCount := 0
	now := timeutil.Now()

	for f := 0; f < totalFrames; f++ {
		offset := f * frameSize
		end := offset + frameSize
		if end > len(audioData) {
			end = len(audioData)
		}
		frame := audioData[offset:end]
		frameTime := now.Add(time.Duration(f*20) * time.Millisecond)

		isSpeech, _ := vad.Process(frame, sampleRate, frameTime)
		if isSpeech {
			speechPCM = append(speechPCM, frame...)
			speechFrameCount++
		}
	}
	vad.Destroy()

	// Fail-open: if nothing detected as speech, send all
	if len(speechPCM) == 0 {
		speechPCM = audioData
		speechFrameCount = totalFrames
	}

	vadLatency := time.Since(start).Milliseconds()

	// Transcribe filtered audio
	if TranscribeFunc == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "transcribe function not initialized"})
		return
	}

	asrResult, err := TranscribeFunc(speechPCM, sampleRate, language, r)
	if err != nil {
		log.Printf("[Demo/ASR+VAD] Transcription error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Merge VAD stats
	filteredFrames := totalFrames - speechFrameCount
	asrResult["vadMode"] = vadMode
	asrResult["sileroThreshold"] = sileroThreshold
	asrResult["totalFrames"] = totalFrames
	asrResult["speechFrames"] = speechFrameCount
	asrResult["vadFilteredFrames"] = filteredFrames
	if totalFrames > 0 {
		asrResult["frameSavingsPct"] = math.Round(float64(filteredFrames)/float64(totalFrames)*1000) / 10
	}
	asrResult["vadLatencyMs"] = vadLatency
	asrResult["latency_ms"] = time.Since(start).Milliseconds()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(asrResult)
}

// ── Internal Helpers ─────────────────────────────────────────────────────

func createVAD(threshold float32) (VADInstance, string) {
	if CreateVADFunc != nil {
		return CreateVADFunc(threshold)
	}
	// No injection — return a no-op that always says "speech"
	return &fallbackVAD{}, "unavailable"
}

type fallbackVAD struct{}

func (f *fallbackVAD) Process(_ []byte, _ int, _ time.Time) (bool, float64) { return true, 0 }
func (f *fallbackVAD) IsAvailable() bool                                    { return false }
func (f *fallbackVAD) Destroy()                                             {}

func parseDemoAudioRequest(w http.ResponseWriter, r *http.Request) ([]byte, int, float32, error) {
	const maxBody = 20 * 1024 * 1024
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	audioData, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, 0, 0, err
	}
	defer r.Body.Close()

	if len(audioData) == 0 {
		return nil, 0, 0, io.ErrUnexpectedEOF
	}

	sampleRate := 16000
	if sr := r.URL.Query().Get("sample_rate"); sr != "" {
		if v, err := strconv.Atoi(sr); err == nil && v > 0 {
			sampleRate = v
		}
	}

	sileroThreshold := float32(0.5)
	if st := r.URL.Query().Get("silero_threshold"); st != "" {
		if v, err := strconv.ParseFloat(st, 32); err == nil && v > 0 && v < 1 {
			sileroThreshold = float32(v)
		}
	}

	return audioData, sampleRate, sileroThreshold, nil
}

func runVADAnalysis(audioData []byte, sampleRate int, vad VADInstance) map[string]interface{} {
	frameSize := sampleRate * 2 * 20 / 1000
	totalSamples := len(audioData) / 2
	totalFrames := len(audioData) / frameSize
	if totalFrames == 0 {
		totalFrames = 1
		frameSize = len(audioData)
	}

	speechFrames := 0
	silenceFrames := 0
	var segments []vadSegment
	currentSpeech := false
	segStart := 0
	now := timeutil.Now()

	for f := 0; f < totalFrames; f++ {
		offset := f * frameSize
		end := offset + frameSize
		if end > len(audioData) {
			end = len(audioData)
		}
		frame := audioData[offset:end]
		frameTime := now.Add(time.Duration(f*20) * time.Millisecond)

		isSpeech, _ := vad.Process(frame, sampleRate, frameTime)

		if isSpeech {
			speechFrames++
		} else {
			silenceFrames++
		}

		if f == 0 {
			currentSpeech = isSpeech
		} else if isSpeech != currentSpeech {
			segments = append(segments, vadSegment{
				Start:  float64(segStart) / float64(totalFrames),
				End:    float64(f) / float64(totalFrames),
				Speech: currentSpeech,
			})
			segStart = f
			currentSpeech = isSpeech
		}
	}
	if totalFrames > 0 {
		segments = append(segments, vadSegment{
			Start:  float64(segStart) / float64(totalFrames),
			End:    1.0,
			Speech: currentSpeech,
		})
	}

	talkRatio := float64(0)
	if totalFrames > 0 {
		talkRatio = float64(speechFrames) / float64(totalFrames)
	}
	durationSec := float64(totalSamples) / float64(sampleRate)

	costPerFrame := 0.000278 / 50.0
	tokensPerFrame := 8
	frameSavings := float64(0)
	if totalFrames > 0 {
		frameSavings = math.Round((1.0-float64(speechFrames)/float64(totalFrames))*1000) / 10
	}

	return map[string]interface{}{
		"totalFrames":   totalFrames,
		"speechFrames":  speechFrames,
		"silenceFrames": silenceFrames,
		"talkRatio":     math.Round(talkRatio*1000) / 1000,
		"durationSec":   math.Round(durationSec*10) / 10,
		"segments":      segments,
		"withVad": map[string]interface{}{
			"frames": speechFrames,
			"tokens": speechFrames * tokensPerFrame,
			"cost":   math.Round(float64(speechFrames)*costPerFrame*100000) / 100000,
		},
		"withoutVad": map[string]interface{}{
			"frames": totalFrames,
			"tokens": totalFrames * tokensPerFrame,
			"cost":   math.Round(float64(totalFrames)*costPerFrame*100000) / 100000,
		},
		"savings": map[string]interface{}{
			"frames": frameSavings,
			"tokens": frameSavings,
			"cost":   frameSavings,
		},
	}
}
