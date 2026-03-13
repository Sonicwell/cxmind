package hep

import (
	"sync"
	"testing"
)

func TestAudit7_LocalIPRace(t *testing.T) {
	// Concurrent Init and Read
	var wg sync.WaitGroup

	// Start 10 goroutines continuously calling isLocalIP
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				_, _ = isLocalIP("127.0.0.1")
			}
		}(i)
	}

	// While reads are happening, trigger an Init
	InitLocalIPCache()

	wg.Wait()
}
