package sip

import (
	"testing"
)

func TestParseSIP_Folding(t *testing.T) {
	// SIP Header Folding Example:
	// Subject: I know you are there,
	//  pick up the phone
	// should be parsed as "Subject: I know you are there, pick up the phone"

	raw := []byte("INVITE sip:bob@biloxi.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP pc33.atlanta.com;\r\n" +
		" branch=z9hG4bK776asdhds\r\n" +
		"Subject: I know you are there,\r\n" +
		" pick up the phone\r\n" +
		"Content-Length: 0\r\n" +
		"\r\n")

	msg, err := ParseSIP(raw)
	if err != nil {
		t.Fatalf("ParseSIP failed: %v", err)
	}

	// Check Subject
	expectedSubject := "I know you are there, pick up the phone"
	subject := msg.GetHeader("Subject")
	if subject != expectedSubject {
		t.Errorf("Subject folding failed. Got: %q, Want: %q", subject, expectedSubject)
	}

	// Check Via
	expectedVia := "SIP/2.0/UDP pc33.atlanta.com; branch=z9hG4bK776asdhds"
	via := msg.GetHeader("Via")
	if via != expectedVia {
		t.Errorf("Via folding failed. Got: %q, Want: %q", via, expectedVia)
	}
}
