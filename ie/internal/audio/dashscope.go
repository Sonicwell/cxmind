package audio

import (
	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"

	"fmt"
	"log"
	"sync"
	"time"
)

// ensure DashScopeProvider implements StreamASRProvider
var _ StreamingASRProvider = (*DashScopeProvider)(nil)

// DashScopeProvider implements ASR using Alibaba Cloud DashScope WebSocket API via GenericPool
type DashScopeProvider struct {
	apiURL string
	apiKey string
}

// NewDashScopeProvider creates a new DashScope provider
func NewDashScopeProvider() *DashScopeProvider {
	return &DashScopeProvider{
		apiURL: config.Global.GetString("asr.dashscope.url"),
		apiKey: config.Global.GetString("asr.dashscope.key"),
	}
}

// Transcribe sends audio to DashScope for transcription (Batch wrapper)
func (d *DashScopeProvider) Transcribe(audio []byte, sampleRate int, language string) (*TranscriptionResult, error) {
	stream, err := d.NewStream(sampleRate, language)
	if err != nil {
		return nil, err
	}

	// Send all audio
	chunkSize := 3200
	for i := 0; i < len(audio); i += chunkSize {
		end := i + chunkSize
		if end > len(audio) {
			end = len(audio)
		}
		if err := stream.SendAudio(audio[i:end]); err != nil {
			stream.Close()
			return nil, err
		}
		time.Sleep(10 * time.Millisecond) // throttling
	}

	var finalResult *TranscriptionResult
	done := make(chan struct{})

	go func() {
		defer close(done)
		for res := range stream.Results() {
			r := res
			if r.IsFinal {
				finalResult = &r
				return
			}
		}
	}()

	// Close after starting the result listener to avoid premature channel close.
	// GenericTaskHandler.Close() will force a final result if needed.
	stream.Close()

	select {
	case <-done:
	case <-time.After(30 * time.Second):
		return nil, fmt.Errorf("timeout waiting for result from DashScope (30s)")
	}

	if finalResult == nil {
		return nil, fmt.Errorf("no final transcription result received")
	}

	return finalResult, nil
}

var ephemeralPools sync.Map         // map[string]*GenericPool (key is "vendor:apiKey")
var ephemeralPoolCreatedAt sync.Map // map[string]time.Time — tracks creation time for TTL

func init() {
	// Periodically clean up ephemeral pools older than 30 minutes
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			now := timeutil.Now()
			ephemeralPoolCreatedAt.Range(func(key, value any) bool {
				created := value.(time.Time)
				if now.Sub(created) > 30*time.Minute {
					if v, ok := ephemeralPools.LoadAndDelete(key); ok {
						pool := v.(*GenericPool)
						go pool.drainAndClose()
						log.Printf("[EphemeralPool] Cleaned up expired pool: %s", key)
					}
					ephemeralPoolCreatedAt.Delete(key)
				}
				return true
			})
		}
	}()
}

// NewStream creates a new streaming ASR session using GenericPool
func (d *DashScopeProvider) NewStream(sampleRate int, language string) (ASRStream, error) {
	globalKey := config.Global.GetString("asr.dashscope.key")
	var pool *GenericPool
	protocol := NewDashScopeProtocol(d.apiURL, d.apiKey)

	// If this provider is using a dynamic/ephemeral key different from global config,
	// use or create an ephemeral pool of size 1.
	if d.apiKey != "" && d.apiKey != globalKey && globalKey != "" {
		if v, ok := ephemeralPools.Load("dashscope:" + d.apiKey); ok {
			pool = v.(*GenericPool)
		} else {
			log.Printf("[DashScope] Creating ephemeral GenericPool for key: ***%s", maskKey(d.apiKey))
			pool = NewGenericPool("dashscope-ephemeral", protocol, 1, 5)
			go pool.startCleanupWorker()
			ephemeralPools.Store("dashscope:"+d.apiKey, pool)
			ephemeralPoolCreatedAt.Store("dashscope:"+d.apiKey, timeutil.Now())
		}
	} else {
		// Fallback to global DashScope pool via generic manager
		pool = GetOrCreatePool("dashscope", protocol)
	}

	handler, err := pool.NewTask(sampleRate, language)
	if err != nil {
		return nil, fmt.Errorf("failed to create task: %v", err)
	}

	stream := &DashScopePoolStream{
		BasePoolStream: BasePoolStream{handler: handler},
	}

	return stream, nil
}

// DashScopePoolStream wraps GenericTaskHandler to implement ASRStream
type DashScopePoolStream struct {
	BasePoolStream
}

// SendAudio marshals the audio as binary for DashScope (per protocol setting)
func (s *DashScopePoolStream) SendAudio(audio []byte) error {
	if s.handler.conn.pool.protocol.SendAudioAsBinary() {
		return s.handler.conn.SafeWriteMessage(2, audio) // 2 is websocket.BinaryMessage
	}
	return nil
}
