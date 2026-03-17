package sip

import (
	"testing"
)

func TestParseSIP_Invite(t *testing.T) {
	raw := []byte("INVITE sip:bob@biloxi.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP pc33.atlanta.com;branch=z9hG4bK776asdhds\r\n" +
		"Max-Forwards: 70\r\n" +
		"To: Bob <sip:bob@biloxi.com>\r\n" +
		"From: Alice <sip:alice@atlanta.com>;tag=1928301774\r\n" +
		"Call-ID: a84b4c76e66710@pc33.atlanta.com\r\n" +
		"CSeq: 314159 INVITE\r\n" +
		"Contact: <sip:alice@pc33.atlanta.com>\r\n" +
		"Content-Type: application/sdp\r\n" +
		"Content-Length: 142\r\n" +
		"\r\n" +
		"v=0\r\n" +
		"o=alice 2890844526 2890844526 IN IP4 pc33.atlanta.com\r\n" +
		"s=-\r\n" +
		"c=IN IP4 192.0.2.101\r\n" +
		"t=0 0\r\n" +
		"m=audio 49172 RTP/AVP 0\r\n" +
		"a=rtpmap:0 PCMU/8000\r\n")

	msg, err := ParseSIP(raw)
	if err != nil {
		t.Fatalf("Failed to parse SIP message: %v", err)
	}

	if !msg.IsRequest {
		t.Error("Expected IsRequest to be true")
	}
	if msg.Method != "INVITE" {
		t.Errorf("Expected Method INVITE, got %s", msg.Method)
	}
	if msg.GetCallID() != "a84b4c76e66710@pc33.atlanta.com" {
		t.Errorf("Expected Call-ID mismatch, got %s", msg.GetCallID())
	}
	if msg.GetFrom() != "Alice <sip:alice@atlanta.com>;tag=1928301774" {
		t.Errorf("Expected From mismatch, got %s", msg.GetFrom())
	}
	// Test URI extraction
	fromURI := ExtractURI(msg.GetFrom())
	if fromURI != "sip:alice@atlanta.com" {
		t.Errorf("Expected From URI sip:alice@atlanta.com, got %s", fromURI)
	}
}

func TestParseSIP_Response(t *testing.T) {
	raw := []byte("SIP/2.0 200 OK\r\n" +
		"Via: SIP/2.0/UDP pc33.atlanta.com;branch=z9hG4bK776asdhds\r\n" +
		"To: Bob <sip:bob@biloxi.com>;tag=a6c85cf\r\n" +
		"From: Alice <sip:alice@atlanta.com>;tag=1928301774\r\n" +
		"Call-ID: a84b4c76e66710@pc33.atlanta.com\r\n" +
		"CSeq: 314159 INVITE\r\n" +
		"Contact: <sip:bob@192.0.2.4>\r\n" +
		"\r\n")

	msg, err := ParseSIP(raw)
	if err != nil {
		t.Fatalf("Failed to parse SIP message: %v", err)
	}

	if msg.IsRequest {
		t.Error("Expected IsRequest to be false")
	}
	if msg.StatusCode != 200 {
		t.Errorf("Expected StatusCode 200, got %d", msg.StatusCode)
	}
	if msg.StatusText != "OK" {
		t.Errorf("Expected StatusText OK, got %s", msg.StatusText)
	}
}
