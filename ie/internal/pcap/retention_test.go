package pcap

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// ========================================================================
// TDD Tests — Policy-Based Retention
// ========================================================================

func TestCleanByAge_RemovesOldFiles(t *testing.T) {
	dir := t.TempDir()

	// Create an "old" file (mod time 100 days ago)
	oldPath := filepath.Join(dir, "old-call.pcap")
	os.WriteFile(oldPath, []byte("old pcap data"), 0644)
	oldTime := timeutil.Now().AddDate(0, 0, -100)
	os.Chtimes(oldPath, oldTime, oldTime)

	// Create a "new" file (mod time now)
	newPath := filepath.Join(dir, "new-call.pcap")
	os.WriteFile(newPath, []byte("new pcap data"), 0644)

	cleaned, freed := cleanByAge(dir, 90) // 90 day policy

	if cleaned != 1 {
		t.Errorf("cleaned = %d, want 1", cleaned)
	}
	if freed == 0 {
		t.Error("freed should be > 0")
	}

	// Old file should be gone
	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Error("old file should be deleted")
	}
	// New file should remain
	if _, err := os.Stat(newPath); os.IsNotExist(err) {
		t.Error("new file should remain")
	}
}

func TestCleanByAge_NoFilesToClean(t *testing.T) {
	dir := t.TempDir()

	newPath := filepath.Join(dir, "recent.pcap")
	os.WriteFile(newPath, []byte("data"), 0644)

	cleaned, _ := cleanByAge(dir, 90)
	if cleaned != 0 {
		t.Errorf("cleaned = %d, want 0", cleaned)
	}
}

func TestCleanBySize_RemovesOldest(t *testing.T) {
	dir := t.TempDir()

	// Create 3 files (total ~30 bytes)
	for i, name := range []string{"a.pcap", "b.pcap", "c.pcap"} {
		path := filepath.Join(dir, name)
		os.WriteFile(path, make([]byte, 10), 0644)
		// Stagger mod times
		modTime := timeutil.Now().Add(time.Duration(-3+i) * time.Hour)
		os.Chtimes(path, modTime, modTime)
	}

	// Set max size to 15 bytes — should delete oldest files until under limit
	cleaned, _ := cleanBySize(dir, 15.0/(1024*1024*1024)) // 15 bytes in GB

	if cleaned < 1 {
		t.Errorf("expected at least 1 file cleaned, got %d", cleaned)
	}
}

func TestCleanBySize_UnderLimit(t *testing.T) {
	dir := t.TempDir()

	os.WriteFile(filepath.Join(dir, "small.pcap"), []byte("x"), 0644)

	cleaned, _ := cleanBySize(dir, 1.0) // 1 GB limit, file is tiny
	if cleaned != 0 {
		t.Errorf("cleaned = %d, want 0 (under limit)", cleaned)
	}
}

func TestCleanByAge_EmptyDir(t *testing.T) {
	dir := t.TempDir()
	cleaned, freed := cleanByAge(dir, 30)
	if cleaned != 0 || freed != 0 {
		t.Errorf("empty dir should yield 0 cleaned, 0 freed")
	}
}

func TestFindPCAPFiles_Recursive(t *testing.T) {
	dir := t.TempDir()

	// Create nested structure
	subDir := filepath.Join(dir, "realm", "2026", "02")
	os.MkdirAll(subDir, 0755)
	os.WriteFile(filepath.Join(subDir, "call-1.pcap"), []byte("data"), 0644)
	os.WriteFile(filepath.Join(subDir, "call-2.pcap"), []byte("data"), 0644)
	os.WriteFile(filepath.Join(dir, "top.pcap"), []byte("data"), 0644)
	os.WriteFile(filepath.Join(dir, "not-pcap.wav"), []byte("data"), 0644) // Should be ignored

	files := findPCAPFiles(dir)
	if len(files) != 3 {
		t.Errorf("found %d pcap files, want 3", len(files))
	}
}

func TestFormatRetentionStatus(t *testing.T) {
	policy := RetentionPolicy{Enabled: true, MaxAgeDays: 90, MaxSizeGB: 100, ScanIntervalHours: 6}
	status := FormatRetentionStatus(policy)
	if status == "" || status == "disabled" {
		t.Errorf("unexpected status: %q", status)
	}

	disabled := RetentionPolicy{Enabled: false}
	if FormatRetentionStatus(disabled) != "disabled" {
		t.Error("disabled policy should return 'disabled'")
	}
}
