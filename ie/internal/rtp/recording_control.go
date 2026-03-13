package rtp

import "sync"

// ========================================================================
// Recording Pause/Resume Control (PCI-DSS Compliance)
// Allows per-call recording pause to prevent sensitive audio (e.g.
// credit card numbers) from being written to PCAP files.
// ========================================================================

// RecordingControl manages per-call recording pause state.
// Thread-safe via sync.Map for lock-free hot-path reads.
type RecordingControl struct {
	paused sync.Map // callID → bool
}

// globalRecordingControl is the singleton instance used by the PCAP recorder.
var globalRecordingControl = NewRecordingControl()

// GetRecordingControl returns the global recording control instance.
func GetRecordingControl() *RecordingControl {
	return globalRecordingControl
}

// NewRecordingControl creates a new RecordingControl instance.
func NewRecordingControl() *RecordingControl {
	return &RecordingControl{}
}

// Pause pauses recording for a specific call.
// While paused, audio payload will be replaced with silence in PCAP.
func (rc *RecordingControl) Pause(callID string) {
	rc.paused.Store(callID, true)
}

// Resume resumes recording for a specific call.
func (rc *RecordingControl) Resume(callID string) {
	rc.paused.Delete(callID)
}

// IsPaused returns whether recording is paused for a call.
func (rc *RecordingControl) IsPaused(callID string) bool {
	val, ok := rc.paused.Load(callID)
	if !ok {
		return false
	}
	return val.(bool)
}

// Cleanup removes the pause state for a call (called on call end).
func (rc *RecordingControl) Cleanup(callID string) {
	rc.paused.Delete(callID)
}

// MaybeSuppress returns silence if recording is paused, otherwise the original payload.
// This is the hot-path method called by the PCAP recorder on every RTP packet write.
func (rc *RecordingControl) MaybeSuppress(callID string, payload []byte) []byte {
	if !rc.IsPaused(callID) {
		return payload
	}

	// Replace with μ-law silence (0xFF)
	silenced := make([]byte, len(payload))
	for i := range silenced {
		silenced[i] = 0xFF
	}
	return silenced
}
