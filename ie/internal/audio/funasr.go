package audio

import (
	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"

	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// ensure FunASRProvider implements StreamingASRProvider
var _ StreamingASRProvider = (*FunASRProvider)(nil)

// FunASRProvider implements ASR using FunASR API
type FunASRProvider struct {
	apiURL string
	apiKey string
	client *http.Client
}

// NewFunASRProvider creates a new FunASR provider
func NewFunASRProvider() *FunASRProvider {
	return &FunASRProvider{
		apiURL: config.Global.GetString("asr.funasr.url"),
		apiKey: config.Global.GetString("asr.funasr.key"),
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Transcribe sends audio to FunASR for transcription (Batch POST)
func (f *FunASRProvider) Transcribe(audio []byte, sampleRate int, language string) (*TranscriptionResult, error) {
	payload := map[string]interface{}{
		"audio":       audio,
		"sample_rate": sampleRate,
		"language":    language,
		"format":      "pcm",
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", f.apiURL+"/transcribe", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	if f.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+f.apiKey)
	}

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ASR API error: %s", string(body))
	}

	var result struct {
		Text       string  `json:"text"`
		Confidence float64 `json:"confidence"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &TranscriptionResult{
		Text:       result.Text,
		Timestamp:  timeutil.Now(),
		Confidence: result.Confidence,
		IsFinal:    true,
	}, nil
}

// NewStream creates a new streaming ASR session using FunASR websocket via GenericPool
func (f *FunASRProvider) NewStream(sampleRate int, language string) (ASRStream, error) {
	globalKey := config.Global.GetString("asr.funasr.key")
	var pool *GenericPool
	protocol := NewFunASRProtocol(f.apiURL, f.apiKey, sampleRate, language)

	// Since FunASR websocket URL doesn't strictly bake in sample_rate, we could share pools.
	// But it's safer to isolate by sampleRate/language if they vary. Assume 8000Hz mostly.

	if f.apiKey != "" && f.apiKey != globalKey && globalKey != "" {
		if v, ok := ephemeralPools.Load("funasr:" + f.apiKey); ok {
			pool = v.(*GenericPool)
		} else {
			log.Printf("[FunASR] Creating ephemeral GenericPool for key: ***%s", maskKey(f.apiKey))
			pool = NewGenericPool("funasr-ephemeral", protocol, 1, 5)
			go pool.startCleanupWorker()
			ephemeralPools.Store("funasr:"+f.apiKey, pool)
			ephemeralPoolCreatedAt.Store("funasr:"+f.apiKey, timeutil.Now())
		}
	} else {
		poolKey := fmt.Sprintf("funasr_%d_%s", sampleRate, language)
		pool = GetOrCreatePool(poolKey, protocol)
	}

	handler, err := pool.NewTask(sampleRate, language)
	if err != nil {
		return nil, fmt.Errorf("failed to create FunASR task: %v", err)
	}

	stream := &FunASRPoolStream{
		BasePoolStream: BasePoolStream{handler: handler},
	}

	return stream, nil
}

// FunASRPoolStream wraps GenericTaskHandler to implement ASRStream
type FunASRPoolStream struct {
	BasePoolStream
}

// SendAudio marshals the audio as binary for FunASR WS
func (s *FunASRPoolStream) SendAudio(audio []byte) error {
	// FunASR accepts binary audio payload over websocket
	if s.handler.conn.pool.protocol.SendAudioAsBinary() {
		return s.handler.conn.SafeWriteMessage(2, audio) // websocket.BinaryMessage
	}
	return nil
}
