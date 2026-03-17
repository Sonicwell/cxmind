package sip

import (
	"reflect"
	"testing"
)

func TestExtractPTMap_ChannelsAndClock(t *testing.T) {
	tests := []struct {
		name     string
		sdpBody  string
		expected map[uint8]PTInfo
	}{
		{
			name: "Opus stereo WebRTC — channels=2, clock=48000",
			sdpBody: `v=0
o=- 123 123 IN IP4 192.168.1.1
m=audio 10000 RTP/SAVPF 111 0 8 9
a=rtpmap:111 opus/48000/2
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=rtpmap:9 G722/8000`,
			expected: map[uint8]PTInfo{
				111: {CodecName: "opus", Channels: 2, ClockRateHz: 48000},
				0:   {CodecName: "pcmu", Channels: 1, ClockRateHz: 8000},
				8:   {CodecName: "pcma", Channels: 1, ClockRateHz: 8000},
				9:   {CodecName: "g722", Channels: 1, ClockRateHz: 8000},
			},
		},
		{
			name: "Opus mono — channels defaults to 1",
			sdpBody: `a=rtpmap:97 opus/48000
a=rtpmap:0 PCMU/8000`,
			expected: map[uint8]PTInfo{
				97: {CodecName: "opus", Channels: 1, ClockRateHz: 48000},
				0:  {CodecName: "pcmu", Channels: 1, ClockRateHz: 8000},
			},
		},
		{
			name:     "Empty body",
			sdpBody:  "",
			expected: map[uint8]PTInfo{},
		},
		{
			name: "G.729 with correct clock",
			sdpBody: `a=rtpmap:18 G729/8000
a=rtpmap:9 G722/8000`,
			expected: map[uint8]PTInfo{
				18: {CodecName: "g729", Channels: 1, ClockRateHz: 8000},
				9:  {CodecName: "g722", Channels: 1, ClockRateHz: 8000},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			msg := &SIPMessage{Body: tc.sdpBody}
			result := msg.ExtractPTMap()
			if !reflect.DeepEqual(result, tc.expected) {
				t.Errorf("Expected %v\n     got %v", tc.expected, result)
			}
		})
	}
}
