package rtp

import (
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSnifferStats_Empty(t *testing.T) {
	s := &Sniffer{
		stop: make(chan struct{}),
	}

	stats := s.Stats()

	assert.Equal(t, 0, stats.PortListeners)
	assert.Equal(t, 0, stats.VirtualListeners)
	assert.Equal(t, 0, stats.ActiveCalls)
}

func TestSnifferStats_WithEntries(t *testing.T) {
	s := &Sniffer{
		stop: make(chan struct{}),
	}

	// Add port listeners
	s.listeners.Store(5060, &RTPStream{callID: "call-1"})
	s.listeners.Store(5062, &RTPStream{callID: "call-2"})
	s.listeners.Store(5064, &RTPStream{callID: "call-3"})

	// Add virtual listeners
	s.virtualListeners.Store("call-1:192.168.1.1", &RTPStream{callID: "call-1"})
	s.virtualListeners.Store("call-2:192.168.1.2", &RTPStream{callID: "call-2"})

	// Add call index entries
	s.callIndex.Store("call-1", &RTPStream{callID: "call-1"})
	s.callIndex.Store("call-2", &RTPStream{callID: "call-2"})

	stats := s.Stats()

	assert.Equal(t, 3, stats.PortListeners)
	assert.Equal(t, 2, stats.VirtualListeners)
	assert.Equal(t, 2, stats.ActiveCalls)
}

func TestSnifferStats_ConcurrentAccess(t *testing.T) {
	s := &Sniffer{
		stop: make(chan struct{}),
	}

	s.listeners.Store(5060, &RTPStream{callID: "call-1"})
	s.callIndex.Store("call-1", &RTPStream{callID: "call-1"})

	// Verify Stats() is safe to call concurrently with Store/Delete
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = s.Stats()
		}()
	}
	wg.Wait()
}
