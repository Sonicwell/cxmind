package redis

import (
	"encoding/json"
	"log"
	"sync"
)

// EventPublisher asynchronously publishes CallEvents to Redis via a buffered channel.
// This replaces synchronous per-packet redis.Publish calls to reduce RTT overhead.
// At 5000 concurrent calls × ~5 SIP messages each = 25K PUBLISH/sec synchronous
// → replaced with channel drain + concurrent publish.
type EventPublisher struct {
	ch      chan *CallEvent
	wg      sync.WaitGroup
	mu      sync.RWMutex // Protects stopped flag + channel send atomicity
	stopped bool
}

// GlobalEventPublisher is the singleton async event publisher.
var GlobalEventPublisher *EventPublisher

// NewEventPublisher creates an async publisher with the given buffer size and worker count.
func NewEventPublisher(bufferSize, workers int) *EventPublisher {
	ep := &EventPublisher{
		ch: make(chan *CallEvent, bufferSize),
	}
	for i := 0; i < workers; i++ {
		ep.wg.Add(1)
		go ep.worker(i)
	}
	return ep
}

// InitEventPublisher initializes the global async event publisher.
func InitEventPublisher(bufferSize, workers int) {
	GlobalEventPublisher = NewEventPublisher(bufferSize, workers)
	log.Printf("Redis EventPublisher initialized (buffer=%d, workers=%d)", bufferSize, workers)
}

// Publish enqueues a call event for async publishing. Non-blocking; drops if buffer is full.
// Uses RLock to allow concurrent Publish calls while preventing race with Stop().
func (ep *EventPublisher) Publish(event *CallEvent) {
	ep.mu.RLock()
	defer ep.mu.RUnlock()
	if ep.stopped {
		return // Fast path: already stopped
	}
	select {
	case ep.ch <- event:
		// Enqueued
	default:
		log.Printf("[WARN] EventPublisher buffer full, dropping event for call %s", event.CallID)
	}
}

// worker drains events from the channel and publishes to Redis.
// Uses `for range` to guarantee zero-loss drain when channel is closed.
func (ep *EventPublisher) worker(id int) {
	defer ep.wg.Done()
	for event := range ep.ch {
		if Client == nil {
			continue
		}
		data, err := json.Marshal(event)
		if err != nil {
			log.Printf("[EventPublisher-%d] Marshal error: %v", id, err)
			continue
		}
		channel := "call:event:" + event.CallID
		if err := Client.Publish(Ctx(), channel, data).Err(); err != nil {
			log.Printf("[EventPublisher-%d] Publish error for call %s: %v", id, event.CallID, err)
		}
	}
}

// Stop signals all workers to drain and exit, then waits for completion.
// Takes write lock to ensure no Publish call is mid-flight when channel is closed.
func (ep *EventPublisher) Stop() {
	ep.mu.Lock()
	ep.stopped = true
	close(ep.ch) // Safe: no Publish can be sending — we hold exclusive lock
	ep.mu.Unlock()
	ep.wg.Wait() // Wait for all workers to finish draining
	log.Printf("EventPublisher stopped (drained)")
}
