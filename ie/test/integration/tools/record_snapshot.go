//go:build ignore

package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/test/integration"
	"github.com/cxmind/pcap-simulator/simulator"
	"github.com/spf13/viper"
)

func main() {
	pcapFile := flag.String("input", "", "Path to the source PCAP file")
	scenarioName := flag.String("name", "", "Name of the scenario to record (e.g. call_blind_transfer)")
	targetCallID := flag.String("callid", "", "Optional: Target Call-ID to extract and snapshot")
	flag.Parse()

	if *pcapFile == "" || *scenarioName == "" || *targetCallID == "" {
		log.Fatal("Usage: go run record_snapshot.go -input <pcap> -name <scenario> -callid <call_id>")
	}

	// 1. Setup local environment
	viper.Set("redis.addr", "127.0.0.1:6379")
	viper.Set("clickhouse.host", "127.0.0.1:9000")
	viper.Set("clickhouse.database", "cxmi_test")
	config.Global = viper.GetViper()

	// 2. Play PCAP using simulator payload directly to localhost:9060
	simConfig := simulator.DefaultConfig()
	simConfig.Host = "127.0.0.1"
	simConfig.Port = 9060

	client, err := simulator.NewClient(simConfig)
	if err != nil {
		log.Fatalf("Failed to init simulator: %v", err)
	}

	log.Printf("Starting PCAP replay...")
	newCallID, err := client.ReplayPCAPFile(*pcapFile, *targetCallID)
	if err != nil {
		log.Fatalf("Replay failed: %v", err)
	}
	log.Printf("Replay completed. Actual Call-ID used: %s", newCallID)

	// Ingestion is async, sleep to ensure DB flush
	log.Printf("Waiting 3s for data to be flushed to ClickHouse...")
	time.Sleep(3 * time.Second)

	log.Printf("Capturing snapshot from DB...")
	snap, err := integration.TakeSnapshot(context.Background(), newCallID)
	if err != nil {
		log.Fatalf("Snapshot failed: %v", err)
	}

	// 5. Save to testdata
	if len(snap.SipCalls) == 0 {
		log.Printf("Warning: Empty sip_calls snapshot. Did the packet reach IE?")
	}

	outPath := filepath.Join("..", "testdata", "scenarios", *scenarioName, "snapshot.json")
	os.MkdirAll(filepath.Dir(outPath), 0755)

	outBytes, _ := json.MarshalIndent(snap, "", "  ")
	if err := os.WriteFile(outPath, outBytes, 0644); err != nil {
		log.Fatalf("Failed to save snapshot: %v", err)
	}
	log.Printf("Snapshot written to %s", outPath)

	// copy pcap to testdata
	pcapDest := filepath.Join("..", "testdata", "scenarios", *scenarioName, "input.pcap")
	inputBytes, _ := os.ReadFile(*pcapFile)
	os.WriteFile(pcapDest, inputBytes, 0644)

	metaDest := filepath.Join("..", "testdata", "scenarios", *scenarioName, "meta.json")
	meta := map[string]string{"call_id": *targetCallID}
	metaBytes, _ := json.MarshalIndent(meta, "", "  ")
	os.WriteFile(metaDest, metaBytes, 0644)

	log.Printf("Artifacts saved. You can now run `go test` to prevent regressions for %s.", *scenarioName)
}
