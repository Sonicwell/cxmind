package sip

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// SIPMessage represents a parsed SIP message
type SIPMessage struct {
	Method     string              // INVITE, BYE, ACK, etc.
	StatusCode int                 // 200, 180, etc. (for responses)
	StatusText string              // OK, Ringing, etc.
	Headers    map[string][]string // All headers (multi-value supported)
	Body       string              // SDP or other body
	IsRequest  bool                // true if request, false if response
}

// GetHeader returns the first value of a header, or empty string if not present.
// This maintains backward compatibility for callers expecting a single value.
func (m *SIPMessage) GetHeader(key string) string {
	if m.Headers == nil {
		return ""
	}
	values, ok := m.Headers[strings.ToLower(key)]
	if !ok || len(values) == 0 {
		return ""
	}
	// Return the first value, consistent with previous behavior
	return values[0]
}

// GetHeaders returns all values for a given header.
func (m *SIPMessage) GetHeaders(key string) []string {
	if m.Headers == nil {
		return nil
	}
	return m.Headers[strings.ToLower(key)]
}

// AddHeader appends a value to a header.
func (m *SIPMessage) AddHeader(key, value string) {
	if m.Headers == nil {
		m.Headers = make(map[string][]string)
	}
	key = strings.ToLower(key)
	m.Headers[key] = append(m.Headers[key], value)
}

// ParseSIP parses a raw SIP message
func ParseSIP(payload []byte) (*SIPMessage, error) {
	if len(payload) == 0 {
		return nil, errors.New("empty payload")
	}

	msg := &SIPMessage{
		Headers: make(map[string][]string, 12),
	}

	content := string(payload)

	// 1. Find the \r\n\r\n or \n\n determining the body start
	bodyStart := -1
	sepIdx := strings.Index(content, "\r\n\r\n")
	if sepIdx != -1 {
		bodyStart = sepIdx + 4
	} else {
		// Try \n\n
		sepIdx = strings.Index(content, "\n\n")
		if sepIdx != -1 {
			bodyStart = sepIdx + 2
		} else {
			sepIdx = len(content)
		}
	}

	var headerData string
	if sepIdx > 0 {
		headerData = content[:sepIdx]
	} else {
		return nil, errors.New("empty message")
	}

	if bodyStart != -1 && bodyStart < len(content) {
		msg.Body = content[bodyStart:]
	}

	var firstLineDone bool
	var lastHeaderKey string

	// 2. Iterate line by line without allocating an array of slices
	for len(headerData) > 0 {
		var line string
		idx := strings.IndexByte(headerData, '\n')
		if idx >= 0 {
			line = headerData[:idx]
			headerData = headerData[idx+1:]
		} else {
			line = headerData
			headerData = ""
		}

		// Trim ending \r safely
		if len(line) > 0 && line[len(line)-1] == '\r' {
			line = line[:len(line)-1]
		}

		if !firstLineDone {
			firstLineDone = true
			strLine := strings.TrimSpace(line)
			if strLine == "" {
				return nil, errors.New("malformed start line: empty")
			}

			if strings.HasPrefix(strLine, "SIP/2.0") {
				// Response: SIP/2.0 200 OK
				msg.IsRequest = false
				parts := strings.Fields(strLine)
				if len(parts) < 2 {
					return nil, fmt.Errorf("malformed start line: %s", strLine)
				}

				msg.StatusCode = parseStatusCode(parts[1])
				if msg.StatusCode == 0 {
					return nil, fmt.Errorf("malformed start line: invalid status code in %s", strLine)
				}

				if len(parts) >= 3 {
					msg.StatusText = strings.Join(parts[2:], " ")
				}
			} else if strings.Contains(strLine, "SIP/2.0") {
				// Request
				msg.IsRequest = true
				parts := strings.Fields(strLine)
				if len(parts) < 1 {
					return nil, fmt.Errorf("malformed start line: %s", strLine)
				}
				msg.Method = parts[0]
			} else {
				return nil, fmt.Errorf("malformed start line: missing SIP version in %s", strLine)
			}
			continue
		}

		if len(line) == 0 { // Empty line, perhaps due to multiple spaces or just blank lines? Skip.
			continue
		}

		// Check for header folding (begins with SP or HTAB)
		if (line[0] == ' ' || line[0] == '\t') && lastHeaderKey != "" {
			trimmedLine := strings.TrimSpace(line)
			if vals := msg.Headers[lastHeaderKey]; len(vals) > 0 {
				vals[len(vals)-1] += " " + trimmedLine
				msg.Headers[lastHeaderKey] = vals
			}
			continue
		}

		// Normal header parsing
		colonIdx := strings.IndexByte(line, ':')
		if colonIdx == -1 {
			return nil, fmt.Errorf("malformed header: %s", line)
		}

		// Strings package substring logic to prevent extra heap allocation
		key := strings.ToLower(strings.TrimSpace(line[:colonIdx]))
		value := strings.TrimSpace(line[colonIdx+1:])

		// Inline AddHeader logic
		msg.Headers[key] = append(msg.Headers[key], value)
		lastHeaderKey = key
	}

	return msg, nil
}

// GetCallID extracts the Call-ID header
func (m *SIPMessage) GetCallID() string {
	// Try full form
	if callID := m.GetHeader("call-id"); callID != "" {
		return callID
	}
	// Try compact form
	return m.GetHeader("i")
}

// GetFrom extracts the From header
func (m *SIPMessage) GetFrom() string {
	if from := m.GetHeader("from"); from != "" {
		return from
	}
	return m.GetHeader("f")
}

// GetTo extracts the To header
func (m *SIPMessage) GetTo() string {
	if to := m.GetHeader("to"); to != "" {
		return to
	}
	return m.GetHeader("t")
}

// GetCSeq extracts the CSeq header
func (m *SIPMessage) GetCSeq() string {
	return m.GetHeader("cseq")
}

// ... existing helper functions (ExtractURI, etc.) remain valid as they operate on strings ...

// ExtractURI extracts the URI from a From/To header
// Example: "Alice <sip:alice@example.com>;tag=123" -> "sip:alice@example.com"
func ExtractURI(header string) string {
	// Find content between < and >
	start := strings.Index(header, "<")
	end := strings.Index(header, ">")

	if start >= 0 && end > start {
		return header[start+1 : end]
	}

	// If no brackets, take first word before semicolon
	parts := strings.Split(header, ";")
	return strings.TrimSpace(parts[0])
}

// ExtractDomain extracts domain from a SIP URI
// Example: "sip:alice@example.com" -> "example.com"
func ExtractDomain(uri string) string {
	// Remove sip: or sips: prefix
	uri = strings.TrimPrefix(uri, "sip:")
	uri = strings.TrimPrefix(uri, "sips:")

	// Extract domain after @
	atIdx := strings.Index(uri, "@")
	if atIdx >= 0 {
		domain := uri[atIdx+1:]
		// Remove port if present
		colonIdx := strings.Index(domain, ":")
		if colonIdx >= 0 {
			domain = domain[:colonIdx]
		}
		return domain
	}

	return ""
}

// ExtractUser extracts user part from a SIP URI
// Example: "sip:alice@example.com" -> "alice"
func ExtractUser(uri string) string {
	// Remove sip: or sips: prefix
	uri = strings.TrimPrefix(uri, "sip:")
	uri = strings.TrimPrefix(uri, "sips:")

	// Extract user before @
	atIdx := strings.Index(uri, "@")
	if atIdx >= 0 {
		return uri[:atIdx]
	}
	return uri // If no @, return whole string (might be a phone number)
}

func parseStatusCode(s string) int {
	// CS-S1 fix: use strconv.Atoi to reject non-digit characters entirely
	code, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return code
}

// ExtractDisplayName extracts the display name or user part from a SIP header
// Example: "Alice" <sip:alice@domain> -> "Alice"
// Example: "Alice" <sip:1000@domain> -> "Alice 1000"
// Example: <sip:1000@domain> -> "1000"
// Example: 1000 <sip:1000@domain> -> "1000"
func ExtractDisplayName(header string) string {
	displayName := ""

	// Check for quotes
	start := strings.Index(header, "\"")
	end := strings.LastIndex(header, "\"")

	if start >= 0 && end > start {
		displayName = header[start+1 : end]
	} else {
		// Check for Display Name without quotes before <
		angleStart := strings.Index(header, "<")
		if angleStart > 0 {
			potentialName := strings.TrimSpace(header[:angleStart])
			if potentialName != "" {
				// Remove any quotes just in case
				displayName = strings.Trim(potentialName, "\"")
			}
		}
	}

	uri := ExtractURI(header)
	userPart := ExtractUser(uri)

	if displayName == "" {
		return userPart
	}

	// Check if userPart is numeric
	isNumeric := true
	if userPart == "" {
		isNumeric = false
	} else {
		for _, c := range userPart {
			if c < '0' || c > '9' {
				isNumeric = false
				break
			}
		}
	}

	if isNumeric && userPart != displayName {
		return displayName + " " + userPart
	}

	return displayName
}

// ExtractCrypto extracts the SRTP master key from the SDP body
// Returns the key and salt combined (the inline value), or empty string if not found.
// Example: a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:W78G...
func (m *SIPMessage) ExtractCrypto() string {
	if m.Body == "" {
		return ""
	}

	// Simple SDP parsing looking for a=crypto
	lines := strings.Split(m.Body, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "a=crypto:") {
			// Format: a=crypto:<tag> <suite> <key-params> ...
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				// parts[0] = a=crypto:1
				// parts[1] = AES_CM_128_HMAC_SHA1_80
				// parts[2] = inline:PS1uQCVeeCFCanVmcjkpPywjNWhcYD0mXXtxaVBR

				keyParams := parts[2]
				if strings.HasPrefix(keyParams, "inline:") {
					return strings.TrimPrefix(keyParams, "inline:")
				}
			}
		}
	}
	return ""
}

// GetSessionExpires extracts the Session-Expires header value
// Returns the expires value in seconds and the refresher param (if present)
func (m *SIPMessage) GetSessionExpires() (int, string) {
	// Note: This only gets the first Session-Expires header, which is correct (it's a single value header)
	header := m.GetHeader("session-expires")
	if header == "" {
		return 0, ""
	}

	parts := strings.Split(header, ";")
	if len(parts) == 0 {
		return 0, ""
	}

	val := strings.TrimSpace(parts[0])
	expires := 0

	for _, c := range val {
		if c >= '0' && c <= '9' {
			expires = expires*10 + int(c-'0')
		} else {
			break // Stop at non-digit
		}
	}

	refresher := ""
	for _, part := range parts[1:] {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "refresher=") {
			refresher = strings.TrimPrefix(part, "refresher=")
			break
		}
	}

	return expires, refresher
}

// GetExpires extracts the Expires value for REGISTER messages.
// Priority: Expires header > Contact expires= param.
// Returns -1 if neither is found (caller should use a default).
func (m *SIPMessage) GetExpires() int {
	// 1. Try Expires header (takes priority per RFC 3261 §10.2.4)
	if header := m.GetHeader("expires"); header != "" {
		val, err := strconv.Atoi(strings.TrimSpace(header))
		if err == nil {
			return val
		}
	}

	// 2. Fallback: Contact header expires= parameter
	contact := m.GetHeader("contact")
	if contact == "" {
		contact = m.GetHeader("m") // compact form
	}
	if contact != "" {
		// Parse params after '>' or after URI if no angle brackets
		paramStart := strings.Index(contact, ">")
		if paramStart >= 0 {
			params := contact[paramStart+1:]
			for _, part := range strings.Split(params, ";") {
				part = strings.TrimSpace(part)
				if strings.HasPrefix(strings.ToLower(part), "expires=") {
					val, err := strconv.Atoi(strings.TrimSpace(part[8:]))
					if err == nil {
						return val
					}
				}
			}
		}
	}

	return -1 // No expires found
}

// ExtractCodec extracts the primary audio codec from the SDP body.
// Returns the first codec listed in the m=audio line's a=rtpmap attributes.
// Example: SDP contains "a=rtpmap:0 PCMU/8000" → returns "PCMU"
func (m *SIPMessage) ExtractCodec() string {
	if m.Body == "" {
		return ""
	}

	lines := strings.Split(m.Body, "\n")
	inAudioSection := false

	for _, line := range lines {
		line = strings.TrimSpace(line)

		if strings.HasPrefix(line, "m=audio ") {
			inAudioSection = true
			continue
		} else if strings.HasPrefix(line, "m=") {
			// Another media section (e.g. video), stop looking for audio codecs
			inAudioSection = false
			continue
		}

		if inAudioSection && strings.HasPrefix(line, "a=rtpmap:") {
			// Format: a=rtpmap:<payload type> <encoding name>/<clock rate>[/<encoding parameters>]
			// Example: a=rtpmap:0 PCMU/8000
			parts := strings.SplitN(line, " ", 2)
			if len(parts) >= 2 {
				codecPart := parts[1]
				slashIdx := strings.Index(codecPart, "/")
				if slashIdx > 0 {
					return codecPart[:slashIdx]
				}
				return codecPart
			}
		}
	}

	return ""
}

// PTInfo holds the codec metadata extracted from an SDP a=rtpmap line.
// Used to map a dynamic Payload Type to its codec name, channel count, and RTP clock rate.
//
// Example: a=rtpmap:111 opus/48000/2
// → PTInfo{CodecName: "opus", ClockRateHz: 48000, Channels: 2}
type PTInfo struct {
	CodecName   string // Lowercase codec name (e.g. "opus", "pcmu", "g722")
	ClockRateHz int    // RTP clock rate in Hz (e.g. 48000 for Opus, 8000 for G.711/G.722/G.729)
	Channels    int    // Number of audio channels (1=mono, 2=stereo); defaults to 1 if not specified
}

// ExtractPTMap parses the SDP body to find dynamic payload type mappings from a=rtpmap lines.
// Returns a map of RTP Payload Type → PTInfo with codec name, clock rate, and channel count.
//
// Examples:
//
//	a=rtpmap:111 opus/48000/2  → PTInfo{CodecName:"opus", ClockRateHz:48000, Channels:2}
//	a=rtpmap:0 PCMU/8000       → PTInfo{CodecName:"pcmu", ClockRateHz:8000,  Channels:1}
func (m *SIPMessage) ExtractPTMap() map[uint8]PTInfo {
	ptMap := make(map[uint8]PTInfo)
	if m.Body == "" {
		return ptMap
	}

	lines := strings.Split(m.Body, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Format: a=rtpmap:<pt> <codec>/<clockrate>[/<channels>]
		if !strings.HasPrefix(line, "a=rtpmap:") {
			continue
		}

		parts := strings.SplitAfterN(line, "a=rtpmap:", 2)
		if len(parts) != 2 {
			continue
		}

		valSlice := strings.Fields(parts[1])
		if len(valSlice) < 2 {
			continue
		}

		pt, err := strconv.ParseUint(valSlice[0], 10, 8)
		if err != nil {
			continue
		}

		// Parse codec/clockrate[/channels]
		codecParts := strings.SplitN(valSlice[1], "/", 3)
		if len(codecParts) == 0 {
			continue
		}

		info := PTInfo{
			CodecName: strings.ToLower(codecParts[0]),
			Channels:  1, // Default mono
		}

		if len(codecParts) >= 2 {
			if rate, err := strconv.Atoi(codecParts[1]); err == nil {
				info.ClockRateHz = rate
			}
		}

		if len(codecParts) >= 3 {
			if ch, err := strconv.Atoi(codecParts[2]); err == nil && ch > 0 {
				info.Channels = ch
			}
		}

		ptMap[uint8(pt)] = info
	}

	return ptMap
}
