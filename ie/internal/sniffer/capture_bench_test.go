package sniffer

import (
	"log"
	"net"
	"os"
	"sync/atomic"
	"testing"
	"time"
)

// TestPacketCaptureThroughput is a synthetic benchmark simulating high UDP concurrency.
// It bypasses HandleSIPPayload to purely measure packet ingestion rates of AF_PACKET vs libpcap.
func TestPacketCaptureThroughput(t *testing.T) {
	if os.Getenv("RUN_CAPTURE_BENCH") == "" {
		t.Skip("Skipping capture bench... set RUN_CAPTURE_BENCH=1 to run")
	}

	addr, _ := net.ResolveUDPAddr("udp", "127.0.0.1:5060")
	dummy, err := net.ListenUDP("udp", addr)
	if err != nil {
		t.Fatalf("failed to listen dummy: %v", err)
	}
	defer dummy.Close()
	go func() {
		buf := make([]byte, 2048)
		for {
			dummy.ReadFromUDP(buf)
		}
	}()

	var sendCount atomic.Uint64
	done := make(chan struct{})

	payload := []byte("INVITE sip:bob@domain.com SIP/2.0\r\nVia: SIP/2.0/UDP pc33.atlanta.com;branch=z9hG4bK776asdhds\r\nMax-Forwards: 70\r\nTo: Bob <sip:bob@biloxi.com>\r\nFrom: Alice <sip:alice@atlanta.com>;tag=1928301774\r\nCall-ID: a84b4c76e66710@pc33.atlanta.com\r\nCSeq: 314159 INVITE\r\nContact: <sip:alice@pc33.atlanta.com>\r\nContent-Type: application/sdp\r\nContent-Length: 142\r\n\r\n")

	// 1000 稳定发压 goroutine!
	for i := 0; i < 1000; i++ {
		go func() {
			conn, _ := net.DialUDP("udp", nil, addr)
			defer conn.Close()
			for {
				select {
				case <-done:
					return
				default:
					conn.Write(payload)
					sendCount.Add(1)
					time.Sleep(1 * time.Microsecond)
				}
			}
		}()
	}

	// 此时底层会自动适配 afpacket 或是 pcap (如果被 tag 覆盖了)
	src, err := newPacketSource("lo", "udp and port 5060", 65535)
	if err != nil {
		t.Fatalf("failed to init packet source: %v", err)
	}
	defer src.Close()

	var recvCount atomic.Uint64
	go func() {
		for packet := range src.Packets() {
			_ = packet // Pure parse/copy load from driver/CGO boundary
			recvCount.Add(1)
		}
	}()

	log.Printf("==================================================================")
	log.Printf("Starting 10 seconds benchmark with 1000 concurrent SIP writers...")
	log.Printf("==================================================================")

	time.Sleep(10 * time.Second)
	close(done)
	time.Sleep(1 * time.Second)

	s := sendCount.Load()
	r := recvCount.Load()

	pname := "AF_PACKET"
	if os.Getenv("BENCH_ENGINE") != "" {
		pname = os.Getenv("BENCH_ENGINE")
	}

	log.Printf(">>>>>>> RESULT ENGINE: %s <<<<<<<<", pname)
	log.Printf("Duration:   10s")
	log.Printf("Total Sent: %d", s)
	log.Printf("Total Recv: %d", r)
	log.Printf("Send Rate:  %d pps", s/10)
	log.Printf("Recv Rate:  %d pps", r/10)
	if s > 0 {
		log.Printf("Loss:       %.2f%%", float64(s-r)/float64(s)*100)
	}
	log.Printf("==================================================================")
}
