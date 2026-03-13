package main

import (
	"os"
	"os/signal"
	"syscall"

	"time"

	"github.com/cxmind/sniffer/internal/config"
	"github.com/cxmind/sniffer/internal/hep"
	"github.com/cxmind/sniffer/internal/pcap"
	"github.com/cxmind/sniffer/internal/relay"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	// Initialize logger
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load configuration")
	}

	// Set log level
	level, err := zerolog.ParseLevel(cfg.LogLevel)
	if err == nil {
		zerolog.SetGlobalLevel(level)
	}

	log.Info().Msgf("CXMind Sniffer starting on interface %s", cfg.Interface)
	log.Info().Msgf("HEP Target: %s (ID: %d)", cfg.HEPTarget, cfg.HEPID)

	// 1. Initialize HEP client to IE
	hepClient := hep.NewClient(cfg.HEPTarget, cfg.HEPID)
	if err := hepClient.Connect(); err != nil {
		log.Error().Err(err).Msg("Failed to connect to HEP target (will retry)")
	}
	defer hepClient.Close()

	// 2. Initialize Peer clients
	var peers []relay.HEPClient
	if len(cfg.HEPPeers) > 0 {
		log.Info().Strs("peers", cfg.HEPPeers).Msg("Initializing HEP Peers")
		for _, peerAddr := range cfg.HEPPeers {
			pc := hep.NewClient(peerAddr, cfg.HEPID)
			if err := pc.Connect(); err != nil {
				log.Warn().Str("peer", peerAddr).Err(err).Msg("Failed to connect to peer")
			}
			peers = append(peers, pc)
		}
	}

	// 3. Initialize Relay framework
	ttl := time.Duration(cfg.MappingTTL) * time.Second
	relayCore := relay.NewRelay(hepClient, peers, cfg.RelayUpstream, ttl)

	// 4. Start HEP Receiver if configured
	if cfg.HEPListen != "" {
		receiver := hep.NewReceiver(cfg.HEPListen, relayCore.HandlePeerHEP)
		go func() {
			if err := receiver.Start(); err != nil {
				log.Fatal().Err(err).Msg("HEP Receiver failed")
			}
		}()
		defer receiver.Stop()
	}

	// 5. Initialize Sniffer with Relay callbacks
	sniffer := pcap.NewSniffer(cfg, relayCore.HandleLocalSIP, relayCore.HandleLocalRTP)

	// Handle signals for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Info().Msg("Shutting down sniffer...")
		sniffer.Stop()
		os.Exit(0)
	}()

	// Start packet capture (blocking)
	if err := sniffer.Start(); err != nil {
		log.Fatal().Err(err).Msg("Sniffer failed")
	}
}
