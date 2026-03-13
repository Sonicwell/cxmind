package sip

import (
	"strings"
	"testing"
)

func TestParseSIP_ErrorHandling(t *testing.T) {
	tests := []struct {
		name      string
		raw       string
		wantErr   bool
		errSubstr string
	}{
		{
			name:      "Empty payload",
			raw:       "",
			wantErr:   true,
			errSubstr: "empty payload",
		},
		{
			name:      "Malformed Request Line - No Version",
			raw:       "INVITE sip:bob@biloxi.com\r\nHeader: value\r\n\r\n",
			wantErr:   true,
			errSubstr: "malformed start line",
		},
		{
			name:      "Malformed Request Line - Too Short",
			raw:       "INVITE\r\nHeader: value\r\n\r\n",
			wantErr:   true,
			errSubstr: "malformed start line",
		},
		{
			name:      "Malformed Response Line - Invalid Status Code",
			raw:       "SIP/2.0 OK\r\nMeasured: yes\r\n\r\n", // Missing status code
			wantErr:   true,
			errSubstr: "malformed start line",
		},
		{
			name:      "Malformed Header - No Colon",
			raw:       "INVITE sip:bob@biloxi.com SIP/2.0\r\nInvalidHeader\r\n\r\n",
			wantErr:   true,
			errSubstr: "malformed header",
		},
		{
			name:      "Valid Message",
			raw:       "INVITE sip:bob@biloxi.com SIP/2.0\r\nVia: SIP/2.0/UDP pc33.atlanta.com\r\n\r\n",
			wantErr:   false,
			errSubstr: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseSIP([]byte(tt.raw))
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseSIP() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if tt.wantErr && err != nil && !strings.Contains(err.Error(), tt.errSubstr) {
				t.Errorf("ParseSIP() error = %v, expected substring %q", err, tt.errSubstr)
			}
		})
	}
}
