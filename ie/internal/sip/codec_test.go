package sip

import "testing"

func TestExtractCodec(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		expected string
	}{
		{
			name:     "Standard PCMU",
			body:     "v=0\r\no=jdoe 2890844526 2890842807 IN IP4 10.47.16.5\r\ns=SDP Seminar\r\nc=IN IP4 224.2.17.12/127\r\nt=2873397496 2873404696\r\nm=audio 49170 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000\r\n",
			expected: "PCMU",
		},
		{
			name:     "Multiple Codecs (returns first)",
			body:     "m=audio 49170 RTP/AVP 0 8 18\r\na=rtpmap:0 PCMU/8000\r\na=rtpmap:8 PCMA/8000\r\na=rtpmap:18 G729/8000\r\n",
			expected: "PCMU",
		},
		{
			name:     "No audio section",
			body:     "m=video 51372 RTP/AVP 31\r\na=rtpmap:31 H261/90000\r\n",
			expected: "",
		},
		{
			name:     "Codec with parameters",
			body:     "m=audio 49170 RTP/AVP 97\r\na=rtpmap:97 iLBC/8000\r\na=fmtp:97 mode=20\r\n",
			expected: "iLBC",
		},
		{
			name:     "No rtpmap",
			body:     "m=audio 49170 RTP/AVP 0\r\n",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := &SIPMessage{Body: tt.body}
			if got := msg.ExtractCodec(); got != tt.expected {
				t.Errorf("ExtractCodec() = %q, want %q", got, tt.expected)
			}
		})
	}
}
