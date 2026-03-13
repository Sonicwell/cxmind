package simulator

import (
	"bytes"
	"net"
	"testing"
	"time"
)

func TestEncodeHEP3_WithCorrelationID(t *testing.T) {
	// Arrange
	payload := []byte("fake-rtp-data")
	srcIP := net.ParseIP("192.168.1.100")
	dstIP := net.ParseIP("10.0.0.5")
	srcPort := uint16(10000)
	dstPort := uint16(20000)
	timestamp := time.Unix(1672531200, 0)
	protoID := uint8(34) // RTP
	authKey := "test-auth-key"
	correlationID := "test-call-id-12345"

	// Act
	// EncodeHEP3 is expected to write the 0x0011 chunk if correlationID is provided
	// Since current implementation doesn't have the correlationID argument, this will fail compilation initially,
	// but we'll mock the expected signature here for TDD.

	// We'll first check if the chunk exists in the output of the unmodified signature (it won't).
	// Then we'll update the signature and this test will drive the implementation.

	output := EncodeHEP3(payload, srcIP, dstIP, srcPort, dstPort, timestamp, protoID, authKey, correlationID)

	// A generic chunk header is 6 bytes: 0x00 0x00 (vendor) + type (2 bytes) + len (2 bytes).
	// So we look for 0x00 0x00 0x00 0x11
	correlationChunkHeader := []byte{0x00, 0x00, 0x00, 0x11}

	if !bytes.Contains(output, correlationChunkHeader) {
		t.Errorf("Expected CorrelationID chunk 0x0011 to be in output, but it was missing.")
	} else {
		// Further verify the content of the chunk matches the injected correlation ID
		if !bytes.Contains(output, []byte(correlationID)) {
			t.Errorf("Expected correlationID string to be in output, but it was missing.")
		}
	}
}
