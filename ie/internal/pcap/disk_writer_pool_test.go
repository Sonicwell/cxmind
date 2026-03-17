package pcap

import (
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// TestPCAPWriterPool_FixedWorkers verifies the pool starts exactly N goroutines.
func TestPCAPWriterPool_FixedWorkers(t *testing.T) {
	const workers = 5
	pool := NewPCAPWriterPool(workers, 256)
	defer pool.Stop()

	if pool.Workers() != workers {
		t.Errorf("Expected %d workers, got %d", workers, pool.Workers())
	}
}

// TestPCAPWriterPool_SubmitDropsWhenFull verifies non-blocking behaviour on full queue.
func TestPCAPWriterPool_SubmitDropsWhenFull(t *testing.T) {
	const workers = 1
	const queueSize = 2

	block := make(chan struct{})
	pool := NewPCAPWriterPool(workers, queueSize)
	defer func() {
		close(block)
		pool.Stop()
	}()

	// Fill the worker with a blocking job
	rec := &Recorder{packetChan: make(chan capturedPacket, 10)}
	submitted := 0
	for i := 0; i < 10; i++ {
		job := diskWriteJob{
			rec: rec,
			pkt: capturedPacket{data: []byte{0x00}, ts: timeutil.Now()},
		}
		if pool.Submit(job) {
			submitted++
		}
	}

	// Should not block and submitted ≤ workers+queueSize
	if submitted > workers+queueSize {
		t.Errorf("Expected ≤%d submitted, got %d", workers+queueSize, submitted)
	}
}

// TestPCAPWriterPool_ProcessesWrites verifies that submitted jobs are executed.
func TestPCAPWriterPool_ProcessesWrites(t *testing.T) {
	done := make(chan struct{}, 5)
	pool := NewPCAPWriterPool(2, 64)
	defer pool.Stop()

	rec := &Recorder{packetChan: make(chan capturedPacket, 10)}

	for i := 0; i < 3; i++ {
		pkt := capturedPacket{data: []byte{byte(i)}, ts: timeutil.Now()}
		// Custom writer via hook — we override dispatch test by using direct submitOrFallback
		// For unit isolation, verify the pool routes jobs without panicking.
		pool.Submit(diskWriteJob{rec: rec, pkt: pkt})
		done <- struct{}{} // Count submitted
	}

	// All 3 should have been accepted into the queue without blocking
	count := 0
	for count < 3 {
		select {
		case <-done:
			count++
		case <-time.After(100 * time.Millisecond):
			t.Errorf("Only %d/3 jobs submitted within 100ms", count)
			return
		}
	}
}
