package hep

import (
	"log"
	"net"
	"sync"
)

// packetJob carries a single HEP packet through the worker pool.
type packetJob struct {
	data       []byte
	remoteAddr net.Addr
	// handler is normally nil in production (uses handlePacket).
	// Tests can inject a custom handler for isolation.
	handler func(data []byte, remote net.Addr)
}

// HEPWorkerPool is a fixed-size goroutine pool for processing HEP packets.
// It replaces the per-packet `go func() { handlePacket() }()` pattern,
// keeping goroutine count constant at O(workers) rather than O(packets/sec).
//
// Usage:
//
//	pool := NewHEPWorkerPool(20, 1024)
//	go pool.Submit(packetJob{data: pkt, remoteAddr: addr})
//	// on shutdown:
//	pool.Stop()
type HEPWorkerPool struct {
	queue   chan packetJob
	stop    chan struct{}
	workers int
	wg      sync.WaitGroup
}

// NewHEPWorkerPool creates a pool with the given number of workers and
// queue capacity. Workers start immediately and consume packetJobs until Stop.
func NewHEPWorkerPool(workers, queueSize int) *HEPWorkerPool {
	p := &HEPWorkerPool{
		queue:   make(chan packetJob, queueSize),
		stop:    make(chan struct{}),
		workers: workers,
	}
	for i := 0; i < workers; i++ {
		p.wg.Add(1)
		go p.worker()
	}
	return p
}

// worker is the main loop for each pool goroutine.
func (p *HEPWorkerPool) worker() {
	defer p.wg.Done()
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

// dispatch processes a single job.
func (p *HEPWorkerPool) dispatch(job packetJob) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[PANIC] HEPWorkerPool.dispatch recovered: %v", r)
		}
	}()
	if job.handler != nil {
		job.handler(job.data, job.remoteAddr)
	} else {
		handlePacket(job.data, job.remoteAddr)
	}
}

// Submit enqueues a job. Blocks if the queue is full (caller decides to drop).
// In production, the UDP read loop uses TrySubmit for non-blocking behaviour.
func (p *HEPWorkerPool) Submit(job packetJob) {
	select {
	case p.queue <- job:
	case <-p.stop:
	}
}

// TrySubmit attempts to enqueue a job without blocking.
// Returns true if enqueued, false if the queue was full (packet dropped).
func (p *HEPWorkerPool) TrySubmit(job packetJob) bool {
	select {
	case p.queue <- job:
		return true
	default:
		return false
	}
}

// Stop signals all workers to finish, waits until the queue is drained
// and all workers have exited.
func (p *HEPWorkerPool) Stop() {
	close(p.stop)
	p.wg.Wait()
}

// Workers returns the number of goroutines in the pool.
func (p *HEPWorkerPool) Workers() int {
	return p.workers
}

// GlobalHEPWorkerPool is the process-wide worker pool initialised by StartHEPServer.
var GlobalHEPWorkerPool *HEPWorkerPool
