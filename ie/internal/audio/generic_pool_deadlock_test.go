package audio

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

var testUpgrader = websocket.Upgrader{}

// MockDeadlockProtocol for testing connection pool deadlock
type MockDeadlockProtocol struct {
	endpoint string
}

func (m *MockDeadlockProtocol) Endpoint() string         { return m.endpoint }
func (m *MockDeadlockProtocol) AuthHeaders() http.Header { return nil }
func (m *MockDeadlockProtocol) StartTaskFrame(taskID string, sampleRate int, language string) ([]byte, error) {
	return nil, nil
}
func (m *MockDeadlockProtocol) ParseMessage(message []byte) (*StreamEvent, error) { return nil, nil }
func (m *MockDeadlockProtocol) StopTaskFrame(taskID string) ([]byte, error)       { return nil, nil }
func (m *MockDeadlockProtocol) SendAudioAsBinary() bool                           { return true }
func (m *MockDeadlockProtocol) SendAudioAsJSON(audio []byte) ([]byte, error)      { return nil, nil }

func TestWebSocketWrite_NoDeadlock(t *testing.T) {
	// Create a dummy server that ACCEPTS connection but REFUSES to read data (simulating a full TCP window / blackhole)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := testUpgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		// DO NOTHING. Wait forever to block writes eventually.
		time.Sleep(1 * time.Hour)
		conn.Close()
	}))
	defer server.Close()

	wsURL := "ws" + server.URL[4:]

	// Actually connect using normal gorilla dialer to get the raw conn
	rawConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to dial test server: %v", err)
	}

	// Directly construct the wrapper to avoid starting pool background goroutines (which causes data races)
	conn := &GenericConnection{
		conn: rawConn,
	}

	errCh := make(chan error, 1)
	go func() {
		payload := make([]byte, 1024*1024*10) // 10MB to fill buffer and block
		err := conn.SafeWriteMessage(websocket.BinaryMessage, payload)
		errCh <- err
	}()

	select {
	case err := <-errCh:
		if err != nil {
			t.Logf("Write aborted as expected due to deadline/error: %v", err)
		} else {
			t.Log("Write succeeded (buffer was large enough), but it didn't block forever.")
		}
	case <-time.After(6 * time.Second):
		t.Fatalf("WriteMessage blocked for over 6 seconds! SafeWriteMessage SetWriteDeadline mechanism failed.")
	}
}
