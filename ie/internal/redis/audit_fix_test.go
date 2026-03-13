package redis

import (
	"sync"
	"testing"
	"time"
)

// === FN-1: EventPublisher.Stop() then Publish() should not panic ===

func TestEventPublisher_StopThenPublish(t *testing.T) {
	ep := NewEventPublisher(100, 2)

	// Publish some events
	for i := 0; i < 5; i++ {
		ep.Publish(&CallEvent{
			EventType: "call_create",
			CallID:    "test-call-1",
		})
	}

	// Stop the publisher
	ep.Stop()

	// Publishing after Stop should NOT panic
	// It should just drop the event (buffer may be full or workers stopped)
	ep.Publish(&CallEvent{
		EventType: "call_create",
		CallID:    "test-call-after-stop",
	})
	// If we got here without panic, the test passes
}

// TestEventPublisher_ConcurrentStopPublish tests that concurrent Stop and
// Publish calls don't cause panics or data races.
func TestEventPublisher_ConcurrentStopPublish(t *testing.T) {
	ep := NewEventPublisher(100, 4)

	var wg sync.WaitGroup

	// Concurrent publishers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				ep.Publish(&CallEvent{
					EventType: "call_create",
					CallID:    "concurrent-test",
				})
				time.Sleep(time.Millisecond)
			}
		}()
	}

	// Stop after brief delay
	time.Sleep(5 * time.Millisecond)
	ep.Stop()

	wg.Wait()
	// If we got here without panic or race, the test passes
}
