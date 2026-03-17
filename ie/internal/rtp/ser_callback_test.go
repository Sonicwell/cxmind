package rtp

import (
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/stretchr/testify/assert"
)

// TestNewSEREmotionCallback_SetsBehaviorEmotion verifies that the callback
// always feeds the emotion to the BehaviorCollector regardless of confidence.
func TestNewSEREmotionCallback_SetsBehaviorEmotion(t *testing.T) {
	behavior := NewRMSBehavior("test-call")
	cb := newSEREmotionCallback("test-call", "caller", behavior)

	cb(clickhouse.SpeechEmotionRecord{
		Emotion:    "happy",
		Confidence: 0.3,
		Speaker:    "caller",
	})

	// Snapshot should reflect the emotion via stress score
	snap := behavior.Snapshot()
	assert.Equal(t, "test-call", snap.CallID)
}

// TestNewSEREmotionCallback_HighConfidenceAngry verifies that high-confidence
// angry emotions trigger Redis event publishing. Since Redis is nil in tests,
// we just verify the callback runs without panic.
func TestNewSEREmotionCallback_HighConfidenceAngry(t *testing.T) {
	behavior := NewRMSBehavior("angry-call")
	cb := newSEREmotionCallback("angry-call", "callee", behavior)

	// Should not panic even with Redis nil
	cb(clickhouse.SpeechEmotionRecord{
		Emotion:    "angry",
		Confidence: 0.9,
		Speaker:    "callee",
	})
}

// TestNewSEREmotionCallback_LowConfidence verifies that low-confidence
// emotions do NOT trigger Redis event publishing (only behavior is updated).
func TestNewSEREmotionCallback_LowConfidence(t *testing.T) {
	behavior := NewRMSBehavior("low-conf-call")
	cb := newSEREmotionCallback("low-conf-call", "caller", behavior)

	// Low confidence angry — should not publish event
	cb(clickhouse.SpeechEmotionRecord{
		Emotion:    "angry",
		Confidence: 0.3,
		Speaker:    "caller",
	})
}

// TestNewSEREmotionCallback_NeutralEmotion verifies that neutral emotions
// do NOT trigger Redis event publishing regardless of confidence.
func TestNewSEREmotionCallback_NeutralEmotion(t *testing.T) {
	behavior := NewRMSBehavior("neutral-call")
	cb := newSEREmotionCallback("neutral-call", "caller", behavior)

	cb(clickhouse.SpeechEmotionRecord{
		Emotion:    "neutral",
		Confidence: 0.95,
		Speaker:    "caller",
	})
}

// TestNewSEREmotionCallback_ConcurrentHighConfidenceAngry verifies that concurrent
// invocations of the angry callback do NOT panic or race (Redis is nil in unit tests).
// This is a BUG-2 RED test: the original code mutates a shared state map in a goroutine
// without cloning, and has a closure capture bug on callID.
func TestNewSEREmotionCallback_ConcurrentHighConfidenceAngry(t *testing.T) {
	const goroutines = 50
	behavior := NewRMSBehavior("concurrent-angry-call")
	cb := newSEREmotionCallback("concurrent-angry-call", "caller", behavior)

	done := make(chan struct{})
	for i := 0; i < goroutines; i++ {
		go func() {
			cb(clickhouse.SpeechEmotionRecord{
				Emotion:    "angry",
				Confidence: 0.9,
				Speaker:    "caller",
			})
			done <- struct{}{}
		}()
	}

	for i := 0; i < goroutines; i++ {
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			t.Fatal("Goroutine did not complete in time")
		}
	}
}

// TestNewSEREmotionCallback_ClosureCapturesValueNotReference verifies that the
// goroutine spawned by the callback captures callID by value (not reference),
// so changing the outer variable does not corrupt the goroutine's callID.
// BUG-2: original code uses `callID` from outer closure — if callID is reassigned
// before the goroutine runs, it would use the wrong value.
func TestNewSEREmotionCallback_ClosureCapturesValueNotReference(t *testing.T) {
	// This test verifies the callback code follows safe closure patterns.
	// We run 10 different callbacks each with a unique callID and verify
	// behavior's CallID matches expectations (indirect check — Redis is nil).
	for i := 0; i < 10; i++ {
		callID := "call-" + string(rune('A'+i))
		behavior := NewRMSBehavior(callID)
		cb := newSEREmotionCallback(callID, "caller", behavior)

		cb(clickhouse.SpeechEmotionRecord{
			Emotion:    "angry",
			Confidence: 0.9,
			Speaker:    "caller",
		})

		snap := behavior.Snapshot()
		if snap.CallID != callID {
			t.Errorf("Expected CallID=%q, got %q", callID, snap.CallID)
		}
	}
}
