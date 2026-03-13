package rtp

import (
	"fmt"
	"log"
	"strings"

	"github.com/cxmind/ingestion-go/internal/audio"
)

// EnableASRForCall dynamically enables ASR for all streams of a given call.
func (s *Sniffer) EnableASRForCall(callID string) error {
	var streams []*RTPStream

	// Collect streams from port-based listeners
	s.listeners.Range(func(_, value any) bool {
		stream := value.(*RTPStream)
		if stream.callID == callID {
			streams = append(streams, stream)
		}
		return true
	})

	// Collect streams from virtual listeners
	s.virtualListeners.Range(func(key, value any) bool {
		k := key.(string)
		stream := value.(*RTPStream)
		if stream.callID == callID || strings.HasPrefix(k, callID+":") {
			streams = append(streams, stream)
		}
		return true
	})

	if len(streams) == 0 {
		return fmt.Errorf("call %s not found", callID)
	}

	enabledCount := 0

	for _, stream := range streams {
		stream.mu.Lock()

		// Skip if already enabled
		if stream.stream != nil {
			log.Printf("ASR already enabled for call %s (stream already exists)", callID)
			stream.asrDisabled = false // Reset disable flag if dynamically enabled but stream existed
			stream.mu.Unlock()
			enabledCount++
			continue
		}

		provider := audio.GetCurrentASRProvider()
		streamProvider, ok := provider.(audio.StreamingASRProvider)
		if !ok {
			stream.mu.Unlock()
			log.Printf("ASR provider does not support streaming for call %s", callID)
			continue
		}

		role := stream.role
		if role == "" {
			role = stream.callerUser
		}
		if role == "" {
			role = stream.callerName
		}
		if role == "" {
			role = "unknown"
		}

		// Unlock before making the potentially blocking external request
		stream.mu.Unlock()

		enabledCount++

		// Perform connection async to prevent 5s timeout on Node.js Axios POST request
		go func(s *RTPStream, r string, sp audio.StreamingASRProvider) {
			log.Printf("Dynamically enabling ASR stream for call %s (Role: %s)", callID, r)

			asrStream, err := sp.NewStream(8000, "auto")
			if err != nil {
				log.Printf("Failed to start ASR stream for call %s: %v", callID, err)
				return
			}

			// Re-acquire lock to safely attach newly created resources
			s.mu.Lock()

			// Double-check if another concurrent operation already created it
			if s.stream != nil {
				log.Printf("ASR stream was concurrently created for call %s, discarding newly created one", callID)
				s.mu.Unlock()
				asrStream.Close()
				return
			}

			// Reset disable flag
			s.asrDisabled = false

			// Initialize VAD and assign ASR stream
			s.vad = NewVADFromConfig()
			s.stream = asrStream

			// Start result handler
			startASRResultHandler(callID, r, asrStream)

			log.Printf("ASR enabled successfully for call %s (Role: %s)", callID, r)
			s.mu.Unlock()
		}(stream, role, streamProvider)
	}

	if enabledCount == 0 {
		return fmt.Errorf("no suitable stream found to enable ASR for call %s", callID)
	}

	return nil
}

// DisableASRForCall dynamically disables ASR for all streams of a given call.
func (s *Sniffer) DisableASRForCall(callID string) error {
	var streams []*RTPStream

	// Collect streams from port-based listeners
	s.listeners.Range(func(_, value any) bool {
		stream := value.(*RTPStream)
		if stream.callID == callID {
			streams = append(streams, stream)
		}
		return true
	})

	// Collect streams from virtual listeners
	s.virtualListeners.Range(func(key, value any) bool {
		k := key.(string)
		stream := value.(*RTPStream)
		if stream.callID == callID || strings.HasPrefix(k, callID+":") {
			streams = append(streams, stream)
		}
		return true
	})

	if len(streams) == 0 {
		return fmt.Errorf("call %s not found", callID)
	}

	disabledCount := 0

	for _, stream := range streams {
		stream.mu.Lock()

		if stream.stream == nil {
			log.Printf("ASR not enabled for call %s (stream does not exist)", callID)
			stream.asrDisabled = true
			stream.mu.Unlock()
			continue
		}

		log.Printf("Dynamically disabling ASR for call %s", callID)

		// Close ASR stream and mark as completely disabled to prevent auto-restart
		stream.stream.Close()
		stream.stream = nil
		stream.vad = nil
		stream.asrDisabled = true

		log.Printf("ASR disabled successfully for call %s", callID)
		disabledCount++

		stream.mu.Unlock()
	}

	log.Printf("ASR disabled for %d streams of call %s", disabledCount, callID)
	return nil
}

// GetASRStatus returns the ASR status for all streams of a given call.
func (s *Sniffer) GetASRStatus(callID string) map[string]interface{} {
	var streams []*RTPStream

	// Collect streams from port-based listeners
	s.listeners.Range(func(_, value any) bool {
		stream := value.(*RTPStream)
		if stream.callID == callID {
			streams = append(streams, stream)
		}
		return true
	})

	// Collect streams from virtual listeners
	s.virtualListeners.Range(func(key, value any) bool {
		k := key.(string)
		stream := value.(*RTPStream)
		if stream.callID == callID || strings.HasPrefix(k, callID+":") {
			streams = append(streams, stream)
		}
		return true
	})

	if len(streams) == 0 {
		return nil
	}

	enabledCount := 0
	totalCount := len(streams)

	for _, stream := range streams {
		stream.mu.Lock()
		if stream.stream != nil {
			enabledCount++
		}
		stream.mu.Unlock()
	}

	return map[string]interface{}{
		"call_id":       callID,
		"total_streams": totalCount,
		"asr_enabled":   enabledCount,
		"asr_disabled":  totalCount - enabledCount,
	}
}
