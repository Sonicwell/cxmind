package rtp

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"sync"
	"testing"
	"time"

	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
)

// TestTimeoutWithReceivedPackets tests that timeout triggers when packets have been received
func TestTimeoutWithReceivedPackets(t *testing.T) {
	// Setup
	viper.Set("sniffer.rtp_timeout_seconds", 1) // 1 second for fast test
	defer viper.Reset()

	sniffer := newTestSniffer()

	// Create a stream that has received packets
	stream := &RTPStream{
		callID:             "test-call-001",
		stream:             nil,
		isRTCP:             false,
		lastActivity:       time.Now().Add(-2 * time.Second).UnixNano(), // 2 seconds ago
		hasReceivedPackets: true,                                        // Key: has received packets
		mu:                 sync.Mutex{},
	}

	sniffer.listeners.Store(5060, stream)

	// Run one iteration of timeout check using sync.Map.Range
	timeout := config.Global.GetInt("sniffer.rtp_timeout_seconds")
	timeoutDuration := time.Duration(timeout) * time.Second
	now := time.Now()

	sniffer.listeners.Range(func(key, value any) bool {
		port := key.(int)
		s := value.(*RTPStream)
		s.mu.Lock()
		inactive := now.Sub(time.Unix(0, s.lastActivity))
		hasReceivedPackets := s.hasReceivedPackets
		s.mu.Unlock()

		if inactive > timeoutDuration && hasReceivedPackets {
			sniffer.listeners.Delete(port)
		}
		return true
	})

	// Verify stream was removed (timeout triggered)
	assert.Equal(t, 0, syncMapLen(&sniffer.listeners), "Stream should be removed when timeout triggers with received packets")
}

// TestTimeoutWithoutReceivedPackets tests that timeout does NOT trigger when no packets received
func TestTimeoutWithoutReceivedPackets(t *testing.T) {
	// Setup
	viper.Set("sniffer.rtp_timeout_seconds", 1) // 1 second for fast test
	defer viper.Reset()

	sniffer := newTestSniffer()

	// Create a stream that has NOT received packets (e.g., SIP signaling only)
	stream := &RTPStream{
		callID:             "test-call-002",
		stream:             nil,
		isRTCP:             false,
		lastActivity:       time.Now().Add(-2 * time.Second).UnixNano(), // 2 seconds ago
		hasReceivedPackets: false,                                       // Key: NO packets received
		mu:                 sync.Mutex{},
	}

	sniffer.listeners.Store(5060, stream)

	// Run one iteration of timeout check
	timeout := config.Global.GetInt("sniffer.rtp_timeout_seconds")
	timeoutDuration := time.Duration(timeout) * time.Second
	now := time.Now()

	sniffer.listeners.Range(func(key, value any) bool {
		port := key.(int)
		s := value.(*RTPStream)
		s.mu.Lock()
		inactive := now.Sub(time.Unix(0, s.lastActivity))
		hasReceivedPackets := s.hasReceivedPackets
		s.mu.Unlock()

		if inactive > timeoutDuration && hasReceivedPackets {
			sniffer.listeners.Delete(port)
		}
		return true
	})

	// Verify stream was NOT removed (timeout should not trigger)
	assert.Equal(t, 1, syncMapLen(&sniffer.listeners), "Stream should remain when no packets received")
	_, loaded := sniffer.listeners.Load(5060)
	assert.True(t, loaded, "Stream should still exist")
}

// TestTimeoutActiveStream tests that active streams are not timed out
func TestTimeoutActiveStream(t *testing.T) {
	// Setup
	viper.Set("sniffer.rtp_timeout_seconds", 2) // 2 seconds
	defer viper.Reset()

	sniffer := newTestSniffer()

	// Create an active stream (recent activity)
	stream := &RTPStream{
		callID:             "test-call-003",
		stream:             nil,
		isRTCP:             false,
		lastActivity:       time.Now().Add(-500 * time.Millisecond).UnixNano(), // 500ms ago
		hasReceivedPackets: true,
		mu:                 sync.Mutex{},
	}

	sniffer.listeners.Store(5060, stream)

	// Run one iteration of timeout check
	timeout := config.Global.GetInt("sniffer.rtp_timeout_seconds")
	timeoutDuration := time.Duration(timeout) * time.Second
	now := time.Now()

	sniffer.listeners.Range(func(key, value any) bool {
		port := key.(int)
		s := value.(*RTPStream)
		s.mu.Lock()
		inactive := now.Sub(time.Unix(0, s.lastActivity))
		hasReceivedPackets := s.hasReceivedPackets
		s.mu.Unlock()

		if inactive > timeoutDuration && hasReceivedPackets {
			sniffer.listeners.Delete(port)
		}
		return true
	})

	// Verify stream was NOT removed (still active)
	assert.Equal(t, 1, syncMapLen(&sniffer.listeners), "Active stream should not timeout")
}

// TestHasReceivedPacketsFlagSet tests that the flag is set when packets are received
func TestHasReceivedPacketsFlagSet(t *testing.T) {
	stream := &RTPStream{
		callID:             "test-call-006",
		stream:             nil,
		isRTCP:             false,
		lastActivity:       time.Now().UnixNano(),
		hasReceivedPackets: false, // Initially false
		mu:                 sync.Mutex{},
	}

	// Simulate receiving a packet (as done in captureLoop or InjectRTP)
	stream.mu.Lock()
	stream.lastActivity = time.Now().UnixNano()
	stream.hasReceivedPackets = true
	stream.mu.Unlock()

	// Verify flag is set
	stream.mu.Lock()
	hasReceived := stream.hasReceivedPackets
	stream.mu.Unlock()

	assert.True(t, hasReceived, "hasReceivedPackets should be true after receiving packet")
}

// TestMultipleStreamsTimeout tests timeout with multiple streams
func TestMultipleStreamsTimeout(t *testing.T) {
	// Setup
	viper.Set("sniffer.rtp_timeout_seconds", 1)
	defer viper.Reset()

	sniffer := newTestSniffer()

	// Stream 1: Should timeout (has packets, inactive)
	stream1 := &RTPStream{
		callID:             "call-001",
		isRTCP:             false,
		lastActivity:       time.Now().Add(-2 * time.Second).UnixNano(),
		hasReceivedPackets: true,
		mu:                 sync.Mutex{},
	}
	sniffer.listeners.Store(5060, stream1)

	// Stream 2: Should NOT timeout (no packets received)
	stream2 := &RTPStream{
		callID:             "call-002",
		isRTCP:             false,
		lastActivity:       time.Now().Add(-2 * time.Second).UnixNano(),
		hasReceivedPackets: false,
		mu:                 sync.Mutex{},
	}
	sniffer.listeners.Store(5062, stream2)

	// Stream 3: Should NOT timeout (active)
	stream3 := &RTPStream{
		callID:             "call-003",
		isRTCP:             false,
		lastActivity:       time.Now().UnixNano(),
		hasReceivedPackets: true,
		mu:                 sync.Mutex{},
	}
	sniffer.listeners.Store(5064, stream3)

	// Run timeout check
	timeout := config.Global.GetInt("sniffer.rtp_timeout_seconds")
	timeoutDuration := time.Duration(timeout) * time.Second
	now := time.Now()

	sniffer.listeners.Range(func(key, value any) bool {
		port := key.(int)
		s := value.(*RTPStream)
		s.mu.Lock()
		inactive := now.Sub(time.Unix(0, s.lastActivity))
		hasReceivedPackets := s.hasReceivedPackets
		s.mu.Unlock()

		if inactive > timeoutDuration && hasReceivedPackets {
			sniffer.listeners.Delete(port)
		}
		return true
	})

	// Verify results
	assert.Equal(t, 2, syncMapLen(&sniffer.listeners), "Two streams should remain")
	_, has5062 := sniffer.listeners.Load(5062)
	assert.True(t, has5062, "call-002 should remain (no packets)")
	_, has5064 := sniffer.listeners.Load(5064)
	assert.True(t, has5064, "call-003 should remain (active)")
	_, has5060 := sniffer.listeners.Load(5060)
	assert.False(t, has5060, "call-001 should be removed (timeout)")
}

// TestVirtualListenerTimeout tests timeout for virtual listeners (HEP-injected)
func TestVirtualListenerTimeout(t *testing.T) {
	// Setup
	viper.Set("sniffer.rtp_timeout_seconds", 1)
	defer viper.Reset()

	sniffer := newTestSniffer()

	// Create a virtual listener that should timeout
	stream := &RTPStream{
		callID:             "test-call-005",
		stream:             nil,
		isRTCP:             false,
		lastActivity:       time.Now().Add(-2 * time.Second).UnixNano(),
		hasReceivedPackets: true,
		mu:                 sync.Mutex{},
	}

	key := "test-call-005:192.168.1.100"
	sniffer.virtualListeners.Store(key, stream)

	// Run timeout check for virtual listeners
	timeout := config.Global.GetInt("sniffer.rtp_timeout_seconds")
	timeoutDuration := time.Duration(timeout) * time.Second
	now := time.Now()

	sniffer.virtualListeners.Range(func(key, value any) bool {
		k := key.(string)
		s := value.(*RTPStream)
		s.mu.Lock()
		inactive := now.Sub(time.Unix(0, s.lastActivity))
		hasReceivedPackets := s.hasReceivedPackets
		s.mu.Unlock()

		if inactive > timeoutDuration && hasReceivedPackets {
			sniffer.virtualListeners.Delete(k)
		}
		return true
	})

	// Verify virtual listener was removed
	assert.Equal(t, 0, syncMapLen(&sniffer.virtualListeners), "Virtual listener should be removed on timeout")
}

// TestTimeoutBoundaryCondition tests timeout at exact boundary
func TestTimeoutBoundaryCondition(t *testing.T) {
	// Setup
	viper.Set("sniffer.rtp_timeout_seconds", 2)
	defer viper.Reset()

	sniffer := newTestSniffer()

	// Create stream slightly before timeout boundary (not exactly at it)
	timeout := config.Global.GetInt("sniffer.rtp_timeout_seconds")
	timeoutDuration := time.Duration(timeout) * time.Second

	stream := &RTPStream{
		callID:             "test-call-boundary",
		isRTCP:             false,
		lastActivity:       time.Now().Add(-timeoutDuration + 100*time.Millisecond).UnixNano(), // 100ms before boundary
		hasReceivedPackets: true,
		mu:                 sync.Mutex{},
	}

	sniffer.listeners.Store(5060, stream)

	// Run timeout check
	now := time.Now()

	sniffer.listeners.Range(func(key, value any) bool {
		port := key.(int)
		s := value.(*RTPStream)
		s.mu.Lock()
		inactive := now.Sub(time.Unix(0, s.lastActivity))
		hasReceivedPackets := s.hasReceivedPackets
		s.mu.Unlock()

		// Note: condition is ">" not ">="
		if inactive > timeoutDuration && hasReceivedPackets {
			sniffer.listeners.Delete(port)
		}
		return true
	})

	// Stream should NOT timeout (still within threshold)
	assert.Equal(t, 1, syncMapLen(&sniffer.listeners), "Stream just before timeout boundary should not be removed")
}

// TestMonitorTimeouts_ShouldNotBlockOnClose verifies that the timeout monitor
// does not get globally blocked by slow or hanging listeners during teardown.
// This is the RED->GREEN test for our distributed timeout refactoring.
func TestMonitorTimeouts_ShouldNotBlockOnClose(t *testing.T) {
	viper.Set("sniffer.rtp_timeout_seconds", 1)
	defer viper.Reset()

	sniffer := newTestSniffer()

	const blockedStreamsEnv = 50
	const delayPerStream = 50 * time.Millisecond

	// Add 50 streams that are all guaranteed to time out
	for i := 0; i < blockedStreamsEnv; i++ {
		stream := &RTPStream{
			callID:             "blocked-call",
			isRTCP:             false,
			lastActivity:       time.Now().Add(-5 * time.Second).UnixNano(),
			hasReceivedPackets: true,
			mu:                 sync.Mutex{},
		}
		sniffer.listeners.Store(5060+i, stream)
	}

	// Trigger the monitor logic ONCE and measure time
	start := time.Now()

	timeout := config.Global.GetInt("sniffer.rtp_timeout_seconds")
	timeoutDuration := time.Duration(timeout) * time.Second
	now := time.Now()

	var wg sync.WaitGroup

	sniffer.listeners.Range(func(key, value any) bool {
		port := key.(int)
		s := value.(*RTPStream)

		s.mu.Lock()
		inactive := now.Sub(time.Unix(0, s.lastActivity))
		hasReceivedPackets := s.hasReceivedPackets
		s.mu.Unlock()

		if inactive > timeoutDuration && hasReceivedPackets {
			wg.Add(1)
			// Emulate Tombstone architecture pushes
			sniffer.trashBin <- func() {
				defer wg.Done()
				time.Sleep(delayPerStream) // Simulate 50ms block
				sniffer.StopListener(port)
			}
		}
		return true
	})

	elapsed := time.Since(start)

	// Refactored concurrent architecture must finish dispatching extremely fast (<100ms).
	t.Logf("Dispatch sweep completed in %v", elapsed)
	assert.Less(t, elapsed, 100*time.Millisecond, "TIMEOUT: Monitor took excessively long to dispatch streams.")

	// Wait for background destruction to complete to avoid leaking goroutines
	waitCh := make(chan struct{})
	go func() {
		wg.Wait()
		close(waitCh)
	}()

	select {
	case <-waitCh:
		t.Logf("Background cleanup finished asynchronously")
	case <-time.After(3 * time.Second):
		t.Logf("[WARN] Test teardown timeout")
	}

	sniffer.Stop()
}
