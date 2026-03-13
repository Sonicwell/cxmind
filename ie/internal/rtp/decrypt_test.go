package rtp

import (
	"testing"

	"github.com/pion/rtp"
)

func TestDecryptAndParseRTP_PlainRTP(t *testing.T) {
	// Build a valid RTP packet (12-byte header + 160-byte payload)
	header := rtp.Header{
		Version:        2,
		PayloadType:    0, // G.711 PCMU
		SequenceNumber: 1,
		Timestamp:      160,
		SSRC:           12345,
	}
	headerBytes, err := header.Marshal()
	if err != nil {
		t.Fatal(err)
	}
	audioPayload := make([]byte, 160)
	for i := range audioPayload {
		audioPayload[i] = byte(i)
	}
	packet := append(headerBytes, audioPayload...)

	rtpBody, pcapPayload, _ := decryptAndParseRTP(packet, nil)

	// No SRTP — pcapPayload should be the original packet
	if len(pcapPayload) != len(packet) {
		t.Errorf("pcapPayload length = %d, want %d", len(pcapPayload), len(packet))
	}

	// rtpBody should be the audio payload (skip header)
	if len(rtpBody) != 160 {
		t.Errorf("rtpBody length = %d, want 160", len(rtpBody))
	}
	if rtpBody[0] != 0 || rtpBody[1] != 1 {
		t.Error("rtpBody content doesn't match expected audio payload")
	}
}

func TestDecryptAndParseRTP_TooShort(t *testing.T) {
	short := make([]byte, 10) // Less than 12-byte RTP header
	rtpBody, pcapPayload, _ := decryptAndParseRTP(short, nil)

	if len(rtpBody) != 0 {
		t.Errorf("rtpBody should be empty for short packet, got %d bytes", len(rtpBody))
	}
	if len(pcapPayload) != len(short) {
		t.Errorf("pcapPayload should be original packet")
	}
}

func TestDecryptAndParseRTP_NilPayload(t *testing.T) {
	rtpBody, pcapPayload, _ := decryptAndParseRTP(nil, nil)
	if len(rtpBody) != 0 {
		t.Error("rtpBody should be empty for nil payload")
	}
	if pcapPayload != nil {
		t.Error("pcapPayload should be nil for nil payload")
	}
}

// TestDecryptAndParseRTP_NonSRTPWithCSRC verifies that non-SRTP packets with
// CSRC entries are parsed correctly using pion/rtp header, not fixed 12 bytes (fix #4).
func TestDecryptAndParseRTP_NonSRTPWithCSRC(t *testing.T) {
	// Build RTP packet with 2 CSRC entries (header = 12 + 2*4 = 20 bytes)
	header := rtp.Header{
		Version:        2,
		PayloadType:    0,
		SequenceNumber: 42,
		Timestamp:      320,
		SSRC:           12345,
		CSRC:           []uint32{1111, 2222}, // 2 CSRC = +8 bytes
	}
	headerBytes, err := header.Marshal()
	if err != nil {
		t.Fatal(err)
	}
	if len(headerBytes) != 20 {
		t.Fatalf("expected 20-byte header with 2 CSRCs, got %d", len(headerBytes))
	}

	audioPayload := make([]byte, 80)
	for i := range audioPayload {
		audioPayload[i] = byte(i + 100) // easily identifiable content
	}
	packet := append(headerBytes, audioPayload...)

	rtpBody, _, _ := decryptAndParseRTP(packet, nil)

	if len(rtpBody) != 80 {
		t.Errorf("rtpBody length = %d, want 80 (CSRC-aware header skipping)", len(rtpBody))
	}
	if len(rtpBody) > 0 && rtpBody[0] != 100 {
		t.Errorf("rtpBody[0] = %d, want 100 (payload start)", rtpBody[0])
	}
}

// TestDecryptAndParseRTP_NonSRTPWithExtension verifies that non-SRTP packets
// with RTP header extensions are parsed correctly (fix #4).
func TestDecryptAndParseRTP_NonSRTPWithExtension(t *testing.T) {
	// Build RTP packet with a 1-word header extension (header > 12 bytes)
	header := rtp.Header{
		Version:          2,
		PayloadType:      0,
		SequenceNumber:   99,
		Timestamp:        640,
		SSRC:             54321,
		Extension:        true,
		ExtensionProfile: 0xBEDE,
	}
	// Use public API to set extension data
	if err := header.SetExtension(1, []byte{0xAA, 0xBB}); err != nil {
		t.Fatal(err)
	}
	headerBytes, err := header.Marshal()
	if err != nil {
		t.Fatal(err)
	}
	// Header should be > 12 bytes due to extension
	if len(headerBytes) <= 12 {
		t.Fatalf("expected header > 12 bytes with extension, got %d", len(headerBytes))
	}

	audioPayload := make([]byte, 40)
	for i := range audioPayload {
		audioPayload[i] = byte(i + 200)
	}
	packet := append(headerBytes, audioPayload...)

	rtpBody, _, _ := decryptAndParseRTP(packet, nil)

	if len(rtpBody) != 40 {
		t.Errorf("rtpBody length = %d, want 40 (extension-aware header skipping)", len(rtpBody))
	}
	if len(rtpBody) > 0 && rtpBody[0] != 200 {
		t.Errorf("rtpBody[0] = %d, want 200", rtpBody[0])
	}
}
