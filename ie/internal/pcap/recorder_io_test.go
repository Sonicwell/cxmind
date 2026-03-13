package pcap

import (
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

// TestGetOrCreateRecorder_MkdirSyscall ensures that MkdirAll is only called once per date directory path
// to avoid massive syscall overhead under 5000 concurrent calls.
func TestGetOrCreateRecorder_MkdirSyscall(t *testing.T) {
	// Setup
	base := "./recordings_test_mkdir"
	baseDir = base
	defer os.RemoveAll(base)

	realm := "test-realm"
	testTime := time.Date(2026, 3, 4, 12, 0, 0, 0, time.UTC)
	dateDir := testTime.Format("2006/01/02")
	expectedPath := filepath.Join(base, realm, dateDir)

	// Clean up internal map cache across tests
	defer func() {
		managers.Range(func(key, value interface{}) bool {
			managers.Delete(key)
			return true
		})
		atomic.StoreInt64(&activeCount, 0)
		DirCache.Clear() // We expect to implement a sync.Map based DirCache
	}()

	// 1. First call should create the directory (simulating the Mkdir operation)
	rec1, err := GetOrCreateRecorder("call-1", realm, testTime)
	if err != nil {
		t.Fatalf("First call failed: %v", err)
	}
	defer rec1.Close()

	if _, err := os.Stat(expectedPath); os.IsNotExist(err) {
		t.Fatalf("Expected directory %s to be created", expectedPath)
	}

	if !DirCache.Has(expectedPath) {
		t.Errorf("Expected DirCache to contain %s, but it was missing", expectedPath)
	}

	// 2. Second call should hit the DirCache and bypass Os.MkdirAll
	rec2, err := GetOrCreateRecorder("call-2", realm, testTime)
	if err != nil {
		t.Fatalf("Second call failed: %v", err)
	}
	defer rec2.Close()
}
