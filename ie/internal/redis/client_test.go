package redis

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/cxmind/ingestion-go/internal/timeutil"
	goredis "github.com/redis/go-redis/v9"
)

// setupMiniredis creates a miniredis instance and wires it into the package-level Client.
// Returns a cleanup function that must be called when the test ends.
func setupMiniredis(t *testing.T) *miniredis.Miniredis {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	Client = goredis.NewClient(&goredis.Options{Addr: mr.Addr()})
	SetContext(context.Background())
	t.Cleanup(func() {
		Client.Close()
		Client = nil
		mr.Close()
	})
	return mr
}

// ─── Nil guard tests ─────────────────────────────────────

func TestNilClient_PublishCallEvent(t *testing.T) {
	Client = nil
	err := PublishCallEvent(&CallEvent{CallID: "c1"})
	if err != nil {
		t.Fatalf("expected nil error with nil client, got %v", err)
	}
}

func TestNilClient_PublishTranscription(t *testing.T) {
	Client = nil
	err := PublishTranscription("c1", map[string]interface{}{"text": "hi"})
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
}

func TestNilClient_SetCallState(t *testing.T) {
	Client = nil
	err := SetCallState("c1", map[string]interface{}{"status": "active"})
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
}

func TestNilClient_GetCallState(t *testing.T) {
	Client = nil
	state, err := GetCallState("c1")
	if err != nil || state != nil {
		t.Fatalf("expected nil,nil, got %v,%v", state, err)
	}
}

func TestNilClient_SetSRTPKey(t *testing.T) {
	Client = nil
	err := SetSRTPKey("c1", "key123")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
}

func TestNilClient_GetSRTPKey(t *testing.T) {
	Client = nil
	key, err := GetSRTPKey("c1")
	if err != nil || key != "" {
		t.Fatalf("expected empty key, got %q,%v", key, err)
	}
}

func TestNilClient_IsPcapEnabled(t *testing.T) {
	Client = nil
	enabled, err := IsPcapEnabled("user1")
	if err != nil || enabled {
		t.Fatalf("expected false,nil, got %v,%v", enabled, err)
	}
}

func TestNilClient_Close(t *testing.T) {
	Client = nil
	err := Close()
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
}

// ─── Publish / Subscribe tests ───────────────────────────

func TestPublishCallEvent(t *testing.T) {
	mr := setupMiniredis(t)

	sub := Client.Subscribe(Ctx(), "call:event:test-call-1")
	defer sub.Close()
	// need to receive subscription confirmation
	_, err := sub.Receive(Ctx())
	if err != nil {
		t.Fatal(err)
	}

	event := &CallEvent{
		EventType: "call_create",
		CallID:    "test-call-1",
		Realm:     "example.com",
		CallerURI: "sip:100@example.com",
		CalleeURI: "sip:200@example.com",
		Timestamp: timeutil.Now(),
		SrcIP:     "10.0.0.1",
		DstIP:     "10.0.0.2",
	}
	if err := PublishCallEvent(event); err != nil {
		t.Fatal(err)
	}

	mr.FastForward(time.Second)
	msg, err := sub.ReceiveMessage(Ctx())
	if err != nil {
		t.Fatal(err)
	}

	var received CallEvent
	json.Unmarshal([]byte(msg.Payload), &received)
	if received.CallID != "test-call-1" {
		t.Errorf("CallID = %q, want test-call-1", received.CallID)
	}
	if received.EventType != "call_create" {
		t.Errorf("EventType = %q, want call_create", received.EventType)
	}
}

func TestPublishTranscription(t *testing.T) {
	mr := setupMiniredis(t)

	sub := Client.Subscribe(Ctx(), "call:transcription:call-t1")
	defer sub.Close()
	_, _ = sub.Receive(Ctx())

	seg := map[string]interface{}{"text": "hello world", "confidence": 0.95}
	if err := PublishTranscription("call-t1", seg); err != nil {
		t.Fatal(err)
	}

	mr.FastForward(time.Second)
	msg, _ := sub.ReceiveMessage(Ctx())
	var received map[string]interface{}
	json.Unmarshal([]byte(msg.Payload), &received)
	if received["text"] != "hello world" {
		t.Errorf("text = %v, want hello world", received["text"])
	}
}

// ─── Call state tests ─────────────────────────────────────

func TestSetAndGetCallState(t *testing.T) {
	setupMiniredis(t)

	state := map[string]interface{}{
		"status":  "active",
		"call_id": "cs-1",
		"caller":  "sip:100@test.local",
	}
	if err := SetCallState("cs-1", state); err != nil {
		t.Fatal(err)
	}

	got, err := GetCallState("cs-1")
	if err != nil {
		t.Fatal(err)
	}
	if got["status"] != "active" {
		t.Errorf("status = %v, want active", got["status"])
	}
}

func TestSetCallState_ActiveCallsSet(t *testing.T) {
	mr := setupMiniredis(t)

	// active call should be added to active_calls
	SetCallState("ac-1", map[string]interface{}{"status": "active"})
	members, _ := mr.Members("active_calls")
	if len(members) != 1 || members[0] != "ac-1" {
		t.Errorf("active_calls = %v, want [ac-1]", members)
	}

	// ended call should be removed
	SetCallState("ac-1", map[string]interface{}{"status": "ended"})
	members, _ = mr.Members("active_calls")
	if len(members) != 0 {
		t.Errorf("active_calls after ended = %v, want empty", members)
	}
}

func TestGetCallState_NotFound(t *testing.T) {
	setupMiniredis(t)

	_, err := GetCallState("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent key")
	}
}

// ─── SRTP key tests ───────────────────────────────────────

func TestSetAndGetSRTPKey(t *testing.T) {
	setupMiniredis(t)

	if err := SetSRTPKey("srtp-1", "masterkey123"); err != nil {
		t.Fatal(err)
	}

	key, err := GetSRTPKey("srtp-1")
	if err != nil {
		t.Fatal(err)
	}
	if key != "masterkey123" {
		t.Errorf("SRTP key = %q, want masterkey123", key)
	}
}

func TestGetSRTPKey_Missing(t *testing.T) {
	setupMiniredis(t)

	key, err := GetSRTPKey("nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	if key != "" {
		t.Errorf("expected empty string, got %q", key)
	}
}

// ─── EndCallBatch tests ───────────────────────────────────

func TestEndCallBatch(t *testing.T) {
	mr := setupMiniredis(t)

	// First make a call active
	SetCallState("batch-1", map[string]interface{}{"status": "active"})
	SetSRTPKey("batch-1", "key456")

	err := EndCallBatch("batch-1", map[string]interface{}{"caller": "100"})
	if err != nil {
		t.Fatal(err)
	}

	// Verify: call removed from active set
	members, _ := mr.Members("active_calls")
	if len(members) != 0 {
		t.Errorf("active_calls should be empty after EndCallBatch, got %v", members)
	}

	// Verify: SRTP key deleted
	exists := mr.Exists("call:srtp:batch-1")
	if exists {
		t.Error("SRTP key should be deleted after ending call")
	}

	// Verify: state updated to completed
	state, _ := GetCallState("batch-1")
	if state["status"] != "completed" {
		t.Errorf("status = %v, want completed", state["status"])
	}
}

// N2 fix: EndCallBatch must NOT mutate the caller's map.
// Previously state["status"] = "completed" was written in-place.
func TestEndCallBatch_DoesNotMutateCallerMap(t *testing.T) {
	setupMiniredis(t)

	callerState := map[string]interface{}{
		"status": "active",
		"caller": "sip:100@test.local",
	}

	err := EndCallBatch("nomutate-1", callerState)
	if err != nil {
		t.Fatal(err)
	}

	// The caller's map must still say "active" — not "completed"
	if callerState["status"] != "active" {
		t.Errorf("EndCallBatch mutated caller map: status = %v, want active", callerState["status"])
	}
}

// ─── PCAP enabled / realm tests ───────────────────────────

func TestIsPcapEnabled(t *testing.T) {
	mr := setupMiniredis(t)

	mr.SAdd("pcap:enabled_users", "user1")

	enabled, err := IsPcapEnabled("user1")
	if err != nil || !enabled {
		t.Errorf("expected true, got %v,%v", enabled, err)
	}

	enabled, err = IsPcapEnabled("user2")
	if err != nil || enabled {
		t.Errorf("expected false, got %v,%v", enabled, err)
	}
}

func TestIsPcapRealmEnabled(t *testing.T) {
	mr := setupMiniredis(t)
	mr.SAdd("pcap:enabled_realms", "example.com")

	enabled, err := IsPcapRealmEnabled("example.com")
	if err != nil || !enabled {
		t.Errorf("expected true, got %v,%v", enabled, err)
	}
}

// ─── Context tests ────────────────────────────────────────

func TestSetContext(t *testing.T) {
	original := Ctx()
	newCtx, cancel := context.WithCancel(context.Background())
	defer cancel()

	SetContext(newCtx)
	if Ctx() != newCtx {
		t.Error("SetContext did not update context")
	}

	// Restore
	SetContext(original)
}

// ─── Publish helpers ──────────────────────────────────────

func TestPublishRecordingReady(t *testing.T) {
	mr := setupMiniredis(t)

	sub := Client.Subscribe(Ctx(), "recording:ready:rec-1")
	defer sub.Close()
	_, _ = sub.Receive(Ctx())

	if err := PublishRecordingReady("rec-1", "/pcaps/rec-1.pcap", "example.com"); err != nil {
		t.Fatal(err)
	}

	mr.FastForward(time.Second)
	msg, _ := sub.ReceiveMessage(Ctx())
	var payload map[string]string
	json.Unmarshal([]byte(msg.Payload), &payload)
	if payload["call_id"] != "rec-1" {
		t.Errorf("call_id = %v, want rec-1", payload["call_id"])
	}
	if payload["pcap_path"] != "/pcaps/rec-1.pcap" {
		t.Errorf("pcap_path = %v", payload["pcap_path"])
	}
}

func TestPublishQualityMetric(t *testing.T) {
	mr := setupMiniredis(t)

	sub := Client.Subscribe(Ctx(), "call:quality:q-1")
	defer sub.Close()
	_, _ = sub.Receive(Ctx())

	metric := map[string]interface{}{"mos": 4.2, "jitter": 10.5}
	if err := PublishQualityMetric("q-1", metric); err != nil {
		t.Fatal(err)
	}

	mr.FastForward(time.Second)
	msg, _ := sub.ReceiveMessage(Ctx())
	if msg.Payload == "" {
		t.Error("expected payload, got empty")
	}
}

func TestClose(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()

	// Wire up a fresh client (don't use setupMiniredis to avoid double-close)
	Client = goredis.NewClient(&goredis.Options{Addr: mr.Addr()})
	SetContext(context.Background())

	if err := Close(); err != nil {
		t.Fatal(err)
	}
	Client = nil // already closed, prevent further use
}
