package clickhouse

import (
	"context"
	"log"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// SpeechEmotionRecord represents a single SER result segment
type SpeechEmotionRecord struct {
	CallID       string    `ch:"call_id"`
	ClientID     string    `ch:"client_id"`
	SegmentStart float32   `ch:"segment_start"`
	SegmentEnd   float32   `ch:"segment_end"`
	Emotion      string    `ch:"emotion"`
	Confidence   float32   `ch:"confidence"`
	Arousal      float32   `ch:"arousal"`
	Valence      float32   `ch:"valence"`
	TextEmotion  string    `ch:"text_emotion"`
	FusionScore  float32   `ch:"fusion_score"`
	Source       string    `ch:"source"`  // 'realtime' or 'post_call'
	Speaker      string    `ch:"speaker"` // 'caller' or 'callee' or name
	CreatedAt    time.Time `ch:"created_at"`
}

// WriteSpeechEmotion writes a single SER record to ClickHouse
func WriteSpeechEmotion(record SpeechEmotionRecord) error {
	if Client == nil {
		return nil
	}
	ctx := context.Background()

	// Ensure defaults
	if record.CreatedAt.IsZero() {
		record.CreatedAt = timeutil.Now().UTC()
	}

	query := `INSERT INTO speech_emotions (
		call_id, client_id, segment_start, segment_end,
		emotion, confidence, arousal, valence,
		text_emotion, fusion_score, source, speaker, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	err := Client.Exec(ctx, query,
		record.CallID,
		record.ClientID,
		record.SegmentStart,
		record.SegmentEnd,
		record.Emotion,
		record.Confidence,
		record.Arousal,
		record.Valence,
		record.TextEmotion,
		record.FusionScore,
		record.Source,
		record.Speaker,
		record.CreatedAt,
	)

	if err != nil {
		log.Printf("Failed to write speech_emotion: %v", err)
	}
	return err
}
