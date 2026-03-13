package rtp

import (
	"sync"
	"testing"
	"time"
)

// TestDeadlockInjectRTPAndStop simulates the deadlock scenario:
// One goroutine constantly calls InjectRTP (which acquires stream.mu).
// Another goroutine calls StopListenerByCallID (which iterates via sync.Map.Range).
// With sync.Map there's no global s.mu to deadlock against.
func TestDeadlockInjectRTPAndStop(t *testing.T) {
	// Setup a local sniffer (sync.Map zero-value is ready to use)
	sniffer := &Sniffer{
		stop: make(chan struct{}),
	}

	callID := "test-deadlock-call"
	srcIP := "192.168.1.100"

	// Pre-populate a virtual listener
	// We manually add it to avoid Redis dependencies in StartVirtualListener
	stream := &RTPStream{
		callID:       callID,
		stream:       nil,
		isRTCP:       false,
		lastActivity: time.Now().UnixNano(),
		vad:          NewVAD(),
		agentID:      "test-agent",
	}

	key := callID + ":" + srcIP
	sniffer.virtualListeners.Store(key, stream)

	// Parameters
	params := struct {
		injectCount int
		stopDelay   time.Duration
	}{
		injectCount: 1000,
		stopDelay:   10 * time.Millisecond,
	}

	var wg sync.WaitGroup
	wg.Add(2)

	// Goroutine 1: Rapidly inject RTP
	go func() {
		defer wg.Done()
		for i := 0; i < params.injectCount; i++ {
			// Simulate the locking pattern of InjectRTP — lock stream.mu
			stream.mu.Lock()
			time.Sleep(10 * time.Microsecond) // Simulate work
			stream.mu.Unlock()
		}
	}()

	// Goroutine 2: Stop listener
	go func() {
		defer wg.Done()
		time.Sleep(params.stopDelay)
		// With sync.Map, this uses Range instead of s.mu.Lock()
		sniffer.StopListenerByCallID(callID)
	}()

	// Watchdog to detect deadlock
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		t.Log("Test finished successfully - No deadlock detected")
	case <-time.After(2 * time.Second):
		t.Fatal("Test timed out! Possible DEADLOCK detected between injection and stop.")
	}
}
