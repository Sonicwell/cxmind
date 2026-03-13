package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// --- Basic Functionality Tests ---

func TestHandleMonitoringUpdate_Success(t *testing.T) {
	reqBody := MonitoringUpdateRequest{
		Action:   "start_monitoring",
		Type:     "call",
		TargetID: "call-123",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/monitoring/update", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	HandleMonitoringUpdate(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp MonitoringUpdateResponse
	json.NewDecoder(w.Body).Decode(&resp)
	assert.Equal(t, "success", resp.Status)

	// Verify cache was updated
	assert.True(t, GlobalMonitoringCache.IsCallMonitored("call-123"))
}

func TestHandleMonitoringUpdate_StopMonitoring(t *testing.T) {
	// First start monitoring
	GlobalMonitoringCache.callMonitoring.Store("call-456", true)

	reqBody := MonitoringUpdateRequest{
		Action:   "stop_monitoring",
		Type:     "call",
		TargetID: "call-456",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/monitoring/update", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	HandleMonitoringUpdate(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.False(t, GlobalMonitoringCache.IsCallMonitored("call-456"))
}

func TestHandleMonitoringUpdate_InvalidAction(t *testing.T) {
	reqBody := MonitoringUpdateRequest{
		Action:   "invalid_action",
		Type:     "call",
		TargetID: "call-123",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/monitoring/update", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	HandleMonitoringUpdate(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestHandleMonitoringUpdate_InvalidType(t *testing.T) {
	reqBody := MonitoringUpdateRequest{
		Action:   "start_monitoring",
		Type:     "invalid_type",
		TargetID: "call-123",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/monitoring/update", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	HandleMonitoringUpdate(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestHandleMonitoringUpdate_MissingTargetID(t *testing.T) {
	reqBody := MonitoringUpdateRequest{
		Action:   "start_monitoring",
		Type:     "call",
		TargetID: "",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/monitoring/update", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	HandleMonitoringUpdate(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestHandleMonitoringUpdate_InvalidMethod(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/monitoring/update", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	HandleMonitoringUpdate(w, req)

	assert.Equal(t, http.StatusMethodNotAllowed, w.Code)
}

func TestHandleMonitoringStatus_Success(t *testing.T) {
	// Add some monitoring entries
	GlobalMonitoringCache.callMonitoring.Store("active-call-1", true)
	GlobalMonitoringCache.agentMonitoring.Store("agent-1", true)
	defer func() {
		GlobalMonitoringCache.ClearCall("active-call-1")
		GlobalMonitoringCache.ClearAgent("agent-1")
	}()

	req := httptest.NewRequest(http.MethodGet, "/api/monitoring/status", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	HandleMonitoringStatus(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var result map[string]interface{}
	json.NewDecoder(w.Body).Decode(&result)
	assert.NotNil(t, result["calls"])
	assert.NotNil(t, result["agents"])
}

// --- CORS Tests (verifying the problem exists) ---

func TestHandleMonitoringUpdate_CORSNotWildcard(t *testing.T) {
	// After the fix, the monitoring update endpoint should NOT return
	// Access-Control-Allow-Origin: * for arbitrary origins.
	reqBody := MonitoringUpdateRequest{
		Action:   "start_monitoring",
		Type:     "call",
		TargetID: "cors-test",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/monitoring/update", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://evil-site.com")
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	HandleMonitoringUpdate(w, req)

	corsHeader := w.Header().Get("Access-Control-Allow-Origin")
	assert.NotEqual(t, "*", corsHeader,
		"CORS should not be wildcard — found Access-Control-Allow-Origin: *")
}

// --- Cache Tests ---

func TestShouldMonitorCall_CallLevel(t *testing.T) {
	GlobalMonitoringCache.callMonitoring.Store("monitored-call", true)
	defer GlobalMonitoringCache.ClearCall("monitored-call")

	assert.True(t, GlobalMonitoringCache.ShouldMonitorCall("monitored-call", ""))
	assert.False(t, GlobalMonitoringCache.ShouldMonitorCall("unmonitored-call", ""))
}

func TestShouldMonitorCall_AgentLevel(t *testing.T) {
	GlobalMonitoringCache.agentMonitoring.Store("monitored-agent", true)
	defer GlobalMonitoringCache.ClearAgent("monitored-agent")

	assert.True(t, GlobalMonitoringCache.ShouldMonitorCall("any-call", "monitored-agent"))
	assert.False(t, GlobalMonitoringCache.ShouldMonitorCall("any-call", "other-agent"))
}
