package rtp

import (
	"encoding/binary"
	"math"
	"testing"
)

// Helper to create a minimal RTP payload with a specific sequence number
func makeRTPPayload(seq uint16) []byte {
	buf := make([]byte, 12) // minimum RTP header size
	buf[0] = 0x80           // Version 2, no padding, no extension, no CSRC
	buf[1] = 0              // Payload type 0 (PCMU)
	binary.BigEndian.PutUint16(buf[2:4], seq)
	binary.BigEndian.PutUint32(buf[4:8], 0)  // Timestamp
	binary.BigEndian.PutUint32(buf[8:12], 0) // SSRC
	return buf
}

// makeRTPPayloadWithTS creates an RTP payload with both seq and timestamp set.
func makeRTPPayloadWithTS(seq uint16, ts uint32) []byte {
	buf := make([]byte, 12)
	buf[0] = 0x80
	buf[1] = 0
	binary.BigEndian.PutUint16(buf[2:4], seq)
	binary.BigEndian.PutUint32(buf[4:8], ts)
	binary.BigEndian.PutUint32(buf[8:12], 0)
	return buf
}

func TestUpdatePacketStats_Sequential(t *testing.T) {
	var stats PacketStats

	// First packet
	if !UpdatePacketStats(&stats, makeRTPPayload(100), 8000) {
		t.Fatal("UpdatePacketStats failed on valid payload")
	}
	if stats.PacketsReceived != 1 {
		t.Errorf("PacketsReceived = %d, want 1", stats.PacketsReceived)
	}
	if stats.BaseSeq != 100 {
		t.Errorf("BaseSeq = %d, want 100", stats.BaseSeq)
	}
	if stats.MaxSeq != 100 {
		t.Errorf("MaxSeq = %d, want 100", stats.MaxSeq)
	}

	// Subsequent packets
	UpdatePacketStats(&stats, makeRTPPayload(101), 8000)
	UpdatePacketStats(&stats, makeRTPPayload(102), 8000)
	UpdatePacketStats(&stats, makeRTPPayload(103), 8000)

	if stats.PacketsReceived != 4 {
		t.Errorf("PacketsReceived = %d, want 4", stats.PacketsReceived)
	}
	if stats.MaxSeq != 103 {
		t.Errorf("MaxSeq = %d, want 103", stats.MaxSeq)
	}
	if stats.BaseSeq != 100 {
		t.Errorf("BaseSeq changed to %d, should stay 100", stats.BaseSeq)
	}
}

func TestUpdatePacketStats_OutOfOrder(t *testing.T) {
	var stats PacketStats

	UpdatePacketStats(&stats, makeRTPPayload(100), 8000)
	UpdatePacketStats(&stats, makeRTPPayload(103), 8000) // skip 101, 102
	UpdatePacketStats(&stats, makeRTPPayload(101), 8000) // late arrival

	if stats.PacketsReceived != 3 {
		t.Errorf("PacketsReceived = %d, want 3", stats.PacketsReceived)
	}
	if stats.MaxSeq != 103 {
		t.Errorf("MaxSeq = %d, want 103 (should not decrease)", stats.MaxSeq)
	}
}

func TestUpdatePacketStats_SequenceWraparound(t *testing.T) {
	var stats PacketStats

	// Near end of sequence space
	UpdatePacketStats(&stats, makeRTPPayload(65534), 8000)
	UpdatePacketStats(&stats, makeRTPPayload(65535), 8000)
	// Wraps around
	UpdatePacketStats(&stats, makeRTPPayload(0), 8000)
	UpdatePacketStats(&stats, makeRTPPayload(1), 8000)

	if stats.PacketsReceived != 4 {
		t.Errorf("PacketsReceived = %d, want 4", stats.PacketsReceived)
	}
	if stats.BaseSeq != 65534 {
		t.Errorf("BaseSeq = %d, want 65534", stats.BaseSeq)
	}
	if stats.MaxSeq != 1 {
		t.Errorf("MaxSeq = %d, want 1 (after wraparound)", stats.MaxSeq)
	}
}

func TestUpdatePacketStats_TooShort(t *testing.T) {
	var stats PacketStats

	if UpdatePacketStats(&stats, []byte{0x80, 0x00}, 8000) {
		t.Error("Should return false for payload < 4 bytes")
	}
	if stats.PacketsReceived != 0 {
		t.Error("PacketsReceived should stay 0 for invalid payload")
	}
}

func TestExpectedPackets(t *testing.T) {
	tests := []struct {
		name     string
		stats    PacketStats
		expected uint64
	}{
		{"uninitialized", PacketStats{}, 0},
		{"single packet", PacketStats{BaseSeq: 100, MaxSeq: 100, SeqInitialized: true}, 1},
		{"wraparound 65534-1", PacketStats{BaseSeq: 65534, MaxSeq: 1, Cycles: 65536, SeqInitialized: true}, 4},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.stats.ExpectedPackets()
			if got != tt.expected {
				t.Errorf("ExpectedPackets() = %d, want %d", got, tt.expected)
			}
		})
	}
}

func TestPacketLossRate(t *testing.T) {
	tests := []struct {
		name    string
		stats   PacketStats
		wantMin float64
		wantMax float64
	}{
		{
			"no loss",
			PacketStats{PacketsReceived: 4, BaseSeq: 100, MaxSeq: 103, SeqInitialized: true},
			0.0, 0.001,
		},
		{
			"50% loss",
			PacketStats{PacketsReceived: 2, BaseSeq: 100, MaxSeq: 103, SeqInitialized: true},
			0.49, 0.51,
		},
		{
			"no packets",
			PacketStats{},
			0.0, 0.001,
		},
		{
			"duplicates (received > expected)",
			PacketStats{PacketsReceived: 10, BaseSeq: 100, MaxSeq: 103, SeqInitialized: true},
			0.0, 0.001,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.stats.PacketLossRate()
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("PacketLossRate() = %f, want [%f, %f]", got, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestSeqAfter(t *testing.T) {
	tests := []struct {
		name string
		a, b uint16
		want bool
	}{
		{"normal order", 101, 100, true},
		{"same", 100, 100, false},
		{"reverse", 99, 100, false},
		{"wrap forward", 0, 65535, true},   // 0 is after 65535
		{"wrap backward", 65535, 0, false}, // 65535 is not after 0 (it's before)
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := seqAfter(tt.a, tt.b)
			if got != tt.want {
				t.Errorf("seqAfter(%d, %d) = %v, want %v", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

// ─── New tests for jitter and window stats ───

func TestJitterCalculation_Steady(t *testing.T) {
	// Simulate perfectly steady packets: identical inter-arrival and RTP timestamp gaps
	// Jitter should converge toward 0
	var stats PacketStats

	// First packet (no jitter computed)
	p1 := makeRTPPayloadWithTS(100, 160) // 160 = 20ms * 8000Hz
	UpdatePacketStats(&stats, p1, 8000)

	if stats.Jitter != 0 {
		t.Errorf("Jitter after first packet = %f, want 0", stats.Jitter)
	}

	// Second packet — jitter won't be 0 due to time.Now() granularity,
	// but it should be computed (non-zero LastArrivalNano)
	p2 := makeRTPPayloadWithTS(101, 320)
	UpdatePacketStats(&stats, p2, 8000)

	// After 2 packets, jitter should be non-negative
	if stats.Jitter < 0 {
		t.Errorf("Jitter should be non-negative, got %f", stats.Jitter)
	}
	if stats.WindowJitterCnt != 1 {
		t.Errorf("WindowJitterCnt = %d, want 1", stats.WindowJitterCnt)
	}
}

func TestJitterCalculation_NoTimestamp(t *testing.T) {
	// Payload with only 4 bytes (seq number only, no RTP timestamp)
	var stats PacketStats

	shortPayload := make([]byte, 4) // Only seq, no timestamp
	shortPayload[0] = 0x80
	binary.BigEndian.PutUint16(shortPayload[2:4], 100)

	UpdatePacketStats(&stats, shortPayload, 8000)

	// Jitter should not be computed with < 8 byte payload
	if stats.Jitter != 0 {
		t.Errorf("Jitter should be 0 with 4-byte payload, got %f", stats.Jitter)
	}
	if stats.LastArrivalNano != 0 {
		t.Errorf("LastArrivalNano should be 0 with 4-byte payload")
	}
}

func TestWindowStats_Tracking(t *testing.T) {
	var stats PacketStats

	UpdatePacketStats(&stats, makeRTPPayload(100), 8000)
	UpdatePacketStats(&stats, makeRTPPayload(101), 8000)
	UpdatePacketStats(&stats, makeRTPPayload(102), 8000)
	UpdatePacketStats(&stats, makeRTPPayload(103), 8000)

	// Window should track same as global
	if stats.WindowReceived != 4 {
		t.Errorf("WindowReceived = %d, want 4", stats.WindowReceived)
	}
	if stats.WindowFirstSeq != 100 {
		t.Errorf("WindowFirstSeq = %d, want 100", stats.WindowFirstSeq)
	}
	if stats.WindowMaxSeq != 103 {
		t.Errorf("WindowMaxSeq = %d, want 103", stats.WindowMaxSeq)
	}
	if stats.WindowExpectedPackets() != 4 {
		t.Errorf("WindowExpectedPackets() = %d, want 4", stats.WindowExpectedPackets())
	}
}

func TestWindowStats_LossRate(t *testing.T) {
	stats := PacketStats{
		WindowReceived: 3,
		WindowFirstSeq: 100,
		WindowMaxSeq:   103,
		WindowSeqInit:  true,
	}
	// Expected 4, received 3 → 25% loss
	loss := stats.WindowLossRate()
	if math.Abs(loss-0.25) > 0.01 {
		t.Errorf("WindowLossRate() = %f, want ~0.25", loss)
	}
}

func TestSnapshotAndResetWindow(t *testing.T) {
	var stats PacketStats

	// Feed 4 packets
	UpdatePacketStats(&stats, makeRTPPayloadWithTS(100, 160), 8000)
	UpdatePacketStats(&stats, makeRTPPayloadWithTS(101, 320), 8000)
	UpdatePacketStats(&stats, makeRTPPayloadWithTS(102, 480), 8000)
	UpdatePacketStats(&stats, makeRTPPayloadWithTS(103, 640), 8000)

	// Snapshot
	snap := stats.SnapshotAndResetWindow()

	if snap.Received != 4 {
		t.Errorf("snap.Received = %d, want 4", snap.Received)
	}
	if snap.Expected != 4 {
		t.Errorf("snap.Expected = %d, want 4", snap.Expected)
	}
	if snap.LossRate != 0.0 {
		t.Errorf("snap.LossRate = %f, want 0.0", snap.LossRate)
	}
	// AvgJitterMs should be non-negative
	if snap.AvgJitterMs < 0 {
		t.Errorf("snap.AvgJitterMs should be non-negative, got %f", snap.AvgJitterMs)
	}

	// Window should be reset
	if stats.WindowReceived != 0 {
		t.Errorf("After reset, WindowReceived = %d, want 0", stats.WindowReceived)
	}
	if stats.WindowSeqInit {
		t.Error("After reset, WindowSeqInit should be false")
	}
	if stats.WindowJitterSum != 0 {
		t.Errorf("After reset, WindowJitterSum = %f, want 0", stats.WindowJitterSum)
	}
	if stats.WindowJitterCnt != 0 {
		t.Errorf("After reset, WindowJitterCnt = %d, want 0", stats.WindowJitterCnt)
	}

	// Global stats should be preserved
	if stats.PacketsReceived != 4 {
		t.Errorf("Global PacketsReceived should still be 4, got %d", stats.PacketsReceived)
	}
	if stats.MaxSeq != 103 {
		t.Errorf("Global MaxSeq should still be 103, got %d", stats.MaxSeq)
	}

	// Feed more packets to second window
	UpdatePacketStats(&stats, makeRTPPayloadWithTS(104, 800), 8000)
	UpdatePacketStats(&stats, makeRTPPayloadWithTS(106, 1120), 8000) // skip 105

	snap2 := stats.SnapshotAndResetWindow()
	if snap2.Received != 2 {
		t.Errorf("snap2.Received = %d, want 2", snap2.Received)
	}
	if snap2.Expected != 3 {
		t.Errorf("snap2.Expected = %d, want 3 (104-106)", snap2.Expected)
	}
	// ~33% loss
	if math.Abs(snap2.LossRate-0.333) > 0.01 {
		t.Errorf("snap2.LossRate = %f, want ~0.333", snap2.LossRate)
	}
}

func TestWindowStats_NoLossWithDuplicates(t *testing.T) {
	stats := PacketStats{
		WindowReceived: 10,
		WindowFirstSeq: 100,
		WindowMaxSeq:   103,
		WindowSeqInit:  true,
	}
	loss := stats.WindowLossRate()
	if loss != 0 {
		t.Errorf("WindowLossRate() with duplicates = %f, want 0", loss)
	}
}

func TestWindowAvgJitterNano_Empty(t *testing.T) {
	var stats PacketStats
	if stats.WindowAvgJitterNano() != 0 {
		t.Errorf("WindowAvgJitterNano() on empty should be 0")
	}
}
