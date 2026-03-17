package sip

import (
	"testing"
)

var testSIP = []byte("INVITE sip:bob@domain.com SIP/2.0\r\n" +
	"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-abc1234\r\n" +
	"From: Alice <sip:alice@domain.com>;tag=1928301774\r\n" +
	"To: Bob <sip:bob@domain.com>\r\n" +
	"Call-ID: a84b4c76e66710\r\n" +
	"CSeq: 314159 INVITE\r\n" +
	"Contact: <sip:alice@192.168.1.1:5060>\r\n" +
	"Content-Type: application/sdp\r\n" +
	"Content-Length: 142\r\n" +
	"\r\n" +
	"v=0\r\n" +
	"o=alice 2890844526 2890844526 IN IP4 192.168.1.1\r\n" +
	"s=-\r\n" +
	"c=IN IP4 192.168.1.1\r\n" +
	"t=0 0\r\n" +
	"m=audio 49170 RTP/AVP 0 8 97\r\n" +
	"a=rtpmap:0 PCMU/8000\r\n" +
	"a=rtpmap:8 PCMA/8000\r\n" +
	"a=rtpmap:97 iLBC/8000\r\n" +
	"m=video 51372 RTP/AVP 31\r\n" +
	"a=rtpmap:31 H261/90000\r\n")

func BenchmarkParseSIP(b *testing.B) {
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		msg, err := ParseSIP(testSIP)
		if err != nil || msg == nil {
			b.Fatal(err)
		}
	}
}

func TestParseSIP_CRLF(t *testing.T) {
	msg, err := ParseSIP(testSIP)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Method != "INVITE" {
		t.Errorf("expected INVITE, got %s", msg.Method)
	}
	if msg.GetCallID() != "a84b4c76e66710" {
		t.Errorf("expected a84b4c76e66710, got %s", msg.GetCallID())
	}
	if msg.GetHeader("content-length") != "142" {
		t.Errorf("expected content-length 142, got %s", msg.GetHeader("content-length"))
	}
}
