package hep

import (
	"reflect"
	"testing"

	"github.com/cxmind/ingestion-go/internal/clickhouse"
)

// ─── SipCallRecord struct field tests ───

func TestSipCallRecord_DisconnectFields(t *testing.T) {
	typ := reflect.TypeOf(clickhouse.SipCallRecord{})

	tests := []struct {
		field string
		tag   string
	}{
		{"DisconnectReason", "disconnect_reason"},
		{"DisconnectParty", "disconnect_party"},
	}

	for _, tt := range tests {
		f, ok := typ.FieldByName(tt.field)
		if !ok {
			t.Fatalf("SipCallRecord must have a %s field", tt.field)
		}
		if got := f.Tag.Get("ch"); got != tt.tag {
			t.Errorf("%s ch tag = %q, want %q", tt.field, got, tt.tag)
		}
	}
}

// ─── determineDisconnectParty tests ───

func TestDetermineDisconnectParty_BYE_CallerHangsUp(t *testing.T) {
	// caller sends BYE → disconnect_party = "caller"
	got := determineDisconnectParty("BYE", "alice", "alice", "bob")
	if got != "caller" {
		t.Errorf("BYE from caller: got %q, want %q", got, "caller")
	}
}

func TestDetermineDisconnectParty_BYE_CalleeHangsUp(t *testing.T) {
	// callee sends BYE → disconnect_party = "callee"
	got := determineDisconnectParty("BYE", "bob", "alice", "bob")
	if got != "callee" {
		t.Errorf("BYE from callee: got %q, want %q", got, "callee")
	}
}

func TestDetermineDisconnectParty_BYE_UnknownSender(t *testing.T) {
	// BYE from user not matching caller or callee (PBX proxy rewrite)
	got := determineDisconnectParty("BYE", "proxy-user", "alice", "bob")
	if got != "" {
		t.Errorf("BYE from unknown: got %q, want empty", got)
	}
}

func TestDetermineDisconnectParty_CANCEL(t *testing.T) {
	// CANCEL always from caller (RFC 3261 §9.1)
	got := determineDisconnectParty("CANCEL", "alice", "alice", "bob")
	if got != "caller" {
		t.Errorf("CANCEL: got %q, want %q", got, "caller")
	}
}

func TestDetermineDisconnectParty_ErrorResponse_486(t *testing.T) {
	// 486 Busy Here → callee rejected
	got := determineDisconnectParty("486 Busy Here", "", "alice", "bob")
	if got != "callee" {
		t.Errorf("486: got %q, want %q", got, "callee")
	}
}

func TestDetermineDisconnectParty_ErrorResponse_603(t *testing.T) {
	// 603 Decline → callee declined
	got := determineDisconnectParty("603 Declined", "", "alice", "bob")
	if got != "callee" {
		t.Errorf("603: got %q, want %q", got, "callee")
	}
}
