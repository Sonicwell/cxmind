package rtp

import (
	"fmt"
	"log"

	"github.com/cxmind/ingestion-go/internal/audio"
	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// TranscriptionSink abstracts the dependencies for ASR result handling,
// enabling dependency injection and unit testing.
type TranscriptionSink interface {
	PublishTranscription(callID string, segment map[string]interface{}) error
	WriteTranscriptionSegment(seg clickhouse.TranscriptionSegment) error
	GetNextSequenceNumber(callID string) uint64
}

// defaultTranscriptionSink uses the real Redis and ClickHouse implementations.
type defaultTranscriptionSink struct{}

func (d *defaultTranscriptionSink) PublishTranscription(callID string, segment map[string]interface{}) error {
	return redis.PublishTranscription(callID, segment)
}

func (d *defaultTranscriptionSink) WriteTranscriptionSegment(seg clickhouse.TranscriptionSegment) error {
	return clickhouse.WriteTranscriptionSegment(seg)
}

func (d *defaultTranscriptionSink) GetNextSequenceNumber(callID string) uint64 {
	return clickhouse.GetNextSequenceNumber(callID)
}

// DefaultSink is the production sink instance used by all ASR handlers.
var DefaultSink TranscriptionSink = &defaultTranscriptionSink{}

// handleASRResults processes ASR transcription results from a stream.
// It publishes all results to Redis and persists final results to ClickHouse.
// This is the single source of truth for ASR result handling, eliminating
// the previous code duplication across StartListener, StartVirtualListener,
// and StartListenerWithPreConnect.
//
// NOTE: Text quality filtering (MiniLM / Toxic detection) has been moved to
// the centralized Python SER service, called by App-Server (Node.js).
// This keeps IE focused on high-performance audio capture and ASR streaming.
func handleASRResults(callID string, role string, stream audio.ASRStream, sink TranscriptionSink) {
	for res := range stream.Results() {
		log.Printf("ASR Result [%s-%s]: %s (final: %v, t: %dms)", callID, role, res.Text, res.IsFinal, res.StartTimeMs)

		segment := map[string]interface{}{
			"call_id":   callID,
			"text":      res.Text,
			"is_final":  res.IsFinal,
			"timestamp": timeutil.Now().UnixMilli(),
			"speaker":   role,
		}
		if res.RTTMs > 0 {
			segment["rtt_ms"] = res.RTTMs
		}

		if err := sink.PublishTranscription(callID, segment); err != nil {
			log.Printf("Failed to publish transcription to Redis: %v", err)
		}

		// Persist final results to ClickHouse
		if res.IsFinal {
			seq := sink.GetNextSequenceNumber(callID)
			chSegment := clickhouse.TranscriptionSegment{
				Timestamp:      res.Timestamp,
				CallID:         callID,
				Realm:          "",
				Text:           res.Text,
				Confidence:     float32(res.Confidence),
				Speaker:        role,
				IsFinal:        1,
				SequenceNumber: seq,
			}
			if err := sink.WriteTranscriptionSegment(chSegment); err != nil {
				log.Printf("Failed to persist transcription to ClickHouse: %v", err)
			}

			// Include sequence number in Redis publish
			segment["sequence_number"] = seq
		}
	}
}

// startASRResultHandler launches handleASRResults as a goroutine with panic recovery.
// This is the wrapper used by StartListener, StartVirtualListener, and StartListenerWithPreConnect.
func startASRResultHandler(callID string, role string, stream audio.ASRStream) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[PANIC] ASR Result Handler recovered for call %s: %v", callID, r)
			}
		}()
		handleASRResults(callID, role, stream, DefaultSink)
	}()
}

// publishASRErrorTranscription sends a synthetic transcription with error code
// through the existing Redis pipeline so that:
// 1) AS can detect error_code and trigger SYSTEM_DEGRADATION alert
// 2) Agents see the error in the transcription panel
func publishASRErrorTranscription(callID, role string, err error) {
	vendor := audio.GetCurrentVendorName()
	segment := map[string]interface{}{
		"call_id":    callID,
		"text":       fmt.Sprintf("[ASR Engine '%s' unavailable: %v]", vendor, err),
		"is_final":   true,
		"timestamp":  timeutil.Now().UnixMilli(),
		"speaker":    "system",
		"error_code": "ASR_UNAVAILABLE",
		"vendor":     vendor,
	}
	if pubErr := redis.PublishTranscription(callID, segment); pubErr != nil {
		log.Printf("[ASR] Failed to publish error transcription for call %s: %v", callID, pubErr)
	}
}
