package hep

import (
	"encoding/binary"
	"errors"
	"log"
	"net"

	"github.com/cxmind/ingestion-go/internal/metrics"
)

// HEP3 Header Constants
const (
	HEP3_MAGIC   = "HEP3"
	HEP3_VERSION = 3
)

// Chunk Types (RFC 6347)
const (
	CHUNK_IP_FAMILY      = 0x0001
	CHUNK_IP_PROTO       = 0x0002
	CHUNK_SRC_IP         = 0x0003
	CHUNK_DST_IP         = 0x0004
	CHUNK_SRC_PORT       = 0x0007
	CHUNK_DST_PORT       = 0x0008
	CHUNK_TIMESTAMP_SEC  = 0x0009
	CHUNK_TIMESTAMP_USEC = 0x000a
	CHUNK_PROTO_TYPE     = 0x000b // 1=SIP, 5=RTCP, 32=Log
	CHUNK_CAPTURE_ID     = 0x000c
	CHUNK_AUTH_KEY       = 0x000e // Auth Key
	CHUNK_PAYLOAD        = 0x000f
	CHUNK_CORRELATION_ID = 0x0011 // Call-ID

	// Protocol Types
	PROTO_SIP  = 0x01
	PROTO_RTCP = 0x05
	PROTO_RTP  = 0x22
)

// HEPPacket represents a decoded HEPv3 Packet
type HEPPacket struct {
	Version       uint8
	SrcIP         string
	DstIP         string
	SrcPort       uint16
	DstPort       uint16
	TimestampSec  uint32
	TimestampUSec uint32
	ProtocolType  uint8
	CaptureID     uint32
	CorrelationID string
	AuthToken     string // Chunk 0x000e
	Payload       []byte
}

// DecodeHEP3 parses a raw byte slice into a HEPPacket
func DecodeHEP3(data []byte) (*HEPPacket, error) {
	if len(data) < 6 || string(data[:4]) != HEP3_MAGIC {
		return nil, errors.New("invalid HEP3 magic or too short")
	}

	packet := &HEPPacket{
		Version: HEP3_VERSION,
	}

	// Offset starts after magic "HEP3" + 2 bytes version/length (6 bytes total header)
	offset := 6
	length := len(data)

	defer func() {
		if r := recover(); r != nil {
			metrics.HEPPanics.Inc()
			// Log recovered panics instead of silently swallowing
			log.Printf("[PANIC] DecodeHEP3 recovered: %v", r)
		}
	}()

	for offset < length {
		if offset+6 > length {
			break // Incomplete chunk header (Vendor 2 + Type 2 + Length 2)
		}

		chunkVendor := binary.BigEndian.Uint16(data[offset : offset+2])
		chunkType := binary.BigEndian.Uint16(data[offset+2 : offset+4])
		chunkLength := binary.BigEndian.Uint16(data[offset+4 : offset+6]) // Total length including header

		if chunkLength < 6 {
			// Invalid chunk length (must be at least header size)
			offset += 6 // Skip header to avoid infinite loop if length=0
			continue
		}

		if offset+int(chunkLength) > length {
			// Truncated chunk body
			break
		}

		// Standard HEP Chunks have Vendor ID 0x0000
		if chunkVendor == 0x0000 {
			chunkBody := data[offset+6 : offset+int(chunkLength)]
			parseChunk(packet, chunkType, chunkBody)
		}

		offset += int(chunkLength)
	}

	return packet, nil
}

func parseChunk(p *HEPPacket, chunkType uint16, body []byte) {
	switch chunkType {
	case CHUNK_IP_FAMILY:
		// 2=IPv4, 10=IPv6
	case CHUNK_SRC_IP:
		// net.IP.String() handles both IPv4 (4 bytes) and IPv6 (16 bytes)
		if len(body) == 4 || len(body) == 16 {
			p.SrcIP = net.IP(body).String()
		}
	case CHUNK_DST_IP:
		if len(body) == 4 || len(body) == 16 {
			p.DstIP = net.IP(body).String()
		}
	case CHUNK_SRC_PORT:
		if len(body) >= 2 {
			p.SrcPort = binary.BigEndian.Uint16(body)
		}
	case CHUNK_DST_PORT:
		if len(body) >= 2 {
			p.DstPort = binary.BigEndian.Uint16(body)
		}
	case CHUNK_TIMESTAMP_SEC:
		if len(body) >= 4 {
			p.TimestampSec = binary.BigEndian.Uint32(body)
		}
	case CHUNK_TIMESTAMP_USEC:
		if len(body) >= 4 {
			p.TimestampUSec = binary.BigEndian.Uint32(body)
		}
	case CHUNK_PROTO_TYPE:
		if len(body) >= 1 {
			p.ProtocolType = body[0]
		}
	case CHUNK_CAPTURE_ID:
		if len(body) >= 4 {
			p.CaptureID = binary.BigEndian.Uint32(body)
		}
	case CHUNK_AUTH_KEY:
		p.AuthToken = string(body)
	case CHUNK_CORRELATION_ID:
		p.CorrelationID = string(body)
	case CHUNK_PAYLOAD:
		p.Payload = make([]byte, len(body))
		copy(p.Payload, body)
	}
}
