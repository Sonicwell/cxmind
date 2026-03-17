package audio

import (
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// mockWSServer simulates an ASR WebSocket server that keeps connections open
func mockWSServer() *httptest.Server {
	upgrader := websocket.Upgrader{}
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		// Read loop to keep connection alive until closed by client
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	}))
}

// mockStreamProtocolForLeak simulates a StreamProtocol using the mock server
type mockStreamProtocolForLeak struct {
	endpoint string
}

func (m *mockStreamProtocolForLeak) Endpoint() string         { return m.endpoint }
func (m *mockStreamProtocolForLeak) AuthHeaders() http.Header { return nil }
func (m *mockStreamProtocolForLeak) StartTaskFrame(t string, s int, l string) ([]byte, error) {
	return nil, nil
}
func (m *mockStreamProtocolForLeak) StopTaskFrame(t string) ([]byte, error)        { return nil, nil }
func (m *mockStreamProtocolForLeak) ParseMessage(msg []byte) (*StreamEvent, error) { return nil, nil }
func (m *mockStreamProtocolForLeak) SendAudioAsBinary() bool                       { return true }

func TestDynamicASR_GoroutineLeak(t *testing.T) {
	ts := mockWSServer()
	defer ts.Close()

	// Convert http to ws
	wsURL := "ws" + ts.URL[4:]

	// Baseline goroutines
	time.Sleep(100 * time.Millisecond)
	baseline := runtime.NumGoroutine()

	// Simulate 20 hot reloads
	for i := 0; i < 20; i++ {
		protocol := &mockStreamProtocolForLeak{endpoint: wsURL}
		pool := NewGenericPool("leak-vendor", protocol, 5, 5)

		// Wait for connections to establish
		time.Sleep(50 * time.Millisecond)

		// Hot reload: drain and close old pool
		// In real code, ReplaceVendorPool calls OldPool.drainAndClose()
		go pool.drainAndClose()

		time.Sleep(10 * time.Millisecond)
	}

	// Give it some time to clean up
	time.Sleep(1 * time.Second)

	final := runtime.NumGoroutine()
	t.Logf("Baseline goroutines: %d, Final: %d", baseline, final)

	// If it leaks 5 connections * 2 goroutines per connection * 20 iterations = 200 goroutines
	if final-baseline > 50 {
		t.Fatalf("Goroutine leak detected: leaked %d goroutines", final-baseline)
	}
}
