package audio

import (
	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"

	"fmt"
	"log"
)

// ensure TencentProvider implements StreamingASRProvider
var _ StreamingASRProvider = (*TencentProvider)(nil)

// TencentProvider implements ASR using Tencent Cloud
type TencentProvider struct {
	appID  string
	apiKey string
}

// NewTencentProvider creates a new Tencent provider reading from config
func NewTencentProvider() *TencentProvider {
	return &TencentProvider{
		appID:  config.Global.GetString("asr.tencent.appid"),
		apiKey: config.Global.GetString("asr.tencent.key"), // Contains "SecretId,SecretKey"
	}
}

// Transcribe is currently not implemented for batch HTTP
func (t *TencentProvider) Transcribe(audio []byte, sampleRate int, language string) (*TranscriptionResult, error) {
	return nil, fmt.Errorf("Tencent Transcribe (batch) is not implemented natively yet, please use NewStream")
}

// NewStream creates a new streaming ASR session using Tencent WS via GenericPool
func (t *TencentProvider) NewStream(sampleRate int, language string) (ASRStream, error) {
	globalKey := config.Global.GetString("asr.tencent.key")
	var pool *GenericPool
	protocol := NewTencentProtocol(t.appID, t.apiKey, "", sampleRate)

	if t.apiKey != "" && t.apiKey != globalKey && globalKey != "" {
		if v, ok := ephemeralPools.Load("tencent:" + t.apiKey); ok {
			pool = v.(*GenericPool)
		} else {
			log.Printf("[Tencent] Creating ephemeral GenericPool for key: ***%s", maskKey(t.apiKey))
			pool = NewGenericPool("tencent-ephemeral", protocol, 1, 5)
			go pool.startCleanupWorker()
			ephemeralPools.Store("tencent:"+t.apiKey, pool)
			ephemeralPoolCreatedAt.Store("tencent:"+t.apiKey, timeutil.Now())
		}
	} else {
		poolKey := fmt.Sprintf("tencent_%s", t.appID)
		pool = GetOrCreatePool(poolKey, protocol)
	}

	handler, err := pool.NewTask(sampleRate, language)
	if err != nil {
		return nil, fmt.Errorf("failed to create Tencent task: %v", err)
	}

	stream := &TencentPoolStream{
		BasePoolStream: BasePoolStream{handler: handler},
	}

	return stream, nil
}

// TencentPoolStream wraps GenericTaskHandler to implement ASRStream for Tencent
type TencentPoolStream struct {
	BasePoolStream
}

// SendAudio marshals the audio as binary
func (s *TencentPoolStream) SendAudio(audio []byte) error {
	return s.handler.conn.SafeWriteMessage(2, audio) // websocket.BinaryMessage
}
