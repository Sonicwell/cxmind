package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// SEC-V7-2: 验证 500 错误不泄露内部细节
func TestHandleASRControl_InternalErrorSanitized(t *testing.T) {
	// Mock permission check to return an error
	original := CheckASRPermissionFunc
	defer func() { CheckASRPermissionFunc = original }()

	CheckASRPermissionFunc = func(callID string) (bool, string, error) {
		return false, "", fmt.Errorf("Redis connection refused: dial tcp 127.0.0.1:6379")
	}

	body := `{"call_id": "test-call-123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/asr/enable", strings.NewReader(body))
	rr := httptest.NewRecorder()

	HandleASRControl(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rr.Code)
	}

	responseBody := rr.Body.String()

	// 不应包含内部错误细节
	if strings.Contains(responseBody, "Redis") {
		t.Error("response leaked internal Redis error details")
	}
	if strings.Contains(responseBody, "connection refused") {
		t.Error("response leaked connection error details")
	}
	if strings.Contains(responseBody, "127.0.0.1") {
		t.Error("response leaked internal IP address")
	}

	// 应该只包含通用消息
	if !strings.Contains(responseBody, "Internal server error") {
		t.Error("response should contain generic 'Internal server error' message")
	}
}

// SEC-V7-2: 验证 enable/disable 回调失败时也不泄露
func TestHandleASRControl_EnableErrorSanitized(t *testing.T) {
	originalPerm := CheckASRPermissionFunc
	originalEnable := EnableASRCallback
	defer func() {
		CheckASRPermissionFunc = originalPerm
		EnableASRCallback = originalEnable
	}()

	CheckASRPermissionFunc = func(callID string) (bool, string, error) {
		return true, "", nil
	}
	EnableASRCallback = func(callID string) error {
		return fmt.Errorf("failed to start GStreamer pipeline: /usr/bin/gst-launch not found")
	}

	body := `{"call_id": "test-call-456"}`
	req := httptest.NewRequest(http.MethodPost, "/api/asr/enable", strings.NewReader(body))
	rr := httptest.NewRecorder()

	HandleASRControl(rr, req)

	responseBody := rr.Body.String()

	if strings.Contains(responseBody, "GStreamer") {
		t.Error("response leaked internal GStreamer error details")
	}
	if strings.Contains(responseBody, "/usr/bin") {
		t.Error("response leaked internal file path")
	}
	if !strings.Contains(responseBody, "Internal server error") {
		t.Error("response should contain generic error message")
	}
}
