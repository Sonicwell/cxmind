package hep

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/sip"
	"github.com/patrickmn/go-cache"
	goredis "github.com/redis/go-redis/v9"
	"github.com/spf13/viper"
)

// =============================================================================
// shouldRejectAuth
// =============================================================================

func TestShouldRejectAuth_NoAuthConfigured(t *testing.T) {
	orig := cachedAuthToken.Load()
	func() { s := ""; cachedAuthToken.Store(&s) }()
	defer func() { cachedAuthToken.Store(orig) }()

	packet := &HEPPacket{AuthToken: "anything"}
	if shouldRejectAuth(packet) {
		t.Error("Should not reject when auth is disabled (empty token)")
	}
}

func TestShouldRejectAuth_MatchingToken(t *testing.T) {
	orig := cachedAuthToken.Load()
	func() { s := "secret123"; cachedAuthToken.Store(&s) }()
	defer func() { cachedAuthToken.Store(orig) }()

	packet := &HEPPacket{AuthToken: "secret123"}
	if shouldRejectAuth(packet) {
		t.Error("Should not reject when token matches")
	}
}

func TestShouldRejectAuth_MismatchedToken(t *testing.T) {
	orig := cachedAuthToken.Load()
	func() { s := "secret123"; cachedAuthToken.Store(&s) }()
	defer func() { cachedAuthToken.Store(orig) }()

	packet := &HEPPacket{AuthToken: "wrong"}
	if !shouldRejectAuth(packet) {
		t.Error("Should reject when token does not match")
	}
}

func TestShouldRejectAuth_EmptyPacketToken(t *testing.T) {
	orig := cachedAuthToken.Load()
	func() { s := "secret123"; cachedAuthToken.Store(&s) }()
	defer func() { cachedAuthToken.Store(orig) }()

	packet := &HEPPacket{AuthToken: ""}
	if !shouldRejectAuth(packet) {
		t.Error("Should reject when packet has empty token but auth is configured")
	}
}

// F-4: constant-time比较不会因token长度差异而短路
func TestShouldRejectAuth_ConstantTimeComparison(t *testing.T) {
	orig := cachedAuthToken.Load()
	func() { s := "my-secret-token-12345"; cachedAuthToken.Store(&s) }()
	defer func() { cachedAuthToken.Store(orig) }()

	// 相同长度错误token
	packet := &HEPPacket{AuthToken: "xx-secret-token-12345"}
	if !shouldRejectAuth(packet) {
		t.Error("Should reject same-length mismatches")
	}

	// 不同长度
	packet2 := &HEPPacket{AuthToken: "short"}
	if !shouldRejectAuth(packet2) {
		t.Error("Should reject different-length mismatches")
	}
}

// =============================================================================
// determineEventType
// =============================================================================

func TestDetermineEventType_Invite(t *testing.T) {
	msg := &sip.SIPMessage{Method: "INVITE", IsRequest: true}
	if et := determineEventType(msg); et != "call_create" {
		t.Errorf("Expected call_create, got %q", et)
	}
}

func TestDetermineEventType_Bye(t *testing.T) {
	msg := &sip.SIPMessage{Method: "BYE", IsRequest: true}
	if et := determineEventType(msg); et != "call_hangup" {
		t.Errorf("Expected call_hangup, got %q", et)
	}
}

func TestDetermineEventType_Cancel(t *testing.T) {
	msg := &sip.SIPMessage{Method: "CANCEL", IsRequest: true}
	if et := determineEventType(msg); et != "call_hangup" {
		t.Errorf("Expected call_hangup, got %q", et)
	}
}

func TestDetermineEventType_Refer(t *testing.T) {
	msg := &sip.SIPMessage{Method: "REFER", IsRequest: true}
	if et := determineEventType(msg); et != "transfer_start" {
		t.Errorf("Expected transfer_start, got %q", et)
	}
}

func TestDetermineEventType_180Ringing(t *testing.T) {
	msg := &sip.SIPMessage{StatusCode: 180, IsRequest: false, Headers: make(map[string][]string)}
	if et := determineEventType(msg); et != "caller_ringing" {
		t.Errorf("Expected caller_ringing, got %q", et)
	}
}

func TestDetermineEventType_183SessionProgress(t *testing.T) {
	msg := &sip.SIPMessage{StatusCode: 183, IsRequest: false, Headers: make(map[string][]string)}
	if et := determineEventType(msg); et != "caller_ringing" {
		t.Errorf("Expected caller_ringing, got %q", et)
	}
}

func TestDetermineEventType_200OKInvite(t *testing.T) {
	msg := &sip.SIPMessage{
		StatusCode: 200,
		IsRequest:  false,
		Headers:    map[string][]string{"cseq": {"1 INVITE"}},
	}
	if et := determineEventType(msg); et != "call_answer" {
		t.Errorf("Expected call_answer, got %q", et)
	}
}

func TestDetermineEventType_200OKBye(t *testing.T) {
	msg := &sip.SIPMessage{
		StatusCode: 200,
		IsRequest:  false,
		Headers:    map[string][]string{"cseq": {"1 BYE"}},
	}
	// 200 OK for BYE should return "" (not a termination event from determineEventType)
	if et := determineEventType(msg); et != "" {
		t.Errorf("Expected empty for 200 OK BYE, got %q", et)
	}
}

func TestDetermineEventType_486BusyHere(t *testing.T) {
	msg := &sip.SIPMessage{
		StatusCode: 486,
		IsRequest:  false,
		Headers:    map[string][]string{"cseq": {"1 INVITE"}},
	}
	if et := determineEventType(msg); et != "call_hangup" {
		t.Errorf("Expected call_hangup for 486, got %q", et)
	}
}

func TestDetermineEventType_UnknownRequest(t *testing.T) {
	msg := &sip.SIPMessage{Method: "UPDATE", IsRequest: true}
	if et := determineEventType(msg); et != "" {
		t.Errorf("Expected empty for UPDATE, got %q", et)
	}
}

// =============================================================================
// isReInvite
// =============================================================================

func TestIsReInvite_NilState(t *testing.T) {
	if isReInvite(nil) {
		t.Error("Expected false for nil state")
	}
}

func TestIsReInvite_NoAnswerTime(t *testing.T) {
	state := map[string]interface{}{"status": "active"}
	if isReInvite(state) {
		t.Error("Expected false when no answer_time in state")
	}
}

func TestIsReInvite_WithAnswerTime(t *testing.T) {
	state := map[string]interface{}{
		"status":      "answered",
		"answer_time": "2026-01-01T00:00:00Z",
	}
	if !isReInvite(state) {
		t.Error("Expected true when answer_time exists in state")
	}
}

// =============================================================================
// checkTermination
// =============================================================================

func TestCheckTermination_BYEMethod(t *testing.T) {
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{Method: "BYE", IsRequest: true, Headers: make(map[string][]string)},
	}
	if reason := checkTermination(ctx); reason != "BYE" {
		t.Errorf("Expected BYE, got %q", reason)
	}
}

func TestCheckTermination_CANCELMethod(t *testing.T) {
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{Method: "CANCEL", IsRequest: true, Headers: make(map[string][]string)},
	}
	if reason := checkTermination(ctx); reason != "CANCEL" {
		t.Errorf("Expected CANCEL, got %q", reason)
	}
}

func TestCheckTermination_486OnInitialInvite(t *testing.T) {
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			StatusCode: 486,
			StatusText: "Busy Here",
			IsRequest:  false,
			Headers:    map[string][]string{"cseq": {"1 INVITE"}},
		},
		state: nil, // No state = not established
	}
	reason := checkTermination(ctx)
	if reason == "" {
		t.Error("Expected non-empty reason for 486 on initial INVITE")
	}
}

func TestCheckTermination_486OnReInvite(t *testing.T) {
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			StatusCode: 486,
			StatusText: "Busy Here",
			IsRequest:  false,
			Headers:    map[string][]string{"cseq": {"2 INVITE"}},
		},
		state: map[string]interface{}{
			"answer_time": "2026-01-01T00:00:00Z",
		},
	}
	reason := checkTermination(ctx)
	if reason != "" {
		t.Errorf("Expected empty reason for 486 on established call re-INVITE, got %q", reason)
	}
}

func TestCheckTermination_200OK(t *testing.T) {
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			StatusCode: 200,
			IsRequest:  false,
			Headers:    map[string][]string{"cseq": {"1 INVITE"}},
		},
	}
	if reason := checkTermination(ctx); reason != "" {
		t.Errorf("Expected empty reason for 200 OK, got %q", reason)
	}
}

func TestCheckTermination_100Trying(t *testing.T) {
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			StatusCode: 100,
			IsRequest:  false,
			Headers:    map[string][]string{"cseq": {"1 INVITE"}},
		},
	}
	if reason := checkTermination(ctx); reason != "" {
		t.Errorf("Expected empty reason for 100 Trying, got %q", reason)
	}
}

func TestCheckTermination_401Unauthorized(t *testing.T) {
	// 401 = SIP auth challenge (RFC 3261), UAC will retry with credentials
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			StatusCode: 401,
			StatusText: "Unauthorized",
			IsRequest:  false,
			Headers:    map[string][]string{"cseq": {"1 INVITE"}},
		},
		state: nil,
	}
	if reason := checkTermination(ctx); reason != "" {
		t.Errorf("Expected empty reason for 401 auth challenge, got %q", reason)
	}
}

func TestCheckTermination_407ProxyAuth(t *testing.T) {
	// 407 = proxy auth challenge, same as 401 but for proxy
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			StatusCode: 407,
			StatusText: "Proxy Authentication Required",
			IsRequest:  false,
			Headers:    map[string][]string{"cseq": {"1 INVITE"}},
		},
		state: nil,
	}
	if reason := checkTermination(ctx); reason != "" {
		t.Errorf("Expected empty reason for 407 proxy auth challenge, got %q", reason)
	}
}

// =============================================================================
// CleanupLocalCache
// =============================================================================

func TestCleanupLocalCache_NilSafe(t *testing.T) {
	orig := localCache
	localCache = nil
	defer func() { localCache = orig }()

	// Should not panic
	CleanupLocalCache("test-call")
}

// =============================================================================
// extractMediaDirection (from handlers.go)
// =============================================================================

func TestExtractMediaDirection_SendOnly(t *testing.T) {
	sdp := "v=0\r\nm=audio 49170 RTP/AVP 0\r\na=sendonly\r\n"
	dir := extractMediaDirection(sdp)
	if dir != "sendonly" {
		t.Errorf("Expected sendonly, got %q", dir)
	}
}

func TestExtractMediaDirection_SendRecv(t *testing.T) {
	sdp := "v=0\r\nm=audio 49170 RTP/AVP 0\r\na=sendrecv\r\n"
	dir := extractMediaDirection(sdp)
	if dir != "sendrecv" {
		t.Errorf("Expected sendrecv, got %q", dir)
	}
}

func TestExtractMediaDirection_SessionLevel(t *testing.T) {
	// Session-level a=inactive (before m= line)
	sdp := "v=0\r\na=inactive\r\nm=audio 49170 RTP/AVP 0\r\n"
	dir := extractMediaDirection(sdp)
	if dir != "inactive" {
		t.Errorf("Expected inactive (session-level), got %q", dir)
	}
}

func TestExtractMediaDirection_MediaOverridesSession(t *testing.T) {
	// Media-level should override session-level
	sdp := "v=0\r\na=inactive\r\nm=audio 49170 RTP/AVP 0\r\na=sendonly\r\n"
	dir := extractMediaDirection(sdp)
	if dir != "sendonly" {
		t.Errorf("Expected sendonly (media overrides session), got %q", dir)
	}
}

func TestExtractMediaDirection_NoDirection(t *testing.T) {
	sdp := "v=0\r\nm=audio 49170 RTP/AVP 0\r\n"
	dir := extractMediaDirection(sdp)
	if dir != "" {
		t.Errorf("Expected empty for no direction attribute, got %q", dir)
	}
}

// =============================================================================
// BUG-1: TCP connection limiter should be initialized from config, not hardcoded
// =============================================================================

// TestInitTCPConnLimiter_DefaultValue verifies initTCPConnLimiter uses default 500
// when config key is not set.
func TestInitTCPConnLimiter_DefaultValue(t *testing.T) {
	orig := tcpConnLimiter
	defer func() { tcpConnLimiter = orig }()

	// Reset limiter before calling
	tcpConnLimiter = nil
	initTCPConnLimiter()

	if tcpConnLimiter == nil {
		t.Fatal("Expected tcpConnLimiter to be initialized")
	}
	// Default should cap at 500
	// Acquire 500 times
	for i := 0; i < 500; i++ {
		if !tcpConnLimiter.TryAcquire() {
			t.Fatalf("Expected TryAcquire to succeed at slot %d", i)
		}
	}
	// 501st should fail
	if tcpConnLimiter.TryAcquire() {
		t.Error("Expected TryAcquire to fail at 501 (exceeds default 500)")
	}
}

// TestInitTCPConnLimiter_Idempotent verifies calling initTCPConnLimiter twice
// does NOT reset an already-initialized limiter (prevents breaking active connections).
func TestInitTCPConnLimiter_Idempotent(t *testing.T) {
	orig := tcpConnLimiter
	defer func() { tcpConnLimiter = orig }()

	tcpConnLimiter = nil
	initTCPConnLimiter()
	first := tcpConnLimiter

	// Acquire one slot to mark state
	first.TryAcquire()

	// Call again — must NOT reinitialize
	initTCPConnLimiter()
	if tcpConnLimiter != first {
		t.Error("Expected initTCPConnLimiter to be idempotent (same pointer)")
	}
	// Active count should still be 1 (not reset to 0)
	if tcpConnLimiter.Active() != 1 {
		t.Errorf("Expected active=1 after idempotent call, got %d", tcpConnLimiter.Active())
	}
}

// =============================================================================
// Cached Config (Audit V7 TDD)
// =============================================================================

func TestInitCachedConfig_IgnorePorts(t *testing.T) {
	// Setup test config via global viper
	origPorts := viper.GetIntSlice("sniffer.ignore_ports")
	viper.Set("sniffer.ignore_ports", []int{5061, 5062})
	defer func() { viper.Set("sniffer.ignore_ports", origPorts) }()

	// Trigger reload
	initCachedConfig()

	// Verify cached map
	portsMapPtr := cachedIgnorePorts.Load()
	if portsMapPtr == nil {
		t.Fatalf("Expected cachedIgnorePorts to be initialized")
	}

	portsMap := *portsMapPtr
	if !portsMap[5061] {
		t.Errorf("Expected port 5061 to be ignored")
	}
	if !portsMap[5062] {
		t.Errorf("Expected port 5062 to be ignored")
	}
	if len(portsMap) != 2 {
		t.Errorf("Expected exactly 2 ignored ports, got %d", len(portsMap))
	}
}

// =============================================================================
// TDD Regression Test for Call_Create ClickHouse Write
// =============================================================================
func TestHandleSIPPayload_INVITE_WritesCallCreate(t *testing.T) {
	// 1. Setup minimal environment
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	callsession.GlobalManager = callsession.NewTestManager()

	// Mock Redis to avoid real Publish errors
	redis.Client = nil
	redis.GlobalEventPublisher = nil

	// 2. Setup mock ClickHouse Writer for CallEvents
	var capturedEvents []clickhouse.CallEventRecord
	origWriter := clickhouse.GlobalCallEventWriter
	defer func() { clickhouse.GlobalCallEventWriter = origWriter }()

	clickhouse.GlobalCallEventWriter = clickhouse.NewGenericBatchWriter[clickhouse.CallEventRecord](1, time.Millisecond, func(ctx context.Context, items []clickhouse.CallEventRecord) error {
		capturedEvents = append(capturedEvents, items...)
		return nil
	})

	// Setup SIP message writer to avoid nil panics if enabled
	origSipWriter := clickhouse.GlobalSipMessageWriter
	defer func() { clickhouse.GlobalSipMessageWriter = origSipWriter }()
	clickhouse.GlobalSipMessageWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipMessageRecord](1, time.Millisecond, func(ctx context.Context, items []clickhouse.SipMessageRecord) error {
		return nil
	})

	// 3. Construct SIP INVITE Packet
	tsSec := int64(1704110400)
	sipPayload := "INVITE sip:bob@example.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-74bf9\r\n" +
		"From: Alice <sip:alice@example.com>;tag=12345\r\n" +
		"To: Bob <sip:bob@example.com>\r\n" +
		"Call-ID: test-invite-123\r\n" +
		"CSeq: 1 INVITE\r\n" +
		"Contact: <sip:alice@192.168.1.1>\r\n" +
		"Content-Length: 0\r\n\r\n"

	packet := &HEPPacket{
		SrcIP:        "192.168.1.1",
		DstIP:        "10.0.0.1",
		SrcPort:      5060,
		DstPort:      5060,
		TimestampSec: uint32(tsSec),
		ProtocolType: PROTO_SIP,
		Payload:      []byte(sipPayload),
	}

	// 4. Run Handler
	HandleSIPPayload(packet)

	// Wait a tiny bit for the goroutine flush to happen if any, but our batch size is 1
	// actually Stop() will flush synchronously
	clickhouse.GlobalCallEventWriter.Stop()

	// 5. Assert that CallEventRecord for call_create was captured
	found := false
	for _, e := range capturedEvents {
		if e.EventType == "call_create" && e.CallID == "test-invite-123" {
			found = true
			break
		}
	}

	if !found {
		t.Errorf("Expected call_create event to be written to ClickHouse, but it was missing from captured events: %v", capturedEvents)
	}
}

func TestHandleSIPPayload_INVITE_AuthChallenge_OneCallCreate(t *testing.T) {
	// 1. Setup minimal environment
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	callsession.GlobalManager = callsession.NewTestManager()

	// Mock Redis using miniredis
	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer s.Close()

	redis.Client = goredis.NewClient(&goredis.Options{
		Addr: s.Addr(),
	})
	redis.SetContext(context.Background())
	redis.GlobalEventPublisher = nil

	// 2. Setup mock ClickHouse Writer for CallEvents
	var capturedEvents []clickhouse.CallEventRecord
	origWriter := clickhouse.GlobalCallEventWriter
	defer func() { clickhouse.GlobalCallEventWriter = origWriter }()

	clickhouse.GlobalCallEventWriter = clickhouse.NewGenericBatchWriter[clickhouse.CallEventRecord](1, time.Millisecond, func(ctx context.Context, items []clickhouse.CallEventRecord) error {
		capturedEvents = append(capturedEvents, items...)
		return nil
	})

	origSipWriter := clickhouse.GlobalSipMessageWriter
	defer func() { clickhouse.GlobalSipMessageWriter = origSipWriter }()
	clickhouse.GlobalSipMessageWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipMessageRecord](1, time.Millisecond, func(ctx context.Context, items []clickhouse.SipMessageRecord) error {
		return nil
	})

	// 3. First Initial INVITE (No Auth)
	tsSec := int64(1704110400)
	invite1 := "INVITE sip:bob@example.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-1\r\n" +
		"From: Alice <sip:alice@example.com>;tag=1\r\n" +
		"To: Bob <sip:bob@example.com>\r\n" +
		"Call-ID: test-401-challenge\r\n" +
		"CSeq: 1 INVITE\r\n" +
		"Contact: <sip:alice@192.168.1.1>\r\n" +
		"Content-Length: 0\r\n\r\n"

	packet1 := &HEPPacket{
		SrcIP:        "192.168.1.1",
		DstIP:        "10.0.0.1",
		SrcPort:      5060,
		DstPort:      5060,
		TimestampSec: uint32(tsSec),
		ProtocolType: PROTO_SIP,
		Payload:      []byte(invite1),
	}
	HandleSIPPayload(packet1)

	// In real life, server replies 401 Unauthorized here...

	// 4. Second INVITE (With Auth, Same Call-ID, Higher CSeq)
	invite2 := "INVITE sip:bob@example.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-2\r\n" +
		"From: Alice <sip:alice@example.com>;tag=1\r\n" +
		"To: Bob <sip:bob@example.com>\r\n" +
		"Call-ID: test-401-challenge\r\n" +
		"CSeq: 2 INVITE\r\n" +
		"Contact: <sip:alice@192.168.1.1>\r\n" +
		"Authorization: Digest username=\"alice\", realm=\"example.com\", nonce=\"...\"\r\n" +
		"Content-Length: 0\r\n\r\n"

	packet2 := &HEPPacket{
		SrcIP:        "192.168.1.1",
		DstIP:        "10.0.0.1",
		SrcPort:      5060,
		DstPort:      5060,
		TimestampSec: uint32(tsSec + 1), // 1 second later
		ProtocolType: PROTO_SIP,
		Payload:      []byte(invite2),
	}
	HandleSIPPayload(packet2)

	clickhouse.GlobalCallEventWriter.Stop()

	// 5. Assert that CallEventRecord for call_create was captured EXACTLY ONCE
	createCount := 0
	for _, e := range capturedEvents {
		if e.EventType == "call_create" && e.CallID == "test-401-challenge" {
			createCount++
		}
	}

	if createCount != 1 {
		t.Errorf("Expected exactly ONE call_create event due to auth challenge retry, got %d", createCount)
	}
}

func TestHandleSDP_WritesHoldResumeToClickHouse(t *testing.T) {
	// 1. Setup minimal environment
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	callsession.GlobalManager = callsession.NewTestManager()

	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer s.Close()

	redis.Client = goredis.NewClient(&goredis.Options{Addr: s.Addr()})
	redis.SetContext(context.Background())
	redis.GlobalEventPublisher = nil

	// Seed call state with answer_time so handleSDP considers it a re-INVITE SDP
	redis.SetCallState("test-hold-1", map[string]interface{}{
		"start_time":  time.Now().Format(time.RFC3339),
		"answer_time": time.Now().Format(time.RFC3339),
		"status":      "active",
	})

	// 2. Mock ClickHouse
	var capturedEvents []clickhouse.CallEventRecord
	origWriter := clickhouse.GlobalCallEventWriter
	defer func() { clickhouse.GlobalCallEventWriter = origWriter }()

	clickhouse.GlobalCallEventWriter = clickhouse.NewGenericBatchWriter[clickhouse.CallEventRecord](1, time.Millisecond, func(ctx context.Context, items []clickhouse.CallEventRecord) error {
		capturedEvents = append(capturedEvents, items...)
		return nil
	})

	origSipWriter := clickhouse.GlobalSipMessageWriter
	defer func() { clickhouse.GlobalSipMessageWriter = origSipWriter }()
	clickhouse.GlobalSipMessageWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipMessageRecord](1, time.Millisecond, func(ctx context.Context, items []clickhouse.SipMessageRecord) error {
		return nil
	})

	sdp := "v=0\r\n" +
		"o=alice 2890844526 2890844526 IN IP4 192.168.1.1\r\n" +
		"s=-\r\n" +
		"c=IN IP4 192.168.1.1\r\n" +
		"t=0 0\r\n" +
		"m=audio 49170 RTP/AVP 0\r\n" +
		"a=sendonly\r\n"

	reInvite := "INVITE sip:bob@example.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-hold\r\n" +
		"From: Alice <sip:alice@example.com>;tag=1\r\n" +
		"To: Bob <sip:bob@example.com>;tag=2\r\n" +
		"Call-ID: test-hold-1\r\n" +
		"CSeq: 3 INVITE\r\n" +
		"Content-Type: application/sdp\r\n" +
		fmt.Sprintf("Content-Length: %d\r\n\r\n", len(sdp)) +
		sdp

	packet := &HEPPacket{
		SrcIP:        "192.168.1.1",
		DstIP:        "10.0.0.1",
		SrcPort:      5060,
		DstPort:      5060,
		TimestampSec: uint32(time.Now().Unix()),
		ProtocolType: PROTO_SIP,
		Payload:      []byte(reInvite),
	}

	// This will route to handleSDP which triggers publishHoldResumeEvent
	HandleSIPPayload(packet)
	clickhouse.GlobalCallEventWriter.Stop()

	// 4. Assert
	holdCount := 0
	for _, e := range capturedEvents {
		if e.EventType == "call_hold" && e.CallID == "test-hold-1" {
			holdCount++
		}
	}

	if holdCount != 1 {
		t.Errorf("Expected strictly ONE call_hold event captured in ClickHouse mock, got %d", holdCount)
	}
}

func TestHoldDurationCalculation(t *testing.T) {
	// 1. Setup Miniredis
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("Failed to start miniredis: %v", err)
	}
	defer mr.Close()

	redis.Client = goredis.NewClient(&goredis.Options{Addr: mr.Addr()})
	redis.SetContext(context.Background())
	defer redis.Client.Close()

	localCache = cache.New(5*time.Minute, 10*time.Minute)
	callsession.GlobalManager = callsession.NewTestManager()

	// 2. Setup mock ClickHouse writer for sip_calls
	var capturedCalls []clickhouse.SipCallRecord
	origWriter := clickhouse.GlobalSipCallWriter
	defer func() { clickhouse.GlobalSipCallWriter = origWriter }()
	clickhouse.GlobalSipCallWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipCallRecord](1, time.Millisecond, func(ctx context.Context, items []clickhouse.SipCallRecord) error {
		capturedCalls = append(capturedCalls, items...)
		return nil
	})

	// 3. Create initial state
	callID := "test-hold-calc-1"
	initialState := map[string]interface{}{
		"status":      "answered",
		"start_time":  time.Now().Format(time.RFC3339),
		"answer_time": time.Now().Format(time.RFC3339),
		"caller_uri":  "sip:1001@example.com",
		"callee_uri":  "sip:1002@example.com",
		"direction":   "inbound",
		"sig_src_ip":  "192.168.1.1",
		"sig_dst_ip":  "10.0.0.1",
	}
	redis.SetCallState(callID, initialState)

	// SDP strings
	sdpHold := "v=0\r\no=alice 2890844526 2890844526 IN IP4 192.168.1.1\r\ns=-\r\nc=IN IP4 192.168.1.1\r\nt=0 0\r\nm=audio 49170 RTP/AVP 0\r\na=sendonly\r\n"
	sdpResume := "v=0\r\no=alice 2890844526 2890844526 IN IP4 192.168.1.1\r\ns=-\r\nc=IN IP4 192.168.1.1\r\nt=0 0\r\nm=audio 49170 RTP/AVP 0\r\na=sendrecv\r\n"

	createSdpPacket := func(sdp string) *HEPPacket {
		msg := "INVITE sip:bob@example.com SIP/2.0\r\n" +
			"Call-ID: " + callID + "\r\n" +
			"Content-Type: application/sdp\r\n" +
			fmt.Sprintf("Content-Length: %d\r\n\r\n", len(sdp)) +
			sdp

		return &HEPPacket{
			SrcIP:        "192.168.1.1",
			DstIP:        "10.0.0.1",
			SrcPort:      5060,
			DstPort:      5060,
			TimestampSec: uint32(time.Now().Unix()),
			ProtocolType: PROTO_SIP,
			Payload:      []byte(msg),
		}
	}

	// 4. Simulate Hold (Time 0)
	HandleSIPPayload(createSdpPacket(sdpHold))

	// Simulate 2 seconds of Hold
	time.Sleep(2 * time.Second)

	// 5. Simulate Resume (Time 2)
	HandleSIPPayload(createSdpPacket(sdpResume))

	// Simulate 1 second of Talk
	time.Sleep(1 * time.Second)

	// 6. Simulate Hold Again (Time 3)
	HandleSIPPayload(createSdpPacket(sdpHold))

	// Simulate 1 second of Hold
	time.Sleep(1 * time.Second)

	// 7. Simulate BYE (Ended on hold)
	byeMsg := "BYE sip:bob@example.com SIP/2.0\r\nCall-ID: " + callID + "\r\n"
	HandleSIPPayload(&HEPPacket{
		SrcIP:        "192.168.1.1",
		DstIP:        "10.0.0.1",
		TimestampSec: uint32(time.Now().Unix()),
		ProtocolType: PROTO_SIP,
		Payload:      []byte(byeMsg),
	})

	clickhouse.GlobalSipCallWriter.Stop()

	// 8. Assertions
	if len(capturedCalls) != 1 {
		t.Fatalf("Expected exactly 1 call recorded in ClickHouse, got %d", len(capturedCalls))
	}

	call := capturedCalls[0]

	// Total hold duration should be ~3 seconds (2s from first hold, 1s from second hold)
	if call.HoldDuration < 2 || call.HoldDuration > 4 {
		t.Errorf("Expected HoldDuration to be around 3 seconds, got %d", call.HoldDuration)
	}

	if call.HoldCount != 2 {
		t.Errorf("Expected HoldCount to be 2, got %d", call.HoldCount)
	}

	if call.EndedOnHold != 1 {
		t.Errorf("Expected EndedOnHold to be 1, got %d", call.EndedOnHold)
	}
}

// 回归测试: 无 hold 前置时，sendrecv re-INVITE 不应触发 call_resume
// Discovery Intent: 精确命中"普通 re-INVITE(codec重协商/session-timer)被误报为 call_resume"的 bug
func TestReInviteSendrecv_NoHold_ShouldNotTriggerResume(t *testing.T) {
	// 1. Setup
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	callsession.GlobalManager = callsession.NewTestManager()

	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer s.Close()

	redis.Client = goredis.NewClient(&goredis.Options{Addr: s.Addr()})
	redis.SetContext(context.Background())
	redis.GlobalEventPublisher = nil

	// Seed: 已通话状态，无 hold_start_time
	redis.SetCallState("test-no-hold-reinvite", map[string]interface{}{
		"start_time":  time.Now().Format(time.RFC3339),
		"answer_time": time.Now().Format(time.RFC3339),
		"status":      "answered",
	})

	// 2. Mock ClickHouse — capture call_events
	var capturedEvents []clickhouse.CallEventRecord
	origWriter := clickhouse.GlobalCallEventWriter
	defer func() { clickhouse.GlobalCallEventWriter = origWriter }()

	clickhouse.GlobalCallEventWriter = clickhouse.NewGenericBatchWriter[clickhouse.CallEventRecord](1, time.Millisecond, func(ctx context.Context, items []clickhouse.CallEventRecord) error {
		capturedEvents = append(capturedEvents, items...)
		return nil
	})

	origSipWriter := clickhouse.GlobalSipMessageWriter
	defer func() { clickhouse.GlobalSipMessageWriter = origSipWriter }()
	clickhouse.GlobalSipMessageWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipMessageRecord](1, time.Millisecond, func(ctx context.Context, items []clickhouse.SipMessageRecord) error {
		return nil
	})

	// 3. sendrecv re-INVITE (普通 codec 重协商，非 resume)
	sdp := "v=0\r\n" +
		"o=root 1240713592 1240713593 IN IP4 192.168.1.70\r\n" +
		"s=Asterisk PBX 13.38.3\r\n" +
		"c=IN IP4 192.168.1.70\r\n" +
		"t=0 0\r\n" +
		"m=audio 19630 RTP/AVP 0 8 18 101\r\n" +
		"a=sendrecv\r\n"

	reInvite := "INVITE sip:alice@192.168.1.131 SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.70:5060;branch=z9hG4bK-reinv\r\n" +
		"From: <sip:1001@192.168.1.70>;tag=from1\r\n" +
		"To: <sip:2001@192.168.1.131>;tag=to1\r\n" +
		"Call-ID: test-no-hold-reinvite\r\n" +
		"CSeq: 102 INVITE\r\n" +
		"Content-Type: application/sdp\r\n" +
		fmt.Sprintf("Content-Length: %d\r\n\r\n", len(sdp)) +
		sdp

	packet := &HEPPacket{
		SrcIP:        "192.168.1.70",
		DstIP:        "192.168.1.131",
		SrcPort:      5060,
		DstPort:      5060,
		TimestampSec: uint32(time.Now().Unix()),
		ProtocolType: PROTO_SIP,
		Payload:      []byte(reInvite),
	}

	HandleSIPPayload(packet)
	clickhouse.GlobalCallEventWriter.Stop()

	// 4. 断言: 不应有 call_resume 事件
	for _, e := range capturedEvents {
		if e.EventType == "call_resume" && e.CallID == "test-no-hold-reinvite" {
			t.Errorf("Expected NO call_resume event for sendrecv re-INVITE without prior hold, but got one")
		}
	}
}

// TDD 红灯: re-INVITE 200 OK 不应产生重复 call_answer 事件
// Discovery Intent: 精确命中"re-INVITE 200 OK 被 handleAnswer + publishAndRecordEvent 双重触发"的 bug
func TestReInvite200OK_ShouldNotDuplicateCallAnswer(t *testing.T) {
	// 1. Setup
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	callsession.GlobalManager = callsession.NewTestManager()

	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer s.Close()

	redis.Client = goredis.NewClient(&goredis.Options{Addr: s.Addr()})
	redis.SetContext(context.Background())
	redis.GlobalEventPublisher = nil

	// 2. Mock ClickHouse
	var capturedEvents []clickhouse.CallEventRecord
	origWriter := clickhouse.GlobalCallEventWriter
	defer func() { clickhouse.GlobalCallEventWriter = origWriter }()
	clickhouse.GlobalCallEventWriter = clickhouse.NewGenericBatchWriter[clickhouse.CallEventRecord](1, time.Millisecond, func(ctx context.Context, items []clickhouse.CallEventRecord) error {
		capturedEvents = append(capturedEvents, items...)
		return nil
	})

	origSipWriter := clickhouse.GlobalSipMessageWriter
	defer func() { clickhouse.GlobalSipMessageWriter = origSipWriter }()
	clickhouse.GlobalSipMessageWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipMessageRecord](1, time.Millisecond, func(ctx context.Context, items []clickhouse.SipMessageRecord) error {
		return nil
	})

	callID := "test-dup-answer-1"

	// 3. Step 1: 发送初始 INVITE
	invite := "INVITE sip:bob@192.168.1.70 SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.131:5060;branch=z9hG4bK-init\r\n" +
		"From: <sip:alice@192.168.1.131>;tag=from1\r\n" +
		"To: <sip:bob@192.168.1.70>\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 1 INVITE\r\n" +
		"Content-Length: 0\r\n\r\n"

	HandleSIPPayload(&HEPPacket{
		SrcIP: "192.168.1.131", DstIP: "192.168.1.70",
		SrcPort: 5060, DstPort: 5060,
		TimestampSec: uint32(time.Now().Unix()),
		ProtocolType: PROTO_SIP, Payload: []byte(invite),
	})

	// 4. Step 2: 发送 200 OK (初始 INVITE 的应答) — 应产生 call_answer
	ok200 := "SIP/2.0 200 OK\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.131:5060;branch=z9hG4bK-init\r\n" +
		"From: <sip:alice@192.168.1.131>;tag=from1\r\n" +
		"To: <sip:bob@192.168.1.70>;tag=to1\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 1 INVITE\r\n" +
		"Content-Length: 0\r\n\r\n"

	HandleSIPPayload(&HEPPacket{
		SrcIP: "192.168.1.70", DstIP: "192.168.1.131",
		SrcPort: 5060, DstPort: 5060,
		TimestampSec: uint32(time.Now().Unix()),
		ProtocolType: PROTO_SIP, Payload: []byte(ok200),
	})

	// 5. Step 3: 发送 re-INVITE (codec 重协商 / session-timer)
	sdp := "v=0\r\nc=IN IP4 192.168.1.70\r\nt=0 0\r\nm=audio 19630 RTP/AVP 0\r\na=sendrecv\r\n"
	reInvite := "INVITE sip:alice@192.168.1.131 SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.70:5060;branch=z9hG4bK-reinv\r\n" +
		"From: <sip:bob@192.168.1.70>;tag=to1\r\n" +
		"To: <sip:alice@192.168.1.131>;tag=from1\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 102 INVITE\r\n" +
		"Content-Type: application/sdp\r\n" +
		fmt.Sprintf("Content-Length: %d\r\n\r\n", len(sdp)) + sdp

	HandleSIPPayload(&HEPPacket{
		SrcIP: "192.168.1.70", DstIP: "192.168.1.131",
		SrcPort: 5060, DstPort: 5060,
		TimestampSec: uint32(time.Now().Unix()),
		ProtocolType: PROTO_SIP, Payload: []byte(reInvite),
	})

	// 6. Step 4: 发送 re-INVITE 的 200 OK — 不应产生 call_answer
	reInvOK := "SIP/2.0 200 OK\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.70:5060;branch=z9hG4bK-reinv\r\n" +
		"From: <sip:bob@192.168.1.70>;tag=to1\r\n" +
		"To: <sip:alice@192.168.1.131>;tag=from1\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 102 INVITE\r\n" +
		"Content-Type: application/sdp\r\n" +
		fmt.Sprintf("Content-Length: %d\r\n\r\n", len(sdp)) + sdp

	HandleSIPPayload(&HEPPacket{
		SrcIP: "192.168.1.131", DstIP: "192.168.1.70",
		SrcPort: 5060, DstPort: 5060,
		TimestampSec: uint32(time.Now().Unix()),
		ProtocolType: PROTO_SIP, Payload: []byte(reInvOK),
	})

	clickhouse.GlobalCallEventWriter.Stop()

	// 7. 断言: call_answer 应只出现 1 次
	answerCount := 0
	for _, e := range capturedEvents {
		if e.EventType == "call_answer" && e.CallID == callID {
			answerCount++
		}
	}

	if answerCount != 1 {
		t.Errorf("Expected exactly 1 call_answer event, got %d (re-INVITE 200 OK should NOT produce duplicate)", answerCount)
	}
}

// =============================================================================
// INVITE 8s Short Timeout E2E Tests
// =============================================================================

// TestHandleSIPPayload_INVITE_RegistersShortTimeout verifies that the first INVITE
// registers a session with InviteNoReplyTimeout (8s), not DefaultSessionExpires (300s).
// Discovery Intent: catch regression where INVITE uses full 300s timeout.
func TestHandleSIPPayload_INVITE_RegistersShortTimeout(t *testing.T) {
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	mgr := callsession.NewTestManager()
	callsession.GlobalManager = mgr

	redis.Client = nil
	redis.GlobalEventPublisher = nil

	origSipWriter := clickhouse.GlobalSipMessageWriter
	defer func() { clickhouse.GlobalSipMessageWriter = origSipWriter }()
	clickhouse.GlobalSipMessageWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipMessageRecord](
		100, time.Minute, func(ctx context.Context, items []clickhouse.SipMessageRecord) error { return nil },
	)

	origEvWriter := clickhouse.GlobalCallEventWriter
	defer func() { clickhouse.GlobalCallEventWriter = origEvWriter }()
	clickhouse.GlobalCallEventWriter = clickhouse.NewGenericBatchWriter[clickhouse.CallEventRecord](
		100, time.Minute, func(ctx context.Context, items []clickhouse.CallEventRecord) error { return nil },
	)

	callID := "test-invite-short-timeout"
	invite := "INVITE sip:bob@example.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-1\r\n" +
		"From: Alice <sip:alice@example.com>;tag=1\r\n" +
		"To: Bob <sip:bob@example.com>\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 1 INVITE\r\n" +
		"Content-Length: 0\r\n\r\n"

	packet := &HEPPacket{
		SrcIP: "192.168.1.1", DstIP: "10.0.0.1",
		SrcPort: 5060, DstPort: 5060,
		TimestampSec: uint32(time.Now().Unix()),
		ProtocolType: PROTO_SIP,
		Payload:      []byte(invite),
	}

	HandleSIPPayload(packet)

	// Verify session was registered with short timeout (8s)
	session := mgr.GetSession(callID)
	if session == nil {
		t.Fatal("Expected session to be registered after INVITE")
	}

	// ExpiresAt should be approximately now + 8s * 1.2 margin = ~9.6s, not 300s * 1.2 = 360s
	timeUntilExpiry := time.Until(session.ExpiresAt())
	if timeUntilExpiry > 15*time.Second {
		t.Errorf("INVITE should register with ~8s timeout, but got expiry in %v (suggests 300s was used)", timeUntilExpiry)
	}
	if timeUntilExpiry < 5*time.Second {
		t.Errorf("INVITE timeout too short: %v", timeUntilExpiry)
	}

	clickhouse.GlobalSipMessageWriter.Stop()
	clickhouse.GlobalCallEventWriter.Stop()
}

// TestHandleSIPPayload_INVITE_RetransmitNoRefresh verifies that INVITE retransmissions
// do NOT refresh the session timeout (skipDefaultSession=true for INVITE with existing state).
// Discovery Intent: catch regression where retransmit keeps extending timeout indefinitely.
func TestHandleSIPPayload_INVITE_RetransmitNoRefresh(t *testing.T) {
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	mgr := callsession.NewTestManager()
	callsession.GlobalManager = mgr

	// Use miniredis for state storage
	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer s.Close()
	redis.Client = goredis.NewClient(&goredis.Options{Addr: s.Addr()})
	redis.SetContext(context.Background())
	redis.GlobalEventPublisher = nil

	origSipWriter := clickhouse.GlobalSipMessageWriter
	defer func() { clickhouse.GlobalSipMessageWriter = origSipWriter }()
	clickhouse.GlobalSipMessageWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipMessageRecord](
		100, time.Minute, func(ctx context.Context, items []clickhouse.SipMessageRecord) error { return nil },
	)

	origEvWriter := clickhouse.GlobalCallEventWriter
	defer func() { clickhouse.GlobalCallEventWriter = origEvWriter }()
	clickhouse.GlobalCallEventWriter = clickhouse.NewGenericBatchWriter[clickhouse.CallEventRecord](
		100, time.Minute, func(ctx context.Context, items []clickhouse.CallEventRecord) error { return nil },
	)

	callID := "test-invite-retransmit"
	makeInvitePacket := func(tsSec int64) *HEPPacket {
		invite := "INVITE sip:bob@example.com SIP/2.0\r\n" +
			"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-1\r\n" +
			"From: Alice <sip:alice@example.com>;tag=1\r\n" +
			"To: Bob <sip:bob@example.com>\r\n" +
			"Call-ID: " + callID + "\r\n" +
			"CSeq: 1 INVITE\r\n" +
			"Content-Length: 0\r\n\r\n"
		return &HEPPacket{
			SrcIP: "192.168.1.1", DstIP: "10.0.0.1",
			SrcPort: 5060, DstPort: 5060,
			TimestampSec: uint32(tsSec),
			ProtocolType: PROTO_SIP,
			Payload:      []byte(invite),
		}
	}

	now := time.Now().Unix()

	// First INVITE → creates session with 8s timeout
	HandleSIPPayload(makeInvitePacket(now))

	session1 := mgr.GetSession(callID)
	if session1 == nil {
		t.Fatal("Expected session after first INVITE")
	}
	expiresAfterFirst := session1.ExpiresAt()

	// INVITE retransmit 2 seconds later → should NOT refresh
	HandleSIPPayload(makeInvitePacket(now + 2))

	session2 := mgr.GetSession(callID)
	if session2 == nil {
		t.Fatal("Session should still exist after retransmit")
	}

	// ExpiresAt should NOT have changed (retransmit skipped UpdateSession)
	if !session2.ExpiresAt().Equal(expiresAfterFirst) {
		t.Errorf("INVITE retransmit should NOT refresh timeout. Before=%v, After=%v", expiresAfterFirst, session2.ExpiresAt())
	}

	clickhouse.GlobalSipMessageWriter.Stop()
	clickhouse.GlobalCallEventWriter.Stop()
}

// =============================================================================
// BUG-A Regression: 401 last_sip_error pollution
// =============================================================================

// TestSkipDefaultSession_401ThenResponseExtendsSession verifies that after INVITE → 401 → INVITE(auth),
// a subsequent 100 Trying still extends the session to 300s despite last_sip_error in state.
// Discovery Intent: catch last_sip_error pollution blocking UpdateSession for non-INVITE responses.
func TestSkipDefaultSession_401ThenResponseExtendsSession(t *testing.T) {
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	mgr := callsession.NewTestManager()
	callsession.GlobalManager = mgr

	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer s.Close()
	redis.Client = goredis.NewClient(&goredis.Options{Addr: s.Addr()})
	redis.SetContext(context.Background())
	redis.GlobalEventPublisher = nil

	origSipWriter := clickhouse.GlobalSipMessageWriter
	defer func() { clickhouse.GlobalSipMessageWriter = origSipWriter }()
	clickhouse.GlobalSipMessageWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipMessageRecord](
		100, time.Minute, func(ctx context.Context, items []clickhouse.SipMessageRecord) error { return nil },
	)

	origEvWriter := clickhouse.GlobalCallEventWriter
	defer func() { clickhouse.GlobalCallEventWriter = origEvWriter }()
	clickhouse.GlobalCallEventWriter = clickhouse.NewGenericBatchWriter[clickhouse.CallEventRecord](
		100, time.Minute, func(ctx context.Context, items []clickhouse.CallEventRecord) error { return nil },
	)

	callID := "test-401-session-extend"
	now := time.Now().Unix()

	// Step 1: Initial INVITE → creates session with 8s timeout
	invite1 := "INVITE sip:bob@example.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-1\r\n" +
		"From: Alice <sip:alice@example.com>;tag=1\r\n" +
		"To: Bob <sip:bob@example.com>\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 1 INVITE\r\n" +
		"Content-Length: 0\r\n\r\n"

	HandleSIPPayload(&HEPPacket{
		SrcIP: "192.168.1.1", DstIP: "10.0.0.1",
		SrcPort: 5060, DstPort: 5060,
		TimestampSec: uint32(now),
		ProtocolType: PROTO_SIP, Payload: []byte(invite1),
	})

	// Step 2: 401 Unauthorized → writes last_sip_error + ShortenSession(33)
	resp401 := "SIP/2.0 401 Unauthorized\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-1\r\n" +
		"From: Alice <sip:alice@example.com>;tag=1\r\n" +
		"To: Bob <sip:bob@example.com>;tag=resp1\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 1 INVITE\r\n" +
		"WWW-Authenticate: Digest realm=\"example.com\", nonce=\"abc123\"\r\n" +
		"Content-Length: 0\r\n\r\n"

	HandleSIPPayload(&HEPPacket{
		SrcIP: "10.0.0.1", DstIP: "192.168.1.1",
		SrcPort: 5060, DstPort: 5060,
		TimestampSec: uint32(now + 1),
		ProtocolType: PROTO_SIP, Payload: []byte(resp401),
	})

	// Step 3: INVITE with auth (higher CSeq)
	invite2 := "INVITE sip:bob@example.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-2\r\n" +
		"From: Alice <sip:alice@example.com>;tag=1\r\n" +
		"To: Bob <sip:bob@example.com>\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 2 INVITE\r\n" +
		"Authorization: Digest username=\"alice\", realm=\"example.com\"\r\n" +
		"Content-Length: 0\r\n\r\n"

	HandleSIPPayload(&HEPPacket{
		SrcIP: "192.168.1.1", DstIP: "10.0.0.1",
		SrcPort: 5060, DstPort: 5060,
		TimestampSec: uint32(now + 2),
		ProtocolType: PROTO_SIP, Payload: []byte(invite2),
	})

	// Step 4: 100 Trying → should extend session to 300s despite last_sip_error
	resp100 := "SIP/2.0 100 Trying\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-2\r\n" +
		"From: Alice <sip:alice@example.com>;tag=1\r\n" +
		"To: Bob <sip:bob@example.com>\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 2 INVITE\r\n" +
		"Content-Length: 0\r\n\r\n"

	HandleSIPPayload(&HEPPacket{
		SrcIP: "10.0.0.1", DstIP: "192.168.1.1",
		SrcPort: 5060, DstPort: 5060,
		TimestampSec: uint32(now + 3),
		ProtocolType: PROTO_SIP, Payload: []byte(resp100),
	})

	// Assert: session should be extended to ~300s, not stuck at 33s
	session := mgr.GetSession(callID)
	if session == nil {
		t.Fatal("Session should exist after 100 Trying")
	}

	timeUntilExpiry := time.Until(session.ExpiresAt())
	// 300*1.2=360s expected. If last_sip_error polluted, it stays at 33*1.2=39.6s or less
	if timeUntilExpiry < 200*time.Second {
		t.Errorf("After 401→INVITE→100 Trying, session should be ~360s but got %v (last_sip_error pollution)", timeUntilExpiry)
	}

	clickhouse.GlobalSipMessageWriter.Stop()
	clickhouse.GlobalCallEventWriter.Stop()
}

// =============================================================================
// BUG-B Regression: re-INVITE blocked by skipDefaultSession
// =============================================================================

// TestSkipDefaultSession_ReInviteRefreshesSession verifies that a re-INVITE
// (Method=INVITE, state has answer_time) refreshes the session to 300s,
// rather than being blocked by the INVITE retransmit guard.
// Discovery Intent: catch re-INVITE being treated as retransmit.
func TestSkipDefaultSession_ReInviteRefreshesSession(t *testing.T) {
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	mgr := callsession.NewTestManager()
	callsession.GlobalManager = mgr

	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer s.Close()
	redis.Client = goredis.NewClient(&goredis.Options{Addr: s.Addr()})
	redis.SetContext(context.Background())
	redis.GlobalEventPublisher = nil

	origSipWriter := clickhouse.GlobalSipMessageWriter
	defer func() { clickhouse.GlobalSipMessageWriter = origSipWriter }()
	clickhouse.GlobalSipMessageWriter = clickhouse.NewGenericBatchWriter[clickhouse.SipMessageRecord](
		100, time.Minute, func(ctx context.Context, items []clickhouse.SipMessageRecord) error { return nil },
	)

	origEvWriter := clickhouse.GlobalCallEventWriter
	defer func() { clickhouse.GlobalCallEventWriter = origEvWriter }()
	clickhouse.GlobalCallEventWriter = clickhouse.NewGenericBatchWriter[clickhouse.CallEventRecord](
		100, time.Minute, func(ctx context.Context, items []clickhouse.CallEventRecord) error { return nil },
	)

	callID := "test-reinvite-refresh"
	now := time.Now().Unix()

	// Seed: established call with answer_time (simulates post-200 OK state)
	redis.SetCallState(callID, map[string]interface{}{
		"start_time":  time.Unix(now-60, 0).Format(time.RFC3339),
		"answer_time": time.Unix(now-55, 0).Format(time.RFC3339),
		"status":      "active",
	})
	// Register session with a known expiry
	callsession.GlobalManager.UpdateSession(callID, 300, time.Unix(now-60, 0))

	sessionBefore := mgr.GetSession(callID)
	if sessionBefore == nil {
		t.Fatal("Session should exist before re-INVITE")
	}
	expiryBefore := sessionBefore.ExpiresAt()

	// Send re-INVITE (higher CSeq, different branch)
	sdp := "v=0\r\nc=IN IP4 192.168.1.70\r\nt=0 0\r\nm=audio 19630 RTP/AVP 0\r\na=sendrecv\r\n"
	reInvite := "INVITE sip:alice@192.168.1.131 SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.70:5060;branch=z9hG4bK-reinv2\r\n" +
		"From: <sip:bob@192.168.1.70>;tag=to1\r\n" +
		"To: <sip:alice@192.168.1.131>;tag=from1\r\n" +
		"Call-ID: " + callID + "\r\n" +
		"CSeq: 102 INVITE\r\n" +
		"Content-Type: application/sdp\r\n" +
		fmt.Sprintf("Content-Length: %d\r\n\r\n", len(sdp)) + sdp

	HandleSIPPayload(&HEPPacket{
		SrcIP: "192.168.1.70", DstIP: "192.168.1.131",
		SrcPort: 5060, DstPort: 5060,
		TimestampSec: uint32(now),
		ProtocolType: PROTO_SIP, Payload: []byte(reInvite),
	})

	// Assert: session should be refreshed (ExpiresAt moved forward)
	sessionAfter := mgr.GetSession(callID)
	if sessionAfter == nil {
		t.Fatal("Session should still exist after re-INVITE")
	}

	if !sessionAfter.ExpiresAt().After(expiryBefore) {
		t.Errorf("re-INVITE should refresh session. Before=%v, After=%v (re-INVITE was blocked by skipDefaultSession)",
			expiryBefore, sessionAfter.ExpiresAt())
	}

	clickhouse.GlobalSipMessageWriter.Stop()
	clickhouse.GlobalCallEventWriter.Stop()
}

// TestHandleInvite_BLegPreservesALegState verifies that when a B-leg INVITE
// arrives (which skips policy lookup because a recorder exists) and ctx.policies is nil,
// handleInvite correctly preserves the ASR policies and processing_level created by the A-leg.
func TestHandleInvite_BLegPreservesALegState(t *testing.T) {
	// Setup Redis using miniredis
	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer s.Close()

	redis.Client = goredis.NewClient(&goredis.Options{Addr: s.Addr()})
	redis.SetContext(context.Background())
	defer redis.Client.Close()

	callID := "test-bleg-overwrite-bug"
	now := time.Now()

	// 1. Simulate A-leg state already saved in Redis.
	// This models what the A-leg INVITE put in Redis after policy lookup.
	aLegState := map[string]interface{}{
		"start_time":        now.Format(time.RFC3339Nano),
		"status":            "active",
		"pcap_enabled":      true,
		"asr_enabled":       true,
		"global_asr_policy": "optional",
		"agent_asr_policy":  "enforced",
		"processing_level":  2, // ASR required Level 2
		"caller_ip":         "192.168.1.41",
	}
	redis.SetCallState(callID, aLegState)

	// 2. Setup a sipContext for the B-leg INVITE.
	// B-leg skipped policy lookup (because recorder exists), so ctx.policies is nil.
	// But it loaded the existing state from Redis.
	ctx := &sipContext{
		packet: &HEPPacket{
			SrcIP: "192.168.1.70", DstIP: "192.168.1.81",
			SrcPort: 5060, DstPort: 6060,
			TimestampSec: uint32(now.Unix()),
		},
		sipMsg: &sip.SIPMessage{
			Method: "INVITE",
		},
		callID:          callID,
		timestamp:       now,
		fromUser:        "customer",
		toUser:          "agent5004",
		policies:        nil,       // Crucial: B-leg has no policies object
		state:           aLegState, // Crucial: but it has the state loaded by handlePacket
		sessionExpires:  1800,
	}

	// 3. Execute handleInvite for the B-leg
	handleInvite(ctx)

	// 4. Retrieve the newly overwritten state from Redis
	newState, err := redis.GetCallState(callID)
	if err != nil {
		t.Fatalf("failed to get call state: %v", err)
	}

	// 5. Assert: The ASR policies and processing_level MUST be preserved
	if asr, ok := newState["asr_enabled"].(bool); !ok || !asr {
		t.Errorf("asr_enabled state was lost! Expected true, got %v", newState["asr_enabled"])
	}
	if pcap, ok := newState["pcap_enabled"].(bool); !ok || !pcap {
		t.Errorf("pcap_enabled state was lost! Expected true, got %v", newState["pcap_enabled"])
	}
	if policy, ok := newState["agent_asr_policy"].(string); !ok || policy != "enforced" {
		t.Errorf("agent_asr_policy state was lost! Expected 'enforced', got %v", newState["agent_asr_policy"])
	}

	// Processing level can be serialized as string/float from redis in tests but we write it as int.
	// In GetCallState it usually unmarshals from JSON if it was processed via map. Redis hash keeps strings.
	// We'll check via ParseCallState which handles the type assertions.
	parsedData := redis.ParseCallState(newState)
	if parsedData.ProcessingLevel != 2 {
		t.Errorf("processing_level degraded! Expected 2, got %d", parsedData.ProcessingLevel)
	}
}
