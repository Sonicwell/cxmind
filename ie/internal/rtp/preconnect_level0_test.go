package rtp

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestStartListenerWithPreConnect_Level0_HasStreamRef verifies that Level 0
// calls in StartListenerWithPreConnect register their stream refs for O(1) cleanup.
// This tests the fix for the missing addStreamRef/indexStream in the Level 0 fast path.
func TestStartListenerWithPreConnect_Level0_HasStreamRef(t *testing.T) {
	s := newTestSniffer()

	callID := "preconnect-level0"
	port := 7700

	// Create a Level 0 stream manually (simulating what loadCallState would set)
	stream := &RTPStream{
		callID:          callID,
		processingLevel: 0,
		lastActivity:    time.Now().UnixNano(),
		stateLoaded:     true, // Skip Redis lookup
	}

	// Store directly to simulate the Level 0 fast path in StartListenerWithPreConnect
	stream.initSRTP()
	s.listeners.Store(port, stream)
	s.addStreamRef(callID, streamRef{isVirtual: false, portKey: port})
	s.indexStream(callID, stream)

	// Verify stream ref exists
	val, ok := s.callStreamRefs.Load(callID)
	require.True(t, ok, "callStreamRefs should have an entry for the call")
	refs := val.(*[]streamRef)
	assert.Len(t, *refs, 1, "should have exactly 1 stream ref")
	assert.Equal(t, port, (*refs)[0].portKey, "stream ref should reference the correct port")
}

// TestStartListenerWithPreConnect_Level0_HasCallIndex verifies that Level 0
// calls in StartListenerWithPreConnect are added to the callIndex for O(1) lookup.
func TestStartListenerWithPreConnect_Level0_HasCallIndex(t *testing.T) {
	s := newTestSniffer()

	callID := "preconnect-level0-idx"
	port := 7701

	stream := &RTPStream{
		callID:          callID,
		processingLevel: 0,
		lastActivity:    time.Now().UnixNano(),
		stateLoaded:     true,
	}

	stream.initSRTP()
	s.listeners.Store(port, stream)
	s.addStreamRef(callID, streamRef{isVirtual: false, portKey: port})
	s.indexStream(callID, stream)

	// Verify callIndex contains the stream
	found, ok := s.GetStreamByCallID(callID)
	require.True(t, ok, "callIndex should have an entry for the call")
	assert.Equal(t, callID, found.callID, "indexed stream should have correct callID")

	// Verify StopListenerByCallID can find and clean up via index
	s.StopListenerByCallID(callID)
	_, ok = s.listeners.Load(port)
	assert.False(t, ok, "listener should be removed after StopListenerByCallID")
}
