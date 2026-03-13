package rtp

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestAudit7_StopListenerCleanup(t *testing.T) {
	s := &Sniffer{}

	callID := "test-cleanup-call"

	stream1 := &RTPStream{callID: callID, lastActivity: time.Now().UnixNano()}
	stream2 := &RTPStream{callID: callID, lastActivity: time.Now().UnixNano()}

	s.listeners.Store(10000, stream1)
	s.virtualListeners.Store(callID+":192.168.1.1", stream2)

	refs := []streamRef{
		{isVirtual: false, portKey: 10000},
		{isVirtual: true, virtualKey: callID + ":192.168.1.1"},
	}
	s.callStreamRefs.Store(callID, &refs)
	s.callIndex.Store(callID, stream1)

	// Run cleanup
	s.StopListenerByCallID(callID)

	// Assertions
	_, hasPort := s.listeners.Load(10000)
	assert.False(t, hasPort, "Physical listener should be deleted")

	_, hasVirtual := s.virtualListeners.Load(callID + ":192.168.1.1")
	assert.False(t, hasVirtual, "Virtual listener should be deleted")

	_, hasRefs := s.callStreamRefs.Load(callID)
	assert.False(t, hasRefs, "CallStreamRefs should be deleted")

	_, hasIndex := s.callIndex.Load(callID)
	assert.False(t, hasIndex, "CallIndex should be deleted")

	// Test fallback path
	callID2 := "fallback-call"
	stream3 := &RTPStream{callID: callID2, lastActivity: time.Now().UnixNano()}
	s.listeners.Store(20000, stream3)

	// No CallStreamRefs stored intentionally to trigger fallback
	s.callIndex.Store(callID2, stream3)

	s.StopListenerByCallID(callID2)

	_, hasPort2 := s.listeners.Load(20000)
	assert.False(t, hasPort2, "Fallback: Physical listener should be deleted")
	_, hasIndex2 := s.callIndex.Load(callID2)
	assert.False(t, hasIndex2, "Fallback: CallIndex should be deleted")
}
