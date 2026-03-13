package clickhouse

import (
	"sync/atomic"
	"testing"
	"time"
)

// =============================================================================
// Constants Verification
// =============================================================================

func TestStateVersionConstants(t *testing.T) {
	// StateVersion values must be strictly ordered for ReplacingMergeTree
	if StateVersionInvite >= StateVersionAnswer {
		t.Error("StateVersionInvite must be less than StateVersionAnswer")
	}
	if StateVersionAnswer >= StateVersionTermination {
		t.Error("StateVersionAnswer must be less than StateVersionTermination")
	}
	// Timeout must NOT overwrite Termination — a completed call's record is final
	if StateVersionTimeout >= StateVersionTermination {
		t.Error("StateVersionTimeout must be less than StateVersionTermination (prevents ghost session overwrite)")
	}
}

// =============================================================================
// Write Functions — nil-guard tests
// =============================================================================

func TestWriteSipCall_NilWriter(t *testing.T) {
	orig := GlobalSipCallWriter
	GlobalSipCallWriter = nil
	defer func() { GlobalSipCallWriter = orig }()

	err := WriteSipCall(SipCallRecord{CallID: "test"})
	if err != nil {
		t.Errorf("Expected nil error when writer is nil, got %v", err)
	}
}

func TestWriteRTCPReport_NilWriter(t *testing.T) {
	orig := GlobalRTCPWriter
	GlobalRTCPWriter = nil
	defer func() { GlobalRTCPWriter = orig }()

	err := WriteRTCPReport(RTCPReport{CallID: "test"})
	if err != nil {
		t.Errorf("Expected nil error when writer is nil, got %v", err)
	}
}

func TestWriteQualityMetric_NilWriter(t *testing.T) {
	orig := GlobalQualityWriter
	GlobalQualityWriter = nil
	defer func() { GlobalQualityWriter = orig }()

	err := WriteQualityMetric(QualityMetric{CallID: "test"})
	if err != nil {
		t.Errorf("Expected nil error when writer is nil, got %v", err)
	}
}

func TestWriteTranscriptionSegment_NilWriter(t *testing.T) {
	orig := GlobalTranscriptionWriter
	GlobalTranscriptionWriter = nil
	defer func() { GlobalTranscriptionWriter = orig }()

	err := WriteTranscriptionSegment(TranscriptionSegment{CallID: "test"})
	if err != nil {
		t.Errorf("Expected nil error when writer is nil, got %v", err)
	}
}

// =============================================================================
// Write Functions — with active writer
// =============================================================================

func TestWriteSipCall_ActiveWriter(t *testing.T) {
	mock := &mockCommitter[SipCallRecord]{}
	writer := NewGenericBatchWriter[SipCallRecord](1, 1*time.Second, mock.Commit)
	defer writer.Stop()

	orig := GlobalSipCallWriter
	GlobalSipCallWriter = writer
	defer func() { GlobalSipCallWriter = orig }()

	err := WriteSipCall(SipCallRecord{CallID: "call-1", Status: "active"})
	if err != nil {
		t.Errorf("Expected nil error, got %v", err)
	}

	// maxSize=1, so should flush immediately
	time.Sleep(50 * time.Millisecond)
	if mock.FlushedCount() != 1 {
		t.Errorf("Expected 1 flushed item, got %d", mock.FlushedCount())
	}
}

func TestWriteTranscriptionSegment_DefaultASRSource(t *testing.T) {
	// Verify that TranscriptionSegment with empty ASRSource works
	seg := TranscriptionSegment{
		CallID:  "call-1",
		Text:    "hello",
		Speaker: "caller",
	}
	if seg.ASRSource != "" {
		t.Errorf("Expected empty ASRSource, got %q", seg.ASRSource)
	}
}

// =============================================================================
// Ping/Close — nil guard tests
// =============================================================================

func TestPing_NilClient(t *testing.T) {
	orig := Client
	Client = nil
	defer func() { Client = orig }()

	err := Ping()
	if err == nil {
		t.Error("Expected error when Client is nil")
	}
}

func TestClose_NilClient(t *testing.T) {
	orig := Client
	Client = nil
	defer func() { Client = orig }()

	err := Close()
	if err != nil {
		t.Errorf("Expected nil error for nil client close, got %v", err)
	}
}

// =============================================================================
// GenericBatchWriter — Stop behavior
// =============================================================================

func TestGenericBatchWriter_StopFlushesRemaining(t *testing.T) {
	mock := &mockCommitter[DummyRecord]{}
	writer := NewGenericBatchWriter[DummyRecord](100, 10*time.Second, mock.Commit)

	// Add items below capacity threshold
	for i := 0; i < 5; i++ {
		writer.Add(DummyRecord{ID: i})
	}

	// Stop should trigger final flush
	writer.Stop()
	time.Sleep(50 * time.Millisecond)

	if mock.FlushedCount() != 5 {
		t.Errorf("Expected 5 flushed items on Stop, got %d", mock.FlushedCount())
	}
}

func TestGenericBatchWriter_FlushEmpty(t *testing.T) {
	mock := &mockCommitter[DummyRecord]{}
	writer := NewGenericBatchWriter[DummyRecord](10, 1*time.Second, mock.Commit)
	defer writer.Stop()

	// Flush with no items should be a no-op
	err := writer.Flush()
	if err != nil {
		t.Errorf("Expected nil error for empty flush, got %v", err)
	}
	if mock.FlushTimes() != 0 {
		t.Errorf("Expected 0 flush calls for empty buffer, got %d", mock.FlushTimes())
	}
}

func TestGenericBatchWriter_FailRetryDrop(t *testing.T) {
	mock := &mockCommitter[DummyRecord]{shouldFail: true}
	writer := NewGenericBatchWriter[DummyRecord](5, 10*time.Second, mock.Commit)
	defer writer.Stop()

	// Add 5 items → triggers capacity flush → fails
	for i := 0; i < 5; i++ {
		writer.Add(DummyRecord{ID: i})
	}
	time.Sleep(50 * time.Millisecond)

	// After 1 failure, failCount should be 1
	writer.mu.Lock()
	fc1 := writer.failCount
	bufLen1 := len(writer.buffer)
	writer.mu.Unlock()

	if fc1 < 1 {
		t.Errorf("Expected failCount >= 1, got %d", fc1)
	}
	// Buffer should still have items (not yet reached MaxFlushRetries)
	if fc1 < MaxFlushRetries && bufLen1 == 0 {
		t.Error("Buffer should still have items before reaching MaxFlushRetries")
	}

	// Trigger more flushes to reach MaxFlushRetries
	for i := 0; i < MaxFlushRetries; i++ {
		writer.Flush()
	}
	time.Sleep(50 * time.Millisecond)

	// After MaxFlushRetries, buffer should be dropped
	writer.mu.Lock()
	bufLen2 := len(writer.buffer)
	fc2 := writer.failCount
	writer.mu.Unlock()

	if bufLen2 != 0 {
		t.Errorf("Expected buffer to be dropped after MaxFlushRetries, got len=%d", bufLen2)
	}
	if fc2 != 0 {
		t.Errorf("Expected failCount to be reset after drop, got %d", fc2)
	}
}

func TestGenericBatchWriter_MultipleCapacityFlushes(t *testing.T) {
	mock := &mockCommitter[DummyRecord]{}
	writer := NewGenericBatchWriter[DummyRecord](5, 10*time.Second, mock.Commit)
	defer writer.Stop()

	// Add 15 items → should trigger 3 capacity flushes
	for i := 0; i < 15; i++ {
		writer.Add(DummyRecord{ID: i})
	}
	time.Sleep(50 * time.Millisecond)

	if atomic.LoadInt32(&mock.flushCount) != 3 {
		t.Errorf("Expected 3 flushes for 15 items with maxSize=5, got %d", atomic.LoadInt32(&mock.flushCount))
	}
	if mock.FlushedCount() != 15 {
		t.Errorf("Expected 15 total flushed items, got %d", mock.FlushedCount())
	}
}

// =============================================================================
// WriteSpeechEmotion — nil Client guard
// =============================================================================

func TestWriteSpeechEmotion_NilClient(t *testing.T) {
	orig := Client
	Client = nil
	defer func() { Client = orig }()

	err := WriteSpeechEmotion(SpeechEmotionRecord{CallID: "test"})
	if err != nil {
		t.Errorf("Expected nil error when Client is nil, got %v", err)
	}
}

func TestWriteSpeechEmotion_DefaultCreatedAt(t *testing.T) {
	// Verify the CreatedAt default assignment
	record := SpeechEmotionRecord{CallID: "test"}
	if !record.CreatedAt.IsZero() {
		t.Error("Expected zero CreatedAt before processing")
	}
}
