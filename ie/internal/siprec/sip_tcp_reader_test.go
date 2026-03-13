package siprec

import (
	"bufio"
	"bytes"
	"fmt"
	"strings"
	"testing"
)

// ========================================================================
// Phase 3 TDD Tests — SIP over TCP Frame Reader
// SIP over TCP uses Content-Length to determine body size.
// ========================================================================

func TestReadSIPMessage_INVITEWithBody(t *testing.T) {
	sdp := "v=0\r\no=- 0 0 IN IP4 10.0.0.1\r\ns=-\r\nt=0 0\r\n"
	msg := "INVITE sip:1001@10.0.0.2 SIP/2.0\r\n" +
		"Via: SIP/2.0/TCP 10.0.0.1;branch=z9hG4bK1234\r\n" +
		"From: <sip:alice@10.0.0.1>;tag=abc\r\n" +
		"To: <sip:bob@10.0.0.2>\r\n" +
		"Call-ID: test-call-1\r\n" +
		"CSeq: 1 INVITE\r\n" +
		"Content-Type: application/sdp\r\n" +
		fmt.Sprintf("Content-Length: %d\r\n", len(sdp)) +
		"\r\n" +
		sdp

	reader := bufio.NewReader(strings.NewReader(msg))
	result, err := ReadSIPMessage(reader)
	if err != nil {
		t.Fatalf("ReadSIPMessage error: %v", err)
	}

	if !bytes.Contains(result, []byte("INVITE")) {
		t.Error("result missing INVITE method")
	}
	if !bytes.Contains(result, []byte("v=0")) {
		t.Error("result missing SDP body")
	}
}

func TestReadSIPMessage_NoBody(t *testing.T) {
	msg := "BYE sip:1001@10.0.0.2 SIP/2.0\r\n" +
		"Via: SIP/2.0/TCP 10.0.0.1;branch=z9hG4bK5678\r\n" +
		"From: <sip:alice@10.0.0.1>;tag=abc\r\n" +
		"To: <sip:bob@10.0.0.2>;tag=def\r\n" +
		"Call-ID: test-call-1\r\n" +
		"CSeq: 2 BYE\r\n" +
		"Content-Length: 0\r\n" +
		"\r\n"

	reader := bufio.NewReader(strings.NewReader(msg))
	result, err := ReadSIPMessage(reader)
	if err != nil {
		t.Fatalf("ReadSIPMessage error: %v", err)
	}

	if !bytes.Contains(result, []byte("BYE")) {
		t.Error("result missing BYE method")
	}
}

func TestReadSIPMessage_MultiMessage(t *testing.T) {
	msg1 := "BYE sip:1001@10.0.0.2 SIP/2.0\r\n" +
		"Call-ID: call-1\r\n" +
		"CSeq: 1 BYE\r\n" +
		"Content-Length: 0\r\n" +
		"\r\n"

	msg2 := "SIP/2.0 200 OK\r\n" +
		"Call-ID: call-1\r\n" +
		"CSeq: 1 BYE\r\n" +
		"Content-Length: 0\r\n" +
		"\r\n"

	stream := msg1 + msg2
	reader := bufio.NewReader(strings.NewReader(stream))

	result1, err := ReadSIPMessage(reader)
	if err != nil {
		t.Fatalf("msg1 error: %v", err)
	}
	if !bytes.Contains(result1, []byte("BYE")) {
		t.Error("msg1 missing BYE")
	}

	result2, err := ReadSIPMessage(reader)
	if err != nil {
		t.Fatalf("msg2 error: %v", err)
	}
	if !bytes.Contains(result2, []byte("200 OK")) {
		t.Error("msg2 missing 200 OK")
	}
}

func TestReadSIPMessage_NoContentLength(t *testing.T) {
	// SIP without Content-Length should still work (assume 0 body)
	msg := "ACK sip:1001@10.0.0.2 SIP/2.0\r\n" +
		"Call-ID: call-1\r\n" +
		"CSeq: 1 ACK\r\n" +
		"\r\n"

	reader := bufio.NewReader(strings.NewReader(msg))
	result, err := ReadSIPMessage(reader)
	if err != nil {
		t.Fatalf("ReadSIPMessage error: %v", err)
	}
	if !bytes.Contains(result, []byte("ACK")) {
		t.Error("result missing ACK")
	}
}

func TestReadSIPMessage_MaxSizeGuard(t *testing.T) {
	// Absurdly large Content-Length should be rejected
	msg := "INVITE sip:evil@attacker SIP/2.0\r\n" +
		"Content-Length: 999999999\r\n" +
		"\r\n"

	reader := bufio.NewReader(strings.NewReader(msg))
	_, err := ReadSIPMessage(reader)
	if err == nil {
		t.Error("expected error for oversized Content-Length, got nil")
	}
}
