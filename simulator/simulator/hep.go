package simulator

import (
	"encoding/binary"
	"net"
	"time"
)

// EncodeHEP3 encapsulates a payload into a HEPv3 packet for UDP/TCP transmission.
func EncodeHEP3(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort uint16, timestamp time.Time, protoID uint8, authKey string, correlationID string) []byte {
	authLen := len(authKey)
	payloadLen := len(payload)
	correlationLen := len(correlationID)

	// Base size for 10 static chunks: 87 bytes
	totalSize := 6 + 87 + 6 + payloadLen
	if authLen > 0 {
		totalSize += 6 + authLen
	}
	if correlationLen > 0 {
		totalSize += 6 + correlationLen
	}

	buf := make([]byte, totalSize)

	// HEP3 Header
	buf[0] = 'H'
	buf[1] = 'E'
	buf[2] = 'P'
	buf[3] = '3'
	binary.BigEndian.PutUint16(buf[4:6], uint16(totalSize))

	offset := 6

	writeU8 := func(chunkId uint16, val uint8) {
		binary.BigEndian.PutUint16(buf[offset:], 0)
		binary.BigEndian.PutUint16(buf[offset+2:], chunkId)
		binary.BigEndian.PutUint16(buf[offset+4:], 7)
		buf[offset+6] = val
		offset += 7
	}
	writeU16 := func(chunkId uint16, val uint16) {
		binary.BigEndian.PutUint16(buf[offset:], 0)
		binary.BigEndian.PutUint16(buf[offset+2:], chunkId)
		binary.BigEndian.PutUint16(buf[offset+4:], 8)
		binary.BigEndian.PutUint16(buf[offset+6:], val)
		offset += 8
	}
	writeU32 := func(chunkId uint16, val uint32) {
		binary.BigEndian.PutUint16(buf[offset:], 0)
		binary.BigEndian.PutUint16(buf[offset+2:], chunkId)
		binary.BigEndian.PutUint16(buf[offset+4:], 10)
		binary.BigEndian.PutUint32(buf[offset+6:], val)
		offset += 10
	}
	writeBytes := func(chunkId uint16, val []byte) {
		binary.BigEndian.PutUint16(buf[offset:], 0)
		binary.BigEndian.PutUint16(buf[offset+2:], chunkId)
		chunkLen := 6 + len(val)
		binary.BigEndian.PutUint16(buf[offset+4:], uint16(chunkLen))
		copy(buf[offset+6:], val)
		offset += chunkLen
	}

	// Generic Chunks
	writeU8(0x01, 2)  // IP Protocol Family (IPv4)
	writeU8(0x02, 17) // IP Protocol ID (UDP)

	ip4Src := srcIP.To4()
	if ip4Src == nil {
		ip4Src = net.IPv4zero.To4()
	}
	writeBytes(0x03, ip4Src)

	ip4Dst := dstIP.To4()
	if ip4Dst == nil {
		ip4Dst = net.IPv4zero.To4()
	}
	writeBytes(0x04, ip4Dst)

	writeU16(0x07, srcPort)
	writeU16(0x08, dstPort)

	writeU32(0x09, uint32(timestamp.Unix()))
	// Convert ns to ms
	writeU32(0x0a, uint32(timestamp.Nanosecond()/1000))

	writeU8(0x0b, protoID) // Protocol Type (1=SIP, 5=RTCP, 34=RTP)
	writeU32(0x0c, 1001)   // Capture Agent ID

	if authLen > 0 {
		writeBytes(0x0e, []byte(authKey))
	}

	if correlationLen > 0 {
		writeBytes(0x0011, []byte(correlationID))
	}

	writeBytes(0x0f, payload)

	return buf
}
