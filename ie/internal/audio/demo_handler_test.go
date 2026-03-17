package audio

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestDemoTranscribeHandler_MethodNotAllowed verifies GET requests are rejected.
func TestDemoTranscribeHandler_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/demo/transcribe", nil)
	rr := httptest.NewRecorder()

	DemoTranscribeHandler(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", rr.Code)
	}
}

// TestDemoTranscribeHandler_EmptyBody verifies empty audio body is rejected.
func TestDemoTranscribeHandler_EmptyBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/demo/transcribe", strings.NewReader(""))
	rr := httptest.NewRecorder()

	DemoTranscribeHandler(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", rr.Code)
	}

	var resp map[string]string
	json.NewDecoder(rr.Body).Decode(&resp)
	if resp["error"] != "empty audio body" {
		t.Errorf("Expected 'empty audio body' error, got: %s", resp["error"])
	}
}

// TestDemoTranscribeHandler_ValidPCM verifies a successful transcription.
func TestDemoTranscribeHandler_ValidPCM(t *testing.T) {
	// Set up mock ASR provider
	SetDynamicASRConfig(DynamicASRConfig{
		Provider: "mock",
		VendorID: "test-demo",
	})

	// Create fake PCM data (16-bit samples)
	pcmData := make([]byte, 32000) // 1 second at 16kHz mono 16-bit
	for i := range pcmData {
		pcmData[i] = byte(i % 256)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/demo/transcribe?sample_rate=16000&language=zh",
		strings.NewReader(string(pcmData)))
	rr := httptest.NewRecorder()

	DemoTranscribeHandler(rr, req)

	if rr.Code != http.StatusOK {
		body, _ := io.ReadAll(rr.Body)
		t.Fatalf("Expected 200, got %d: %s", rr.Code, string(body))
	}

	var resp map[string]interface{}
	json.NewDecoder(rr.Body).Decode(&resp)

	if resp["text"] == nil {
		t.Error("Expected 'text' field in response")
	}
}

// TestDemoTranscribeHandler_DefaultParams verifies default sample rate and language.
func TestDemoTranscribeHandler_DefaultParams(t *testing.T) {
	SetDynamicASRConfig(DynamicASRConfig{
		Provider: "mock",
		VendorID: "test-defaults",
	})

	pcmData := make([]byte, 1600) // Small sample
	req := httptest.NewRequest(http.MethodPost, "/api/demo/transcribe",
		strings.NewReader(string(pcmData)))
	rr := httptest.NewRecorder()

	DemoTranscribeHandler(rr, req)

	// Should succeed with default params (sample_rate=16000, language=zh)
	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200 with default params, got %d", rr.Code)
	}
}

// TestDemoTranscribeHandler_CustomProviderHeader verifies X-ASR-Provider header override.
func TestDemoTranscribeHandler_CustomProviderHeader(t *testing.T) {
	pcmData := make([]byte, 1600)
	req := httptest.NewRequest(http.MethodPost, "/api/demo/transcribe",
		strings.NewReader(string(pcmData)))
	req.Header.Set("X-ASR-Provider", "mock")
	req.Header.Set("X-ASR-URL", "http://localhost:8080")
	req.Header.Set("X-ASR-Key", "test-key")
	rr := httptest.NewRecorder()

	DemoTranscribeHandler(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200 with custom provider, got %d", rr.Code)
	}
}
