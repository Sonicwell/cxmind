package pcap

import (
	"testing"
)

func TestIsSIP(t *testing.T) {
	sniffer := &Sniffer{}

	tests := []struct {
		name    string
		payload string
		want    bool
	}{
		{"INVITE", "INVITE sip:bob@biloxi.com SIP/2.0", true},
		{"ACK", "ACK sip:bob@biloxi.com SIP/2.0", true},
		{"BYE", "BYE sip:bob@biloxi.com SIP/2.0", true},
		{"CANCEL", "CANCEL sip:bob@biloxi.com SIP/2.0", true},
		{"REGISTER", "REGISTER sip:bob@biloxi.com SIP/2.0", true},
		{"OPTIONS", "OPTIONS sip:bob@biloxi.com SIP/2.0", true},
		{"Response", "SIP/2.0 200 OK", true},
		{"Short", "INV", false},
		{"Garbage", "fasdfasdfasdf", false},
		{"RTP", "\x80\xe0\x00\x01\x00\x00\x00\x00", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sniffer.isSIP([]byte(tt.payload)); got != tt.want {
				t.Errorf("isSIP() = %v, want %v", got, tt.want)
			}
		})
	}
}
