//go:build linux || darwin
// +build linux darwin

package rtp

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"log"

	"github.com/google/gopacket"
	"github.com/google/gopacket/pcap"
)

func (s *Sniffer) startSniffer() error {
	iface := config.Global.GetString("sniffer.interface")
	if iface == "" {
		iface = "eth0" // Default for Docker/Linux; override via config for other environments
	}

	log.Printf("Starting PCAP sniffer on %s", iface)

	// SnapLen: 1600 (enough for MTU 1500)
	// Promiscuous: true
	// Timeout: pcap.BlockForever
	handle, err := pcap.OpenLive(iface, 1600, true, pcap.BlockForever)
	if err != nil {
		return err
	}

	if err := handle.SetBPFFilter("udp"); err != nil {
		log.Printf("Failed to set BPF filter: %v", err)
	}

	packetSource := gopacket.NewPacketSource(handle, handle.LinkType())
	go s.captureLoop(packetSource)

	return nil
}
