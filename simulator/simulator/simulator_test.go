package simulator

import (
	"crypto/rand"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/pion/srtp/v2"
)

// Dummy server to accept TCP connections during race tests
func startDummyTCPServer(addr string, stop chan bool) {
	l, err := net.Listen("tcp", addr)
	if err != nil {
		return
	}
	defer l.Close()

	go func() {
		<-stop
		l.Close()
	}()

	for {
		conn, err := l.Accept()
		if err != nil {
			return
		}
		go func(c net.Conn) {
			defer c.Close()
			buf := make([]byte, 1024)
			for {
				_, err := c.Read(buf)
				if err != nil {
					return
				}
			}
		}(conn)
	}
}

func TestSimulatorRaceTCP(t *testing.T) {
	// Start dummy server
	stop := make(chan bool)
	go startDummyTCPServer("127.0.0.1:9065", stop)
	time.Sleep(100 * time.Millisecond)

	cfg := DefaultConfig()
	cfg.Transport = "tcp"
	cfg.Port = 9065
	cfg.Duration = 1
	cfg.UseSRTP = true

	client, err := NewClient(cfg)
	if err != nil {
		t.Fatalf("Failed to initialize simulator client: %v", err)
	}
	defer client.Close()

	// Establish global tcp conn just like main
	masterKey := make([]byte, 16)
	masterSalt := make([]byte, 14)
	rand.Read(masterKey)
	rand.Read(masterSalt)

	srtpCtx, _ := srtp.CreateContext(masterKey, masterSalt, srtp.ProtectionProfileAes128CmHmacSha1_80)
	_ = srtpCtx

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		client.RunSingleCall("race-call-1")
	}()
	go func() {
		defer wg.Done()
		client.RunSingleCall("race-call-2")
	}()

	wg.Wait()
	close(stop)
}
