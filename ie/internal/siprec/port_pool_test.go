package siprec

import (
	"sync"
	"testing"
)

// ========================================================================
// Phase 4 TDD Tests — RTP Port Pool
// ========================================================================

func TestPortPool_AllocateAndRelease(t *testing.T) {
	pool := NewPortPool(30000, 30010)

	port, err := pool.Allocate("call-1")
	if err != nil {
		t.Fatalf("Allocate error: %v", err)
	}
	if port < 30000 || port > 30010 {
		t.Errorf("port %d out of range [30000, 30010]", port)
	}

	pool.Release(port)

	// Should be able to allocate again after release
	port2, err := pool.Allocate("call-2")
	if err != nil {
		t.Fatalf("Allocate error after release: %v", err)
	}
	if port2 != port {
		t.Logf("reused port %d (expected %d — OK if different due to ordering)", port2, port)
	}
	pool.Release(port2)
}

func TestPortPool_Exhaustion(t *testing.T) {
	// Only 3 even ports: 30000, 30002, 30004
	pool := NewPortPool(30000, 30005)

	var allocated []int
	// Allocate all available ports (only even ports: 30000, 30002, 30004)
	for i := 0; i < 3; i++ {
		port, err := pool.Allocate("call-" + string(rune('a'+i)))
		if err != nil {
			t.Fatalf("Allocate %d error: %v", i, err)
		}
		allocated = append(allocated, port)
	}

	// Next allocation should fail
	_, err := pool.Allocate("call-overflow")
	if err == nil {
		t.Error("expected error for exhausted pool, got nil")
	}

	// Release one and retry
	pool.Release(allocated[0])
	port, err := pool.Allocate("call-retry")
	if err != nil {
		t.Fatalf("Allocate after release error: %v", err)
	}
	if port != allocated[0] {
		t.Logf("got port %d after release (OK)", port)
	}
	pool.Release(port)
}

func TestPortPool_AllocatePair(t *testing.T) {
	pool := NewPortPool(30000, 30020)

	p1, p2, err := pool.AllocatePair("call-pair")
	if err != nil {
		t.Fatalf("AllocatePair error: %v", err)
	}

	if p1%2 != 0 {
		t.Errorf("port1 %d is not even", p1)
	}
	if p2%2 != 0 {
		t.Errorf("port2 %d is not even", p2)
	}
	if p1 == p2 {
		t.Errorf("ports should be different: p1=%d p2=%d", p1, p2)
	}

	pool.ReleasePair(p1, p2)
}

func TestPortPool_ConcurrentAllocate(t *testing.T) {
	pool := NewPortPool(30000, 30200)

	var wg sync.WaitGroup
	errCh := make(chan error, 50)
	portCh := make(chan int, 50)

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			port, err := pool.Allocate("call-" + string(rune(idx)))
			if err != nil {
				errCh <- err
				return
			}
			portCh <- port
		}(i)
	}

	wg.Wait()
	close(errCh)
	close(portCh)

	for err := range errCh {
		t.Errorf("concurrent allocate error: %v", err)
	}

	// Check no duplicate ports
	seen := make(map[int]bool)
	for port := range portCh {
		if seen[port] {
			t.Errorf("duplicate port allocated: %d", port)
		}
		seen[port] = true
		pool.Release(port)
	}
}

func TestPortPool_ReleaseIdempotent(t *testing.T) {
	pool := NewPortPool(30000, 30010)

	port, err := pool.Allocate("call-1")
	if err != nil {
		t.Fatalf("error: %v", err)
	}

	// Double release should not panic
	pool.Release(port)
	pool.Release(port) // idempotent
}
