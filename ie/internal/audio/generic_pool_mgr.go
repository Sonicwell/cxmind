package audio

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"fmt"
	"log"
	"sync"
)

var (
	vendorPools   = make(map[string]*GenericPool)
	vendorPoolsMu sync.RWMutex
)

// GetOrCreatePool returns a cached GenericPool for the given vendor, or creates a new one
func GetOrCreatePool(vendor string, protocol StreamProtocol) *GenericPool {
	vendorPoolsMu.RLock()
	pool, exists := vendorPools[vendor]
	vendorPoolsMu.RUnlock()

	if exists {
		return pool
	}

	vendorPoolsMu.Lock()
	defer vendorPoolsMu.Unlock()

	// Double-check under write lock
	pool, exists = vendorPools[vendor]
	if exists {
		return pool
	}

	minSize := config.Global.GetInt(fmt.Sprintf("asr.%s.min_pool_size", vendor))
	if minSize <= 0 {
		minSize = 20
	}
	maxSize := config.Global.GetInt(fmt.Sprintf("asr.%s.max_pool_size", vendor))
	if maxSize <= 0 {
		maxSize = 1000
	}

	pool = NewGenericPool(vendor, protocol, minSize, maxSize)
	go pool.startCleanupWorker()

	vendorPools[vendor] = pool
	return pool
}

// ReplaceVendorPool atomically replaces the connection pool for a specific vendor
// Old pool enters draining mode: no new tasks, existing tasks complete normally.
func ReplaceVendorPool(vendor string, protocol StreamProtocol, minPoolSize int) {
	vendorPoolsMu.Lock()
	oldPool := vendorPools[vendor]

	maxSize := config.Global.GetInt(fmt.Sprintf("asr.%s.max_pool_size", vendor))
	if maxSize <= 0 {
		maxSize = 1000
	}

	log.Printf("[GenericPoolManager] Replacing pool for vendor '%s'", vendor)

	newPool := NewGenericPool(vendor, protocol, minPoolSize, maxSize)
	go newPool.startCleanupWorker()

	vendorPools[vendor] = newPool
	vendorPoolsMu.Unlock()

	if oldPool != nil {
		go oldPool.drainAndClose()
	}
}

// GetVendorPoolStats returns stats for a specific vendor pool
func GetVendorPoolStats(vendor string) *PoolStats {
	vendorPoolsMu.RLock()
	pool, exists := vendorPools[vendor]
	vendorPoolsMu.RUnlock()

	if !exists {
		return nil
	}

	s := pool.Stats()
	return &s
}
