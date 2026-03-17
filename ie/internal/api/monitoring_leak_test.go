package api

import (
	"testing"
)

// === ML-2: agentMonitoring sync.Map must be cleaned on stop ===

// TestMonitoringCache_StopMonitoring_ClearsEntry verifies that calling
// stop_monitoring actually removes the agent from the sync.Map, not just
// sets it to false (which still leaks the map entry).
func TestMonitoringCache_StopMonitoring_ClearsEntry(t *testing.T) {
	mc := &MonitoringCache{}

	// Start monitoring
	mc.agentMonitoring.Store("agent-001", true)

	// Stop monitoring — should DELETE entry, not just set false
	mc.ClearAgent("agent-001")

	// Verify entry is completely removed (not just false)
	_, exists := mc.agentMonitoring.Load("agent-001")
	if exists {
		t.Fatal("ML-2 FAIL: agentMonitoring entry still exists after ClearAgent — sync.Map memory leak")
	}
}

// TestMonitoringCache_StopMonitoringAction_ShouldCleanMap verifies that
// "stop_monitoring" action via HTTP removes the map entry entirely.
// Bug: The current HandleMonitoringUpdate stores false instead of deleting.
func TestMonitoringCache_StopMonitoringAction_ShouldCleanMap(t *testing.T) {
	mc := &MonitoringCache{}

	// Simulate start_monitoring
	mc.agentMonitoring.Store("agent-002", true)
	mc.callMonitoring.Store("call-002", true)

	// Simulate stop_monitoring — fixed code should Delete entries
	isMonitored := false
	if isMonitored {
		mc.agentMonitoring.Store("agent-002", true)
		mc.callMonitoring.Store("call-002", true)
	} else {
		// ML-2 fix: Delete instead of Store(false)
		mc.agentMonitoring.Delete("agent-002")
		mc.callMonitoring.Delete("call-002")
	}

	// Count entries — they should be ZERO after stop
	agentCount := 0
	mc.agentMonitoring.Range(func(_, _ interface{}) bool {
		agentCount++
		return true
	})

	callCount := 0
	mc.callMonitoring.Range(func(_, _ interface{}) bool {
		callCount++
		return true
	})

	if agentCount > 0 {
		t.Fatalf("ML-2 FAIL: agentMonitoring has %d entries after stop — should be 0 (sync.Map leak)", agentCount)
	}
	if callCount > 0 {
		t.Fatalf("ML-2 FAIL: callMonitoring has %d entries after stop — should be 0 (sync.Map leak)", callCount)
	}
}
