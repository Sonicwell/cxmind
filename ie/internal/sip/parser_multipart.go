package sip

import (
	"strconv"
	"strings"
)

// MIMEPart represents a single part within a multipart MIME body.
type MIMEPart struct {
	ContentType string
	Body        string
}

// MediaStream represents an audio media stream extracted from SDP.
type MediaStream struct {
	Port    int    // RTP port from m=audio line
	ConnIP  string // Connection IP (media-level c= or session-level c=)
	Codec   string // Primary codec name (e.g. "PCMU")
	Label   string // a=label value (used by SIPREC to correlate participants)
	RtcpMux bool   // true if a=rtcp-mux is present
}

// ParseMultipartBody parses a multipart/mixed SIP body into individual MIME parts.
// Returns nil/empty if the Content-Type is not multipart or no valid parts found.
func (m *SIPMessage) ParseMultipartBody() []MIMEPart {
	if m.Body == "" {
		return nil
	}

	// Extract boundary from Content-Type header
	contentType := m.GetHeader("content-type")
	if contentType == "" {
		return nil
	}

	boundary := extractBoundary(contentType)
	if boundary == "" {
		return nil
	}

	delimiter := "--" + boundary
	closeDelimiter := delimiter + "--"

	// Normalize line endings in body
	body := strings.ReplaceAll(m.Body, "\r\n", "\n")

	// Split by delimiter
	sections := strings.Split(body, delimiter)
	var parts []MIMEPart

	for _, section := range sections {
		section = strings.TrimSpace(section)

		// Skip empty, preamble, and closing delimiter
		if section == "" || section == "--" || strings.HasPrefix(section, closeDelimiter) {
			continue
		}
		// Remove trailing close delimiter marker if present
		if strings.HasSuffix(section, "--") {
			section = strings.TrimSuffix(section, "--")
			section = strings.TrimSpace(section)
		}

		// Parse part headers and body (separated by empty line)
		headerEnd := strings.Index(section, "\n\n")
		if headerEnd == -1 {
			// No body separator — skip malformed part
			continue
		}

		partHeaders := section[:headerEnd]
		partBody := strings.TrimSpace(section[headerEnd+2:])

		// Extract Content-Type from part headers
		partCT := ""
		for _, line := range strings.Split(partHeaders, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(strings.ToLower(line), "content-type:") {
				partCT = strings.TrimSpace(line[len("content-type:"):])
				// Remove parameters (e.g. charset)
				if semi := strings.Index(partCT, ";"); semi >= 0 {
					partCT = strings.TrimSpace(partCT[:semi])
				}
				break
			}
		}

		parts = append(parts, MIMEPart{
			ContentType: partCT,
			Body:        partBody,
		})
	}

	return parts
}

// extractBoundary extracts the boundary parameter from a Content-Type header.
// Handles both quoted and unquoted boundary values.
// Example: "multipart/mixed;boundary=abc" → "abc"
// Example: `multipart/mixed; boundary="abc"` → "abc"
func extractBoundary(contentType string) string {
	lower := strings.ToLower(contentType)
	if !strings.HasPrefix(lower, "multipart/") {
		return ""
	}

	// Find boundary= parameter
	idx := strings.Index(lower, "boundary=")
	if idx < 0 {
		return ""
	}

	// Extract value after "boundary="
	val := contentType[idx+len("boundary="):]

	// Remove any trailing parameters
	if semi := strings.Index(val, ";"); semi >= 0 {
		val = val[:semi]
	}
	val = strings.TrimSpace(val)

	// Remove quotes if present
	val = strings.Trim(val, `"`)

	return val
}

// ExtractAllMediaStreams extracts all m=audio media streams from the SDP body.
// Returns one MediaStream per m=audio line found, with resolved connection IPs,
// codecs, labels, and rtcp-mux flags.
func (m *SIPMessage) ExtractAllMediaStreams() []MediaStream {
	if m.Body == "" {
		return nil
	}

	body := m.Body
	lines := strings.Split(strings.ReplaceAll(body, "\r\n", "\n"), "\n")

	var streams []MediaStream
	var sessionConnIP string
	inAudioSection := false
	var currentStream *MediaStream

	for _, line := range lines {
		line = strings.TrimSpace(line)

		if strings.HasPrefix(line, "c=") && !inAudioSection {
			// Session-level connection IP
			parts := strings.Split(line, " ")
			if len(parts) >= 3 {
				sessionConnIP = parts[2]
			}
			continue
		}

		if strings.HasPrefix(line, "m=audio ") {
			// Finalize previous stream if any
			if currentStream != nil {
				if currentStream.ConnIP == "" {
					currentStream.ConnIP = sessionConnIP
				}
				streams = append(streams, *currentStream)
			}

			// Start new audio stream
			parts := strings.Fields(line)
			port := 0
			if len(parts) >= 2 {
				p, err := strconv.Atoi(parts[1])
				if err == nil {
					port = p
				}
			}
			currentStream = &MediaStream{
				Port: port,
			}
			inAudioSection = true
			continue
		}

		if strings.HasPrefix(line, "m=") {
			// Non-audio media section — finalize current audio stream
			if currentStream != nil {
				if currentStream.ConnIP == "" {
					currentStream.ConnIP = sessionConnIP
				}
				streams = append(streams, *currentStream)
				currentStream = nil
			}
			inAudioSection = false
			continue
		}

		// Parse attributes within audio section
		if inAudioSection && currentStream != nil {
			if strings.HasPrefix(line, "c=") {
				// Media-level connection IP
				parts := strings.Split(line, " ")
				if len(parts) >= 3 {
					currentStream.ConnIP = parts[2]
				}
			} else if strings.HasPrefix(line, "a=rtpmap:") {
				// Extract codec (only first rtpmap per stream)
				if currentStream.Codec == "" {
					// Format: a=rtpmap:<pt> <encoding>/<clock>
					rtpmapParts := strings.SplitN(line, " ", 2)
					if len(rtpmapParts) >= 2 {
						codecPart := rtpmapParts[1]
						slashIdx := strings.Index(codecPart, "/")
						if slashIdx > 0 {
							currentStream.Codec = codecPart[:slashIdx]
						} else {
							currentStream.Codec = codecPart
						}
					}
				}
			} else if strings.HasPrefix(line, "a=label:") {
				currentStream.Label = strings.TrimPrefix(line, "a=label:")
			} else if line == "a=rtcp-mux" {
				currentStream.RtcpMux = true
			}
		}
	}

	// Finalize last stream
	if currentStream != nil {
		if currentStream.ConnIP == "" {
			currentStream.ConnIP = sessionConnIP
		}
		streams = append(streams, *currentStream)
	}

	return streams
}
