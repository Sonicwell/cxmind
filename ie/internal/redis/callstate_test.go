package redis

import (
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

func TestParseCallState_FullState(t *testing.T) {
	now := timeutil.Now().Truncate(time.Millisecond)
	answerTime := now.Add(5 * time.Second)

	state := map[string]interface{}{
		"start_time":      now.Format(time.RFC3339Nano),
		"answer_time":     answerTime.Format(time.RFC3339Nano),
		"caller_user":     "1001",
		"callee_user":     "1002",
		"from_domain":     "sip.example.com",
		"to_domain":       "sip.example.com",
		"caller_ip":       "10.0.0.1",
		"callee_ip":       "10.0.0.2",
		"caller_name":     "Alice",
		"callee_name":     "Bob",
		"asr_enabled":     true,
		"caller_uri":      "sip:1001@sip.example.com",
		"sig_src_country": "US",
		"sig_src_city":    "San Francisco",
		"sig_dst_country": "GB",
		"sig_dst_city":    "London",
	}

	data := ParseCallState(state)

	if data.StartTime.IsZero() {
		t.Error("StartTime should not be zero")
	}
	if data.AnswerTime == nil {
		t.Fatal("AnswerTime should not be nil")
	}
	if data.CallerUser != "1001" {
		t.Errorf("CallerUser = %q, want %q", data.CallerUser, "1001")
	}
	if data.CalleeUser != "1002" {
		t.Errorf("CalleeUser = %q, want %q", data.CalleeUser, "1002")
	}
	if data.FromDomain != "sip.example.com" {
		t.Errorf("FromDomain = %q, want %q", data.FromDomain, "sip.example.com")
	}
	if data.CallerIP != "10.0.0.1" {
		t.Errorf("CallerIP = %q, want %q", data.CallerIP, "10.0.0.1")
	}
	if data.CalleeIP != "10.0.0.2" {
		t.Errorf("CalleeIP = %q, want %q", data.CalleeIP, "10.0.0.2")
	}
	if data.CallerName != "Alice" {
		t.Errorf("CallerName = %q, want %q", data.CallerName, "Alice")
	}
	if !data.ASREnabled {
		t.Error("ASREnabled should be true")
	}
	if data.AgentID != "1001@sip.example.com" {
		t.Errorf("AgentID = %q, want %q", data.AgentID, "1001@sip.example.com")
	}
	// Signaling GeoIP
	if data.SigSrcCountry != "US" {
		t.Errorf("SigSrcCountry = %q, want %q", data.SigSrcCountry, "US")
	}
	if data.SigSrcCity != "San Francisco" {
		t.Errorf("SigSrcCity = %q, want %q", data.SigSrcCity, "San Francisco")
	}
	if data.SigDstCountry != "GB" {
		t.Errorf("SigDstCountry = %q, want %q", data.SigDstCountry, "GB")
	}
	if data.SigDstCity != "London" {
		t.Errorf("SigDstCity = %q, want %q", data.SigDstCity, "London")
	}
}

func TestParseCallState_NilState(t *testing.T) {
	data := ParseCallState(nil)
	if data.CallerUser != "" {
		t.Error("should return zero-value struct for nil state")
	}
	if data.ASREnabled {
		t.Error("ASREnabled should default to false")
	}
}

func TestParseCallState_MissingFields(t *testing.T) {
	state := map[string]interface{}{
		"caller_user": "1001",
		// all other fields missing
	}

	data := ParseCallState(state)

	if data.CallerUser != "1001" {
		t.Errorf("CallerUser = %q, want %q", data.CallerUser, "1001")
	}
	if data.StartTime.IsZero() == false {
		t.Error("StartTime should be zero when missing")
	}
	if data.AnswerTime != nil {
		t.Error("AnswerTime should be nil when missing")
	}
}

func TestParseCallState_MalformedTime(t *testing.T) {
	state := map[string]interface{}{
		"start_time":  "not-a-date",
		"answer_time": 12345, // wrong type
	}

	data := ParseCallState(state)

	if !data.StartTime.IsZero() {
		t.Error("StartTime should be zero for malformed date")
	}
	if data.AnswerTime != nil {
		t.Error("AnswerTime should be nil for wrong type")
	}
}
