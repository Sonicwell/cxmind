package sip

import (
	"testing"
)

func TestParseSIP_Repro(t *testing.T) {
	tests := []struct {
		name        string
		raw         string
		wantRequest bool
		wantCode    int
		wantError   bool
	}{
		{
			name: "Standard 200 OK",
			raw: "SIP/2.0 200 OK\r\n" +
				"Via: SIP/2.0/UDP 1.2.3.4\r\n" +
				"CSeq: 1 INVITE\r\n\r\n",
			wantRequest: false,
			wantCode:    200,
		},
		{
			name: "200 OK with extra spaces",
			raw: "SIP/2.0  200  OK \r\n" +
				"CSeq: 1 INVITE\r\n\r\n",
			wantRequest: false,
			wantCode:    200,
		},
		{
			name: "200 OK short status",
			raw: "SIP/2.0 200\r\n" +
				"CSeq: 1 INVITE\r\n\r\n",
			wantRequest: false,
			wantCode:    200,
		},
		{
			name: "Garbage start (simulated packet loss/corruption)",
			raw: "junk\r\nSIP/2.0 200 OK\r\n" +
				"CSeq: 1 INVITE\r\n\r\n",
			wantError: true, // Now correctly fails strict parsing
		},
		{
			name: "Empty line start",
			raw: "\r\nSIP/2.0 200 OK\r\n" +
				"CSeq: 1 INVITE\r\n\r\n",
			wantError: true, // Now correctly fails strict parsing (empty start line)
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg, err := ParseSIP([]byte(tt.raw))
			if tt.wantError {
				if err == nil {
					t.Fatalf("ParseSIP succeeded unexpectedly")
				}
				return
			}
			if err != nil {
				t.Fatalf("ParseSIP failed: %v", err)
			}
			if msg.IsRequest != tt.wantRequest {
				t.Errorf("IsRequest = %v, want %v", msg.IsRequest, tt.wantRequest)
			}
			if !msg.IsRequest {
				if msg.StatusCode != tt.wantCode {
					t.Errorf("StatusCode = %d, want %d", msg.StatusCode, tt.wantCode)
				}
			}
		})
	}
}
