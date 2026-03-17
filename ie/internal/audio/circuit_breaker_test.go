package audio

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// cleanupPool cancels all connection contexts to stop background goroutines
// spawned by NewGenericPool → createConnection → go conn.connect().
// Without this, goroutines leak between tests and cause -race failures.
func cleanupPool(t *testing.T, pool *GenericPool) {
	t.Cleanup(func() {
		// Set draining first so connect() loop exits at isDraining check
		pool.mu.Lock()
		pool.draining = true
		for _, conn := range pool.connections {
			conn.cancel()
		}
		pool.mu.Unlock()
		// Brief sleep to let goroutines observe ctx cancellation and exit
		time.Sleep(50 * time.Millisecond)
	})
}

// TestNewTask_CircuitBreakerOpen_FastFail — CB=Open 时 NewTask 立即返回 error，不卡 5s
func TestNewTask_CircuitBreakerOpen_FastFail(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("test-vendor", protocol, 2, 5)
	cleanupPool(t, pool)

	// 手动设置 CB=Open
	pool.circuitBreakerMu.Lock()
	pool.circuitBreakerState = CircuitOpen
	pool.circuitBreakerMu.Unlock()

	start := time.Now()
	task, err := pool.NewTask(16000, "auto")
	elapsed := time.Since(start)

	assert.Nil(t, task)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "ASR_UNAVAILABLE")
	assert.Contains(t, err.Error(), "test-vendor")
	// 必须在 100ms 内返回，不能卡 5s
	assert.Less(t, elapsed, 100*time.Millisecond, "CB=Open should return immediately, not block for 5s")
}

// TestNewTask_CircuitBreakerClosed_AllowsThrough — CB=Closed 时 NewTask 正常进入连接逻辑
func TestNewTask_CircuitBreakerClosed_AllowsThrough(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("test-vendor", protocol, 1, 1)
	cleanupPool(t, pool)

	// CB=Closed (default), 但没有真实连接所以会失败 — 但不会被 CB 阻断
	_, err := pool.NewTask(16000, "auto")
	// 这里 err 来自 getConnectionAndMarkBusy 或 waitForConnection，不是 CB
	if err != nil {
		assert.NotContains(t, err.Error(), "ASR_UNAVAILABLE", "CB=Closed should not produce ASR_UNAVAILABLE error")
	}
}

// TestRecordConnectionFailure_OpensBreaker — 连续 3 次失败后 CB 状态变为 Open
func TestRecordConnectionFailure_OpensBreaker(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("fail-vendor", protocol, 1, 1)
	cleanupPool(t, pool)

	pool.circuitBreakerMu.RLock()
	assert.Equal(t, CircuitClosed, pool.circuitBreakerState)
	pool.circuitBreakerMu.RUnlock()

	// 前 2 次不应打开
	pool.recordConnectionFailure()
	pool.circuitBreakerMu.RLock()
	assert.Equal(t, CircuitClosed, pool.circuitBreakerState)
	assert.Equal(t, 1, pool.consecutiveFailures)
	pool.circuitBreakerMu.RUnlock()

	pool.recordConnectionFailure()
	pool.circuitBreakerMu.RLock()
	assert.Equal(t, CircuitClosed, pool.circuitBreakerState)
	assert.Equal(t, 2, pool.consecutiveFailures)
	pool.circuitBreakerMu.RUnlock()

	// 第 3 次 → Open
	pool.recordConnectionFailure()
	pool.circuitBreakerMu.RLock()
	assert.Equal(t, CircuitOpen, pool.circuitBreakerState)
	assert.Equal(t, 3, pool.consecutiveFailures)
	assert.False(t, pool.lastProbeTime.IsZero(), "lastProbeTime should be set when CB opens")
	pool.circuitBreakerMu.RUnlock()
}

// TestRecordConnectionSuccess_ClosesBreaker — 成功后 CB 从 Open 恢复到 Closed
func TestRecordConnectionSuccess_ClosesBreaker(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("recover-vendor", protocol, 1, 1)
	cleanupPool(t, pool)

	// 先打开 CB
	pool.circuitBreakerMu.Lock()
	pool.circuitBreakerState = CircuitOpen
	pool.consecutiveFailures = 5
	pool.circuitBreakerMu.Unlock()

	pool.recordConnectionSuccess()

	pool.circuitBreakerMu.RLock()
	assert.Equal(t, CircuitClosed, pool.circuitBreakerState)
	assert.Equal(t, 0, pool.consecutiveFailures)
	pool.circuitBreakerMu.RUnlock()
}

// TestRecordConnectionSuccess_FromHalfOpen — HalfOpen 成功后恢复 Closed
func TestRecordConnectionSuccess_FromHalfOpen(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("probe-vendor", protocol, 1, 1)
	cleanupPool(t, pool)

	pool.circuitBreakerMu.Lock()
	pool.circuitBreakerState = CircuitHalfOpen
	pool.consecutiveFailures = 3
	pool.circuitBreakerMu.Unlock()

	pool.recordConnectionSuccess()

	pool.circuitBreakerMu.RLock()
	assert.Equal(t, CircuitClosed, pool.circuitBreakerState)
	assert.Equal(t, 0, pool.consecutiveFailures)
	pool.circuitBreakerMu.RUnlock()
}

// TestRecordConnectionFailure_IdempotentOpen — CB 已经 Open 时重复失败不会重复打开
func TestRecordConnectionFailure_IdempotentOpen(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("test-vendor", protocol, 1, 1)

	// 手动设为 Open
	pool.circuitBreakerMu.Lock()
	pool.circuitBreakerState = CircuitOpen
	pool.consecutiveFailures = 3
	firstProbeTime := time.Now().Add(-10 * time.Second)
	pool.lastProbeTime = firstProbeTime
	pool.circuitBreakerMu.Unlock()

	// 再次失败不应更新 lastProbeTime
	pool.recordConnectionFailure()
	// Read under lock — background connect() goroutine can write via shouldAttemptConnection
	pool.circuitBreakerMu.RLock()
	state := pool.circuitBreakerState
	probeTime := pool.lastProbeTime
	pool.circuitBreakerMu.RUnlock()
	assert.Equal(t, CircuitOpen, state)
	assert.Equal(t, firstProbeTime, probeTime, "lastProbeTime should not change when CB is already Open")
}

// TestNewTask_FailureCountsTowardBreaker — NewTask 中 getConnectionAndMarkBusy 失败会计入 CB
func TestNewTask_FailureCountsTowardBreaker(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("no-conn-vendor", protocol, 1, 1)
	cleanupPool(t, pool)
	// 不注入任何连接，getConnectionAndMarkBusy 会失败

	for i := 0; i < 3; i++ {
		_, _ = pool.NewTask(16000, "auto")
	}

	// 3 次失败后 CB 应该 Open
	pool.circuitBreakerMu.RLock()
	state := pool.circuitBreakerState
	failures := pool.consecutiveFailures
	pool.circuitBreakerMu.RUnlock()

	assert.Equal(t, CircuitOpen, state, "CB should be Open after 3 NewTask failures")
	assert.GreaterOrEqual(t, failures, 3)
}

// TestNewTask_ConcurrentCircuitBreakerSafety — 并发调用 NewTask 时 CB 检查无 race
func TestNewTask_ConcurrentCircuitBreakerSafety(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("race-vendor", protocol, 2, 5)
	cleanupPool(t, pool)

	pool.circuitBreakerMu.Lock()
	pool.circuitBreakerState = CircuitOpen
	pool.circuitBreakerMu.Unlock()

	var wg sync.WaitGroup
	errors := make([]error, 100)

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, err := pool.NewTask(16000, "auto")
			errors[idx] = err
		}(i)
	}

	wg.Wait()

	// 所有调用都应该立即失败
	for i, err := range errors {
		assert.Error(t, err, "Call %d should fail", i)
		assert.Contains(t, err.Error(), "ASR_UNAVAILABLE")
	}
}

// TestNewTask_WaitForConnectionFailure_CountsTowardBreaker — waitForConnection 超时也计入 CB
func TestNewTask_WaitForConnectionFailure_CountsTowardBreaker(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("timeout-vendor", protocol, 1, 1)
	cleanupPool(t, pool)

	// 注入一个永远不 ready 的连接
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	conn := &GenericConnection{
		pool:    pool,
		state:   StateFailed, // 永不变成 Connected
		readyCh: make(chan struct{}),
		ctx:     ctx,
		cancel:  cancel,
	}
	pool.mu.Lock()
	pool.connections = append(pool.connections, conn)
	pool.mu.Unlock()

	// waitForConnection 会超时 — 但为了测试速度不等完整 5s
	// recordConnectionFailure 应该被调用一次
	pool.circuitBreakerMu.RLock()
	before := pool.consecutiveFailures
	pool.circuitBreakerMu.RUnlock()
	_, err := pool.NewTask(16000, "auto")
	assert.Error(t, err)
	pool.circuitBreakerMu.RLock()
	assert.Greater(t, pool.consecutiveFailures, before, "Failed waitForConnection should increment failure count")
	pool.circuitBreakerMu.RUnlock()
}

// TestStats_ReflectsCircuitBreakerState — Stats() 正确反映 CB 状态
func TestStats_ReflectsCircuitBreakerState(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("stats-vendor", protocol, 1, 1)
	cleanupPool(t, pool)

	stats := pool.Stats()
	assert.Equal(t, "closed", stats.CircuitBreaker)

	pool.circuitBreakerMu.Lock()
	pool.circuitBreakerState = CircuitOpen
	pool.circuitBreakerMu.Unlock()

	stats = pool.Stats()
	assert.Equal(t, "open", stats.CircuitBreaker)

	pool.circuitBreakerMu.Lock()
	pool.circuitBreakerState = CircuitHalfOpen
	pool.circuitBreakerMu.Unlock()

	stats = pool.Stats()
	assert.Equal(t, "half_open", stats.CircuitBreaker)
}

// TestNewTask_CircuitBreakerOpen_ErrorMessageFormat — error 包含 vendor 名称便于诊断
func TestNewTask_CircuitBreakerOpen_ErrorMessageFormat(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("dashscope", protocol, 1, 1)
	cleanupPool(t, pool)

	pool.circuitBreakerMu.Lock()
	pool.circuitBreakerState = CircuitOpen
	pool.circuitBreakerMu.Unlock()

	_, err := pool.NewTask(16000, "auto")
	assert.Error(t, err)
	// 格式: [ASR_UNAVAILABLE] vendor 'dashscope' circuit breaker open
	assert.True(t, strings.HasPrefix(err.Error(), "[ASR_UNAVAILABLE]"), "Error should start with [ASR_UNAVAILABLE] prefix")
	assert.Contains(t, err.Error(), "'dashscope'", "Error should contain vendor name in quotes")
}
