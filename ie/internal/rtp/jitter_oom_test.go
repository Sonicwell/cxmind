package rtp

import (
	"encoding/binary"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestJitterBuffer_OOMPrevention(t *testing.T) {
	jb := NewJitterBuffer(3) // Depth = 3
	assert.NotNil(t, jb)

	packet := make([]byte, 12) // Minimum RTP header

	// Fill output channel fully, wait a bit so we know it's full
	for i := uint16(0); i < 6; i++ {
		binary.BigEndian.PutUint16(packet[2:4], i)
		jb.Push(packet, 0, 0)
	}

	time.Sleep(50 * time.Millisecond) // Let drainLoop do some work

	// Now push heavily. Since Output is full, it should drop them.
	// We want to make sure we don't leak memory (e.g. underlying arrays growing).
	var maxCap int
	for i := uint16(6); i < 10006; i++ {
		binary.BigEndian.PutUint16(packet[2:4], i)
		jb.Push(packet, 0, 0)

		jb.mu.Lock()
		if cap(jb.packets) > maxCap {
			maxCap = cap(jb.packets)
		}
		jb.mu.Unlock()
	}

	jb.mu.Lock()
	packetLen := len(jb.packets)
	jb.mu.Unlock()

	// Length should be bounded strictly
	assert.LessOrEqual(t, packetLen, jb.depth*2, "Jitter buffer slice grew unbounded!")

	// Capacity MUST NOT grow monotonically into thousands!
	// Without the memory leak fix, `append` forces capacity doubling eventually up to thousands
	// before being sliced. But slicing `[:jb.depth]` doesn't reduce underlying capacity!
	// It just keeps a large array around.
	assert.LessOrEqual(t, maxCap, 50, "Jitter buffer capacity leaked and grew too large!")

	jb.Stop()
}
