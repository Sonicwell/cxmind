package audio

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
)

// DemoTranscribeHandler handles synchronous ASR transcription for the demo page.
// Unlike AudioIngestHandler (which is async and writes to Redis/ClickHouse),
// this handler returns the transcription result directly in the HTTP response.
//
// Input:  POST /api/demo/transcribe
//
//	Body: raw PCM bytes (signed 16-bit LE)
//	Query: ?sample_rate=16000&language=zh
//
// Output: JSON { text, confidence, is_final, provider }
func DemoTranscribeHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
		return
	}

	// Read audio body (max 20MB)
	const maxBody = 20 * 1024 * 1024
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	audioData, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to read audio body"})
		return
	}
	defer r.Body.Close()

	if len(audioData) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "empty audio body"})
		return
	}

	// Parse query params
	sampleRate := 16000
	if sr := r.URL.Query().Get("sample_rate"); sr != "" {
		if v, err := strconv.Atoi(sr); err == nil && v > 0 {
			sampleRate = v
		}
	}
	language := r.URL.Query().Get("language")
	if language == "" {
		language = "zh"
	}

	log.Printf("[Demo/ASR] Transcribing %d bytes, sample_rate=%d, language=%s",
		len(audioData), sampleRate, language)

	// Get current ASR provider and transcribe synchronously
	var provider ASRProvider
	reqProvider := r.Header.Get("X-ASR-Provider")
	reqUrl := r.Header.Get("X-ASR-URL")
	reqKey := r.Header.Get("X-ASR-Key")

	if reqProvider != "" && reqProvider != "default" {
		log.Printf("[Demo/ASR] Using ephemeral provider from headers: %s", reqProvider)
		provider = getProviderFromConfig(reqProvider, reqUrl, reqKey)
	} else {
		provider = GetCurrentASRProvider()
	}

	result, err := provider.Transcribe(audioData, sampleRate, language)
	if err != nil {
		log.Printf("[Demo/ASR] Transcription error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Return result
	response := map[string]interface{}{
		"text":       result.Text,
		"confidence": result.Confidence,
		"is_final":   result.IsFinal,
		"speaker":    result.Speaker,
	}

	// Add provider info
	cfg := GetDynamicASRConfig()
	if cfg != nil {
		response["provider"] = cfg.Provider
		response["vendor_id"] = cfg.VendorID
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
