package pcap

import (
	"bytes"
	"net"
	"os"
	"path/filepath"
	"testing"

	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
)

// makeMockEthPacket creates a byte slice simulating a full Ethernet->IPv4->UDP packet
func makeMockEthPacket(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort int) []byte {
	eth := layers.Ethernet{
		SrcMAC:       net.HardwareAddr{0x00, 0x00, 0x00, 0x00, 0x00, 0x00},
		DstMAC:       net.HardwareAddr{0x00, 0x00, 0x00, 0x00, 0x00, 0x00},
		EthernetType: layers.EthernetTypeIPv4,
	}
	ip := layers.IPv4{
		Version:  4,
		TTL:      64,
		SrcIP:    srcIP,
		DstIP:    dstIP,
		Protocol: layers.IPProtocolUDP,
	}
	udp := layers.UDP{
		SrcPort: layers.UDPPort(srcPort),
		DstPort: layers.UDPPort(dstPort),
	}
	udp.SetNetworkLayerForChecksum(&ip)

	buf := gopacket.NewSerializeBuffer()
	opts := gopacket.SerializeOptions{
		ComputeChecksums: true,
		FixLengths:       true,
	}
	_ = gopacket.SerializeLayers(buf, opts, &eth, &ip, &udp, gopacket.Payload(payload))
	return buf.Bytes()
}

// TestSmartWritePacket_GoldenFile validates that SmartWritePacket's zero-copy asynchronous pipeline
// outputs the EXACT same byte sequence to disk as the legacy, synchronous gopacket.SerializeLayers WritePacket.
func TestSmartWritePacket_GoldenFile(t *testing.T) {
	tmpDir := t.TempDir()
	Init(tmpDir)

	callIDOld := "golden-old"
	callIDNew := "golden-new"

	recOld, _ := GetOrCreateRecorder(callIDOld, "test.com", timeutil.Now())
	recNew, _ := GetOrCreateRecorder(callIDNew, "test.com", timeutil.Now())

	srcIP := net.ParseIP("10.0.0.1")
	dstIP := net.ParseIP("10.0.0.2")
	srcPort := 5060
	dstPort := 5060

	// 1. Generate 100 packets
	for i := 0; i < 100; i++ {
		// Just some predictable payload
		payload := []byte{0x80, 0x60, 0x00, byte(i), byte(i >> 8), 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, byte(i), byte(i * 2)}
		ts := timeutil.Unix(1600000000, int64(i)*20000000) // 20ms steps

		// Create the 'raw' packet exactly as it would appear out of AF_PACKET
		rawEthPacket := makeMockEthPacket(payload, srcIP, dstIP, srcPort, dstPort)

		// Legacy path: extracts payload and re-synthesizes ETH/IP/UDP headers internally
		errOld := recOld.WritePacket(payload, srcIP, dstIP, srcPort, dstPort, ts)
		if errOld != nil {
			t.Fatalf("Old WritePacket failed: %v", errOld)
		}

		// New path: probes rawEthPacket, detects it as valid Ethereum, deep copies to async channel
		errNew := recNew.SmartWritePacket(rawEthPacket, payload, srcIP, dstIP, srcPort, dstPort, ts)
		if errNew != nil {
			t.Fatalf("New SmartWritePacket failed: %v", errNew)
		}
	}

	// 2. Shut down pipelines and flush files to disk
	CloseAll()

	pathOld := filepath.Join(tmpDir, "test.com", timeutil.Now().Format("2006/01/02"), callIDOld+".pcap")
	pathNew := filepath.Join(tmpDir, "test.com", timeutil.Now().Format("2006/01/02"), callIDNew+".pcap")

	// 3. Bit-for-bit comparison of the produced PCAP files
	bytesOld, err := os.ReadFile(pathOld)
	if err != nil {
		t.Fatalf("Failed to read old PCAP output: %v", err)
	}

	bytesNew, err := os.ReadFile(pathNew)
	if err != nil {
		t.Fatalf("Failed to read new PCAP output: %v", err)
	}

	if len(bytesOld) != len(bytesNew) {
		t.Fatalf("PCAP file lengths mismatch: Old=%d bytes, New=%d bytes. TDD Regression Failed!", len(bytesOld), len(bytesNew))
	}

	if !bytes.Equal(bytesOld, bytesNew) {
		t.Fatalf("PCAP file bytes mismatch! The zero-copy pipeline produced mutated or out-of-order packets. TDD Regression Failed!")
	}

	t.Logf("Golden Test Passed: SmartWritePacket produced exactly %d bytes of identical binary output!", len(bytesNew))
}
