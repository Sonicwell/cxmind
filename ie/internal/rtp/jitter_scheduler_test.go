package rtp

import (
	"runtime"
	"testing"
	"time"
)

// TestJitterScheduler_SingleGoroutine verifies that N JitterBuffers managed
// by JitterScheduler produce only O(1) goroutines, not O(N).
//
// TDD Red: this test will fail before JitterScheduler is implemented because
// NewJitterBuffer currently launches one goroutine per buffer.
func TestJitterScheduler_SingleGoroutine(t *testing.T) {
	const N = 50

	baseGoroutines := runtime.NumGoroutine()

	sched := NewJitterScheduler()
	stop := make(chan struct{})
	go sched.Run(stop)
	defer close(stop)

	// Create N jitter buffers via scheduler (NOT the old NewJitterBuffer which
	// spawns its own drainLoop goroutine).
	jbs := make([]*JitterBuffer, N)
	for i := range jbs {
		jbs[i] = sched.NewManagedJitterBuffer(3)
	}

	// Give goroutines time to start
	time.Sleep(50 * time.Millisecond)
	runtime.Gosched()

	after := runtime.NumGoroutine()
	delta := after - baseGoroutines

	// With JitterScheduler: delta should be ~1 (just the sched.Run goroutine).
	// Without it: delta would be N+1.
	if delta > 3 {
		t.Errorf("Expected ≤3 new goroutines for %d JitterBuffers (shared scheduler), got %d", N, delta)
	}

	// Cleanup
	for _, jb := range jbs {
		sched.Unregister(jb)
		jb.Stop()
	}
}

// TestJitterScheduler_DrainsContinuously verifies that packets pushed to a
// managed JitterBuffer are drained by the scheduler at the expected cadence.
func TestJitterScheduler_DrainsContinuously(t *testing.T) {
	sched := NewJitterScheduler()
	stop := make(chan struct{})
	go sched.Run(stop)
	defer close(stop)

	jb := sched.NewManagedJitterBuffer(2) // depth=2 → drain when 2+ packets present
	defer jb.Stop()

	// Build a valid 4-byte RTP packet with sequence number
	makeRTPPkt := func(seq uint16) []byte {
		pkt := make([]byte, 12) // minimal RTP header
		pkt[0] = 0x80           // V=2
		pkt[1] = 0x00           // PT=0 (PCMU)
		pkt[2] = byte(seq >> 8)
		pkt[3] = byte(seq)
		return pkt
	}

	// Push depth+1 packets so drain fires
	for i := uint16(0); i < 3; i++ {
		jb.Push(makeRTPPkt(i), 0, uint32(i)*160)
	}

	// Wait up to 100ms for drain (2× the 20ms tick)
	select {
	case pkt := <-jb.Output():
		if len(pkt.Data) == 0 {
			t.Error("received empty packet")
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("JitterScheduler did not drain packets within 100ms")
	}
}

// TestJitterScheduler_UnregisterStopsDrain verifies that after Unregister,
// the buffer is no longer ticked by the scheduler.
func TestJitterScheduler_UnregisterStopsDrain(t *testing.T) {
	sched := NewJitterScheduler()
	stop := make(chan struct{})
	go sched.Run(stop)
	defer close(stop)

	jb := sched.NewManagedJitterBuffer(2)
	sched.Unregister(jb)

	// Wait two full tick cycles (2 × 20ms) so any in-flight drainAll
	// that already had jb in its snapshot has finished before we push.
	time.Sleep(50 * time.Millisecond)

	makeRTPPkt := func(seq uint16) []byte {
		pkt := make([]byte, 12)
		pkt[0] = 0x80
		pkt[2] = byte(seq >> 8)
		pkt[3] = byte(seq)
		return pkt
	}

	// Push packets AFTER the grace period — should NOT be drained since we unregistered.
	// Push only depth-1 = 2 packets so Push() doesn't trigger its own emergency drain
	// (which fires at depth*2 = 4 packets). We're testing scheduler behaviour, not Push.
	for i := uint16(0); i < 2; i++ {
		jb.Push(makeRTPPkt(i), 0, uint32(i)*160)
	}

	select {
	case <-jb.Output():
		t.Error("unregistered JitterBuffer should not drain via scheduler")
	case <-time.After(80 * time.Millisecond):
		// Expected: no drain
	}

	jb.Stop()
}
