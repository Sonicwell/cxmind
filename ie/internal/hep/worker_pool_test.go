package hep

import (
	"net"
	"testing"
	"time"
)

// TestHEPWorkerPool_FixedGoroutines verifies that the pool starts exactly N workers.
func TestHEPWorkerPool_FixedGoroutines(t *testing.T) {
	const workers = 4
	pool := NewHEPWorkerPool(workers, 256)
	defer pool.Stop()

	if pool.Workers() != workers {
		t.Errorf("Expected %d workers, got %d", workers, pool.Workers())
	}
}

// TestHEPWorkerPool_ProcessesPackets verifies that jobs submitted to the pool
// are executed by the worker goroutines.
func TestHEPWorkerPool_ProcessesPackets(t *testing.T) {
	const workers = 2
	done := make(chan struct{}, 10)

	pool := NewHEPWorkerPool(workers, 64)
	defer pool.Stop()

	addr, _ := net.ResolveUDPAddr("udp", "127.0.0.1:0")

	for i := 0; i < 5; i++ {
		pool.Submit(packetJob{
			data:       []byte{0x48, 0x45, 0x50, 0x33}, // "HEP3"
			remoteAddr: addr,
			handler: func(data []byte, remote net.Addr) {
				done <- struct{}{}
			},
		})
	}

	received := 0
	timeout := time.After(200 * time.Millisecond)
	for received < 5 {
		select {
		case <-done:
			received++
		case <-timeout:
			t.Errorf("Only %d/5 packets processed within 200ms", received)
			return
		}
	}
}

// TestHEPWorkerPool_DropsWhenFull verifies that when the queue is full the pool
// drops overflow packets rather than blocking (backpressure without deadlock).
func TestHEPWorkerPool_DropsWhenFull(t *testing.T) {
	const workers = 1
	const queueSize = 2

	// Block workers so queue fills up fast
	block := make(chan struct{})
	pool := NewHEPWorkerPool(workers, queueSize)
	defer pool.Stop()

	addr, _ := net.ResolveUDPAddr("udp", "127.0.0.1:0")

	submitted := 0
	for i := 0; i < 10; i++ {
		if pool.TrySubmit(packetJob{
			data:       []byte{0x00},
			remoteAddr: addr,
			handler: func(data []byte, remote net.Addr) {
				<-block // hold worker
			},
		}) {
			submitted++
		}
	}
	close(block)

	// Should not panic and submitted count should be ≤ workers + queueSize
	if submitted > workers+queueSize {
		t.Errorf("Expected at most %d submitted (workers+queue), got %d", workers+queueSize, submitted)
	}
}

// TestHEPWorkerPool_StopDrainsAllJobs verifies that after Stop() returns,
// ALL submitted jobs have been processed. Currently Stop() only closes the
// stop channel but doesn't wait for workers to finish draining.
func TestHEPWorkerPool_StopDrainsAllJobs(t *testing.T) {
	const workers = 4
	processed := make(chan struct{}, 100)

	pool := NewHEPWorkerPool(workers, 64)
	addr, _ := net.ResolveUDPAddr("udp", "127.0.0.1:0")

	// Submit 20 jobs
	for i := 0; i < 20; i++ {
		pool.Submit(packetJob{
			data:       []byte{byte(i)},
			remoteAddr: addr,
			handler: func(data []byte, remote net.Addr) {
				time.Sleep(1 * time.Millisecond) // Simulate small work
				processed <- struct{}{}
			},
		})
	}

	// Stop must block until all jobs are drained
	pool.Stop()

	// After Stop returns, all 20 jobs must have been processed
	count := len(processed)
	if count != 20 {
		t.Errorf("After Stop(), expected 20 processed jobs, got %d (Stop didn't wait)", count)
	}
}
