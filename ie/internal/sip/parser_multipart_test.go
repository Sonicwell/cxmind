package sip

import (
	"testing"
)

// ========================================================================
// Phase 1 TDD Tests — Multipart MIME + Multi m=audio Support
// Written BEFORE implementation per TDD methodology.
// ========================================================================

// --- ParseMultipartBody Tests ---

func TestParseMultipartBody_TwoParts(t *testing.T) {
	msg := &SIPMessage{
		Headers: map[string][]string{
			"content-type": {"multipart/mixed;boundary=unique-boundary-1"},
		},
		Body: "--unique-boundary-1\r\n" +
			"Content-Type: application/sdp\r\n" +
			"\r\n" +
			"v=0\r\n" +
			"o=- 0 0 IN IP4 10.0.0.1\r\n" +
			"s=-\r\n" +
			"c=IN IP4 10.0.0.1\r\n" +
			"t=0 0\r\n" +
			"m=audio 20000 RTP/AVP 0\r\n" +
			"a=rtpmap:0 PCMU/8000\r\n" +
			"\r\n" +
			"--unique-boundary-1\r\n" +
			"Content-Type: application/rs-metadata+xml\r\n" +
			"\r\n" +
			"<recording xmlns='urn:ietf:params:xml:ns:recording:1'>\r\n" +
			"  <session>test</session>\r\n" +
			"</recording>\r\n" +
			"\r\n" +
			"--unique-boundary-1--\r\n",
	}

	parts := msg.ParseMultipartBody()
	if len(parts) != 2 {
		t.Fatalf("expected 2 parts, got %d", len(parts))
	}

	if parts[0].ContentType != "application/sdp" {
		t.Errorf("part[0] content-type = %q, want %q", parts[0].ContentType, "application/sdp")
	}
	if parts[1].ContentType != "application/rs-metadata+xml" {
		t.Errorf("part[1] content-type = %q, want %q", parts[1].ContentType, "application/rs-metadata+xml")
	}

	// Verify SDP body content
	if !containsString(parts[0].Body, "m=audio 20000") {
		t.Errorf("part[0] body missing 'm=audio 20000'")
	}

	// Verify XML body content
	if !containsString(parts[1].Body, "<recording") {
		t.Errorf("part[1] body missing '<recording'")
	}
}

func TestParseMultipartBody_NoBoundary(t *testing.T) {
	msg := &SIPMessage{
		Headers: map[string][]string{
			"content-type": {"application/sdp"},
		},
		Body: "v=0\r\no=- 0 0 IN IP4 10.0.0.1\r\n",
	}

	parts := msg.ParseMultipartBody()
	if len(parts) != 0 {
		t.Errorf("expected 0 parts for non-multipart, got %d", len(parts))
	}
}

func TestParseMultipartBody_EmptyBody(t *testing.T) {
	msg := &SIPMessage{
		Headers: map[string][]string{
			"content-type": {"multipart/mixed;boundary=abc"},
		},
		Body: "",
	}

	parts := msg.ParseMultipartBody()
	if len(parts) != 0 {
		t.Errorf("expected 0 parts for empty body, got %d", len(parts))
	}
}

func TestParseMultipartBody_MalformedParts(t *testing.T) {
	// Boundary present but no valid parts
	msg := &SIPMessage{
		Headers: map[string][]string{
			"content-type": {"multipart/mixed;boundary=xyz"},
		},
		Body: "this is not multipart at all",
	}

	parts := msg.ParseMultipartBody()
	// Should not panic, return empty or partial
	if len(parts) > 1 {
		t.Errorf("expected <= 1 parts for malformed body, got %d", len(parts))
	}
}

func TestParseMultipartBody_BoundaryWithQuotes(t *testing.T) {
	msg := &SIPMessage{
		Headers: map[string][]string{
			"content-type": {`multipart/mixed; boundary="quoted-boundary"`},
		},
		Body: "--quoted-boundary\r\n" +
			"Content-Type: application/sdp\r\n" +
			"\r\n" +
			"v=0\r\n" +
			"\r\n" +
			"--quoted-boundary--\r\n",
	}

	parts := msg.ParseMultipartBody()
	if len(parts) != 1 {
		t.Fatalf("expected 1 part, got %d", len(parts))
	}
	if parts[0].ContentType != "application/sdp" {
		t.Errorf("content-type = %q, want %q", parts[0].ContentType, "application/sdp")
	}
}

func TestParseMultipartBody_ThreeParts(t *testing.T) {
	msg := &SIPMessage{
		Headers: map[string][]string{
			"content-type": {"multipart/mixed;boundary=b1"},
		},
		Body: "--b1\r\n" +
			"Content-Type: application/sdp\r\n" +
			"\r\n" +
			"v=0\r\n" +
			"\r\n" +
			"--b1\r\n" +
			"Content-Type: application/rs-metadata+xml\r\n" +
			"\r\n" +
			"<recording/>\r\n" +
			"\r\n" +
			"--b1\r\n" +
			"Content-Type: text/plain\r\n" +
			"\r\n" +
			"extra data\r\n" +
			"\r\n" +
			"--b1--\r\n",
	}

	parts := msg.ParseMultipartBody()
	if len(parts) != 3 {
		t.Fatalf("expected 3 parts, got %d", len(parts))
	}
}

// --- ExtractAllMediaStreams Tests ---

func TestExtractAllMediaStreams_DualAudio(t *testing.T) {
	// Standard SIPREC SDP with 2 m=audio lines
	msg := &SIPMessage{
		Body: "v=0\r\n" +
			"o=- 0 0 IN IP4 10.0.0.1\r\n" +
			"s=-\r\n" +
			"c=IN IP4 10.0.0.1\r\n" +
			"t=0 0\r\n" +
			"m=audio 20000 RTP/AVP 0\r\n" +
			"a=rtpmap:0 PCMU/8000\r\n" +
			"a=label:1\r\n" +
			"a=sendonly\r\n" +
			"m=audio 20002 RTP/AVP 0\r\n" +
			"a=rtpmap:0 PCMU/8000\r\n" +
			"a=label:2\r\n" +
			"a=sendonly\r\n",
	}

	streams := msg.ExtractAllMediaStreams()
	if len(streams) != 2 {
		t.Fatalf("expected 2 streams, got %d", len(streams))
	}

	// Stream 1
	if streams[0].Port != 20000 {
		t.Errorf("stream[0].Port = %d, want 20000", streams[0].Port)
	}
	if streams[0].Label != "1" {
		t.Errorf("stream[0].Label = %q, want %q", streams[0].Label, "1")
	}
	if streams[0].ConnIP != "10.0.0.1" {
		t.Errorf("stream[0].ConnIP = %q, want %q", streams[0].ConnIP, "10.0.0.1")
	}

	// Stream 2
	if streams[1].Port != 20002 {
		t.Errorf("stream[1].Port = %d, want 20002", streams[1].Port)
	}
	if streams[1].Label != "2" {
		t.Errorf("stream[1].Label = %q, want %q", streams[1].Label, "2")
	}
}

func TestExtractAllMediaStreams_SingleAudio(t *testing.T) {
	// Backward compat: standard single m=audio SDP
	msg := &SIPMessage{
		Body: "v=0\r\n" +
			"o=- 0 0 IN IP4 192.168.1.100\r\n" +
			"s=-\r\n" +
			"c=IN IP4 192.168.1.100\r\n" +
			"t=0 0\r\n" +
			"m=audio 7078 RTP/AVP 0\r\n" +
			"a=rtpmap:0 PCMU/8000\r\n",
	}

	streams := msg.ExtractAllMediaStreams()
	if len(streams) != 1 {
		t.Fatalf("expected 1 stream, got %d", len(streams))
	}
	if streams[0].Port != 7078 {
		t.Errorf("stream[0].Port = %d, want 7078", streams[0].Port)
	}
	if streams[0].Codec != "PCMU" {
		t.Errorf("stream[0].Codec = %q, want %q", streams[0].Codec, "PCMU")
	}
}

func TestExtractAllMediaStreams_WithLabel(t *testing.T) {
	msg := &SIPMessage{
		Body: "v=0\r\n" +
			"o=- 0 0 IN IP4 10.0.0.1\r\n" +
			"s=-\r\n" +
			"t=0 0\r\n" +
			"m=audio 30000 RTP/AVP 0\r\n" +
			"c=IN IP4 10.0.0.1\r\n" +
			"a=rtpmap:0 PCMU/8000\r\n" +
			"a=label:caller-stream\r\n",
	}

	streams := msg.ExtractAllMediaStreams()
	if len(streams) != 1 {
		t.Fatalf("expected 1 stream, got %d", len(streams))
	}
	if streams[0].Label != "caller-stream" {
		t.Errorf("label = %q, want %q", streams[0].Label, "caller-stream")
	}
}

func TestExtractAllMediaStreams_SessionVsMediaConnIP(t *testing.T) {
	// Media-level c= should override session-level c=
	msg := &SIPMessage{
		Body: "v=0\r\n" +
			"o=- 0 0 IN IP4 10.0.0.1\r\n" +
			"s=-\r\n" +
			"c=IN IP4 10.0.0.1\r\n" +
			"t=0 0\r\n" +
			"m=audio 20000 RTP/AVP 0\r\n" +
			"c=IN IP4 10.0.0.99\r\n" +
			"a=rtpmap:0 PCMU/8000\r\n" +
			"m=audio 20002 RTP/AVP 0\r\n" +
			"a=rtpmap:0 PCMU/8000\r\n",
	}

	streams := msg.ExtractAllMediaStreams()
	if len(streams) != 2 {
		t.Fatalf("expected 2 streams, got %d", len(streams))
	}

	// Stream 1: has media-level c= → should use 10.0.0.99
	if streams[0].ConnIP != "10.0.0.99" {
		t.Errorf("stream[0].ConnIP = %q, want %q (media-level c= should override)", streams[0].ConnIP, "10.0.0.99")
	}

	// Stream 2: no media-level c= → should fall back to session-level 10.0.0.1
	if streams[1].ConnIP != "10.0.0.1" {
		t.Errorf("stream[1].ConnIP = %q, want %q (should fall back to session-level c=)", streams[1].ConnIP, "10.0.0.1")
	}
}

func TestExtractAllMediaStreams_RtcpMux(t *testing.T) {
	msg := &SIPMessage{
		Body: "v=0\r\n" +
			"o=- 0 0 IN IP4 10.0.0.1\r\n" +
			"s=-\r\n" +
			"c=IN IP4 10.0.0.1\r\n" +
			"t=0 0\r\n" +
			"m=audio 20000 RTP/AVP 0\r\n" +
			"a=rtpmap:0 PCMU/8000\r\n" +
			"a=rtcp-mux\r\n",
	}

	streams := msg.ExtractAllMediaStreams()
	if len(streams) != 1 {
		t.Fatalf("expected 1 stream, got %d", len(streams))
	}
	if !streams[0].RtcpMux {
		t.Errorf("stream[0].RtcpMux = false, want true")
	}
}

func TestExtractAllMediaStreams_EmptyBody(t *testing.T) {
	msg := &SIPMessage{Body: ""}
	streams := msg.ExtractAllMediaStreams()
	if len(streams) != 0 {
		t.Errorf("expected 0 streams for empty body, got %d", len(streams))
	}
}

func TestExtractAllMediaStreams_NoAudioMedia(t *testing.T) {
	msg := &SIPMessage{
		Body: "v=0\r\n" +
			"o=- 0 0 IN IP4 10.0.0.1\r\n" +
			"s=-\r\n" +
			"c=IN IP4 10.0.0.1\r\n" +
			"t=0 0\r\n" +
			"m=video 40000 RTP/AVP 96\r\n" +
			"a=rtpmap:96 H264/90000\r\n",
	}

	streams := msg.ExtractAllMediaStreams()
	if len(streams) != 0 {
		t.Errorf("expected 0 audio streams, got %d", len(streams))
	}
}

// --- Helper ---

func containsString(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && indexOfString(s, substr) >= 0
}

func indexOfString(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
