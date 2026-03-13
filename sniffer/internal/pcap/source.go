package pcap

import "github.com/google/gopacket"

// PacketSource defines a common interface for reading network packets.
// It abstracts away the underlying Capture mechanism (pcap vs afpacket),
// allowing zero-copy afpacket on Linux while falling back to pcap on MacOS/Windows
// for local development.
type PacketSource interface {
	// Packets returns a channel of captured packets.
	Packets() chan gopacket.Packet
	// Close stops the capture and releases underlying resources.
	Close()
}
