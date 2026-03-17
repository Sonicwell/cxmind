package hep

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/sip"
	"github.com/cxmind/ingestion-go/internal/timeutil"
	redismock "github.com/go-redis/redismock/v9"
	gocache "github.com/patrickmn/go-cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHandleAnswer_CallerCalleeFallback verifies that handleAnswer writes
// non-empty caller/callee to sip_calls even when the Redis call state
// is missing caller_user / callee_user fields.
//
// Bug: Prior to fix, handleAnswer used data.CallerUser directly from
// ParseCallState(state), which could be empty. The WriteSipCall with
// state_version=2 then overwrote the correct INVITE record (version=1)
// in ClickHouse's ReplacingMergeTree with empty caller/callee.
func TestHandleAnswer_CallerCalleeFallback(t *testing.T) {
	// ── Setup ──
	localCache = gocache.New(5*time.Minute, 10*time.Minute)
	callsession.GlobalManager = callsession.NewTestManager()

	// Mock Redis: return state WITH start_time but WITHOUT caller_user/callee_user
	db, mock := redismock.NewClientMock()
	redis.Client = db
	redis.SetContext(context.Background())
	redis.GlobalEventPublisher = nil

	// State that only has start_time, answer marker and direction — missing caller/callee
	stateWithMissingFields := map[string]interface{}{
		"start_time":  "2026-02-23T07:00:00.000Z",
		"answer_time": "2026-02-23T07:00:05.000Z",
		"status":      "answered",
		"direction":   "outbound",
		// NOTE: caller_user and callee_user intentionally absent
	}

	// Pre-populate local cache with incomplete state
	callID := "test-answer-empty-caller"
	localCache.Set(callID, stateWithMissingFields, 0)

	// Capture SipCallRecords written by handleAnswer
	var capturedRecords []clickhouse.SipCallRecord
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
		clickhouse.GlobalSipCallWriter = nil
	}()

	// ── Construct a 200 OK response to INVITE ──
	sipPayload := "SIP/2.0 200 OK\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.100;branch=z9hG4bK-abc123\r\n" +
		"From: \"Alice\" <sip:1001@192.168.1.100:5060>;tag=tag111\r\n" +
		"To: \"Bob\" <sip:1002@192.168.1.200:5060>;tag=tag222\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 1 INVITE\r\n" +
		"Contact: <sip:1002@192.168.1.200:5060>\r\n" +
		"Content-Length: 0\r\n\r\n"

	sipMsg, err := sip.ParseSIP([]byte(sipPayload))
	require.NoError(t, err)
	require.NotNil(t, sipMsg)

	tsSec := int64(1771830005) // Fixed timestamp
	timestamp := timeutil.Unix(tsSec, 0)

	fromURI := sip.ExtractURI(sipMsg.GetFrom())
	toURI := sip.ExtractURI(sipMsg.GetTo())

	ctx := &sipContext{
		packet: &HEPPacket{
			SrcIP:        "192.168.1.200",
			DstIP:        "192.168.1.100",
			SrcPort:      5060,
			DstPort:      5060,
			TimestampSec: uint32(tsSec),
		},
		sipMsg:     sipMsg,
		callID:     callID,
		timestamp:  timestamp,
		realm:      sip.ExtractDomain(fromURI),
		fromUser:   sip.ExtractUser(fromURI),
		toUser:     sip.ExtractUser(toURI),
		fromDomain: sip.ExtractDomain(fromURI),
		toDomain:   sip.ExtractDomain(toURI),
		state:      stateWithMissingFields,
	}

	// Expect any Redis calls to succeed (we don't care about Redis side-effects here)
	mock.ExpectHGetAll("call:state:" + callID).SetVal(map[string]string{})

	// ── Act ──
	handleAnswer(ctx)

	// Force a flush to ensure the mock generic writer receives the record synchronously
	clickhouse.GlobalSipCallWriter.Flush()

	// ── Assert ──
	require.Len(t, capturedRecords, 1, "handleAnswer should write exactly 1 sip_calls record")
	rec := capturedRecords[0]

	assert.Equal(t, callID, rec.CallID)
	assert.Equal(t, "answered", rec.Status)

	// KEY ASSERTIONS: caller/callee must NOT be empty
	assert.NotEmpty(t, rec.Caller, "Caller must not be empty — should fallback to SIP From user")
	assert.NotEmpty(t, rec.Callee, "Callee must not be empty — should fallback to SIP To user")
	assert.Equal(t, "1001", rec.Caller, "Caller should be extracted from SIP From header")
	assert.Equal(t, "1002", rec.Callee, "Callee should be extracted from SIP To header")

	// DIRECTION ASSERTION: Ensure direction from state survives handleAnswer
	assert.Equal(t, "outbound", rec.Direction, "Direction must carry over from Redis state")
}

// TestHandleAnswer_NilState_RefetchesRedis verifies that when ctx.state is nil
// (e.g., INVITE was processed by another node or localCache expired),
// handleAnswer re-fetches state from Redis rather than writing a near-empty
// clonedState map back to Redis via SetCallState, which would overwrite the
// correct INVITE state with only answer_time/callee_ip/status.
func TestHandleAnswer_NilState_RefetchesRedis(t *testing.T) {
	// ── Setup ──
	localCache = gocache.New(5*time.Minute, 10*time.Minute)
	callsession.GlobalManager = callsession.NewTestManager()

	db, mock := redismock.NewClientMock()
	redis.Client = db
	redis.SetContext(context.Background())
	redis.GlobalEventPublisher = nil

	callID := "test-nil-state-refetch"

	// Redis HAS state from INVITE (processed by another IE node)
	redisState := map[string]interface{}{
		"start_time":       "2026-02-28T10:00:00.000Z",
		"caller_user":      "3001",
		"callee_user":      "3002",
		"from_domain":      "sip.company.com",
		"to_domain":        "sip.vendor.com",
		"caller_name":      "Alice",
		"callee_name":      "Bob",
		"processing_level": float64(2), // JSON numbers decode as float64
		"status":           "active",
		"direction":        "inbound",
	}
	redisJSON, _ := json.Marshal(redisState)

	// handleAnswer should call GetCallState when ctx.state is nil
	// GetCallState uses Client.Get (not HGetAll)
	mock.ExpectGet("call:state:" + callID).SetVal(string(redisJSON))

	// SetCallState uses Pipeline: Set + SAdd + Set (for active_calls:version)
	mock.Regexp().ExpectSet("call:state:"+callID, `.*`, 24*time.Hour).SetVal("OK")
	mock.ExpectSAdd("active_calls", callID).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `.*`, time.Duration(0)).SetVal("OK")

	// Capture SipCallRecords
	var capturedRecords []clickhouse.SipCallRecord
	clickhouse.GlobalSipCallWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipCallRecord](
		100,
		time.Minute,
		func(ctxBg context.Context, items []clickhouse.SipCallRecord) error {
			capturedRecords = append(capturedRecords, items...)
			return nil
		},
	)
	defer func() {
		clickhouse.GlobalSipCallWriter.Stop()
		clickhouse.GlobalSipCallWriter = nil
	}()

	// ── Construct 200 OK ──
	sipPayload := "SIP/2.0 200 OK\r\n" +
		"Via: SIP/2.0/UDP 10.0.0.1;branch=z9hG4bK-xyz789\r\n" +
		"From: \"Alice\" <sip:9991@sip.company.com:5060>;tag=tagA\r\n" +
		"To: \"Bob\" <sip:9992@sip.vendor.com:5060>;tag=tagB\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 1 INVITE\r\n" +
		"Content-Length: 0\r\n\r\n"

	sipMsg, err := sip.ParseSIP([]byte(sipPayload))
	require.NoError(t, err)

	fromURI := sip.ExtractURI(sipMsg.GetFrom())
	toURI := sip.ExtractURI(sipMsg.GetTo())

	ctx := &sipContext{
		packet: &HEPPacket{
			SrcIP:        "10.0.0.2",
			DstIP:        "10.0.0.1",
			SrcPort:      5060,
			DstPort:      5060,
			TimestampSec: uint32(timeutil.Now().Unix()),
		},
		sipMsg:     sipMsg,
		callID:     callID,
		timestamp:  timeutil.Now(),
		realm:      sip.ExtractDomain(fromURI),
		fromUser:   sip.ExtractUser(fromURI),
		toUser:     sip.ExtractUser(toURI),
		fromDomain: sip.ExtractDomain(fromURI),
		toDomain:   sip.ExtractDomain(toURI),
		state:      nil, // ← KEY: state is nil
	}

	// ── Act ──
	require.NotPanics(t, func() {
		handleAnswer(ctx)
	}, "handleAnswer must not panic when ctx.state is nil")

	clickhouse.GlobalSipCallWriter.Flush()

	// ── Assert ──
	require.Len(t, capturedRecords, 1)
	rec := capturedRecords[0]

	assert.Equal(t, callID, rec.CallID)
	assert.Equal(t, "answered", rec.Status)
	// Caller/callee should come from Redis state (re-fetched)
	assert.Equal(t, "3001", rec.Caller, "Caller should come from Redis re-fetched state")
	assert.Equal(t, "3002", rec.Callee, "Callee should come from Redis re-fetched state")
	assert.Equal(t, "inbound", rec.Direction, "Direction should come from Redis re-fetched state")
}
