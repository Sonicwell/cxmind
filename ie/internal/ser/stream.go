package ser

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"log"
	"sync"
	"time"

	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/timeutil"
)

const (
	// SERWindowSize is the duration of audio to analyze at once (e.g. 1.5 seconds)
	SERWindowSize = 1500 * time.Millisecond
	// SERSampleRate is the target sample rate for the model (16kHz)
	SERSampleRate = 16000
	// InputSampleRate is the G.711 sample rate (8kHz)
	InputSampleRate = 8000
)

// SERStream handles real-time speech emotion recognition for a single audio stream
type SERStream struct {
	callID      string
	role        string // 'caller', 'callee', or name
	agentID     string // Optional: if we want to track specific agent emotion
	buffer      []float32
	bufferSize  int
	mu          sync.Mutex
	analyzer    *Analyzer
	monitor     *ResourceMonitor
	lastAnalyze time.Time
	onAnalysis  func(clickhouse.SpeechEmotionRecord)
}

// NewSERStream creates a new SER stream processor
func NewSERStream(callID string, role string, analyzer *Analyzer, monitor *ResourceMonitor, onAnalysis func(clickhouse.SpeechEmotionRecord)) *SERStream {
	// Calculate buffer size: converting 8kHz input to 16kHz for N seconds window
	// But we buffer at input rate (8kHz) and resample just before inference
	// 8000 samples/sec * 1.5 sec = 12000 samples
	samplesNeeded := int(float64(InputSampleRate) * SERWindowSize.Seconds())

	return &SERStream{
		callID:      callID,
		role:        role,
		analyzer:    analyzer,
		monitor:     monitor,
		buffer:      make([]float32, 0, samplesNeeded),
		bufferSize:  samplesNeeded,
		lastAnalyze: timeutil.Now(),
		onAnalysis:  onAnalysis,
	}
}

// ProcessAudio accepts G.711 decoded PCM (linear int16)
// We convert it to float32 immediately
func (s *SERStream) ProcessAudio(pcm []byte) {
	// Check degradation mode first (fast check)
	if s.monitor.GetMode() == ModePostCall {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Convert int16 bytes to float32 (-1.0 to 1.0)
	// Input is Little Endian 16-bit
	for i := 0; i < len(pcm); i += 2 {
		if i+1 >= len(pcm) {
			break
		}
		sample := int16(uint16(pcm[i]) | uint16(pcm[i+1])<<8)
		s.buffer = append(s.buffer, float32(sample)/32768.0)
	}

	// Check if buffer is full
	if len(s.buffer) >= s.bufferSize {
		s.flushAndAnalyze()
	}
}

func (s *SERStream) flushAndAnalyze() {
	mode := config.Global.GetString("ser.mode")
	if mode != "remote" && s.analyzer == nil {
		s.buffer = s.buffer[:0]
		return
	}

	// Copy buffer for processing to avoid blocking input
	inputChunk := make([]float32, len(s.buffer))
	copy(inputChunk, s.buffer)
	s.buffer = s.buffer[:0]

	// Process in background goroutine to not block RTP loop
	go func(audio []float32) {
		// Degradation check again (in case mode changed)
		if s.monitor.GetMode() == ModePostCall {
			return
		}

		// Resample 8k -> 16k
		// Target size = input_len * (16000/8000) = input_len * 2
		resampled := ResampleLinear(audio, InputSampleRate, SERSampleRate)

		// Create segment for analyzer
		segment := &AudioSegment{
			Data:       resampled,
			SampleRate: SERSampleRate,
		}

		// Log start time for this segment (approximate)
		// We could improve this by passing exact RTP timestamps
		// Detailed timestamping requires passing RTP timestamps through.
		// For now, let's just analyze and log/print.

		// Route based on mode
		var result *AnalysisResult
		var err error

		if mode == "remote" {
			result, err = AnalyzeRemote(s.callID, segment.Data, segment.SampleRate)
		} else {
			result, err = s.analyzer.Analyze(segment)
		}

		if err != nil {
			log.Printf("[SER] Analysis failed for %s: %v", s.callID, err)
			return
		}

		// Log high confidence emotions
		for _, emotion := range result.Emotions {
			if emotion.Confidence > 0.6 {
				log.Printf("[SER] Call %s: %s (%.2f) A:%.2f V:%.2f", s.callID, emotion.Emotion, emotion.Confidence, emotion.Arousal, emotion.Valence)

				// Persist to ClickHouse (fire and forget)
				startOffset := float32(timeutil.Now().UnixMilli()) / 1000.0 // Placeholder

				record := clickhouse.SpeechEmotionRecord{
					CallID:       s.callID,
					SegmentStart: startOffset,
					SegmentEnd:   startOffset + float32(SERWindowSize.Seconds()),
					Emotion:      emotion.Emotion,
					Confidence:   emotion.Confidence,
					Arousal:      emotion.Arousal,
					Valence:      emotion.Valence,
					Source:       mode,
					Speaker:      s.role,
				}
				clickhouse.WriteSpeechEmotion(record)

				if s.onAnalysis != nil {
					s.onAnalysis(record)
				}
			}
		}

	}(inputChunk)
}
