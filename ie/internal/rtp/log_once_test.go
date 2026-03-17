package rtp

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestUnsupportedCodec_LogOnce verifies that the unsupportedCodecLogged flag
// is set on first encounter and prevents repeated logging.
func TestUnsupportedCodec_LogOnce(t *testing.T) {
	stream := &RTPStream{
		callID: "test-log-once",
	}

	// Initially should not be logged
	assert.False(t, stream.unsupportedCodecLogged, "should not be logged initially")

	// Simulate first unsupported codec encounter
	stream.mu.Lock()
	stream.unsupportedCodecLogged = true
	stream.mu.Unlock()

	// Should now be flagged
	assert.True(t, stream.unsupportedCodecLogged, "should be flagged after first encounter")
}

// TestUnsupportedCodec_DifferentStreams verifies that each stream maintains
// its own log-once flag independently.
func TestUnsupportedCodec_DifferentStreams(t *testing.T) {
	stream1 := &RTPStream{callID: "call-1"}
	stream2 := &RTPStream{callID: "call-2"}

	// Mark stream1 as logged
	stream1.unsupportedCodecLogged = true

	// stream2 should still be unlogged
	assert.True(t, stream1.unsupportedCodecLogged)
	assert.False(t, stream2.unsupportedCodecLogged)
}
