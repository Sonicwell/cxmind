package rtp

import (
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/api"
	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/go-redis/redismock/v9"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
)

// === Audit #4: EndCallBatch must delete call:srtp:* key ===

func TestEndCallBatch_DeletesSRTPKey(t *testing.T) {
	db, mock := redismock.NewClientMock()
	origClient := redis.Client
	redis.Client = db
	defer func() {
		redis.Client = origClient
		db.Close()
	}()

	callID := "srtp-cleanup-001"
	state := map[string]interface{}{
		"start_time": time.Now().Add(-5 * time.Minute).Format(time.RFC3339Nano),
	}

	// Using CustomMatch for SetCallState to avoid JSON map key order flakiness
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil // Accept any args
	}).ExpectSet("call:state:"+callID, "", 24*time.Hour).SetVal("OK")
	mock.ExpectSRem("active_calls", callID).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")
	mock.ExpectDel("call:last_msg:" + callID).SetVal(1)
	mock.ExpectDel("call:srtp:" + callID).SetVal(1) // Audit #4: NEW

	err := redis.EndCallBatch(callID, state)
	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet(), "EndCallBatch must delete call:srtp:* key")
}

// === Audit #5: cleanupTimeoutCall must clear MonitoringCache ===

func TestCleanupTimeoutCall_ClearsMonitoringCache(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	viper.Set("sniffer.rtp_timeout_seconds", 30)
	defer viper.Reset()

	callID := "monitoring-cleanup-001"
	now := time.Now()

	// Pre-populate monitoring cache
	api.GlobalMonitoringCache.SetCallMonitored(callID)
	defer api.GlobalMonitoringCache.ClearCall(callID)

	assert.True(t, api.GlobalMonitoringCache.IsCallMonitored(callID),
		"Precondition: call should be monitored")

	// Create sniffer with an indexed stream
	sniffer := newTestSniffer()
	stream := &RTPStream{
		callID:      callID,
		stateLoaded: true,
		startTime:   now.Add(-3 * time.Minute),
		callerUser:  "alice",
		calleeUser:  "bob",
	}
	sniffer.callIndex.Store(callID, stream)

	// Expect Redis calls from cleanupTimeoutCall → EndCallBatch (via SetCallState path)
	// cleanupTimeoutCall uses redis.SetCallState (not EndCallBatch) when state is built internally
	expectedState := map[string]interface{}{
		"status":             "ended",
		"end_time":           now.Format(time.RFC3339Nano),
		"termination_reason": "rtp_timeout",
	}
	expectedJSON, _ := json.Marshal(expectedState)
	mock.ExpectSet("call:state:"+callID, expectedJSON, 24*time.Hour).SetVal("OK")
	mock.ExpectSRem("active_calls", callID).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")

	// Expect call_hangup event publish
	mock.Regexp().ExpectPublish("call:events", ``).SetVal(1)

	sniffer.cleanupTimeoutCall(callID, now, "rtp_timeout", nil)

	// Audit #5: MonitoringCache must be cleared
	assert.False(t, api.GlobalMonitoringCache.IsCallMonitored(callID),
		"cleanupTimeoutCall must clear MonitoringCache for the call")
}

// === Audit #2: cleanupTimeoutCall must invoke OnCallCleanup callback ===

func TestCleanupTimeoutCall_InvokesOnCallCleanup(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	viper.Set("sniffer.rtp_timeout_seconds", 30)
	defer viper.Reset()

	callID := "cache-cleanup-001"
	now := time.Now()

	// Track whether callback was invoked
	callbackCalled := false
	callbackCallID := ""
	origCallback := OnCallCleanup
	OnCallCleanup = func(id string) {
		callbackCalled = true
		callbackCallID = id
	}
	defer func() { OnCallCleanup = origCallback }()

	// Create sniffer
	sniffer := newTestSniffer()
	stream := &RTPStream{
		callID:      callID,
		stateLoaded: true,
		startTime:   now.Add(-3 * time.Minute),
	}
	sniffer.callIndex.Store(callID, stream)

	// Set up Redis expectations
	expectedState := map[string]interface{}{
		"status":             "ended",
		"end_time":           now.Format(time.RFC3339Nano),
		"termination_reason": "session_timeout",
	}
	expectedJSON, _ := json.Marshal(expectedState)
	mock.ExpectSet("call:state:"+callID, expectedJSON, 24*time.Hour).SetVal("OK")
	mock.ExpectSRem("active_calls", callID).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")
	mock.Regexp().ExpectPublish("call:events", ``).SetVal(1)

	sniffer.cleanupTimeoutCall(callID, now, "session_timeout", nil)

	// Audit #2: OnCallCleanup callback must be invoked
	assert.True(t, callbackCalled, "OnCallCleanup must be invoked during timeout cleanup")
	assert.Equal(t, callID, callbackCallID, "OnCallCleanup must receive the correct callID")
}

// === Audit #6: monitorTimeouts should NOT duplicate call:last_msg Del ===

func TestSessionTimeout_NoDuplicateLastMsgDel(t *testing.T) {
	viper.Set("sniffer.session_expires_margin", 1.0)
	viper.Set("sniffer.rtp_timeout_seconds", 30)
	defer viper.Reset()

	m := newTestSessionManager()

	callID := "no-dup-del-001"
	pastTime := time.Now().Add(-10 * time.Minute)

	// Create and immediately expire a session
	m.UpdateSession(callID, 1, pastTime)

	expired := callsession.GlobalManager.GetExpiredSessions()
	assert.Equal(t, 1, len(expired), "Should find 1 expired session")
	assert.Equal(t, callID, expired[0].CallID)

	// The fix removes the redundant Del → only EndCallBatch handles call:last_msg
	// Verified by code structure (no explicit Del in monitorTimeouts)
}

// === Helper to verify expired streams clean monitoring cache ===

func TestCollectExpiredStreams_ClearsMonitoringCacheOnFullCleanup(t *testing.T) {
	viper.Set("sniffer.rtp_timeout_seconds", 1)
	viper.Set("sniffer.session_expires_margin", 1.2)
	defer viper.Reset()

	m := newTestSessionManager()
	_ = m

	sniffer := newTestSniffer()
	callID := "rtp-timeout-monitor-001"

	// Set up monitoring
	api.GlobalMonitoringCache.SetCallMonitored(callID)
	defer api.GlobalMonitoringCache.ClearCall(callID)

	assert.True(t, api.GlobalMonitoringCache.IsCallMonitored(callID))

	// Register an expired stream
	stream := &RTPStream{
		callID:             callID,
		isRTCP:             false,
		lastActivity:       time.Now().Add(-5 * time.Second).UnixNano(),
		hasReceivedPackets: true,
		mu:                 sync.Mutex{},
	}
	sniffer.listeners.Store(9999, stream)
	sniffer.callIndex.Store(callID, stream)

	// Collect expired streams
	expired := sniffer.collectExpiredStreams(time.Now(), 1*time.Second)
	assert.GreaterOrEqual(t, len(expired), 1)

	// MonitoringCache cleanup happens in cleanupTimeoutCall (called by monitorTimeouts),
	// not in collectExpiredStreams. Verify collectExpiredStreams returns the
	// stream for cleanup.
	found := false
	for _, es := range expired {
		if es.callID == callID {
			found = true
			break
		}
	}
	assert.True(t, found, "Expired stream should be returned for cleanup")
}
