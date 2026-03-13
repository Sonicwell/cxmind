package rtp

// alawTable is a precomputed lookup table for A-law to 16-bit linear PCM conversion.
// 256 entries × 2 bytes = 512 bytes — fits entirely in L1 cache.
// Generated from the ITU-T G.711 A-law specification.
var alawTable [256]int16

func init() {
	for i := 0; i < 256; i++ {
		alawTable[i] = alawDecode(byte(i))
	}
}

// alawDecode performs the ITU-T G.711 A-law bit-manipulation decode.
// Used only for LUT initialisation; the hot path uses alawToLinearLUT.
//
// ITU-T G.711 A-law algorithm:
//
//  1. XOR with 0x55 (alternating-bit inversion per spec).
//  2. Extract sign, exponent, mantissa.
//  3. Reconstruct linear sample.
func alawDecode(aByte byte) int16 {
	// Step 1: invert alternating bits (ITU-T G.711 §A.3.2)
	aByte ^= 0x55

	sign := (aByte & 0x80) >> 7
	exponent := (aByte & 0x70) >> 4
	mantissa := int16(aByte & 0x0F)

	var sample int16
	if exponent == 0 {
		// Special case: linear region (exponent == 0)
		sample = (mantissa << 1) | 1
	} else {
		// General case: (mantissa | 0x10) << (exponent - 1), then add bias
		sample = ((mantissa | 0x10) << exponent)
	}

	// Scale to 16-bit range (× 8, matching G.711 reference)
	sample <<= 3

	if sign == 0 {
		return -sample
	}
	return sample
}

// alawToLinearLUT converts an A-law byte to a 16-bit linear PCM sample via LUT.
// Single array access — O(1), branch-free, L1 cache friendly.
func alawToLinearLUT(aByte byte) int16 {
	return alawTable[aByte]
}

// DecodeAlawToPCM decodes an A-law RTP payload into a PCM buffer using the LUT.
// The output buffer must be at least len(alaw)*2 bytes.
// Output format: 16-bit signed little-endian PCM, 8kHz — identical to DecodeUlawToPCM.
func DecodeAlawToPCM(alaw []byte, pcm []byte) {
	for i, b := range alaw {
		sample := alawTable[b]
		// Little-endian int16 — same byte order as DecodeUlawToPCM
		pcm[i*2] = byte(uint16(sample))
		pcm[i*2+1] = byte(uint16(sample) >> 8)
	}
}
