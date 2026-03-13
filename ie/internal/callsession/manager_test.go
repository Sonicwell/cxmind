package callsession

import (
	"context"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
)

// newTestManager creates a SessionManager for testing (no background goroutines).
func newTestManager() *SessionManager {
	return NewTestManager()
}

// TestRemoveSession_PreventsReAdd verifies that UpdateSession after RemoveSession
// does NOT re-add the session to the heap. This is the core bug scenario:
// BYE calls RemoveSession, then 200 OK calls UpdateSession.
func TestRemoveSession_PreventsReAdd(t *testing.T) {
	viper.Set("sniffer.session_expires_margin", 1.2)
	defer viper.Reset()

	m := newTestManager()
	callID := "test-bye-race-001"
	now := timeutil.Now()

	// Step 1: INVITE arrives — creates session
	m.UpdateSession(callID, 300, now)

	// Verify session exists
	_, ok := m.sessions.Load(callID)
	assert.True(t, ok, "Session should exist after INVITE")
	assert.Equal(t, 1, m.timeouts.Len(), "Heap should have 1 entry")

	// Step 2: BYE arrives — removes session
	m.RemoveSession(callID)

	// Verify session removed
	_, ok = m.sessions.Load(callID)
	assert.False(t, ok, "Session should be removed after BYE")
	assert.Equal(t, 0, m.timeouts.Len(), "Heap should be empty after BYE")

	// Step 3: 200 OK for BYE arrives — should NOT re-add session
	m.UpdateSession(callID, 300, now.Add(100*time.Millisecond))

	// THIS IS THE BUG: without the fix, session gets re-added
	_, ok = m.sessions.Load(callID)
	assert.False(t, ok, "Session should NOT be re-added after BYE (200 OK race)")
	assert.Equal(t, 0, m.timeouts.Len(), "Heap should remain empty after BYE")
}

// TestIsTerminated_ReturnsTrueAfterRemove verifies the IsTerminated API.
func TestIsTerminated_ReturnsTrueAfterRemove(t *testing.T) {
	m := newTestManager()
	callID := "test-terminated-001"

	// Before removal: not terminated
	assert.False(t, m.IsTerminated(callID), "Should not be terminated before RemoveSession")

	// Create session then remove
	viper.Set("sniffer.session_expires_margin", 1.2)
	defer viper.Reset()
	m.UpdateSession(callID, 300, timeutil.Now())
	m.RemoveSession(callID)

	// After removal: terminated
	assert.True(t, m.IsTerminated(callID), "Should be terminated after RemoveSession")
}

// TestIsTerminated_ReturnsFalseForActive verifies active calls are not marked terminated.
func TestIsTerminated_ReturnsFalseForActive(t *testing.T) {
	viper.Set("sniffer.session_expires_margin", 1.2)
	defer viper.Reset()

	m := newTestManager()

	// Create active session
	m.UpdateSession("active-call", 300, timeutil.Now())

	assert.False(t, m.IsTerminated("active-call"), "Active call should not be terminated")
}

// TestGetExpiredSessions_AlsoMarksTerminated verifies that expired sessions
// are also marked as terminated to prevent re-creation.
func TestGetExpiredSessions_AlsoMarksTerminated(t *testing.T) {
	viper.Set("sniffer.session_expires_margin", 1.0) // Exact, no margin for test
	defer viper.Reset()

	m := newTestManager()
	callID := "test-expire-terminate"

	// Create session that's already expired
	past := timeutil.Now().Add(-10 * time.Minute)
	m.UpdateSession(callID, 1, past) // expires at past + 1s

	// Get expired
	expired := m.GetExpiredSessions()
	assert.Equal(t, 1, len(expired), "Should have 1 expired session")

	// Expired session should be terminated (prevents 200 OK re-add)
	assert.True(t, m.IsTerminated(callID), "Expired session should be marked terminated")
}

// --- Phase 2: Hybrid Terminated Cleanup ---

// TestClearTerminated_IsNoOp verifies that ClearTerminated is a no-op
// to prevent ghost sessions from being re-added by late SIP messages.
func TestClearTerminated_IsNoOp(t *testing.T) {
	viper.Set("sniffer.session_expires_margin", 1.2)
	defer viper.Reset()

	m := newTestManager()
	callID := "test-clear-200ok"

	// BYE arrives → tombstone
	m.UpdateSession(callID, 300, timeutil.Now())
	m.RemoveSession(callID)
	assert.True(t, m.IsTerminated(callID), "Should be terminated after BYE")

	// 200 OK for BYE → ClearTerminated is no-op, tombstone remains
	m.ClearTerminated(callID)
	assert.True(t, m.IsTerminated(callID), "Should STILL be terminated (no-op prevents ghost sessions)")
}

// TestGhostSessionPrevention verifies the full BYE → 200 OK → retransmit scenario.
// Before fix: retransmit after ClearTerminated would re-add a ghost session → session_timeout.
func TestGhostSessionPrevention(t *testing.T) {
	viper.Set("sniffer.session_expires_margin", 1.2)
	defer viper.Reset()

	m := newTestManager()
	callID := "test-ghost-prevention"
	now := timeutil.Now()

	// 1. INVITE → session created
	m.UpdateSession(callID, 300, now)
	assert.Equal(t, 1, m.timeouts.Len())

	// 2. BYE → session removed, terminated
	m.RemoveSession(callID)
	assert.Equal(t, 0, m.timeouts.Len())
	assert.True(t, m.IsTerminated(callID))

	// 3. 200 OK for BYE → ClearTerminated (no-op)
	m.ClearTerminated(callID)
	assert.True(t, m.IsTerminated(callID), "terminated guard must survive ClearTerminated")

	// 4. Late retransmit/ACK → UpdateSession should be blocked
	m.UpdateSession(callID, 300, now.Add(500*time.Millisecond))
	_, ok := m.sessions.Load(callID)
	assert.False(t, ok, "Ghost session must NOT be created after BYE")
	assert.Equal(t, 0, m.timeouts.Len(), "Heap must remain empty")
}

// TestTTLCleanup_RemovesOldEntries verifies that CleanupTerminatedTTL removes
// entries older than the given TTL duration.
func TestTTLCleanup_RemovesOldEntries(t *testing.T) {
	m := newTestManager()

	// Simulate two terminated calls: one old, one recent
	m.RemoveSession("old-call")   // will be terminated
	m.RemoveSession("fresh-call") // will be terminated

	// Manually backdate the "old-call" entry to 15 minutes ago
	m.SetTerminatedTime("old-call", timeutil.Now().Add(-15*time.Minute))

	// Run TTL cleanup with 10 minute threshold
	removed := m.CleanupTerminatedTTL(10 * time.Minute)

	assert.Equal(t, 1, removed, "Should remove 1 old entry")
	assert.False(t, m.IsTerminated("old-call"), "Old call should be cleaned up")
	assert.True(t, m.IsTerminated("fresh-call"), "Fresh call should remain")
}

// TestTTLCleanup_KeepsRecentEntries verifies that TTL cleanup does not
// remove entries that are still within the TTL window.
func TestTTLCleanup_KeepsRecentEntries(t *testing.T) {
	m := newTestManager()

	// Terminate 3 calls, all recent
	m.RemoveSession("call-a")
	m.RemoveSession("call-b")
	m.RemoveSession("call-c")

	// Run TTL cleanup with 10 minute threshold
	removed := m.CleanupTerminatedTTL(10 * time.Minute)

	assert.Equal(t, 0, removed, "No entries should be removed (all recent)")
	assert.True(t, m.IsTerminated("call-a"))
	assert.True(t, m.IsTerminated("call-b"))
	assert.True(t, m.IsTerminated("call-c"))
}

// --- TOCTOU Fix Tests ---

// TestUpdateSession_ConcurrentCreate verifies that concurrent UpdateSession
// calls for the same NEW callID produce exactly 1 heap entry.
// Without LoadOrStore fix, Load→Store race can create duplicate heap entries.
func TestUpdateSession_ConcurrentCreate(t *testing.T) {
	viper.Set("sniffer.session_expires_margin", 1.2)
	defer viper.Reset()

	m := newTestManager()
	callID := "test-toctou-race"
	now := timeutil.Now()

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(offset int) {
			defer wg.Done()
			m.UpdateSession(callID, 300, now.Add(time.Duration(offset)*time.Millisecond))
		}(i)
	}
	wg.Wait()

	// Must have exactly 1 session
	count := 0
	m.sessions.Range(func(_, _ any) bool {
		count++
		return true
	})
	assert.Equal(t, 1, count, "Should have exactly 1 session entry after concurrent creates")

	// Must have exactly 1 heap entry
	m.mu.Lock()
	heapLen := m.timeouts.Len()
	m.mu.Unlock()
	assert.Equal(t, 1, heapLen, "Heap should have exactly 1 entry after concurrent creates")
}

// =============================================================================
// BUG-3: SetContext concurrent race detection
// =============================================================================

// TestSetContext_RaceDetector verifies concurrent SetContext calls do not
// race with goroutines that read the context (e.g. batchUpdateRedis).
// Must be run with -race flag to detect data races.
func TestSetContext_RaceDetector(t *testing.T) {
	// Run concurrent SetContext calls alongside getCtx() reads
	var wg sync.WaitGroup
	const goroutines = 100

	for i := 0; i < goroutines; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			SetContext(context.Background())
		}()
		go func() {
			defer wg.Done()
			// Read the context (simulates batchUpdateRedis / RebuildFromRedis)
			_ = getCtx()
		}()
	}
	wg.Wait()
}

// =============================================================================
// BUG-4: Extreme High Concurrency Chaos Test
// =============================================================================

func TestSessionManager_ExtremeConcurrency(t *testing.T) {
	viper.Set("sniffer.session_expires_margin", 1.2)
	defer viper.Reset()

	m := newTestManager()
	var wg sync.WaitGroup
	const numCalls = 10000

	// Launch 10,000 goroutines simulating full call lifecycles
	for i := 0; i < numCalls; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			callID := "stress-call-" + strconv.Itoa(idx)

			now := timeutil.Now()
			// 1. INVITE
			m.UpdateSession(callID, 300, now)

			// 2. Mid-call status check
			_ = m.IsTerminated(callID)

			// 3. Re-INVITE
			m.UpdateSession(callID, 300, now.Add(10*time.Millisecond))

			// 4. BYE
			m.RemoveSession(callID)

			// 5. 200 OK (ClearTerminated is no-op, tombstone cleaned by TTL)
			m.ClearTerminated(callID)
		}(i)
	}

	// Concurrent GC routine
	var gcWg sync.WaitGroup
	gcWg.Add(1)
	go func() {
		defer gcWg.Done()
		for i := 0; i < 50; i++ {
			time.Sleep(2 * time.Millisecond)
			m.GetExpiredSessions()
			m.CleanupTerminatedTTL(1 * time.Second)
		}
	}()

	wg.Wait()
	gcWg.Wait()
}
