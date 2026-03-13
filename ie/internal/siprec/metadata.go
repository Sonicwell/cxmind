package siprec

import (
	"encoding/xml"
	"errors"
	"strings"
)

// RecordingMetadata represents parsed SIPREC Recording Metadata (RFC 7866).
type RecordingMetadata struct {
	Session      SessionInfo
	Participants []Participant
	Streams      []StreamInfo
}

// SessionInfo holds the recording session identification.
type SessionInfo struct {
	ID           string // session_id attribute
	SIPSessionID string // sipSessionID element
}

// Participant represents a call participant in the recording metadata.
type Participant struct {
	ID   string // participant_id attribute
	Name string // display name
	AOR  string // Address of Record (SIP URI)
}

// StreamInfo represents a media stream associated with a participant.
type StreamInfo struct {
	ID            string // stream_id attribute
	Label         string // label element (correlates to SDP a=label)
	ParticipantID string // associate-with-participant/@participant_id
}

// XML structures for unmarshaling RFC 7866 Recording Metadata

type xmlRecording struct {
	XMLName      xml.Name         `xml:"recording"`
	Session      xmlSession       `xml:"session"`
	Participants []xmlParticipant `xml:"participant"`
	Streams      []xmlStream      `xml:"stream"`
}

type xmlSession struct {
	ID           string `xml:"session_id,attr"`
	SIPSessionID string `xml:"sipSessionID"`
}

type xmlParticipant struct {
	ID     string    `xml:"participant_id,attr"`
	NameID xmlNameID `xml:"nameID"`
}

type xmlNameID struct {
	AOR  string `xml:"aor,attr"`
	Name string `xml:"name"`
}

type xmlStream struct {
	ID          string         `xml:"stream_id,attr"`
	Label       string         `xml:"label"`
	AssocPartic xmlAssocPartic `xml:"associate-with-participant"`
}

type xmlAssocPartic struct {
	ParticipantID string `xml:"participant_id,attr"`
}

// ParseRecordingMetadata parses a SIPREC Recording Metadata XML document (RFC 7866).
// Returns an error for empty or invalid XML input.
func ParseRecordingMetadata(xmlData string) (*RecordingMetadata, error) {
	if strings.TrimSpace(xmlData) == "" {
		return nil, errors.New("empty recording metadata XML")
	}

	var rec xmlRecording
	if err := xml.Unmarshal([]byte(xmlData), &rec); err != nil {
		return nil, err
	}

	md := &RecordingMetadata{
		Session: SessionInfo{
			ID:           rec.Session.ID,
			SIPSessionID: rec.Session.SIPSessionID,
		},
	}

	for _, p := range rec.Participants {
		md.Participants = append(md.Participants, Participant{
			ID:   p.ID,
			Name: p.NameID.Name,
			AOR:  p.NameID.AOR,
		})
	}

	for _, s := range rec.Streams {
		md.Streams = append(md.Streams, StreamInfo{
			ID:            s.ID,
			Label:         s.Label,
			ParticipantID: s.AssocPartic.ParticipantID,
		})
	}

	return md, nil
}
