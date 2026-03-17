package rtp

import (
	"context"
	"testing"

	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/sip"
	"github.com/go-redis/redismock/v9"
	"github.com/stretchr/testify/assert"
)

func TestContinuousDecodeFailureDetection(t *testing.T) {
	// Setup Redis Mock
	db, _ := redismock.NewClientMock()
	redis.Client = db
	defer func() { redis.Client = nil }()
	redis.SetContext(context.Background())

	stream := &RTPStream{
		callID: "err-test-01",
		ptMap: map[uint8]sip.PTInfo{
			111: {CodecName: "opus", ClockRateHz: 48000, Channels: 1}, // Test using Opus to avoid G729 CGO issues
		},
	}
	stream.initSRTP()

	stream.mu.Lock()
	stream.opusDec, _ = stream.GetOrCreateOpusDec(1)
	stream.mu.Unlock()
	// Force Opus to fail by providing a 1-byte payload (invalid TOC / length for Opus payload)
	badPayload := []byte{0xFF}

	for i := 0; i < 50; i++ {
		processAudioPayload(stream, "err-test-01", "127.0.0.1", "", nil, nil, nil, badPayload, 111)
	}

	assert.True(t, stream.isDegraded, "Stream should be marked as degraded after 50 consecutive decode errors")
	assert.Equal(t, uint32(50), stream.continuousDecodeErrs, "Continuous decode errors should be 50")

	// Since we can't easily construct a valid Opus payload here without a real encoder,
	// we'll just manually reset it to simulate success and test the recovery logic in processAudioPayload
	stream.mu.Lock()
	stream.continuousDecodeErrs = 1 // Mock a single error state
	stream.isDegraded = true
	stream.mu.Unlock()

	// Test successful fallback route (PCMU) which also doesn't reset continuous errors
	// BUT we want to ensure no panics.
	goodPCMuPayload := make([]byte, 160)
	processAudioPayload(stream, "err-test-01", "127.0.0.1", "", nil, nil, nil, goodPCMuPayload, 0)
}
