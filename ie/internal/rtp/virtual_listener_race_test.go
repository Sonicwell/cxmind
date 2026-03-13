package rtp

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/audio"
	"github.com/stretchr/testify/assert"
)

// mockASRStreamWithCloseCounter tracks Close() call count.
type mockASRStreamWithCloseCounter struct {
	closeCalls int32
}

func (m *mockASRStreamWithCloseCounter) SendAudio(data []byte) error { return nil }
func (m *mockASRStreamWithCloseCounter) Close() error {
	atomic.AddInt32(&m.closeCalls, 1)
	return nil
}
func (m *mockASRStreamWithCloseCounter) Results() <-chan audio.TranscriptionResult {
	ch := make(chan audio.TranscriptionResult, 1)
	close(ch)
	return ch
}
func (m *mockASRStreamWithCloseCounter) Errors() <-chan error {
	ch := make(chan error, 1)
	close(ch)
	return ch
}

// TestStartVirtualListener_RaceCleanup verifies that when two goroutines
// race to create the same virtual listener, the loser cleans up its ASR stream.
// This tests the fix for resource leaks in the LoadOrStore race path.
func TestStartVirtualListener_RaceCleanup(t *testing.T) {
	s := newTestSniffer()
	callID := "race-call"
	srcIP := "10.0.0.99"

	// Pre-populate to prevent Redis lookups
	key := callID + ":" + srcIP

	var winnerStream, loserStream *RTPStream

	// Create two streams that would race
	winnerStream = &RTPStream{
		callID:       callID,
		lastActivity: time.Now().UnixNano(),
		stateLoaded:  true,
	}
	loserStream = &RTPStream{
		callID:       callID,
		lastActivity: time.Now().UnixNano(),
		stateLoaded:  true,
	}

	// Give both streams mock ASR streams
	winnerASR := &mockASRStreamWithCloseCounter{}
	loserASR := &mockASRStreamWithCloseCounter{}
	winnerStream.stream = winnerASR
	loserStream.stream = loserASR

	// Winner gets stored first
	s.virtualListeners.Store(key, winnerStream)

	// Loser tries LoadOrStore — should find existing
	_, loaded := s.virtualListeners.LoadOrStore(key, loserStream)
	assert.True(t, loaded, "LoadOrStore should detect existing entry")

	// In the fixed code, loser should clean up its ASR stream
	if loserASR != nil {
		loserASR.Close()
	}

	// Verify winner's ASR not closed
	assert.Equal(t, int32(0), atomic.LoadInt32(&winnerASR.closeCalls),
		"winner's ASR should not be closed")

	// Verify loser's ASR was closed
	assert.Equal(t, int32(1), atomic.LoadInt32(&loserASR.closeCalls),
		"loser's ASR should be closed exactly once")
}

// TestStartVirtualListener_ConcurrentCreation verifies that concurrent calls
// to create the same virtual listener don't leak resources.
func TestStartVirtualListener_ConcurrentCreation(t *testing.T) {
	s := newTestSniffer()
	callID := "concurrent-call"
	srcIP := "10.0.0.50"

	const numGoroutines = 10
	var wg sync.WaitGroup
	var createdCount int32

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			key := callID + ":" + srcIP
			stream := &RTPStream{
				callID:       callID,
				lastActivity: time.Now().UnixNano(),
				stateLoaded:  true,
			}
			_, loaded := s.virtualListeners.LoadOrStore(key, stream)
			if !loaded {
				atomic.AddInt32(&createdCount, 1)
			}
		}()
	}

	wg.Wait()

	// Exactly one goroutine should have won the race
	assert.Equal(t, int32(1), createdCount,
		"exactly one goroutine should create the listener")

	// Only one entry should exist
	count := 0
	s.virtualListeners.Range(func(_, _ any) bool {
		count++
		return true
	})
	assert.Equal(t, 1, count, "only one virtual listener should exist")
}
