package clickhouse

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type DummyRecord struct {
	ID int
}

// mockCommitter is a generic mock function to verify flush behavior
type mockCommitter[T any] struct {
	mu           sync.Mutex
	flushedItems []T
	flushCount   int32
	shouldFail   bool
}

func (m *mockCommitter[T]) Commit(ctx context.Context, items []T) error {
	if m.shouldFail {
		return context.DeadlineExceeded // Simulate an error
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.flushedItems = append(m.flushedItems, items...)
	atomic.AddInt32(&m.flushCount, 1)
	return nil
}

func (m *mockCommitter[T]) FlushedCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.flushedItems)
}

func (m *mockCommitter[T]) FlushTimes() int32 {
	return atomic.LoadInt32(&m.flushCount)
}

// TestGenericBatchWriter_CapacityFlush tests if flushing triggers once maxSize is reached
func TestGenericBatchWriter_CapacityFlush(t *testing.T) {
	mock := &mockCommitter[DummyRecord]{}
	writer := NewGenericBatchWriter[DummyRecord](10, 500*time.Millisecond, mock.Commit)
	defer writer.Stop()

	// Add 9 items, should not flush
	for i := 0; i < 9; i++ {
		writer.Add(DummyRecord{ID: i})
	}

	time.Sleep(50 * time.Millisecond) // Wait a brief moment to ensure no early flush
	if mock.FlushTimes() != 0 {
		t.Fatalf("Expected 0 flush, got %d", mock.FlushTimes())
	}

	// Add 1 more item, should trigger immediate flush because maxSize(10) is reached
	writer.Add(DummyRecord{ID: 9})

	time.Sleep(50 * time.Millisecond) // Allow async flush to complete
	if mock.FlushTimes() != 1 {
		t.Fatalf("Expected 1 flush due to capacity, got %d", mock.FlushTimes())
	}
	if mock.FlushedCount() != 10 {
		t.Fatalf("Expected 10 flushed items, got %d", mock.FlushedCount())
	}
}

// TestGenericBatchWriter_TimerFlush tests if flushing triggers when the timer ticks
func TestGenericBatchWriter_TimerFlush(t *testing.T) {
	mock := &mockCommitter[DummyRecord]{}
	writer := NewGenericBatchWriter[DummyRecord](100, 100*time.Millisecond, mock.Commit)
	defer writer.Stop()

	// Add 5 items, which is below maxSize
	for i := 0; i < 5; i++ {
		writer.Add(DummyRecord{ID: i})
	}

	// Should not have flushed yet
	if mock.FlushTimes() != 0 {
		t.Fatalf("Expected 0 flush initially")
	}

	// Wait for timer to tick (100ms + buffer)
	time.Sleep(150 * time.Millisecond)

	if mock.FlushTimes() != 1 {
		t.Fatalf("Expected 1 flush triggered by timer, got %d", mock.FlushTimes())
	}
	if mock.FlushedCount() != 5 {
		t.Fatalf("Expected 5 flushed items via timer, got %d", mock.FlushedCount())
	}
}

// TestGenericBatchWriter_Concurrency tests thread safety
func TestGenericBatchWriter_Concurrency(t *testing.T) {
	mock := &mockCommitter[DummyRecord]{}
	writer := NewGenericBatchWriter[DummyRecord](50, 1*time.Second, mock.Commit)
	defer writer.Stop()

	const numGoroutines = 100
	const addsPerGoroutine = 50

	var wg sync.WaitGroup
	wg.Add(numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		go func(routineID int) {
			defer wg.Done()
			for j := 0; j < addsPerGoroutine; j++ {
				writer.Add(DummyRecord{ID: routineID*1000 + j})
			}
		}(i)
	}

	wg.Wait()

	// Force a final flush before checking
	writer.Flush()
	time.Sleep(50 * time.Millisecond)

	expectedTotal := numGoroutines * addsPerGoroutine
	if mock.FlushedCount() != expectedTotal {
		t.Fatalf("Expected %d total flushed items, got %d", expectedTotal, mock.FlushedCount())
	}
}

// TestGenericBatchWriter_Backpressure tests the drop mechanism when flushed continuously fail
func TestGenericBatchWriter_Backpressure(t *testing.T) {
	mock := &mockCommitter[DummyRecord]{shouldFail: true}
	// Small interval to trigger multiple fails
	writer := NewGenericBatchWriter[DummyRecord](10, 50*time.Millisecond, mock.Commit)
	defer writer.Stop()

	// We add exactly MaxBufferSize logic simulation (e.g. 10000 for test)
	// We will manually simulate buffer filling up
	for i := 0; i < MaxBufferSize+50; i++ {
		writer.Add(DummyRecord{ID: i})
	}

	// The writer should not exceed MaxBufferSize
	writer.mu.Lock()
	bufLen := len(writer.buffer)
	writer.mu.Unlock()

	if bufLen > MaxBufferSize {
		t.Fatalf("Buffer length %d exceeded MaxBufferSize %d", bufLen, MaxBufferSize)
	}
}

// =============================================================================
// BUG-5: Batch writer Init functions must be idempotent
// =============================================================================

// TestInitCallEventBatchWriter_Idempotent verifies that calling InitCallEventBatchWriter
// twice does NOT replace an existing writer. Prevents loss of buffered events
// when both InitSharedPipeline and StartHEPServer are called (SIPREC+HEP mode).
func TestInitCallEventBatchWriter_Idempotent(t *testing.T) {
	// Save and restore global writer
	orig := GlobalCallEventWriter
	defer func() {
		if GlobalCallEventWriter != nil {
			GlobalCallEventWriter.Stop()
		}
		GlobalCallEventWriter = orig
	}()

	GlobalCallEventWriter = nil
	InitCallEventBatchWriter(100, time.Second)
	first := GlobalCallEventWriter

	if first == nil {
		t.Fatal("Expected GlobalCallEventWriter to be initialized after first call")
	}

	// Second call — must NOT replace the writer
	InitCallEventBatchWriter(200, 2*time.Second)
	if GlobalCallEventWriter != first {
		t.Error("Expected GlobalCallEventWriter to remain unchanged on second Init call (idempotent)")
	}
}

// TestInitSipMessageBatchWriter_Idempotent verifies idempotency of InitSipMessageBatchWriter.
func TestInitSipMessageBatchWriter_Idempotent(t *testing.T) {
	orig := GlobalSipMessageWriter
	defer func() {
		if GlobalSipMessageWriter != nil {
			GlobalSipMessageWriter.Stop()
		}
		GlobalSipMessageWriter = orig
	}()

	GlobalSipMessageWriter = nil
	InitSipMessageBatchWriter(100, time.Second)
	first := GlobalSipMessageWriter

	InitSipMessageBatchWriter(200, 2*time.Second)
	if GlobalSipMessageWriter != first {
		t.Error("Expected GlobalSipMessageWriter to remain unchanged on second Init call")
	}
}

// TestGenericBatchWriter_DoubleStop_NoPanic verifies that calling Stop() twice
// does NOT panic. This is critical because main.go shutdown sequence may call
// Stop() on the same writer from both StopHEPServer() and the explicit shutdown path.
func TestGenericBatchWriter_DoubleStop_NoPanic(t *testing.T) {
	mock := &mockCommitter[DummyRecord]{}
	writer := NewGenericBatchWriter[DummyRecord](10, time.Second, mock.Commit)

	// Add some items
	writer.Add(DummyRecord{ID: 1})
	writer.Add(DummyRecord{ID: 2})

	// First Stop — should flush and close
	writer.Stop()

	// Second Stop — must NOT panic (currently panics with "close of closed channel")
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("Second Stop() panicked: %v", r)
		}
	}()
	writer.Stop()

	// Verify items were flushed by first Stop
	if mock.FlushedCount() != 2 {
		t.Errorf("Expected 2 flushed items, got %d", mock.FlushedCount())
	}
}

// N1 fix: flushLocked must use the writer's context, not context.Background().
// When the parent context is cancelled (shutdown), the committer should see it.
func TestGenericBatchWriter_FlushRespectsContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // pre-cancel

	var receivedCtx context.Context
	committer := func(c context.Context, items []DummyRecord) error {
		receivedCtx = c
		return c.Err() // will return context.Canceled
	}

	writer := NewGenericBatchWriter[DummyRecord](100, time.Hour, committer)
	// Inject the cancelled context
	writer.ctx = ctx

	writer.Add(DummyRecord{ID: 1})
	writer.Flush()

	if receivedCtx == nil {
		t.Fatal("committer was never called")
	}
	if receivedCtx.Err() != context.Canceled {
		t.Errorf("committer received context with err=%v, want context.Canceled", receivedCtx.Err())
	}

	writer.Stop()
}

// R1 fix: SetContext propagates a parent context to the writer.
// After SetContext is called, flushLocked should use the new context.
func TestGenericBatchWriter_SetContext(t *testing.T) {
	var receivedCtx context.Context
	committer := func(c context.Context, items []DummyRecord) error {
		receivedCtx = c
		return nil
	}

	writer := NewGenericBatchWriter[DummyRecord](100, time.Hour, committer)

	// Initially ctx is context.Background()
	writer.Add(DummyRecord{ID: 1})
	writer.Flush()
	if receivedCtx == nil {
		t.Fatal("committer never called")
	}
	if receivedCtx.Err() != nil {
		t.Error("initial ctx should not be cancelled")
	}

	// Now SetContext with a cancelled context
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	writer.SetContext(ctx)

	writer.Add(DummyRecord{ID: 2})
	writer.Flush()
	if receivedCtx.Err() != context.Canceled {
		t.Errorf("after SetContext, committer should see cancelled ctx, got err=%v", receivedCtx.Err())
	}

	writer.Stop()
}

// R1 closure: verify that Init'd writers pick up the package-level Ctx().
func TestInitBatchWriter_InheritsPackageContext(t *testing.T) {
	// Save and restore
	origWriter := GlobalCallEventWriter
	origCtx := Ctx()
	defer func() {
		if GlobalCallEventWriter != nil && GlobalCallEventWriter != origWriter {
			GlobalCallEventWriter.Stop()
		}
		GlobalCallEventWriter = origWriter
		SetContext(origCtx)
	}()

	// Set a cancelled package context BEFORE init
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	SetContext(ctx)

	GlobalCallEventWriter = nil
	InitCallEventBatchWriter(100, time.Hour)

	if GlobalCallEventWriter == nil {
		t.Fatal("writer not initialized")
	}
	// Writer's ctx should be the package-level Ctx() (cancelled)
	if GlobalCallEventWriter.ctx.Err() != context.Canceled {
		t.Error("writer should inherit the cancelled package context")
	}
}
