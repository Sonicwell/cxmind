package hep

import (
	"testing"

	"github.com/cxmind/ingestion-go/internal/sip"
)

// ─── checkTermination tests ───

func TestCheckTermination_BYE(t *testing.T) {
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{IsRequest: true, Method: "BYE"},
		callID: "test-bye",
	}
	reason := checkTermination(ctx)
	if reason != "BYE" {
		t.Errorf("Expected 'BYE', got %q", reason)
	}
}

func TestCheckTermination_CANCEL(t *testing.T) {
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{IsRequest: true, Method: "CANCEL"},
		callID: "test-cancel",
	}
	reason := checkTermination(ctx)
	if reason != "CANCEL" {
		t.Errorf("Expected 'CANCEL', got %q", reason)
	}
}

func TestCheckTermination_ErrorResponse_InitialInvite(t *testing.T) {
	// 486 Busy to initial INVITE — should terminate
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			IsRequest:  false,
			StatusCode: 486,
			StatusText: "Busy Here",
			Headers:    map[string][]string{"cseq": {"1 INVITE"}},
		},
		callID: "test-486",
		state:  nil, // no answer_time → not established
	}
	reason := checkTermination(ctx)
	if reason != "486 Busy Here" {
		t.Errorf("Expected '486 Busy Here', got %q", reason)
	}
}

func TestCheckTermination_ErrorResponse_ReInvite_Ignored(t *testing.T) {
	// 488 to re-INVITE on established call — should NOT terminate
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			IsRequest:  false,
			StatusCode: 488,
			StatusText: "Not Acceptable Here",
			Headers:    map[string][]string{"cseq": {"2 INVITE"}},
		},
		callID: "test-488-reinvite",
		state:  map[string]interface{}{"answer_time": "2026-01-01T00:00:00Z"}, // established
	}
	reason := checkTermination(ctx)
	if reason != "" {
		t.Errorf("Re-INVITE error should not terminate, got %q", reason)
	}
}

func TestCheckTermination_ErrorResponse_BYE_Ignored(t *testing.T) {
	// 408 to BYE — call already ending, should NOT terminate
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			IsRequest:  false,
			StatusCode: 408,
			Headers:    map[string][]string{"cseq": {"3 BYE"}},
		},
		callID: "test-408-bye",
	}
	reason := checkTermination(ctx)
	if reason != "" {
		t.Errorf("Error response to BYE should not terminate, got %q", reason)
	}
}

func TestCheckTermination_ErrorResponse_UPDATE_Ignored(t *testing.T) {
	// 500 to UPDATE — mid-dialog, should NOT terminate
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			IsRequest:  false,
			StatusCode: 500,
			Headers:    map[string][]string{"cseq": {"4 UPDATE"}},
		},
		callID: "test-500-update",
	}
	reason := checkTermination(ctx)
	if reason != "" {
		t.Errorf("Error response to UPDATE should not terminate, got %q", reason)
	}
}

func TestCheckTermination_200OK_NotTermination(t *testing.T) {
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			IsRequest:  false,
			StatusCode: 200,
			Headers:    map[string][]string{"cseq": {"1 INVITE"}},
		},
		callID: "test-200",
	}
	reason := checkTermination(ctx)
	if reason != "" {
		t.Errorf("200 OK should not terminate, got %q", reason)
	}
}

func TestCheckTermination_INVITE_NotTermination(t *testing.T) {
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{IsRequest: true, Method: "INVITE"},
		callID: "test-invite",
	}
	reason := checkTermination(ctx)
	if reason != "" {
		t.Errorf("INVITE should not terminate, got %q", reason)
	}
}

func TestCheckTermination_401_AuthChallenge_NotTerminated(t *testing.T) {
	// 401 Unauthorized = auth challenge, UAC will retry with credentials
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			IsRequest:  false,
			StatusCode: 401,
			StatusText: "Unauthorized",
			Headers:    map[string][]string{"cseq": {"1 INVITE"}},
		},
		callID: "test-401-auth",
		state:  nil,
	}
	reason := checkTermination(ctx)
	if reason != "" {
		t.Errorf("401 auth challenge should not terminate, got %q", reason)
	}
}

func TestCheckTermination_407_AuthChallenge_NotTerminated(t *testing.T) {
	// 407 Proxy Authentication Required = proxy auth challenge
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			IsRequest:  false,
			StatusCode: 407,
			StatusText: "Proxy Authentication Required",
			Headers:    map[string][]string{"cseq": {"1 INVITE"}},
		},
		callID: "test-407-auth",
		state:  nil,
	}
	reason := checkTermination(ctx)
	if reason != "" {
		t.Errorf("407 proxy auth challenge should not terminate, got %q", reason)
	}
}

func TestCheckTermination_487_INVITE_IgnoredAsCANCELByproduct(t *testing.T) {
	// 487 Request Terminated to INVITE = CANCEL byproduct (RFC 3261 §15.1.2)
	// CANCEL 已独立处理终止，487 不应重复触发
	ctx := &sipContext{
		sipMsg: &sip.SIPMessage{
			IsRequest:  false,
			StatusCode: 487,
			StatusText: "Request Terminated",
			Headers:    map[string][]string{"cseq": {"1 INVITE"}},
		},
		callID: "test-487-cancel-byproduct",
		state:  nil,
	}
	reason := checkTermination(ctx)
	if reason != "" {
		t.Errorf("487 CSeq:INVITE should be ignored (CANCEL byproduct), got %q", reason)
	}
}

// ─── determineEventType tests ───

func TestDetermineEventType_INVITE(t *testing.T) {
	msg := &sip.SIPMessage{IsRequest: true, Method: "INVITE"}
	if et := determineEventType(msg); et != "call_create" {
		t.Errorf("INVITE should be call_create, got %q", et)
	}
}

func TestDetermineEventType_BYE(t *testing.T) {
	msg := &sip.SIPMessage{IsRequest: true, Method: "BYE"}
	if et := determineEventType(msg); et != "call_hangup" {
		t.Errorf("BYE should be call_hangup, got %q", et)
	}
}

func TestDetermineEventType_CANCEL(t *testing.T) {
	msg := &sip.SIPMessage{IsRequest: true, Method: "CANCEL"}
	if et := determineEventType(msg); et != "call_hangup" {
		t.Errorf("CANCEL should be call_hangup, got %q", et)
	}
}

func TestDetermineEventType_REFER(t *testing.T) {
	msg := &sip.SIPMessage{IsRequest: true, Method: "REFER"}
	if et := determineEventType(msg); et != "transfer_start" {
		t.Errorf("REFER should be transfer_start, got %q", et)
	}
}

func TestDetermineEventType_180(t *testing.T) {
	msg := &sip.SIPMessage{IsRequest: false, StatusCode: 180}
	if et := determineEventType(msg); et != "caller_ringing" {
		t.Errorf("180 should be caller_ringing, got %q", et)
	}
}

func TestDetermineEventType_183(t *testing.T) {
	msg := &sip.SIPMessage{IsRequest: false, StatusCode: 183}
	if et := determineEventType(msg); et != "caller_ringing" {
		t.Errorf("183 should be caller_ringing, got %q", et)
	}
}

func TestDetermineEventType_200_INVITE(t *testing.T) {
	msg := &sip.SIPMessage{
		IsRequest:  false,
		StatusCode: 200,
		Headers:    map[string][]string{"cseq": {"1 INVITE"}},
	}
	if et := determineEventType(msg); et != "call_answer" {
		t.Errorf("200 OK INVITE should be call_answer, got %q", et)
	}
}

func TestDetermineEventType_200_BYE(t *testing.T) {
	// 200 OK for BYE — not an "answer" event
	msg := &sip.SIPMessage{
		IsRequest:  false,
		StatusCode: 200,
		Headers:    map[string][]string{"cseq": {"2 BYE"}},
	}
	if et := determineEventType(msg); et != "" {
		t.Errorf("200 OK BYE should be ignored (\"\"), got %q", et)
	}
}

func TestDetermineEventType_4xx(t *testing.T) {
	msg := &sip.SIPMessage{IsRequest: false, StatusCode: 486}
	if et := determineEventType(msg); et != "call_hangup" {
		t.Errorf("486 should be call_hangup, got %q", et)
	}
}

func TestDetermineEventType_5xx(t *testing.T) {
	msg := &sip.SIPMessage{IsRequest: false, StatusCode: 503}
	if et := determineEventType(msg); et != "call_hangup" {
		t.Errorf("503 should be call_hangup, got %q", et)
	}
}

func TestDetermineEventType_401_Ignored(t *testing.T) {
	// 401 Unauthorized = auth challenge, not a real hangup
	msg := &sip.SIPMessage{IsRequest: false, StatusCode: 401}
	if et := determineEventType(msg); et != "" {
		t.Errorf("401 auth challenge should be ignored, got %q", et)
	}
}

func TestDetermineEventType_487_Ignored(t *testing.T) {
	// 487 Request Terminated = CANCEL byproduct, not a real hangup
	msg := &sip.SIPMessage{IsRequest: false, StatusCode: 487}
	if et := determineEventType(msg); et != "" {
		t.Errorf("487 CANCEL byproduct should be ignored, got %q", et)
	}
}

func TestDetermineEventType_407_Ignored(t *testing.T) {
	// 407 Proxy Auth Required = proxy auth challenge, not a real hangup
	msg := &sip.SIPMessage{IsRequest: false, StatusCode: 407}
	if et := determineEventType(msg); et != "" {
		t.Errorf("407 proxy auth challenge should be ignored, got %q", et)
	}
}

func TestDetermineEventType_100(t *testing.T) {
	// 100 Trying — should be ignored
	msg := &sip.SIPMessage{IsRequest: false, StatusCode: 100}
	if et := determineEventType(msg); et != "" {
		t.Errorf("100 should be ignored (\"\"), got %q", et)
	}
}

func TestDetermineEventType_UPDATE(t *testing.T) {
	// UPDATE request — not a recognized event type
	msg := &sip.SIPMessage{IsRequest: true, Method: "UPDATE"}
	if et := determineEventType(msg); et != "" {
		t.Errorf("UPDATE should be ignored (\"\"), got %q", et)
	}
}
