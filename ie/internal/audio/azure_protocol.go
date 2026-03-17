package audio

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/google/uuid"
)

// AzureProtocol implements StreamProtocol for Azure Speech Services WebSocket API
type AzureProtocol struct {
	apiURL     string
	apiKey     string
	sampleRate int
	language   string
}

// NewAzureProtocol creates a new protocol adapter for Azure
// region should be provided in apiURL or a dedicated field. We'll assume apiURL is the full WS endpoint or just the region.
// If apiURL is just a region (e.g. "eastus"), we'll construct the full URL.
func NewAzureProtocol(apiURL, apiKey string, sampleRate int, language string) *AzureProtocol {
	endpoint := apiURL
	if !strings.HasPrefix(endpoint, "ws") {
		// Assume it's a region
		if endpoint == "" {
			endpoint = "eastus" // default
		}
		endpoint = fmt.Sprintf("wss://%s.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1", endpoint)
	}

	if language == "" || language == "auto" {
		language = "en-US" // Azure strictly requires a language format like en-US
	}

	return &AzureProtocol{
		apiURL:     endpoint,
		apiKey:     apiKey,
		sampleRate: sampleRate,
		language:   language,
	}
}

func (a *AzureProtocol) Endpoint() string {
	// Add language and format to the query parameters
	return fmt.Sprintf("%s?language=%s&format=simple", a.apiURL, a.language)
}

func (a *AzureProtocol) AuthHeaders() http.Header {
	headers := http.Header{}
	if a.apiKey != "" {
		headers.Set("Ocp-Apim-Subscription-Key", a.apiKey)
	}
	return headers
}

func (a *AzureProtocol) StartTaskFrame(taskID string, sampleRate int, language string) ([]byte, error) {
	// Azure requires a speech.config message to begin
	configID := strings.ReplaceAll(uuid.New().String(), "-", "")

	payload := map[string]interface{}{
		"context": map[string]interface{}{
			"system": map[string]interface{}{
				"version": "1.0.0",
			},
			"os": map[string]interface{}{
				"platform": "Linux",
				"name":     "Ubuntu",
				"version":  "18.04",
			},
		},
	}
	jsonData, _ := json.Marshal(payload)

	headerString := fmt.Sprintf("Path: speech.config\r\nX-RequestId: %s\r\nX-Timestamp: %s\r\nContent-Type: application/json\r\n\r\n", configID, timeutil.Now().UTC().Format(time.RFC3339Nano))

	msg := append([]byte(headerString), jsonData...)
	return msg, nil
}

func (a *AzureProtocol) StopTaskFrame(taskID string) ([]byte, error) {
	// Send an empty audio block to signify end of stream or just rely on generic close.
	// We'll return nil here, and handle the empty audio frame in SendAudio of the provider if needed.
	return nil, nil // Return empty, Azure relies on connection close or specific telemetry
}

func (a *AzureProtocol) ParseMessage(message []byte) (*StreamEvent, error) {
	msgStr := string(message)
	// Azure WS messages contain headers and body separated by \r\n\r\n
	parts := strings.SplitN(msgStr, "\r\n\r\n", 2)

	var path string
	headersAndStatus := strings.Split(parts[0], "\r\n")
	for _, line := range headersAndStatus {
		if strings.HasPrefix(strings.ToLower(line), "path:") {
			path = strings.TrimSpace(strings.SplitN(line, ":", 2)[1])
		}
	}

	event := &StreamEvent{}
	if len(parts) < 2 {
		return event, nil // No body
	}

	body := []byte(parts[1])

	switch path {
	case "speech.hypothesis":
		var resp struct {
			Text string `json:"Text"`
		}
		if err := json.Unmarshal(body, &resp); err == nil {
			event.Type = EventInterim
			event.Text = resp.Text
		}
	case "speech.phrase":
		var resp struct {
			RecognitionStatus string `json:"RecognitionStatus"`
			DisplayText       string `json:"DisplayText"`
		}
		if err := json.Unmarshal(body, &resp); err == nil {
			if resp.RecognitionStatus == "Success" {
				event.Type = EventFinal
				event.Text = resp.DisplayText
				event.Confidence = 0.9 // Simple format doesn't provide confidence
			} else if resp.RecognitionStatus == "Error" || resp.RecognitionStatus == "BadRequest" {
				event.Type = EventTaskFailed
				event.Error = "Azure Recognition Status: " + resp.RecognitionStatus
			}
		}
	case "turn.end":
		event.Type = EventUnknown // Turn ended, we might want to cleanly close down the line, but GenericPool handles task closure
	default:
		event.Type = EventUnknown
	}

	return event, nil
}

func (a *AzureProtocol) SendAudioAsBinary() bool {
	// Azure needs custom framing for binary, we'll set this to true, but do the framing in our provider wrapper.
	return true
}

// FormatAudioFrame adds the required Azure header to binary audio chunks
func FormatAzureAudioFrame(audio []byte, taskID string) []byte {
	// We don't have taskID in the protocol SendAudio interface yet.
	// But Azure audio wrapper just needs a basic header.
	headerStr := fmt.Sprintf("Path: audio\r\nX-RequestId: %s\r\nX-Timestamp: %s\r\nContent-Type: audio/x-wav\r\n\r\n", taskID, timeutil.Now().UTC().Format(time.RFC3339Nano))
	// Azure requires the header length prefix in binary mode:
	// 2 bytes for header length (big-endian), then header string, then audio.
	headerLen := uint16(len(headerStr))
	buf := new(bytes.Buffer)
	buf.WriteByte(byte(headerLen >> 8))
	buf.WriteByte(byte(headerLen & 0xFF))
	buf.WriteString(headerStr)
	buf.Write(audio)
	return buf.Bytes()
}
