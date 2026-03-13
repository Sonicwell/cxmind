package ser

import (
	"fmt"
	"log"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/cxmind/ingestion-go/internal/metrics"
	"github.com/shirou/gopsutil/v3/cpu"
)

const (
	ModeRealtime = "realtime"
	ModePostCall = "post_call"
	ModeDegraded = "degraded"
	ModeAuto     = "auto"
)

// ResourceMonitor tracks CPU and memory usage for adaptive SER mode switching.
type ResourceMonitor struct {
	mu            sync.RWMutex
	cpuThreshold  float64 // percent, default 70
	restoreRatio  float64 // restore when CPU < threshold * restoreRatio (default 0.7)
	mode          string  // "realtime" | "post_call" | "degraded"
	desiredMode   string  // what the user configured ("realtime" | "post_call" | "auto")
	lastCPU       float64
	lastMem       float64 // RSS in MB
	degradedSince time.Time
	onModeChange  func(oldMode, newMode string) // callback when mode changes
	stopCh        chan struct{}
	stopped       bool
}

// ResourceStats holds a snapshot of resource usage.
type ResourceStats struct {
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryMB      float64 `json:"memory_mb"`
	CurrentMode   string  `json:"current_mode"`
	DesiredMode   string  `json:"desired_mode"`
	Degraded      bool    `json:"degraded"`
	DegradedSince string  `json:"degraded_since,omitempty"`
	Threshold     float64 `json:"threshold"`
}

var (
	globalMonitor *ResourceMonitor
	monitorOnce   sync.Once
)

// GetResourceMonitor returns the singleton ResourceMonitor.
func GetResourceMonitor() *ResourceMonitor {
	return globalMonitor
}

// InitResourceMonitor initializes the global ResourceMonitor.
func InitResourceMonitor(cpuThreshold float64, desiredMode string, onModeChange func(string, string)) *ResourceMonitor {
	monitorOnce.Do(func() {
		globalMonitor = NewResourceMonitor(cpuThreshold, desiredMode, onModeChange)
		globalMonitor.Start()
	})
	return globalMonitor
}

// NewResourceMonitor creates a new monitor.
func NewResourceMonitor(cpuThreshold float64, desiredMode string, onModeChange func(string, string)) *ResourceMonitor {
	if cpuThreshold <= 0 {
		cpuThreshold = 70
	}
	if desiredMode == "" {
		desiredMode = "post_call"
	}
	activeMode := desiredMode
	if desiredMode == "auto" {
		activeMode = "realtime" // start in realtime, degrade if needed
	}

	return &ResourceMonitor{
		cpuThreshold: cpuThreshold,
		restoreRatio: 0.7,
		mode:         activeMode,
		desiredMode:  desiredMode,
		onModeChange: onModeChange,
		stopCh:       make(chan struct{}),
	}
}

// Start begins periodic resource monitoring (every 10 seconds).
func (rm *ResourceMonitor) Start() {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		log.Printf("[SER/Resource] Monitor started (threshold: %.0f%%, mode: %s)",
			rm.cpuThreshold, rm.desiredMode)

		for {
			select {
			case <-rm.stopCh:
				log.Println("[SER/Resource] Monitor stopped")
				return
			case <-ticker.C:
				rm.sample()
			}
		}
	}()
}

// Stop halts the resource monitor.
func (rm *ResourceMonitor) Stop() {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if !rm.stopped {
		close(rm.stopCh)
		rm.stopped = true
	}
}

// sample collects CPU/memory and decides whether to degrade.
func (rm *ResourceMonitor) sample() {
	// CPU (average over 1 second)
	cpuPercents, err := cpu.Percent(time.Second, false)
	if err != nil || len(cpuPercents) == 0 {
		return
	}
	cpuPct := cpuPercents[0]

	// Memory (RSS of current process)
	var memMB float64
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	memMB = float64(memStats.Sys) / 1024 / 1024

	rm.mu.Lock()
	defer rm.mu.Unlock()
	rm.lastCPU = cpuPct
	rm.lastMem = memMB

	// Only auto-degrade when desired mode is "auto" or "realtime"
	if rm.desiredMode == "post_call" {
		rm.mode = "post_call"
		return
	}

	oldMode := rm.mode

	if cpuPct > rm.cpuThreshold*1.15 { // > threshold+15% → degrade
		if rm.mode == "realtime" {
			rm.mode = "degraded"
			rm.degradedSince = time.Now()
			metrics.SERDegradedStatus.Set(1) // 1 = degraded
			log.Printf("[SER/Resource] ⚠️ CPU %.1f%% > %.0f%%, degrading to post_call mode",
				cpuPct, rm.cpuThreshold)
		}
	} else if cpuPct < rm.cpuThreshold*rm.restoreRatio {
		if rm.mode == "degraded" {
			rm.mode = "realtime"
			metrics.SERDegradedStatus.Set(0) // 0 = healthy
			log.Printf("[SER/Resource] CPU %.1f%% recovered, restoring realtime mode", cpuPct)
		}
	}

	if oldMode != rm.mode && rm.onModeChange != nil {
		go rm.onModeChange(oldMode, rm.mode)
	}
}

// GetMode returns the current operating mode.
func (rm *ResourceMonitor) GetMode() string {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	return rm.mode
}

// GetStats returns current resource stats.
func (rm *ResourceMonitor) GetStats() ResourceStats {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	stats := ResourceStats{
		CPUPercent:  rm.lastCPU,
		MemoryMB:    rm.lastMem,
		CurrentMode: rm.mode,
		DesiredMode: rm.desiredMode,
		Degraded:    rm.mode == "degraded",
		Threshold:   rm.cpuThreshold,
	}
	if rm.mode == "degraded" {
		stats.DegradedSince = rm.degradedSince.Format(time.RFC3339)
	}
	return stats
}

// UpdateConfig dynamically updates threshold and desired mode.
func (rm *ResourceMonitor) UpdateConfig(cpuThreshold float64, desiredMode string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if cpuThreshold > 0 {
		rm.cpuThreshold = cpuThreshold
	}
	if desiredMode != "" {
		rm.desiredMode = desiredMode
		if desiredMode == "post_call" {
			rm.mode = "post_call"
		} else if desiredMode == "realtime" {
			rm.mode = "realtime"
		} else if desiredMode == "auto" && rm.mode != "degraded" {
			rm.mode = "realtime"
		}
	}
	log.Printf("[SER/Resource] Config updated: threshold=%.0f%%, mode=%s", rm.cpuThreshold, rm.desiredMode)
}

// checkPsutilAvailable returns whether gopsutil works on this platform.
func checkPsutilAvailable() bool {
	_, err := cpu.Percent(0, false)
	if err != nil {
		// Fallback: use os-level checks
		_, statErr := os.Stat("/proc/stat")
		return statErr == nil || runtime.GOOS == "darwin"
	}
	return true
}

func init() {
	if !checkPsutilAvailable() {
		fmt.Println("[SER/Resource] Warning: CPU monitoring may not work on this platform")
	}
}
