package rtp

import (
	"testing"
	"time"

	hrOpus "github.com/hraban/opus"
)

// TestStopListenerByCallID_UsesIndex verifies that StopListenerByCallID uses
// the callStreamRefs index for O(1) lookup instead of scanning all listeners (fix #6).
func TestStopListenerByCallID_Physical(t *testing.T) {
	s := newTestSniffer()

	// Add two calls with physical listeners
	streamA1 := &RTPStream{callID: "call-A", lastActivity: time.Now().UnixNano()}
	streamA2 := &RTPStream{callID: "call-A", isRTCP: true, lastActivity: time.Now().UnixNano()}
	streamB := &RTPStream{callID: "call-B", lastActivity: time.Now().UnixNano()}

	s.listeners.Store(5060, streamA1)
	s.listeners.Store(5061, streamA2)
	s.listeners.Store(5080, streamB)

	// Register refs for call-A
	s.addStreamRef("call-A", streamRef{isVirtual: false, portKey: 5060})
	s.addStreamRef("call-A", streamRef{isVirtual: false, portKey: 5061})
	// Register refs for call-B (should be untouched)
	s.addStreamRef("call-B", streamRef{isVirtual: false, portKey: 5080})
	s.callIndex.Store("call-A", streamA1)
	s.callIndex.Store("call-B", streamB)

	// Stop call-A
	s.StopListenerByCallID("call-A")

	// call-A listeners should be gone
	if _, ok := s.listeners.Load(5060); ok {
		t.Error("port 5060 should be removed after stopping call-A")
	}
	if _, ok := s.listeners.Load(5061); ok {
		t.Error("port 5061 should be removed after stopping call-A")
	}

	// call-B should still exist
	if _, ok := s.listeners.Load(5080); !ok {
		t.Error("port 5080 should still exist (call-B)")
	}

	// callIndex cleaned for A
	if _, ok := s.GetStreamByCallID("call-A"); ok {
		t.Error("call-A should be removed from callIndex")
	}

	// callStreamRefs cleaned for A
	if _, ok := s.callStreamRefs.Load("call-A"); ok {
		t.Error("callStreamRefs should be cleaned for call-A")
	}
}

// TestStopListenerByCallID_Virtual verifies index-based removal of virtual listeners.
func TestStopListenerByCallID_Virtual(t *testing.T) {
	s := newTestSniffer()

	stream := &RTPStream{callID: "call-V", lastActivity: time.Now().UnixNano()}
	s.virtualListeners.Store("call-V:10.0.0.1", stream)
	s.addStreamRef("call-V", streamRef{isVirtual: true, virtualKey: "call-V:10.0.0.1"})
	s.callIndex.Store("call-V", stream)

	s.StopListenerByCallID("call-V")

	if _, ok := s.virtualListeners.Load("call-V:10.0.0.1"); ok {
		t.Error("virtual listener should be removed")
	}
	if _, ok := s.callStreamRefs.Load("call-V"); ok {
		t.Error("callStreamRefs should be cleaned")
	}
}

// TestStopListenerByCallID_NoRefsFallback verifies that calls without refs
// still get cleaned up via fallback scan (backward compat).
func TestStopListenerByCallID_NoRefsFallback(t *testing.T) {
	s := newTestSniffer()

	stream := &RTPStream{callID: "call-old", lastActivity: time.Now().UnixNano()}
	s.listeners.Store(9090, stream)
	// Intentionally NOT adding stream refs — simulates old code path

	s.StopListenerByCallID("call-old")

	if _, ok := s.listeners.Load(9090); ok {
		t.Error("port 9090 should still be removed via fallback scan")
	}
}

// TestStopListenerByCallID_ClosesDecoders verifies that StopListenerByCallID
// calls CloseDecoders() on each stream. Without this, G.729 CGo decoders
// leak C memory on normal BYE hangup (only timeout path had CloseDecoders).
func TestStopListenerByCallID_ClosesDecoders(t *testing.T) {
	s := newTestSniffer()

	// Create a stream with a non-nil opusDec to track cleanup
	// (We can't create a real g729 decoder easily, but opusDec=nil check
	// verifies CloseDecoders was called since it sets opusDec=nil.)
	stream := &RTPStream{
		callID:       "call-decoder-test",
		lastActivity: time.Now().UnixNano(),
	}
	// Manually set opusDec to a non-nil value to verify it gets nilled
	// CloseDecoders() sets opusDec = nil
	stream.opusDec = &hrOpus.Decoder{} // placeholder, will be nilled by CloseDecoders

	s.listeners.Store(7070, stream)
	s.addStreamRef("call-decoder-test", streamRef{isVirtual: false, portKey: 7070})
	s.callIndex.Store("call-decoder-test", stream)

	s.StopListenerByCallID("call-decoder-test")

	// Verify CloseDecoders was called — opusDec should be nil
	stream.mu.Lock()
	opusNil := stream.opusDec == nil
	stream.mu.Unlock()

	if !opusNil {
		t.Error("opusDec should be nil after StopListenerByCallID (CloseDecoders not called)")
	}
}

// TestStopListenerByCallID_ClosesDecoders_Fallback verifies CloseDecoders
// is called even in the fallback scan path (no index).
func TestStopListenerByCallID_ClosesDecoders_Fallback(t *testing.T) {
	s := newTestSniffer()

	stream := &RTPStream{
		callID:       "call-decoder-fallback",
		lastActivity: time.Now().UnixNano(),
	}
	stream.opusDec = &hrOpus.Decoder{}

	s.listeners.Store(8080, stream)
	// Intentionally NOT adding stream refs

	s.StopListenerByCallID("call-decoder-fallback")

	stream.mu.Lock()
	opusNil := stream.opusDec == nil
	stream.mu.Unlock()

	if !opusNil {
		t.Error("opusDec should be nil after fallback StopListenerByCallID (CloseDecoders not called)")
	}
}
