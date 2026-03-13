package hep

import (
	"testing"

	"github.com/cxmind/ingestion-go/internal/sip"
)

func TestIsRegisterMessage_RegisterRequest(t *testing.T) {
	msg := &sip.SIPMessage{
		Method:    "REGISTER",
		IsRequest: true,
		Headers:   make(map[string][]string),
	}
	if !isRegisterMessage(msg) {
		t.Error("Expected isRegisterMessage to return true for REGISTER request")
	}
}

func TestIsRegisterMessage_200OKToRegister(t *testing.T) {
	msg := &sip.SIPMessage{
		IsRequest:  false,
		StatusCode: 200,
		Headers:    map[string][]string{"cseq": {"1 REGISTER"}},
	}
	if !isRegisterMessage(msg) {
		t.Error("Expected isRegisterMessage to return true for 200 OK with CSeq REGISTER")
	}
}

func TestIsRegisterMessage_InviteRequest(t *testing.T) {
	msg := &sip.SIPMessage{
		Method:    "INVITE",
		IsRequest: true,
		Headers:   make(map[string][]string),
	}
	if isRegisterMessage(msg) {
		t.Error("Expected isRegisterMessage to return false for INVITE request")
	}
}

func TestIsRegisterMessage_200OKToInvite(t *testing.T) {
	msg := &sip.SIPMessage{
		IsRequest:  false,
		StatusCode: 200,
		Headers:    map[string][]string{"cseq": {"1 INVITE"}},
	}
	if isRegisterMessage(msg) {
		t.Error("Expected isRegisterMessage to return false for 200 OK with CSeq INVITE")
	}
}

func TestIsRegisterMessage_OptionsRequest(t *testing.T) {
	msg := &sip.SIPMessage{
		Method:    "OPTIONS",
		IsRequest: true,
		Headers:   make(map[string][]string),
	}
	if isRegisterMessage(msg) {
		t.Error("Expected isRegisterMessage to return false for OPTIONS request")
	}
}

func TestIsRegisterMessage_ByeRequest(t *testing.T) {
	msg := &sip.SIPMessage{
		Method:    "BYE",
		IsRequest: true,
		Headers:   make(map[string][]string),
	}
	if isRegisterMessage(msg) {
		t.Error("Expected isRegisterMessage to return false for BYE request")
	}
}
