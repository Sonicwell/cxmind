package hep

import "sync/atomic"

// ConnectionLimiter provides a bounded semaphore for limiting concurrent connections.
// Unlike a channel-based semaphore, it uses atomic operations for lock-free
// TryAcquire which is critical on the accept() hot path.
type ConnectionLimiter struct {
	active atomic.Int64
	max    int64
}

// NewConnectionLimiter creates a limiter with the given maximum concurrent connections.
func NewConnectionLimiter(max int) *ConnectionLimiter {
	return &ConnectionLimiter{max: int64(max)}
}

// TryAcquire attempts to acquire a connection slot. Returns false if at capacity.
// Lock-free via atomic CAS — safe for concurrent accept loops.
func (cl *ConnectionLimiter) TryAcquire() bool {
	for {
		current := cl.active.Load()
		if current >= cl.max {
			return false
		}
		if cl.active.CompareAndSwap(current, current+1) {
			return true
		}
	}
}

// Release frees a connection slot.
func (cl *ConnectionLimiter) Release() {
	cl.active.Add(-1)
}

// Active returns the current number of active connections.
func (cl *ConnectionLimiter) Active() int {
	return int(cl.active.Load())
}
