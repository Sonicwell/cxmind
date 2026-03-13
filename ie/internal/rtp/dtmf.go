package rtp

// ========================================================================
// DTMF Detection & Suppression (RFC 4733 / PCI-DSS Compliance)
// Detects telephone-event RTP payloads and replaces them with silence
// before writing to PCAP recordings. This prevents cardholder DTMF
// digits from being stored in recording files.
// ========================================================================

// dtmfPayloadTypes contains the common dynamic payload types used for
// RFC 4733 telephone-event. SDP typically negotiates these as PT 96-127.
var dtmfPayloadTypes = map[uint8]bool{
	96:  true,
	97:  true,
	100: true,
	101: true, // Most common default
	110: true,
	111: true,
}

// RegisterDTMFPayloadType adds a custom PT to the DTMF detection set.
// Call this after parsing SDP to register the actual negotiated PT.
func RegisterDTMFPayloadType(pt uint8) {
	dtmfPayloadTypes[pt] = true
}

// IsDTMFPayloadType checks if a payload type is registered as DTMF.
func IsDTMFPayloadType(pt uint8) bool {
	return dtmfPayloadTypes[pt]
}

// DetectDTMF checks if an RTP payload contains an RFC 4733 telephone-event.
// Returns the event digit (0-15) and whether it was detected as DTMF.
//
// RFC 4733 telephone-event payload format (4+ bytes):
//
//	Byte 0:   event (0-9=digits, 10=*, 11=#, 12-15=A-D)
//	Byte 1:   E(1bit) R(1bit) volume(6bits)
//	Byte 2-3: duration (16-bit, in timestamp units)
//
// Detection heuristic: RFC 4733 payloads are exactly 4 bytes (or multiples),
// and the event byte is 0-15. Normal G.711 audio is 160 bytes (20ms).
func DetectDTMF(payload []byte) (event byte, isDTMF bool) {
	if len(payload) == 0 {
		return 0, false
	}

	// RFC 4733 telephone-event payloads are typically 4 bytes
	// (single event) or 8 bytes (with redundancy).
	// Normal G.711 audio is 160+ bytes.
	if len(payload) != 4 && len(payload) != 8 {
		return 0, false
	}

	evt := payload[0]
	if evt > 15 {
		return 0, false // Valid DTMF events are 0-15
	}

	return evt, true
}

// SuppressDTMF replaces DTMF telephone-event payload with μ-law silence.
// If the payload is not DTMF, it passes through unchanged.
func SuppressDTMF(payload []byte) []byte {
	_, isDTMF := DetectDTMF(payload)
	if !isDTMF {
		return payload
	}

	// Replace with μ-law silence (0xFF)
	silenced := make([]byte, len(payload))
	for i := range silenced {
		silenced[i] = 0xFF
	}
	return silenced
}
