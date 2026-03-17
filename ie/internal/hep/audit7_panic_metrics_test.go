package hep

import (
	"net"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/metrics"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
)

type panicMockConn struct {
	net.Conn
}

func (m *panicMockConn) Read(b []byte) (n int, err error) {
	panic("simulated read panic")
}

func (m *panicMockConn) Close() error {
	return nil
}

func (m *panicMockConn) SetReadDeadline(t time.Time) error {
	return nil
}

func TestAudit7_PanicMetrics(t *testing.T) {
	beforeHandle := testutil.ToFloat64(metrics.HEPPanics)

	// handleTCPConnectionWithTimeout will call Reader.Peek or Read, which will panic
	mockConn := &panicMockConn{}
	handleTCPConnectionWithTimeout(mockConn, 1*time.Second)

	afterHandle := testutil.ToFloat64(metrics.HEPPanics)
	assert.Greater(t, afterHandle, beforeHandle, "HEPPanics metric should increment after a panic in handleTCPConnectionWithTimeout")
}
