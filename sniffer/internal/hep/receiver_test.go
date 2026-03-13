package hep

import (
	"bytes"
	"net"
	"testing"
	"time"
)

func TestReceiver_DecodesAndCallsHandler(t *testing.T) {
	// 1. Setup handler to capture result
	handled := make(chan struct{})
	var capturedPkt *HEPPacket
	var capturedRaw []byte

	handler := func(raw []byte, pkt *HEPPacket) {
		capturedRaw = raw
		capturedPkt = pkt
		close(handled)
	}

	// 2. Start Receiver on dynamic port
	addr := "127.0.0.1:0"
	receiver := NewReceiver(addr, handler)
	go receiver.Start()

	// Wait a tiny bit for it to bind
	time.Sleep(10 * time.Millisecond)
	boundAddr := receiver.Addr()
	if boundAddr == "" {
		t.Fatal("Receiver did not bind to address")
	}

	// 3. Send a test HEP packet
	conn, err := net.Dial("udp", boundAddr)
	if err != nil {
		t.Fatalf("Failed to connect to receiver: %v", err)
	}
	defer conn.Close()

	payload := []byte("TEST-UDP-PAYLOAD")
	rawHEP := buildHEP3(
		chunkUint8(0x0b, 1), // SIP
		chunkBytes(0x0f, payload),
	)

	_, err = conn.Write(rawHEP)
	if err != nil {
		t.Fatalf("Failed to write to receiver: %v", err)
	}

	// 4. Wait for handler to be invoked (with timeout)
	select {
	case <-handled:
		if !bytes.Equal(capturedRaw, rawHEP) {
			t.Error("Captured raw bytes didn't match sent bytes")
		}
		if capturedPkt == nil || capturedPkt.ProtocolType != 1 {
			t.Error("Captured parsed packet invalid")
		}
		if !bytes.Equal(capturedPkt.Payload, payload) {
			t.Error("Payload mismatch")
		}
	case <-time.After(1 * time.Second):
		t.Fatal("Timeout waiting for handler to be called")
	}

	// 5. Cleanup
	receiver.Stop()
}

func TestReceiver_InvalidPacket_NoHandler(t *testing.T) {
	called := false
	handler := func(raw []byte, pkt *HEPPacket) {
		called = true
	}

	receiver := NewReceiver("127.0.0.1:0", handler)
	go receiver.Start()
	time.Sleep(10 * time.Millisecond)

	conn, _ := net.Dial("udp", receiver.Addr())
	defer conn.Close()

	// Send garbage data
	conn.Write([]byte("GARBAGE DATA THAT IS NOT HEP"))

	time.Sleep(100 * time.Millisecond)

	if called {
		t.Error("Handler should not have been called for invalid data")
	}
	receiver.Stop()
}

func TestReceiver_Stop(t *testing.T) {
	receiver := NewReceiver("127.0.0.1:0", func([]byte, *HEPPacket) {})
	go receiver.Start()
	time.Sleep(10 * time.Millisecond)

	addr := receiver.Addr()
	receiver.Stop()
	time.Sleep(10 * time.Millisecond)

	// Sending after stop should fail or be dropped without side effects.
	// Easiest validation: does the conn.Write fail if the port is closed?
	// UDP is connectionless, so Write won't fail synchronously on localhost usually,
	// but double-stopping shouldn't panic.
	receiver.Stop() // idempotent

	// Ensure we can bind to the same port again (proves it was released)
	conn, err := net.ListenPacket("udp", addr)
	if err != nil {
		t.Errorf("Port was not released after Stop(): %v", err)
	} else {
		conn.Close()
	}
}
