package main

import (
	"log"
	"net"
	"os"
	"os/signal"
	"runtime/pprof"
	"syscall"
	"time"

	"github.com/cxmind/ingestion-go/internal/sniffer"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatalf("Usage: %s <cpu_profile_path>", os.Args[0])
	}

	f, err := os.Create(os.Args[1])
	if err != nil {
		log.Fatal(err)
	}
	pprof.StartCPUProfile(f)
	defer pprof.StopCPUProfile()

	// start capture
	s := sniffer.NewSIPSniffer()

	// Force interface to loopback for testing
	// Viper configuration normally handles this, but we force it here for isolated bench
	os.Setenv("SNIFFER_INTERFACE", "lo")

	addr, _ := net.ResolveUDPAddr("udp", "127.0.0.1:5060")
	dummy, err := net.ListenUDP("udp", addr)
	if err != nil {
		log.Fatalf("failed to listen dummy: %v", err)
	}
	defer dummy.Close()
	go func() {
		buf := make([]byte, 2048)
		for {
			dummy.ReadFromUDP(buf)
		}
	}()

	go func() {
		if err := s.Start(); err != nil {
			log.Fatalf("Start failed: %v", err)
		}
	}()

	// wait for initialization
	time.Sleep(1 * time.Second)

	// start bombarding UDP 5060
	go bombard()

	// Wait 5 seconds
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-time.After(5 * time.Second):
		log.Println("Benchmark time reached")
	case <-sigs:
		log.Println("Interrupted")
	}

	s.Stop()
	time.Sleep(500 * time.Millisecond)
}

func bombard() {
	addr, err := net.ResolveUDPAddr("udp", "127.0.0.1:5060")
	if err != nil {
		log.Fatal(err)
	}
	conn, err := net.DialUDP("udp", nil, addr)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	payload := []byte("INVITE sip:bob@domain.com SIP/2.0\r\nVia: SIP/2.0/UDP pc33.atlanta.com;branch=z9hG4bK776asdhds\r\nMax-Forwards: 70\r\nTo: Bob <sip:bob@biloxi.com>\r\nFrom: Alice <sip:alice@atlanta.com>;tag=1928301774\r\nCall-ID: a84b4c76e66710@pc33.atlanta.com\r\nCSeq: 314159 INVITE\r\nContact: <sip:alice@pc33.atlanta.com>\r\nContent-Type: application/sdp\r\nContent-Length: 142\r\n\r\n")

	for {
		_, err := conn.Write(payload)
		if err != nil {
			log.Printf("write err: %v", err)
			return
		}
		// Small sleep to not completely choke the network stack but simulate high load
		time.Sleep(10 * time.Microsecond)
	}
}
