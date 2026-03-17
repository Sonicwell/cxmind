package rtp

import (
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/audio"
	"github.com/cxmind/ingestion-go/internal/clickhouse"
)

// --- Mock TranscriptionSink ---

type mockTranscriptionSink struct {
	publishedSegments []map[string]interface{}
	writtenSegments   []clickhouse.TranscriptionSegment
	nextSeq           uint64
}

func newMockSink() *mockTranscriptionSink {
	return &mockTranscriptionSink{nextSeq: 1}
}

func (m *mockTranscriptionSink) PublishTranscription(callID string, segment map[string]interface{}) error {
	m.publishedSegments = append(m.publishedSegments, segment)
	return nil
}

func (m *mockTranscriptionSink) WriteTranscriptionSegment(seg clickhouse.TranscriptionSegment) error {
	m.writtenSegments = append(m.writtenSegments, seg)
	return nil
}

func (m *mockTranscriptionSink) GetNextSequenceNumber(callID string) uint64 {
	seq := m.nextSeq
	m.nextSeq++
	return seq
}

// --- Mock ASR Stream ---

type mockASRStream struct {
	results chan audio.TranscriptionResult
}

func (m *mockASRStream) SendAudio(data []byte) error { return nil }
func (m *mockASRStream) Close() error                { close(m.results); return nil }
func (m *mockASRStream) Results() <-chan audio.TranscriptionResult {
	return m.results
}
func (m *mockASRStream) Errors() <-chan error { return nil }

// --- Tests ---

func TestHandleASRResults_FinalResult_WritesToClickHouse(t *testing.T) {
	sink := newMockSink()
	results := make(chan audio.TranscriptionResult, 1)
	stream := &mockASRStream{results: results}

	// Send a final result
	results <- audio.TranscriptionResult{
		Text:       "你好世界",
		Timestamp:  time.Now(),
		Confidence: 0.95,
		IsFinal:    true,
	}
	close(results)

	// Run handler synchronously (blocking)
	handleASRResults("call-123", "caller", stream, sink)

	// Verify Redis publish was called
	if len(sink.publishedSegments) != 1 {
		t.Fatalf("expected 1 published segment, got %d", len(sink.publishedSegments))
	}
	seg := sink.publishedSegments[0]
	if seg["call_id"] != "call-123" {
		t.Errorf("expected call_id 'call-123', got %v", seg["call_id"])
	}
	if seg["text"] != "你好世界" {
		t.Errorf("expected text '你好世界', got %v", seg["text"])
	}
	if seg["speaker"] != "caller" {
		t.Errorf("expected speaker 'caller', got %v", seg["speaker"])
	}
	// Verify sequence_number was added to the published segment
	if _, ok := seg["sequence_number"]; !ok {
		t.Error("expected sequence_number in published segment for final result")
	}

	// Verify ClickHouse write was called
	if len(sink.writtenSegments) != 1 {
		t.Fatalf("expected 1 written segment, got %d", len(sink.writtenSegments))
	}
	chSeg := sink.writtenSegments[0]
	if chSeg.CallID != "call-123" {
		t.Errorf("expected callID 'call-123', got %s", chSeg.CallID)
	}
	if chSeg.Text != "你好世界" {
		t.Errorf("expected text '你好世界', got %s", chSeg.Text)
	}
	if chSeg.Speaker != "caller" {
		t.Errorf("expected speaker 'caller', got %s", chSeg.Speaker)
	}
	if chSeg.IsFinal != 1 {
		t.Errorf("expected IsFinal 1, got %d", chSeg.IsFinal)
	}
	if chSeg.SequenceNumber != 1 {
		t.Errorf("expected SequenceNumber 1, got %d", chSeg.SequenceNumber)
	}
	if chSeg.Confidence != float32(0.95) {
		t.Errorf("expected Confidence 0.95, got %f", chSeg.Confidence)
	}
}

func TestHandleASRResults_NonFinalResult_SkipsClickHouse(t *testing.T) {
	sink := newMockSink()
	results := make(chan audio.TranscriptionResult, 1)
	stream := &mockASRStream{results: results}

	// Send a non-final (intermediate) result
	results <- audio.TranscriptionResult{
		Text:       "你好",
		Timestamp:  time.Now(),
		Confidence: 0.80,
		IsFinal:    false,
	}
	close(results)

	handleASRResults("call-456", "callee", stream, sink)

	// Redis should be published
	if len(sink.publishedSegments) != 1 {
		t.Fatalf("expected 1 published segment, got %d", len(sink.publishedSegments))
	}

	// ClickHouse should NOT be written for non-final results
	if len(sink.writtenSegments) != 0 {
		t.Errorf("expected 0 written segments for non-final result, got %d", len(sink.writtenSegments))
	}

	// Sequence number should NOT be in the published segment
	if _, ok := sink.publishedSegments[0]["sequence_number"]; ok {
		t.Error("sequence_number should not be present for non-final result")
	}
}

func TestHandleASRResults_MultipleResults_CorrectSequencing(t *testing.T) {
	sink := newMockSink()
	results := make(chan audio.TranscriptionResult, 3)
	stream := &mockASRStream{results: results}

	// Send mixed results
	results <- audio.TranscriptionResult{Text: "你", IsFinal: false, Confidence: 0.5, Timestamp: time.Now()}
	results <- audio.TranscriptionResult{Text: "你好", IsFinal: true, Confidence: 0.9, Timestamp: time.Now()}
	results <- audio.TranscriptionResult{Text: "再见", IsFinal: true, Confidence: 0.88, Timestamp: time.Now()}
	close(results)

	handleASRResults("call-789", "caller", stream, sink)

	// All 3 should be published to Redis
	if len(sink.publishedSegments) != 3 {
		t.Fatalf("expected 3 published segments, got %d", len(sink.publishedSegments))
	}

	// Only 2 final results should be written to ClickHouse
	if len(sink.writtenSegments) != 2 {
		t.Fatalf("expected 2 written segments, got %d", len(sink.writtenSegments))
	}

	// Sequence numbers should be 1, 2
	if sink.writtenSegments[0].SequenceNumber != 1 {
		t.Errorf("expected seq 1, got %d", sink.writtenSegments[0].SequenceNumber)
	}
	if sink.writtenSegments[1].SequenceNumber != 2 {
		t.Errorf("expected seq 2, got %d", sink.writtenSegments[1].SequenceNumber)
	}
}
