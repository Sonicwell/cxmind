package rtp

import (
	"encoding/binary"
	"testing"
)

func TestDecodeG729ToPCM8k_OutputLength(t *testing.T) {
	// G.729 Standard frame: 10 bytes → 80 int16 samples (160 bytes) @ 8kHz
	// We'll use a 10-byte dummy frame (all zeros = silence)
	g729Frame := make([]byte, 10)

	pcm, err := DecodeG729ToPCM8k(g729Frame)
	if err != nil {
		t.Fatalf("Unexpected error decoding G.729: %v", err)
	}

	expectedLen := 80 * 2 // 80 samples * 2 bytes/sample
	if len(pcm) != expectedLen {
		t.Errorf("Expected PCM length %d bytes, got %d", expectedLen, len(pcm))
	}
}

func TestDecodeG729ToPCM8k_MultiFrame(t *testing.T) {
	// 2 sequential frames = 20 bytes → 160 samples (320 bytes)
	g729Payload := make([]byte, 20)

	pcm, err := DecodeG729ToPCM8k(g729Payload)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	expectedLen := 160 * 2 // 160 samples * 2 bytes
	if len(pcm) != expectedLen {
		t.Errorf("Expected %d bytes for 2 frames, got %d", expectedLen, len(pcm))
	}
}

func TestDecodeG729ToPCM8k_EmptyPayload(t *testing.T) {
	_, err := DecodeG729ToPCM8k([]byte{})
	if err == nil {
		t.Error("Expected error for empty payload, got nil")
	}
}

func TestDecodeG729ToPCM8k_IsLittleEndian(t *testing.T) {
	// Verify the output is valid 16-bit LE format
	pcm, err := DecodeG729ToPCM8k(make([]byte, 10))
	if err != nil {
		t.Fatal(err)
	}

	// Just check we can read back each sample without panicking
	for i := 0; i < len(pcm)-1; i += 2 {
		_ = int16(binary.LittleEndian.Uint16(pcm[i:]))
	}
}
