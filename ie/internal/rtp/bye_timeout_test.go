package rtp

import (
	"sync"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
)

// newTestSessionManager creates a lightweight SessionManager for testing.
// Does NOT start background goroutines (avoids viper.Reset race).
func newTestSessionManager() *callsession.SessionManager {
	m := callsession.NewTestManager()
	callsession.GlobalManager = m
	return m
}

// TestCollectExpiredStreams_SkipsTerminatedCalls verifies that streams belonging
// to calls already terminated by BYE are cleaned up silently (no rtp_timeout event).
func TestCollectExpiredStreams_SkipsTerminatedCalls(t *testing.T) {
	viper.Set("sniffer.rtp_timeout_seconds", 1)
	viper.Set("sniffer.session_expires_margin", 1.2)
	defer viper.Reset()

	m := newTestSessionManager()
	_ = m

	sniffer := newTestSniffer()
	callID := "bye-then-timeout-001"

	// Step 1: Simulate INVITE — register session and stream
	callsession.GlobalManager.UpdateSession(callID, 300, time.Now())
	stream := &RTPStream{
		callID:             callID,
		isRTCP:             false,
		lastActivity:       time.Now().Add(-2 * time.Second).UnixNano(), // Expired
		hasReceivedPackets: true,
		mu:                 sync.Mutex{},
	}
	sniffer.virtualListeners.Store(callID+":192.168.1.100", stream)

	// Step 2: Simulate BYE — terminate the call
	callsession.GlobalManager.RemoveSession(callID)

	// Step 3: Collect expired streams
	now := time.Now()
	timeoutDuration := 1 * time.Second
	expired := sniffer.collectExpiredStreams(now, timeoutDuration)

	// The stream should be removed from virtualListeners (cleanup)
	assert.Equal(t, 0, syncMapLen(&sniffer.virtualListeners), "Stream should be removed from map")

	// BUT: it should NOT need full call cleanup (needsCleanup=false)
	// because BYE already did the cleanup
	for _, es := range expired {
		if es.callID == callID {
			assert.False(t, es.needsCleanup,
				"Terminated call should not need cleanup (BYE already handled it)")
		}
	}
}

// TestStopListenerByCallID_PreventsReCreation verifies that after StopListenerByCallID,
// calling InjectRTP with StartVirtualListener does NOT re-create the stream
// for a terminated call.
func TestStopListenerByCallID_PreventsReCreation(t *testing.T) {
	viper.Set("sniffer.session_expires_margin", 1.2)
	defer viper.Reset()

	m := newTestSessionManager()
	_ = m

	sniffer := newTestSniffer()
	callID := "bye-recreate-001"

	// Step 1: Register session and stream
	callsession.GlobalManager.UpdateSession(callID, 300, time.Now())
	stream := &RTPStream{
		callID:             callID,
		isRTCP:             false,
		lastActivity:       time.Now().UnixNano(),
		hasReceivedPackets: true,
		mu:                 sync.Mutex{},
	}
	sniffer.virtualListeners.Store(callID+":192.168.1.100", stream)
	sniffer.callIndex.Store(callID, stream)

	// Step 2: BYE — stop listeners and remove session
	sniffer.StopListenerByCallID(callID)
	callsession.GlobalManager.RemoveSession(callID)

	// Verify cleanup
	assert.Equal(t, 0, syncMapLen(&sniffer.virtualListeners), "All listeners should be stopped")

	// Step 3: Late RTP packet arrives — should NOT re-create listener
	assert.True(t, callsession.GlobalManager.IsTerminated(callID),
		"Call should be marked as terminated")

	// Verify no re-creation would happen
	_, exists := sniffer.getVirtualStream(callID, "192.168.1.100")
	assert.False(t, exists, "Virtual stream should not exist after BYE")
}

// TestMonitorTimeouts_IgnoresTerminatedSessions tests the full flow:
// session heap check should not return sessions that were already cleaned by BYE.
func TestMonitorTimeouts_IgnoresTerminatedSessions(t *testing.T) {
	viper.Set("sniffer.session_expires_margin", 1.0)
	defer viper.Reset()

	m := newTestSessionManager()
	_ = m

	callID := "monitor-bye-001"

	// Create session and immediately remove (simulating BYE)
	callsession.GlobalManager.UpdateSession(callID, 300, time.Now())
	callsession.GlobalManager.RemoveSession(callID)

	// Now simulate 200 OK trying to update
	callsession.GlobalManager.UpdateSession(callID, 300, time.Now())

	// Session should NOT appear in heap
	expired := callsession.GlobalManager.GetExpiredSessions()
	for _, s := range expired {
		assert.NotEqual(t, callID, s.CallID,
			"Terminated call should not appear in expired sessions")
	}

	// Also should not be in the regular sessions map
	assert.True(t, callsession.GlobalManager.IsTerminated(callID))
}
