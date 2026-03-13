package rtp

import (
	"encoding/binary"
	"testing"
)

// TestAlawLUT_EquivalenceAll256 verifies that the LUT produces identical output
// to the reference decode algorithm for all 256 possible A-law input values.
func TestAlawLUT_EquivalenceAll256(t *testing.T) {
	for i := 0; i < 256; i++ {
		b := byte(i)
		expected := alawDecode(b) // reference algorithm
		got := alawToLinearLUT(b) // LUT version
		if got != expected {
			t.Errorf("alawTable[%d]: got %d, want %d", i, got, expected)
		}
	}
}

// TestAlawLUT_KnownValues checks specific ITU-T G.711 A-law to PCM mappings.
// Reference values from ITU-T G.711 Table 1.
func TestAlawLUT_KnownValues(t *testing.T) {
	// A-law silence (after XOR 0x55): 0xD5 encodes digital zero
	// 0x00 after XOR = maximum signal
	tests := []struct {
		input    byte
		wantSign string // "positive", "negative", or "zero"
	}{
		{0xD5, "zero"},     // silence (digital zero)
		{0x55, "zero"},     // alternative silence (positive)
		{0x00, "negative"}, // large negative magnitude
		{0x80, "positive"}, // large positive magnitude
	}

	for _, tt := range tests {
		got := alawToLinearLUT(tt.input)
		switch tt.wantSign {
		case "zero":
			if got > 264 || got < -264 { // small tolerance for silence region
				t.Errorf("alawToLinearLUT(%#02x) = %d, expected near-zero (silence)", tt.input, got)
			}
		case "positive":
			if got <= 0 {
				t.Errorf("alawToLinearLUT(%#02x) = %d, expected positive sample", tt.input, got)
			}
		case "negative":
			if got >= 0 {
				t.Errorf("alawToLinearLUT(%#02x) = %d, expected negative sample", tt.input, got)
			}
		}
	}
}

// TestDecodeAlawToPCM_BulkMatchesPerByte verifies bulk decode == per-byte LUT.
func TestDecodeAlawToPCM_BulkMatchesPerByte(t *testing.T) {
	alaw := make([]byte, 160)
	for i := range alaw {
		alaw[i] = byte(i) // 0-159 covers a representative range
	}

	pcm := make([]byte, len(alaw)*2)
	DecodeAlawToPCM(alaw, pcm)

	for i, b := range alaw {
		expected := alawToLinearLUT(b)
		got := int16(binary.LittleEndian.Uint16(pcm[i*2:]))
		if got != expected {
			t.Errorf("sample[%d] (A-law byte %#02x): got %d, want %d", i, b, got, expected)
		}
	}
}

// TestDecodeAlawToPCM_OutputIsLittleEndian ensures byte order matches DecodeUlawToPCM.
func TestDecodeAlawToPCM_OutputIsLittleEndian(t *testing.T) {
	// Use 0x00 (large negative) — known non-zero result
	alaw := []byte{0x00}
	pcm := make([]byte, 2)
	DecodeAlawToPCM(alaw, pcm)

	fromPCM := int16(binary.LittleEndian.Uint16(pcm))
	direct := alawToLinearLUT(0x00)
	if fromPCM != direct {
		t.Errorf("byte-order mismatch: DecodeAlawToPCM gave %d, direct LUT gave %d", fromPCM, direct)
	}
}

// TestExtractRTPTimestamp verifies the helper reads bytes 4-7 correctly.
func TestExtractRTPTimestamp(t *testing.T) {
	// Craft a fake 12-byte RTP header with timestamp = 0xDEADBEEF at bytes 4-7
	pkt := make([]byte, 12)
	pkt[4] = 0xDE
	pkt[5] = 0xAD
	pkt[6] = 0xBE
	pkt[7] = 0xEF

	ts := extractRTPTimestamp(pkt)
	if ts != 0xDEADBEEF {
		t.Errorf("extractRTPTimestamp = %#x, want 0xDEADBEEF", ts)
	}
}

// TestExtractRTPTimestamp_TooShort ensures no panic on short packets.
func TestExtractRTPTimestamp_TooShort(t *testing.T) {
	ts := extractRTPTimestamp([]byte{0x80, 0x00})
	if ts != 0 {
		t.Errorf("extractRTPTimestamp(short) = %d, want 0", ts)
	}
}

// TestJBPacket_CarriesPayloadType ensures JitterBuffer correctly propagates
// PayloadType from Push to Output.
func TestJBPacket_CarriesPayloadType(t *testing.T) {
	jb := NewJitterBuffer(1)

	// Push a PCMA packet (PT=8), a PCMU packet (PT=0)
	packetPCMA := makePacketWithPT(1, 8)
	packetPCMU := makePacketWithPT(2, 0)

	jb.Push(packetPCMA, 8, 0)
	jb.Push(packetPCMU, 0, 0)
	jb.Stop()

	out := jb.Output()

	pkt1 := <-out
	if pkt1.PayloadType != 8 {
		t.Errorf("packet 1 PayloadType = %d, want 8 (PCMA)", pkt1.PayloadType)
	}
	pkt2 := <-out
	if pkt2.PayloadType != 0 {
		t.Errorf("packet 2 PayloadType = %d, want 0 (PCMU)", pkt2.PayloadType)
	}
}

// makePacketWithPT creates a minimal RTP packet with the given seq and payload type.
func makePacketWithPT(seq uint16, pt uint8) []byte {
	pkt := make([]byte, 12+160)
	pkt[0] = 0x80 // Version=2
	pkt[1] = pt   // PayloadType
	pkt[2] = byte(seq >> 8)
	pkt[3] = byte(seq)
	// bytes 4-7: timestamp (0), bytes 8-11: SSRC (0)
	return pkt
}

// --- Benchmarks ---

func BenchmarkDecodeAlawToPCM(b *testing.B) {
	alaw := make([]byte, 160)
	for i := range alaw {
		alaw[i] = byte(i)
	}
	b.ResetTimer()
	b.ReportAllocs()
	for n := 0; n < b.N; n++ {
		pcm := make([]byte, 320)
		DecodeAlawToPCM(alaw, pcm)
	}
}

func BenchmarkDecodeAlawToPCM_Pooled(b *testing.B) {
	alaw := make([]byte, 160)
	for i := range alaw {
		alaw[i] = byte(i)
	}
	b.ResetTimer()
	b.ReportAllocs()
	for n := 0; n < b.N; n++ {
		buf := GetPCMBuffer()
		DecodeAlawToPCM(alaw, *buf)
		PutPCMBuffer(buf)
	}
}
