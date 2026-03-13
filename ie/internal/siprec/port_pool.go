package siprec

import (
	"errors"
	"sync"
)

// PortPool manages a pool of available RTP ports for SIPREC sessions.
// Ports are allocated in even numbers only (RFC 3550: RTP uses even, RTCP uses odd).
type PortPool struct {
	available chan int
	allocated map[int]string // port → callID
	mu        sync.Mutex
	minPort   int
	maxPort   int
}

// NewPortPool creates a port pool with even ports in [minPort, maxPort].
func NewPortPool(minPort, maxPort int) *PortPool {
	// Ensure minPort is even
	if minPort%2 != 0 {
		minPort++
	}

	pool := &PortPool{
		available: make(chan int, (maxPort-minPort)/2+1),
		allocated: make(map[int]string),
		minPort:   minPort,
		maxPort:   maxPort,
	}

	// Fill pool with even ports
	for port := minPort; port <= maxPort; port += 2 {
		pool.available <- port
	}

	return pool
}

// Allocate reserves a single even port for a callID.
// Returns an error if no ports are available.
func (p *PortPool) Allocate(callID string) (int, error) {
	select {
	case port := <-p.available:
		p.mu.Lock()
		p.allocated[port] = callID
		p.mu.Unlock()
		return port, nil
	default:
		return 0, errors.New("no available RTP ports")
	}
}

// AllocatePair reserves two even ports for a callID (caller + callee streams).
func (p *PortPool) AllocatePair(callID string) (int, int, error) {
	port1, err := p.Allocate(callID)
	if err != nil {
		return 0, 0, err
	}

	port2, err := p.Allocate(callID)
	if err != nil {
		p.Release(port1) // Roll back first allocation
		return 0, 0, err
	}

	return port1, port2, nil
}

// Release returns a port to the pool.
// Idempotent: releasing an unallocated port is a no-op.
func (p *PortPool) Release(port int) {
	p.mu.Lock()
	_, wasAllocated := p.allocated[port]
	if wasAllocated {
		delete(p.allocated, port)
	}
	p.mu.Unlock()

	if wasAllocated {
		// Non-blocking put back (pool channel has capacity)
		select {
		case p.available <- port:
		default:
			// Pool full — should not happen in normal operation
		}
	}
}

// ReleasePair releases two ports back to the pool.
func (p *PortPool) ReleasePair(port1, port2 int) {
	p.Release(port1)
	p.Release(port2)
}

// ReleaseByCallID releases all ports allocated to a specific callID.
// Returns the number of ports released.
func (p *PortPool) ReleaseByCallID(callID string) int {
	p.mu.Lock()
	var portsToRelease []int
	for port, cid := range p.allocated {
		if cid == callID {
			portsToRelease = append(portsToRelease, port)
		}
	}
	for _, port := range portsToRelease {
		delete(p.allocated, port)
	}
	p.mu.Unlock()

	for _, port := range portsToRelease {
		select {
		case p.available <- port:
		default:
		}
	}

	return len(portsToRelease)
}
