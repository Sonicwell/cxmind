package audio

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

// FunASRProtocol implements StreamProtocol for FunASR WebSocket API
type FunASRProtocol struct {
	apiURL       string
	apiKey       string
	sampleRate   int
	language     string
	customParams string
}

// SetCustomParams sets user-defined JSON to merge into StartTaskFrame
func (f *FunASRProtocol) SetCustomParams(params string) {
	f.customParams = params
}

func NewFunASRProtocol(apiURL, apiKey string, sampleRate int, language string) *FunASRProtocol {
	// Convert http:// to ws:// for WebSocket
	wsURL := strings.Replace(apiURL, "http://", "ws://", 1)
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	if !strings.HasPrefix(wsURL, "ws") {
		wsURL = "ws://localhost:10095" // Default FunASR WS port
	}

	return &FunASRProtocol{
		apiURL:     wsURL,
		apiKey:     apiKey,
		sampleRate: sampleRate,
		language:   language,
	}
}

func (f *FunASRProtocol) Endpoint() string {
	return f.apiURL
}

func (f *FunASRProtocol) AuthHeaders() http.Header {
	headers := http.Header{}
	if f.apiKey != "" {
		headers.Set("Authorization", "Bearer "+f.apiKey)
	}
	return headers
}

func (f *FunASRProtocol) StartTaskFrame(taskID string, sampleRate int, language string) ([]byte, error) {
	startFrame := map[string]interface{}{
		"mode":           "2pass",
		"chunk_size":     []int{5, 10, 5},
		"chunk_interval": 10,
		"wav_name":       taskID,
		"is_speaking":    true,
	}

	if f.customParams != "" {
		var userParams map[string]interface{}
		if err := json.Unmarshal([]byte(f.customParams), &userParams); err != nil {
			log.Printf("[FunASR] WARNING: invalid customParams JSON, skipping: %v", err)
		} else {
			for k, v := range userParams {
				startFrame[k] = v
			}
			log.Printf("[FunASR] Merged %d custom params into StartTaskFrame", len(userParams))
		}
	}

	return json.Marshal(startFrame)
}

func (f *FunASRProtocol) StopTaskFrame(taskID string) ([]byte, error) {
	stopFrame := map[string]interface{}{
		"is_speaking": false,
	}
	return json.Marshal(stopFrame)
}

func (f *FunASRProtocol) ParseMessage(message []byte) (*StreamEvent, error) {
	var resp struct {
		Text    string `json:"text"`
		IsFinal bool   `json:"is_final"`
		Mode    string `json:"mode"`
		// Some FunASR forks include task_id or similar fields, but base doesn't strongly couple
	}

	if err := json.Unmarshal(message, &resp); err != nil {
		return nil, err
	}

	event := &StreamEvent{
		Text: strings.TrimSpace(resp.Text),
	}

	if resp.IsFinal {
		event.Type = EventFinal
	} else if resp.Mode == "online" || resp.Mode == "2pass-online" {
		event.Type = EventInterim
	} else {
		// If neither, we can guess based on is_final or mode
		event.Type = EventInterim
	}

	// FunASR usually sends an empty payload or special code when fully done
	// We'll trust the caller to close or a subsequent close frame check.
	return event, nil
}

func (f *FunASRProtocol) SendAudioAsBinary() bool {
	// FunASR receives audio as binary WS frames
	return true
}
