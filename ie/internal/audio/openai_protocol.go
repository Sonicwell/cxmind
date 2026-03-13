package audio

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
)

// OpenAIProtocol implements StreamProtocol for OpenAI Realtime WebSocket API
type OpenAIProtocol struct {
	apiURL       string
	apiKey       string
	model        string
	sampleRate   int
	language     string
	customParams string
}

// SetCustomParams sets user-defined JSON to merge into session.update
func (o *OpenAIProtocol) SetCustomParams(params string) {
	o.customParams = params
}

func NewOpenAIProtocol(apiURL, apiKey string, model string, sampleRate int, language string) *OpenAIProtocol {
	if apiURL == "" {
		apiURL = "wss://api.openai.com/v1/realtime"
	}
	if model == "" {
		model = "gpt-4o-realtime-preview"
	}

	return &OpenAIProtocol{
		apiURL:     apiURL,
		apiKey:     apiKey,
		model:      model,
		sampleRate: sampleRate,
		language:   language,
	}
}

func (o *OpenAIProtocol) Endpoint() string {
	// OpenAI passes the model name via URL query params
	return fmt.Sprintf("%s?model=%s", o.apiURL, o.model)
}

func (o *OpenAIProtocol) AuthHeaders() http.Header {
	headers := http.Header{}
	if o.apiKey != "" {
		headers.Set("Authorization", "Bearer "+o.apiKey)
	}
	headers.Set("OpenAI-Beta", "realtime=v1")
	return headers
}

func (o *OpenAIProtocol) StartTaskFrame(taskID string, sampleRate int, language string) ([]byte, error) {
	session := map[string]interface{}{
		"modalities": []string{"text"},
		"input_audio_transcription": map[string]interface{}{
			"model": "whisper-1",
		},
		"turn_detection": nil,
	}

	if o.customParams != "" {
		var userParams map[string]interface{}
		if err := json.Unmarshal([]byte(o.customParams), &userParams); err != nil {
			log.Printf("[OpenAI] WARNING: invalid customParams JSON, skipping: %v", err)
		} else {
			for k, v := range userParams {
				session[k] = v
			}
			log.Printf("[OpenAI] Merged %d custom params into session.update", len(userParams))
		}
	}

	startFrame := map[string]interface{}{
		"type":    "session.update",
		"session": session,
	}
	return json.Marshal(startFrame)
}

func (o *OpenAIProtocol) StopTaskFrame(taskID string) ([]byte, error) {
	// Commit the audio buffer to trigger a response
	stopFrame := map[string]interface{}{
		"type": "input_audio_buffer.commit",
	}
	return json.Marshal(stopFrame)
}

func (o *OpenAIProtocol) ParseMessage(message []byte) (*StreamEvent, error) {
	var resp struct {
		Type string `json:"type"`

		// For conversation.item.input_audio_transcription.completed
		Transcript string `json:"transcript"`

		// Error fields
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.Unmarshal(message, &resp); err != nil {
		return nil, err
	}

	event := &StreamEvent{}

	switch resp.Type {
	case "error":
		event.Type = EventTaskFailed
		event.Error = resp.Error.Message
		return event, nil

	case "conversation.item.input_audio_transcription.completed":
		event.Type = EventFinal
		event.Text = strings.TrimSpace(resp.Transcript)
		event.Confidence = 1.0 // OpenAI doesn't give confidence in realtime API yet
		return event, nil

	case "conversation.item.input_audio_transcription.failed":
		event.Type = EventTaskFailed
		event.Error = resp.Error.Message
		return event, nil

	default:
		// Ignore other Realtime API events like simple speech start/stop
		event.Type = EventUnknown
		return event, nil
	}
}

func (o *OpenAIProtocol) SendAudioAsBinary() bool {
	// OpenAI realtime expects base64 JSON, NOT raw binary frames
	return false
}
