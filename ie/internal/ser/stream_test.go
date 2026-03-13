package ser

import (
	"testing"
	"time"

	"github.com/spf13/viper"
)

func TestNewSERStream(t *testing.T) {
	monitor := NewResourceMonitor(80.0, "node1", nil)
	stream := NewSERStream("call-123", "caller", nil, monitor, nil)

	if stream.callID != "call-123" {
		t.Errorf("Expected callID call-123, got %s", stream.callID)
	}
	if stream.role != "caller" {
		t.Errorf("Expected role caller, got %s", stream.role)
	}

	expectedBufferSize := int(float64(InputSampleRate) * SERWindowSize.Seconds())
	if stream.bufferSize != expectedBufferSize {
		t.Errorf("Expected bufferSize %d, got %d", expectedBufferSize, stream.bufferSize)
	}
	if cap(stream.buffer) != expectedBufferSize {
		t.Errorf("Expected buffer capacity %d, got %d", expectedBufferSize, cap(stream.buffer))
	}
}

func TestProcessAudio_PostCallMode(t *testing.T) {
	monitor := NewResourceMonitor(80.0, "node1", nil)
	monitor.mode = ModePostCall

	stream := NewSERStream("call-1", "caller", nil, monitor, nil)

	// Process some audio
	pcm := make([]byte, 100)
	stream.ProcessAudio(pcm)

	// Buffer should remain empty because it's PostCall mode
	if len(stream.buffer) > 0 {
		t.Errorf("Expected empty buffer in PostCall mode, got length %d", len(stream.buffer))
	}
}

func TestProcessAudio_ConversionAndBuffering(t *testing.T) {
	monitor := NewResourceMonitor(80.0, "node1", nil)
	monitor.mode = ModeRealtime

	stream := NewSERStream("call-1", "caller", nil, monitor, nil)
	// Override buffer size for easier testing
	stream.bufferSize = 4

	// 4 samples = 8 bytes. Values: 0x0000 (0), 0x7FFF (32767), 0x8000 (-32768)
	// Little endian representation
	pcm := []byte{
		0x00, 0x00, // 0
		0xFF, 0x7F, // 32767 -> ~1.0
		0x00, 0x80, // -32768 -> -1.0
		// One extra sample that should trigger a flush
		0x00, 0x00,
	}

	stream.ProcessAudio(pcm)

	// Since buffer size is 4, processing 4 samples should have triggered a flush, which empties the active buffer
	if len(stream.buffer) > 0 {
		t.Errorf("Expected buffer to be flushed and active buffer empty, got length %d", len(stream.buffer))
	}
}

func TestFlushAndAnalyze_NilAnalyzerAndNotRemote(t *testing.T) {
	viper.Set("ser.mode", "local")
	defer viper.Reset()

	monitor := NewResourceMonitor(80.0, "node1", nil)
	stream := NewSERStream("call-1", "caller", nil, monitor, nil)
	stream.buffer = []float32{0.1, 0.2, 0.3}

	stream.flushAndAnalyze()

	if len(stream.buffer) != 0 {
		t.Errorf("Expected buffer to be cleared, got length %d", len(stream.buffer))
	}
}

func TestFlushAndAnalyze_PostCallModeBackground(t *testing.T) {
	viper.Set("ser.mode", "remote")
	defer viper.Reset()

	monitor := NewResourceMonitor(80.0, "node1", nil)
	monitor.mode = ModeRealtime

	stream := NewSERStream("call-1", "caller", nil, monitor, nil)
	stream.buffer = []float32{0.1, 0.2, 0.3}

	// Change mode to postcall right before flushing
	monitor.mode = ModePostCall
	stream.flushAndAnalyze()

	// Need a small sleep since flush is async
	time.Sleep(50 * time.Millisecond)

	if len(stream.buffer) != 0 {
		t.Errorf("Active buffer should be cleared immediately")
	}
}
