package audio

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAudioIngestHandler_MissingCallID verifies that requests without a call_id are rejected.
func TestAudioIngestHandler_MissingCallID(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/audio/ingest", nil)
	w := httptest.NewRecorder()

	AudioIngestHandler(w, req)

	res := w.Result()
	defer res.Body.Close()

	assert.Equal(t, http.StatusBadRequest, res.StatusCode)

	var response map[string]interface{}
	err := json.NewDecoder(res.Body).Decode(&response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "call_id is required")
}

// TestAudioIngestHandler_PayloadTooLarge verifies the strict 10MB memory protection.
func TestAudioIngestHandler_PayloadTooLarge(t *testing.T) {
	// Generate just over 10MB of dummy payload
	largePayload := make([]byte, 10*1024*1024+1)

	req := httptest.NewRequest(http.MethodPost, "/audio/ingest?call_id=large-payload-test", bytes.NewReader(largePayload))
	w := httptest.NewRecorder()

	AudioIngestHandler(w, req)

	res := w.Result()
	defer res.Body.Close()

	assert.Equal(t, http.StatusRequestEntityTooLarge, res.StatusCode, "Expected 413 Payload Too Large")
}

// TestAudioIngestHandler_Success verifies a successful multipart/raw submission.
func TestAudioIngestHandler_Success(t *testing.T) {
	body := new(bytes.Buffer)
	writer := multipart.NewWriter(body)

	// Ensure we pass some dummy audio data
	part, err := writer.CreateFormFile("audio", "test.pcm")
	require.NoError(t, err)
	_, err = io.Copy(part, bytes.NewReader([]byte("dummy audio bytes for testing")))
	require.NoError(t, err)

	err = writer.Close()
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/audio/ingest?call_id=test-success", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	w := httptest.NewRecorder()

	AudioIngestHandler(w, req)

	res := w.Result()
	defer res.Body.Close()

	assert.Equal(t, http.StatusAccepted, res.StatusCode)

	var response map[string]interface{}
	err = json.NewDecoder(res.Body).Decode(&response)
	require.NoError(t, err)
	assert.Equal(t, "accepted", response["status"])
	assert.Equal(t, "test-success", response["call_id"])
}

// TestStreamAudioHandler_RequiresUpgrade verifies that pure HTTP requests get 426 Upgrade Required.
func TestStreamAudioHandler_RequiresUpgrade(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/audio/stream", nil)
	w := httptest.NewRecorder()

	StreamAudioHandler(w, req)

	res := w.Result()
	defer res.Body.Close()

	assert.Equal(t, http.StatusUpgradeRequired, res.StatusCode)
}
