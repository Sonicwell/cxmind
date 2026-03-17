package hep

import (
	"encoding/binary"
	"testing"
)

func TestDecodeHEP3(t *testing.T) {
	// Construct a minimal valid HEP3 packet
	// Header: "HEP3" + 2 bytes length (can be anything as parser ignores it for now, but usually it's length)
	packet := []byte("HEP3")
	packet = append(packet, 0, 0) // Length placeholder

	// Chunk 1: IPv4 Family (Type 0x0001)
	// Vendor: 0x0000
	// Type: 0x0001
	// Length: 6 + 1 = 7 (Body 1 byte: 2 for IPv4)
	chunk1 := make([]byte, 7)
	binary.BigEndian.PutUint16(chunk1[0:2], 0x0000)
	binary.BigEndian.PutUint16(chunk1[2:4], 0x0001)
	binary.BigEndian.PutUint16(chunk1[4:6], 7)
	chunk1[6] = 2 // IPv4
	packet = append(packet, chunk1...)

	// Chunk 2: Src IP 192.168.1.1 (Type 0x0003)
	// Length: 6 + 4 = 10
	chunk2 := make([]byte, 10)
	binary.BigEndian.PutUint16(chunk2[0:2], 0x0000)
	binary.BigEndian.PutUint16(chunk2[2:4], 0x0003)
	binary.BigEndian.PutUint16(chunk2[4:6], 10)
	copy(chunk2[6:], []byte{192, 168, 1, 1})
	packet = append(packet, chunk2...)

	// Chunk 3: Dst IP 10.0.0.1 (Type 0x0004)
	// Length: 6 + 4 = 10
	chunk3 := make([]byte, 10)
	binary.BigEndian.PutUint16(chunk3[0:2], 0x0000)
	binary.BigEndian.PutUint16(chunk3[2:4], 0x0004)
	binary.BigEndian.PutUint16(chunk3[4:6], 10)
	copy(chunk3[6:], []byte{10, 0, 0, 1})
	packet = append(packet, chunk3...)

	// Chunk 4: Src Port 5060 (Type 0x0007)
	// Length: 6 + 2 = 8
	chunk4 := make([]byte, 8)
	binary.BigEndian.PutUint16(chunk4[0:2], 0x0000)
	binary.BigEndian.PutUint16(chunk4[2:4], 0x0007)
	binary.BigEndian.PutUint16(chunk4[4:6], 8)
	binary.BigEndian.PutUint16(chunk4[6:], 5060)
	packet = append(packet, chunk4...)

	// Chunk 5: Payload (Type 0x000f)
	payloadData := []byte("INVITE sip:bob@example.com SIP/2.0\r\n\r\n")
	chunk5 := make([]byte, 6+len(payloadData))
	binary.BigEndian.PutUint16(chunk5[0:2], 0x0000)
	binary.BigEndian.PutUint16(chunk5[2:4], 0x000f)
	binary.BigEndian.PutUint16(chunk5[4:6], uint16(6+len(payloadData)))
	copy(chunk5[6:], payloadData)
	packet = append(packet, chunk5...)

	hepPkt, err := DecodeHEP3(packet)
	if err != nil {
		t.Fatalf("Failed to decode HEP3 packet: %v", err)
	}

	if hepPkt.SrcIP != "192.168.1.1" {
		t.Errorf("Expected SrcIP 192.168.1.1, got %s", hepPkt.SrcIP)
	}
	if hepPkt.DstIP != "10.0.0.1" {
		t.Errorf("Expected DstIP 10.0.0.1, got %s", hepPkt.DstIP)
	}
	if hepPkt.SrcPort != 5060 {
		t.Errorf("Expected SrcPort 5060, got %d", hepPkt.SrcPort)
	}
	if string(hepPkt.Payload) != string(payloadData) {
		t.Errorf("Payload mismatch")
	}
}
