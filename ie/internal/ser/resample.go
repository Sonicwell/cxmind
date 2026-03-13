package ser

import (
	"math"
)

// resamplePCM resamples signed 16-bit LE PCM from srcRate to dstRate
// using linear interpolation. This is a simple but effective approach
// that avoids external dependencies (e.g. libsamplerate).
func resamplePCM(pcm []byte, srcRate, dstRate int) []byte {
	if srcRate == dstRate {
		return pcm
	}

	nSrcSamples := len(pcm) / 2
	ratio := float64(dstRate) / float64(srcRate)
	nDstSamples := int(math.Ceil(float64(nSrcSamples) * ratio))

	dst := make([]byte, nDstSamples*2)

	for i := 0; i < nDstSamples; i++ {
		// Map destination sample index back to source
		srcPos := float64(i) / ratio
		srcIdx := int(srcPos)
		frac := float32(srcPos - float64(srcIdx))

		// Read source sample
		var s0, s1 int16
		if srcIdx < nSrcSamples {
			s0 = int16(pcm[srcIdx*2]) | int16(pcm[srcIdx*2+1])<<8
		}
		if srcIdx+1 < nSrcSamples {
			s1 = int16(pcm[(srcIdx+1)*2]) | int16(pcm[(srcIdx+1)*2+1])<<8
		} else {
			s1 = s0
		}

		// Linear interpolation
		sample := int16(float32(s0)*(1.0-frac) + float32(s1)*frac)

		// Write LE
		dst[i*2] = byte(sample)
		dst[i*2+1] = byte(sample >> 8)
	}

	return dst
}

// ResampleLinear resamples float32 audio from srcRate to dstRate
func ResampleLinear(input []float32, srcRate, dstRate int) []float32 {
	if srcRate == dstRate {
		return input
	}

	ratio := float64(dstRate) / float64(srcRate)
	nDstSamples := int(math.Ceil(float64(len(input)) * ratio))
	output := make([]float32, nDstSamples)

	for i := 0; i < nDstSamples; i++ {
		srcPos := float64(i) / ratio
		srcIdx := int(srcPos)
		frac := float32(srcPos - float64(srcIdx))

		var s0, s1 float32
		if srcIdx < len(input) {
			s0 = input[srcIdx]
		}
		if srcIdx+1 < len(input) {
			s1 = input[srcIdx+1]
		} else {
			s1 = s0
		}

		output[i] = s0*(1.0-frac) + s1*frac
	}

	return output
}
