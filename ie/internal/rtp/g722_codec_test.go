package rtp

import (
	"testing"
)

// TestDecodeG722_LengthAndFormat verifies that G.722 decoder correctly unpacks
// a byte slice into 16-bit PCM at 16kHz, resulting in an output slice 4x the length.
// G.722 encodes 14-bit audio at 16kHz into 8-bit at 8kHz (64kbps).
// Output is 16-bit PCM, so length will be 4 bytes for every 1 byte of G.722 input.
func TestDecodeG722_LengthAndFormat(t *testing.T) {
	// Create a synthetic G.722 byte slice (160 bytes)
	g722Data := make([]byte, 160)
	// Fill with typical G.722 encoded silence/pattern
	for i := range g722Data {
		g722Data[i] = 0xAA // alternate bits pattern
	}

	// Output buffer for PCM
	pcmBuf := make([]byte, 0, len(g722Data)*4)

	// Function we will implement in TDD step
	pcmOut := DecodeG722ToPCM16k(g722Data, pcmBuf)

	expectedLen := len(g722Data) * 4 // expected 640 bytes (320 16-bit samples)
	if len(pcmOut) != expectedLen {
		t.Errorf("expected decoded PCM length %d, got %d", expectedLen, len(pcmOut))
	}

	// Even if it's fake data, it shouldn't panic and should have produced bytes
	if len(pcmOut) == 0 {
		t.Error("decoded PCM is empty")
	}
}

// TestDecodeG722ToPCM16k_Capacity verifies that existing buffer capacity is used if sufficient.
func TestDecodeG722ToPCM16k_Capacity(t *testing.T) {
	g722Data := make([]byte, 80) // 80 bytes

	// Create a buffer that's large enough (at least 320 bytes)
	preAllocated := make([]byte, 0, 500)

	pcmOut := DecodeG722ToPCM16k(g722Data, preAllocated)

	// The length should be exactly 80 * 4 = 320
	if len(pcmOut) != 320 {
		t.Errorf("expected 320 length, got %d", len(pcmOut))
	}

	// Check that we actually reused the array pointer
	if cap(pcmOut) != 500 {
		t.Errorf("expected capacity 500 (reused), got %d", cap(pcmOut))
	}
}

// BenchmarkDecodeG722ToPCM16k measures performance of the decode loop.
func BenchmarkDecodeG722ToPCM16k(b *testing.B) {
	g722Data := make([]byte, 160) // typical 20ms frame
	outBuf := make([]byte, 0, 640)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = DecodeG722ToPCM16k(g722Data, outBuf)
	}
}
