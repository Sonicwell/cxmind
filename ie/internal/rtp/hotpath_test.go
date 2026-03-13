package rtp

import (
	"testing"
)

// === HP-1: getVirtualStream should NOT use fmt.Sprintf ===

// TestGetVirtualStream_NoFmtSprintf verifies that getVirtualStream uses
// string concatenation instead of fmt.Sprintf for the lookup key.
// We test correctness: the key "callID:srcIP" must work for both Store and Load.
func TestGetVirtualStream_KeyFormat(t *testing.T) {
	s := newTestSniffer()

	callID := "hp1-test-call"
	srcIP := "192.168.1.100"

	// Store a stream using the expected key format
	stream := &RTPStream{callID: callID}
	expectedKey := callID + ":" + srcIP
	s.virtualListeners.Store(expectedKey, stream)

	// getVirtualStream must find it
	got, exists := s.getVirtualStream(callID, srcIP)
	if !exists {
		t.Fatal("HP-1 FAIL: getVirtualStream did not find stream with concatenated key")
	}
	if got.callID != callID {
		t.Fatalf("HP-1 FAIL: got callID %q, want %q", got.callID, callID)
	}
}

// BenchmarkGetVirtualStream_KeyAlloc benchmarks the key construction
// in getVirtualStream. After HP-1 fix, should report 1 alloc/op (string concat)
// instead of 2+ allocs/op (fmt.Sprintf with reflect).
func BenchmarkGetVirtualStream_KeyAlloc(b *testing.B) {
	s := newTestSniffer()
	callID := "bench-call-id-12345"
	srcIP := "10.0.0.1"
	stream := &RTPStream{callID: callID}
	s.virtualListeners.Store(callID+":"+srcIP, stream)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.getVirtualStream(callID, srcIP)
	}
}

// === HP-3: decryptAndParseRTP should pool rtp.Header ===

// BenchmarkDecryptAndParseRTP_Alloc benchmarks the per-packet allocation
// in decryptAndParseRTP. After HP-3 fix, should report fewer allocs/op.
func BenchmarkDecryptAndParseRTP_Alloc(b *testing.B) {
	// Construct a minimal valid RTP packet:
	// V=2, P=0, X=0, CC=0, M=0, PT=0, Seq=1, TS=160, SSRC=12345
	// + 160 bytes payload
	rtpPacket := make([]byte, 12+160)
	rtpPacket[0] = 0x80 // V=2
	rtpPacket[1] = 0x00 // PT=0 (PCMU)
	rtpPacket[2] = 0x00 // Seq high
	rtpPacket[3] = 0x01 // Seq low
	// TS and SSRC can be zeros for parsing

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		body, _, _ := decryptAndParseRTP(rtpPacket, nil)
		if len(body) != 160 {
			b.Fatalf("unexpected body length %d", len(body))
		}
	}
}
