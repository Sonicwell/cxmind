package rtp

import (
	"fmt"
	"math/rand"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// BenchmarkRTP_LockContention simulates the contention between high-frequency ingestRTP
// and periodic collectExpiredStreams (DA1).
func BenchmarkRTP_LockContention(b *testing.B) {
	// Setup Sniffer with 5000 streams
	s := &Sniffer{}
	numStreams := 5000

	// Pre-populate streams
	for i := 0; i < numStreams; i++ {
		stream := &RTPStream{
			callID:       fmt.Sprintf("call-%d", i),
			lastActivity: timeutil.Now().UnixNano(),
			packetStats:  PacketStats{SeqInitialized: true},
		}
		s.listeners.Store(i, stream)
	}

	// Channel to signal stop to background maintenance
	stopCh := make(chan struct{})
	defer close(stopCh)

	// Simulate periodic collectExpiredStreams (The "Reader" holding locks)
	// In real life this runs every 5s. To accelerate contention for benchmark,
	// we run it tight loop or frequently.
	go func() {
		for {
			select {
			case <-stopCh:
				return
			default:
				// Simulate the maintenance loop scanning all streams
				// We call the actual method if possible, or simulate logic roughly
				// Since collectExpiredStreams is private, we can't call it directly if test is in rtp_test package?
				// Wait, "package rtp" allows access to private members.
				s.collectExpiredStreams(timeutil.Now(), 10*time.Second)

				// Yield slightly to let writer run, but keep pressure high
				// time.Sleep(1 * time.Millisecond) // REMOVED SLEEP
			}
		}
	}()

	b.ResetTimer()

	// Simulate captureLoop (The "Writer" needing locks)
	// We run b.N iterations of "packet ingress"
	b.RunParallel(func(pb *testing.PB) {
		payload := make([]byte, 172) // Dummy G.711 packet
		// Randomly pick a stream to update
		rng := rand.New(rand.NewSource(timeutil.Now().UnixNano()))

		for pb.Next() {
			port := rng.Intn(numStreams)
			if val, ok := s.listeners.Load(port); ok {
				stream := val.(*RTPStream)

				// Critical Section Simulation (similar to ingestRTP Phase 1)
				stream.mu.Lock()
				atomic.StoreInt64(&stream.lastActivity, timeutil.Now().UnixNano())
				stream.hasReceivedPackets = true
				UpdatePacketStats(&stream.packetStats, payload, 8000)
				stream.mu.Unlock()
			}
		}
	})
}
