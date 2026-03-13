package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Mock callbacks for testing
var (
	mockEnableASRCalled  bool
	mockDisableASRCalled bool
	mockEnableASRError   error
	mockDisableASRError  error
	mockASRStatus        map[string]interface{}
)

func resetMocks() {
	mockEnableASRCalled = false
	mockDisableASRCalled = false
	mockEnableASRError = nil
	mockDisableASRError = nil
	mockASRStatus = nil
	// Default: bypass permission check (Redis not available in unit tests)
	CheckASRPermissionFunc = func(callID string) (bool, string, error) {
		return true, "", nil
	}
}

func mockEnableASR(callID string) error {
	mockEnableASRCalled = true
	return mockEnableASRError
}

func mockDisableASR(callID string) error {
	mockDisableASRCalled = true
	return mockDisableASRError
}

func mockGetASRStatus(callID string) map[string]interface{} {
	return mockASRStatus
}

func TestHandleASRControl_Enable_Success(t *testing.T) {
	resetMocks()
	EnableASRCallback = mockEnableASR
	DisableASRCallback = mockDisableASR

	// Mock Redis to return optional policies
	// Note: This requires mocking redis.GetCallState, which should be done via dependency injection
	// For now, we'll test the handler logic assuming permission check passes

	reqBody := ASRControlRequest{
		CallID: "test-call-123",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/asr/enable", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	HandleASRControl(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.True(t, mockEnableASRCalled)

	var resp ASRControlResponse
	json.NewDecoder(w.Body).Decode(&resp)
	assert.Equal(t, "success", resp.Status)
	assert.Contains(t, resp.Message, "ASR enabled")
}

func TestHandleASRControl_Disable_Success(t *testing.T) {
	resetMocks()
	EnableASRCallback = mockEnableASR
	DisableASRCallback = mockDisableASR

	reqBody := ASRControlRequest{
		CallID: "test-call-123",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/asr/disable", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	HandleASRControl(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.True(t, mockDisableASRCalled)

	var resp ASRControlResponse
	json.NewDecoder(w.Body).Decode(&resp)
	assert.Equal(t, "success", resp.Status)
	assert.Contains(t, resp.Message, "ASR disabled")
}

func TestHandleASRControl_MissingCallID(t *testing.T) {
	resetMocks()
	EnableASRCallback = mockEnableASR

	reqBody := ASRControlRequest{
		CallID: "",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/asr/enable", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	HandleASRControl(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.False(t, mockEnableASRCalled)

	var resp ASRControlResponse
	json.NewDecoder(w.Body).Decode(&resp)
	assert.Equal(t, "error", resp.Status)
	assert.Contains(t, resp.Message, "Missing call_id")
}

func TestHandleASRControl_InvalidMethod(t *testing.T) {
	resetMocks()

	req := httptest.NewRequest(http.MethodGet, "/api/asr/enable", nil)
	w := httptest.NewRecorder()

	HandleASRControl(w, req)

	assert.Equal(t, http.StatusMethodNotAllowed, w.Code)
}

func TestHandleASRControl_CallbackNotInitialized(t *testing.T) {
	resetMocks()
	EnableASRCallback = nil
	// Permission check must pass to reach the callback-nil check
	CheckASRPermissionFunc = func(callID string) (bool, string, error) {
		return true, "", nil
	}

	reqBody := ASRControlRequest{
		CallID: "test-call-123",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/asr/enable", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	HandleASRControl(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)

	var resp ASRControlResponse
	json.NewDecoder(w.Body).Decode(&resp)
	assert.Equal(t, "error", resp.Status)
	assert.Contains(t, resp.Message, "not initialized")
}

func TestHandleASRStatus_Success(t *testing.T) {
	resetMocks()
	GetASRStatusCallback = mockGetASRStatus
	mockASRStatus = map[string]interface{}{
		"call_id":       "test-call-123",
		"total_streams": 2,
		"asr_enabled":   1,
		"asr_disabled":  1,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/asr/status?call_id=test-call-123", nil)
	w := httptest.NewRecorder()

	HandleASRStatus(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp ASRControlResponse
	json.NewDecoder(w.Body).Decode(&resp)
	assert.Equal(t, "success", resp.Status)
	require.NotNil(t, resp.Data)
	assert.Equal(t, "test-call-123", resp.Data["call_id"])
	assert.Equal(t, float64(2), resp.Data["total_streams"])
}

func TestHandleASRStatus_MissingCallID(t *testing.T) {
	resetMocks()
	GetASRStatusCallback = mockGetASRStatus

	req := httptest.NewRequest(http.MethodGet, "/api/asr/status", nil)
	w := httptest.NewRecorder()

	HandleASRStatus(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp ASRControlResponse
	json.NewDecoder(w.Body).Decode(&resp)
	assert.Equal(t, "error", resp.Status)
	assert.Contains(t, resp.Message, "Missing call_id")
}

func TestHandleASRStatus_CallNotFound(t *testing.T) {
	resetMocks()
	GetASRStatusCallback = mockGetASRStatus
	mockASRStatus = nil // Simulate call not found

	req := httptest.NewRequest(http.MethodGet, "/api/asr/status?call_id=nonexistent", nil)
	w := httptest.NewRecorder()

	HandleASRStatus(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)

	var resp ASRControlResponse
	json.NewDecoder(w.Body).Decode(&resp)
	assert.Equal(t, "error", resp.Status)
	assert.Contains(t, resp.Message, "Call not found")
}

func TestCheckASRPermission_BothOptional(t *testing.T) {
	// This test requires mocking redis.GetCallState
	// Implementation depends on how you want to structure your mocks
	// For now, this is a placeholder showing the test structure

	// Mock setup would go here
	// canEnable, reason, err := checkASRPermission("test-call")
	// assert.NoError(t, err)
	// assert.True(t, canEnable)
	// assert.Empty(t, reason)
}

func TestCheckASRPermission_GlobalDisabled(t *testing.T) {
	// Mock redis.GetCallState to return global_asr_policy: disabled
	// canEnable, reason, err := checkASRPermission("test-call")
	// assert.NoError(t, err)
	// assert.False(t, canEnable)
	// assert.Contains(t, reason, "全局禁用")
}

func TestCheckASRPermission_AgentDisabled(t *testing.T) {
	// Mock redis.GetCallState to return agent_asr_policy: disabled
	// canEnable, reason, err := checkASRPermission("test-call")
	// assert.NoError(t, err)
	// assert.False(t, canEnable)
	// assert.Contains(t, reason, "坐席")
}

func TestCheckASRPermission_GlobalRequired(t *testing.T) {
	// Mock redis.GetCallState to return global_asr_policy: required
	// canEnable, reason, err := checkASRPermission("test-call")
	// assert.NoError(t, err)
	// assert.False(t, canEnable)
	// assert.Contains(t, reason, "强制开启")
}

// --- Security Tests ---

func TestASRControl_CORSNotWildcard(t *testing.T) {
	// After the fix, the ASR control endpoint should NOT return
	// Access-Control-Allow-Origin: * for arbitrary origins.
	resetMocks()
	EnableASRCallback = mockEnableASR

	reqBody := ASRControlRequest{CallID: "cors-test-call"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/asr/enable", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://evil-site.com")
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	HandleASRControl(w, req)

	corsHeader := w.Header().Get("Access-Control-Allow-Origin")
	assert.NotEqual(t, "*", corsHeader,
		"CORS should not be wildcard — found Access-Control-Allow-Origin: *")
}
