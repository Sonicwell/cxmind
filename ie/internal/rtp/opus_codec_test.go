package rtp

import (
	"encoding/binary"
	"math"
	"testing"
	"unsafe"
)

func TestDecodeOpusToPCM16k_ResamplingLength(t *testing.T) {
	// 1. Create a dummy buffer that mimics a 48kHz decoded Opus frame (e.g. 20ms = 960 samples = 1920 bytes)
	// pion/opus decoder outputs []int16, but we'll simulate the raw bytes coming out of our wrapper
	// We'll trust the actual pion library for the decoding part in the real implementation, but test the resampler here.

	// Since we can't easily mock an Opus encoded payload without a proper encoder,
	// we will directly test the `resample48To16` utility function that our wrapper will use.

	samples48k := 960 // 20ms at 48kHz
	pcm48k := make([]byte, samples48k*2)

	// Fill with a simple sine wave or just sequential data to track decimation
	for i := 0; i < samples48k; i++ {
		// A simple 1kHz sine wave
		val := int16(math.Sin(2*math.Pi*1000*float64(i)/48000.0) * 10000)
		binary.LittleEndian.PutUint16(pcm48k[i*2:], uint16(val))
	}

	// The expected output length is exactly 1/3 of the input (320 samples = 640 bytes)
	expectedBytes := (samples48k / 3) * 2

	// Create output buffer
	outBuf := make([]byte, expectedBytes)

	// 2. Call the resampler (will be implemented in opus_codec.go)
	resampled := resample48To16(pcm48k, outBuf)

	// 3. Assertions
	if len(resampled) != expectedBytes {
		t.Errorf("Expected resampled length %d, got %d", expectedBytes, len(resampled))
	}

	// Ensure the output buffer was actually used
	if structPointer(resampled) != structPointer(outBuf) {
		t.Errorf("Expected resampled byte slice to use the provided outBuf capacity")
	}

	// Verify frequency approximation (1/3 decimation shouldn't zero out the sine wave)
	silent := true
	for i := 0; i < len(resampled); i += 2 {
		val := int16(binary.LittleEndian.Uint16(resampled[i:]))
		if val != 0 {
			silent = false
			break
		}
	}

	if silent {
		t.Errorf("Expected resampled audio to contain signal, but got total silence")
	}
}

func structPointer(b []byte) uintptr {
	// Not safe for GC, just for test comparison
	if len(b) > 0 {
		return uintptr(unsafe.Pointer(&b[0]))
	}
	return 0
}
