package audio

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// MockStreamProtocol is a mock implementation of StreamProtocol for testing GenericPool
type MockStreamProtocol struct {
	endpoint        string
	authHeaders     http.Header
	sendAudioBinary bool

	startCalls int
	stopCalls  int
	parseCalls int

	mu sync.Mutex
}

func NewMockStreamProtocol() *MockStreamProtocol {
	return &MockStreamProtocol{
		endpoint:        "ws://localhost:8080/mock",
		authHeaders:     http.Header{"Authorization": []string{"Bearer mock-token"}},
		sendAudioBinary: true,
	}
}

func (m *MockStreamProtocol) Endpoint() string { return m.endpoint }

func (m *MockStreamProtocol) AuthHeaders() http.Header { return m.authHeaders }

func (m *MockStreamProtocol) StartTaskFrame(taskID string, sampleRate int, language string) ([]byte, error) {
	m.mu.Lock()
	m.startCalls++
	m.mu.Unlock()

	frame := map[string]interface{}{"action": "start", "task_id": taskID}
	return json.Marshal(frame)
}

func (m *MockStreamProtocol) StopTaskFrame(taskID string) ([]byte, error) {
	m.mu.Lock()
	m.stopCalls++
	m.mu.Unlock()

	frame := map[string]interface{}{"action": "stop", "task_id": taskID}
	return json.Marshal(frame)
}

// In our mock, the message is exactly the JSON serialization of StreamEvent
func (m *MockStreamProtocol) ParseMessage(message []byte) (*StreamEvent, error) {
	m.mu.Lock()
	m.parseCalls++
	m.mu.Unlock()

	var event StreamEvent
	if err := json.Unmarshal(message, &event); err != nil {
		return nil, err
	}
	return &event, nil
}

func (m *MockStreamProtocol) SendAudioAsBinary() bool { return m.sendAudioBinary }

// TestGenericPool_Initialization tests that a pool initializes with correct size
func TestGenericPool_Initialization(t *testing.T) {
	protocol := NewMockStreamProtocol()

	// Create a generic pool without actually connecting (we mock the dialer later, or just test structure)
	pool := NewGenericPool("test-vendor", protocol, 5, 10)
	cleanupPool(t, pool)

	assert.Equal(t, "test-vendor", pool.vendor)
	assert.Equal(t, 5, pool.minPoolSize)
	assert.Equal(t, 10, pool.maxPoolSize)

	stats := pool.Stats()
	assert.Equal(t, 5, stats.MinSize)
	assert.Equal(t, 10, stats.MaxSize)
	assert.Equal(t, "closed", stats.CircuitBreaker)
}

func TestGenericTaskHandler_HandleMessage(t *testing.T) {
	protocol := NewMockStreamProtocol()
	pool := NewGenericPool("test-vendor", protocol, 1, 1)
	cleanupPool(t, pool)

	// Inject a mocked connection that is ready
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	conn := &GenericConnection{
		pool:    pool,
		state:   StateConnected, // Mock it as connected
		readyCh: make(chan struct{}),
		ctx:     ctx,
		cancel:  cancel,
	}
	close(conn.readyCh)

	pool.connections = append(pool.connections, conn)

	// Create a task handler directly to bypass full WebSocket dialing (which we don't need for event parsing logic)
	handler := &GenericTaskHandler{
		taskID:  "task-123",
		conn:    conn,
		results: make(chan TranscriptionResult, 10),
		errors:  make(chan error, 1),
		done:    make(chan struct{}),
	}

	pool.mu.Lock()
	pool.taskHandlers["task-123"] = handler
	pool.mu.Unlock()

	// 1. Test Interim Result
	interimEvent := StreamEvent{
		TaskID:     "task-123",
		Type:       EventInterim,
		Text:       "hello",
		Confidence: 0.8,
		BeginTime:  100,
		EndTime:    500,
	}
	msg, _ := json.Marshal(interimEvent)
	handler.handleMessage(msg)

	// Verify interim result was pushed
	select {
	case res := <-handler.Results():
		assert.Equal(t, "hello", res.Text)
		assert.False(t, res.IsFinal)
		assert.Equal(t, 0.8, res.Confidence)
		assert.Equal(t, int64(100), res.StartTimeMs)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("timeout waiting for interim result")
	}

	// 2. Test Final Result
	finalEvent := StreamEvent{
		TaskID:     "task-123",
		Type:       EventFinal,
		Text:       "hello world",
		Confidence: 0.95,
		BeginTime:  100,
		EndTime:    900,
	}
	msg, _ = json.Marshal(finalEvent)
	handler.handleMessage(msg)

	// Verify final result was pushed
	select {
	case res := <-handler.Results():
		assert.Equal(t, "hello world", res.Text)
		assert.True(t, res.IsFinal)
		assert.Equal(t, 0.95, res.Confidence)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("timeout waiting for final result")
	}

	// 3. Test Task Failed
	errEvent := StreamEvent{
		TaskID: "task-123",
		Type:   EventTaskFailed,
		Error:  "invalid audio format",
	}
	msg, _ = json.Marshal(errEvent)
	handler.handleMessage(msg)

	// Verify error was pushed
	select {
	case err := <-handler.Errors():
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid audio format")
	case <-time.After(100 * time.Millisecond):
		t.Fatal("timeout waiting for error")
	}

	// 4. Test Task Finished (should close done channel)
	finEvent := StreamEvent{
		TaskID: "task-123",
		Type:   EventTaskFinished,
	}
	msg, _ = json.Marshal(finEvent)
	handler.handleMessage(msg)

	select {
	case <-handler.done:
		// success, channel is closed
	case <-time.After(100 * time.Millisecond):
		t.Fatal("done channel was not closed on TaskFinished")
	}
}

// =============================================================================
// BUG-5: Generic Pool Extreme Concurrency Chaos Test
// =============================================================================

func TestGenericPool_ExtremeConcurrency(t *testing.T) {
	protocol := NewMockStreamProtocol()
	// Small pool to force high contention
	pool := NewGenericPool("stress-vendor", protocol, 2, 5)
	cleanupPool(t, pool)

	var wg sync.WaitGroup
	const numRoutines = 1000

	// Launch 1,000 goroutines trying to start and close ASR tasks
	for i := 0; i < numRoutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			// Try to acquire a task (internally acquires a connection)
			task, err := pool.NewTask(16000, "en-US")
			if err != nil {
				// Depending on the mock, it might fail if pool exhausted, which is fine
				return
			}

			// Simulate streaming life
			time.Sleep(1 * time.Millisecond)

			// Terminate task and release it back to pool
			task.Close()
		}(i)
	}

	wg.Wait()

	// Ensure max pool size is respected
	stats := pool.Stats()
	assert.GreaterOrEqual(t, stats.CurrentSize, 0, "Connections should not be negative")
	assert.LessOrEqual(t, stats.CurrentSize, 5, "Should not exceed max pool size")
}
