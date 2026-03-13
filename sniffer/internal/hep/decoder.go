package hep

import (
	"encoding/binary"
	"errors"
	"net"
	"sync"
)

var hepPacketPool = sync.Pool{
	New: func() interface{} {
		return &HEPPacket{
			SrcIP:   make(net.IP, 16),
			DstIP:   make(net.IP, 16),
			Payload: make([]byte, 8192), // max typical SIP/RTP payload
		}
	},
}

// GetHEPPacket retrieves a pooled packet structure
func GetHEPPacket() *HEPPacket {
	p := hepPacketPool.Get().(*HEPPacket)
	// Reset fields
	p.SrcPort = 0
	p.DstPort = 0
	p.TimestampSec = 0
	p.TimestampUSec = 0
	p.ProtocolType = 0
	p.CaptureID = 0
	p.CorrelationID = ""
	p.SrcIP = p.SrcIP[:0]
	p.DstIP = p.DstIP[:0]
	p.Payload = p.Payload[:0]
	return p
}

// Free returns the packet to the pool
func (p *HEPPacket) Free() {
	hepPacketPool.Put(p)
}

// HEP3 constants
const (
	hep3Magic = "HEP3"

	chunkIPFamily      = 0x0001
	chunkIPProto       = 0x0002
	chunkSrcIP         = 0x0003
	chunkDstIP         = 0x0004
	chunkSrcPort       = 0x0007
	chunkDstPort       = 0x0008
	chunkTimestampSec  = 0x0009
	chunkTimestampUSec = 0x000a
	chunkProtoType     = 0x000b // 1=SIP, 5=RTCP, 34=RTP
	chunkCaptureID     = 0x000c
	chunkPayload       = 0x000f
)

// HEPPacket represents a decoded HEPv3 packet.
type HEPPacket struct {
	SrcIP         net.IP
	DstIP         net.IP
	SrcPort       uint16
	DstPort       uint16
	TimestampSec  uint32
	TimestampUSec uint32
	ProtocolType  uint8
	CaptureID     uint32
	CorrelationID string
	Payload       []byte
}

// DecodeHEP3 parses raw HEP3 binary into HEPPacket.
// Tolerant of truncated/partial data — returns what it can parse.
func DecodeHEP3(data []byte) (*HEPPacket, error) {
	if len(data) < 6 || string(data[:4]) != hep3Magic {
		return nil, errors.New("invalid HEP3 magic or too short")
	}

	pkt := GetHEPPacket()
	offset := 6 // skip "HEP3" + 2-byte length
	length := len(data)

	for offset < length {
		if offset+6 > length {
			break // incomplete chunk header
		}

		chunkVendor := binary.BigEndian.Uint16(data[offset : offset+2])
		chunkType := binary.BigEndian.Uint16(data[offset+2 : offset+4])
		chunkLen := int(binary.BigEndian.Uint16(data[offset+4 : offset+6]))

		if chunkLen < 6 {
			offset += 6
			continue
		}
		if offset+chunkLen > length {
			break // truncated body
		}

		// Standard chunks: vendor == 0x0000
		if chunkVendor == 0x0000 {
			body := data[offset+6 : offset+chunkLen]
			parseHEPChunk(pkt, chunkType, body)
		}

		offset += chunkLen
	}

	return pkt, nil
}

func parseHEPChunk(p *HEPPacket, chunkType uint16, body []byte) {
	switch chunkType {
	case chunkSrcIP:
		if len(body) == 4 || len(body) == 16 {
			p.SrcIP = p.SrcIP[:len(body)]
			copy(p.SrcIP, body)
		}
	case chunkDstIP:
		if len(body) == 4 || len(body) == 16 {
			p.DstIP = p.DstIP[:len(body)]
			copy(p.DstIP, body)
		}
	case chunkSrcPort:
		if len(body) >= 2 {
			p.SrcPort = binary.BigEndian.Uint16(body)
		}
	case chunkDstPort:
		if len(body) >= 2 {
			p.DstPort = binary.BigEndian.Uint16(body)
		}
	case chunkTimestampSec:
		if len(body) >= 4 {
			p.TimestampSec = binary.BigEndian.Uint32(body)
		}
	case chunkTimestampUSec:
		if len(body) >= 4 {
			p.TimestampUSec = binary.BigEndian.Uint32(body)
		}
	case chunkProtoType:
		if len(body) >= 1 {
			p.ProtocolType = body[0]
		}
	case chunkCaptureID:
		if len(body) >= 4 {
			p.CaptureID = binary.BigEndian.Uint32(body)
		}
	case chunkCorrelationID:
		p.CorrelationID = string(body)
	case chunkPayload:
		if len(body) <= cap(p.Payload) {
			p.Payload = p.Payload[:len(body)]
		} else {
			p.Payload = make([]byte, len(body))
		}
		copy(p.Payload, body)
	}
}
