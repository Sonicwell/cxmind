package api

import (
	"encoding/json"
	"net/http"
)

// RecordingPauseCallback is set by main.go to avoid import cycles (api ↔ rtp).
var RecordingPauseCallback func(callID string)

// RecordingResumeCallback is set by main.go.
var RecordingResumeCallback func(callID string)

// RecordingIsPausedCallback is set by main.go.
var RecordingIsPausedCallback func(callID string) bool

// HandleRecordingPause pauses recording for a specific call.
// POST /api/recording/pause - {"call_id": "xxx"}
func HandleRecordingPause(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		CallID string `json:"call_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CallID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		jsonEncode(w, map[string]string{"error": "call_id is required"})
		return
	}

	if RecordingPauseCallback != nil {
		RecordingPauseCallback(req.CallID)
	}

	w.Header().Set("Content-Type", "application/json")
	jsonEncode(w, map[string]interface{}{
		"call_id": req.CallID,
		"paused":  true,
		"message": "Recording paused",
	})
}

// HandleRecordingResume resumes recording for a specific call.
// POST /api/recording/resume - {"call_id": "xxx"}
func HandleRecordingResume(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		CallID string `json:"call_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CallID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		jsonEncode(w, map[string]string{"error": "call_id is required"})
		return
	}

	if RecordingResumeCallback != nil {
		RecordingResumeCallback(req.CallID)
	}

	w.Header().Set("Content-Type", "application/json")
	jsonEncode(w, map[string]interface{}{
		"call_id": req.CallID,
		"paused":  false,
		"message": "Recording resumed",
	})
}

// HandleRecordingStatus returns the recording pause state for a call.
// GET /api/recording/status?call_id=xxx
func HandleRecordingStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	callID := r.URL.Query().Get("call_id")
	if callID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		jsonEncode(w, map[string]string{"error": "call_id query param is required"})
		return
	}

	paused := false
	if RecordingIsPausedCallback != nil {
		paused = RecordingIsPausedCallback(callID)
	}

	w.Header().Set("Content-Type", "application/json")
	jsonEncode(w, map[string]interface{}{
		"call_id": callID,
		"paused":  paused,
	})
}
