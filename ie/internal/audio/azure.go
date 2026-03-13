package audio

import (
	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"

	"fmt"
	"log"
)

// ensure AzureProvider implements StreamingASRProvider
var _ StreamingASRProvider = (*AzureProvider)(nil)

// AzureProvider implements ASR using Azure Speech Services
type AzureProvider struct {
	apiURL string // usually the region
	apiKey string
}

// NewAzureProvider creates a new Azure provider reading from config
func NewAzureProvider() *AzureProvider {
	return &AzureProvider{
		apiURL: config.Global.GetString("asr.azure.url"), // region like eastus
		apiKey: config.Global.GetString("asr.azure.key"),
	}
}

// Transcribe is currently not fully implemented for Azure batch HTTP,
// Azure provides batch REST APIs but streaming WS is the focus here.
// For completeness, we mock it or return an error saying use Streaming.
func (a *AzureProvider) Transcribe(audio []byte, sampleRate int, language string) (*TranscriptionResult, error) {
	return nil, fmt.Errorf("Azure Transcribe (batch) is not implemented natively yet, please use NewStream")
}

// NewStream creates a new streaming ASR session using Azure WS via GenericPool
func (a *AzureProvider) NewStream(sampleRate int, language string) (ASRStream, error) {
	globalKey := config.Global.GetString("asr.azure.key")
	var pool *GenericPool
	protocol := NewAzureProtocol(a.apiURL, a.apiKey, sampleRate, language)

	if a.apiKey != "" && a.apiKey != globalKey && globalKey != "" {
		if v, ok := ephemeralPools.Load("azure:" + a.apiKey); ok {
			pool = v.(*GenericPool)
		} else {
			log.Printf("[Azure] Creating ephemeral GenericPool for key: ***%s", maskKey(a.apiKey))
			pool = NewGenericPool("azure-ephemeral", protocol, 1, 5)
			go pool.startCleanupWorker()
			ephemeralPools.Store("azure:"+a.apiKey, pool)
			ephemeralPoolCreatedAt.Store("azure:"+a.apiKey, timeutil.Now())
		}
	} else {
		// Global pool based on region
		poolKey := fmt.Sprintf("azure_%s", a.apiURL) // Assume url is region
		pool = GetOrCreatePool(poolKey, protocol)
	}

	handler, err := pool.NewTask(sampleRate, language)
	if err != nil {
		return nil, fmt.Errorf("failed to create Azure task: %v", err)
	}

	stream := &AzurePoolStream{
		BasePoolStream: BasePoolStream{handler: handler},
	}

	return stream, nil
}

// AzurePoolStream wraps GenericTaskHandler to implement ASRStream for Azure
type AzurePoolStream struct {
	BasePoolStream
}

// SendAudio marshals the audio as binary with Azure headers
func (s *AzurePoolStream) SendAudio(audio []byte) error {
	// Format audio frame with Azure prefix
	framedAudio := FormatAzureAudioFrame(audio, s.handler.TaskID())
	return s.handler.conn.SafeWriteMessage(2, framedAudio) // websocket.BinaryMessage
}
