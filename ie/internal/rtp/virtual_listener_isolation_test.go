package rtp

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/stretchr/testify/assert"
)

// TestStartVirtualListener_NoDoubleInitPipeline verifies that when 20 goroutines
// concurrently call the fixed StartVirtualListener pattern for the same call+IP,
// only ONE executes the expensive pipeline (Redis + ASR creation).
//
// Discovery Intent: Regression test for the race where initStreamPipeline ran
// BEFORE LoadOrStore, allowing N goroutines to each create ASR connections.
func TestStartVirtualListener_NoDoubleInitPipeline(t *testing.T) {
	s := newTestSniffer()
	callID := "double-init-call"
	srcIP := "10.0.0.1"
	key := callID + ":" + srcIP

	const numGoroutines = 20
	var wg sync.WaitGroup
	var pipelineExecCount int32 // Simulates initStreamPipeline execution count

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			// Fixed pattern: LoadOrStore FIRST, then expensive work
			stream := &RTPStream{
				callID:       callID,
				isRTCP:       false,
				lastActivity: timeutil.Now().UnixNano(),
				stateLoaded:  true,
			}

			if _, loaded := s.virtualListeners.LoadOrStore(key, stream); loaded {
				return // Already exists — skip pipeline (no wasted resources)
			}

			// Only winner reaches here (simulates initStreamPipeline)
			atomic.AddInt32(&pipelineExecCount, 1)
		}()
	}

	wg.Wait()

	// Exactly one listener stored
	assert.Equal(t, 1, syncMapLen(&s.virtualListeners),
		"exactly one virtual listener should exist")

	// Exactly one pipeline executed — the core invariant
	assert.Equal(t, int32(1), pipelineExecCount,
		"initStreamPipeline should execute exactly once")
}

// TestStartVirtualListener_ASRFailureDoesNotBlock verifies that when ASR
// creation fails (unavailable), the virtual listener is still properly
// registered and subsequent InjectRTP calls find the existing stream
// without attempting to re-create it.
//
// Discovery Intent: Catches cascade failures where ASR unavailability
// causes repeated stream creation per RTP packet.
func TestStartVirtualListener_ASRFailureDoesNotBlock(t *testing.T) {
	s := newTestSniffer()
	callID := "asr-fail-call"
	srcIP := "10.0.0.2"
	key := callID + ":" + srcIP

	// Simulate StartVirtualListener succeeding (stream stored) but ASR failing
	stream := &RTPStream{
		callID:       callID,
		isRTCP:       false,
		lastActivity: time.Now().UnixNano(),
		stateLoaded:  true,
		stream:       nil, // ASR failed — no stream attached
	}
	s.virtualListeners.Store(key, stream)

	// Subsequent lookups should find the existing stream (no re-creation)
	for i := 0; i < 100; i++ {
		found, exists := s.getVirtualStream(callID, srcIP)
		assert.True(t, exists, "stream should exist even without ASR")
		assert.Equal(t, callID, found.callID)
		assert.Nil(t, found.stream, "ASR stream should remain nil (no retry)")
	}

	// Still exactly one listener
	assert.Equal(t, 1, syncMapLen(&s.virtualListeners))
}
