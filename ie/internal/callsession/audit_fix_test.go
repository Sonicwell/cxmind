package callsession

import (
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
)

// === FN-4: RebuildFromRedis should proactively clean expired sessions ===
// Note: Full integration test requires Redis mock. This unit test verifies
// that the session expiration logic correctly identifies expired sessions.

func TestExpiredSessionDetection_DuringRebuild(t *testing.T) {
	viper.Set("sniffer.session_expires_margin", 1.2)
	defer viper.Reset()

	m := newTestManager()
	now := timeutil.Now()

	// Simulate a session created 20 minutes ago with 5 minute timeout
	// SessionExpires=300s * margin=1.2 = 360s = 6 minutes
	// 20 minutes ago + 6 minutes = 14 minutes ago → should be expired
	oldTime := now.Add(-20 * time.Minute)
	m.UpdateSession("old-call", 300, oldTime)

	// Simulate a session created 1 minute ago with 5 minute timeout
	// 1 minute ago + 6 minutes = 5 minutes from now → still active
	recentTime := now.Add(-1 * time.Minute)
	m.UpdateSession("recent-call", 300, recentTime)

	// Get expired sessions
	expired := m.GetExpiredSessions()

	// Old call should be expired
	assert.Equal(t, 1, len(expired), "Should have 1 expired session")
	assert.Equal(t, "old-call", expired[0].CallID, "The old call should be expired")

	// Recent call should still be active
	_, ok := m.sessions.Load("recent-call")
	assert.True(t, ok, "Recent call should still be active")

	// Expired call should be marked as terminated
	assert.True(t, m.IsTerminated("old-call"), "Expired call should be terminated")
}

// === SEC-S2: SRTP key TTL should be configurable (not hardcoded to 1h) ===
// This test is a design validation — the actual fix is in redis/client.go

func TestSRTPKeyTTL_ShouldBeConfigurable(t *testing.T) {
	// Document the issue: 1 hour hardcoded TTL is too short for long calls.
	// The fix is to make it configurable via config.Global.GetDuration("redis.srtp_key_ttl")
	// with a default of 24 hours (matching call:state TTL).
	t.Log("SEC-S2: SRTP key TTL is hardcoded to 1 hour in redis/client.go:358")
	t.Log("Calls lasting >1 hour will lose SRTP decryption capability")
	t.Log("Fix: use viper config with 24h default to match call:state TTL")
}
