package siprec

import (
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// =============================================================================
// BUG-6: SIP TCP Server Extreme Throttling and Concurrency Test
// =============================================================================

func TestSIPTCPServer_ExtremeConcurrency(t *testing.T) {
	pool := NewPortPool(30000, 31000)
	server := NewSIPTCPServer(0, "127.0.0.1", pool) // port 0 means auto-allocate

	err := server.Start()
	assert.NoError(t, err, "Server should start without error")
	defer server.Stop()

	time.Sleep(10 * time.Millisecond) // warm up the listener
	port := server.listener.Addr().(*net.TCPAddr).Port

	var wg sync.WaitGroup
	const numConnections = 1000
	var successCount int32
	var rejectCount int32

	// Launch 1,000 extreme concurrent TCP connection spikes.
	// Only 200 (MaxSIPRECConnections) should remain active simultaneously.
	for i := 0; i < numConnections; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 2*time.Second)
			if err != nil {
				atomic.AddInt32(&rejectCount, 1)
				return
			}

			// If connected, write some garbage or hold it open for a bit to occupy the slot
			_, err = conn.Write([]byte("INVITE sip:test SIP/2.0\r\n\r\n"))
			if err != nil {
				conn.Close()
				return
			}
			atomic.AddInt32(&successCount, 1)
			time.Sleep(10 * time.Millisecond)
			conn.Close()
		}()
	}

	wg.Wait()

	// Server active connection tracking should not go negative or exceed Max limit
	active := server.ActiveConns()
	assert.GreaterOrEqual(t, active, int32(0))
	assert.LessOrEqual(t, active, int32(MaxSIPRECConnections))
}
