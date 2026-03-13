package pcap

import (
	"log"

	"github.com/google/gopacket"
)

// diskWriteJob encapsulates a single async disk write request.
// It carries both the data and the target recorder so the pool
// can route writes to the correct pcap file handle.
type diskWriteJob struct {
	rec  *Recorder
	pkt  capturedPacket
	done bool // sentinel: flush and signal r.finished
}

// PCAPWriterPool is a shared fixed-size pool of goroutines that drains
// writ jobs submitted by all Recorders in the process.
//
// Instead of each Recorder launching its own diskWriterTask goroutine,
// they submit jobs to this single pool — reducing goroutine count from
// O(active_calls) to O(workers).
//
// Thread-safety: each Recorder's packets are multiplexed through a
// per-recorder buffered channel. The pool workers read from a global
// dispatch channel and call the recorder's flush method. The recorder's
// own per-call queue guarantees ordering without locks.
type PCAPWriterPool struct {
	queue   chan diskWriteJob
	stop    chan struct{}
	workers int
}

// NewPCAPWriterPool creates a pool with the given number of workers and queue size.
func NewPCAPWriterPool(workers, queueSize int) *PCAPWriterPool {
	p := &PCAPWriterPool{
		queue:   make(chan diskWriteJob, queueSize),
		stop:    make(chan struct{}),
		workers: workers,
	}
	for i := 0; i < workers; i++ {
		go p.worker()
	}
	return p
}

// Workers returns the configured number of pool goroutines.
func (p *PCAPWriterPool) Workers() int { return p.workers }

// Submit enqueues a write job. Non-blocking: returns false if queue full.
func (p *PCAPWriterPool) Submit(job diskWriteJob) bool {
	select {
	case p.queue <- job:
		return true
	default:
		return false
	}
}

// Stop signals all workers to drain and exit.
func (p *PCAPWriterPool) Stop() {
	close(p.stop)
}

// worker is the main loop for each pool goroutine.
func (p *PCAPWriterPool) worker() {
	for {
		select {
		case job, ok := <-p.queue:
			if !ok {
				return
			}
			p.dispatch(job)
		case <-p.stop:
			// Drain remaining jobs before exiting
			for {
				select {
				case job := <-p.queue:
					p.dispatch(job)
				default:
					return
				}
			}
		}
	}
}

// dispatch processes one disk write job.
func (p *PCAPWriterPool) dispatch(job diskWriteJob) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[PANIC] PCAPWriterPool.dispatch: %v", r)
		}
	}()

	r := job.rec
	if job.done {
		// Flush sentinel: drain packetChan, flush bufio, close file
		for pkt := range r.packetChan {
			writePacketToFile(r, pkt)
		}
		r.buffer.Flush()
		r.file.Close()
		close(r.finished)
		return
	}

	// Normal packet write
	writePacketToFile(r, job.pkt)
}

// writePacketToFile writes a single captured packet to the recorder's file.
func writePacketToFile(r *Recorder, pkt capturedPacket) {
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
}
