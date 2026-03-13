package rtp

import (
	"encoding/binary"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// JBPacket carries a decoded-ready RTP packet out of the jitter buffer.
// PayloadType is extracted from the RTP header at Push() time so that
// drain consumers never need to re-parse the header.
// RTPTimestamp is preserved for future codecs (G.722, Opus) that need
// accurate timing for frame-size negotiation and resampling.
type JBPacket struct {
	Data         []byte // full decrypted RTP packet (header + audio payload)
	PayloadType  uint8  // RTP PT field (0=PCMU, 8=PCMA, 9=G722, 111=Opus, …)
	RTPTimestamp uint32 // RTP timestamp from packet header
}

// JitterBuffer reorders RTP packets by sequence number before passing
// them to the downstream audio pipeline (codec decode → VAD → ASR).
// It buffers packets for a configurable depth (default 60ms = 3 packets)
// and outputs them sorted by sequence number at regular intervals.
//
// Multi-codec usage:
//
//	jb := NewJitterBuffer(3) // 3 slots = 60ms
//	go func() { for pkt := range jb.Output() { process(pkt.Data, pkt.PayloadType) } }()
//	jb.Push(fullRTPPacket, payloadType, rtpTimestamp)
//	jb.Stop() // flushes remaining packets and closes output
type JitterBuffer struct {
	mu      sync.Mutex
	packets []jitterSlot
	depth   int    // number of packets to buffer before draining
	seqSeen uint64 // bitmap for last 64 seq numbers (duplicate detection)
	lastSeq uint16 // last output sequence number
	inited  bool   // whether lastSeq has been set

	outputCh     chan JBPacket
	stopCh       chan struct{}
	stopped      bool
	unregistered int32 // atomic: 1 = removed from JitterScheduler, DrainOnce becomes no-op
}

type jitterSlot struct {
	seq    uint16
	packet JBPacket // carries Data + PayloadType + RTPTimestamp
}

// NewJitterBuffer creates a jitter buffer with the given depth (in packets).
// Depth 0 returns nil (disabled).
// Typical values: 3 (60ms for 20ms ptime), 5 (100ms).
//
// NOTE: NewJitterBuffer no longer starts a drainLoop goroutine.
// Callers that need autonomous draining should use
// GlobalJitterScheduler.NewManagedJitterBuffer(depth) instead.
func NewJitterBuffer(depth int) *JitterBuffer {
	if depth <= 0 {
		return nil
	}

	jb := &JitterBuffer{
		packets:  make([]jitterSlot, 0, depth*2),
		depth:    depth,
		outputCh: make(chan JBPacket, depth*2),
		stopCh:   make(chan struct{}),
	}
	// drainLoop is NOT started here — use GlobalJitterScheduler to manage draining.
	return jb
}

// Push inserts an RTP packet into the jitter buffer together with its
// pre-extracted PayloadType and RTPTimestamp.
// This avoids any re-parsing of the RTP header in the drain consumer,
// which is the foundation for multi-codec support (G.722, Opus, …).
//
// The packet must have a valid RTP header (at least 4 bytes).
// Duplicate packets (same seq) are silently dropped.
func (jb *JitterBuffer) Push(packet []byte, payloadType uint8, rtpTimestamp uint32) {
	if len(packet) < 4 {
		return
	}
	seq := binary.BigEndian.Uint16(packet[2:4])

	jb.mu.Lock()
	defer jb.mu.Unlock()

	if jb.stopped {
		return
	}

	// Duplicate detection: check if seq was recently output
	if jb.inited && !seqAfter(seq, jb.lastSeq) {
		// seq <= lastSeq (already output or very old)
		return
	}

	// Check for duplicate in current buffer
	for _, s := range jb.packets {
		if s.seq == seq {
			return // duplicate
		}
	}

	// Make a copy of the packet to avoid data races with caller's buffer
	pktCopy := make([]byte, len(packet))
	copy(pktCopy, packet)

	jb.packets = append(jb.packets, jitterSlot{
		seq: seq,
		packet: JBPacket{
			Data:         pktCopy,
			PayloadType:  payloadType,
			RTPTimestamp: rtpTimestamp,
		},
	})

	// If buffer exceeds 2x depth, force drain to prevent unbounded growth
	if len(jb.packets) >= jb.depth*2 {
		jb.drainLocked()
	}
}

// Output returns the channel that receives ordered JBPackets.
// Each JBPacket carries the full RTP packet bytes, the PayloadType, and
// the RTPTimestamp — no header re-parsing needed in the consumer.
// The channel is closed when Stop() is called and all packets are flushed.
func (jb *JitterBuffer) Output() <-chan JBPacket {
	return jb.outputCh
}

// Stop flushes all remaining packets in order and closes the output channel.
func (jb *JitterBuffer) Stop() {
	jb.mu.Lock()
	if jb.stopped {
		jb.mu.Unlock()
		return
	}
	jb.stopped = true

	// Flush remaining packets
	jb.drainAllLocked()
	jb.mu.Unlock()

	close(jb.stopCh)
	close(jb.outputCh)
}

// DrainOnce runs a single drain tick — called by JitterScheduler every 20ms.
// It is safe to call concurrently with Push(); it acquires the mutex internally.
// Returns immediately if the buffer is stopped or has been unregistered from the scheduler.
func (jb *JitterBuffer) DrainOnce() {
	if atomic.LoadInt32(&jb.unregistered) == 1 {
		return // fast path: atomically unregistered, no lock needed
	}
	jb.mu.Lock()
	if !jb.stopped && len(jb.packets) >= jb.depth {
		jb.drainLocked()
	}
	jb.mu.Unlock()
}

// drainLoop periodically drains ready packets from the buffer.
// Kept for internal use / tests that call NewJitterBuffer directly.
// In production, JitterScheduler.Run() drives draining instead.
func (jb *JitterBuffer) drainLoop() {
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			jb.DrainOnce()
		case <-jb.stopCh:
			return
		}
	}
}

// drainLocked outputs packets up to (len - depth) to maintain the buffer depth.
// Must be called with mu held.
func (jb *JitterBuffer) drainLocked() {
	if len(jb.packets) <= jb.depth {
		return
	}

	// Sort by sequence number
	sort.Slice(jb.packets, func(i, j int) bool {
		return seqBefore(jb.packets[i].seq, jb.packets[j].seq)
	})

	// Output packets until we have exactly `depth` remaining
	drainCount := len(jb.packets) - jb.depth
	for i := 0; i < drainCount; i++ {
		jb.lastSeq = jb.packets[i].seq
		jb.inited = true

		select {
		case jb.outputCh <- jb.packets[i].packet:
		default:
			// Output channel full, drop oldest
		}
	}

	// Shift remaining packets
	copy(jb.packets, jb.packets[drainCount:])
	// Clear the dropped parts of the slice to prevent memory leak
	for i := jb.depth; i < len(jb.packets); i++ {
		jb.packets[i] = jitterSlot{}
	}
	jb.packets = jb.packets[:jb.depth]
}

// drainAllLocked flushes ALL remaining packets in sorted order.
// Used during Stop() for graceful shutdown.
func (jb *JitterBuffer) drainAllLocked() {
	if len(jb.packets) == 0 {
		return
	}

	sort.Slice(jb.packets, func(i, j int) bool {
		return seqBefore(jb.packets[i].seq, jb.packets[j].seq)
	})

	for i, s := range jb.packets {
		select {
		case jb.outputCh <- s.packet:
		default:
		}
		// Clear reference to prevent memory leak
		jb.packets[i] = jitterSlot{}
	}
	jb.packets = jb.packets[:0]
}

// seqBefore returns true if a comes before b in RTP sequence space (with wraparound).
func seqBefore(a, b uint16) bool {
	return seqAfter(b, a)
}
