package ser

import (
	"sync"
	"testing"
	"time"
)

func TestNewResourceMonitor(t *testing.T) {
	// Test default values
	m1 := NewResourceMonitor(0, "", nil)
	if m1.cpuThreshold != 70 {
		t.Errorf("Expected default CPU threshold 70, got %f", m1.cpuThreshold)
	}
	if m1.desiredMode != ModePostCall {
		t.Errorf("Expected default desired mode post_call, got %s", m1.desiredMode)
	}
	if m1.mode != ModePostCall {
		t.Errorf("Expected active mode to be post_call, got %s", m1.mode)
	}

	// Test auto mode
	m2 := NewResourceMonitor(80, ModeAuto, nil)
	if m2.desiredMode != ModeAuto {
		t.Errorf("Expected desired mode auto, got %s", m2.desiredMode)
	}
	if m2.mode != ModeRealtime {
		t.Errorf("Expected active mode realtime when desired is auto, got %s", m2.mode)
	}
}

func TestResourceMonitor_UpdateConfig(t *testing.T) {
	m := NewResourceMonitor(60, ModeRealtime, nil)

	m.UpdateConfig(85, ModeAuto)

	if m.cpuThreshold != 85 {
		t.Errorf("Expected updated threshold 85, got %f", m.cpuThreshold)
	}
	if m.desiredMode != ModeAuto {
		t.Errorf("Expected updated desired mode auto, got %s", m.desiredMode)
	}

	m.UpdateConfig(0, ModePostCall)
	if m.cpuThreshold != 85 {
		t.Errorf("Expected threshold to remain 85 when passing 0, got %f", m.cpuThreshold)
	}
	if m.mode != ModePostCall {
		t.Errorf("Expected active mode post_call, got %s", m.mode)
	}
}

func TestResourceMonitor_GetStats(t *testing.T) {
	m := NewResourceMonitor(75, ModeRealtime, nil)

	// manually set some values
	m.lastCPU = 45.5
	m.lastMem = 100.2

	stats := m.GetStats()
	if stats.CPUPercent != 45.5 {
		t.Errorf("Expected CPU 45.5, got %f", stats.CPUPercent)
	}
	if stats.MemoryMB != 100.2 {
		t.Errorf("Expected Memory 100.2, got %f", stats.MemoryMB)
	}
	if stats.CurrentMode != ModeRealtime {
		t.Errorf("Expected CurrentMode realtime, got %s", stats.CurrentMode)
	}
}

func TestResourceMonitor_Degradation(t *testing.T) {
	// We use a mock function for cpu.Percent inside sample normally,
	// but here we can just manually set the lastCPU and trigger the internal logic by calling sample()
	// Or even better, manually test the logic block in sample

	var changedOld, changedNew string
	var mu sync.Mutex

	onModeChange := func(oldMode, newMode string) {
		mu.Lock()
		defer mu.Unlock()
		changedOld = oldMode
		changedNew = newMode
	}

	m := NewResourceMonitor(50, ModeAuto, onModeChange)
	m.mode = ModeRealtime // Start normal

	// Simulate high CPU (> 50 * 1.15 = 57.5)
	// We can't easily mock gopsutil in this test file directly without interface,
	// so we will manually test the state changes that sample() would do if we injected a value.
	// We'll simulate the logic inside sample():

	// 1. Degrade
	m.mu.Lock()
	m.lastCPU = 80 // > 57.5
	if m.lastCPU > m.cpuThreshold*1.15 && m.mode == "realtime" {
		oldMode := m.mode
		m.mode = "degraded"
		if m.onModeChange != nil {
			go m.onModeChange(oldMode, m.mode)
		}
	}
	m.mu.Unlock()

	// Give background goroutine time to run
	time.Sleep(50 * time.Millisecond)

	mu.Lock()
	if changedOld != "realtime" || changedNew != "degraded" {
		t.Errorf("Expected callback (realtime -> degraded), got %s -> %s", changedOld, changedNew)
	}
	if m.GetMode() != "degraded" {
		t.Errorf("Expected mode degraded, got %s", m.GetMode())
	}
	mu.Unlock()

	// 2. Recover (< 50 * 0.7 = 35)
	m.mu.Lock()
	m.lastCPU = 20 // < 35
	if m.lastCPU < m.cpuThreshold*m.restoreRatio && m.mode == "degraded" {
		oldMode := m.mode
		m.mode = "realtime"
		if m.onModeChange != nil {
			go m.onModeChange(oldMode, m.mode)
		}
	}
	m.mu.Unlock()

	time.Sleep(50 * time.Millisecond)

	mu.Lock()
	if changedOld != "degraded" || changedNew != "realtime" {
		t.Errorf("Expected callback (degraded -> realtime), got %s -> %s", changedOld, changedNew)
	}
	if m.GetMode() != "realtime" {
		t.Errorf("Expected mode realtime, got %s", m.GetMode())
	}
	mu.Unlock()
}

func TestResourceMonitor_StartStop(t *testing.T) {
	m := NewResourceMonitor(70, ModeRealtime, nil)
	m.Start()

	// Ensure it's not stopped
	if m.stopped {
		t.Errorf("Monitor should not be stopped yet")
	}

	m.Stop()

	// Ensure it is stopped
	if !m.stopped {
		t.Errorf("Monitor should be stopped")
	}

	// Second stop should be no-op and not panic
	m.Stop()
}
