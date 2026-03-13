package hep

import (
	"fmt"
	"sync"
	"testing"
)

// TestShouldRejectAuth_Race tests that concurrent access to the authentication token
// does not trigger a data race when configuration dynamically reloads.
func TestShouldRejectAuth_Race(t *testing.T) {
	// Initialize token
	initToken := "initial-token"
	cachedAuthToken.Store(&initToken)

	var wg sync.WaitGroup
	// 5 readers (simulating high PPS handlePacket callers)
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				dummyPacket := &HEPPacket{AuthToken: "good-token"}
				_ = shouldRejectAuth(dummyPacket)
			}
		}()
	}

	// 1 writer (simulating Viper config reload)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for j := 0; j < 1000; j++ {
			// Using atomic.Pointer Store
			newToken := fmt.Sprintf("reloaded-token-%d", j)
			cachedAuthToken.Store(&newToken)
		}
	}()

	wg.Wait()
}
