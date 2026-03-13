package simulator

import (
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
)

// linearToUlaw converts a 16-bit linear PCM sample to 8-bit G.711 μ-law.
func linearToUlaw(pcm int16) byte {
	var sign int
	if pcm < 0 {
		sign = 0x80
		pcm = -pcm
	}
	if pcm > 32635 {
		pcm = 32635
	}
	pcm += 0x84
	exponent := 7
	mask := 0x4000
	for ; (int(pcm)&mask) == 0 && exponent > 0; exponent, mask = exponent-1, mask>>1 {
	}
	mantissa := (pcm >> (exponent + 3)) & 0x0f
	ulaw := byte(sign | (exponent << 4) | int(mantissa))
	return ^ulaw
}

// LoadAudio transcodes an input audio file (mp3, wav, etc.) using ffmpeg into
// 8kHz mono 16-bit PCM, and then encodes it to G.711 μ-law bytes in memory.
// We skip the first 1 second to avoid silence usually found at the beginning.
func LoadAudio(filePath string) ([]byte, error) {
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil, fmt.Errorf("audio file not found: %s", filePath)
	}

	cmd := exec.Command("ffmpeg", "-ss", "1", "-i", filePath, "-ar", "8000", "-ac", "1", "-f", "s16le", "pipe:1")
	cmd.Stderr = nil // ignore ffmpeg stderr

	pcmData, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("ffmpeg failed: %w (make sure ffmpeg is installed)", err)
	}

	if len(pcmData) == 0 {
		return nil, fmt.Errorf("ffmpeg converted 0 bytes for %s", filePath)
	}

	ulawBuf := make([]byte, len(pcmData)/2)
	for i := 0; i < len(pcmData)/2; i++ {
		sample := int16(binary.LittleEndian.Uint16(pcmData[i*2:]))
		ulawBuf[i] = linearToUlaw(sample)
	}

	return ulawBuf, nil
}
