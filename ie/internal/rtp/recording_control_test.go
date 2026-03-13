package rtp

import (
	"sync"
	"testing"
)

// ========================================================================
// TDD Tests — Recording Pause/Resume Control
// ========================================================================

func TestRecordingControl_PauseAndResume(t *testing.T) {
	ctrl := NewRecordingControl()

	if ctrl.IsPaused("call-1") {
		t.Error("new call should not be paused")
	}

	ctrl.Pause("call-1")
	if !ctrl.IsPaused("call-1") {
		t.Error("call should be paused after Pause()")
	}

	ctrl.Resume("call-1")
	if ctrl.IsPaused("call-1") {
		t.Error("call should not be paused after Resume()")
	}
}

func TestRecordingControl_PauseIdempotent(t *testing.T) {
	ctrl := NewRecordingControl()
	ctrl.Pause("call-1")
	ctrl.Pause("call-1") // double pause should not panic
	if !ctrl.IsPaused("call-1") {
		t.Error("call should still be paused")
	}
}

func TestRecordingControl_ResumeWithoutPause(t *testing.T) {
	ctrl := NewRecordingControl()
	ctrl.Resume("call-never-paused") // should not panic
	if ctrl.IsPaused("call-never-paused") {
		t.Error("should not be paused")
	}
}

func TestRecordingControl_IndependentCalls(t *testing.T) {
	ctrl := NewRecordingControl()
	ctrl.Pause("call-A")

	if !ctrl.IsPaused("call-A") {
		t.Error("call-A should be paused")
	}
	if ctrl.IsPaused("call-B") {
		t.Error("call-B should NOT be paused")
	}
}

func TestRecordingControl_Cleanup(t *testing.T) {
	ctrl := NewRecordingControl()
	ctrl.Pause("call-1")
	ctrl.Cleanup("call-1")
	if ctrl.IsPaused("call-1") {
		t.Error("cleaned-up call should not be paused")
	}
}

func TestRecordingControl_Concurrent(t *testing.T) {
	ctrl := NewRecordingControl()
	var wg sync.WaitGroup

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			callID := "call-concurrent"
			ctrl.Pause(callID)
			ctrl.IsPaused(callID)
			ctrl.Resume(callID)
			ctrl.IsPaused(callID)
		}(i)
	}
	wg.Wait()
}

func TestRecordingControl_MutePayload(t *testing.T) {
	ctrl := NewRecordingControl()
	ctrl.Pause("call-1")

	original := []byte{0x01, 0x02, 0x03, 0x04}
	result := ctrl.MaybeSuppress("call-1", original)

	// When paused, payload should be all silence (0xFF)
	for i, b := range result {
		if b != 0xFF {
			t.Errorf("byte %d = 0x%02X, want 0xFF", i, b)
		}
	}

	// When resumed, payload passes through
	ctrl.Resume("call-1")
	result2 := ctrl.MaybeSuppress("call-1", original)
	for i, b := range result2 {
		if b != original[i] {
			t.Errorf("byte %d = 0x%02X, want 0x%02X", i, b, original[i])
		}
	}
}
