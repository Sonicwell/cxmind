package rtp

import (
	"encoding/binary"
	"fmt"
	"sync"
	"testing"
)

// TestUlawLUT_EquivalenceAll256 verifies that the LUT produces identical output
// to the original bit-manipulation algorithm for all 256 possible input values.
func TestUlawLUT_EquivalenceAll256(t *testing.T) {
	for i := 0; i < 256; i++ {
		b := byte(i)
		expected := ulawDecode(b) // Original algorithm
		got := ulawToLinearLUT(b) // LUT version
		if got != expected {
			t.Errorf("ulawTable[%d]: got %d, want %d", i, got, expected)
		}
	}
}

// TestUlawLUT_KnownValues checks specific known µ-law to PCM mappings.
func TestUlawLUT_KnownValues(t *testing.T) {
	// µ-law silence (0xFF) should decode to 0
	// µ-law 0x00 is the largest negative value
	tests := []struct {
		input    byte
		expected int16
	}{
		{0xFF, 0},      // Silence (digital zero)
		{0x7F, 0},      // Positive silence
		{0x80, 32124},  // Max negative magnitude, but sign=0 in complement
		{0x00, -32124}, // Max positive magnitude, sign=1
	}

	for _, tt := range tests {
		got := ulawToLinearLUT(tt.input)
		if got != tt.expected {
			t.Errorf("ulawToLinearLUT(%#02x) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}

// TestDecodeUlawToPCM verifies bulk decode matches per-byte decode.
func TestDecodeUlawToPCM(t *testing.T) {
	// Create a test ulaw buffer with diverse values
	ulaw := make([]byte, 160)
	for i := range ulaw {
		ulaw[i] = byte(i) // 0-159, covering a range of values
	}

	// Decode with the bulk function
	pcm := make([]byte, len(ulaw)*2)
	DecodeUlawToPCM(ulaw, pcm)

	// Verify each sample against the LUT
	for i, b := range ulaw {
		expected := ulawToLinearLUT(b)
		got := int16(binary.LittleEndian.Uint16(pcm[i*2:]))
		if got != expected {
			t.Errorf("sample[%d]: got %d, want %d", i, got, expected)
		}
	}
}

// TestPCMPool_GetPut verifies basic pool operation.
func TestPCMPool_GetPut(t *testing.T) {
	buf := GetPCMBuffer()
	if buf == nil {
		t.Fatal("GetPCMBuffer returned nil")
	}
	if len(*buf) != pcmBufSize {
		t.Errorf("buffer length = %d, want %d", len(*buf), pcmBufSize)
	}
	PutPCMBuffer(buf)
}

// TestPCMPool_DataIntegrity verifies that pool does not cause data corruption.
func TestPCMPool_DataIntegrity(t *testing.T) {
	// Get buffer, write data, release, get again, write different data
	buf1 := GetPCMBuffer()
	copy(*buf1, []byte("first-data-12345"))
	PutPCMBuffer(buf1)

	buf2 := GetPCMBuffer()
	// Write new data — should completely overwrite
	ulaw := make([]byte, 160)
	for i := range ulaw {
		ulaw[i] = 0x80 // All same value
	}
	DecodeUlawToPCM(ulaw, *buf2)

	// Verify all samples are the expected value for 0x80
	expected := ulawToLinearLUT(0x80)
	for i := 0; i < 160; i++ {
		got := int16(binary.LittleEndian.Uint16((*buf2)[i*2:]))
		if got != expected {
			t.Errorf("sample[%d]: got %d, want %d (data corruption!)", i, got, expected)
		}
	}
	PutPCMBuffer(buf2)
}

// TestPCMPool_ConcurrentSafety verifies pool works under concurrent access.
func TestPCMPool_ConcurrentSafety(t *testing.T) {
	var wg sync.WaitGroup
	errCh := make(chan error, 200)

	ulaw := make([]byte, 160)
	for i := range ulaw {
		ulaw[i] = byte(i)
	}

	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			buf := GetPCMBuffer()
			DecodeUlawToPCM(ulaw, *buf)

			// Verify data integrity
			for j, b := range ulaw {
				expected := ulawToLinearLUT(b)
				got := int16(binary.LittleEndian.Uint16((*buf)[j*2:]))
				if got != expected {
					errCh <- fmt.Errorf("sample[%d]: got %d, want %d", j, got, expected)
					break
				}
			}
			PutPCMBuffer(buf)
		}()
	}

	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Errorf("concurrent error: %v", err)
	}
}

// --- Benchmarks ---

func BenchmarkUlawDecode_Original(b *testing.B) {
	ulaw := make([]byte, 160)
	for i := range ulaw {
		ulaw[i] = byte(i)
	}
	b.ResetTimer()
	b.ReportAllocs()
	for n := 0; n < b.N; n++ {
		pcm := make([]byte, 320)
		for i, v := range ulaw {
			sample := ulawDecode(v)
			binary.LittleEndian.PutUint16(pcm[i*2:], uint16(sample))
		}
	}
}

func BenchmarkUlawDecode_LUT(b *testing.B) {
	ulaw := make([]byte, 160)
	for i := range ulaw {
		ulaw[i] = byte(i)
	}
	b.ResetTimer()
	b.ReportAllocs()
	for n := 0; n < b.N; n++ {
		pcm := make([]byte, 320)
		DecodeUlawToPCM(ulaw, pcm)
	}
}

func BenchmarkUlawDecode_LUT_Pooled(b *testing.B) {
	ulaw := make([]byte, 160)
	for i := range ulaw {
		ulaw[i] = byte(i)
	}
	b.ResetTimer()
	b.ReportAllocs()
	for n := 0; n < b.N; n++ {
		buf := GetPCMBuffer()
		DecodeUlawToPCM(ulaw, *buf)
		PutPCMBuffer(buf)
	}
}
