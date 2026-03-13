package audio

import (
	"fmt"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// MockASRProvider for testing
type MockASRProvider struct{}

func NewMockASRProvider() *MockASRProvider {
	return &MockASRProvider{}
}

func (m *MockASRProvider) Transcribe(audio []byte, sampleRate int, language string) (*TranscriptionResult, error) {
	return &TranscriptionResult{
		Text:       "This is a mock transcription",
		Timestamp:  timeutil.Now(),
		Confidence: 0.99,
		IsFinal:    true,
		Speaker:    "mock",
	}, nil
}

func (m *MockASRProvider) NewStream(sampleRate int, language string) (ASRStream, error) {
	stream := &MockASRStream{
		results: make(chan TranscriptionResult, 10),
		errors:  make(chan error, 1),
		stop:    make(chan struct{}),
	}
	stream.start()
	return stream, nil
}

type MockASRStream struct {
	results chan TranscriptionResult
	errors  chan error
	stop    chan struct{}
}

func (s *MockASRStream) start() {
	go func() {
		defer close(s.results)
		defer close(s.errors)

		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		i := 0
		for {
			select {
			case <-s.stop:
				return
			case <-ticker.C:
				i++
				select {
				case s.results <- TranscriptionResult{
					Text:       fmt.Sprintf("Mock transcription segment %d", i),
					Timestamp:  timeutil.Now(),
					Confidence: 0.98,
					IsFinal:    true,
				}:
				case <-s.stop:
					return
				}
			}
		}
	}()
}

func (s *MockASRStream) SendAudio(data []byte) error {
	select {
	case <-s.stop:
		return fmt.Errorf("stream closed")
	default:
		return nil
	}
}

func (s *MockASRStream) Close() error {
	select {
	case <-s.stop:
		return nil // already closed
	default:
		close(s.stop)
	}
	return nil
}

func (s *MockASRStream) Results() <-chan TranscriptionResult {
	return s.results
}

func (s *MockASRStream) Errors() <-chan error {
	return s.errors
}
