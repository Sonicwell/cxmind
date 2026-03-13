package audio

import (
	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"

	"fmt"
	"time"
)

// ensure DeepgramProvider implements StreamingASRProvider
var _ StreamingASRProvider = (*DeepgramProvider)(nil)

// DeepgramProvider implements ASR using Deepgram WebSocket API via GenericPool
type DeepgramProvider struct {
	apiURL string
	apiKey string
}

// NewDeepgramProvider creates a new Deepgram provider
func NewDeepgramProvider() *DeepgramProvider {
	return &DeepgramProvider{
		apiURL: config.Global.GetString("asr.deepgram.url"),
		apiKey: config.Global.GetString("asr.deepgram.key"),
	}
}

// Transcribe sends audio to Deepgram for transcription (Batch wrapper)
func (d *DeepgramProvider) Transcribe(audio []byte, sampleRate int, language string) (*TranscriptionResult, error) {
	stream, err := d.NewStream(sampleRate, language)
	if err != nil {
		return nil, err
	}

	// Send all audio in chunks
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

	// Close after starting the result listener to avoid premature channel close
	stream.Close()

	select {
	case <-done:
	case <-time.After(30 * time.Second):
		return nil, fmt.Errorf("timeout waiting for result from Deepgram (30s)")
	}

	if finalResult == nil {
		return nil, fmt.Errorf("no final transcription result received")
	}

	return finalResult, nil
}

// NewStream creates a new streaming ASR session using GenericPool
func (d *DeepgramProvider) NewStream(sampleRate int, language string) (ASRStream, error) {
	globalKey := config.Global.GetString("asr.deepgram.key")
	var pool *GenericPool
	protocol := NewDeepgramProtocol(d.apiURL, d.apiKey, sampleRate, language)

	// Since Deepgram requires options in the URL itself (like sampleRate and language),
	// we cannot easily reuse the exact same WebSocket connection across tasks with DIFFERENT
	// sample rates or languages.
	// For now, we assume standard 8000Hz PCM telephony for the ingestion pipeline.
	// If it changes, GenericPool will establish a new connection since the URL might differ,
	// wait, GenericPool uses a fixed Endpoint string from the protocol which might bind the pool
	// strictly to those parameters.

	// Ephemeral pool handling for API key overrides
	if d.apiKey != "" && d.apiKey != globalKey && globalKey != "" {
		if v, ok := ephemeralPools.Load("deepgram:" + d.apiKey); ok {
			pool = v.(*GenericPool)
		} else {
			pool = NewGenericPool("deepgram-ephemeral", protocol, 1, 5)
			go pool.startCleanupWorker()
			ephemeralPools.Store("deepgram:"+d.apiKey, pool)
			ephemeralPoolCreatedAt.Store("deepgram:"+d.apiKey, timeutil.Now())
		}
	} else {
		// Global Deepgram pool
		// Cache key includes sample rate and language to isolate pools if they differ.
		// Standard call is 8000Hz "auto".
		poolKey := fmt.Sprintf("deepgram_%d_%s", sampleRate, language)
		pool = GetOrCreatePool(poolKey, protocol)
	}

	handler, err := pool.NewTask(sampleRate, language)
	if err != nil {
		return nil, fmt.Errorf("failed to create Deepgram task: %v", err)
	}

	stream := &DeepgramPoolStream{
		BasePoolStream: BasePoolStream{handler: handler},
	}

	return stream, nil
}

// DeepgramPoolStream wraps GenericTaskHandler to implement ASRStream
type DeepgramPoolStream struct {
	BasePoolStream
}

// SendAudio marshals the audio as binary for Deepgram
func (s *DeepgramPoolStream) SendAudio(audio []byte) error {
	if s.handler.conn.pool.protocol.SendAudioAsBinary() {
		return s.handler.conn.SafeWriteMessage(2, audio) // websocket.BinaryMessage
	}
	return nil
}
