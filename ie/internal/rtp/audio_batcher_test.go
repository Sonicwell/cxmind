package rtp

import (
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestAudioBatcher_Backpressure(t *testing.T) {
	// Enable mock publisher
	var publishedCount int32

	batcher := NewAudioBatcher("test-call", "127.0.0.1")

	// Inject a slow publisher to simulate Redis latency
	batcher.publishFunc = func(callID string, audioData map[string]interface{}) error {
		time.Sleep(50 * time.Millisecond) // Simulate slow I/O
		atomic.AddInt32(&publishedCount, 1)
		return nil
	}

	// Start sending packets fast
	start := time.Now()
	for i := 0; i < 1000; i++ {
		// Each Add sends 1 PCM frame. AudioBatchSize=10 means 1 publish per 10 Add() calls
		batcher.Add(make([]byte, 320))
	}
	duration := time.Since(start)

	// In the synchronous (broken) implementation, 100 publishes * 50ms = 5000ms.
	// In the async (fixed) implementation, Add() should return almost instantly and drop packets.
	assert.Less(t, duration, 200*time.Millisecond, "Add() should be non-blocking")

	// The background worker should have only published a few batches due to backpressure drops
	batcher.Flush()

	count := atomic.LoadInt32(&publishedCount)
	t.Logf("Published %d batches", count)
	assert.Less(t, count, int32(100), "Should have dropped batches due to backpressure")
}
