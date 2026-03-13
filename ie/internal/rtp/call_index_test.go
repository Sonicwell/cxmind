package rtp

import (
	"sync"
	"testing"
	"time"
)

// newTestSniffer creates a Sniffer for testing.
// sync.Map zero-value is ready to use — no explicit initialization needed.
// Uses NewSniffer to ensure Tombstone GC architecture is correctly set up.
func newTestSniffer() *Sniffer {
	return NewSniffer()
}

// syncMapLen counts entries in a sync.Map (for test assertions).
func syncMapLen(m *sync.Map) int {
	count := 0
	m.Range(func(_, _ any) bool {
		count++
		return true
	})
	return count
}

func TestCallIndex_BasicLookup(t *testing.T) {
	s := newTestSniffer()

	// Add a physical listener
	stream := &RTPStream{callID: "call-A", lastActivity: time.Now().UnixNano()}
	s.listeners.Store(5060, stream)
	s.callIndex.Store("call-A", stream)

	// Lookup should return O(1)
	found, ok := s.GetStreamByCallID("call-A")
	if !ok {
		t.Fatal("expected to find call-A")
	}
	if found.callID != "call-A" {
		t.Errorf("expected callID call-A, got %s", found.callID)
	}
}

func TestCallIndex_SkipsRTCP(t *testing.T) {
	s := newTestSniffer()

	// Add RTCP stream — should NOT be indexed
	rtcpStream := &RTPStream{callID: "call-B", isRTCP: true, lastActivity: time.Now().UnixNano()}
	s.listeners.Store(5061, rtcpStream)
	// Intentionally don't add to callIndex (RTCP streams should never be indexed)

	// Add RTP stream
	rtpStream := &RTPStream{callID: "call-B", isRTCP: false, lastActivity: time.Now().UnixNano()}
	s.listeners.Store(5060, rtpStream)
	s.callIndex.Store("call-B", rtpStream)

	found, ok := s.GetStreamByCallID("call-B")
	if !ok {
		t.Fatal("expected to find call-B")
	}
	if found.isRTCP {
		t.Error("should return RTP stream, not RTCP")
	}
}

func TestCallIndex_NotFound(t *testing.T) {
	s := newTestSniffer()

	_, ok := s.GetStreamByCallID("nonexistent")
	if ok {
		t.Error("expected not to find nonexistent call")
	}
}

func TestCallIndex_VirtualListener(t *testing.T) {
	s := newTestSniffer()

	// Add virtual listener
	stream := &RTPStream{callID: "call-C", lastActivity: time.Now().UnixNano()}
	s.virtualListeners.Store("call-C:192.168.1.1", stream)
	s.callIndex.Store("call-C", stream)

	found, ok := s.GetStreamByCallID("call-C")
	if !ok {
		t.Fatal("expected to find call-C")
	}
	if found.callID != "call-C" {
		t.Errorf("expected callID call-C, got %s", found.callID)
	}
}

func TestCallIndex_RemovedAfterStop(t *testing.T) {
	s := newTestSniffer()

	// Add and index
	stream := &RTPStream{callID: "call-D", lastActivity: time.Now().UnixNano()}
	s.listeners.Store(5070, stream)
	s.callIndex.Store("call-D", stream)

	// Simulate StopListenerByCallID removing index
	s.callIndex.Delete("call-D")
	s.listeners.Delete(5070)

	_, ok := s.GetStreamByCallID("call-D")
	if ok {
		t.Error("expected call-D to be removed after stop")
	}
}

func TestCallIndex_MultipleCallsIndependent(t *testing.T) {
	s := newTestSniffer()

	streamA := &RTPStream{callID: "call-X", lastActivity: time.Now().UnixNano()}
	streamB := &RTPStream{callID: "call-Y", lastActivity: time.Now().UnixNano()}
	s.listeners.Store(5060, streamA)
	s.listeners.Store(5062, streamB)
	s.callIndex.Store("call-X", streamA)
	s.callIndex.Store("call-Y", streamB)

	// Both lookups should work
	foundA, ok := s.GetStreamByCallID("call-X")
	if !ok || foundA.callID != "call-X" {
		t.Error("failed to find call-X")
	}

	foundB, ok := s.GetStreamByCallID("call-Y")
	if !ok || foundB.callID != "call-Y" {
		t.Error("failed to find call-Y")
	}

	// Remove one, other should still work
	s.callIndex.Delete("call-X")
	_, ok = s.GetStreamByCallID("call-X")
	if ok {
		t.Error("call-X should be removed")
	}
	_, ok = s.GetStreamByCallID("call-Y")
	if !ok {
		t.Error("call-Y should still exist")
	}
}
