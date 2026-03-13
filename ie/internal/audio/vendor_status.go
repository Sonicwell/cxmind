package audio

import (
	"log"
	"time"

	"github.com/cxmind/ingestion-go/internal/redis"
)

// setVendorUnavailable marks an ASR vendor as unavailable in Redis with TTL.
// Called when circuit breaker opens (3 consecutive failures).
// AS can query this key; AU AiVendors page shows status badge.
func setVendorUnavailable(vendor string, cooldown time.Duration) {
	if redis.Client == nil {
		return
	}
	key := "asr:vendor_status:" + vendor
	if err := redis.Client.Set(redis.Ctx(), key, "unavailable", cooldown).Err(); err != nil {
		log.Printf("[ASR] Failed to mark vendor '%s' unavailable in Redis: %v", vendor, err)
	} else {
		log.Printf("[ASR] Marked vendor '%s' as unavailable for %v", vendor, cooldown)
	}
}

// clearVendorUnavailable removes the unavailable mark when circuit breaker closes.
func clearVendorUnavailable(vendor string) {
	if redis.Client == nil {
		return
	}
	key := "asr:vendor_status:" + vendor
	if err := redis.Client.Del(redis.Ctx(), key).Err(); err != nil {
		log.Printf("[ASR] Failed to clear unavailable mark for vendor '%s': %v", vendor, err)
	} else {
		log.Printf("[ASR] Cleared unavailable mark for vendor '%s'", vendor)
	}
}
