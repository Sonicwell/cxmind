//go:build linux && !force_pcap

package pcap

import (
	"fmt"
	"log"

	"github.com/google/gopacket"
	"github.com/google/gopacket/pcap"
)

type pcapSource struct {
	handle *pcap.Handle
	source *gopacket.PacketSource
}

func newPacketSource(iface string, bpfFilter string, snaplen int32) (PacketSource, error) {
	log.Printf("[SIP_SNIFFER] Using standard pcap for capture on %s", iface)

	handle, err := pcap.OpenLive(iface, snaplen, true, pcap.BlockForever)
	if err != nil {
		return nil, fmt.Errorf("failed to open device %s: %v", iface, err)
	}

	if bpfFilter != "" {
		if err := handle.SetBPFFilter(bpfFilter); err != nil {
			handle.Close()
			return nil, fmt.Errorf("failed to set BPF filter: %v", err)
		}
		log.Printf("[SIP_SNIFFER] Attached BPF filter: %s", bpfFilter)
	}

	source := gopacket.NewPacketSource(handle, handle.LinkType())
	source.NoCopy = true // Enable zero-copy decode

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
