package audio

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// ensure GoogleProvider implements ASRProvider (batch only for now)
var _ ASRProvider = (*GoogleProvider)(nil)

// GoogleProvider implements ASR using Google Cloud Speech-to-Text REST API
// Uses V1 REST API to avoid heavy gRPC SDK dependency (~100MB).
// For streaming, we implement a polling-based approach using longrunningrecognize.
type GoogleProvider struct {
	apiKey    string
	projectID string
	model     string // e.g. "latest_long", "latest_short", "phone_call"
	client    *http.Client
}

// NewGoogleProvider creates a new Google provider reading from config
func NewGoogleProvider() *GoogleProvider {
	return &GoogleProvider{
		apiKey:    config.Global.GetString("asr.google.key"),
		projectID: config.Global.GetString("asr.google.project"),
		model:     config.Global.GetString("asr.google.model"),
		client:    &http.Client{Timeout: 120 * time.Second},
	}
}

// googleRecognizeRequest is the request body for Google Speech-to-Text V1 recognize
type googleRecognizeRequest struct {
	Config struct {
		Encoding        string `json:"encoding"`
		SampleRateHertz int    `json:"sampleRateHertz"`
		LanguageCode    string `json:"languageCode"`
		Model           string `json:"model,omitempty"`
		UseEnhanced     bool   `json:"useEnhanced,omitempty"`
	} `json:"config"`
	Audio struct {
		Content string `json:"content"` // base64 encoded
	} `json:"audio"`
}

// googleRecognizeResponse is the response body
type googleRecognizeResponse struct {
	Results []struct {
		Alternatives []struct {
			Transcript string  `json:"transcript"`
			Confidence float64 `json:"confidence"`
		} `json:"alternatives"`
	} `json:"results"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// Transcribe sends audio to Google Cloud Speech-to-Text V1 REST API
func (g *GoogleProvider) Transcribe(audio []byte, sampleRate int, language string) (*TranscriptionResult, error) {
	if g.apiKey == "" {
		return nil, fmt.Errorf("Google API key is not configured")
	}

	if language == "" || language == "auto" {
		language = "en-US"
	}

	model := g.model
	if model == "" {
		model = "latest_long"
	}

	reqBody := googleRecognizeRequest{}
	reqBody.Config.Encoding = "LINEAR16"
	reqBody.Config.SampleRateHertz = sampleRate
	reqBody.Config.LanguageCode = language
	reqBody.Config.Model = model
	reqBody.Config.UseEnhanced = true
	reqBody.Audio.Content = base64.StdEncoding.EncodeToString(audio)

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %v", err)
	}

	url := "https://speech.googleapis.com/v1/speech:recognize"

	req, err := http.NewRequest("POST", url, bytes.NewReader(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", g.apiKey)

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Google Speech API call failed: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %v", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Google Speech API returned status %d: %s", resp.StatusCode, string(body))
	}

	var recognizeResp googleRecognizeResponse
	if err := json.Unmarshal(body, &recognizeResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %v", err)
	}

	if recognizeResp.Error != nil {
		return nil, fmt.Errorf("Google Speech API error %d: %s", recognizeResp.Error.Code, recognizeResp.Error.Message)
	}

	result := &TranscriptionResult{}
	var totalChars int
	var weightedConf float64
	for _, r := range recognizeResp.Results {
		if len(r.Alternatives) > 0 {
			transcript := r.Alternatives[0].Transcript
			result.Text += transcript
			chars := len(transcript)
			totalChars += chars
			weightedConf += r.Alternatives[0].Confidence * float64(chars)
		}
	}
	if totalChars > 0 {
		result.Confidence = weightedConf / float64(totalChars)
	}

	log.Printf("[Google] Transcribed %d bytes -> %d chars", len(audio), len(result.Text))
	return result, nil
}
