//go:build !linux || force_pcap

package sniffer

import (
	"fmt"
	"log"

	"github.com/google/gopacket"
	"github.com/google/gopacket/pcap"
)

// pcapSource implements PacketSource using libpcap.
// This is the fallback implementation for macOS, Windows, and other non-Linux platforms
// where AF_PACKET is not supported.
type pcapSource struct {
	handle *pcap.Handle
	source *gopacket.PacketSource
}

func newPacketSource(iface string, bpfFilter string, snaplen int32) (PacketSource, error) {
	log.Printf("[SIP_SNIFFER] Using libpcap fallback (AF_PACKET unsupported on this OS)")

	handle, err := pcap.OpenLive(iface, snaplen, true, pcap.BlockForever)
	if err != nil {
		return nil, fmt.Errorf("pcap.OpenLive(%s): %w", iface, err)
	}

	if err := handle.SetBPFFilter(bpfFilter); err != nil {
		handle.Close()
		return nil, fmt.Errorf("SetBPFFilter(%s): %w", bpfFilter, err)
	}

	source := gopacket.NewPacketSource(handle, handle.LinkType())
	source.NoCopy = true

	return &pcapSource{
		handle: handle,
		source: source,
	}, nil
}

func (p *pcapSource) Packets() chan gopacket.Packet {
	return p.source.Packets()
}

func (p *pcapSource) Close() {
	if p.handle != nil {
		p.handle.Close()
	}
}
