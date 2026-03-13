package rtp

import (
	"encoding/binary"
	"fmt"
	"log"

	g729lib "github.com/pidato/audio/g729"
)

// g729DecoderPool reuses decoder instances per-call to avoid allocation overhead.
// G.729 decoder is stateful across frames, so we keep one per call via the RTPStream.
// For simplicity here, we use a package-level single decoder with per-call creation.
// In production, consider storing *g729Decoder in RTPStream for per-call state.

// DecodeG729ToPCM8k decodes a G.729 payload to 8kHz 16-bit PCM.
// Creates a new decoder per call — use DecodeG729ToPCM8kWithDec for per-stream reuse.
func DecodeG729ToPCM8k(g729Payload []byte) ([]byte, error) {
	if len(g729Payload) == 0 {
		return nil, fmt.Errorf("g729: empty payload")
	}

	dec := g729lib.NewDecoder()
	if dec == nil {
		return nil, fmt.Errorf("g729: failed to create decoder")
	}
	defer func() {
		if err := dec.Close(); err != nil {
			log.Printf("g729: error closing decoder: %v", err)
		}
	}()

	return DecodeG729ToPCM8kWithDec(dec, g729Payload)
}

// DecodeG729ToPCM8kWithDec decodes a G.729 payload using a pre-created decoder.
// Reusing the decoder preserves LPC coefficient history across frames,
// improving audio quality and eliminating per-packet CGo alloc/free overhead.
//
// G.729 specifics:
// - PT = 18 (static, no SDP required)
// - Each frame: 10ms, 10 bytes compressed → 80 int16 samples @ 8kHz
// - Output is native 8kHz, compatible with ASR directly (no resampling needed)
// - VAD silence frames (Annex B) are 2 bytes; standard frames are 10 bytes
func DecodeG729ToPCM8kWithDec(dec *g729lib.Decoder, g729Payload []byte) ([]byte, error) {
	if len(g729Payload) == 0 {
		return nil, fmt.Errorf("g729: empty payload")
	}

	const standardFrameSize = 10
	const outputSamplesPerFrame = 80 // 10ms @ 8kHz

	numFrames := len(g729Payload) / standardFrameSize
	if numFrames == 0 {
		numFrames = 1
	}

	totalSamples := numFrames * outputSamplesPerFrame
	pcm16 := make([]int16, totalSamples)

	for i := 0; i < numFrames; i++ {
		start := i * standardFrameSize
		end := start + standardFrameSize

		var framePayload []byte
		if end <= len(g729Payload) {
			framePayload = g729Payload[start:end]
		} else {
			framePayload = make([]byte, standardFrameSize)
			copy(framePayload, g729Payload[start:])
		}

		frameOut := pcm16[i*outputSamplesPerFrame : (i+1)*outputSamplesPerFrame]
		if err := dec.Decode(framePayload, frameOut); err != nil {
			log.Printf("g729: frame %d decode error: %v (continuing)", i, err)
		}
	}

	// Pack []int16 → []byte (little-endian)
	outBytes := make([]byte, totalSamples*2)
	for i, sample := range pcm16 {
		binary.LittleEndian.PutUint16(outBytes[i*2:], uint16(sample))
	}

	return outBytes, nil
}
