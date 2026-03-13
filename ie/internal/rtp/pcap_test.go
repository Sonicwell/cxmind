package rtp

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/pcap"
	"github.com/pion/rtp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestPCAPRecordingWithEarlyRTP validates that RTP packets arriving without
// a pre-created recorder do NOT produce PCAP files (policy enforcement).
// Previously this tested lazy-creation, now it validates the fix.
func TestPCAPRecordingWithEarlyRTP(t *testing.T) {
	// Setup: Initialize PCAP system with temp directory
	tempDir := t.TempDir()
	pcap.Init(tempDir)

	// Initialize GlobalSniffer with proper constructor (Tombstone GC)
	GlobalSniffer = NewSniffer()
	defer GlobalSniffer.Stop()

	callID := "test-call-early-rtp-123"
	srcIP := "192.168.1.100"
	dstIP := "192.168.1.200"
	srcPort := 5000
	dstPort := 6000

	// Create test RTP packets
	packet1 := createTestRTPPacket(t, 1, 160)
	packet2 := createTestRTPPacket(t, 2, 320)
	packet3 := createTestRTPPacket(t, 3, 480)

	// Step 0: Register virtual listener so InjectRTP can find the stream
	GlobalSniffer.StartVirtualListener(callID, srcIP)

	// Step 1: Inject RTP packets WITHOUT pre-creating a recorder (no policy)
	GlobalSniffer.InjectRTP(callID, packet1, packet1, srcIP, dstIP, srcPort, dstPort, time.Now())
	GlobalSniffer.InjectRTP(callID, packet2, packet2, srcIP, dstIP, srcPort, dstPort, time.Now())
	GlobalSniffer.InjectRTP(callID, packet3, packet3, srcIP, dstIP, srcPort, dstPort, time.Now())

	// Verify: No recorder should exist (policy didn't enable PCAP)
	rec := pcap.GetRecorder(callID)
	assert.Nil(t, rec, "No recorder should be auto-created by InjectRTP")

	// Verify: No PCAP file on disk
	pcapPath := filepath.Join(tempDir, srcIP, time.Now().Format("2006/01/02"), callID+".pcap")
	_, err := os.Stat(pcapPath)
	assert.True(t, os.IsNotExist(err), "No PCAP file should exist without policy enabling it")

	t.Logf("Correctly prevented unauthorized PCAP creation for call %s", callID)
}

// TestPCAPRecordingNormalFlow tests the normal flow where recorder is created before packets arrive
func TestPCAPRecordingNormalFlow(t *testing.T) {
	// Setup
	tempDir := t.TempDir()
	pcap.Init(tempDir)

	// Initialize GlobalSniffer with proper constructor
	GlobalSniffer = NewSniffer()
	defer GlobalSniffer.Stop()

	callID := "test-call-normal-flow-456"
	realm := "192.168.1.100"
	srcIP := "192.168.1.100"
	dstIP := "192.168.1.200"
	srcPort := 5000
	dstPort := 6000

	defer pcap.CloseRecorder(callID)

	// SCENARIO: Normal flow - recorder created first, then packets arrive

	// Step 1: Create PCAP recorder (simulating INVITE processing)
	rec, err := pcap.GetOrCreateRecorder(callID, realm, time.Now())
	require.NoError(t, err)
	require.NotNil(t, rec)

	// Step 1.5: Register virtual listener so InjectRTP works
	GlobalSniffer.StartVirtualListener(callID, srcIP)

	// Step 2: Inject RTP packets (recorder already exists)
	for i := 1; i <= 3; i++ {
		packet := createTestRTPPacket(t, uint16(i), 160*uint32(i))
		GlobalSniffer.InjectRTP(callID, packet, packet, srcIP, dstIP, srcPort, dstPort, time.Now())
	}

	// Close and verify
	pcap.CloseRecorder(callID)

	pcapPath := filepath.Join(tempDir, realm, time.Now().Format("2006/01/02"), callID+".pcap")
	fileInfo, err := os.Stat(pcapPath)
	require.NoError(t, err)

	// This should always pass - normal flow works correctly
	assert.Greater(t, fileInfo.Size(), int64(700), "PCAP should contain all 3 packets")

	t.Logf("PCAP file size: %d bytes (expected ~744 bytes for 3 packets)", fileInfo.Size())
}

// Helper function to create a test RTP packet
func createTestRTPPacket(t *testing.T, seqNum uint16, timestamp uint32) []byte {
	header := rtp.Header{
		Version:        2,
		Padding:        false,
		Extension:      false,
		Marker:         false,
		PayloadType:    0, // PCMU
		SequenceNumber: seqNum,
		Timestamp:      timestamp,
		SSRC:           12345,
	}

	payload := make([]byte, 160)
	for i := range payload {
		payload[i] = 0xFF // G.711 μ-law silence
	}

	packet := &rtp.Packet{
		Header:  header,
		Payload: payload,
	}

	rtpBytes, err := packet.Marshal()
	require.NoError(t, err)

	// Synthesize IP/UDP headers for WriteSIP
	// For testing, we just return the RTP packet
	// WriteSIP will add the headers
	return rtpBytes
}

// TestInjectRTP_NoPcapWithoutPolicy verifies that InjectRTP does NOT auto-create
// a PCAP recorder. Only SIP INVITE policy checks should create recorders.
// RED phase: this test FAILS on current code because ingestRTP calls GetOrCreateRecorder.
func TestInjectRTP_NoPcapWithoutPolicy(t *testing.T) {
	tempDir := t.TempDir()
	pcap.Init(tempDir)

	GlobalSniffer = NewSniffer()
	defer GlobalSniffer.Stop()

	callID := "test-no-policy-pcap-789"
	srcIP := "192.168.1.100"
	dstIP := "192.168.1.200"
	srcPort := 5000
	dstPort := 6000

	// Register virtual listener (simulates stream existence from SDP)
	GlobalSniffer.StartVirtualListener(callID, srcIP)

	// DO NOT create a PCAP recorder — simulates pcap_enabled=false from policy check

	// Inject 3 RTP packets
	for i := 1; i <= 3; i++ {
		packet := createTestRTPPacket(t, uint16(i), 160*uint32(i))
		GlobalSniffer.InjectRTP(callID, packet, packet, srcIP, dstIP, srcPort, dstPort, time.Now())
	}

	// CRITICAL ASSERTION: recorder should NOT have been auto-created
	rec := pcap.GetRecorder(callID)
	assert.Nil(t, rec, "InjectRTP should NOT auto-create a PCAP recorder when policy didn't enable it")

	// Double check: no PCAP file on disk
	pcapPath := filepath.Join(tempDir, srcIP, time.Now().Format("2006/01/02"), callID+".pcap")
	_, err := os.Stat(pcapPath)
	assert.True(t, os.IsNotExist(err), "No PCAP file should exist for a call without PCAP policy, but found: %s", pcapPath)
}
