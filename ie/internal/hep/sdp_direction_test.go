package hep

import "testing"

func TestExtractMediaDirection(t *testing.T) {
	tests := []struct {
		name     string
		sdp      string
		expected string
	}{
		{
			name: "session-level sendonly (hold)",
			sdp: "v=0\r\n" +
				"o=- 123 456 IN IP4 10.0.0.1\r\n" +
				"s=-\r\n" +
				"c=IN IP4 10.0.0.1\r\n" +
				"a=sendonly\r\n" +
				"m=audio 4000 RTP/AVP 0\r\n",
			expected: "sendonly",
		},
		{
			name: "media-level sendonly overrides session sendrecv",
			sdp: "v=0\r\n" +
				"o=- 123 456 IN IP4 10.0.0.1\r\n" +
				"s=-\r\n" +
				"c=IN IP4 10.0.0.1\r\n" +
				"a=sendrecv\r\n" +
				"m=audio 4000 RTP/AVP 0\r\n" +
				"a=sendonly\r\n",
			expected: "sendonly",
		},
		{
			name: "media-level inactive (hold)",
			sdp: "v=0\r\n" +
				"o=- 123 456 IN IP4 10.0.0.1\r\n" +
				"s=-\r\n" +
				"c=IN IP4 10.0.0.1\r\n" +
				"m=audio 4000 RTP/AVP 0\r\n" +
				"a=inactive\r\n",
			expected: "inactive",
		},
		{
			name: "sendrecv (resume / normal)",
			sdp: "v=0\r\n" +
				"o=- 123 456 IN IP4 10.0.0.1\r\n" +
				"s=-\r\n" +
				"c=IN IP4 10.0.0.1\r\n" +
				"m=audio 4000 RTP/AVP 0\r\n" +
				"a=sendrecv\r\n",
			expected: "sendrecv",
		},
		{
			name: "no direction attribute",
			sdp: "v=0\r\n" +
				"o=- 123 456 IN IP4 10.0.0.1\r\n" +
				"s=-\r\n" +
				"c=IN IP4 10.0.0.1\r\n" +
				"m=audio 4000 RTP/AVP 0\r\n",
			expected: "",
		},
		{
			name: "recvonly in audio section",
			sdp: "v=0\r\n" +
				"o=- 123 456 IN IP4 10.0.0.1\r\n" +
				"s=-\r\n" +
				"c=IN IP4 10.0.0.1\r\n" +
				"m=audio 4000 RTP/AVP 0\r\n" +
				"a=recvonly\r\n" +
				"m=video 5000 RTP/AVP 96\r\n" +
				"a=sendrecv\r\n",
			expected: "recvonly",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractMediaDirection(tt.sdp)
			if result != tt.expected {
				t.Errorf("extractMediaDirection() = %q, want %q", result, tt.expected)
			}
		})
	}
}
