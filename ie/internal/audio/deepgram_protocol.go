package audio

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// DeepgramProtocol implements StreamProtocol for Deepgram WebSocket API
type DeepgramProtocol struct {
	apiURL     string
	apiKey     string
	sampleRate int
	language   string
}

func NewDeepgramProtocol(apiURL, apiKey string, sampleRate int, language string) *DeepgramProtocol {
	if apiURL == "" {
		apiURL = "wss://api.deepgram.com/v1/listen"
	}
	return &DeepgramProtocol{
		apiURL:     apiURL,
		apiKey:     apiKey,
		sampleRate: sampleRate,
		language:   language,
	}
}

func (d *DeepgramProtocol) Endpoint() string {
	// Deepgram configures options in the URL query parameters
	endpoint := fmt.Sprintf("%s?encoding=linear16&sample_rate=%d&channels=1", d.apiURL, d.sampleRate)

	// Add language if specified, otherwise Deepgram auto-detects
	if d.language != "" && d.language != "auto" {
		endpoint += fmt.Sprintf("&language=%s", d.language)
	}

	// Recommended config for telephony UI
	endpoint += "&interim_results=true&endpointing=500&smart_format=true"

	return endpoint
}

func (d *DeepgramProtocol) AuthHeaders() http.Header {
	headers := http.Header{}
	headers.Set("Authorization", "Token "+d.apiKey)
	return headers
}

func (d *DeepgramProtocol) StartTaskFrame(taskID string, sampleRate int, language string) ([]byte, error) {
	// Deepgram does not require a start frame. Options are passed in the URL.
	// We save the sampleRate/language during creation to construct the Endpoint properly.
	return nil, nil
}

func (d *DeepgramProtocol) StopTaskFrame(taskID string) ([]byte, error) {
	stopFrame := map[string]interface{}{
		"type": "CloseStream",
	}
	return json.Marshal(stopFrame)
}

func (d *DeepgramProtocol) ParseMessage(message []byte) (*StreamEvent, error) {
	var resp struct {
		Type    string `json:"type"`
		Channel struct {
			Alternatives []struct {
				Transcript string  `json:"transcript"`
				Confidence float64 `json:"confidence"`
				Words      []struct {
					Word  string  `json:"word"`
					Start float64 `json:"start"`
					End   float64 `json:"end"`
				} `json:"words"`
			} `json:"alternatives"`
		} `json:"channel"`
		IsFinal     bool    `json:"is_final"`
		SpeechFinal bool    `json:"speech_final"`
		Start       float64 `json:"start"`    // in seconds
		Duration    float64 `json:"duration"` // in seconds
		Error       string  `json:"error"`
	}

	if err := json.Unmarshal(message, &resp); err != nil {
		return nil, err
	}

	event := &StreamEvent{}

	if resp.Type == "Error" || resp.Error != "" {
		event.Type = EventTaskFailed
		event.Error = resp.Error
		if event.Error == "" {
			event.Error = "Deepgram unknown error"
		}
		return event, nil
	}

	if resp.Type == "CloseStream" {
		event.Type = EventTaskFinished
		return event, nil
	}

	if resp.Type == "Results" {
		if len(resp.Channel.Alternatives) > 0 {
			alt := resp.Channel.Alternatives[0]
			event.Text = strings.TrimSpace(alt.Transcript)
			event.Confidence = alt.Confidence
			event.BeginTime = int64(resp.Start * 1000)
			event.EndTime = event.BeginTime + int64(resp.Duration*1000)

			if resp.IsFinal || resp.SpeechFinal {
				event.Type = EventFinal
			} else {
				event.Type = EventInterim
			}

			// Some empty interim results are sent by Deepgram; we pass them as long as it's not final
			// or if it's final because we want to trigger speech_final logic.
			return event, nil
		}
	}

	event.Type = EventUnknown
	return event, nil
}

func (d *DeepgramProtocol) SendAudioAsBinary() bool {
	// Deepgram requires raw binary audio matching the encoding specified in the URL params
	return true
}
