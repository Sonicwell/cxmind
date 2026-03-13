package rtp

import (
	"github.com/gotranspile/g722"
)

// DecodeG722ToPCM16k decodes a G.722 encoded byte slice into 16-bit PCM at 16kHz audio.
// The output slice is guaranteed to have a length exactly 4 times the length
// of the input slice, since G.722 packs 2 bytes (1 sample of 16-bit 16kHz audio)
// into 0.5 bytes (4 bits) for an 8kHz transmission.
func DecodeG722ToPCM16k(g722Data []byte, outBuf []byte) []byte {
	outLen := len(g722Data) * 4

	// Reuse capacity if possible
	if cap(outBuf) >= outLen {
		outBuf = outBuf[:outLen]
	} else {
		outBuf = make([]byte, outLen)
	}

	// gotranspile/g722 Decode function is stateless and returns []int16
	// FlagPacked ensures 2 samples per byte mapping which matches RTP G.722
	int16Buf := g722.Decode(g722Data, g722.Rate64000, g722.FlagSampleRate8000|g722.FlagPacked)

	samples := len(int16Buf)

	// Convert int16Buf to outBuf (Little-Endian)
	for i := 0; i < samples; i++ {
		sample := int16Buf[i]
		outBuf[i*2] = byte(sample & 0xFF)
		outBuf[i*2+1] = byte(sample >> 8)
	}

	return outBuf
}
