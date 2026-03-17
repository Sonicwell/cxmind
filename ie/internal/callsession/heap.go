package callsession

import (
	"sync/atomic"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// CallSession represents an active SIP session in memory
type CallSession struct {
	CallID         string
	SessionExpires int // Negotiated session expiration in seconds
	// Use atomic fields for lock-free fast-path updates
	LastSipMsgNano int64 // atomic UnixNano
	ExpiresAtNano  int64 // atomic UnixNano

	// Used only by the heap under SessionManager.mu to track min time
	heapExpiresAt time.Time
	heapIndex     int // Index in the heap for O(1) removal/update
}

// LastSipMsg returns the atomic timestamp
func (c *CallSession) LastSipMsg() time.Time {
	return timeutil.Unix(0, atomic.LoadInt64(&c.LastSipMsgNano))
}

// ExpiresAt returns the atomic expiration
func (c *CallSession) ExpiresAt() time.Time {
	return timeutil.Unix(0, atomic.LoadInt64(&c.ExpiresAtNano))
}

// TimeoutHeap implements heap.Interface for a min-heap of CallSessions based on ExpiresAt
type TimeoutHeap []*CallSession

func (h TimeoutHeap) Len() int           { return len(h) }
func (h TimeoutHeap) Less(i, j int) bool { return h[i].heapExpiresAt.Before(h[j].heapExpiresAt) }
func (h TimeoutHeap) Swap(i, j int) {
	h[i], h[j] = h[j], h[i]
	h[i].heapIndex = i
	h[j].heapIndex = j
}

func (h *TimeoutHeap) Push(x interface{}) {
	n := len(*h)
	session := x.(*CallSession)
	session.heapIndex = n
	*h = append(*h, session)
}

func (h *TimeoutHeap) Pop() interface{} {
	old := *h
	n := len(old)
	session := old[n-1]
	old[n-1] = nil // Avoid memory leak
	session.heapIndex = -1
	*h = old[0 : n-1]
	return session
}
