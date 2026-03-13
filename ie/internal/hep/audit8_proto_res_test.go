package hep

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/pcap"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/sip"
	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/go-redis/redismock/v9"
	"github.com/patrickmn/go-cache"
	"github.com/stretchr/testify/assert"
)

// ─── PROTO-A: handleInvite must use ctx.state for B2BUA direction check ───

func TestHandleInvite_B2BUA_UsesCtxState(t *testing.T) {
	// Setup
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	callsession.GlobalManager = callsession.NewTestManager()
	IsServerIPFunc = func(ip string, port uint16) bool {
		// Both src/dst are "server" → determineLegDirection returns "unknown"
		// This forces the B2BUA branch to be the only path that sets direction
		return false
	}
	defer func() { IsServerIPFunc = nil }()

	db, mock := redismock.NewClientMock()
	redis.Client = db
	redis.SetContext(context.Background())

	// PROTO-A 关键: ctx.state 已包含 A-leg direction=inbound
	// 如果 handleInvite 仍然调用 redis.GetCallState，
	// 这里没有设置对应的 mock expectation → redismock 会 panic/fail
	// 修复后 handleInvite 应直接使用 ctx.state，不触发额外 Redis 调用

	existingState := map[string]interface{}{
		"direction":  "inbound",
		"start_time": "2026-01-01T00:00:00Z",
	}

	// handleInvite 内部会调用:
	// 1. redis.Client.Get for asr:level (processing level check)
	// 2. redis.SetCallState → Pipeline (Set + SAdd active_calls + Set active_calls:version)
	// 修复后不应调用 redis.GetCallState

	// Mock: asr:level 查询返回空 (processing level defaults)
	mock.ExpectGet("asr:level:alice").RedisNil()
	mock.ExpectGet("asr:level:bob").RedisNil()

	// Mock: SetCallState pipeline (Set + SAdd + Set version)
	mock.Regexp().ExpectSet("call:state:b2bua-test-call", `.*`, 24*time.Hour).SetVal("OK")
	mock.ExpectSAdd("active_calls", "b2bua-test-call").SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `.*`, 0).SetVal("OK")

	ctx := &sipContext{
		callID: "b2bua-test-call",
		sipMsg: &sip.SIPMessage{
			IsRequest: true,
			Method:    "INVITE",
		},
		packet: &HEPPacket{
			SrcIP:   "10.0.0.2",
			DstIP:   "10.0.0.3",
			SrcPort: 5060,
			DstPort: 5060,
		},
		fromUser:   "alice",
		toUser:     "bob",
		fromDomain: "example.com",
		toDomain:   "example.com",
		fromURI:    "sip:alice@example.com",
		toURI:      "sip:bob@example.com",
		callerName: "Alice",
		calleeName: "Bob",
		timestamp:  timeutil.Now(),
		state:      existingState, // B-leg: state from A-leg already has direction
	}

	handleInvite(ctx)

	// Redis mock 没有设置 GetCallState expectation
	// 如果代码仍调用 redis.GetCallState → mock 会报 unexpected command 错误
	err := mock.ExpectationsWereMet()
	assert.NoError(t, err, "handleInvite should NOT call redis.GetCallState when ctx.state is available")
}

// ─── RES-A: handleTermination delayed PCAP close ───

func TestHandleTermination_PcapDelayedClose(t *testing.T) {
	// Setup
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	callsession.GlobalManager = callsession.NewTestManager()

	db, mock := redismock.NewClientMock()
	redis.Client = db
	redis.SetContext(context.Background())
	redis.GlobalEventPublisher = nil

	// Init PCAP in temp dir
	tmpDir := t.TempDir()
	pcap.Init(tmpDir)

	callID := "pcap-delay-test"
	ts := timeutil.Now()

	// Pre-create a PCAP recorder
	rec, err := pcap.GetOrCreateRecorder(callID, "test.com", ts)
	assert.NoError(t, err)
	assert.NotNil(t, rec)

	// Verify recorder exists before termination
	assert.NotNil(t, pcap.GetRecorder(callID), "recorder should exist before termination")

	// Mock Redis expectations for handleTermination
	mock.ExpectGet("call:state:" + callID).RedisNil()

	tsSec := int64(ts.Unix())
	sipPayload := "BYE sip:bob@test.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-74bf9\r\n" +
		"From: Alice <sip:alice@test.com>;tag=12345\r\n" +
		"To: Bob <sip:bob@test.com>;tag=67890\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 2 BYE\r\n" +
		"Content-Length: 0\r\n\r\n"

	expectedEvent := &redis.CallEvent{
		EventType:  "call_hangup",
		CallID:     callID,
		Realm:      "test.com",
		CallerURI:  "sip:alice@test.com",
		CalleeURI:  "sip:bob@test.com",
		Timestamp:  timeutil.Unix(tsSec, 0),
		SrcIP:      "192.168.1.1",
		DstIP:      "10.0.0.1",
		Method:     "BYE",
		StatusCode: 0,
	}
	eventJSON, _ := json.Marshal(expectedEvent)
	mock.ExpectPublish("call:event:"+callID, eventJSON).SetVal(1)

	// Run HandleSIPPayload (BYE) — triggers handleTermination
	packet := &HEPPacket{
		SrcIP:        "192.168.1.1",
		DstIP:        "10.0.0.1",
		SrcPort:      5060,
		DstPort:      5060,
		TimestampSec: uint32(tsSec),
		ProtocolType: PROTO_SIP,
		Payload:      []byte(sipPayload),
	}
	HandleSIPPayload(packet)

	// KEY ASSERTION: Recorder should still exist immediately after BYE
	// (delayed close — not closed synchronously)
	assert.NotNil(t, pcap.GetRecorder(callID), "recorder should still exist right after BYE (delayed close)")

	// Wait for delayed close to fire (4s + small margin)
	time.Sleep(4500 * time.Millisecond)

	// Now recorder should be gone
	assert.Nil(t, pcap.GetRecorder(callID), "recorder should be closed after 4s delay")

	// Verify file was written to disk
	entries, _ := os.ReadDir(tmpDir)
	assert.Greater(t, len(entries), 0, "PCAP file should exist on disk")
}
