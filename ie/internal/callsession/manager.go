package callsession

import (
	"sync/atomic"

	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"

	"container/heap"
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/cxmind/ingestion-go/internal/redis"
)

// atomicCtx stores the package-level context for cancellation propagation.
// Uses atomic.Value to prevent data races between SetContext() and
// goroutines (batchUpdateRedis, RebuildFromRedis) that call getCtx().
var atomicCtx atomic.Value

type ctxWrapper struct {
	ctx context.Context
}

func init() {
	atomicCtx.Store(ctxWrapper{ctx: context.Background()})
}

// SetContext replaces the package-level context for callsession operations.
// Call from main.go with a cancelable context derived from signal handling
// so that RebuildFromRedis and session operations are canceled on graceful shutdown.
// Thread-safe: uses atomic.Value to avoid data races with goroutines reading via getCtx().
func SetContext(c context.Context) {
	atomicCtx.Store(ctxWrapper{ctx: c})
}

// getCtx returns the current package-level context.
// Safe for concurrent access — reads from atomic.Value.
func getCtx() context.Context {
	if v := atomicCtx.Load(); v != nil {
		if cw, ok := v.(ctxWrapper); ok {
			return cw.ctx
		}
	}
	return context.Background()
}

// SessionManager manages SIP session timeouts in memory with Redis backup
type SessionManager struct {
	sessions   sync.Map        // callID -> *CallSession
	timeouts   *TimeoutHeap    // Min-heap for O(1) expiration check
	tsCache    *TimestampCache // Buffer for batched Redis updates
	terminated sync.Map        // callID -> time.Time (BYE'd calls, prevents re-add race)
	mu         sync.Mutex      // Protects heap operations
	stop       chan struct{}   // Signal to stop background tasks
	margin     float64         // Cached session_expires_margin (RA-7: avoids per-call viper read)
}

var GlobalManager *SessionManager

// Initialize initializes the global session manager
func Initialize() {
	margin := config.Global.GetFloat64("sniffer.session_expires_margin")
	if margin <= 0 {
		margin = 1.2
	}
	GlobalManager = &SessionManager{
		timeouts: &TimeoutHeap{},
		tsCache:  NewTimestampCache(),
		stop:     make(chan struct{}),
		margin:   margin,
	}
	heap.Init(GlobalManager.timeouts)

	// Start background batch update
	go GlobalManager.batchUpdateRedis()

	// Start background TTL cleanup for terminated map (safety net)
	go GlobalManager.cleanupTerminatedLoop()
}

// NewTestManager creates a SessionManager for testing without background goroutines.
// This avoids viper.Reset race conditions in tests.
func NewTestManager() *SessionManager {
	m := &SessionManager{
		timeouts: &TimeoutHeap{},
		tsCache:  NewTimestampCache(),
		stop:     make(chan struct{}),
		margin:   1.2, // Default margin for tests
	}
	heap.Init(m.timeouts)
	return m
}

// ActiveSessionCount returns the number of active (non-terminated) sessions.
// Uses sync.Map.Range for lock-free iteration.
func (m *SessionManager) ActiveSessionCount() int {
	count := 0
	m.sessions.Range(func(_, _ any) bool {
		count++
		return true
	})
	return count
}

// GetSession returns the CallSession for the given callID, or nil if not found.
// Test-only accessor for inspecting session state in E2E tests.
func (m *SessionManager) GetSession(callID string) *CallSession {
	val, ok := m.sessions.Load(callID)
	if !ok {
		return nil
	}
	return val.(*CallSession)
}

// Stop stops the session manager background tasks
func (m *SessionManager) Stop() {
	close(m.stop)
}

// UpdateSession updates the session's last activity time and expiration.
// Skips terminated calls to prevent 200 OK for BYE from re-adding a session.
func (m *SessionManager) UpdateSession(callID string, sessionExpires int, timestamp time.Time) {
	// Guard: skip if call was already terminated by BYE/CANCEL
	if _, terminated := m.terminated.Load(callID); terminated {
		return
	}

	// Calculate expiration time with cached safety margin (RA-7)
	margin := m.margin
	if margin <= 0 {
		margin = 1.2
	}
	// Use float arithmetic for precision then convert to duration
	expiresAt := timestamp.Add(time.Duration(float64(sessionExpires)*margin) * time.Second)

	// Atomic insert-or-update using LoadOrStore to prevent TOCTOU race.
	newSession := &CallSession{
		CallID:         callID,
		SessionExpires: sessionExpires,
		LastSipMsgNano: timestamp.UnixNano(),
		ExpiresAtNano:  expiresAt.UnixNano(),
		heapExpiresAt:  expiresAt,
		heapIndex:      -1,
	}

	if val, loaded := m.sessions.LoadOrStore(callID, newSession); loaded {
		// Update existing session lock-free!
		session := val.(*CallSession)
		atomic.StoreInt64(&session.LastSipMsgNano, timestamp.UnixNano())
		atomic.StoreInt64(&session.ExpiresAtNano, expiresAt.UnixNano())
		// NOTE: We do NOT update heapExpiresAt or call heap.Fix here
		// to avoid the global m.mu lock. The Lazy-Heap pattern will handle the
		// extended expiration gracefully when popping.
	} else {
		// New session was atomically stored by LoadOrStore
		m.mu.Lock()
		heap.Push(m.timeouts, newSession)
		m.mu.Unlock()
	}

	// Add to cache for batched Redis update (persists LastSipMsg)
	m.tsCache.Add(callID, timestamp, sessionExpires)
}

// ShortenSession 强制缩短已存在 session 的超时。
// 与 UpdateSession 不同, 它会在锁保护下更新 heapExpiresAt 并调用 heap.Fix。
// 仅用于 401/407 auth challenge 等需要缩短超时的场景。
func (m *SessionManager) ShortenSession(callID string, sessionExpires int, timestamp time.Time) {
	if _, terminated := m.terminated.Load(callID); terminated {
		return
	}

	margin := m.margin
	if margin <= 0 {
		margin = 1.2
	}
	expiresAt := timestamp.Add(time.Duration(float64(sessionExpires)*margin) * time.Second)

	if val, ok := m.sessions.Load(callID); ok {
		session := val.(*CallSession)
		atomic.StoreInt64(&session.LastSipMsgNano, timestamp.UnixNano())
		atomic.StoreInt64(&session.ExpiresAtNano, expiresAt.UnixNano())

		m.mu.Lock()
		session.heapExpiresAt = expiresAt
		if session.heapIndex >= 0 {
			heap.Fix(m.timeouts, session.heapIndex)
		}
		m.mu.Unlock()
	} else {
		// session 不存在则创建
		m.UpdateSession(callID, sessionExpires, timestamp)
	}

	m.tsCache.Add(callID, timestamp, sessionExpires)
}

// GetExpiredSessions returns a list of sessions that have expired.
// Also marks expired sessions as terminated to prevent re-add by late SIP messages.
func (m *SessionManager) GetExpiredSessions() []*CallSession {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := timeutil.Now()
	var expired []*CallSession

	// Check top of heap
	for m.timeouts.Len() > 0 {
		session := (*m.timeouts)[0]

		// Lazy Heap Evaluation: verify the actual atomic expiration
		actualExpires := session.ExpiresAt()
		if actualExpires.After(now) {
			if session.heapExpiresAt.Before(actualExpires) {
				// The session was extended via lock-free update.
				// Push it later down the heap.
				session.heapExpiresAt = actualExpires
				heap.Fix(m.timeouts, session.heapIndex)
				continue
			}
			break // Top is genuinely not expired, so nothing else is
		}

		// Remove from heap
		heap.Pop(m.timeouts)

		// Remove from map and mark as terminated
		m.sessions.Delete(session.CallID)
		m.terminated.Store(session.CallID, timeutil.Now())

		expired = append(expired, session)
	}

	return expired
}

// RemoveSession removes a session (e.g., on BYE) and marks it as terminated
// to prevent re-addition by subsequent SIP messages (200 OK for BYE).
func (m *SessionManager) RemoveSession(callID string) {
	// Mark as terminated FIRST — prevents race with concurrent UpdateSession
	m.terminated.Store(callID, timeutil.Now())

	if val, ok := m.sessions.LoadAndDelete(callID); ok {
		session := val.(*CallSession)

		m.mu.Lock()
		if session.heapIndex != -1 {
			heap.Remove(m.timeouts, session.heapIndex)
		}
		m.mu.Unlock()
	}
	// Also remove from pending Redis updates
	m.tsCache.Remove(callID)
}

// IsTerminated checks if a call was already terminated (by BYE or session timeout).
// Used by RTP sniffer to avoid re-creating streams for dead calls.
func (m *SessionManager) IsTerminated(callID string) bool {
	_, ok := m.terminated.Load(callID)
	return ok
}

// ClearTerminated is intentionally a no-op.
// Tombstone 由 cleanupTerminatedLoop 按 TTL 统一清理 (默认 5 分钟),
// 防止 200 OK for BYE 后的 retransmit/ACK 重新添加 ghost session
// 导致 session_timeout 覆盖已正确完成的通话记录.
func (m *SessionManager) ClearTerminated(callID string) {
	// no-op: rely on TTL cleanup (cleanupTerminatedLoop)
}

// ReactivateSession clears the terminated flag for a session whose SIP timer expired but
// RTP is still actively flowing. Called ONLY from monitorTimeouts RTP-active guard.
func (m *SessionManager) ReactivateSession(callID string) {
	m.terminated.Delete(callID)
}

// SetTerminatedTime explicitly sets the terminated timestamp for a callID.
// Only used in tests to backdate entries for TTL cleanup testing.
func (m *SessionManager) SetTerminatedTime(callID string, t time.Time) {
	m.terminated.Store(callID, t)
}

// CleanupTerminatedTTL removes terminated entries older than the given TTL.
// Returns the number of entries removed. Called periodically as a safety net
// for calls where 200 OK never arrives.
func (m *SessionManager) CleanupTerminatedTTL(ttl time.Duration) int {
	now := timeutil.Now()
	removed := 0

	m.terminated.Range(func(key, value any) bool {
		ts := value.(time.Time)
		if now.Sub(ts) > ttl {
			m.terminated.Delete(key)
			removed++
		}
		return true
	})

	return removed
}

// cleanupTerminatedLoop periodically removes old terminated entries.
// ClearTerminated 已改 no-op，所有 terminated 条目均由本 loop 按 TTL 统一清理.
func (m *SessionManager) cleanupTerminatedLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			removed := m.CleanupTerminatedTTL(10 * time.Minute)
			if removed > 0 {
				log.Printf("[SessionManager] TTL cleanup: removed %d stale terminated entries", removed)
			}
		case <-m.stop:
			return
		}
	}
}

// batchUpdateRedis periodically writes cached timestamps to Redis
func (m *SessionManager) batchUpdateRedis() {
	interval := config.Global.GetInt("sniffer.redis_batch_interval_seconds")
	if interval <= 0 {
		interval = 10
	}
	ticker := time.NewTicker(time.Duration(interval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			batch := m.tsCache.Flush()
			if len(batch) == 0 {
				continue
			}

			// Use Redis pipeline
			if redis.Client == nil {
				continue
			}

			pipe := redis.Client.Pipeline()
			count := 0
			margin := m.margin
			if margin <= 0 {
				margin = 1.2
			}

			for callID, item := range batch {
				// TTL = SessionExpires * Margin
				ttl := time.Duration(float64(item.SessionExpires)*margin) * time.Second
				// Store as RFC3339Nano string
				pipe.Set(getCtx(), "call:last_msg:"+callID, item.Timestamp.Format(time.RFC3339Nano), ttl)
				count++
			}

			if count > 0 {
				_, err := pipe.Exec(getCtx())
				if err != nil {
					log.Printf("[SessionManager] Failed to batch update Redis: %v", err)
				} else {
					log.Printf("[SessionManager] Batched updated %d timestamps to Redis", count)
				}
			}

		case <-m.stop:
			return
		}
	}
}

// RebuildFromRedis reconstructs in-memory sessions from Redis on startup
func (m *SessionManager) RebuildFromRedis() error {
	if redis.Client == nil {
		return nil
	}

	// 1. Get all active call states
	// We need a way to get all active calls. We can use the 'active_calls' set.
	callIDs, err := redis.Client.SMembers(getCtx(), "active_calls").Result()
	if err != nil {
		return err
	}

	log.Printf("[SessionManager] Rebuilding sessions for %d active calls found in Redis", len(callIDs))

	now := timeutil.Now()
	rebuilt := 0
	cleaned := 0
	margin := m.margin
	if margin <= 0 {
		margin = 1.2
	}

	for _, callID := range callIDs {
		// Get state and last_msg timestamp in pipeline
		pipe := redis.Client.Pipeline()
		stateCmd := pipe.Get(getCtx(), "call:state:"+callID)
		lastMsgCmd := pipe.Get(getCtx(), "call:last_msg:"+callID)
		_, _ = pipe.Exec(getCtx()) // Ignore errors, handle individual results

		// R4-3 fix: single stateCmd.Bytes() call (was called twice: lines 329 and 338)
		stateBytes, err := stateCmd.Bytes()
		if err != nil {
			// State missing but in active_calls? Cleanup might be needed, or just ignore.
			continue
		}

		// Parse session_expires from Redis call state JSON.
		// Previously hardcoded to 300s, which overwrote the SIP-negotiated value.
		sessionExpires := 300 // default fallback
		var stateMap map[string]interface{}
		if json.Unmarshal(stateBytes, &stateMap) == nil {
			if se, ok := stateMap["session_expires"]; ok {
				switch v := se.(type) {
				case float64:
					if int(v) > 0 {
						sessionExpires = int(v)
					}
				}
			}
		}

		// Attempt to get last_msg time
		lastMsgStr, err := lastMsgCmd.Result()
		var lastMsg time.Time
		if err == nil && lastMsgStr != "" {
			lastMsg, _ = timeutil.ParseRFC3339(lastMsgStr)
		}

		if lastMsg.IsZero() {
			// Fallback: use current time - (SessionExpires/2)? Or just Now()?
			// If we lost the timestamp, assume connection is alive NOW to give it a chance?
			// OR check start_time from state.
			// Let's use Now() to accept it as "re-alive" and let it expire if no RTP.
			// Better: try to find start_time from state string roughly?
			lastMsg = now
		}

		// Calculate calculates expiration
		expiresAt := lastMsg.Add(time.Duration(float64(sessionExpires)*margin) * time.Second)

		if expiresAt.Before(now) {
			// Expired!
			log.Printf("[SessionManager] Call %s expired during downtime/restart", callID)
			// Clean up immediately by marking it terminated (so 200 OK BYE doesn't recreate it)
			// and NOT adding it to the sessions map or the timeout heap.
			m.terminated.Store(callID, now)

			// 从 active_calls Set 移除残留条目，防止 Dashboard 显示僵尸计数
			pipe := redis.Client.Pipeline()
			pipe.SRem(getCtx(), "active_calls", callID)
			pipe.Set(getCtx(), "active_calls:version", timeutil.Now().UnixMilli(), 0)
			pipe.Del(getCtx(), "call:state:"+callID)
			pipe.Del(getCtx(), "call:last_msg:"+callID)
			if _, err := pipe.Exec(getCtx()); err != nil {
				log.Printf("[SessionManager] Failed to cleanup expired call %s from Redis: %v", callID, err)
			}

			cleaned++
			continue // Skip adding to memory
		} else {
			rebuilt++
		}

		// Add to session manager
		session := &CallSession{
			CallID:         callID,
			SessionExpires: sessionExpires,
			LastSipMsgNano: lastMsg.UnixNano(),
			ExpiresAtNano:  expiresAt.UnixNano(),
			heapExpiresAt:  expiresAt,
			heapIndex:      -1,
		}

		m.sessions.Store(callID, session)
		m.mu.Lock()
		heap.Push(m.timeouts, session)
		m.mu.Unlock()
	}

	log.Printf("[SessionManager] Rebuild complete. Rebuilt: %d, Immediately Expired (will be cleaned): %d", rebuilt, cleaned)
	return nil
}
