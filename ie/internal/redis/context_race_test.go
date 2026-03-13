package redis

import (
	"context"
	"sync"
	"testing"
)

// TestSetContext_Race verifies that concurrent SetContext + Ctx calls
// do not cause data races (must pass with `go test -race`).
func TestSetContext_Race(t *testing.T) {
	var wg sync.WaitGroup

	// 10 concurrent writers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				SetContext(context.WithValue(context.Background(), "key", j))
			}
		}()
	}

	// 10 concurrent readers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				c := Ctx()
				if c == nil {
					t.Error("Ctx() returned nil")
				}
			}
		}()
	}

	wg.Wait()
}
