package pcap

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// TestGetOrCreateRecorder_ConcurrentGet verifies that concurrent GetOrCreateRecorder
// for the same callID returns the same recorder without panics or races.
func TestGetOrCreateRecorder_ConcurrentGet(t *testing.T) {
	tmpDir := t.TempDir()
	Init(tmpDir)

	// Reset state
	managers = sync.Map{}
	atomic.StoreInt64(&activeCount, 0)

	const callID = "concurrent-test-call"
	const goroutines = 50
	results := make(chan *Recorder, goroutines)
	var wg sync.WaitGroup

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rec, err := GetOrCreateRecorder(callID, "test.com", timeutil.Now())
			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			results <- rec
		}()
	}

	wg.Wait()
	close(results)

	// All goroutines should get the same recorder
	var first *Recorder
	for rec := range results {
		if first == nil {
			first = rec
		} else if rec != first {
			t.Fatalf("got different recorders for same callID (race detected)")
		}
	}

	if ActiveCount() != 1 {
		t.Fatalf("expected 1 active recorder, got %d", ActiveCount())
	}

	// Cleanup
	CloseRecorder(callID)
}

// TestMaxRecorders verifies that the recorder limit is enforced.
func TestMaxRecorders(t *testing.T) {
	tmpDir := t.TempDir()
	Init(tmpDir)

	// Reset state
	managers = sync.Map{}
	atomic.StoreInt64(&activeCount, 0)

	// Simulate having MaxRecorders active by setting atomic counter
	atomic.StoreInt64(&activeCount, MaxRecorders)

	_, err := GetOrCreateRecorder("overflow-call", "test.com", timeutil.Now())
	if err == nil {
		t.Fatal("expected error when MaxRecorders reached, got nil")
	}

	// Reset
	atomic.StoreInt64(&activeCount, 0)
}

// TestCloseRecorder verifies cleanup of resources.
func TestCloseRecorder(t *testing.T) {
	tmpDir := t.TempDir()
	Init(tmpDir)

	managers = sync.Map{}
	atomic.StoreInt64(&activeCount, 0)

	callID := "close-test"
	rec, err := GetOrCreateRecorder(callID, "test.com", timeutil.Now())
	if err != nil || rec == nil {
		t.Fatalf("failed to create recorder: %v", err)
	}

	if ActiveCount() != 1 {
		t.Fatalf("expected 1 active, got %d", ActiveCount())
	}

	CloseRecorder(callID)

	if ActiveCount() != 0 {
		t.Fatalf("expected 0 active after close, got %d", ActiveCount())
	}

	if GetRecorder(callID) != nil {
		t.Fatal("expected nil after CloseRecorder")
	}
}

// TestGetRecorder_NotFound verifies nil on missing callID.
func TestGetRecorder_NotFound(t *testing.T) {
	managers = sync.Map{}
	if GetRecorder("nonexistent") != nil {
		t.Fatal("expected nil for nonexistent callID")
	}
}

// TestGetRecorderPath verifies path retrieval.
func TestGetRecorderPath(t *testing.T) {
	tmpDir := t.TempDir()
	Init(tmpDir)

	managers = sync.Map{}
	atomic.StoreInt64(&activeCount, 0)

	callID := "path-test"
	rec, err := GetOrCreateRecorder(callID, "example.com", timeutil.Now())
	if err != nil || rec == nil {
		t.Fatalf("failed to create recorder: %v", err)
	}

	path := GetRecorderPath(callID)
	if path == "" {
		t.Fatal("expected non-empty path")
	}

	// Cleanup
	CloseRecorder(callID)
	os.Remove(path)
}

// TestCloseAll verifies all recorders are closed.
func TestCloseAll(t *testing.T) {
	tmpDir := t.TempDir()
	Init(tmpDir)

	managers = sync.Map{}
	atomic.StoreInt64(&activeCount, 0)

	for i := 0; i < 5; i++ {
		_, err := GetOrCreateRecorder(fmt.Sprintf("close-all-%d", i), "test.com", timeutil.Now())
		if err != nil {
			t.Fatalf("failed to create recorder %d: %v", i, err)
		}
	}

	if ActiveCount() != 5 {
		t.Fatalf("expected 5 active, got %d", ActiveCount())
	}

	CloseAll()

	if ActiveCount() != 0 {
		t.Fatalf("expected 0 after CloseAll, got %d", ActiveCount())
	}
}

// TestGetOrCreateRecorder_PathTraversal verifies that a malicious callID
// containing "../" is sanitized and the PCAP file stays within baseDir.
// Security fix: filepath.Base() strips all directory components.
func TestGetOrCreateRecorder_PathTraversal(t *testing.T) {
	tmpDir := t.TempDir()
	Init(tmpDir)

	managers = sync.Map{}
	atomic.StoreInt64(&activeCount, 0)

	maliciousCallIDs := []string{
		"../../etc/evil",
		"../sibling-dir/call",
		"/absolute/path/call",
		"normal-call-id",
		"call@192.168.1.1",
	}

	for _, callID := range maliciousCallIDs {
		t.Run(callID, func(t *testing.T) {
			managers = sync.Map{}
			atomic.StoreInt64(&activeCount, 0)

			rec, err := GetOrCreateRecorder(callID, "test.com", timeutil.Now())
			if err != nil {
				// Some path components might cause OS-level errors, which is acceptable
				return
			}

			// The PCAP file must be inside baseDir (tmpDir)
			absPath, _ := filepath.Abs(rec.path)
			absBase, _ := filepath.Abs(tmpDir)

			if !strings.HasPrefix(absPath, absBase) {
				t.Errorf("SECURITY: path %q escapes baseDir %q for callID %q",
					absPath, absBase, callID)
			}

			// Clean up
			CloseRecorder(callID)
		})
	}
}

// ======== Benchmarks for TDD Refactoring ========

func BenchmarkRecorder_WritePacket_Old(b *testing.B) {
	tmpDir := b.TempDir()
	Init(tmpDir)
	defer CloseAll()

	rec, _ := GetOrCreateRecorder("bench-old", "test.com", timeutil.Now())

	// Create dummy RTP payload
	payload := make([]byte, 160)
	srcIP := net.ParseIP("192.168.1.100")
	dstIP := net.ParseIP("192.168.1.200")

	b.ResetTimer()
	b.ReportAllocs()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			err := rec.WritePacket(payload, srcIP, dstIP, 5060, 5060, timeutil.Now())
			if err != nil {
				b.Fatalf("WritePacket failed: %v", err)
			}
		}
	})
}

func BenchmarkRecorder_SmartWritePacket_New(b *testing.B) {
	tmpDir := b.TempDir()
	Init(tmpDir)
	defer CloseAll()

	rec, _ := GetOrCreateRecorder("bench-new", "test.com", timeutil.Now())

	// Simulated direct-from-NIC packet (Ethernet + IPv4 + UDP + RTP payload)
	// We need 34 bytes of mock headers to pass isValidEthernetAndIP
	nicPacket := make([]byte, 200)
	nicPacket[12] = 0x08 // EtherType IPv4
	nicPacket[13] = 0x00
	nicPacket[14] = 0x45 // IPv4 Version 4

	payloadSlice := nicPacket[42:] // Mock RTP payload
	srcIP := net.ParseIP("192.168.1.100")
	dstIP := net.ParseIP("192.168.1.200")

	b.ResetTimer()
	b.ReportAllocs()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			err := rec.SmartWritePacket(nicPacket, payloadSlice, srcIP, dstIP, 5060, 5060, timeutil.Now())
			if err != nil {
				// DropTail protection might trigger, which is fine and part of the test
			}
		}
	})
}
