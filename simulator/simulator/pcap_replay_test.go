package simulator

import (
	"testing"
)

func TestIsSIPPayload_ValidSIPRequest(t *testing.T) {
	cases := []struct {
		name    string
		payload string
	}{
		{"INVITE", "INVITE sip:1001@192.168.1.1 SIP/2.0\r\nVia: SIP/2.0/UDP ...\r\n"},
		{"ACK", "ACK sip:1001@192.168.1.1 SIP/2.0\r\n"},
		{"BYE", "BYE sip:1001@192.168.1.1 SIP/2.0\r\n"},
		{"CANCEL", "CANCEL sip:1001@192.168.1.1 SIP/2.0\r\n"},
		{"REGISTER", "REGISTER sip:192.168.1.1 SIP/2.0\r\n"},
		{"OPTIONS", "OPTIONS sip:192.168.1.1 SIP/2.0\r\n"},
		{"INFO", "INFO sip:1001@192.168.1.1 SIP/2.0\r\n"},
		{"REFER", "REFER sip:1001@192.168.1.1 SIP/2.0\r\n"},
		{"MESSAGE", "MESSAGE sip:1001@192.168.1.1 SIP/2.0\r\n"},
		{"UPDATE", "UPDATE sip:1001@192.168.1.1 SIP/2.0\r\n"},
		{"PRACK", "PRACK sip:1001@192.168.1.1 SIP/2.0\r\n"},
		{"SUBSCRIBE", "SUBSCRIBE sip:1001@192.168.1.1 SIP/2.0\r\n"},
		{"NOTIFY", "NOTIFY sip:1001@192.168.1.1 SIP/2.0\r\n"},
		{"PUBLISH", "PUBLISH sip:1001@192.168.1.1 SIP/2.0\r\n"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if !isSIPPayload([]byte(tc.payload)) {
				t.Errorf("expected %s to be detected as SIP", tc.name)
			}
		})
	}
}

func TestIsSIPPayload_ValidSIPResponse(t *testing.T) {
	cases := []string{
		"SIP/2.0 200 OK\r\n",
		"SIP/2.0 180 Ringing\r\n",
		"SIP/2.0 100 Trying\r\n",
		"SIP/2.0 487 Request Terminated\r\n",
		"SIP/2.0 401 Unauthorized\r\n",
	}
	for _, payload := range cases {
		if !isSIPPayload([]byte(payload)) {
			t.Errorf("expected SIP response %q to be detected as SIP", payload[:20])
		}
	}
}

// 精确命中本次 bug: RTP payload 中间包含 "SIP/2.0" 不应被误判
func TestIsSIPPayload_RTPPayloadWithSIPString(t *testing.T) {
	// 模拟 RTP header (12 bytes) + payload 碰巧包含 "SIP/2.0"
	rtpHeader := []byte{0x80, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0xA0, 0x00, 0x00, 0x00, 0x01}
	sipBytes := []byte("SIP/2.0")
	payload := append(rtpHeader, sipBytes...)
	payload = append(payload, []byte{0x00, 0xFF, 0xAB, 0xCD}...)

	if isSIPPayload(payload) {
		t.Errorf("RTP payload containing 'SIP/2.0' in the middle should NOT be detected as SIP")
	}
}

func TestIsSIPPayload_EmptyPayload(t *testing.T) {
	if isSIPPayload([]byte{}) {
		t.Error("empty payload should not be detected as SIP")
	}
	if isSIPPayload(nil) {
		t.Error("nil payload should not be detected as SIP")
	}
}

func TestIsSIPPayload_PureBinaryPayload(t *testing.T) {
	payload := []byte{0x80, 0x00, 0x1A, 0x2B, 0x00, 0x00, 0x03, 0x20, 0x4F, 0x4F, 0x4F, 0x4F}
	if isSIPPayload(payload) {
		t.Error("pure binary RTP payload should not be detected as SIP")
	}
}

func TestExtractSIPFirstLine_BinaryPayload(t *testing.T) {
	// 即使传入二进制，函数不应 panic，且结果长度应被限制
	payload := make([]byte, 200)
	for i := range payload {
		payload[i] = byte(i % 256)
	}
	result := extractSIPFirstLine(payload)
	if len(result) > 200 {
		t.Errorf("extractSIPFirstLine should not produce excessively long output, got %d chars", len(result))
	}
}
