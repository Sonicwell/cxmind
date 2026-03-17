package audio

import (
	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"

	"context"
	"encoding/hex"
	"fmt"
	"log"
	"math/rand/v2"
	"sync"
	"sync/atomic"
	"time"

	"github.com/cxmind/ingestion-go/internal/metrics"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// GenericPool manages multiple WebSocket connections for a specific vendor protocol
type GenericPool struct {
	vendor       string
	protocol     StreamProtocol
	connections  []*GenericConnection
	taskHandlers map[string]*GenericTaskHandler
	mu           sync.RWMutex
	minPoolSize  int
	maxPoolSize  int

	// Circuit breaker for coordinated reconnection
	circuitBreakerState CircuitState
	circuitBreakerMu    sync.RWMutex
	lastProbeTime       time.Time
	probeInterval       time.Duration
	consecutiveFailures int

	// Hot reload support
	draining   bool
	stopCh     chan struct{}
	taskDoneCh chan struct{}
}

// GenericConnection represents a single WebSocket connection in the pool
type GenericConnection struct {
	conn         *websocket.Conn
	state        ConnectionState
	mu           sync.Mutex
	reconnecting bool
	index        int
	pool         *GenericPool
	busy         bool
	isTemporary  bool
	ctx          context.Context
	cancel       context.CancelFunc
	readyCh      chan struct{}
	readyOnce    sync.Once

	lastPingTime time.Time
	lastRTT      time.Duration
	rttMu        sync.RWMutex
	pongWait     time.Duration // ReadDeadline for idle connections, set in connect()

	reconnectAttempts  int
	lastReconnectTime  time.Time
	lastUsedTime       time.Time
	healthCheckRunning int32
}

// SafeWriteMessage prevents TCP window / WSS congestion from hanging the goroutine and deadlocking Mutex.
func (pc *GenericConnection) SafeWriteMessage(messageType int, data []byte) error {
	pc.mu.Lock()
	conn := pc.conn
	pc.mu.Unlock()

	if conn == nil {
		return fmt.Errorf("connection is nil")
	}

	// 5 seconds timeout to drain into OS buffers
	if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return fmt.Errorf("failed to set write deadline: %w", err)
	}

	pc.mu.Lock()
	defer pc.mu.Unlock()
	return pc.conn.WriteMessage(messageType, data)
}

// GenericTaskHandler manages a single ASR task on a generic connection
type GenericTaskHandler struct {
	taskID       string
	conn         *GenericConnection
	results      chan TranscriptionResult
	errors       chan error
	done         chan struct{}
	closeOnce    sync.Once
	lastResult   TranscriptionResult
	lastResultMu sync.Mutex
}

// TaskID returns the handler's task ID
func (h *GenericTaskHandler) TaskID() string {
	return h.taskID
}

// NewGenericPool creates a new generic connection pool for the given protocol
func NewGenericPool(vendor string, protocol StreamProtocol, minSize, maxSize int) *GenericPool {
	if minSize <= 0 {
		minSize = 5
	}
	if maxSize <= 0 {
		maxSize = 1000
	}
	if minSize > maxSize {
		minSize = maxSize
	}

	log.Printf("[GenericPool] Initializing '%s' pool with %d min connections", vendor, minSize)

	pool := &GenericPool{
		vendor:              vendor,
		protocol:            protocol,
		connections:         make([]*GenericConnection, 0, minSize),
		taskHandlers:        make(map[string]*GenericTaskHandler),
		minPoolSize:         minSize,
		maxPoolSize:         maxSize,
		circuitBreakerState: CircuitClosed,
		lastProbeTime:       timeutil.Now(),
		stopCh:              make(chan struct{}),
	}

	// Create min pool connections
	for i := 0; i < minSize; i++ {
		pool.createConnection(i, false)
	}

	return pool
}

func (cp *GenericPool) createConnection(index int, isTemp bool) *GenericConnection {
	ctx, cancel := context.WithCancel(context.Background())
	conn := &GenericConnection{
		index:       index,
		pool:        cp,
		state:       StateFailed, // Initially failed until connected
		isTemporary: isTemp,
		readyCh:     make(chan struct{}),
		ctx:         ctx,
		cancel:      cancel,
	}
	cp.mu.Lock()
	cp.connections = append(cp.connections, conn)
	cp.mu.Unlock()

	// In real environment, we would start connection here.
	go conn.connect()
	return conn
}

// Stats returns a snapshot of the pool's current state
func (cp *GenericPool) Stats() PoolStats {
	cp.mu.RLock()
	stats := PoolStats{
		MinSize:     cp.minPoolSize,
		MaxSize:     cp.maxPoolSize,
		CurrentSize: len(cp.connections),
		ActiveTasks: len(cp.taskHandlers),
		Draining:    cp.draining,
	}
	conns := cp.connections
	cp.mu.RUnlock()

	cp.circuitBreakerMu.RLock()
	switch cp.circuitBreakerState {
	case CircuitClosed:
		stats.CircuitBreaker = "closed"
	case CircuitOpen:
		stats.CircuitBreaker = "open"
	case CircuitHalfOpen:
		stats.CircuitBreaker = "half_open"
	}
	cp.circuitBreakerMu.RUnlock()

	for _, conn := range conns {
		conn.mu.Lock()
		switch conn.state {
		case StateConnected:
			stats.Connected++
		case StateReconnecting:
			stats.Reconnecting++
		case StateFailed:
			stats.Failed++
		case StatePermanentlyFailed:
			stats.PermanentlyFailed++
		}
		if conn.busy {
			stats.Busy++
		}
		conn.mu.Unlock()
	}

	return stats
}

func (conn *GenericConnection) waitForConnection(timeout time.Duration) error {
	select {
	case <-conn.readyCh:
		conn.mu.Lock()
		state := conn.state
		conn.mu.Unlock()
		if state != StateConnected {
			return fmt.Errorf("connection failed")
		}
		return nil
	case <-time.After(timeout):
		return fmt.Errorf("connection timeout after %v", timeout)
	case <-conn.ctx.Done():
		return fmt.Errorf("connection context cancelled")
	}
}

// getConnectionAndMarkBusy finds or creates a connection and marks it busy
func (cp *GenericPool) getConnectionAndMarkBusy() (*GenericConnection, error) {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	for _, conn := range cp.connections {
		conn.mu.Lock()
		if conn.state == StateConnected && !conn.busy {
			conn.busy = true
			conn.lastUsedTime = timeutil.Now()
			conn.mu.Unlock()
			return conn, nil
		}
		conn.mu.Unlock()
	}

	if len(cp.connections) >= cp.maxPoolSize {
		return nil, fmt.Errorf("connection pool exhausted (max size %d reached)", cp.maxPoolSize)
	}

	newIdx := 0
	if len(cp.connections) > 0 {
		newIdx = cp.connections[len(cp.connections)-1].index + 1
	}

	log.Printf("[GenericPool] Pool exhausted, creating temporary connection %d", newIdx)

	ctx, cancel := context.WithCancel(context.Background())
	conn := &GenericConnection{
		index:        newIdx,
		pool:         cp,
		state:        StateFailed,
		isTemporary:  true,
		busy:         true,
		lastUsedTime: timeutil.Now(),
		readyCh:      make(chan struct{}),
		ctx:          ctx,
		cancel:       cancel,
	}
	cp.connections = append(cp.connections, conn)

	go conn.connect()

	return conn, nil
}

// NewTask creates a new ASR task on an available connection
func (cp *GenericPool) NewTask(sampleRate int, language string) (*GenericTaskHandler, error) {
	// 快速失败: vendor 不可用时不占 worker 等 5s
	cp.circuitBreakerMu.RLock()
	cbState := cp.circuitBreakerState
	cp.circuitBreakerMu.RUnlock()
	if cbState == CircuitOpen {
		return nil, fmt.Errorf("[ASR_UNAVAILABLE] vendor '%s' circuit breaker open", cp.vendor)
	}

	connectStart := timeutil.Now()
	defer func() {
		metrics.ASRConnectDuration.Observe(time.Since(connectStart).Seconds())
	}()

	conn, err := cp.getConnectionAndMarkBusy()
	if err != nil {
		cp.recordConnectionFailure()
		return nil, err
	}

	if err := conn.waitForConnection(5 * time.Second); err != nil {
		conn.mu.Lock()
		conn.busy = false
		conn.mu.Unlock()
		cp.recordConnectionFailure()
		return nil, err
	}

	uuidBytes := uuid.New()
	taskID := hex.EncodeToString(uuidBytes[:])[0:32]

	handler := &GenericTaskHandler{
		taskID:  taskID,
		conn:    conn,
		results: make(chan TranscriptionResult, 10),
		errors:  make(chan error, 1),
		done:    make(chan struct{}),
	}

	cp.mu.Lock()
	cp.taskHandlers[taskID] = handler
	cp.mu.Unlock()

	startFrame, err := cp.protocol.StartTaskFrame(taskID, sampleRate, language)
	if err != nil {
		conn.mu.Lock()
		conn.busy = false
		conn.mu.Unlock()
		return nil, fmt.Errorf("failed to create start frame: %v", err)
	}

	if startFrame != nil {
		// conn.mu 只用于检查 conn.conn 是否为 nil, 必须在调用 SafeWriteMessage 前释放
		// SafeWriteMessage 内部有自己的 conn.mu 锁, Go Mutex 不可重入, 否则永久死锁
		conn.mu.Lock()
		if conn.conn == nil {
			conn.busy = false
			conn.mu.Unlock()
			return nil, fmt.Errorf("connection not available")
		}
		conn.mu.Unlock()

		if err := conn.SafeWriteMessage(websocket.TextMessage, startFrame); err != nil {
			conn.mu.Lock()
			conn.busy = false
			conn.mu.Unlock()
			return nil, fmt.Errorf("failed to send start frame: %v", err)
		}
	}

	log.Printf("[GenericPool] Started task %s on connection %d", taskID, conn.index)

	return handler, nil
}

// handleMessage processes a message for this task using the protocol's ParseMessage
func (th *GenericTaskHandler) handleMessage(message []byte) {
	event, err := th.conn.pool.protocol.ParseMessage(message)
	if err != nil {
		log.Printf("[Task %s] Failed to parse message: %v", th.taskID, err)
		return
	}

	if event == nil || event.Type == EventUnknown {
		return
	}

	if event.Type == EventTaskFailed {
		log.Printf("[Task %s] Task failed: %s", th.taskID, event.Error)
		select {
		case th.errors <- fmt.Errorf("task failed: %s", event.Error):
		case <-th.done:
		}
		return
	}

	if event.Type == EventTaskFinished {
		// StopTaskFrame closed the channel basically
		select {
		case <-th.done:
		default:
			close(th.done)
		}
		return
	}

	if event.Type == EventInterim || event.Type == EventFinal {
		text := event.Text
		if text != "" {
			th.conn.rttMu.RLock()
			currentRTT := th.conn.lastRTT
			th.conn.rttMu.RUnlock()

			result := TranscriptionResult{
				Text:        text,
				Timestamp:   timeutil.Now(),
				Confidence:  event.Confidence,
				IsFinal:     event.Type == EventFinal,
				RTTMs:       currentRTT.Milliseconds(),
				StartTimeMs: event.BeginTime,
				EndTimeMs:   event.EndTime,
			}

			th.lastResultMu.Lock()
			th.lastResult = result
			th.lastResultMu.Unlock()

			select {
			case th.results <- result:
			case <-th.done:
			}
		}
	}
}

// Results returns the results channel
func (th *GenericTaskHandler) Results() <-chan TranscriptionResult {
	return th.results
}

// Errors returns the errors channel
func (th *GenericTaskHandler) Errors() <-chan error {
	return th.errors
}

// Close closes the task
func (th *GenericTaskHandler) Close() error {
	th.closeOnce.Do(func() {
		stopFrame, err := th.conn.pool.protocol.StopTaskFrame(th.taskID)
		if err != nil {
			log.Printf("[Task %s] Failed to create stop frame: %v", th.taskID, err)
		}

		th.conn.mu.Lock()
		if th.conn.conn != nil && stopFrame != nil {
			// use SafeWriteMessage which doesn't permanently hold locks during network I/O
			th.conn.mu.Unlock()
			th.conn.SafeWriteMessage(websocket.TextMessage, stopFrame)
			th.conn.mu.Lock()
		}
		isTemp := th.conn.isTemporary
		connIdx := th.conn.index
		th.conn.mu.Unlock()

		select {
		case <-th.done:
		case <-time.After(2 * time.Second):
			log.Printf("[GenericPool-%d] Close timeout for task %s, proceeding", connIdx, th.taskID)
		}

		th.conn.pool.mu.Lock()
		delete(th.conn.pool.taskHandlers, th.taskID)
		th.conn.pool.mu.Unlock()

		// Notify drainAndClose that a task has completed
		th.conn.pool.notifyTaskDone()

		th.conn.mu.Lock()
		th.conn.busy = false
		th.conn.mu.Unlock()

		if isTemp {
			go th.conn.pool.checkAndCleanup(connIdx)
		}

		th.lastResultMu.Lock()
		finalRes := th.lastResult
		th.lastResultMu.Unlock()

		if finalRes.Text != "" && !finalRes.IsFinal {
			log.Printf("[GenericPool-%d] Forcing final result for task %s", connIdx, th.taskID)
			finalRes.IsFinal = true
			finalRes.Timestamp = timeutil.Now()

			select {
			case th.results <- finalRes:
			case <-time.After(100 * time.Millisecond):
			}
		}

		select {
		case <-th.done:
		default:
			close(th.done)
		}

		log.Printf("[GenericPool-%d] Closed task %s", connIdx, th.taskID)
	})
	return nil
}

// calculateBackoffDelay calculates exponential backoff delay with jitter
func (pc *GenericConnection) calculateBackoffDelay(attempt int) time.Duration {
	baseDelay := config.Global.GetInt(fmt.Sprintf("asr.%s.reconnect_base_delay_seconds", pc.pool.vendor))
	if baseDelay <= 0 {
		baseDelay = 5
	}
	maxDelay := config.Global.GetInt(fmt.Sprintf("asr.%s.reconnect_max_delay_seconds", pc.pool.vendor))
	if maxDelay <= 0 {
		maxDelay = 60
	}
	maxJitter := config.Global.GetInt(fmt.Sprintf("asr.%s.reconnect_jitter_ms", pc.pool.vendor))
	if maxJitter <= 0 {
		maxJitter = 1000
	}

	delay := baseDelay
	for i := 1; i < attempt; i++ {
		delay *= 2
		if delay >= maxDelay {
			delay = maxDelay
			break
		}
	}

	jitter := time.Duration(rand.IntN(maxJitter)) * time.Millisecond
	return time.Duration(delay)*time.Second + jitter
}

// shouldAttemptConnection checks if this connection should attempt to connect
func (cp *GenericPool) shouldAttemptConnection(connIndex int) bool {
	cp.circuitBreakerMu.RLock()
	state := cp.circuitBreakerState
	lastProbe := cp.lastProbeTime
	cp.circuitBreakerMu.RUnlock()

	switch state {
	case CircuitClosed:
		return true
	case CircuitOpen:
		probeInterval := cp.getProbeInterval()
		if time.Since(lastProbe) >= probeInterval {
			cp.circuitBreakerMu.Lock()
			cp.circuitBreakerState = CircuitHalfOpen
			cp.lastProbeTime = timeutil.Now()
			cp.circuitBreakerMu.Unlock()
			return connIndex == 0
		}
		return false
	case CircuitHalfOpen:
		return connIndex == 0
	default:
		return true
	}
}

func (cp *GenericPool) recordConnectionFailure() {
	cp.circuitBreakerMu.Lock()
	defer cp.circuitBreakerMu.Unlock()

	cp.consecutiveFailures++
	if cp.consecutiveFailures >= 3 && cp.circuitBreakerState != CircuitOpen {
		log.Printf("[WARNING] ASR vendor '%s' UNAVAILABLE — circuit breaker opened after %d consecutive failures", cp.vendor, cp.consecutiveFailures)
		cp.circuitBreakerState = CircuitOpen
		cp.lastProbeTime = timeutil.Now()
		go setVendorUnavailable(cp.vendor, 30*time.Second)
	}
}

func (cp *GenericPool) recordConnectionSuccess() {
	cp.circuitBreakerMu.Lock()
	defer cp.circuitBreakerMu.Unlock()

	cp.consecutiveFailures = 0
	if cp.circuitBreakerState != CircuitClosed {
		log.Printf("[INFO] ASR vendor '%s' recovered — circuit breaker closed", cp.vendor)
		cp.circuitBreakerState = CircuitClosed
		go clearVendorUnavailable(cp.vendor)
	}
}

func (cp *GenericPool) getProbeInterval() time.Duration {
	if cp.probeInterval == 0 {
		baseDelay := config.Global.GetInt(fmt.Sprintf("asr.%s.reconnect_base_delay_seconds", cp.vendor))
		if baseDelay <= 0 {
			baseDelay = 5
		}
		return time.Duration(baseDelay) * time.Second
	}
	return cp.probeInterval
}

func (pc *GenericConnection) connect() {
	pc.mu.Lock()
	if pc.reconnecting || pc.state == StatePermanentlyFailed {
		pc.mu.Unlock()
		return
	}
	pc.reconnecting = true
	pc.reconnectAttempts = 0
	pc.mu.Unlock()

	defer func() {
		pc.mu.Lock()
		pc.reconnecting = false
		pc.mu.Unlock()
	}()

	for {
		pc.pool.mu.RLock()
		isDraining := pc.pool.draining
		pc.pool.mu.RUnlock()
		if isDraining {
			return
		}

		select {
		case <-pc.ctx.Done():
			return
		default:
		}

		if !pc.pool.shouldAttemptConnection(pc.index) {
			delay := pc.pool.getProbeInterval()
			select {
			case <-pc.ctx.Done():
				return
			case <-time.After(delay):
			}
			continue
		}

		pc.mu.Lock()
		pc.reconnectAttempts++
		attempts := pc.reconnectAttempts
		pc.mu.Unlock()

		log.Printf("[GenericPool-%d] Connecting... (attempt %d)", pc.index, attempts)

		endpoint := pc.pool.protocol.Endpoint()
		headers := pc.pool.protocol.AuthHeaders()

		conn, resp, err := websocket.DefaultDialer.Dial(endpoint, headers)
		if err != nil {
			if resp != nil {
				log.Printf("[WARNING] [GenericPool-%d] vendor='%s' connection failed: HTTP %d, endpoint=%s (attempt %d)",
					pc.index, pc.pool.vendor, resp.StatusCode, endpoint, attempts)
				if resp.StatusCode == 401 || resp.StatusCode == 403 {
					log.Printf("[WARNING] [GenericPool-%d] vendor='%s' auth failed permanently (HTTP %d)",
						pc.index, pc.pool.vendor, resp.StatusCode)
					pc.mu.Lock()
					pc.state = StatePermanentlyFailed
					pc.mu.Unlock()
					return
				}
			} else {
				log.Printf("[WARNING] [GenericPool-%d] vendor='%s' connection failed: %v, endpoint=%s (attempt %d)",
					pc.index, pc.pool.vendor, err, endpoint, attempts)
			}

			pc.pool.recordConnectionFailure()

			pc.mu.Lock()
			pc.state = StateFailed
			pc.mu.Unlock()

			delay := pc.calculateBackoffDelay(attempts)
			select {
			case <-pc.ctx.Done():
				return
			case <-time.After(delay):
			}
			continue
		}

		pc.pool.recordConnectionSuccess()
		log.Printf("[GenericPool-%d] Connected successfully", pc.index)

		// Calculate pongWait: 2x healthCheck interval (gorilla/websocket best practice)
		hcInterval := config.Global.GetInt(fmt.Sprintf("asr.%s.health_check_interval_seconds", pc.pool.vendor))
		if hcInterval <= 0 {
			hcInterval = 30
		}

		pc.mu.Lock()
		pc.conn = conn
		pc.state = StateConnected
		pc.reconnectAttempts = 0
		pc.lastReconnectTime = timeutil.Now()
		pc.lastUsedTime = timeutil.Now()
		pc.pongWait = time.Duration(hcInterval) * 2 * time.Second
		pc.readyOnce.Do(func() { close(pc.readyCh) })
		pc.mu.Unlock()

		conn.SetPongHandler(func(appData string) error {
			// Pong received = connection alive, extend ReadDeadline
			conn.SetReadDeadline(time.Now().Add(pc.pongWait))
			pc.mu.Lock()
			if !pc.lastPingTime.IsZero() {
				pc.rttMu.Lock()
				pc.lastRTT = time.Since(pc.lastPingTime)
				pc.rttMu.Unlock()
			}
			pc.mu.Unlock()
			return nil
		})

		go pc.readLoop()
		go pc.healthCheck()

		return
	}
}

func (pc *GenericConnection) readLoop() {
	defer func() {
		log.Printf("[GenericPool-%d] Read loop ended", pc.index)
		pc.mu.Lock()
		if pc.conn != nil {
			pc.conn.Close()
			pc.conn = nil
		}
		shouldReconnect := pc.state != StatePermanentlyFailed
		if shouldReconnect {
			pc.state = StateFailed
		}
		pc.busy = false
		pc.readyCh = make(chan struct{})
		pc.readyOnce = sync.Once{}
		pc.reconnectAttempts = 0
		pc.mu.Unlock()

		pc.pool.mu.RLock()
		isDraining := pc.pool.draining
		pc.pool.mu.RUnlock()

		if shouldReconnect && !isDraining {
			go pc.connect()
		}
	}()

	for {
		pc.mu.Lock()
		conn := pc.conn
		pc.mu.Unlock()

		if conn == nil {
			return
		}

		// Prevent infinite read blocking if server goes unresponsive.
		// pongWait = 2x healthCheck interval (default 60s), reset by PongHandler on pong.
		conn.SetReadDeadline(time.Now().Add(pc.pongWait))
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Printf("[WARNING] [GenericPool-%d] vendor='%s' read error: %v", pc.index, pc.pool.vendor, err)
			return
		}

		// Use the protocol adapter to parse the message
		event, err := pc.pool.protocol.ParseMessage(message)
		if err != nil || event == nil {
			continue
		}

		taskID := event.TaskID
		if taskID == "" {
			continue
		}

		pc.pool.mu.RLock()
		handler, exists := pc.pool.taskHandlers[taskID]
		pc.pool.mu.RUnlock()

		if !exists {
			continue
		}

		handler.handleMessage(message)
	}
}

func (pc *GenericConnection) healthCheck() {
	if !atomic.CompareAndSwapInt32(&pc.healthCheckRunning, 0, 1) {
		return
	}
	defer atomic.StoreInt32(&pc.healthCheckRunning, 0)

	interval := config.Global.GetInt(fmt.Sprintf("asr.%s.health_check_interval_seconds", pc.pool.vendor))
	if interval <= 0 {
		interval = 30
	}

	ticker := time.NewTicker(time.Duration(interval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-pc.ctx.Done():
			return
		case <-ticker.C:
			pc.mu.Lock()
			conn := pc.conn
			state := pc.state
			pc.mu.Unlock()

			if state != StateConnected || conn == nil {
				continue
			}

			pc.mu.Lock()
			pc.lastPingTime = timeutil.Now()
			pc.mu.Unlock()

			if err := conn.WriteControl(websocket.PingMessage, []byte{}, timeutil.Now().Add(5*time.Second)); err != nil {
				log.Printf("[GenericPool-%d] Ping failed: %v", pc.index, err)
				conn.Close() // readLoop captures this and reconnects
			}
		}
	}
}
