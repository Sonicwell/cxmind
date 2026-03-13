package hep

import (
	"net"
	"strings"
	"sync"

	"github.com/rs/zerolog/log"
)

// HandlerFunc is the callback signature for processed HEP packets
type HandlerFunc func(raw []byte, pkt *HEPPacket)

// Receiver listens for incoming HEP UDP packets from peer sniffer-go instances.
type Receiver struct {
	addr    string
	handler HandlerFunc
	mu      sync.Mutex
	conn    *net.UDPConn
	stop    chan struct{}
	wg      sync.WaitGroup
}

// NewReceiver creates a new UDP HEP receiver.
func NewReceiver(addr string, handler HandlerFunc) *Receiver {
	return &Receiver{
		addr:    addr,
		handler: handler,
		stop:    make(chan struct{}),
	}
}

// Addr returns the bound local address (useful when binding to :0 for tests)
func (r *Receiver) Addr() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.conn != nil {
		return r.conn.LocalAddr().String()
	}
	return ""
}

// Start opens the UDP port and begins the read loop. Blocks until Stop() is called.
func (r *Receiver) Start() error {
	udpAddr, err := net.ResolveUDPAddr("udp", r.addr)
	if err != nil {
		return err
	}

	conn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		return err
	}

	r.mu.Lock()
	r.conn = conn
	r.mu.Unlock()

	log.Info().Str("addr", r.conn.LocalAddr().String()).Msg("Started HEP UDP Receiver")

	// Read loop
	r.wg.Add(1)
	go r.readLoop()

	<-r.stop
	return nil
}

func (r *Receiver) readLoop() {
	defer r.wg.Done()

	// Default max HEP packet size over UDP shouldn't exceed Jumbo frames, usually < 4KB.
	buf := make([]byte, 8192)

	for {
		n, _, err := r.conn.ReadFromUDP(buf)
		if err != nil {
			select {
			case <-r.stop:
				return // Expected shutdown
			default:
				// Only log if it's not a "use of closed network connection" expected error
				if !strings.Contains(err.Error(), "use of closed network connection") {
					log.Error().Err(err).Msg("Error reading from UDP")
				}
				continue
			}
		}

		if n == 0 {
			continue
		}

		// Make a copy of the read data so the buffer can be reused safely by next read.
		// Since we pass this to a decoder that might hold references or pass to async handlers.
		data := make([]byte, n)
		copy(data, buf[:n])

		// Basic sanity check before decoding
		if len(data) < 6 || string(data[:4]) != hep3Magic {
			continue // Drop silently if not HEP3
		}

		// Process inline for now (sniffer-go doesn't do heavy parsing so no worker pool yet).
		// If bottlenecks occur, an IE-style HEPWorkerPool can be introduced here.
		pkt, err := DecodeHEP3(data)
		if err == nil && pkt != nil {
			r.handler(data, pkt)
		}
	}
}

// Stop closes the UDP connection and stops the read loop.
func (r *Receiver) Stop() {
	select {
	case <-r.stop:
		return // Already stopped
	default:
		close(r.stop)
	}

	r.mu.Lock()
	if r.conn != nil {
		r.conn.Close()
	}
	r.mu.Unlock()

	r.wg.Wait()
	log.Info().Msg("HEP UDP Receiver stopped")
}
