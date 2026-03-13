package callsession

import (
	"strconv"
	"testing"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

func BenchmarkSessionManager_ConcurrentUpdates(b *testing.B) {
	m := NewTestManager()
	now := timeutil.Now()

	// Pre-populate 10k sessions to simulate load
	for i := 0; i < 10000; i++ {
		m.UpdateSession("call-"+strconv.Itoa(i), 300, now)
	}

	b.ResetTimer()
	b.ReportAllocs()

	// Continuously update the SAME session from many goroutines to simulate lock contention
	// on a hot SIP call (or just general active calls)
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			m.UpdateSession("call-100", 300, timeutil.Now())
		}
	})
}
