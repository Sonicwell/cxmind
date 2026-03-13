package hep

import (
	"encoding/binary"
	"testing"
)

// buildMockHEP3 builds a simple valid HEP3 packet for benchmarking
func buildMockHEP3() []byte {
	// A simple SIP message payload
	payload := []byte("INVITE sip:bob@example.com SIP/2.0\r\nVia: SIP/2.0/UDP pc33.atlanta.com;branch=z9hG4bK776asdhds\r\n\r\n")

	packet := make([]byte, 6)
	copy(packet[:4], []byte(hep3Magic))
	binary.BigEndian.PutUint16(packet[4:6], uint16(len(packet))) // length placeholder

	// Add chunk SrcIP (IPv4)
	srcIPChunk := make([]byte, 6+4)
	binary.BigEndian.PutUint16(srcIPChunk[0:2], 0)          // Vendor ID
	binary.BigEndian.PutUint16(srcIPChunk[2:4], chunkSrcIP) // Chunk Type
	binary.BigEndian.PutUint16(srcIPChunk[4:6], 10)         // Chunk Length (6+4)
	copy(srcIPChunk[6:], []byte{192, 168, 1, 100})
	packet = append(packet, srcIPChunk...)

	// Add chunk DstIP (IPv4)
	dstIPChunk := make([]byte, 6+4)
	binary.BigEndian.PutUint16(dstIPChunk[0:2], 0)          // Vendor ID
	binary.BigEndian.PutUint16(dstIPChunk[2:4], chunkDstIP) // Chunk Type
	binary.BigEndian.PutUint16(dstIPChunk[4:6], 10)         // Chunk Length (6+4)
	copy(dstIPChunk[6:], []byte{10, 0, 0, 1})
	packet = append(packet, dstIPChunk...)

	// Add payload
	payloadChunk := make([]byte, 6+len(payload))
	binary.BigEndian.PutUint16(payloadChunk[0:2], 0)                         // Vendor ID
	binary.BigEndian.PutUint16(payloadChunk[2:4], chunkPayload)              // Chunk Type
	binary.BigEndian.PutUint16(payloadChunk[4:6], uint16(len(payloadChunk))) // Chunk Length
	copy(payloadChunk[6:], payload)
	packet = append(packet, payloadChunk...)

	// Update total length
	binary.BigEndian.PutUint16(packet[4:6], uint16(len(packet)))

	return packet
}

func BenchmarkDecodeHEP3(b *testing.B) {
	data := buildMockHEP3()
	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		pkt, err := DecodeHEP3(data)
		if err != nil {
			b.Fatal(err)
		}
		if pkt == nil {
			b.Fatal("nil packet")
		}
		pkt.Free()
	}
}
