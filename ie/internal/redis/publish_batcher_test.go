package redis

import (
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-redis/redismock/v9"
)

// TestEventPublisher_BasicPublish verifies events are consumed by workers.
func TestEventPublisher_BasicPublish(t *testing.T) {
	db, mock := redismock.NewClientMock()
	oldClient := Client
	Client = db
	defer func() { Client = oldClient }()

	ep := NewEventPublisher(100, 2)

	// Publish 10 events
	for i := 0; i < 10; i++ {
		mock.ExpectPublish("call:event:test-call", []byte{}).SetVal(1)
		mock.CustomMatch(func(expected, actual []interface{}) error { return nil })
	}

	for i := 0; i < 10; i++ {
		ep.Publish(&CallEvent{
			EventType: "call_create",
			CallID:    "test-call",
		})
	}

	// Allow workers to process
	time.Sleep(50 * time.Millisecond)

	// Stop and drain
	ep.Stop()

	// Verify channel is drained
	if len(ep.ch) != 0 {
		t.Errorf("Expected channel to be drained, got %d remaining", len(ep.ch))
	}
}

// TestEventPublisher_Backpressure verifies buffer-full drops.
func TestEventPublisher_Backpressure(t *testing.T) {
	// Tiny buffer, no workers — directly test the channel behavior
	ep := NewEventPublisher(2, 0)

	// Fill buffer
	ep.Publish(&CallEvent{CallID: "a"})
	ep.Publish(&CallEvent{CallID: "b"})

	// This should be dropped (buffer full)
	ep.Publish(&CallEvent{CallID: "c"})

	if len(ep.ch) != 2 {
		t.Errorf("Expected buffer size 2 (full), got %d", len(ep.ch))
	}
}

// TestEventPublisher_StopDrains verifies graceful drain on stop.
func TestEventPublisher_StopDrains(t *testing.T) {
	ep := NewEventPublisher(100, 1)

	var processed atomic.Int64

	// Override: we can't mock Redis, but we can verify stop completes
	for i := 0; i < 5; i++ {
		ep.Publish(&CallEvent{CallID: "drain-test"})
		processed.Add(1)
	}

	// Stop should complete without hanging
	done := make(chan struct{})
	go func() {
		ep.Stop()
		close(done)
	}()

	select {
	case <-done:
		// Good — stop completed
	case <-time.After(2 * time.Second):
		t.Fatal("EventPublisher.Stop() timed out — possible deadlock")
	}
}

// TestEventPublisher_ConcurrentPublish verifies thread-safety under load.
func TestEventPublisher_ConcurrentPublish(t *testing.T) {
	ep := NewEventPublisher(1000, 4)

	done := make(chan struct{})
	for i := 0; i < 100; i++ {
		go func(id int) {
			for j := 0; j < 10; j++ {
				ep.Publish(&CallEvent{
					EventType: "call_create",
					CallID:    "concurrent-test",
				})
			}
		}(i)
	}

	// Let workers process
	time.Sleep(100 * time.Millisecond)

	go func() {
		ep.Stop()
		close(done)
	}()

	select {
	case <-done:
		// Good
	case <-time.After(3 * time.Second):
		t.Fatal("Stop timed out with concurrent publishers")
	}
}

// TestEventPublisher_StopClosesChannel verifies that Stop() closes the event channel
// to prevent any goroutine from hanging on <-ep.ch after shutdown.
// RED: Current implementation only closes stopCh but leaves ch open — a goroutine
// doing `ep.ch <- event` after Stop returns would block forever (goroutine leak).
func TestEventPublisher_StopClosesChannel(t *testing.T) {
	ep := NewEventPublisher(100, 2)
	ep.Stop()

	// After Stop, sending to channel should panic (closed channel)
	// — which proves the channel is properly closed.
	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("Expected panic on send to closed channel after Stop(), but got none — channel is still open (goroutine leak risk)")
		}
	}()
	ep.ch <- &CallEvent{CallID: "should-panic"}
}

// TestEventPublisher_StopDrainsAll verifies zero-loss drain guarantee.
// Uses the new close(ch) architecture — for range guarantees all events processed.
func TestEventPublisher_StopDrainsAll(t *testing.T) {
	var processed atomic.Int64

	ep := NewEventPublisher(200, 0) // No default workers

	// Custom worker that counts processed events
	ep.wg.Add(1)
	go func() {
		defer ep.wg.Done()
		for range ep.ch {
			processed.Add(1)
		}
	}()

	// Enqueue 100 events
	const totalEvents = 100
	for i := 0; i < totalEvents; i++ {
		ep.Publish(&CallEvent{CallID: "drain-all-test"})
	}

	// Stop immediately — worker must drain ALL 100
	ep.Stop()

	got := processed.Load()
	if got != totalEvents {
		t.Errorf("Expected all %d events to be drained, but only %d were processed (lost %d)", totalEvents, got, totalEvents-got)
	}
}
