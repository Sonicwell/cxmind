package rtp

import (
	"testing"
)

// ========================================================================
// TDD Tests — DTMF Detection & Suppression (RFC 4733)
// Written BEFORE implementation per TDD methodology.
// ========================================================================

func TestDetectDTMF_TelephoneEvent(t *testing.T) {
	// RFC 4733 telephone-event: 4 bytes minimum
	// Byte 0: event (0-15 = digits 0-9,*,#,A-D)
	// Byte 1: E(1) R(1) volume(6)
	// Byte 2-3: duration (16-bit)
	payload := []byte{0x05, 0x0A, 0x00, 0xA0} // digit 5, vol=10, dur=160

	event, isDTMF := DetectDTMF(payload)
	if !isDTMF {
		t.Error("expected DTMF detected, got false")
	}
	if event != 5 {
		t.Errorf("event = %d, want 5", event)
	}
}

func TestDetectDTMF_DigitStar(t *testing.T) {
	payload := []byte{0x0A, 0x0A, 0x00, 0xA0} // digit * (10)
	event, isDTMF := DetectDTMF(payload)
	if !isDTMF {
		t.Error("expected DTMF")
	}
	if event != 10 {
		t.Errorf("event = %d, want 10 (*)", event)
	}
}

func TestDetectDTMF_NormalAudio(t *testing.T) {
	// Regular G.711 μ-law audio payload (160 bytes = 20ms)
	payload := make([]byte, 160)
	for i := range payload {
		payload[i] = 0x7F
	}

	_, isDTMF := DetectDTMF(payload)
	if isDTMF {
		t.Error("normal audio should not be detected as DTMF")
	}
}

func TestDetectDTMF_EmptyPayload(t *testing.T) {
	_, isDTMF := DetectDTMF(nil)
	if isDTMF {
		t.Error("nil payload should not be DTMF")
	}

	_, isDTMF = DetectDTMF([]byte{})
	if isDTMF {
		t.Error("empty payload should not be DTMF")
	}
}

func TestSuppressDTMF_ReplacesWithSilence(t *testing.T) {
	payload := []byte{0x05, 0x0A, 0x00, 0xA0} // DTMF digit 5
	result := SuppressDTMF(payload)

	if len(result) != len(payload) {
		t.Errorf("result length = %d, want %d", len(result), len(payload))
	}
	for i, b := range result {
		if b != 0xFF { // 0xFF = μ-law silence
			t.Errorf("byte %d = 0x%02X, want 0xFF (silence)", i, b)
		}
	}
}

func TestSuppressDTMF_PassesNormalAudio(t *testing.T) {
	payload := make([]byte, 160)
	for i := range payload {
		payload[i] = 0x7F
	}
	result := SuppressDTMF(payload)

	// Normal audio should pass through unchanged
	for i, b := range result {
		if b != 0x7F {
			t.Errorf("byte %d = 0x%02X, want 0x7F (unchanged)", i, b)
		}
	}
}

func TestIsDTMFPayloadType_StandardTypes(t *testing.T) {
	// Common DTMF payload types: 96, 97, 101
	if !IsDTMFPayloadType(101) {
		t.Error("PT 101 should be DTMF")
	}
	if !IsDTMFPayloadType(96) {
		t.Error("PT 96 should be DTMF")
	}
	if !IsDTMFPayloadType(97) {
		t.Error("PT 97 should be DTMF")
	}
	// Standard audio PT should not be DTMF
	if IsDTMFPayloadType(0) {
		t.Error("PT 0 (PCMU) should not be DTMF")
	}
	if IsDTMFPayloadType(8) {
		t.Error("PT 8 (PCMA) should not be DTMF")
	}
}
