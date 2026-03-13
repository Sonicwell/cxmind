package siprec

import (
	"sync"
	"testing"
)

// TestGetPorts_Race verifies that concurrent GetPorts and UpdatePorts
// do not cause data races (must pass with `go test -race`).
func TestGetPorts_Race(t *testing.T) {
	st := NewSessionTracker()
	st.Store("call-race", []int{30000, 30002}, "tag-1")

	var wg sync.WaitGroup

	// 10 concurrent readers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				ports := st.GetPorts("call-race")
				if ports == nil {
					t.Error("GetPorts returned nil")
				}
			}
		}()
	}

	// 10 concurrent writers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				st.UpdatePorts("call-race", []int{30000 + id*2, 30002 + id*2})
			}
		}(i)
	}

	wg.Wait()
}

// TestGetPorts_ReturnsCopy verifies that the returned slice is a copy,
// so callers cannot corrupt the session's internal state.
func TestGetPorts_ReturnsCopy(t *testing.T) {
	st := NewSessionTracker()
	st.Store("call-copy", []int{30000, 30002}, "tag-1")

	ports := st.GetPorts("call-copy")
	// Mutate the returned slice
	ports[0] = 99999

	// Original should be unchanged
	original := st.GetPorts("call-copy")
	if original[0] == 99999 {
		t.Error("GetPorts returned a reference, not a copy — mutation leaked to session")
	}
}
