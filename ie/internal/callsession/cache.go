package callsession

import (
	"sync"
	"time"
)

// TimestampItem holds the data needed for Redis update
type TimestampItem struct {
	Timestamp      time.Time
	SessionExpires int
}

// TimestampCache buffers timestamp updates to reduce Redis load
type TimestampCache struct {
	items map[string]*TimestampItem
	mu    sync.Mutex
}

// NewTimestampCache creates a new cache instance
func NewTimestampCache() *TimestampCache {
	return &TimestampCache{
		items: make(map[string]*TimestampItem),
	}
}

// Add updates or adds a timestamp for a callID
func (c *TimestampCache) Add(callID string, ts time.Time, sessionExpires int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[callID] = &TimestampItem{
		Timestamp:      ts,
		SessionExpires: sessionExpires,
	}
}

// Remove deletes a callID from the cache (e.g., on call end)
func (c *TimestampCache) Remove(callID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.items, callID)
}

// Flush returns all items and clears the cache
func (c *TimestampCache) Flush() map[string]*TimestampItem {
	c.mu.Lock()
	defer c.mu.Unlock()

	batch := c.items
	c.items = make(map[string]*TimestampItem)
	return batch
}
