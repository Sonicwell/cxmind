package rtp

import (
	"encoding/binary"
	"fmt"

	hrOpus "github.com/hraban/opus"
)

// DecodeOpusToPCM16k decodes an Opus payload using the full libopus C library (hraban/opus).
// Creates a new decoder per call — use DecodeOpusToPCM16kWithDec for per-stream reuse.
func DecodeOpusToPCM16k(opusData []byte, outBuf []byte, channels int) ([]byte, error) {
	if channels < 1 {
		channels = 1
	}

	dec, err := hrOpus.NewDecoder(48000, channels)
	if err != nil {
		return nil, fmt.Errorf("opus: failed to create decoder: %v", err)
	}

	return DecodeOpusToPCM16kWithDec(dec, opusData, outBuf, channels)
}

// DecodeOpusToPCM16kWithDec decodes an Opus payload using a pre-created decoder.
// Reusing the decoder preserves SILK/CELT state continuity across frames, improving
// audio quality and eliminating per-packet CGo allocation overhead.
func DecodeOpusToPCM16kWithDec(dec *hrOpus.Decoder, opusData []byte, outBuf []byte, channels int) ([]byte, error) {
	if channels < 1 {
		channels = 1
	}

	// Max frame size for 60ms at 48kHz = 2880 samples per channel.
	pcm48k := make([]int16, 2880*channels)

	n, err := dec.Decode(opusData, pcm48k)
	if err != nil {
		return nil, fmt.Errorf("opus decode error: %v", err)
	}

	// n = number of samples per channel decoded at 48kHz.
	var monoSamples []int16
	if channels == 2 {
		// Stereo → Mono downmix: average left and right channels
		monoSamples = stereoToMono(pcm48k[:n*channels])
	} else {
		monoSamples = pcm48k[:n]
	}

	// Downsample 48kHz → 16kHz (3:1 ratio).
	return resample16SliceToBytes(monoSamples, outBuf), nil
}

// stereoToMono converts interleaved stereo int16 samples to mono by averaging L+R pairs.
func stereoToMono(stereo []int16) []int16 {
	monoLen := len(stereo) / 2
	mono := make([]int16, monoLen)
	for i := 0; i < monoLen; i++ {
		left := int32(stereo[i*2])
		right := int32(stereo[i*2+1])
		mono[i] = int16((left + right) / 2)
	}
	return mono
}

// resample48To16 takes a 48kHz byte slice (16-bit little-endian PCM) and decimates it by a factor of 3
// (retaining 1 out of every 3 samples) to produce a 16kHz byte slice.
func resample48To16(pcm48k []byte, outBuf []byte) []byte {
	samples := len(pcm48k) / 2
	resampledSamples := samples / 3

	resampledLen := resampledSamples * 2
	if cap(outBuf) < resampledLen {
		outBuf = make([]byte, resampledLen)
	} else {
		outBuf = outBuf[:resampledLen]
	}

	for i := 0; i < resampledSamples; i++ {
		srcIdx := (i * 3) * 2
		dstIdx := i * 2
		outBuf[dstIdx] = pcm48k[srcIdx]
		outBuf[dstIdx+1] = pcm48k[srcIdx+1]
	}

	return outBuf
}

// resample16SliceToBytes converts a []int16 PCM slice at 48kHz to 16kHz by decimating 3:1,
// then packs the resulting samples as little-endian bytes.
func resample16SliceToBytes(pcm48k []int16, outBuf []byte) []byte {
	resampledSamples := len(pcm48k) / 3

	resampledLen := resampledSamples * 2
	if cap(outBuf) < resampledLen {
		outBuf = make([]byte, resampledLen)
	} else {
		outBuf = outBuf[:resampledLen]
	}

	for i := 0; i < resampledSamples; i++ {
		val := pcm48k[i*3]
		binary.LittleEndian.PutUint16(outBuf[i*2:], uint16(val))
	}

	return outBuf
}
