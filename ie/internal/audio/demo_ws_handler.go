package audio

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  32 * 1024,
	WriteBufferSize: 1024,
	// Allow all origins for the demo
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// DemoTranscribeWSHandler handles WebSocket ASR transcription for the demo page.
//
// Allows a client (frontend or app-server) to establish a WS connection,
// stream raw PCM binary chunks in, and receive JSON transcription results out.
//
// Endpoint: ws://.../api/demo/transcribe/ws?sample_rate=16000&language=zh
func DemoTranscribeWSHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Demo/WS] Upgrade failed: %v", err)
		return
	}
	defer conn.Close()

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

	log.Printf("[Demo/WS] New streaming connection established: sample_rate=%d, language=%s", sampleRate, language)

	// Determine provider
	var provider ASRProvider
	reqProvider := r.URL.Query().Get("vendor")
	if reqProvider != "" && reqProvider != "default" {
		// Note: HTTP headers are not natively supported in standard browser WS APIs.
		// For the demo, since we switched back to using Redis active config,
		// we just use the global GetCurrentASRProvider().
		provider = GetCurrentASRProvider()
	} else {
		provider = GetCurrentASRProvider()
	}

	// For streaming, the provider MUST implement StreamingASRProvider
	streamingProvider, ok := provider.(StreamingASRProvider)
	if !ok {
		log.Printf("[Demo/WS] Configured provider does not support streaming")
		errMsg := map[string]string{"error": "Configured ASR provider does not support streaming"}
		conn.WriteJSON(errMsg)
		return
	}

	// Start Stream
	stream, err := streamingProvider.NewStream(sampleRate, language)
	if err != nil {
		log.Printf("[Demo/WS] Failed to create stream: %v", err)
		conn.WriteJSON(map[string]string{"error": "Failed to initialize ASR stream"})
		return
	}

	// Ensure stream is closed
	defer stream.Close()

	// Create done channel to signal completion between goroutines
	done := make(chan struct{})

	// 1. Result Sender Goroutine
	// Listens to the stream.Results() channel and sends JSON back to the WS client.
	go func() {
		defer close(done)
		for res := range stream.Results() {
			response := map[string]interface{}{
				"text":       res.Text,
				"confidence": res.Confidence,
				"is_final":   res.IsFinal,
				"speaker":    res.Speaker,
			}
			if res.RTTMs > 0 {
				response["rtt_ms"] = res.RTTMs
			} else {
				response["rtt_ms"] = 0 // Explicitly send 0 instead of undefined
			}

			// Only output time if we have a valid end boundary
			if res.EndTimeMs > 0 {
				response["start_time"] = float64(res.StartTimeMs) / 1000.0
				response["end_time"] = float64(res.EndTimeMs) / 1000.0
			}

			cfg := GetDynamicASRConfig()
			if cfg != nil {
				response["provider"] = cfg.Provider
				response["vendor_id"] = cfg.VendorID
			}

			if err := conn.WriteJSON(response); err != nil {
				log.Printf("[Demo/WS] Failed to write result to WS: %v", err)
				return
			}
		}
	}()

	// 2. Audio Receiver Loop
	// Reads binary messages from WS and feeds them to stream.SendAudio.
	// We run this in the main handler goroutine so when the client disconnects,
	// this loop breaks, and defer stream.Close() handles shutting down the DashScope task.
	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Demo/WS] Unexpected WS close: %v", err)
			} else {
				log.Printf("[Demo/WS] WS closed cleanly")
			}
			break
		}

		if messageType == websocket.BinaryMessage {
			if err := stream.SendAudio(message); err != nil {
				log.Printf("[Demo/WS] ASR stream SendAudio error: %v", err)
				conn.WriteJSON(map[string]string{"error": "Failed to send audio to ASR"})
				break
			}
		} else if messageType == websocket.TextMessage {
			// Client can send a text message like {"action": "stop"} to signal end of stream
			var cmd struct {
				Action string `json:"action"`
			}
			if err := json.Unmarshal(message, &cmd); err == nil {
				if cmd.Action == "stop" {
					log.Printf("[Demo/WS] Received stop command from client")
					break
				}
			}
		}
	}

	// Client disconnected or sent "stop".
	// We call stream.Close() manually here to trigger IsFinal from DashScope.
	stream.Close()

	// Wait up to 5 seconds for any final streaming results to be sent back
	select {
	case <-done:
		log.Printf("[Demo/WS] Stream finalized successfully")
	case <-time.After(5 * time.Second):
		log.Printf("[Demo/WS] Stream finalization timed out")
	}
}
