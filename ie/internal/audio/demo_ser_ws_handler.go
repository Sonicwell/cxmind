package audio

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/ser"
	"github.com/gorilla/websocket"
)

// capBuffer ensures buf does not exceed maxBytes by dropping the oldest bytes.
// This prevents unbounded memory growth in long-running WebSocket emotion streams.
// If buf is within limit, it is returned unchanged.
func capBuffer(buf []byte, maxBytes int) []byte {
	if len(buf) <= maxBytes {
		return buf
	}
	return buf[len(buf)-maxBytes:]
}

// DemoEmotionStatusHandler responds with whether SER is enabled and initialized in IE.
// Endpoint: GET /api/demo/emotion/status
func DemoEmotionStatusHandler(w http.ResponseWriter, r *http.Request) {
	isEnabled := config.Global.GetBool("ser.enabled")
	var isInitialized bool
	if isEnabled {
		analyzer := ser.GetAnalyzer()
		if analyzer != nil {
			isInitialized = analyzer.IsInitialized()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{
		"enabled":     isEnabled,
		"initialized": isInitialized,
	})
}

// DemoEmotionWSHandler handles WebSocket Emotion (SER) for the demo page.
//
// Allows a client (frontend or app-server) to establish a WS connection,
// stream raw PCM binary chunks in, and receive JSON emotion results out.
//
// Endpoint: ws://.../api/demo/emotion/ws?sample_rate=8000
func DemoEmotionWSHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Demo/EmotionWS] Upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// Parse query params
	sampleRate := 8000
	if sr := r.URL.Query().Get("sample_rate"); sr != "" {
		if v, err := strconv.Atoi(sr); err == nil && v > 0 {
			sampleRate = v
		}
	}

	log.Printf("[Demo/EmotionWS] New streaming connection established: sample_rate=%d", sampleRate)

	if !config.Global.GetBool("ser.enabled") {
		conn.WriteJSON(map[string]string{"error": "Realtime SER not enabled in IE config"})
		return
	}

	analyzer := ser.GetAnalyzer()
	if analyzer == nil {
		conn.WriteJSON(map[string]string{"error": "SER analyzer not initialized"})
		return
	}

	bytesPerSec := sampleRate * 2 // 16-bit PCM
	chunkBytes := bytesPerSec * 1 // 1-second analysis window

	// maxBufBytes: cap at 10 seconds to prevent OOM on slow connections (P1 fix)
	maxBufBytes := bytesPerSec * 10

	var buffer []byte

	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Demo/EmotionWS] Unexpected WS close: %v", err)
			} else {
				log.Printf("[Demo/EmotionWS] WS closed cleanly")
			}
			break
		}

		if messageType == websocket.BinaryMessage {
			buffer = append(buffer, message...)

			// P1 fix: cap buffer to prevent unbounded memory growth
			buffer = capBuffer(buffer, maxBufBytes)

			// Process if we have enough data (1 second)
			if len(buffer) >= chunkBytes {
				processBuf := buffer[:chunkBytes]
				// Overlapping window: advance by 0.5 seconds
				shiftBytes := bytesPerSec / 2
				buffer = buffer[shiftBytes:]

				segment := &ser.AudioSegment{
					Data:       ser.PcmToFloat32(processBuf),
					SampleRate: sampleRate,
				}

				result, err := analyzer.Analyze(segment)
				if err != nil {
					log.Printf("[Demo/EmotionWS] SER analysis error: %v", err)
					continue
				}

				if result != nil && len(result.Emotions) > 0 {
					topEmotion := result.Emotions[0]

					// Skip silence frames — don't pollute frontend with low-confidence noise results
					if topEmotion.Confidence < 0.1 {
						conn.WriteJSON(map[string]interface{}{"silence": true})
						continue
					}

					wsResponse := map[string]interface{}{
						"emotion":    topEmotion.Emotion,
						"confidence": topEmotion.Confidence,
						"valence":    topEmotion.Valence, // P7 fix: corrected from "valance"
						"energy":     topEmotion.Arousal,
					}

					// P2 fix: handle WriteJSON error — break loop on closed connection
					if err := conn.WriteJSON(wsResponse); err != nil {
						log.Printf("[Demo/EmotionWS] Write error (connection closed?): %v", err)
						break
					}
				}
			}
		} else if messageType == websocket.TextMessage {
			log.Printf("[Demo/EmotionWS] Received text command: %s", string(message))
		}
	}
}
