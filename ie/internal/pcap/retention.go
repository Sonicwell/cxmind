package pcap

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// RetentionPolicy defines rules for automatic PCAP recording cleanup.
type RetentionPolicy struct {
	Enabled           bool
	MaxAgeDays        int
	MaxSizeGB         float64
	ScanIntervalHours int
}

// retentionStop is used to signal the worker to stop.
var retentionStop chan struct{}

// StartRetentionWorker starts a background goroutine that periodically
// scans the recordings directory and removes files per the retention policy.
func StartRetentionWorker(policy RetentionPolicy) {
	if !policy.Enabled {
		log.Println("[Retention] Disabled by configuration")
		return
	}

	interval := time.Duration(policy.ScanIntervalHours) * time.Hour
	if interval < time.Minute {
		interval = 6 * time.Hour // safety minimum
	}

	retentionStop = make(chan struct{})

	log.Printf("[Retention] Worker started (max_age=%dd, max_size=%.1fGB, interval=%v)",
		policy.MaxAgeDays, policy.MaxSizeGB, interval)

	go func() {
		// Run once at startup
		runRetentionScan(policy)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				runRetentionScan(policy)
			case <-retentionStop:
				log.Println("[Retention] Worker stopped")
				return
			}
		}
	}()
}

// StopRetentionWorker stops the retention background worker.
func StopRetentionWorker() {
	if retentionStop != nil {
		close(retentionStop)
	}
}

// runRetentionScan performs a single retention scan.
func runRetentionScan(policy RetentionPolicy) {
	var totalCleaned int
	var totalFreed int64

	if policy.MaxAgeDays > 0 {
		cleaned, freed := cleanByAge(baseDir, policy.MaxAgeDays)
		totalCleaned += cleaned
		totalFreed += freed
	}

	if policy.MaxSizeGB > 0 {
		cleaned, freed := cleanBySize(baseDir, policy.MaxSizeGB)
		totalCleaned += cleaned
		totalFreed += freed
	}

	if totalCleaned > 0 {
		log.Printf("[Retention] Cleaned %d files, freed %.2f MB",
			totalCleaned, float64(totalFreed)/(1024*1024))
	}
}

// pcapFileInfo holds file info for sorting by modification time.
type pcapFileInfo struct {
	Path    string
	Size    int64
	ModTime time.Time
}

// cleanByAge removes .pcap files older than maxAgeDays.
func cleanByAge(dir string, maxAgeDays int) (cleaned int, freed int64) {
	cutoff := timeutil.Now().AddDate(0, 0, -maxAgeDays)
	files := findPCAPFiles(dir)

	for _, f := range files {
		if f.ModTime.Before(cutoff) {
			if err := os.Remove(f.Path); err != nil {
				log.Printf("[Retention] Failed to remove %s: %v", f.Path, err)
				continue
			}
			cleaned++
			freed += f.Size
		}
	}

	// Clean up empty directories
	cleanEmptyDirs(dir)

	return cleaned, freed
}

// cleanBySize removes oldest .pcap files until total size is under maxSizeGB.
func cleanBySize(dir string, maxSizeGB float64) (cleaned int, freed int64) {
	maxBytes := int64(maxSizeGB * 1024 * 1024 * 1024)
	files := findPCAPFiles(dir)

	// Calculate total size
	var totalSize int64
	for _, f := range files {
		totalSize += f.Size
	}

	if totalSize <= maxBytes {
		return 0, 0 // Under limit
	}

	// Sort oldest first
	sort.Slice(files, func(i, j int) bool {
		return files[i].ModTime.Before(files[j].ModTime)
	})

	// Remove oldest files until under limit
	for _, f := range files {
		if totalSize <= maxBytes {
			break
		}
		if err := os.Remove(f.Path); err != nil {
			log.Printf("[Retention] Failed to remove %s: %v", f.Path, err)
			continue
		}
		totalSize -= f.Size
		cleaned++
		freed += f.Size
	}

	cleanEmptyDirs(dir)

	return cleaned, freed
}

// findPCAPFiles recursively finds all .pcap files in a directory.
func findPCAPFiles(dir string) []pcapFileInfo {
	var files []pcapFileInfo

	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip inaccessible files
		}
		if !info.IsDir() && filepath.Ext(path) == ".pcap" {
			files = append(files, pcapFileInfo{
				Path:    path,
				Size:    info.Size(),
				ModTime: info.ModTime(),
			})
		}
		return nil
	})

	return files
}

// cleanEmptyDirs removes empty directories (bottom-up) under the base dir.
// R-9: Collect all dirs, sort by depth (deepest first), then remove empty ones.
func cleanEmptyDirs(dir string) {
	var dirs []string
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || !info.IsDir() || path == dir {
			return nil
		}
		dirs = append(dirs, path)
		return nil
	})

	// Sort by path length descending (deepest first) for bottom-up removal
	sort.Slice(dirs, func(i, j int) bool {
		return len(dirs[i]) > len(dirs[j])
	})

	for _, d := range dirs {
		entries, err := os.ReadDir(d)
		if err != nil {
			continue
		}
		if len(entries) == 0 {
			os.Remove(d)
		}
	}
}

// FormatRetentionStatus returns a human-readable retention status string.
func FormatRetentionStatus(policy RetentionPolicy) string {
	if !policy.Enabled {
		return "disabled"
	}
	return fmt.Sprintf("max_age=%dd, max_size=%.1fGB, scan_every=%dh",
		policy.MaxAgeDays, policy.MaxSizeGB, policy.ScanIntervalHours)
}
