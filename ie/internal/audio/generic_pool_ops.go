package audio

import (
	"log"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// drainAndClose waits for all active tasks to complete, then closes all connections.
// Maximum wait time is 30 seconds.
func (cp *GenericPool) drainAndClose() {
	cp.mu.Lock()
	cp.draining = true
	cp.taskDoneCh = make(chan struct{}, 100) // Buffered to avoid blocking Close()
	taskCount := len(cp.taskHandlers)
	cp.mu.Unlock()

	// Stop cleanup worker
	if cp.stopCh != nil {
		close(cp.stopCh)
	}

	log.Printf("[GenericPool] Draining old pool: %d active tasks", taskCount)

	// Wait for all tasks to complete (max 30s)
	deadline := time.After(30 * time.Second)
	for {
		cp.mu.RLock()
		remaining := len(cp.taskHandlers)
		cp.mu.RUnlock()

		if remaining == 0 {
			log.Printf("[GenericPool] All tasks drained, closing old pool")
			break
		}

		log.Printf("[GenericPool] Draining: %d tasks remaining...", remaining)

		select {
		case <-cp.taskDoneCh:
			// A task just completed, re-check count
			continue
		case <-deadline:
			log.Printf("[GenericPool] Drain timeout")
			goto forceClose
		}
	}

forceClose:
	// Force close all connections
	cp.mu.Lock()
	remaining := len(cp.taskHandlers)
	if remaining > 0 {
		log.Printf("[GenericPool] Timeout: force-closing %d remaining tasks", remaining)
	}
	for _, conn := range cp.connections {
		conn.mu.Lock()
		if conn.conn != nil {
			conn.conn.Close()
			conn.conn = nil
		}
		conn.state = StatePermanentlyFailed
		// Stop healthCheck goroutine
		if conn.cancel != nil {
			conn.cancel() // Idempotent
		}
		conn.mu.Unlock()
	}
	cp.connections = nil
	cp.taskHandlers = nil
	cp.mu.Unlock()

	log.Printf("[GenericPool] Old pool closed")
}

// notifyTaskDone signals drainAndClose that a task has completed.
func (cp *GenericPool) notifyTaskDone() {
	cp.mu.RLock()
	ch := cp.taskDoneCh
	cp.mu.RUnlock()
	if ch != nil {
		select {
		case ch <- struct{}{}:
		default:
			// Non-blocking
		}
	}
}

// checkAndCleanup checks if a specific temporary connection can be closed
func (cp *GenericPool) checkAndCleanup(connIdx int) {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	if len(cp.connections) <= cp.minPoolSize {
		return
	}

	// Find the connection
	var targetConn *GenericConnection
	targetIdx := -1
	for i, conn := range cp.connections {
		if conn.index == connIdx {
			targetConn = conn
			targetIdx = i
			break
		}
	}

	if targetConn != nil {
		targetConn.mu.Lock()
		if !targetConn.busy {
			// Close and remove
			log.Printf("[GenericPool] Closing idle temporary connection %d", connIdx)
			if targetConn.conn != nil {
				targetConn.conn.Close()
			}
			targetConn.mu.Unlock()

			// Remove from slice
			cp.connections = append(cp.connections[:targetIdx], cp.connections[targetIdx+1:]...)
		} else {
			targetConn.mu.Unlock()
		}
	}
}

// startCleanupWorker periodically cleans up idle temporary connections.
//
// Lock ordering convention: always acquire cp.mu BEFORE conn.mu.
// 锁层级: cp.mu -> conn.mu (避免死锁) — all other
// code paths must follow the same order to avoid deadlocks.
func (cp *GenericPool) startCleanupWorker() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-cp.stopCh:
			return
		case <-ticker.C:
			cp.mu.Lock()
			if len(cp.connections) <= cp.minPoolSize {
				cp.mu.Unlock()
				continue
			}

			now := timeutil.Now()
			indicesToRemove := make([]int, 0)

			// Find idle connections (idle for > 5 mins)
			for i, conn := range cp.connections {
				conn.mu.Lock()
				if !conn.busy && conn.state == StateConnected && now.Sub(conn.lastUsedTime) > 5*time.Minute {
					if len(cp.connections)-len(indicesToRemove) > cp.minPoolSize {
						indicesToRemove = append(indicesToRemove, i)
						log.Printf("[GenericPool] Connection %d has been idle for >5m, closing", conn.index)
						// N8 fix: use cancel() instead of conn.Close() to prevent readLoop
						// from triggering a reconnect that creates ghost connections.
						// readLoop's defer handles the actual WebSocket cleanup.
						conn.state = StatePermanentlyFailed
						if conn.cancel != nil {
							conn.cancel()
						}
					}
				}
				conn.mu.Unlock()
			}

			// Remove connections in reverse order so indices don't shift
			for i := len(indicesToRemove) - 1; i >= 0; i-- {
				idx := indicesToRemove[i]
				cp.connections = append(cp.connections[:idx], cp.connections[idx+1:]...)
			}
			cp.mu.Unlock()
		}
	}
}
