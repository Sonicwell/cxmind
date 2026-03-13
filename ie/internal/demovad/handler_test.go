package demovad

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestHandleDemoVAD_OversizedBody verifies that when the request body exceeds
// the 20MB limit, the handler returns HTTP 400 with a clear error message.
// Bug: parseDemoAudioRequest previously called MaxBytesReader(nil, ...) which
// prevented proper HTTP error response on oversized bodies.
func TestHandleDemoVAD_OversizedBody(t *testing.T) {
	// Create a body larger than 20MB limit
	oversizedBody := make([]byte, 21*1024*1024)
	req := httptest.NewRequest(http.MethodPost, "/api/demo/vad?sample_rate=16000", bytes.NewReader(oversizedBody))
	w := httptest.NewRecorder()

	HandleDemoVAD(w, req)

	// Should return 400 Bad Request (not 500 or panic)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for oversized body, got %d", w.Code)
	}

	// Response body should contain a meaningful error
	body := w.Body.String()
	if body == "" {
		t.Error("Expected error message in response body")
	}
}

// TestParseDemoAudioRequest_EmptyBody verifies empty body returns error.
func TestParseDemoAudioRequest_EmptyBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/demo/vad", bytes.NewReader([]byte{}))
	w := httptest.NewRecorder()

	_, _, _, err := parseDemoAudioRequest(w, req)
	if err == nil {
		t.Error("Expected error for empty body")
	}
}

// TestParseDemoAudioRequest_ValidBody verifies normal body is parsed correctly.
func TestParseDemoAudioRequest_ValidBody(t *testing.T) {
	// Small valid PCM data
	pcm := make([]byte, 3200) // 100ms at 16kHz 16-bit
	req := httptest.NewRequest(http.MethodPost, "/api/demo/vad?sample_rate=8000&silero_threshold=0.7", bytes.NewReader(pcm))
	w := httptest.NewRecorder()

	audioData, sampleRate, threshold, err := parseDemoAudioRequest(w, req)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if len(audioData) != 3200 {
		t.Errorf("Expected 3200 bytes, got %d", len(audioData))
	}
	if sampleRate != 8000 {
		t.Errorf("Expected sample rate 8000, got %d", sampleRate)
	}
	if threshold != 0.7 {
		t.Errorf("Expected threshold 0.7, got %f", threshold)
	}
}
