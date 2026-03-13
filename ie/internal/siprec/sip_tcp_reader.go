package siprec

import (
	"bufio"
	"fmt"
	"io"
	"strconv"
	"strings"
)

const (
	// maxSIPMessageSize is the maximum allowed SIP message size (64KB).
	// Protects against malicious or malformed Content-Length values.
	maxSIPMessageSize = 65536
)

// ReadSIPMessage reads a complete SIP message from a TCP stream.
// Uses Content-Length header to determine the body size (RFC 3261 §18.3).
// Returns the raw message bytes (headers + body).
func ReadSIPMessage(reader *bufio.Reader) ([]byte, error) {
	var headerBuf strings.Builder
	contentLength := 0
	foundCL := false

	// Phase 1: Read headers line by line until empty line (CRLFCRLF)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF && headerBuf.Len() > 0 {
				// Partial message at EOF — return what we have
				return []byte(headerBuf.String()), nil
			}
			return nil, err
		}

		headerBuf.WriteString(line)

		// Check for empty line (end of headers)
		trimmed := strings.TrimRight(line, "\r\n")
		if trimmed == "" {
			break
		}

		// Extract Content-Length (case-insensitive)
		if !foundCL {
			lower := strings.ToLower(trimmed)
			if strings.HasPrefix(lower, "content-length:") || strings.HasPrefix(lower, "l:") {
				var valStr string
				if strings.HasPrefix(lower, "content-length:") {
					valStr = strings.TrimSpace(trimmed[len("content-length:"):])
				} else {
					valStr = strings.TrimSpace(trimmed[len("l:"):])
				}
				cl, err := strconv.Atoi(valStr)
				if err == nil {
					contentLength = cl
					foundCL = true
				}
			}
		}
	}

	// Phase 2: Validate and read body
	if contentLength > maxSIPMessageSize {
		return nil, fmt.Errorf("Content-Length %d exceeds maximum %d", contentLength, maxSIPMessageSize)
	}

	if contentLength > 0 {
		body := make([]byte, contentLength)
		if _, err := io.ReadFull(reader, body); err != nil {
			return nil, fmt.Errorf("reading SIP body (%d bytes): %w", contentLength, err)
		}
		result := make([]byte, 0, headerBuf.Len()+contentLength)
		result = append(result, []byte(headerBuf.String())...)
		result = append(result, body...)
		return result, nil
	}

	return []byte(headerBuf.String()), nil
}
