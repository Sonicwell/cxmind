//go:build integration
// +build integration

package integration

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/cxmind/pcap-simulator/simulator"
)

// TestReplayRegression runs through all scenarios in testdata/scenarios/
// replays their input.pcap to the local IE engine,
// takes a snapshot of the outcome, and compares it with snapshot.json.
func TestReplayRegression(t *testing.T) {
	// Enable recordings for this test to verify PCAP generation logic behaves properly
	// even during replay
	// viper.Set("recordings.enabled", true)

	baseDir := filepath.Join("testdata", "scenarios")
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skip("No recorded test scenarios found in testdata/scenarios. Use record_snapshot.go to create some.")
		}
		t.Fatalf("Failed to read scenarios dir: %v", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		scenarioName := entry.Name()
		t.Run(scenarioName, func(t *testing.T) {
			scenarioDir := filepath.Join(baseDir, scenarioName)
			inputPcap := filepath.Join(scenarioDir, "input.pcap")
			metaFile := filepath.Join(scenarioDir, "meta.json")
			snapshotFile := filepath.Join(scenarioDir, "snapshot.json")

			if _, err := os.Stat(inputPcap); err != nil {
				t.Fatalf("Missing input.pcap. Did you record properly?")
			}

			// Read Meta to determine Target Call-ID
			metaBytes, err := os.ReadFile(metaFile)
			if err != nil {
				t.Fatalf("Failed to read meta.json: %v", err)
			}

			var meta map[string]string
			if err := json.Unmarshal(metaBytes, &meta); err != nil {
				t.Fatalf("Failed to parse meta.json: %v", err)
			}
			targetCallID := meta["call_id"]
			if targetCallID == "" {
				t.Fatalf("meta.json must contain call_id")
			}

			// Empty DB before starting isolate testing
			refreshMockAgents()

			// Prepare Simulator client
			simConfig := simulator.DefaultConfig()
			simConfig.Host = "127.0.0.1"
			simConfig.Port = 9060

			client, err := simulator.NewClient(simConfig)
			if err != nil {
				t.Fatalf("Failed to init simulator: %v", err)
			}
			defer client.Close()

			// Fire PCAP
			t.Logf("Replaying PCAP for scenario: %s", scenarioName)
			actualNewCallID, err := client.ReplayPCAPFile(inputPcap, targetCallID)
			if err != nil {
				t.Fatalf("Failed to replay PCAP: %v", err)
			}

			// Wait a bit for ingestion async processing
			time.Sleep(2 * time.Second)

			// 3. Take new snapshot using the actually generated Call-ID
			ctx := context.Background()
			t.Logf("Taking actual snapshot for CallID: %s", actualNewCallID)
			actualSnap, err := TakeSnapshot(ctx, actualNewCallID)
			if err != nil {
				t.Fatalf("Failed to take snapshot: %v", err)
			}

			// Compare with expected
			expectedBytes, err := os.ReadFile(snapshotFile)
			if err != nil {
				t.Fatalf("Failed to read expected snapshot.json: %v", err)
			}

			diffs := CompareSnapshot(expectedBytes, actualSnap)
			if len(diffs) > 0 {
				t.Errorf("Scenario '%s' Regression Detected! Diffs:\n%s", scenarioName, strings.Join(diffs, "\n"))
			} else {
				t.Logf("Scenario '%s' Snapshot match perfectly.", scenarioName)
			}

			// cleanup test env checks
			AssertRedisCallStateCleaned(t, targetCallID)
		})
	}
}
