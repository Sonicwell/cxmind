package rtp

import (
	"reflect"
	"sync"
	"testing"

	"github.com/cxmind/ingestion-go/internal/sip"
)

func TestRTPStream_UpdatePTMap(t *testing.T) {
	stream := &RTPStream{}

	// Initial get should be empty but safe
	initialMap := stream.GetPTMap()
	if len(initialMap) != 0 {
		t.Errorf("Expected empty initial map, got %v", initialMap)
	}

	newMap := map[uint8]sip.PTInfo{
		111: {CodecName: "opus", Channels: 2, ClockRateHz: 48000},
		9:   {CodecName: "g722", Channels: 1, ClockRateHz: 8000},
	}

	stream.UpdatePTMap(newMap)

	// Verify update
	updatedMap := stream.GetPTMap()
	if !reflect.DeepEqual(updatedMap, newMap) {
		t.Errorf("Expected updated map %v, got %v", newMap, updatedMap)
	}

	// Verify concurrent access
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		stream.UpdatePTMap(map[uint8]sip.PTInfo{100: {CodecName: "custom", Channels: 1, ClockRateHz: 8000}})
	}()

	go func() {
		defer wg.Done()
		_ = stream.GetPTMap()
	}()

	wg.Wait()
}
