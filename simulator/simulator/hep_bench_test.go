package simulator

import (
	"net"
	"testing"
	"time"
)

func BenchmarkEncodeHEP3(b *testing.B) {
	// Pre-allocate variables to avoid allocation overhead in the benchmark loop
	payload := []byte("INVITE sip:bob@example.com SIP/2.0\r\nVia: SIP/2.0/UDP pc33.atlanta.example.com;branch=z9hG4bK776asdhds\r\nMax-Forwards: 70\r\nTo: Bob <sip:bob@example.com>\r\nFrom: Alice <sip:alice@example.com>;tag=1928301774\r\nCall-ID: a84b4c76e66710\r\nCSeq: 314159 INVITE\r\nContact: <sip:alice@pc33.atlanta.example.com>\r\nContent-Type: application/sdp\r\nContent-Length: 142\r\n")
	srcIP := net.ParseIP("192.168.1.100")
	dstIP := net.ParseIP("10.0.0.5")
	srcPort := uint16(5060)
	dstPort := uint16(5060)
	timestamp := time.Now()
	protoID := uint8(1) // SIP
	authKey := "my-secret-token"

	b.ResetTimer() // Reset timer to ignore setup time
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		EncodeHEP3(payload, srcIP, dstIP, srcPort, dstPort, timestamp, protoID, authKey, "a84b4c76e66710")
	}
}
