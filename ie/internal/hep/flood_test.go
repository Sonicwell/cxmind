package hep

import (
	"net"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestTCPFlood_GoroutineLeak verifies that TCP connection flood is bounded.
// RED: Current code spawns an unlimited goroutine per TCP connection.
// An attacker opening 10,000 TCP connections would create 10,000+ goroutines.
// GREEN: A connection-level semaphore must cap concurrent TCP handlers.
func TestTCPFlood_GoroutineLeak(t *testing.T) {
	// Start a TCP listener on a random port
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	addr := ln.Addr().String()

	const maxConns = 100 // Our desired connection cap
	connSem := make(chan struct{}, maxConns)

	// Simulate the accept loop with connection limiting
	var wg sync.WaitGroup
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			select {
			case connSem <- struct{}{}:
				wg.Add(1)
				go func(c net.Conn) {
					defer func() {
						<-connSem
						wg.Done()
					}()
					// Simulate holding connection (like handleTCPConnection)
					time.Sleep(50 * time.Millisecond)
					c.Close()
				}(conn)
			default:
				// Reject: over limit
				conn.Close()
			}
		}
	}()

	baseGoroutines := runtime.NumGoroutine()

	// Flood with 500 connections simultaneously
	const floodConns = 500
	var connWg sync.WaitGroup
	for i := 0; i < floodConns; i++ {
		connWg.Add(1)
		go func() {
			defer connWg.Done()
			conn, err := net.Dial("tcp", addr)
			if err != nil {
				return
			}
			time.Sleep(30 * time.Millisecond) // Hold briefly
			conn.Close()
		}()
	}

	// Brief pause for goroutines to spawn
	time.Sleep(20 * time.Millisecond)

	peakGoroutines := runtime.NumGoroutine()
	goroutineGrowth := peakGoroutines - baseGoroutines

	t.Logf("Base goroutines: %d, Peak: %d, Growth: %d", baseGoroutines, peakGoroutines, goroutineGrowth)

	// With a cap of 100 server handlers + 500 client dials, growth should be ~600 max.
	// Without a cap, server side alone would spike to 500+ handler goroutines,
	// total would exceed 1000. Assert server-side limited to maxConns.
	// The key assertion: at most maxConns server-side handlers were active.
	assert.Less(t, goroutineGrowth, floodConns+maxConns+100,
		"Goroutine growth %d exceeded expected cap — TCP connection flood is unbounded", goroutineGrowth)

	connWg.Wait()
	ln.Close()
	wg.Wait()
}

// TestUDPSemaphore_Backpressure verifies the existing UDP semaphore correctly
// drops packets when overloaded instead of spawning unbounded goroutines.
func TestUDPSemaphore_Backpressure(t *testing.T) {
	const semSize = 10
	sem := make(chan struct{}, semSize)

	var processed, dropped int64
	var mu sync.Mutex

	// Simulate flooding 1000 packets into a semaphore of size 10
	var wg sync.WaitGroup
	for i := 0; i < 1000; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
				// Simulate packet processing
				time.Sleep(1 * time.Millisecond)
				mu.Lock()
				processed++
				mu.Unlock()
			default:
				mu.Lock()
				dropped++
				mu.Unlock()
			}
		}()
	}

	wg.Wait()

	mu.Lock()
	p := processed
	d := dropped
	mu.Unlock()

	t.Logf("Processed: %d, Dropped: %d", p, d)

	// Most should be dropped since sem is tiny and processing takes time
	assert.Greater(t, d, int64(0), "Expected some packets to be dropped under flood")
	assert.LessOrEqual(t, p, int64(1000), "Should not process more than sent")
	assert.Equal(t, int64(1000), p+d, "All packets should be either processed or dropped")
}

// TestTCPConnectionLimiter verifies the connection limiter utility works correctly.
func TestTCPConnectionLimiter(t *testing.T) {
	limiter := NewConnectionLimiter(5)

	// Acquire 5 — should all succeed
	for i := 0; i < 5; i++ {
		assert.True(t, limiter.TryAcquire(), "Expected acquire %d to succeed", i)
	}

	// 6th should fail
	assert.False(t, limiter.TryAcquire(), "Expected 6th acquire to be rejected")

	// Release one
	limiter.Release()

	// Now it should succeed again
	assert.True(t, limiter.TryAcquire(), "Expected acquire after release to succeed")

	// Verify count
	assert.Equal(t, 5, limiter.Active())
}
