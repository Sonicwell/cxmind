package sip

import "testing"

func TestGetExpires(t *testing.T) {
	tests := []struct {
		name     string
		raw      []byte
		expected int
	}{
		{
			name: "REGISTER with Expires header 3600",
			raw: []byte("REGISTER sip:registrar.biloxi.com SIP/2.0\r\n" +
				"Via: SIP/2.0/UDP bobspc.biloxi.com:5060\r\n" +
				"To: Bob <sip:bob@biloxi.com>\r\n" +
				"From: Bob <sip:bob@biloxi.com>;tag=456248\r\n" +
				"Call-ID: 843817637684230@998sdasdh09\r\n" +
				"CSeq: 1826 REGISTER\r\n" +
				"Contact: <sip:bob@192.0.2.4>\r\n" +
				"Expires: 3600\r\n" +
				"\r\n"),
			expected: 3600,
		},
		{
			name: "REGISTER with Expires 0 (unregister)",
			raw: []byte("REGISTER sip:registrar.biloxi.com SIP/2.0\r\n" +
				"Via: SIP/2.0/UDP bobspc.biloxi.com:5060\r\n" +
				"To: Bob <sip:bob@biloxi.com>\r\n" +
				"From: Bob <sip:bob@biloxi.com>;tag=456248\r\n" +
				"Call-ID: 843817637684230@998sdasdh09\r\n" +
				"CSeq: 1826 REGISTER\r\n" +
				"Contact: <sip:bob@192.0.2.4>\r\n" +
				"Expires: 0\r\n" +
				"\r\n"),
			expected: 0,
		},
		{
			name: "REGISTER without Expires header (default -1)",
			raw: []byte("REGISTER sip:registrar.biloxi.com SIP/2.0\r\n" +
				"Via: SIP/2.0/UDP bobspc.biloxi.com:5060\r\n" +
				"To: Bob <sip:bob@biloxi.com>\r\n" +
				"From: Bob <sip:bob@biloxi.com>;tag=456248\r\n" +
				"Call-ID: 843817637684230@998sdasdh09\r\n" +
				"CSeq: 1826 REGISTER\r\n" +
				"Contact: <sip:bob@192.0.2.4>\r\n" +
				"\r\n"),
			expected: -1,
		},
		{
			name: "REGISTER with Contact expires param",
			raw: []byte("REGISTER sip:registrar.biloxi.com SIP/2.0\r\n" +
				"Via: SIP/2.0/UDP bobspc.biloxi.com:5060\r\n" +
				"To: Bob <sip:bob@biloxi.com>\r\n" +
				"From: Bob <sip:bob@biloxi.com>;tag=456248\r\n" +
				"Call-ID: 843817637684230@998sdasdh09\r\n" +
				"CSeq: 1826 REGISTER\r\n" +
				"Contact: <sip:bob@192.0.2.4>;expires=120\r\n" +
				"\r\n"),
			expected: 120,
		},
		{
			name: "REGISTER with both Expires header and Contact expires (header takes priority)",
			raw: []byte("REGISTER sip:registrar.biloxi.com SIP/2.0\r\n" +
				"Via: SIP/2.0/UDP bobspc.biloxi.com:5060\r\n" +
				"To: Bob <sip:bob@biloxi.com>\r\n" +
				"From: Bob <sip:bob@biloxi.com>;tag=456248\r\n" +
				"Call-ID: 843817637684230@998sdasdh09\r\n" +
				"CSeq: 1826 REGISTER\r\n" +
				"Contact: <sip:bob@192.0.2.4>;expires=120\r\n" +
				"Expires: 3600\r\n" +
				"\r\n"),
			expected: 3600,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			msg, err := ParseSIP(tc.raw)
			if err != nil {
				t.Fatalf("ParseSIP failed: %v", err)
			}
			got := msg.GetExpires()
			if got != tc.expected {
				t.Errorf("GetExpires() = %d, want %d", got, tc.expected)
			}
		})
	}
}
