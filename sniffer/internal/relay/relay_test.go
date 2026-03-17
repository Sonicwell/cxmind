package relay

import (
	"fmt"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/cxmind/sniffer/internal/hep"
)

func TestExtractCallID(t *testing.T) {
	tests := []struct {
		name    string
		payload string
		want    string
	}{
		{"Standard Call-ID", "INVITE sip:a@b SIP/2.0\r\nCall-ID: 12345-abc-def\r\nFrom: A", "12345-abc-def"},
		{"Lowercase Call-ID", "INVITE sip:a@b SIP/2.0\r\ncall-id: lowercased-id\r\nFrom: A", "lowercased-id"},
		{"Compact i", "INVITE sip:a@b SIP/2.0\r\ni: compact-id-999\r\nFrom: A", "compact-id-999"},
		{"No Call-ID", "INVITE sip:a@b SIP/2.0\r\nFrom: A", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractCallID([]byte(tt.payload))
			if got != tt.want {
				t.Errorf("extractCallID() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestExtractMediaPort(t *testing.T) {
	tests := []struct {
		name     string
		sdp      string
		wantIP   string
		wantPort int
	}{
		{
			"Standard SDP",
			"v=0\r\nc=IN IP4 10.0.0.99\r\nm=audio 10000 RTP/AVP 0\r\n",
			"10.0.0.99",
			10000,
		},
		{
			"Media level c=",
			"v=0\r\nc=IN IP4 1.1.1.1\r\nm=audio 12345 RTP/AVP 8\r\nc=IN IP4 10.0.0.99\r\n",
			"10.0.0.99",
			12345,
		},
		{
			"No port",
			"v=0\r\nc=IN IP4 10.1.1.1\r\nm=video 5000 RTP\r\n",
			"",
			0, // only m=audio is matched
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotIP, gotPort := extractMediaPort([]byte(tt.sdp))
			if gotIP != tt.wantIP || gotPort != tt.wantPort {
				t.Errorf("got %q:%d, want %q:%d", gotIP, gotPort, tt.wantIP, tt.wantPort)
			}
		})
	}
}

// MockHEPClient tracks packets sent via the HEP client interface
type MockHEPClient struct {
	CapturedRaw         [][]byte
	CapturedCorrelation []struct {
		Payload []byte
		CorrID  string
	}
}

func (m *MockHEPClient) SendRaw(data []byte) error {
	m.CapturedRaw = append(m.CapturedRaw, data)
	return nil
}

func (m *MockHEPClient) SendWithCorrelation(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort uint16, timestamp time.Time, protoID uint8, correlationID string) error {
	m.CapturedCorrelation = append(m.CapturedCorrelation, struct {
		Payload []byte
		CorrID  string
	}{payload, correlationID})
	return nil
}

func TestMapping_InviteSDP_RTPHit(t *testing.T) {
	mockIE := &MockHEPClient{}
	r := NewRelay(mockIE, nil, false, time.Hour) // Use interface internally for tests if needed, or modify test to use real Client with mocked Conn

	// 1. Send SIP INVITE to build mapping
	sipPayload := []byte("INVITE sip:x@y SIP/2.0\r\nCall-ID: my-call-id\r\n\r\n" +
		"v=0\r\nc=IN IP4 10.1.1.100\r\nm=audio 16000 RTP/AVP\r\n")

	r.HandleLocalSIP(sipPayload, net.IPv4(1, 1, 1, 1), net.IPv4(2, 2, 2, 2), 5060, 5060, time.Now())

	// Mapping should exist for 10.1.1.100:16000 -> my-call-id
	callID, ok := r.LookupCallID("10.1.1.100", 16000)
	if !ok || callID != "my-call-id" {
		t.Fatalf("Lookup failed: got %q, %v", callID, ok)
	}

	// 2. Local RTP packet arrives matching the mapping
	rtpPayload := []byte{0x80, 0x00, 0x11, 0x22} // fake RTP
	r.HandleLocalRTP(rtpPayload, net.ParseIP("10.1.1.100"), net.ParseIP("10.2.2.200"), 16000, 20000, time.Now())

	// 3. Verify RTP was forwarded with correlation ID
	rtpCount := 0
	for _, c := range mockIE.CapturedCorrelation {
		if c.CorrID == "my-call-id" && c.Payload[0] == 0x80 { // basic check for the mock RTP packet
			rtpCount++
		}
	}
	if rtpCount != 1 {
		t.Fatalf("Expected 1 RTP packet forwarded, got %d", rtpCount)
	}
}

func TestMapping_BYECleanup(t *testing.T) {
	mockIE := &MockHEPClient{}
	r := NewRelay(mockIE, nil, false, time.Hour)

	// Build mapping
	sipPayload := []byte("INVITE sip:x@y SIP/2.0\r\nCall-ID: bye-test\r\n\r\n" +
		"v=0\r\nc=IN IP4 10.1.1.100\r\nm=audio 16000 RTP/AVP\r\n")
	r.HandleLocalSIP(sipPayload, net.IPv4(1, 1, 1, 1), net.IPv4(2, 2, 2, 2), 5060, 5060, time.Now())

	// Verify it's there
	_, ok := r.LookupCallID("10.1.1.100", 16000)
	if !ok {
		t.Fatal("Mapping not created")
	}

	// Send BYE
	byePayload := []byte("BYE sip:x@y SIP/2.0\r\nCall-ID: bye-test\r\n\r\n")
	r.HandleLocalSIP(byePayload, net.IPv4(1, 1, 1, 1), net.IPv4(2, 2, 2, 2), 5060, 5060, time.Now())

	// Verify it's gone
	_, ok = r.LookupCallID("10.1.1.100", 16000)
	if ok {
		t.Error("Mapping still exists after BYE")
	}
}

func TestMapping_TTLExpiry(t *testing.T) {
	mockIE := &MockHEPClient{}
	r := NewRelay(mockIE, nil, false, 1*time.Millisecond) // extreme short TTL

	sipPayload := []byte("INVITE sip:x@y SIP/2.0\r\nCall-ID: ttl-test\r\n\r\n" +
		"v=0\r\nc=IN IP4 10.1.1.100\r\nm=audio 16000 RTP/AVP\r\n")
	r.HandleLocalSIP(sipPayload, net.IPv4(1, 1, 1, 1), net.IPv4(2, 2, 2, 2), 5060, 5060, time.Now())

	time.Sleep(10 * time.Millisecond) // wait for expiry loop
	// trigger cleanup manually if background loop isn't instant
	r.cleanupExpired()

	_, ok := r.LookupCallID("10.1.1.100", 16000)
	if ok {
		t.Error("Mapping survived after TTL expired")
	}
}

func TestHandlePeerHEP_RelayUpstream(t *testing.T) {
	mockIE := &MockHEPClient{}

	// Test with relay_upstream = true
	rRelay := NewRelay(mockIE, nil, true, time.Hour)
	rawHEP := []byte("HEP3...")
	pkt := &hep.HEPPacket{
		ProtocolType: 1, // SIP
		Payload:      []byte("INVITE sip:x@y SIP/2.0\r\nCall-ID: peer-1\r\n\r\nv=0\r\nc=IN IP4 2.2.2.2\r\nm=audio 20000 RTP/AVP\r\n"),
	}

	rRelay.HandlePeerHEP(rawHEP, pkt)

	// 1. Should be in mapping
	if id, ok := rRelay.LookupCallID("2.2.2.2", 20000); !ok || id != "peer-1" {
		t.Errorf("Mapping failed for peer SDP")
	}

	// 2. Should have forwarded to IE (Raw)
	if len(mockIE.CapturedRaw) != 1 {
		t.Errorf("Expected 1 forwarded raw packet due to relay_upstream=true")
	}
}

func TestHandlePeerHEP_NoRelay(t *testing.T) {
	mockIE := &MockHEPClient{}

	// Test with relay_upstream = false (Peer Mesh mode)
	rMesh := NewRelay(mockIE, nil, false, time.Hour)
	rawHEP := []byte("HEP3...")
	pkt := &hep.HEPPacket{
		ProtocolType: 1, // SIP
		Payload:      []byte("INVITE sip:x@y SIP/2.0\r\nCall-ID: peer-2\r\n\r\nv=0\r\nc=IN IP4 3.3.3.3\r\nm=audio 30000 RTP/AVP\r\n"),
	}

	rMesh.HandlePeerHEP(rawHEP, pkt)

	// 1. Should be in mapping
	if id, ok := rMesh.LookupCallID("3.3.3.3", 30000); !ok || id != "peer-2" {
		t.Errorf("Mapping failed for peer SDP in mesh mode")
	}

	// 2. Should NOT have forwarded to IE
	if len(mockIE.CapturedRaw) != 0 {
		t.Errorf("Expected 0 forwarded packets due to relay_upstream=false")
	}
}
func BenchmarkExtractCallID(b *testing.B) {
	payload := []byte("INVITE sip:x@y SIP/2.0\r\nVia: SIP/2.0/UDP 10.1.1.1:5060;branch=z9hG4bK\r\nFrom: <sip:a@b>;tag=123\r\nTo: <sip:b@c>\r\nCall-ID: bench-call-12345-abcde\r\nCSeq: 1 INVITE\r\n\r\n")
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		extractCallID(payload)
	}
}

func TestRaceAddMapping(t *testing.T) {
	mockIE := &MockHEPClient{}
	r := NewRelay(mockIE, nil, false, time.Hour)

	callID := "race-test-call-id"

	var wg sync.WaitGroup
	// Simulate 100 concurrent workers trying to add mapping to the SAME call id
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			r.addMapping(callID, fmt.Sprintf("10.0.0.%d", idx), 10000+idx)
		}(i)
	}
	wg.Wait()

	// If it doesn't crash from concurrent map write or data race, we check the length
	v, ok := r.callPorts.Load(callID)
	if !ok {
		t.Fatal("callPorts should have the call id")
	}
	portsMap := v.(*sync.Map)
	count := 0
	portsMap.Range(func(key, value interface{}) bool {
		count++
		return true
	})
	if count != 100 {
		t.Errorf("Expected 100 ports mapped, got %d. Due to race condition, some might have been lost.", count)
	}
}

func TestCleanupPartial(t *testing.T) {
	mockIE := &MockHEPClient{}
	r := NewRelay(mockIE, nil, false, time.Hour)

	callID := "cleanup-test"
	r.addMapping(callID, "10.0.0.1", 10000)
	r.addMapping(callID, "10.0.0.2", 20000)

	// manually expire one of them
	r.portMap.Store("10.0.0.1:10000", mappingEntry{CallID: callID, ExpiresAt: time.Now().Add(-time.Hour)})

	r.cleanupExpired()

	// The other mapping should still be alive
	if _, ok := r.LookupCallID("10.0.0.2", 20000); !ok {
		t.Error("The active mapping was accidentally deleted because the whole callPorts was deleted")
	}

	// callPorts reverse lookup shouldn't be completely deleted yet
	if _, ok := r.callPorts.Load(callID); !ok {
		t.Error("callPorts reference was prematurely deleted while other ports are still active")
	}
}
