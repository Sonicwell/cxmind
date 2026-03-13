package clickhouse

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/cxmind/ingestion-go/internal/redis"
)

// SeqRange represents a pre-allocated range of sequence numbers
type SeqRange struct {
	current int64
	max     int64
}

// SequenceGenerator manages sequence number generation with batch pre-allocation
type SequenceGenerator struct {
	ranges map[string]*SeqRange
	mu     sync.Mutex
}

var GlobalSequenceGenerator *SequenceGenerator
var once sync.Once

// GetSequenceGenerator returns the singleton instance
func GetSequenceGenerator() *SequenceGenerator {
	once.Do(func() {
		GlobalSequenceGenerator = &SequenceGenerator{
			ranges: make(map[string]*SeqRange),
		}
	})
	return GlobalSequenceGenerator
}

// Next returns the next sequence number for a callID
// Using batch pre-allocation (INCRBY) to reduce Redis load
func (g *SequenceGenerator) Next(ctx context.Context, callID string) (int64, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	seqRange, exists := g.ranges[callID]

	// If range doesn't exist or is exhausted, allocate a new batch
	if !exists || seqRange.current >= seqRange.max {
		batchSize := int64(config.Global.GetInt("sequence.batch_size"))
		if batchSize <= 0 {
			batchSize = 100 // Default batch size
		}

		// Redis 没连上就别调了，走 ClickHouse 降级
		if redis.Client == nil {
			return 0, fmt.Errorf("redis client not initialized")
		}

		// Atomic INCRBY in Redis
		// Returns the NEW value after increment. This is the END of our range.
		redisKey := "call:seq:" + callID
		newMax, err := redis.Client.IncrBy(ctx, redisKey, batchSize).Result()
		if err != nil {
			log.Printf("Failed to allocate sequence batch for %s: %v", callID, err)
			return 0, err
		}

		// Ensure TTL is set (only needed once, but safe to refresh)
		redis.Client.Expire(ctx, redisKey, 24*time.Hour)

		// Calculate start of range
		// If newMax is 100, batchSize 100, range is [1, 100]. Start is 0.
		// If newMax is 200, batchSize 100, range is [101, 200]. Start is 100.
		start := newMax - batchSize

		seqRange = &SeqRange{
			current: start,
			max:     newMax,
		}
		g.ranges[callID] = seqRange

		log.Printf("[SEQUENCE] Allocated batch for %s: [%d, %d]", callID, start+1, newMax)
	}

	// Increment and return
	seqRange.current++
	return seqRange.current, nil
}

// Clear clears the generator state for a call (optional cleanup)
func (g *SequenceGenerator) Clear(callID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.ranges, callID)
}
