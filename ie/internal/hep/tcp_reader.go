package hep

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"io"
	"sync"
)

const (
	// hepBufDefaultSize is the default pool buffer size (4KB covers 99%+ of HEP packets).
	hepBufDefaultSize = 4096

	// maxHEPPacketSize limits HEP frame size to prevent memory exhaustion
	// from malicious TCP clients. 16KB covers all legitimate SIP + RTCP payloads.
	maxHEPPacketSize = 16384
)

// hepBufPool reuses byte buffers for HEP TCP frame reading.
// Each buffer is returned after handlePacket + DecodeHEP3 completes.
// Safety: DecodeHEP3 copies all data out of the buffer (verified by audit).
var hepBufPool = sync.Pool{
	New: func() interface{} {
		b := make([]byte, hepBufDefaultSize)
		return &b
	},
}

// HEPBuffer wraps a pooled byte slice with its effective length.
// Call Release() after processing is complete to return the buffer to the pool.
type HEPBuffer struct {
	Data []byte // Slice of pooled buffer [0:length]
	buf  *[]byte
}

// Release returns the underlying buffer to the pool.
// Must be called exactly once after the packet has been fully processed.
func (h *HEPBuffer) Release() {
	if h.buf != nil {
		hepBufPool.Put(h.buf)
		h.buf = nil
		h.Data = nil
	}
}

// readHEPPacketPooled reads a single HEP3 frame using a pooled buffer.
// Returns an HEPBuffer that MUST be released after processing.
// Returns nil HEPBuffer for empty payloads (keepalives).
func readHEPPacketPooled(reader *bufio.Reader) (*HEPBuffer, error) {
	// 1. Read Magic "HEP3" (4 bytes) — stack allocated
	var header [4]byte
	if _, err := io.ReadFull(reader, header[:]); err != nil {
		return nil, err
	}
	if string(header[:]) != "HEP3" {
		return nil, fmt.Errorf("invalid HEP3 magic: %x", header)
	}

	// 2. Read Length (2 bytes, Big Endian) — stack allocated
	var lenBuf [2]byte
	if _, err := io.ReadFull(reader, lenBuf[:]); err != nil {
		return nil, fmt.Errorf("error reading length: %w", err)
	}
	length := int(binary.BigEndian.Uint16(lenBuf[:]))

	// S-1: Reject oversized packets to prevent OOM from malicious TCP clients
	if length > maxHEPPacketSize {
		return nil, fmt.Errorf("HEP packet too large: %d bytes (max %d)", length, maxHEPPacketSize)
	}

	// 3. Calculate payload size
	payloadLen := length - 6
	if payloadLen <= 0 {
		return nil, nil
	}

	// 4. Get buffer from pool
	bufPtr := hepBufPool.Get().(*[]byte)
	if cap(*bufPtr) < length {
		// Rare: packet larger than default buffer size
		*bufPtr = make([]byte, length)
	} else {
		*bufPtr = (*bufPtr)[:length]
	}

	// 5. Write header + length into buffer, then read payload directly
	copy((*bufPtr)[0:4], header[:])
	copy((*bufPtr)[4:6], lenBuf[:])
	if _, err := io.ReadFull(reader, (*bufPtr)[6:]); err != nil {
		hepBufPool.Put(bufPtr) // Return on error
		return nil, fmt.Errorf("error reading payload (%d bytes): %w", payloadLen, err)
	}

	return &HEPBuffer{
		Data: *bufPtr,
		buf:  bufPtr,
	}, nil
}

// Deprecated: readHEPPacket is the non-pooled version; all production code uses readHEPPacketPooled.
// Retained for reference. Allocation profile: 1 make([]byte, length) per packet.
func readHEPPacket(reader *bufio.Reader) ([]byte, error) {
	// 1. Read Magic "HEP3" (4 bytes) — stack allocated
	var header [4]byte
	if _, err := io.ReadFull(reader, header[:]); err != nil {
		return nil, err
	}
	if string(header[:]) != "HEP3" {
		return nil, fmt.Errorf("invalid HEP3 magic: %x", header)
	}

	// 2. Read Length (2 bytes, Big Endian) — stack allocated
	var lenBuf [2]byte
	if _, err := io.ReadFull(reader, lenBuf[:]); err != nil {
		return nil, fmt.Errorf("error reading length: %w", err)
	}
	length := int(binary.BigEndian.Uint16(lenBuf[:]))

	// 3. Calculate payload size
	payloadLen := length - 6
	if payloadLen <= 0 {
		return nil, nil
	}

	// 4. Single allocation: read directly into final buffer
	fullPacket := make([]byte, length)
	copy(fullPacket[0:4], header[:])
	copy(fullPacket[4:6], lenBuf[:])
	if _, err := io.ReadFull(reader, fullPacket[6:]); err != nil {
		return nil, fmt.Errorf("error reading payload (%d bytes): %w", payloadLen, err)
	}

	return fullPacket, nil
}
