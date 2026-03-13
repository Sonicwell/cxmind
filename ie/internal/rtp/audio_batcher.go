package rtp

import (
	"encoding/base64"
	"log"
	"sync"
	"time"

	"github.com/cxmind/ingestion-go/internal/redis"
)

// AudioBatchSize is the number of RTP packets to batch before publishing.
// 10 packets × 20ms = 200ms latency, reduces Redis Publish from 50K/sec to 5K/sec.
const AudioBatchSize = 10

// pcmFrameSize is the PCM byte size for one G.711 20ms frame (160 samples × 2 bytes).
const pcmFrameSize = 320

// AudioBatcher accumulates PCM frames and publishes them as a batch to Redis.
// One instance per monitored stream. Thread-safe.
type AudioBatcher struct {
	mu          sync.Mutex
	callID      string
	srcIP       string
	buffer      []byte // Pre-allocated batch buffer
	count       int    // Number of frames accumulated
	capacity    int    // Max frames before flush
	batchCh     chan map[string]interface{}
	publishFunc func(callID string, audioData map[string]interface{}) error
	stopCh      chan struct{}
}

// NewAudioBatcher creates a batcher for the given call/stream.
func NewAudioBatcher(callID, srcIP string) *AudioBatcher {
	b := &AudioBatcher{
		callID:      callID,
		srcIP:       srcIP,
		buffer:      make([]byte, 0, AudioBatchSize*pcmFrameSize),
		count:       0,
		capacity:    AudioBatchSize,
		batchCh:     make(chan map[string]interface{}, 50), // Buffer for 50 batches (1 second of audio at 20ms/frame * 10)
		publishFunc: redis.PublishAudio,
		stopCh:      make(chan struct{}),
	}
	// Start background worker
	go b.worker()
	return b
}

func (b *AudioBatcher) worker() {
	for {
		select {
		case <-b.stopCh:
			// Flush remaining
			for {
				select {
				case data := <-b.batchCh:
					b.publishFunc(b.callID, data)
				default:
					return
				}
			}
		case data := <-b.batchCh:
			b.publishFunc(b.callID, data)
		}
	}
}

// Add appends a PCM frame to the batch. If the batch is full, it flushes automatically.
// Returns true if a flush occurred.
func (b *AudioBatcher) Add(pcm []byte) bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.buffer = append(b.buffer, pcm...)
	b.count++

	if b.count >= b.capacity {
		b.flushLocked()
		return true
	}
	return false
}

// Flush publishes any remaining buffered audio. Call this when a stream ends.
func (b *AudioBatcher) Flush() {
	b.mu.Lock()
	b.flushLocked()
	b.mu.Unlock()

	// Also stop the worker
	close(b.stopCh)
}

// flushLocked prepares the batched data and sends it to the worker. Must be called with mu held.
func (b *AudioBatcher) flushLocked() {
	if b.count == 0 {
		return
	}

	audioData := map[string]interface{}{
		"call_id":     b.callID,
		"timestamp":   time.Now().UnixMilli(),
		"pcm_data":    base64.StdEncoding.EncodeToString(b.buffer),
		"sample_rate": 8000,
		"channels":    1,
		"bit_depth":   16,
		"src_ip":      b.srcIP,
		"frames":      b.count,
	}

	// Non-blocking send: drop if channel is full (backpressure)
	select {
	case b.batchCh <- audioData:
	default:
		log.Printf("[AudioBatcher] Channel full, dropping %d frames for call %s", b.count, b.callID)
	}

	// Reset buffer (reuse underlying array)
	b.buffer = b.buffer[:0]
	b.count = 0
}

// Count returns the number of buffered frames (for testing).
func (b *AudioBatcher) Count() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.count
}
