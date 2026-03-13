package rtp

import (
	"testing"
)

// TestUpdatePacketStats_ExtendedSequence verifies that extreme out-of-order networks
// around the 65535 boundary correctly calculate expected packets without negative loss wrap-around.
func TestUpdatePacketStats_ExtendedSequence(t *testing.T) {
	var stats PacketStats

	// Init near boundary (65534)
	UpdatePacketStats(&stats, makeRTPPayloadWithTS(65534, 160), 8000)

	// Normal increment (65535)
	UpdatePacketStats(&stats, makeRTPPayloadWithTS(65535, 320), 8000)

	// Wrapping boundary (next seq is 0)
	UpdatePacketStats(&stats, makeRTPPayloadWithTS(0, 480), 8000)

	// A severely delayed out-of-order packet arrives AFTER wrapping (e.g. seq 65533)
	UpdatePacketStats(&stats, makeRTPPayloadWithTS(65533, 0), 8000)

	// Since we received 4 packets and the true distinct sequence covered goes from 65533 to 0 (a range of 4 distinct packets)
	// the expected packets should properly reflect the extended sequence gap.
	// We want to make sure it doesn't give a crazy number like 65500 or calculate negative packet loss.
	expected := stats.ExpectedPackets()
	if expected != 4 {
		t.Fatalf("Expected 4 packets in sequence covering 65533 -> 0, got %d", expected)
	}

	lossRate := stats.PacketLossRate()
	if lossRate < 0.0 || lossRate > 0.0 {
		t.Fatalf("Loss rate should be 0.0, got %f", lossRate)
	}
}
