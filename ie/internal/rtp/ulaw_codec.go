package rtp

import (
	"encoding/binary"
	"sync"
)

// ulawTable is a precomputed lookup table for µ-law to 16-bit linear PCM conversion.
// 256 entries × 2 bytes = 512 bytes — fits entirely in L1 cache.
// Generated from the ITU-T G.711 µ-law specification.
var ulawTable [256]int16

func init() {
	// Populate the LUT using the same algorithm as the original ulawToLinear.
	for i := 0; i < 256; i++ {
		ulawTable[i] = ulawDecode(byte(i))
	}
}

// ulawDecode performs the bit-manipulation µ-law decode (used only for LUT init).
func ulawDecode(uByte byte) int16 {
	uOps := ^uByte
	sign := (int16(uOps) & 0x80) >> 7
	exponent := (int16(uOps) & 0x70) >> 4
	mantissa := (int16(uOps) & 0x0F)

	sample := (mantissa << 3) + 0x84
	sample <<= exponent
	sample -= 0x84

	if sign != 0 {
		return -sample
	}
	return sample
}

// ulawToLinearLUT converts a µ-law byte to a 16-bit linear PCM sample via LUT.
// Single array access — O(1), branch-free, L1 cache friendly.
func ulawToLinearLUT(uByte byte) int16 {
	return ulawTable[uByte]
}

// pcmBufSize is the maximum PCM buffer size for 20ms frames.
// G.711 uses 320 bytes, while G.722 (16kHz) uses 640 bytes.
const pcmBufSize = 640

// pcmPool reuses fixed-size PCM buffers to eliminate per-packet heap allocation.
// At 500K pps, this avoids ~160 MB/sec of GC pressure.
var pcmPool = sync.Pool{
	New: func() interface{} {
		b := make([]byte, pcmBufSize)
		return &b
	},
}

// GetPCMBuffer retrieves a 320-byte PCM buffer from the pool.
// The caller MUST call PutPCMBuffer after processing is complete.
func GetPCMBuffer() *[]byte {
	return pcmPool.Get().(*[]byte)
}

// PutPCMBuffer returns a PCM buffer to the pool.
func PutPCMBuffer(buf *[]byte) {
	if buf != nil {
		*buf = (*buf)[:pcmBufSize] // Reset length
		pcmPool.Put(buf)
	}
}

// DecodeUlawToPCM decodes a µ-law RTP payload into a PCM buffer using the LUT.
// The output buffer must be at least len(ulaw)*2 bytes.
func DecodeUlawToPCM(ulaw []byte, pcm []byte) {
	for i, b := range ulaw {
		sample := ulawTable[b]
		binary.LittleEndian.PutUint16(pcm[i*2:], uint16(sample))
	}
}
