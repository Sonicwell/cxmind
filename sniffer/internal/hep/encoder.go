package hep

import (
	"bytes"
	"encoding/binary"
	"net"
	"time"

	"github.com/rs/zerolog/log"
)

const (
	chunkCorrelationID uint16 = 0x0011
)

// HEP client to send encapsulated packets
type Client struct {
	conn       net.Conn
	remoteAddr string
	captureID  uint32
}

func NewClient(address string, captureID uint32) *Client {
	return &Client{
		remoteAddr: address,
		captureID:  captureID,
	}
}

func (c *Client) Connect() error {
	conn, err := net.Dial("udp", c.remoteAddr)
	if err != nil {
		return err
	}
	c.conn = conn
	return nil
}

func (c *Client) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

func (c *Client) Send(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort uint16, timestamp time.Time, protoID uint8, correlationID string) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	hepPacket, err := c.encodeHEP3(payload, srcIP, dstIP, srcPort, dstPort, timestamp, protoID, correlationID)
	if err != nil {
		return err
	}

	_, err = c.conn.Write(hepPacket)
	if err != nil {
		log.Error().Err(err).Msg("Failed to send HEP packet")
		// Try reconnecting once
		c.Connect()
	}
	return err
}

// SendRaw forwards a pre-encoded raw HEP3 packet (zero decode/encode overhead).
func (c *Client) SendRaw(data []byte) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	_, err := c.conn.Write(data)
	if err != nil {
		log.Error().Err(err).Msg("Failed to send raw HEP packet")
		c.Connect()
	}
	return err
}

// SendWithCorrelation is identical to Send but injects a CorrelationID chunk (call-id).
// Used by RTP mode where Call-ID is derived from state rather than parsed from payload.
func (c *Client) SendWithCorrelation(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort uint16, timestamp time.Time, protoID uint8, correlationID string) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	hepPacket, err := c.encodeHEP3WithCorrelation(payload, srcIP, dstIP, srcPort, dstPort, timestamp, protoID, correlationID)
	if err != nil {
		return err
	}

	_, err = c.conn.Write(hepPacket)
	if err != nil {
		log.Error().Err(err).Msg("Failed to send HEP correlation packet")
		c.Connect()
	}
	return err
}

// Encode packet into HEP3 format
func (c *Client) encodeHEP3(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort uint16, timestamp time.Time, protoID uint8, correlationID string) ([]byte, error) {
	buf := new(bytes.Buffer)

	// HEP3 Header: "HEP3" + Total Length (uint16)
	buf.Write([]byte("HEP3"))
	// Placeholder for length
	binary.Write(buf, binary.BigEndian, uint16(0))

	// Generic Chunks
	// 1. IP Protocol Family (IPv4 = 2)
	c.writeChunkUint8(buf, 0x01, 2)

	// 2. IP Protocol ID (UDP = 17, TCP = 6) - We assume UDP/17 for SIP usually, but ProtoID is different (SIP vs RTP)
	// For transport protocol:
	c.writeChunkUint8(buf, 0x02, 17) // hardcoding UDP transport for now as captured

	// 3. IPv4 Source Address
	if ip4 := srcIP.To4(); ip4 != nil {
		c.writeChunkBytes(buf, 0x03, ip4)
	}

	// 4. IPv4 Destination Address
	if ip4 := dstIP.To4(); ip4 != nil {
		c.writeChunkBytes(buf, 0x04, ip4)
	}

	// 7. Source Port
	c.writeChunkUint16(buf, 0x07, srcPort)

	// 8. Destination Port
	c.writeChunkUint16(buf, 0x08, dstPort)

	// 9. Initial Timestamp (Seconds)
	c.writeChunkUint32(buf, 0x09, uint32(timestamp.Unix()))

	// 10. Initial Timestamp (Microseconds)
	c.writeChunkUint32(buf, 0x0a, uint32(timestamp.Nanosecond()/1000)) // Use micro, not nano

	// 11. Protocol Type (1=SIP, 5=RTCP, 34=RTP)
	// Map our protoID
	c.writeChunkUint8(buf, 0x0b, protoID)

	// 12. Capture Agent ID
	c.writeChunkUint32(buf, 0x0c, c.captureID)
	// 17. Correlation ID (Call-ID) — if available
	if correlationID != "" {
		c.writeChunkBytes(buf, chunkCorrelationID, []byte(correlationID))
	}

	// 15. Payload
	c.writeChunkBytes(buf, 0x0f, payload)

	// Finalize: Update length
	data := buf.Bytes()
	binary.BigEndian.PutUint16(data[4:6], uint16(len(data)))

	return data, nil
}

// encodeHEP3WithCorrelation encodes packet and adds Chunk 0x0011 (CorrelationID)
func (c *Client) encodeHEP3WithCorrelation(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort uint16, timestamp time.Time, protoID uint8, correlationID string) ([]byte, error) {
	buf := new(bytes.Buffer)

	// HEP3 Header: "HEP3" + Total Length (uint16)
	buf.Write([]byte("HEP3"))
	// Placeholder for length
	binary.Write(buf, binary.BigEndian, uint16(0))

	// Generic Chunks
	c.writeChunkUint8(buf, 0x01, 2)
	c.writeChunkUint8(buf, 0x02, 17) // UDP

	if ip4 := srcIP.To4(); ip4 != nil {
		c.writeChunkBytes(buf, 0x03, ip4)
	}
	if ip4 := dstIP.To4(); ip4 != nil {
		c.writeChunkBytes(buf, 0x04, ip4)
	}

	c.writeChunkUint16(buf, 0x07, srcPort)
	c.writeChunkUint16(buf, 0x08, dstPort)
	c.writeChunkUint32(buf, 0x09, uint32(timestamp.Unix()))
	c.writeChunkUint32(buf, 0x0a, uint32(timestamp.Nanosecond()/1000))
	c.writeChunkUint8(buf, 0x0b, protoID)
	c.writeChunkUint32(buf, 0x0c, c.captureID)

	// Correlation ID chunk (0x0011)
	if correlationID != "" {
		c.writeChunkBytes(buf, chunkCorrelationID, []byte(correlationID))
	}

	// Payload
	c.writeChunkBytes(buf, chunkPayload, payload)

	// Finalize: Update length
	data := buf.Bytes()
	binary.BigEndian.PutUint16(data[4:6], uint16(len(data)))

	return data, nil
}

func (c *Client) writeChunkUint8(buf *bytes.Buffer, vendorId uint16, value uint8) {
	// Header: VendorID (2 bytes) + ChunkID (2 bytes) + Length (2 bytes) + Value
	// Standard chunks use VendorID=0
	binary.Write(buf, binary.BigEndian, uint16(0))
	binary.Write(buf, binary.BigEndian, vendorId)
	binary.Write(buf, binary.BigEndian, uint16(6+1)) // Value length = 1
	binary.Write(buf, binary.BigEndian, value)
}

func (c *Client) writeChunkUint16(buf *bytes.Buffer, chunkId uint16, value uint16) {
	binary.Write(buf, binary.BigEndian, uint16(0))
	binary.Write(buf, binary.BigEndian, chunkId)
	binary.Write(buf, binary.BigEndian, uint16(6+2))
	binary.Write(buf, binary.BigEndian, value)
}

func (c *Client) writeChunkUint32(buf *bytes.Buffer, chunkId uint16, value uint32) {
	binary.Write(buf, binary.BigEndian, uint16(0))
	binary.Write(buf, binary.BigEndian, chunkId)
	binary.Write(buf, binary.BigEndian, uint16(6+4))
	binary.Write(buf, binary.BigEndian, value)
}

func (c *Client) writeChunkBytes(buf *bytes.Buffer, chunkId uint16, value []byte) {
	binary.Write(buf, binary.BigEndian, uint16(0))
	binary.Write(buf, binary.BigEndian, chunkId)
	binary.Write(buf, binary.BigEndian, uint16(6+len(value)))
	buf.Write(value)
}

// ExtractCallIDFromSIP parses a SIP message payload and returns the Call-ID (or compact i:) header value.
// Returns empty string if not found.
func ExtractCallIDFromSIP(payload []byte) string {
	const maxScan = 8192
	if len(payload) > maxScan {
		payload = payload[:maxScan]
	}

	// Fast path: find headers segment before double CRLF
	headersEnd := bytes.Index(payload, []byte("\r\n\r\n"))
	if headersEnd == -1 {
		headersEnd = bytes.Index(payload, []byte("\n\n"))
	}
	if headersEnd != -1 {
		payload = payload[:headersEnd]
	}

	var lineStart int
	for i := 0; i <= len(payload); i++ {
		if i == len(payload) || payload[i] == '\n' {
			if lineStart < i {
				line := payload[lineStart:i]
				// Trim trailing CR if present
				if len(line) > 0 && line[len(line)-1] == '\r' {
					line = line[:len(line)-1]
				}
				line = bytes.TrimSpace(line)

				if len(line) > 0 {
					// Check "Call-ID:"
					if len(line) >= 8 && (line[0] == 'C' || line[0] == 'c') &&
						(line[1] == 'a' || line[1] == 'A') &&
						(line[2] == 'l' || line[2] == 'L') &&
						(line[3] == 'l' || line[3] == 'L') &&
						line[4] == '-' &&
						(line[5] == 'I' || line[5] == 'i') &&
						(line[6] == 'D' || line[6] == 'd') &&
						line[7] == ':' {

						val := bytes.TrimSpace(line[8:])
						if semi := bytes.IndexByte(val, ';'); semi != -1 {
							val = bytes.TrimSpace(val[:semi])
						}
						if len(val) > 0 {
							return string(val)
						}
					} else if len(line) >= 2 && (line[0] == 'i' || line[0] == 'I') && line[1] == ':' { // Check "i:"
						val := bytes.TrimSpace(line[2:])
						if semi := bytes.IndexByte(val, ';'); semi != -1 {
							val = bytes.TrimSpace(val[:semi])
						}
						if len(val) > 0 {
							return string(val)
						}
					}
				}
			}
			lineStart = i + 1
		}
	}

	return ""
}
