package rtp

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestAudit7_InitStreamPipeline(t *testing.T) {
	s := &Sniffer{}

	stream := &RTPStream{
		callID:       "test-call-init",
		lastActivity: time.Now().UnixNano(),
	}

	// Will default to level 0 without actual Redis state
	role := s.initStreamPipeline(stream, "test-call-init", "test-role", false)

	assert.NotNil(t, stream.behavior, "behavior must be initialized for all levels")
	assert.Nil(t, stream.stream, "asr should be nil for level 0")
	assert.Equal(t, "test-role", role, "role should be test-role")
}
