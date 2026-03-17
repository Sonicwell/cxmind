package rtp

import (
	"sync"
	"sync/atomic"
	"time"
)

// JitterScheduler is a global single-goroutine drain coordinator for all
// JitterBuffers. Instead of each JitterBuffer running its own 20ms ticker
// goroutine, they register here and the scheduler drains them all from a
// single goroutine — reducing goroutine count from O(calls) to O(1).
//
// Usage (embedded in Sniffer):
//
//	sched := NewJitterScheduler()
//	go sched.Run(stop)
//	jb := sched.NewManagedJitterBuffer(depth)
//	// when call ends:
//	sched.Unregister(jb)
//	jb.Stop()
type JitterScheduler struct {
	mu      sync.Mutex
	buffers map[*JitterBuffer]struct{}
}

// NewJitterScheduler creates a new JitterScheduler with an empty registry.
func NewJitterScheduler() *JitterScheduler {
	return &JitterScheduler{
		buffers: make(map[*JitterBuffer]struct{}),
	}
}

// NewManagedJitterBuffer creates a JitterBuffer and registers it with the
// scheduler. The returned JitterBuffer does NOT start its own drainLoop
// goroutine — draining is handled by the scheduler.
func (js *JitterScheduler) NewManagedJitterBuffer(depth int) *JitterBuffer {
	if depth <= 0 {
		return nil
	}
	jb := &JitterBuffer{
		packets:  make([]jitterSlot, 0, depth*2),
		depth:    depth,
		outputCh: make(chan JBPacket, depth*2),
		stopCh:   make(chan struct{}),
	}
	// Note: no go jb.drainLoop() — the scheduler handles ticking.
	js.mu.Lock()
	js.buffers[jb] = struct{}{}
	js.mu.Unlock()
	return jb
}

// Register adds an existing JitterBuffer to the scheduler.
// Used when a buffer was created externally and needs scheduler-driven draining.
func (js *JitterScheduler) Register(jb *JitterBuffer) {
	if jb == nil {
		return
	}
	js.mu.Lock()
	js.buffers[jb] = struct{}{}
	js.mu.Unlock()
}

// Unregister removes a JitterBuffer from the scheduler and marks it atomically
// so that any in-flight DrainOnce call returns immediately without processing.
// After this call the buffer will no longer be ticked; the caller is
// responsible for stopping/closing the buffer via jb.Stop().
func (js *JitterScheduler) Unregister(jb *JitterBuffer) {
	if jb == nil {
		return
	}
	// Mark the buffer first (atomic) so any concurrently running DrainOnce exits fast.
	atomic.StoreInt32(&jb.unregistered, 1)
	js.mu.Lock()
	delete(js.buffers, jb)
	js.mu.Unlock()
}

// Run starts the single shared drain loop. It should be called in a goroutine.
// It stops when the stop channel is closed.
func (js *JitterScheduler) Run(stop <-chan struct{}) {
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			js.drainAll()
		case <-stop:
			return
		}
	}
}

// drainAll takes a snapshot of current buffers (under lock) then drains each
// one outside the lock to minimise contention. DrainOnce itself checks the
// atomic unregistered flag and returns immediately for removed buffers.
func (js *JitterScheduler) drainAll() {
	js.mu.Lock()
	snapshot := make([]*JitterBuffer, 0, len(js.buffers))
	for jb := range js.buffers {
		snapshot = append(snapshot, jb)
	}
	js.mu.Unlock()

	for _, jb := range snapshot {
		jb.DrainOnce()
	}
}

// GlobalJitterScheduler is the process-wide JitterScheduler, initialised in
// init() alongside GlobalSniffer. server.go uses this to create managed
// JitterBuffers instead of calling NewJitterBuffer directly.
var GlobalJitterScheduler *JitterScheduler
