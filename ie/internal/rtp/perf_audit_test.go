package rtp

import (
	"sync"
	"testing"
	"time"
)

// === ML-1: callStreamRefs must be cleaned on RTP timeout ===

// TestCollectExpiredStreams_CleansCallStreamRefs verifies that callStreamRefs is
// cleaned up when streams expire through the RTP timeout path (collectExpiredStreams).
// Bug: Previously only callIndex was deleted, leaving callStreamRefs leaking.
func TestCollectExpiredStreams_CleansCallStreamRefs(t *testing.T) {
	s := newTestSniffer()

	callID := "ml1-leak-test"

	// Add a stream ref for this call (simulating what StartListener does)
	s.addStreamRef(callID, streamRef{isVirtual: false, portKey: 5060})

	// Verify ref exists before timeout
	if _, ok := s.callStreamRefs.Load(callID); !ok {
		t.Fatal("callStreamRefs should have entry before timeout")
	}

	// Create an expired stream
	stream := &RTPStream{
		callID:       callID,
		isRTCP:       true, // RTCP so needsCleanup=false (avoids Redis/CH deps)
		lastActivity: time.Now().Add(-10 * time.Second).UnixNano(),
		mu:           sync.Mutex{},
	}
	s.listeners.Store(5060, stream)

	// Collect expired streams
	expired := s.collectExpiredStreams(time.Now(), 2*time.Second)

	// Verify stream was collected
	if len(expired) == 0 {
		t.Fatal("Expected at least one expired stream")
	}

	// ML-1 assertion: callStreamRefs MUST be cleaned
	if _, ok := s.callStreamRefs.Load(callID); ok {
		t.Fatal("ML-1 FAIL: callStreamRefs still has entry after RTP timeout — memory leak")
	}
}

// TestCollectExpiredStreams_CleansCallStreamRefs_VirtualListener verifies ML-1
// for virtual listeners (HEP-injected streams).
func TestCollectExpiredStreams_CleansCallStreamRefs_VirtualListener(t *testing.T) {
	s := newTestSniffer()

	callID := "ml1-virtual-leak"
	key := callID + ":192.168.1.1"

	// Add virtual stream ref
	s.addStreamRef(callID, streamRef{isVirtual: true, virtualKey: key})

	// Verify ref exists
	if _, ok := s.callStreamRefs.Load(callID); !ok {
		t.Fatal("callStreamRefs should have entry before timeout")
	}

	// Create expired virtual stream
	stream := &RTPStream{
		callID:       callID,
		isRTCP:       true,
		lastActivity: time.Now().Add(-10 * time.Second).UnixNano(),
		mu:           sync.Mutex{},
	}
	s.virtualListeners.Store(key, stream)

	// Collect expired streams
	expired := s.collectExpiredStreams(time.Now(), 2*time.Second)
	if len(expired) == 0 {
		t.Fatal("Expected at least one expired stream")
	}

	// ML-1 assertion: callStreamRefs MUST be cleaned for virtual listeners too
	if _, ok := s.callStreamRefs.Load(callID); ok {
		t.Fatal("ML-1 FAIL: callStreamRefs still has entry for virtual listener — memory leak")
	}
}

// === GL-1: Jitter buffer must be stopped on RTP timeout ===

// TestCollectExpiredStreams_StopsJitterBuffer verifies that the jitter buffer's
// drainLoop goroutine is stopped when a stream expires through RTP timeout.
// Bug: Previously only StopListenerByCallID called jitterBuf.Stop().
func TestCollectExpiredStreams_StopsJitterBuffer(t *testing.T) {
	s := newTestSniffer()

	callID := "gl1-jitter-leak"

	// Create a jitter buffer
	jb := NewJitterBuffer(3)

	// Create expired stream with jitter buffer
	stream := &RTPStream{
		callID:       callID,
		isRTCP:       true,
		lastActivity: time.Now().Add(-10 * time.Second).UnixNano(),
		jitterBuf:    jb,
		mu:           sync.Mutex{},
	}
	s.listeners.Store(5060, stream)

	// Collect expired streams
	_ = s.collectExpiredStreams(time.Now(), 2*time.Second)

	// GL-1 assertion: jitter buffer must be stopped
	if !jb.stopped {
		t.Fatal("GL-1 FAIL: jitter buffer drainLoop goroutine still running after timeout — goroutine leak")
	}
}

// TestCollectExpiredStreams_FlushesAudioBatcher verifies AudioBatcher.Flush()
// is called on RTP timeout to prevent audio data loss.
func TestCollectExpiredStreams_FlushesAudioBatcher(t *testing.T) {
	s := newTestSniffer()

	callID := "gl1-batcher-flush"

	// Create a mock audio batcher with buffered data
	batcher := NewAudioBatcher(callID, "192.168.1.1")
	// Manually add some data to the buffer
	batcher.mu.Lock()
	batcher.buffer = append(batcher.buffer, make([]byte, 100)...)
	batcher.count = 3 // Simulate 3 accumulated frames
	batcher.mu.Unlock()

	// Create expired stream with audio batcher
	stream := &RTPStream{
		callID:       callID,
		isRTCP:       true,
		lastActivity: time.Now().Add(-10 * time.Second).UnixNano(),
		audioBatcher: batcher,
		mu:           sync.Mutex{},
	}
	s.listeners.Store(5060, stream)

	// Collect expired streams
	_ = s.collectExpiredStreams(time.Now(), 2*time.Second)

	// GL-1 assertion: audio batcher must be flushed (count reset to 0)
	batcher.mu.Lock()
	count := batcher.count
	batcher.mu.Unlock()

	if count != 0 {
		t.Fatalf("GL-1 FAIL: AudioBatcher not flushed on timeout (count=%d) — data loss risk", count)
	}
}
