package audio

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/redis"
)

// Response represents a standard JSON API response
type Response struct {
	Error  string `json:"error,omitempty"`
	Status string `json:"status,omitempty"`
	CallID string `json:"call_id,omitempty"`
	Size   int    `json:"size,omitempty"`
}

func sendJSON(w http.ResponseWriter, statusCode int, payload Response) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

// AudioIngestHandler handles audio upload using standard net/http.
// It imposes a strict 10MB memory limit per request.
func AudioIngestHandler(w http.ResponseWriter, r *http.Request) {
	// Require POST
	if r.Method != http.MethodPost {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Error: "Method Not Allowed"})
		return
	}

	callID := r.URL.Query().Get("call_id")
	if callID == "" {
		callID = r.Header.Get("X-Call-ID")
	}
	if callID == "" {
		sendJSON(w, http.StatusBadRequest, Response{Error: "call_id is required"})
		return
	}

	// Constrain memory limit
	const maxBodySize = 10 * 1024 * 1024 // 10MB
	r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)

	// Since we are dealing with multipart/form-data, grab the file
	err := r.ParseMultipartForm(maxBodySize)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			sendJSON(w, http.StatusRequestEntityTooLarge, Response{Error: "Request body too large (max 10MB)"})
			return
		}
		// If it's not multipart, try reading raw body for backwards compatibility
		_ = err
	}

	var audioData []byte

	if r.MultipartForm != nil && r.MultipartForm.File != nil && len(r.MultipartForm.File["audio"]) > 0 {
		fileHeader := r.MultipartForm.File["audio"][0]
		file, err := fileHeader.Open()
		if err != nil {
			sendJSON(w, http.StatusBadRequest, Response{Error: "Failed to open audio file in multipart form"})
			return
		}
		defer file.Close()
		audioData, err = io.ReadAll(file)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, Response{Error: "Failed to read audio file"})
			return
		}
	} else {
		// Fallback to raw body
		audioData, err = io.ReadAll(r.Body)
		if err != nil {
			var maxBytesErr *http.MaxBytesError
			if errors.As(err, &maxBytesErr) {
				sendJSON(w, http.StatusRequestEntityTooLarge, Response{Error: "Request body too large (max 10MB)"})
				return
			}
			sendJSON(w, http.StatusBadRequest, Response{Error: "Failed to read raw audio data"})
			return
		}
	}

	if len(audioData) == 0 {
		sendJSON(w, http.StatusBadRequest, Response{Error: "Audio payload is empty"})
		return
	}

	// Dispatch to async processing
	// (Note: we use a safe concurrent pass to avoid blocking HTTP worker threads)
	go ProcessAudio(callID, audioData, 16000, "zh")

	sendJSON(w, http.StatusAccepted, Response{
		Status: "accepted",
		CallID: callID,
		Size:   len(audioData),
	})
}

// StreamAudioHandler handles WebSocket Upgrade handshakes via standard HTTP logic
func StreamAudioHandler(w http.ResponseWriter, r *http.Request) {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		sendJSON(w, http.StatusUpgradeRequired, Response{Error: "WebSocket upgrade required"})
		return
	}

	// DEFERRED(asr-ws): Gorilla/x/net/websocket — current net/http hijack works; migrate when ASR > 100 concurrent
	sendJSON(w, http.StatusNotImplemented, Response{Error: "WebSocket streaming not yet implemented in native http scope"})
}

// ProcessAudio orchestrates transcription and safely writes to GlobalBatchWriter
func ProcessAudio(callID string, audio []byte, sampleRate int, language string) {
	// Check ASR policy from Redis (fallback allowed)
	callState, err := redis.GetCallState(callID)
	if err != nil {
		log.Printf("[WARN] Failed to get call state for %s: %v", callID, err)
	} else if callState != nil {
		asrEnabled, ok := callState["asr_enabled"].(bool)
		if ok && !asrEnabled {
			log.Printf("[INFO] ASR disabled for call %s via policy. Skipping.", callID)
			return
		}
	}

	// Get Mock or Live ASR Provider
	provider := GetCurrentASRProvider()
	if provider == nil {
		log.Printf("[WARN] No ASR provider available to transcribe %d bytes", len(audio))
		return
	}

	result, err := provider.Transcribe(audio, sampleRate, language)
	if err != nil {
		log.Printf("[ERROR] Transcription failed for call %s: %v", callID, err)
		return
	}

	seq := clickhouse.GetNextSequenceNumber(callID)

	// Fire to Redis PubSub for real-time consumers (like Admin UI)
	segment := map[string]interface{}{
		"call_id":         callID,
		"text":            result.Text,
		"timestamp":       result.Timestamp,
		"confidence":      result.Confidence,
		"is_final":        result.IsFinal,
		"speaker":         result.Speaker,
		"sequence_number": seq,
	}

	if err := redis.PublishTranscription(callID, segment); err != nil {
		log.Printf("[ERROR] Failed to publish transcription: %v", err)
	}

	// Replace the old direct Client.Exec with the Generic Batch Writer.
	// This prevents the Audio endpoint from blocking if CH is slow during massive file uploads!
	chSegment := clickhouse.TranscriptionSegment{
		Timestamp:      result.Timestamp,
		CallID:         callID,
		Realm:          "audio-upload", // Marking source
		Text:           result.Text,
		Confidence:     float32(result.Confidence),
		Speaker:        result.Speaker,
		IsFinal:        1,
		SequenceNumber: seq,
		ASRSource:      "rest-api",
	}

	if err := clickhouse.WriteTranscriptionSegment(chSegment); err != nil {
		log.Printf("[ERROR] Failed to enlist transcription into CH batch pool: %v", err)
	}

	log.Printf("[INFO] Processed offline transcription for call %s (len: %d)", callID, len(result.Text))
}
