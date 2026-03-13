package api

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestHandleRecordingPause_Success(t *testing.T) {
	body, _ := json.Marshal(map[string]string{"call_id": "test-call-1"})
	req := httptest.NewRequest("POST", "/api/recording/pause", bytes.NewReader(body))
	w := httptest.NewRecorder()

	HandleRecordingPause(w, req)

	if w.Code != 200 {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["paused"] != true {
		t.Errorf("paused = %v, want true", resp["paused"])
	}
}

func TestHandleRecordingPause_MissingCallID(t *testing.T) {
	body, _ := json.Marshal(map[string]string{})
	req := httptest.NewRequest("POST", "/api/recording/pause", bytes.NewReader(body))
	w := httptest.NewRecorder()

	HandleRecordingPause(w, req)

	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandleRecordingResume_Success(t *testing.T) {
	body, _ := json.Marshal(map[string]string{"call_id": "test-call-1"})
	req := httptest.NewRequest("POST", "/api/recording/resume", bytes.NewReader(body))
	w := httptest.NewRecorder()

	HandleRecordingResume(w, req)

	if w.Code != 200 {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["paused"] != false {
		t.Errorf("paused = %v, want false", resp["paused"])
	}
}

func TestHandleRecordingStatus_Success(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/recording/status?call_id=test-call-1", nil)
	w := httptest.NewRecorder()

	HandleRecordingStatus(w, req)

	if w.Code != 200 {
		t.Errorf("status = %d, want 200", w.Code)
	}
}

func TestHandleRecordingStatus_MissingCallID(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/recording/status", nil)
	w := httptest.NewRecorder()

	HandleRecordingStatus(w, req)

	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandleRecordingPause_WrongMethod(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/recording/pause", nil)
	w := httptest.NewRecorder()

	HandleRecordingPause(w, req)

	if w.Code != 405 {
		t.Errorf("status = %d, want 405", w.Code)
	}
}
