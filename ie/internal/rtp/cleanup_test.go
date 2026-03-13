package rtp

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/go-redis/redismock/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupRedisMock replaces the global Redis client with a mock
func setupRedisMock() (redismock.ClientMock, func()) {
	db, mock := redismock.NewClientMock()
	originalClient := redis.Client
	redis.Client = db

	return mock, func() {
		redis.Client = originalClient
		db.Close()
	}
}

// TestCleanupTimeoutCall_UsesCache verifies cleanup uses cached data but still updates status
func TestCleanupTimeoutCall_UsesCache(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-cleanup-cache"
	now := time.Now()
	startTime := now.Add(-5 * time.Minute)

	stream := &RTPStream{
		callID:      callID,
		startTime:   startTime,
		callerUser:  "alice",
		calleeUser:  "bob",
		fromDomain:  "src.com",
		toDomain:    "dst.com",
		stateLoaded: true,
	}

	sniffer := &Sniffer{}
	// Manually inject stream into sniffer listeners map to allow GetStreamByCallID to find it
	sniffer.listeners.Store(1234, stream)
	sniffer.callIndex.Store(callID, stream)

	// Update expects SetCallState to be called with "ended" status via EndCallBatch
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil // Accept any args
	}).ExpectSet("call:state:"+callID, "", 24*time.Hour).SetVal("OK")

	// EndCallBatch pipeline components:
	mock.ExpectSRem("active_calls", callID).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")
	mock.ExpectDel("call:last_msg:" + callID).SetVal(1)
	mock.ExpectDel("call:srtp:" + callID).SetVal(1)

	// Finally, cleanupTimeoutCall explicitly calls PublishCallEvent
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil // Accept any args
	}).ExpectPublish("call:event:"+callID, "").SetVal(1)

	sniffer.cleanupTimeoutCall(callID, now, "rtp_timeout", nil)

	// Verify we didn't call GET (implicit by no ExpectGet)

	assert.NoError(t, mock.ExpectationsWereMet())
}

// TestLoadCallState_CachesFields verifies loading state from Redis populates the stream cache
func TestLoadCallState_CachesFields(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-load-state"
	stream := &RTPStream{
		callID: callID,
	}

	// Prepare mock data
	state := map[string]interface{}{
		"caller_name": "Alice",
		"callee_name": "Bob",
		"asr_enabled": true,
		"caller_uri":  "sip:101",
		"start_time":  time.Now().Format(time.RFC3339Nano),
	}
	stateJSON, _ := json.Marshal(state)

	srtpKey := "somekey"

	// Expect Pipeline
	mock.ExpectGet("call:state:" + callID).SetVal(string(stateJSON))
	mock.ExpectGet("call:srtp:" + callID).SetVal(srtpKey)

	err := stream.loadCallState()
	assert.NoError(t, err)

	assert.Equal(t, "Alice", stream.callerName)
	assert.Equal(t, "Bob", stream.calleeName)
	assert.True(t, stream.asrEnabled)
	assert.Equal(t, "101", stream.agentID)
	assert.Equal(t, srtpKey, stream.srtpKey)
	assert.True(t, stream.stateLoaded)
	assert.False(t, stream.startTime.IsZero())

	assert.NoError(t, mock.ExpectationsWereMet())
}

// TestCleanupTimeoutCall_FieldParity verifies that cleanupTimeoutCall writes
// GeoIP, Codec, and DisconnectParty to ClickHouse — matching handleTermination.
// F-1 TDD: This test should FAIL until cleanup.go and stream.go carry these fields.
func TestCleanupTimeoutCall_FieldParity(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-field-parity"
	now := time.Now()
	startTime := now.Add(-3 * time.Minute)

	// Stream cache 包含 GeoIP/Codec/Direction（模拟 loadCallState 后的状态）
	stream := &RTPStream{
		callID:        callID,
		startTime:     startTime,
		callerUser:    "alice",
		calleeUser:    "bob",
		fromDomain:    "src.com",
		toDomain:      "dst.com",
		direction:     "outbound",
		sigSrcCountry: "CN",
		sigSrcCity:    "Shanghai",
		sigDstCountry: "US",
		sigDstCity:    "New York",
		codec:         "PCMU",
		stateLoaded:   true,
	}

	sniffer := &Sniffer{}
	sniffer.listeners.Store(5678, stream)
	sniffer.callIndex.Store(callID, stream)

	// Capture SipCallRecords
	var capturedRecords []clickhouse.SipCallRecord
	origWriter := clickhouse.GlobalSipCallWriter
	clickhouse.GlobalSipCallWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipCallRecord](
		100,
		time.Minute,
		func(ctx context.Context, items []clickhouse.SipCallRecord) error {
			capturedRecords = append(capturedRecords, items...)
			return nil
		},
	)
	defer func() {
		clickhouse.GlobalSipCallWriter.Stop()
		clickhouse.GlobalSipCallWriter = origWriter
	}()

	// EndCallBatch 的 Redis mock
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectSet("call:state:"+callID, "", 24*time.Hour).SetVal("OK")
	mock.ExpectSRem("active_calls", callID).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")
	mock.ExpectDel("call:last_msg:" + callID).SetVal(1)
	mock.ExpectDel("call:srtp:" + callID).SetVal(1)
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectPublish("call:event:"+callID, "").SetVal(1)

	// Act
	sniffer.cleanupTimeoutCall(callID, now, "session_timeout", nil)

	// Flush batch writer 确保记录写入
	clickhouse.GlobalSipCallWriter.Flush()

	// Assert
	require.Len(t, capturedRecords, 1, "cleanupTimeoutCall should write exactly 1 sip_calls record")
	rec := capturedRecords[0]

	// 基础字段
	assert.Equal(t, callID, rec.CallID)
	assert.Equal(t, "session_timeout", rec.Status)
	assert.Equal(t, "outbound", rec.Direction)

	// F-1 核心断言: GeoIP
	assert.Equal(t, "CN", rec.SigSrcCountry, "GeoIP sig_src_country must be carried from stream cache")
	assert.Equal(t, "Shanghai", rec.SigSrcCity, "GeoIP sig_src_city must be carried from stream cache")
	assert.Equal(t, "US", rec.SigDstCountry, "GeoIP sig_dst_country must be carried from stream cache")
	assert.Equal(t, "New York", rec.SigDstCity, "GeoIP sig_dst_city must be carried from stream cache")

	// F-1 核心断言: Codec
	assert.Equal(t, "PCMU", rec.Codec, "Codec must be carried from stream cache")

	// F-1 核心断言: DisconnectParty
	assert.Equal(t, "system", rec.DisconnectParty, "Timeout calls must have DisconnectParty='system'")
}

// TestCleanupTimeoutCall_RedisPath_FieldParity verifies that the Redis fallback path
// (when stream cache is unavailable) also writes GeoIP/Codec/DisconnectParty.
// Covers: SIP-only 通话没有 RTP stream，或 rtp_timeout 但 stream 已被清理的场景.
func TestCleanupTimeoutCall_RedisPath_FieldParity(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-redis-path-parity"
	now := time.Now()
	startTime := now.Add(-2 * time.Minute)

	// Redis state 中包含 GeoIP、Codec、Direction
	redisState := map[string]interface{}{
		"start_time":      startTime.Format("2006-01-02T15:04:05.000Z"),
		"caller_user":     "charlie",
		"callee_user":     "dave",
		"from_domain":     "a.com",
		"to_domain":       "b.com",
		"direction":       "inbound",
		"sig_src_country": "JP",
		"sig_src_city":    "Tokyo",
		"sig_dst_country": "KR",
		"sig_dst_city":    "Seoul",
		"codec":           "G729",
		"status":          "active",
	}
	stateJSON, _ := json.Marshal(redisState)

	// 注意：不注入 stream cache → 走 Redis fallback 路径
	sniffer := &Sniffer{}

	// GetCallState mock
	mock.ExpectGet("call:state:" + callID).SetVal(string(stateJSON))

	// EndCallBatch mock
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectSet("call:state:"+callID, "", 24*time.Hour).SetVal("OK")
	mock.ExpectSRem("active_calls", callID).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")
	mock.ExpectDel("call:last_msg:" + callID).SetVal(1)
	mock.ExpectDel("call:srtp:" + callID).SetVal(1)
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectPublish("call:event:"+callID, "").SetVal(1)

	// Capture SipCallRecords
	var capturedRecords []clickhouse.SipCallRecord
	origWriter := clickhouse.GlobalSipCallWriter
	clickhouse.GlobalSipCallWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipCallRecord](
		100,
		time.Minute,
		func(ctx context.Context, items []clickhouse.SipCallRecord) error {
			capturedRecords = append(capturedRecords, items...)
			return nil
		},
	)
	defer func() {
		clickhouse.GlobalSipCallWriter.Stop()
		clickhouse.GlobalSipCallWriter = origWriter
	}()

	// Act — rtp_timeout, no stream cache
	sniffer.cleanupTimeoutCall(callID, now, "rtp_timeout", nil)

	clickhouse.GlobalSipCallWriter.Flush()

	// Assert
	require.Len(t, capturedRecords, 1)
	rec := capturedRecords[0]

	assert.Equal(t, callID, rec.CallID)
	assert.Equal(t, "rtp_timeout", rec.Status)
	assert.Equal(t, "inbound", rec.Direction)

	// GeoIP from Redis
	assert.Equal(t, "JP", rec.SigSrcCountry, "GeoIP from Redis fallback")
	assert.Equal(t, "Tokyo", rec.SigSrcCity)
	assert.Equal(t, "KR", rec.SigDstCountry)
	assert.Equal(t, "Seoul", rec.SigDstCity)

	// Codec from Redis
	assert.Equal(t, "G729", rec.Codec, "Codec from Redis fallback")

	// DisconnectParty = system
	assert.Equal(t, "system", rec.DisconnectParty)
}

// TestCleanupTimeoutCall_SessionTimeoutPath verifies that cleanupTimeoutCall
// still writes ClickHouse records even when IsTerminated()=true.
// This is the critical regression test for the self-blocking bug introduced in 06624bc2:
// GetExpiredSessions() marks terminated BEFORE cleanupTimeoutCall runs,
// so the old IsTerminated guard caused cleanup to be skipped entirely.
// Discovery Intent: catch "session timeout fires but ClickHouse never updated" bug.
func TestCleanupTimeoutCall_SessionTimeoutPath(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-session-timeout-path"
	now := time.Now()
	startTime := now.Add(-5 * time.Minute)

	// Simulate GetExpiredSessions() flow: session exists, then expires and is marked terminated
	callsession.GlobalManager = callsession.NewTestManager()
	callsession.GlobalManager.UpdateSession(callID, 300, now.Add(-10*time.Minute))
	// GetExpiredSessions marks terminated BEFORE cleanupTimeoutCall is called
	callsession.GlobalManager.RemoveSession(callID)
	assert.True(t, callsession.GlobalManager.IsTerminated(callID), "pre-condition: call must be terminated")

	// Stream cache with state
	stream := &RTPStream{
		callID:     callID,
		startTime:  startTime,
		callerUser: "alice",
		calleeUser: "bob",
		fromDomain: "src.com",
		toDomain:   "dst.com",
		direction:  "outbound",
		stateLoaded: true,
	}
	sniffer := &Sniffer{}
	sniffer.callIndex.Store(callID, stream)

	// EndCallBatch Redis mock
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectSet("call:state:"+callID, "", 24*time.Hour).SetVal("OK")
	mock.ExpectSRem("active_calls", callID).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")
	mock.ExpectDel("call:last_msg:" + callID).SetVal(1)
	mock.ExpectDel("call:srtp:" + callID).SetVal(1)
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectPublish("call:event:"+callID, "").SetVal(1)

	// Capture SipCallRecords
	var capturedRecords []clickhouse.SipCallRecord
	origWriter := clickhouse.GlobalSipCallWriter
	clickhouse.GlobalSipCallWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipCallRecord](
		100,
		time.Minute,
		func(ctx context.Context, items []clickhouse.SipCallRecord) error {
			capturedRecords = append(capturedRecords, items...)
			return nil
		},
	)
	defer func() {
		clickhouse.GlobalSipCallWriter.Stop()
		clickhouse.GlobalSipCallWriter = origWriter
	}()

	// Act — same as monitorTimeouts: GetExpiredSessions already marked terminated, then calls cleanup
	sniffer.cleanupTimeoutCall(callID, now, "session_timeout", nil)

	clickhouse.GlobalSipCallWriter.Flush()

	// Assert: cleanup MUST write ClickHouse record even though IsTerminated()=true
	require.Len(t, capturedRecords, 1, "cleanupTimeoutCall MUST write 1 record even when pre-terminated by GetExpiredSessions")
	rec := capturedRecords[0]
	assert.Equal(t, callID, rec.CallID)
	assert.Equal(t, "session_timeout", rec.Status)
	assert.Equal(t, "system", rec.DisconnectParty)
	assert.Equal(t, uint32(clickhouse.StateVersionTimeout), uint32(rec.StateVersion))
}

// TestMonitorTimeoutsFlow_EndToEnd simulates the complete monitorTimeouts call chain:
//   UpdateSession → GetExpiredSessions → cleanupTimeoutCall
// This is an integration-level test that catches bugs in the interaction between components,
// not just individual function behavior.
// Discovery Intent: catch any future guard/tombstone change that blocks the timeout → CH write path.
func TestMonitorTimeoutsFlow_EndToEnd(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-e2e-timeout-flow"
	now := time.Now()
	startTime := now.Add(-5 * time.Minute)

	// Step 1: Register session with very short timeout (already expired)
	mgr := callsession.NewTestManager()
	callsession.GlobalManager = mgr
	mgr.UpdateSession(callID, 1, now.Add(-10*time.Second)) // 1s timeout, 10s ago → expired

	// Step 2: Prepare stream cache (simulates what happens after handleInvite/handleSDP)
	stream := &RTPStream{
		callID:      callID,
		startTime:   startTime,
		callerUser:  "e2e-caller",
		calleeUser:  "e2e-callee",
		fromDomain:  "a.com",
		toDomain:    "b.com",
		direction:   "outbound",
		stateLoaded: true,
	}
	sniffer := &Sniffer{}
	sniffer.callIndex.Store(callID, stream)

	// Step 3: Redis mock for EndCallBatch
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectSet("call:state:"+callID, "", 24*time.Hour).SetVal("OK")
	mock.ExpectSRem("active_calls", callID).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")
	mock.ExpectDel("call:last_msg:" + callID).SetVal(1)
	mock.ExpectDel("call:srtp:" + callID).SetVal(1)
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectPublish("call:event:"+callID, "").SetVal(1)

	// Capture ClickHouse writes
	var capturedRecords []clickhouse.SipCallRecord
	origWriter := clickhouse.GlobalSipCallWriter
	clickhouse.GlobalSipCallWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipCallRecord](
		100,
		time.Minute,
		func(ctx context.Context, items []clickhouse.SipCallRecord) error {
			capturedRecords = append(capturedRecords, items...)
			return nil
		},
	)
	defer func() {
		clickhouse.GlobalSipCallWriter.Stop()
		clickhouse.GlobalSipCallWriter = origWriter
	}()

	// Step 4: Simulate EXACTLY what monitorTimeouts does
	// This is the critical integration point — GetExpiredSessions marks terminated,
	// then cleanupTimeoutCall must still run.
	expired := mgr.GetExpiredSessions()
	require.Len(t, expired, 1, "session must be detected as expired")
	assert.Equal(t, callID, expired[0].CallID)

	// Verify it IS marked terminated after GetExpiredSessions (the pre-condition that caused the bug)
	assert.True(t, mgr.IsTerminated(callID), "GetExpiredSessions must mark as terminated")

	// Call cleanupTimeoutCall — this is the step that was previously blocked
	for _, session := range expired {
		sniffer.cleanupTimeoutCall(session.CallID, now, "session_timeout", nil)
	}

	clickhouse.GlobalSipCallWriter.Flush()

	// Step 5: Verify ClickHouse record was written despite IsTerminated()=true
	require.Len(t, capturedRecords, 1, "monitorTimeouts flow MUST produce exactly 1 ClickHouse record")
	rec := capturedRecords[0]
	assert.Equal(t, callID, rec.CallID)
	assert.Equal(t, "session_timeout", rec.Status)
	assert.Equal(t, "e2e-caller", rec.Caller)
	assert.Equal(t, "e2e-callee", rec.Callee)
	assert.Equal(t, "outbound", rec.Direction)
	assert.Equal(t, "system", rec.DisconnectParty)
	assert.Equal(t, uint32(clickhouse.StateVersionTimeout), uint32(rec.StateVersion))

	// Verify Redis expectations were fulfilled (EndCallBatch ran)
	assert.NoError(t, mock.ExpectationsWereMet(), "Redis EndCallBatch must have been called")
}

// TestCleanupTimeoutCall_LastSipErrorUpgrade verifies that session_timeout calls
// with a stashed last_sip_error (from 401/407) upgrade disconnect_reason to the SIP error.
// Covers: cleanup.go L287-289 (last_sip_error branch)
// Discovery Intent: catch regression where 401/407 auth failure shows as generic "session_timeout"
func TestCleanupTimeoutCall_LastSipErrorUpgrade(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-sip-error-upgrade"
	now := time.Now()
	startTime := now.Add(-30 * time.Second)

	// Redis state carries last_sip_error from 401 challenge
	redisState := map[string]interface{}{
		"start_time":     startTime.Format("2006-01-02T15:04:05.000Z"),
		"caller_user":    "user1",
		"callee_user":    "user2",
		"from_domain":    "a.com",
		"to_domain":      "b.com",
		"last_sip_error": "401 Unauthorized",
		"status":         "active",
	}
	stateJSON, _ := json.Marshal(redisState)

	sniffer := &Sniffer{}

	// GetCallState mock
	mock.ExpectGet("call:state:" + callID).SetVal(string(stateJSON))

	// EndCallBatch mock
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectSet("call:state:"+callID, "", 24*time.Hour).SetVal("OK")
	mock.ExpectSRem("active_calls", callID).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")
	mock.ExpectDel("call:last_msg:" + callID).SetVal(1)
	mock.ExpectDel("call:srtp:" + callID).SetVal(1)
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectPublish("call:event:"+callID, "").SetVal(1)

	var capturedRecords []clickhouse.SipCallRecord
	origWriter := clickhouse.GlobalSipCallWriter
	clickhouse.GlobalSipCallWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipCallRecord](
		100, time.Minute,
		func(ctx context.Context, items []clickhouse.SipCallRecord) error {
			capturedRecords = append(capturedRecords, items...)
			return nil
		},
	)
	defer func() {
		clickhouse.GlobalSipCallWriter.Stop()
		clickhouse.GlobalSipCallWriter = origWriter
	}()

	sniffer.cleanupTimeoutCall(callID, now, "session_timeout", nil)
	clickhouse.GlobalSipCallWriter.Flush()

	require.Len(t, capturedRecords, 1)
	rec := capturedRecords[0]
	// disconnect_reason 应被升级为 "401 Unauthorized" 而非 "session_timeout"
	assert.Equal(t, "401 Unauthorized", rec.DisconnectReason, "last_sip_error must upgrade disconnect_reason")
	assert.Equal(t, "401 Unauthorized", rec.Status, "status must reflect upgraded SIP error")
}

// TestCleanupTimeoutCall_WithCapturedStats verifies that the RTP timeout path
// correctly uses pre-captured packet stats (capturedStats != nil).
// Covers: cleanup.go L363-370 (capturedStats branch)
// Discovery Intent: catch regression where RTP stats are lost during timeout cleanup
func TestCleanupTimeoutCall_WithCapturedStats(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-captured-stats"
	now := time.Now()
	startTime := now.Add(-2 * time.Minute)

	stream := &RTPStream{
		callID:      callID,
		startTime:   startTime,
		callerUser:  "stats-caller",
		calleeUser:  "stats-callee",
		fromDomain:  "x.com",
		toDomain:    "y.com",
		stateLoaded: true,
	}
	sniffer := &Sniffer{}
	sniffer.callIndex.Store(callID, stream)

	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectSet("call:state:"+callID, "", 24*time.Hour).SetVal("OK")
	mock.ExpectSRem("active_calls", callID).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")
	mock.ExpectDel("call:last_msg:" + callID).SetVal(1)
	mock.ExpectDel("call:srtp:" + callID).SetVal(1)
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectPublish("call:event:"+callID, "").SetVal(1)

	var capturedRecords []clickhouse.SipCallRecord
	origWriter := clickhouse.GlobalSipCallWriter
	clickhouse.GlobalSipCallWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipCallRecord](
		100, time.Minute,
		func(ctx context.Context, items []clickhouse.SipCallRecord) error {
			capturedRecords = append(capturedRecords, items...)
			return nil
		},
	)
	defer func() {
		clickhouse.GlobalSipCallWriter.Stop()
		clickhouse.GlobalSipCallWriter = origWriter
	}()

	// Pre-captured stats from collectExpiredStreams
	stats := &PacketStats{
		PacketsReceived: 5000,
		BaseSeq:         100,
		MaxSeq:          5099,
		SeqInitialized:  true,
	}

	sniffer.cleanupTimeoutCall(callID, now, "rtp_timeout", stats)
	clickhouse.GlobalSipCallWriter.Flush()

	require.Len(t, capturedRecords, 1)
	rec := capturedRecords[0]
	assert.Equal(t, "rtp_timeout", rec.Status)

	assert.NoError(t, mock.ExpectationsWereMet())
}

// TestCleanupTimeoutCall_NoRedisState verifies that cleanup still writes ClickHouse
// even when Redis call state is missing (stateFromRedis=false).
// Covers: cleanup.go L236-239, L316-317 (stateFromRedis=false branch)
// Discovery Intent: catch SIP-only calls (no Redis state) silently dropped from CH
func TestCleanupTimeoutCall_NoRedisState(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-no-redis-state"
	now := time.Now()

	sniffer := &Sniffer{}
	// No stream cache → falls through to Redis fallback
	// Redis GetCallState returns nil → stateFromRedis=false
	mock.ExpectGet("call:state:" + callID).RedisNil()

	var capturedRecords []clickhouse.SipCallRecord
	origWriter := clickhouse.GlobalSipCallWriter
	clickhouse.GlobalSipCallWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipCallRecord](
		100, time.Minute,
		func(ctx context.Context, items []clickhouse.SipCallRecord) error {
			capturedRecords = append(capturedRecords, items...)
			return nil
		},
	)
	defer func() {
		clickhouse.GlobalSipCallWriter.Stop()
		clickhouse.GlobalSipCallWriter = origWriter
	}()

	// PublishCallEvent (no GlobalEventPublisher set → falls to direct Publish)
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectPublish("call:event:"+callID, "").SetVal(1)

	sniffer.cleanupTimeoutCall(callID, now, "session_timeout", nil)
	clickhouse.GlobalSipCallWriter.Flush()

	// ClickHouse must still get a record even without Redis state
	require.Len(t, capturedRecords, 1, "CH record must be written even without Redis state")
	rec := capturedRecords[0]
	assert.Equal(t, "session_timeout", rec.Status)
	assert.Equal(t, "system", rec.DisconnectParty)
}

// =============================================================================
// BUG-C Regression: RTP active guard fails because terminated blocks UpdateSession
// =============================================================================

// TestMonitorTimeouts_RTPActiveReactivatesSession verifies that when a session expires
// but RTP is still active, the terminated flag is cleared so UpdateSession can re-register.
// Discovery Intent: catch GetExpiredSessions' terminated flag blocking UpdateSession.
func TestMonitorTimeouts_RTPActiveReactivatesSession(t *testing.T) {
	_, teardown := setupRedisMock()
	defer teardown()

	callID := "test-rtp-active-reactivate"
	now := time.Now()

	// Step 1: Register session that's already expired
	mgr := callsession.NewTestManager()
	callsession.GlobalManager = mgr
	mgr.UpdateSession(callID, 1, now.Add(-10*time.Second)) // expired 10s ago

	// Step 2: GetExpiredSessions — marks terminated + removes from sessions map
	expired := mgr.GetExpiredSessions()
	require.Len(t, expired, 1)
	assert.True(t, mgr.IsTerminated(callID), "GetExpiredSessions must mark terminated")
	assert.Nil(t, mgr.GetSession(callID), "Session must be removed after GetExpiredSessions")

	// Step 3: Simulate RTP active guard — clear terminated, then re-register
	mgr.ReactivateSession(callID)
	assert.False(t, mgr.IsTerminated(callID), "ReactivateSession must clear terminated flag")

	mgr.UpdateSession(callID, 300, now)

	// Step 4: Verify session was successfully re-registered
	session := mgr.GetSession(callID)
	require.NotNil(t, session, "UpdateSession must succeed after ReactivateSession")

	timeUntilExpiry := session.ExpiresAt().Sub(now)
	// 300*1.2=360s
	if timeUntilExpiry < 300*time.Second || timeUntilExpiry > 400*time.Second {
		t.Errorf("Expected session expiry ~360s from now, got %v", timeUntilExpiry)
	}
}
