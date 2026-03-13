package rtp

import (
	"sync"
	"testing"
)

// TestConcurrentAddStreamRef_NoLostRefs verifies that concurrent addStreamRef calls
// for the same callID do not lose any refs (regression test for P0 #1 race condition).
func TestConcurrentAddStreamRef_NoLostRefs(t *testing.T) {
	s := &Sniffer{
		stop: make(chan struct{}),
	}

	const goroutines = 100
	callID := "race-test-call"

	var wg sync.WaitGroup
	wg.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()
			s.addStreamRef(callID, streamRef{
				isVirtual:  idx%2 == 0,
				portKey:    idx,
				virtualKey: "vk-" + string(rune('A'+idx%26)),
			})
		}(i)
	}

	wg.Wait()

	// Verify all refs are present
	val, ok := s.callStreamRefs.Load(callID)
	if !ok {
		t.Fatal("callStreamRefs should have entry for callID")
	}
	refs := val.(*[]streamRef)
	if len(*refs) != goroutines {
		t.Fatalf("Expected %d refs, got %d (refs lost to race condition)", goroutines, len(*refs))
	}
}

// TestAddStreamRef_MultipleCallIDs verifies refs are stored independently per callID.
func TestAddStreamRef_MultipleCallIDs(t *testing.T) {
	s := &Sniffer{
		stop: make(chan struct{}),
	}

	s.addStreamRef("call-A", streamRef{portKey: 1})
	s.addStreamRef("call-A", streamRef{portKey: 2})
	s.addStreamRef("call-B", streamRef{portKey: 3})

	valA, _ := s.callStreamRefs.Load("call-A")
	valB, _ := s.callStreamRefs.Load("call-B")

	refsA := valA.(*[]streamRef)
	refsB := valB.(*[]streamRef)

	if len(*refsA) != 2 {
		t.Fatalf("Expected 2 refs for call-A, got %d", len(*refsA))
	}
	if len(*refsB) != 1 {
		t.Fatalf("Expected 1 ref for call-B, got %d", len(*refsB))
	}
}
