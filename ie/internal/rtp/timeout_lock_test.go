package rtp

import (
	"testing"
	"time"
)

func TestCollectExpiredStreams_IdentifiesExpired(t *testing.T) {
	s := newTestSniffer()
	now := time.Now()
	timeout := 30 * time.Second

	// Expired stream (inactive > 30s)
	expired := &RTPStream{
		callID:       "call-expired",
		lastActivity: now.Add(-60 * time.Second).UnixNano(),
	}
	s.listeners.Store(5060, expired)
	s.callIndex.Store("call-expired", expired)

	result := s.collectExpiredStreams(now, timeout)

	if len(result) != 1 {
		t.Fatalf("expected 1 expired stream, got %d", len(result))
	}
	if result[0].callID != "call-expired" {
		t.Errorf("expected call-expired, got %s", result[0].callID)
	}

	// Verify stream was removed from maps
	if _, exists := s.listeners.Load(5060); exists {
		t.Error("expired stream should be removed from listeners")
	}
	if _, exists := s.callIndex.Load("call-expired"); exists {
		t.Error("expired stream should be removed from callIndex")
	}
}

func TestCollectExpiredStreams_SkipsActive(t *testing.T) {
	s := newTestSniffer()
	now := time.Now()
	timeout := 30 * time.Second

	// Active stream (inactive < 30s)
	active := &RTPStream{
		callID:       "call-active",
		lastActivity: now.Add(-10 * time.Second).UnixNano(),
	}
	s.listeners.Store(5060, active)
	s.callIndex.Store("call-active", active)

	result := s.collectExpiredStreams(now, timeout)

	if len(result) != 0 {
		t.Fatalf("expected 0 expired streams, got %d", len(result))
	}

	// Active stream should remain
	if _, exists := s.listeners.Load(5060); !exists {
		t.Error("active stream should remain in listeners")
	}
}

func TestCollectExpiredStreams_DedupsByCallID(t *testing.T) {
	s := newTestSniffer()
	now := time.Now()
	timeout := 30 * time.Second

	// Two expired streams for same callID (physical + virtual)
	stream1 := &RTPStream{
		callID:       "call-dup",
		lastActivity: now.Add(-60 * time.Second).UnixNano(),
	}
	stream2 := &RTPStream{
		callID:       "call-dup",
		lastActivity: now.Add(-45 * time.Second).UnixNano(),
	}
	s.listeners.Store(5060, stream1)
	s.virtualListeners.Store("call-dup:192.168.1.1", stream2)
	s.callIndex.Store("call-dup", stream1)

	result := s.collectExpiredStreams(now, timeout)

	// Should have entries for both streams, but only one unique callID to cleanup
	uniqueCallIDs := make(map[string]bool)
	for _, es := range result {
		uniqueCallIDs[es.callID] = true
	}
	if len(uniqueCallIDs) != 1 {
		t.Errorf("expected 1 unique callID, got %d", len(uniqueCallIDs))
	}

	// Both should be removed from maps
	if syncMapLen(&s.listeners) != 0 {
		t.Errorf("expected 0 listeners, got %d", syncMapLen(&s.listeners))
	}
	if syncMapLen(&s.virtualListeners) != 0 {
		t.Errorf("expected 0 virtualListeners, got %d", syncMapLen(&s.virtualListeners))
	}
}

func TestCollectExpiredStreams_MixedExpiredAndActive(t *testing.T) {
	s := newTestSniffer()
	now := time.Now()
	timeout := 30 * time.Second

	expired := &RTPStream{
		callID:       "call-old",
		lastActivity: now.Add(-60 * time.Second).UnixNano(),
	}
	active := &RTPStream{
		callID:       "call-new",
		lastActivity: now.Add(-5 * time.Second).UnixNano(),
	}
	s.listeners.Store(5060, expired)
	s.listeners.Store(5062, active)
	s.callIndex.Store("call-old", expired)
	s.callIndex.Store("call-new", active)

	result := s.collectExpiredStreams(now, timeout)

	if len(result) != 1 {
		t.Fatalf("expected 1 expired, got %d", len(result))
	}
	if result[0].callID != "call-old" {
		t.Errorf("expected call-old, got %s", result[0].callID)
	}

	// Active should remain, expired should be gone
	if _, exists := s.listeners.Load(5060); exists {
		t.Error("expired stream should be removed")
	}
	if _, exists := s.listeners.Load(5062); !exists {
		t.Error("active stream should remain")
	}
	if _, exists := s.callIndex.Load("call-new"); !exists {
		t.Error("active call index should remain")
	}
}

func TestCollectExpiredStreams_SkipsRTCPForCleanup(t *testing.T) {
	s := newTestSniffer()
	now := time.Now()
	timeout := 30 * time.Second

	// Expired RTCP stream — should be deleted from map but NOT trigger cleanup
	rtcp := &RTPStream{
		callID:       "call-rtcp",
		isRTCP:       true,
		lastActivity: now.Add(-60 * time.Second).UnixNano(),
	}
	s.listeners.Store(5061, rtcp)

	result := s.collectExpiredStreams(now, timeout)

	// RTCP stream should be removed from listeners
	if _, exists := s.listeners.Load(5061); exists {
		t.Error("expired RTCP stream should be removed from listeners")
	}

	// But no cleanup entry should be generated (RTCP doesn't need call cleanup)
	for _, es := range result {
		if es.callID == "call-rtcp" && es.needsCleanup {
			t.Error("RTCP stream should not be marked for cleanup")
		}
	}
}
