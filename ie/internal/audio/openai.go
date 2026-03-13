package audio

import (
	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/gorilla/websocket"

	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"time"
)

// ensure OpenAIProvider implements StreamingASRProvider
var _ StreamingASRProvider = (*OpenAIProvider)(nil)

// OpenAIProvider implements ASR using OpenAI Whisper API (Batch) and Realtime API (Streaming)
type OpenAIProvider struct {
	apiKey string
	client *http.Client
}

// NewOpenAIProvider creates a new OpenAI Whisper provider
func NewOpenAIProvider() *OpenAIProvider {
	return &OpenAIProvider{
		apiKey: config.Global.GetString("asr.openai.key"),
		client: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

// Transcribe sends audio to OpenAI Whisper for batch transcription
func (o *OpenAIProvider) Transcribe(audio []byte, sampleRate int, language string) (*TranscriptionResult, error) {
	// OpenAI Whisper API requires multipart/form-data with file + model fields
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	// Add the model field
	writer.WriteField("model", "whisper-1")

	// Add the language field if specified
	if language != "" && language != "auto" {
		writer.WriteField("language", language)
	}

	// Add the audio file part
	part, err := writer.CreateFormFile("file", "audio.wav")
	if err != nil {
		return nil, fmt.Errorf("failed to create form file: %v", err)
	}
	part.Write(audio)
	writer.Close()

	req, err := http.NewRequest("POST", "https://api.openai.com/v1/audio/transcriptions", &body)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+o.apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := o.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("OpenAI Whisper API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Text string `json:"text"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &TranscriptionResult{
		Text:       result.Text,
		Timestamp:  timeutil.Now(),
		Confidence: 0.95,
		IsFinal:    true,
	}, nil
}

// NewStream creates a new streaming ASR session using OpenAI Realtime WS via GenericPool
func (o *OpenAIProvider) NewStream(sampleRate int, language string) (ASRStream, error) {
	globalKey := config.Global.GetString("asr.openai.key")
	var pool *GenericPool
	protocol := NewOpenAIProtocol("wss://api.openai.com/v1/realtime", o.apiKey, "gpt-4o-realtime-preview", sampleRate, language)

	if o.apiKey != "" && o.apiKey != globalKey && globalKey != "" {
		if v, ok := ephemeralPools.Load("openai:" + o.apiKey); ok {
			pool = v.(*GenericPool)
		} else {
			log.Printf("[OpenAI] Creating ephemeral GenericPool for key: ***%s", maskKey(o.apiKey))
			pool = NewGenericPool("openai-ephemeral", protocol, 1, 5)
			go pool.startCleanupWorker()
			ephemeralPools.Store("openai:"+o.apiKey, pool)
			ephemeralPoolCreatedAt.Store("openai:"+o.apiKey, timeutil.Now())
		}
	} else {
		// Global OpenAI Realtime pool
		pool = GetOrCreatePool("openai", protocol)
	}

	handler, err := pool.NewTask(sampleRate, language)
	if err != nil {
		return nil, fmt.Errorf("failed to create OpenAI task: %v", err)
	}

	stream := &OpenAIPoolStream{
		BasePoolStream: BasePoolStream{handler: handler},
	}

	return stream, nil
}

// OpenAIPoolStream wraps GenericTaskHandler to implement ASRStream for OpenAI
type OpenAIPoolStream struct {
	BasePoolStream
}

// SendAudio marshals the audio as base64 JSON for OpenAI Realtime API
func (s *OpenAIPoolStream) SendAudio(audio []byte) error {
	// Base64 encode outside the lock to minimize lock duration
	b64Audio := base64.StdEncoding.EncodeToString(audio)
	msg := map[string]interface{}{
		"type":  "input_audio_buffer.append",
		"audio": b64Audio,
	}

	jsonMsg, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return s.handler.conn.SafeWriteMessage(websocket.TextMessage, jsonMsg)
}
