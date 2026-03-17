package hep

import (
	"net"
	"testing"
	"time"
)

// TestTCPIdleTimeout verifies that idle HEP TCP connections are closed
// after the configured timeout, preventing resource exhaustion.
func TestTCPIdleTimeout(t *testing.T) {
	// Start a TCP listener
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	connClosed := make(chan struct{})
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		// Use a very short timeout for testing
		handleTCPConnectionWithTimeout(conn, 100*time.Millisecond)
		close(connClosed)
	}()

	// Connect but send nothing (idle)
	conn, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	// Wait for the handler to close the connection due to timeout
	select {
	case <-connClosed:
		// Handler exited (connection closed due to timeout) — pass
	case <-time.After(2 * time.Second):
		t.Fatal("handleTCPConnectionWithTimeout did not close idle connection within 2s")
	}
}

// TestTCPIdleTimeout_DataResetsDeadline verifies that sending data
// resets the idle timeout, keeping the connection alive.
func TestTCPIdleTimeout_DataResetsDeadline(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	connClosed := make(chan struct{})
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		handleTCPConnectionWithTimeout(conn, 200*time.Millisecond)
		close(connClosed)
	}()

	conn, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	// Send a valid HEP3 packet before timeout expires
	payload := buildHEP3Packet([]byte("test-keep-alive"))
	time.Sleep(100 * time.Millisecond)
	conn.Write(payload)

	// Connection should NOT have been closed yet
	select {
	case <-connClosed:
		t.Fatal("connection closed too early — data should have reset the timeout")
	case <-time.After(50 * time.Millisecond):
		// Good — connection is still alive
	}

	// Now wait for the timeout after last data
	select {
	case <-connClosed:
		// Connection closed after idle timeout — pass
	case <-time.After(2 * time.Second):
		t.Fatal("connection not closed after idle timeout")
	}
}
