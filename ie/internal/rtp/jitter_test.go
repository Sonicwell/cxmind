package rtp

import (
	"encoding/binary"
	"testing"
	"time"
)

func TestJitterBuffer_Ordering(t *testing.T) {
	jb := NewJitterBuffer(3)
	// Remove defer, we call Stop explicitly to flush

	// 模拟乱序包: 1, 3, 2
	p1 := makePacket(1, []byte("payload1"))
	p2 := makePacket(2, []byte("payload2"))
	p3 := makePacket(3, []byte("payload3"))

	jb.Push(p1, 0, 0)
	jb.Push(p3, 0, 0)
	jb.Push(p2, 0, 0)

	// Wait a bit then flush
	time.Sleep(50 * time.Millisecond)
	jb.Stop()

	outCh := jb.Output()

	// 读取第一个包
	select {
	case pkt := <-outCh:
		if seq := getSeq(pkt); seq != 1 {
			t.Errorf("Expected seq 1, got %d", seq)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("Timeout waiting for packet 1")
	}

	// 读取第二个包
	select {
	case pkt := <-outCh:
		if seq := getSeq(pkt); seq != 2 {
			t.Errorf("Expected seq 2, got %d", seq)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("Timeout waiting for packet 2")
	}

	// 读取第三个包
	select {
	case pkt := <-outCh:
		if seq := getSeq(pkt); seq != 3 {
			t.Errorf("Expected seq 3, got %d", seq)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("Timeout waiting for packet 3")
	}
}

func TestJitterBuffer_Duplicate(t *testing.T) {
	jb := NewJitterBuffer(3)
	// Remove defer

	p1 := makePacket(10, []byte("data"))

	jb.Push(p1, 0, 0)
	jb.Push(p1, 0, 0) // Duplicate

	time.Sleep(50 * time.Millisecond)
	jb.Stop() // Flush

	outCh := jb.Output()

	// 应该只收到一个
	select {
	case <-outCh:
		// OK
	case <-time.After(1 * time.Second):
		t.Fatal("Timeout waiting for packet")
	}

	// 应该没有更多包 (channel closed or empty)
	select {
	case _, ok := <-outCh:
		if ok {
			t.Error("Received duplicate packet or extra data")
		}
	default:
		// OK
	}
}

// Helper: Create a dummy RTP packet with Sequence Number
func makePacket(seq uint16, payload []byte) []byte {
	// Minimal RTP header is 12 bytes
	// Byte 2-3 is Sequence Number (Big Endian)
	pkt := make([]byte, 12+len(payload))
	binary.BigEndian.PutUint16(pkt[2:4], seq)
	copy(pkt[12:], payload)
	return pkt
}

func getSeq(pkt JBPacket) uint16 {
	return binary.BigEndian.Uint16(pkt.Data[2:4])
}
