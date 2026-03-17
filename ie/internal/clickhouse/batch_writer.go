package clickhouse

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// BatchCommitter defines the function signature for committing a batch of items
type BatchCommitter[T any] func(ctx context.Context, items []T) error

// GenericBatchWriter handles buffered, thread-safe batch writes to an underlying storage.
type GenericBatchWriter[T any] struct {
	buffer    []T
	maxSize   int
	interval  time.Duration
	stopCh    chan struct{}
	mu        sync.Mutex
	wg        sync.WaitGroup // Tracks flushLoop goroutine for graceful Stop()
	failCount int
	commit    BatchCommitter[T]
	stopOnce  sync.Once       // Protects Stop() from double-close panic
	ctx       context.Context // N1: cancellable context for shutdown propagation
}

// NewGenericBatchWriter creates and starts a generic batch writer
func NewGenericBatchWriter[T any](maxSize int, interval time.Duration, committer BatchCommitter[T]) *GenericBatchWriter[T] {
	bw := &GenericBatchWriter[T]{
		buffer:   make([]T, 0, maxSize),
		maxSize:  maxSize,
		interval: interval,
		stopCh:   make(chan struct{}),
		commit:   committer,
		ctx:      context.Background(), // default; callers can override
	}
	bw.wg.Add(1)
	go bw.flushLoop()
	return bw
}

func (bw *GenericBatchWriter[T]) dropIfMaxRetriesLocked() {
	if bw.failCount >= MaxFlushRetries && len(bw.buffer) > 0 {
		log.Printf("[WARN] GenericBatchWriter: dropping %d records after %d consecutive flush failures", len(bw.buffer), bw.failCount)
		// retain the underlying array for reuse
		bw.buffer = bw.buffer[:0]
		bw.failCount = 0
	}
}

// Add appends an item to the buffer and flushes if capacity is reached.
// Drops oldest records if MaxBufferSize limit is hit to prevent OOM.
func (bw *GenericBatchWriter[T]) Add(item T) {
	bw.mu.Lock()
	defer bw.mu.Unlock()

	// Apply backpressure limit
	if len(bw.buffer) >= MaxBufferSize {
		dropCount := bw.maxSize
		if dropCount > len(bw.buffer) {
			dropCount = len(bw.buffer)
		}
		log.Printf("[WARN] GenericBatchWriter backpressure: dropping %d oldest records", dropCount)
		bw.buffer = bw.buffer[dropCount:]
	}

	bw.buffer = append(bw.buffer, item)

	if len(bw.buffer) >= bw.maxSize {
		bw.flushLocked()
	}
}

// Flush explicitly acquires the lock and flushes the buffer
func (bw *GenericBatchWriter[T]) Flush() error {
	bw.mu.Lock()
	defer bw.mu.Unlock()
	return bw.flushLocked()
}

// flushLocked performs the actual commit and assumes the lock is held
func (bw *GenericBatchWriter[T]) flushLocked() error {
	if len(bw.buffer) == 0 {
		return nil
	}

	// Make a shallow copy of the buffer array for the generic commit function
	// We pass the items and then clear the buffer immediately whether it succeeds or fails
	// Wait, if it fails, maybe we want to retry? The old implementation left items
	// inside the buffer and cleared them if it succeeded, or retained them if it failed.

	// Let's stick to the resilient "retain and drop if max retries reached" behavior as per old code.
	err := bw.commit(bw.ctx, bw.buffer)
	if err != nil {
		bw.failCount++
		bw.dropIfMaxRetriesLocked()
		return fmt.Errorf("failed to commit batch: %w", err)
	}

	// On success, reset fail count and clear buffer retaining capacity
	bw.failCount = 0
	bw.buffer = bw.buffer[:0]
	return nil
}

func (bw *GenericBatchWriter[T]) flushLoop() {
	defer bw.wg.Done()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[PANIC] GenericBatchWriter flushLoop recovered: %v", r)
		}
	}()

	ticker := time.NewTicker(bw.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := bw.Flush(); err != nil {
				log.Printf("GenericBatchWriter timer flush error: %v", err)
			}
		case <-bw.stopCh:
			// Ensure we flush anything left before shutting down
			bw.Flush()
			return
		}
	}
}

// Stop stops the generic batch writer's background flushing goroutine.
// Safe to call multiple times — only the first call closes the channel.
// Blocks until flushLoop exits (guarantees final flush is complete).
func (bw *GenericBatchWriter[T]) Stop() {
	bw.stopOnce.Do(func() {
		close(bw.stopCh)
	})
	bw.wg.Wait()
}

// SetContext replaces the writer's context. Used by main.go to inject
// the app-level cancellable context after ClickHouse.SetContext(appCtx).
func (bw *GenericBatchWriter[T]) SetContext(ctx context.Context) {
	bw.mu.Lock()
	bw.ctx = ctx
	bw.mu.Unlock()
}
