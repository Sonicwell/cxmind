package sip

import (
	"strings"
	"testing"
)

func TestParseSIP_DuplicateHeaders(t *testing.T) {
	raw := []byte("INVITE sip:bob@biloxi.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP pc33.atlanta.com;branch=z9hG4bK776asdhds\r\n" +
		"Via: SIP/2.0/UDP proxy.atlanta.com;branch=z9hG4bKindxhds\r\n" +
		"Max-Forwards: 70\r\n" +
		"To: Bob <sip:bob@biloxi.com>\r\n" +
		"From: Alice <sip:alice@atlanta.com>;tag=1928301774\r\n" +
		"Call-ID: a84b4c76e66710@pc33.atlanta.com\r\n" +
		"CSeq: 314159 INVITE\r\n" +
		"Content-Length: 0\r\n" +
		"\r\n")

	msg, err := ParseSIP(raw)
	if err != nil {
		t.Fatalf("Failed to parse SIP message: %v", err)
	}

	// We expect multiple Via headers to be preserved, or at least handled.
	// Current implementation overwrites them, so we expect this to FAIL if we were asserting correctness,
	// but here we want to DEMONSTRATE the behavior.

	// Check if we lost the first Via header
	vias := msg.Headers["via"]
	foundPC33 := false
	foundProxy := false

	for _, v := range vias {
		if strings.Contains(v, "pc33.atlanta.com") {
			foundPC33 = true
		}
		if strings.Contains(v, "proxy.atlanta.com") {
			foundProxy = true
		}
	}

	if foundPC33 && foundProxy {
		t.Logf("PASS: Both Via headers found: %v", vias)
	} else {
		t.Errorf("FAIL: Missing Via headers. Found: %v", vias)
	}
}
