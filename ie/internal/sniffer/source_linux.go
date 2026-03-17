//go:build linux && !force_pcap

package sniffer

import (
	"fmt"
	"log"

	"golang.org/x/net/bpf"

	"github.com/google/gopacket"
	"github.com/google/gopacket/afpacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
)

// afpacketSource implements PacketSource using mmap'ed AF_PACKET (TPacketV3).
// This is the high-performance, zero-copy implementation used in production on Linux.
type afpacketSource struct {
	tpacket *afpacket.TPacket
	source  *gopacket.PacketSource
	done    chan struct{}
	packets chan gopacket.Packet
}

func newPacketSource(iface string, bpfFilter string, snaplen int32) (PacketSource, error) {
	log.Printf("[SIP_SNIFFER] Using optimized AF_PACKET (TPacketV3) for zero-copy capture on Linux")

	// Create TPacket with interface and default poll timeout
	tpacket, err := afpacket.NewTPacket(
		afpacket.OptInterface(iface),
		afpacket.OptPollTimeout(pcap.BlockForever),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create TPacket on iface %s: %v", iface, err)
	}

	// We still need pcap to compile the BPF filter string into raw BPF instructions
	// before passing it to the kernel via afpacket
	if bpfFilter != "" {
		pcapBPF, err := pcap.CompileBPFFilter(layers.LinkTypeEthernet, int(snaplen), bpfFilter)
		if err != nil {
			tpacket.Close()
			return nil, fmt.Errorf("failed to compile BPF string (%s): %v", bpfFilter, err)
		}

		bpfIns := make([]bpf.RawInstruction, len(pcapBPF))
		for i, ins := range pcapBPF {
			bpfIns[i] = bpf.RawInstruction{
				Op: ins.Code,
				Jt: ins.Jt,
				Jf: ins.Jf,
				K:  ins.K,
			}
		}

		if err := tpacket.SetBPF(bpfIns); err != nil {
			tpacket.Close()
			return nil, fmt.Errorf("failed to set BPF filter on TPacket: %v", err)
		}
		log.Printf("[SIP_SNIFFER] Attached BPF filter to TPacket: %s", bpfFilter)
	}

	source := gopacket.NewPacketSource(tpacket, layers.LinkTypeEthernet)
	source.NoCopy = true

	aps := &afpacketSource{
		tpacket: tpacket,
		source:  source,
		done:    make(chan struct{}),
		packets: make(chan gopacket.Packet, 100),
	}

	// Start reading loop since TPacket doesn't have a direct Packets channel
	go aps.readLoop()

	return aps, nil
}

func (a *afpacketSource) readLoop() {
	defer close(a.packets)
	for {
		select {
		case <-a.done:
			return
		default:
			packet, err := a.source.NextPacket()
			if err != nil {
				// Handle closed or interrupted errors silently on shutdown
				select {
				case <-a.done:
					return
				default:
					continue
				}
			}
			select {
			case <-a.done:
				return
			case a.packets <- packet:
			}
		}
	}
}

func (a *afpacketSource) Packets() chan gopacket.Packet {
	return a.packets
}

func (a *afpacketSource) Close() {
	close(a.done)
	if a.tpacket != nil {
		a.tpacket.Close()
	}
}
