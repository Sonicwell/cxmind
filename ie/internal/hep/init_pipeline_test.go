package hep

import (
	"sync/atomic"
	"testing"

	"github.com/cxmind/ingestion-go/internal/clickhouse"
)

// TestInitSharedPipeline_ConcurrentCallsSafe verifies no data race when called
// from multiple goroutines simultaneously (smoke test for sync.Once protection).
// Run with: go test -race ./internal/hep/... -run TestInitSharedPipeline
func TestInitSharedPipeline_ConcurrentCallsSafe(t *testing.T) {
	var completed int32
	done := make(chan struct{}, 10)

	for i := 0; i < 10; i++ {
		go func() {
			// InitSharedPipeline is idempotent via sync.Once — safe to call concurrently.
			// The first invocation initialises; subsequent ones are no-ops.
			InitSharedPipeline()
			atomic.AddInt32(&completed, 1)
			done <- struct{}{}
		}()
	}

	for i := 0; i < 10; i++ {
		<-done
	}

	if n := atomic.LoadInt32(&completed); n != 10 {
		t.Errorf("expected 10 goroutines to complete, got %d", n)
	}
}

// TestInitSharedPipeline_LocalCacheStable verifies that calling InitSharedPipeline
// twice returns the same localCache instance (not re-created on second call).
func TestInitSharedPipeline_LocalCacheStable(t *testing.T) {
	InitSharedPipeline()
	first := localCache

	InitSharedPipeline() // second call should be a no-op
	second := localCache

	if first != second {
		t.Error("localCache changed after second InitSharedPipeline call — not idempotent")
	}
}

// N5 fix: InitSharedPipeline must initialize ALL batch writers needed by
// shared SIP pipeline, including RTCPBatchWriter (previously only in StartHEPServer).
func TestInitSharedPipeline_InitializesRTCPWriter(t *testing.T) {
	InitSharedPipeline()

	if clickhouse.GlobalCallEventWriter == nil {
		t.Error("GlobalCallEventWriter is nil after InitSharedPipeline")
	}
	if clickhouse.GlobalSipMessageWriter == nil {
		t.Error("GlobalSipMessageWriter is nil after InitSharedPipeline")
	}
	if clickhouse.GlobalRTCPWriter == nil {
		t.Error("GlobalRTCPWriter is nil after InitSharedPipeline — N5 bug")
	}
}
