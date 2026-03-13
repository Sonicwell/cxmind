package sniffer

import (
	"testing"
)

func TestLooksLikeSIP(t *testing.T) {
	tests := []struct {
		name   string
		data   []byte
		expect bool
	}{
		{"SIP response", []byte("SIP/2.0 200 OK\r\n"), true},
		{"INVITE request", []byte("INVITE sip:100@example.com SIP/2.0\r\n"), true},
		{"BYE request", []byte("BYE sip:100@example.com SIP/2.0\r\n"), true},
		{"ACK request", []byte("ACK sip:100@example.com SIP/2.0\r\n"), true},
		{"too short", []byte("SI"), false},
		{"empty", []byte{}, false},
		{"random data", []byte{0x80, 0x00, 0x01, 0x02, 0x03, 0x04}, false},
		{"RTP packet", []byte{0x80, 0x08, 0x00, 0x01, 0x00, 0x00, 0x00, 0xa0}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := looksLikeSIP(tt.data)
			if got != tt.expect {
				t.Errorf("looksLikeSIP(%q) = %v, want %v", tt.data, got, tt.expect)
			}
		})
	}
}

func TestBuildBPF(t *testing.T) {
	s := &SIPSniffer{ports: []int{5060}}
	if bpf := s.buildBPF(); bpf != "udp and (port 5060)" {
		t.Errorf("single port BPF = %q, want 'udp and (port 5060)'", bpf)
	}

	s.ports = []int{5060, 5080}
	if bpf := s.buildBPF(); bpf != "udp and (port 5060 or port 5080)" {
		t.Errorf("multi-port BPF = %q, want 'udp and (port 5060 or port 5080)'", bpf)
	}
}

func TestServerIPSet_WildIP(t *testing.T) {
	s := &ServerIPSet{
		wildIPs: map[string]bool{
			"10.0.0.1":    true,
			"192.168.1.1": true,
		},
		portIPs: make(map[string]map[uint16]bool),
	}

	// 纯 IP 通配 — 任意端口都能匹配
	if !s.Match("10.0.0.1", 5060) {
		t.Error("expected 10.0.0.1:5060 to match (wild)")
	}
	if !s.Match("10.0.0.1", 9999) {
		t.Error("expected 10.0.0.1:9999 to match (wild)")
	}
	if s.Match("10.0.0.2", 5060) {
		t.Error("expected 10.0.0.2:5060 to NOT match")
	}
	if s.Count() != 2 {
		t.Errorf("expected count 2, got %d", s.Count())
	}
}

func TestServerIPSet_PortIP(t *testing.T) {
	s := &ServerIPSet{
		wildIPs: make(map[string]bool),
		portIPs: map[string]map[uint16]bool{
			"192.168.1.100": {5060: true, 5080: true},
		},
	}

	if !s.Match("192.168.1.100", 5060) {
		t.Error("expected 192.168.1.100:5060 to match")
	}
	if !s.Match("192.168.1.100", 5080) {
		t.Error("expected 192.168.1.100:5080 to match")
	}
	if s.Match("192.168.1.100", 9999) {
		t.Error("expected 192.168.1.100:9999 to NOT match")
	}
}

func TestServerIPSet_Mixed(t *testing.T) {
	s := &ServerIPSet{
		wildIPs: map[string]bool{"192.168.1.200": true},
		portIPs: map[string]map[uint16]bool{
			"192.168.1.100": {5060: true},
		},
	}

	// Wild IP 通配
	if !s.Match("192.168.1.200", 12345) {
		t.Error("wild IP should match any port")
	}
	// Port IP 精确
	if !s.Match("192.168.1.100", 5060) {
		t.Error("port IP should match exact port")
	}
	if s.Match("192.168.1.100", 5080) {
		t.Error("port IP should not match wrong port")
	}
	// Count = 1 wild + 1 port entry
	if s.Count() != 2 {
		t.Errorf("expected count 2, got %d", s.Count())
	}
}

func TestServerIPSet_Contains(t *testing.T) {
	s := &ServerIPSet{
		wildIPs: map[string]bool{"10.0.0.1": true},
		portIPs: map[string]map[uint16]bool{
			"192.168.1.100": {5060: true},
		},
	}

	if !s.Contains("10.0.0.1") {
		t.Error("wild IP should be contained")
	}
	if !s.Contains("192.168.1.100") {
		t.Error("port IP should be contained (has port entries)")
	}
	if s.Contains("10.0.0.2") {
		t.Error("unknown IP should not be contained")
	}
}

func TestNormalizeIP(t *testing.T) {
	if ip := normalizeIP("192.168.1.1"); ip != "192.168.1.1" {
		t.Errorf("normalizeIP(192.168.1.1) = %q", ip)
	}
	if ip := normalizeIP("::1"); ip != "::1" {
		t.Errorf("normalizeIP(::1) = %q", ip)
	}
	// Hostname should be kept as-is
	if ip := normalizeIP("example.com"); ip != "example.com" {
		t.Errorf("normalizeIP(example.com) = %q", ip)
	}
}

func TestParseHostPort(t *testing.T) {
	// ip:port
	ip, port, hasPort := parseHostPort("192.168.1.100:5060")
	if ip != "192.168.1.100" || port != 5060 || !hasPort {
		t.Errorf("parseHostPort(192.168.1.100:5060) = %q, %d, %v", ip, port, hasPort)
	}

	// 纯 IP
	ip, port, hasPort = parseHostPort("192.168.1.100")
	if ip != "192.168.1.100" || port != 0 || hasPort {
		t.Errorf("parseHostPort(192.168.1.100) = %q, %d, %v", ip, port, hasPort)
	}

	// hostname
	ip, port, hasPort = parseHostPort("example.com")
	if ip != "example.com" || hasPort {
		t.Errorf("parseHostPort(example.com) = %q, %d, %v", ip, port, hasPort)
	}

	// hostname:port
	ip, port, hasPort = parseHostPort("proxy.example.com:5080")
	if ip != "proxy.example.com" || port != 5080 || !hasPort {
		t.Errorf("parseHostPort(proxy.example.com:5080) = %q, %d, %v", ip, port, hasPort)
	}
}
