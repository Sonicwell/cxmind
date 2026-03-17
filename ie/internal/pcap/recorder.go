package pcap

import (
	"bufio"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcapgo"
)

// capturedPacket is an async container for packets pending disk write
type capturedPacket struct {
	data    []byte
	ts      time.Time
	poolRef *[]byte // Reference to sync.Pool if buffer needs to be returned
}

// Recorder handles buffered PCAP writing for a single call
type Recorder struct {
	file       *os.File
	writer     *pcapgo.Writer
	buffer     *bufio.Writer
	mu         sync.Mutex          // Only protects legacy sync writes or state flags
	packetChan chan capturedPacket // Async writes buffer (no-lock ring buffer)
	done       chan struct{}       // Signals background writer to stop
	finished   chan struct{}       // diskWriterTask 退出后 close，Close() 等它

	// S-5: Use atomic bool to prevent send-on-closed-channel panic.
	// Checked by SmartWritePacket/WritePacket before sending to packetChan.
	closing sync.Once
	closed  atomic.Bool
	path    string
	callID  string

	// Smart Sniffing Context
	passTroughOnce sync.Once
	isPassthrough  bool
}

// pcapBufferPool avoids memory allocations when deep-copying mmap slices from TPacketV3
var pcapBufferPool = sync.Pool{
	New: func() any {
		b := make([]byte, 2048) // Safe MTU size for typical SIP/RTP payload
		return &b
	},
}

// ─── PCI-DSS Compliance Hooks (set by main.go to avoid import cycles) ───

// DTMFSuppressEnabled globally enables automatic DTMF tone suppression in PCAP recordings.
var DTMFSuppressEnabled bool

// PauseCheckCallback is called before writing RTP to check if recording is paused.
// Set by main.go: pcap.PauseCheckCallback = rtp.GetRecordingControl().IsPaused
var PauseCheckCallback func(callID string) bool

// SuppressDTMFCallback replaces DTMF payloads with silence.
// Set by main.go: pcap.SuppressDTMFCallback = rtp.SuppressDTMF
var SuppressDTMFCallback func(payload []byte) []byte

// managers stores callID → *Recorder using sync.Map for lock-free reads.
// PCAP-2: Replaced sync.RWMutex map to eliminate hot-lock contention at 250K reads/sec.
var managers sync.Map

// activeCount tracks the number of live recorders (atomic for lock-free reads).
var activeCount int64

var baseDir = "./recordings"

// MaxRecorders limits the number of concurrent PCAP recorders to prevent memory/fd leaks.
// PCAP-1: Raised from 1000 to 6000 to support 5000 concurrent calls with headroom.
const MaxRecorders = 6000

// Init initializes the PCAP recorder system
func Init(dir string) {
	if dir != "" {
		baseDir = dir
	}
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		log.Printf("Failed to create recordings directory: %v", err)
	}
}

// CloseAll flushes and closes all active PCAP recorders (for graceful shutdown)
func CloseAll() {
	managers.Range(func(key, value any) bool {
		rec := value.(*Recorder)
		rec.Close()
		managers.Delete(key)
		atomic.AddInt64(&activeCount, -1)
		return true
	})
	log.Printf("[PCAP] Closed all recorders")
}

// ActiveCount returns the number of active recorders
func ActiveCount() int {
	return int(atomic.LoadInt64(&activeCount))
}

// GetOrCreateRecorder returns an existing recorder or creates a new one.
// Uses sync.Map for lock-free reads (hot path) and atomic counter for backpressure.
func GetOrCreateRecorder(callID, realm string, timestamp time.Time) (*Recorder, error) {
	// Fast path: check if recorder already exists (lock-free)
	if val, ok := managers.Load(callID); ok {
		return val.(*Recorder), nil
	}

	// Check upper limit to prevent unbounded growth (lock-free)
	if atomic.LoadInt64(&activeCount) >= MaxRecorders {
		return nil, fmt.Errorf("PCAP recorder limit reached (%d), cannot create new recorder for call %s", MaxRecorders, callID)
	}

	// Slow path: create new recorder
	// Create directory structure: realm/YYYY/MM/DD
	dateDir := timestamp.Format("2006/01/02")
	fullDir := filepath.Join(baseDir, realm, dateDir)

	if !DirCache.Has(fullDir) {
		if err := os.MkdirAll(fullDir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create directory %s: %v", fullDir, err)
		}
		DirCache.Store(fullDir)
	}

	// Security: sanitize callID to prevent path traversal attacks.
	// SIP Call-ID is controlled by external PBX/SBC and may contain "../".
	safeCallID := filepath.Base(callID)

	path := filepath.Join(fullDir, fmt.Sprintf("%s.pcap", safeCallID))
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}

	// Buffering: 64KB
	buf := bufio.NewWriterSize(f, 65536)
	w := pcapgo.NewWriter(buf)

	// Write standard PCAP header (Ethernet)
	if err := w.WriteFileHeader(65535, layers.LinkTypeEthernet); err != nil {
		f.Close()
		return nil, err
	}

	rec := &Recorder{
		file:       f,
		writer:     w,
		buffer:     buf,
		path:       path,
		callID:     callID,
		packetChan: make(chan capturedPacket, 100), // Max 100 buffered packets (~2 sec of voice) per channel to prevent OOM
		done:       make(chan struct{}),
		finished:   make(chan struct{}),
	}

	// Atomic LoadOrStore: if another goroutine raced us, use theirs
	if actual, loaded := managers.LoadOrStore(callID, rec); loaded {
		// Race: another goroutine already created it. Close ours.
		f.Close()
		os.Remove(path)
		return actual.(*Recorder), nil
	}

	// Start the async disk writer goroutine
	go rec.diskWriterTask()

	atomic.AddInt64(&activeCount, 1)
	return rec, nil
}

// GetRecorder returns an existing recorder or nil (lock-free)
func GetRecorder(callID string) *Recorder {
	if val, ok := managers.Load(callID); ok {
		return val.(*Recorder)
	}
	return nil
}

// CloseRecorder closes the recorder for a call
func CloseRecorder(callID string) {
	if val, loaded := managers.LoadAndDelete(callID); loaded {
		val.(*Recorder).Close()
		atomic.AddInt64(&activeCount, -1)
	}
}

// GetRecorderPath returns the path if recorder exists
func GetRecorderPath(callID string) string {
	if val, ok := managers.Load(callID); ok {
		return val.(*Recorder).path
	}
	return ""
}

// Close flushes and closes the file, blocks until diskWriter drains.
func (r *Recorder) Close() {
	r.closing.Do(func() {
		// Mark closed FIRST — prevents SmartWritePacket from sending after this point
		r.closed.Store(true)
		// Signal diskWriterTask to finish queue and exit
		close(r.done)
	})
	// Wait for diskWriterTask to drain + flush
	<-r.finished
}

// diskWriterTask is a dedicated goroutine per call that serializes disk writes
// completely lock-free and isolated from network sniffing routines.
func (r *Recorder) diskWriterTask() {
	defer func() {
		// Final flush and close file handles (all draining done in the done-case)
		r.buffer.Flush()
		r.file.Close()
		close(r.finished)
	}()

	for {
		select {
		case pkt, ok := <-r.packetChan:
			if !ok {
				return // channel closed (shouldn't happen, but safety)
			}
			ci := gopacket.CaptureInfo{
				Timestamp:      pkt.ts,
				CaptureLength:  len(pkt.data),
				Length:         len(pkt.data),
				InterfaceIndex: 0,
			}
			r.writer.WritePacket(ci, pkt.data)

			if pkt.poolRef != nil {
				pcapBufferPool.Put(pkt.poolRef)
			}
		case <-r.done:
			// S-5: Do NOT close(packetChan) — writers may still be sending.
			// Drain remaining buffered packets, then return to let defer flush.
			for {
				select {
				case pkt := <-r.packetChan:
					ci := gopacket.CaptureInfo{
						Timestamp:      pkt.ts,
						CaptureLength:  len(pkt.data),
						Length:         len(pkt.data),
						InterfaceIndex: 0,
					}
					r.writer.WritePacket(ci, pkt.data)
					if pkt.poolRef != nil {
						pcapBufferPool.Put(pkt.poolRef)
					}
				default:
					return
				}
			}
		}
	}
}

// isValidEthernetAndIP checks if the byte slice roughly matches a valid Ethernet+IPv4 header
// We use a fast heuristic without triggering Heavy gopacket decode routines.
func isValidEthernetAndIP(data []byte) bool {
	if len(data) < 34 { // Min Eth (14) + IP (20)
		return false
	}
	// Check Ethernet IPv4 EtherType (0x0800) at offset 12
	if data[12] != 0x08 || data[13] != 0x00 {
		return false
	}
	// Check IPv4 version (0x4_) at offset 14
	if (data[14] >> 4) != 4 {
		return false
	}
	return true
}

// SmartWritePacket is the new fast-path entrypoint that attempts to bypass serialization entirely.
// originalBytes MUST be a slice of the full network packet directly off the wire (e.g. from AF_PACKET Mmap).
// payload MUST be the isolated logic payload (used currently for PCI-DSS checks before fallback).
func (r *Recorder) SmartWritePacket(originalBytes []byte, payload []byte, srcIP, dstIP net.IP, srcPort, dstPort int, timestamp time.Time) error {
	// S-5: Early bail if recorder is closing (prevents send on closed channel)
	if r.closed.Load() {
		return nil
	}
	// ── PCI-DSS Checks (If triggered, we MUST fallback because payload is mutated) ──
	isMutated := false
	if PauseCheckCallback != nil && PauseCheckCallback(r.callID) {
		payload = makeSilence(len(payload))
		isMutated = true
	}
	if !isMutated && DTMFSuppressEnabled && SuppressDTMFCallback != nil {
		newPayload := SuppressDTMFCallback(payload)
		if len(newPayload) > 0 && &newPayload[0] != &payload[0] {
			payload = newPayload
			isMutated = true
		}
	}

	r.passTroughOnce.Do(func() {
		// Only probe the first packet to classify the stream type.
		// If PCI-DSS mutated the *first* packet, we safely disable passthrough.
		if !isMutated && isValidEthernetAndIP(originalBytes) {
			r.isPassthrough = true
		}
	})

	// Fast Path: Pure lock-free passthrough (O(0) serialization)
	if r.isPassthrough && !isMutated {
		// Deep copy to prevent AF_PACKET MMAP buffer overwrites when queuing asynchronously
		bufPtr := pcapBufferPool.Get().(*[]byte)
		n := copy(*bufPtr, originalBytes)
		queuedData := (*bufPtr)[:n]

		select {
		case r.packetChan <- capturedPacket{data: queuedData, ts: timestamp, poolRef: bufPtr}:
			return nil
		default:
			// Queue full - Drop Tail and recycle buffer
			pcapBufferPool.Put(bufPtr)
			return fmt.Errorf("pcap async write queue full, dropping packet for call %s", r.callID)
		}
	}

	// Slow Path / Fallback: Requires re-synthesizing headers because payload was modified
	// or the incoming packets lack Ethernet/IP/UDP headers (e.g. raw UDP payloads)
	return r.WritePacket(payload, srcIP, dstIP, srcPort, dstPort, timestamp)
}

// WritePacket writes a packet (SIP, RTP, or RTCP) by synthesizing Ethernet/IP/UDP headers.
// DEPRECATED for pure network sources: Use SmartWritePacket instead for zero-GC async passthrough.
func (r *Recorder) WritePacket(payload []byte, srcIP, dstIP net.IP, srcPort, dstPort int, timestamp time.Time) error {
	// ── PCI-DSS: Check if recording is paused for this call ──
	if PauseCheckCallback != nil && PauseCheckCallback(r.callID) {
		// Replace entire payload with μ-law silence
		payload = makeSilence(len(payload))
	}

	// ── PCI-DSS: Suppress DTMF tones in PCAP recordings ──
	if DTMFSuppressEnabled && SuppressDTMFCallback != nil {
		payload = SuppressDTMFCallback(payload)
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed.Load() {
		return nil
	}

	// Synthesize headers
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

	// Serialize
	buf := gopacket.NewSerializeBuffer()
	opts := gopacket.SerializeOptions{
		ComputeChecksums: true,
		FixLengths:       true,
	}
	if err := gopacket.SerializeLayers(buf, opts, &eth, &ip, &udp, gopacket.Payload(payload)); err != nil {
		return err
	}

	data := buf.Bytes()
	ci := gopacket.CaptureInfo{
		Timestamp:      timestamp,
		CaptureLength:  len(data),
		Length:         len(data),
		InterfaceIndex: 0,
	}

	return r.writer.WritePacket(ci, data)
}

// makeSilence creates a byte slice filled with μ-law silence (0xFF).
func makeSilence(size int) []byte {
	s := make([]byte, size)
	for i := range s {
		s[i] = 0xFF
	}
	return s
}

// DirCacheType keeps track of created daily directories to avoid redundant MkdirAll calls.
type DirCacheType struct {
	m sync.Map
}

// DirCache is the global instance to keep track of created daily directories.
// Exported for testing purposes.
var DirCache DirCacheType

// Has checks if the directory exists in the cache
func (c *DirCacheType) Has(key string) bool {
	_, ok := c.m.Load(key)
	return ok
}

// Store remembers that the directory was created
func (c *DirCacheType) Store(key string) {
	c.m.Store(key, true)
}

// Clear removes all cached directories (used primarily in testing)
func (c *DirCacheType) Clear() {
	c.m.Range(func(key, value interface{}) bool {
		c.m.Delete(key)
		return true
	})
}
