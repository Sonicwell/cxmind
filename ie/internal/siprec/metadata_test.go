package siprec

import (
	"testing"
)

// ========================================================================
// Phase 2 TDD Tests — SIPREC Recording Metadata XML Parser (RFC 7866)
// Written BEFORE implementation per TDD methodology.
// ========================================================================

func TestParseRecordingMetadata_Standard(t *testing.T) {
	xmlData := `<?xml version="1.0" encoding="UTF-8"?>
<recording xmlns="urn:ietf:params:xml:ns:recording:1">
  <datamode>complete</datamode>
  <session session_id="abc123">
    <sipSessionID>sip-session-001</sipSessionID>
  </session>
  <participant participant_id="part-1">
    <nameID aor="sip:alice@example.com">
      <name>Alice</name>
    </nameID>
  </participant>
  <participant participant_id="part-2">
    <nameID aor="sip:bob@example.com">
      <name>Bob</name>
    </nameID>
  </participant>
  <stream stream_id="stream-1" session_id="abc123">
    <label>1</label>
    <associate-with-participant participant_id="part-1"/>
  </stream>
  <stream stream_id="stream-2" session_id="abc123">
    <label>2</label>
    <associate-with-participant participant_id="part-2"/>
  </stream>
</recording>`

	md, err := ParseRecordingMetadata(xmlData)
	if err != nil {
		t.Fatalf("ParseRecordingMetadata error: %v", err)
	}

	if md.Session.ID != "abc123" {
		t.Errorf("Session.ID = %q, want %q", md.Session.ID, "abc123")
	}

	if len(md.Participants) != 2 {
		t.Fatalf("expected 2 participants, got %d", len(md.Participants))
	}

	if md.Participants[0].AOR != "sip:alice@example.com" {
		t.Errorf("p[0].AOR = %q, want %q", md.Participants[0].AOR, "sip:alice@example.com")
	}
	if md.Participants[0].Name != "Alice" {
		t.Errorf("p[0].Name = %q, want %q", md.Participants[0].Name, "Alice")
	}

	if md.Participants[1].AOR != "sip:bob@example.com" {
		t.Errorf("p[1].AOR = %q, want %q", md.Participants[1].AOR, "sip:bob@example.com")
	}

	if len(md.Streams) != 2 {
		t.Fatalf("expected 2 streams, got %d", len(md.Streams))
	}

	if md.Streams[0].Label != "1" {
		t.Errorf("stream[0].Label = %q, want %q", md.Streams[0].Label, "1")
	}
	if md.Streams[0].ParticipantID != "part-1" {
		t.Errorf("stream[0].ParticipantID = %q, want %q", md.Streams[0].ParticipantID, "part-1")
	}
}

func TestParseRecordingMetadata_MultiParticipant(t *testing.T) {
	xmlData := `<?xml version="1.0" encoding="UTF-8"?>
<recording xmlns="urn:ietf:params:xml:ns:recording:1">
  <session session_id="conf-001"/>
  <participant participant_id="p1">
    <nameID aor="sip:a@ex.com"><name>A</name></nameID>
  </participant>
  <participant participant_id="p2">
    <nameID aor="sip:b@ex.com"><name>B</name></nameID>
  </participant>
  <participant participant_id="p3">
    <nameID aor="sip:c@ex.com"><name>C</name></nameID>
  </participant>
  <stream stream_id="s1" session_id="conf-001">
    <label>1</label>
    <associate-with-participant participant_id="p1"/>
  </stream>
  <stream stream_id="s2" session_id="conf-001">
    <label>2</label>
    <associate-with-participant participant_id="p2"/>
  </stream>
  <stream stream_id="s3" session_id="conf-001">
    <label>3</label>
    <associate-with-participant participant_id="p3"/>
  </stream>
</recording>`

	md, err := ParseRecordingMetadata(xmlData)
	if err != nil {
		t.Fatalf("error: %v", err)
	}

	if len(md.Participants) != 3 {
		t.Errorf("expected 3 participants, got %d", len(md.Participants))
	}
	if len(md.Streams) != 3 {
		t.Errorf("expected 3 streams, got %d", len(md.Streams))
	}
}

func TestParseRecordingMetadata_MissingFields(t *testing.T) {
	// Minimal valid XML — missing name, label
	xmlData := `<recording xmlns="urn:ietf:params:xml:ns:recording:1">
  <session session_id="s1"/>
  <participant participant_id="p1">
    <nameID aor="sip:user@host"/>
  </participant>
  <stream stream_id="st1" session_id="s1">
    <associate-with-participant participant_id="p1"/>
  </stream>
</recording>`

	md, err := ParseRecordingMetadata(xmlData)
	if err != nil {
		t.Fatalf("error: %v", err)
	}

	if len(md.Participants) != 1 {
		t.Fatalf("expected 1 participant, got %d", len(md.Participants))
	}
	if md.Participants[0].Name != "" {
		t.Errorf("expected empty name, got %q", md.Participants[0].Name)
	}
	if md.Participants[0].AOR != "sip:user@host" {
		t.Errorf("AOR = %q, want %q", md.Participants[0].AOR, "sip:user@host")
	}
}

func TestParseRecordingMetadata_InvalidXML(t *testing.T) {
	_, err := ParseRecordingMetadata("<this is not valid xml")
	if err == nil {
		t.Error("expected error for invalid XML, got nil")
	}
}

func TestParseRecordingMetadata_EmptyInput(t *testing.T) {
	_, err := ParseRecordingMetadata("")
	if err == nil {
		t.Error("expected error for empty input, got nil")
	}
}
