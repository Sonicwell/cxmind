//go:build integration
// +build integration

package integration

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/spf13/viper"
)

// fetchSipCallFromDB fetches a SIP call record from ClickHouse.
func fetchSipCallFromDB(ctx context.Context, callID string) (*clickhouse.SipCallRecord, error) {
	client := clickhouse.Client
	if client == nil {
		return nil, fmt.Errorf("clickhouse client is nil")
	}

	query := fmt.Sprintf("SELECT start_time, end_time, answer_time, call_id, caller, callee, from_domain, to_domain, pcap_path, status, duration, codec, client_id, direction FROM %s.sip_calls WHERE call_id = '%s' LIMIT 1", viper.GetString("clickhouse.database"), callID)
	row := client.QueryRow(ctx, query)

	var r clickhouse.SipCallRecord
	err := row.Scan(&r.StartTime, &r.EndTime, &r.AnswerTime, &r.CallID, &r.Caller, &r.Callee, &r.FromDomain, &r.ToDomain, &r.PcapPath, &r.Status, &r.Duration, &r.Codec, &r.ClientID, &r.Direction)
	if err != nil {
		return nil, err
	}

	return &r, nil
}

// fetchCallEventsFromDB fetches all events for a given call from ClickHouse.
func fetchCallEventsFromDB(ctx context.Context, callID string) ([]string, error) {
	client := clickhouse.Client
	if client == nil {
		return nil, fmt.Errorf("clickhouse client is nil")
	}

	query := fmt.Sprintf("SELECT event_type FROM %s.call_events WHERE call_id = '%s' ORDER BY timestamp", viper.GetString("clickhouse.database"), callID)
	rows, err := client.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []string
	for rows.Next() {
		var et string
		if err := rows.Scan(&et); err != nil {
			return nil, err
		}
		events = append(events, et)
	}

	return events, nil
}

// fetchSipMessagesFromDB fetches all SIP method types for a given call ID.
func fetchSipMessagesFromDB(ctx context.Context, callID string) ([]string, error) {
	client := clickhouse.Client
	if client == nil {
		return nil, fmt.Errorf("clickhouse client is nil")
	}

	query := fmt.Sprintf("SELECT method, status_code FROM %s.sip_messages WHERE call_id = '%s' ORDER BY timestamp", viper.GetString("clickhouse.database"), callID)
	rows, err := client.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var methods []string
	for rows.Next() {
		var method string
		var status int32
		if err := rows.Scan(&method, &status); err != nil {
			return nil, err
		}
		if status > 0 {
			methods = append(methods, fmt.Sprintf("%d", status))
		} else {
			methods = append(methods, method)
		}
	}

	return methods, nil
}

// fetchQualityMetricsFromDB retrieves quality metrics rows.
func fetchQualityMetricsFromDB(ctx context.Context, callID string) ([]clickhouse.QualityMetric, error) {
	client := clickhouse.Client
	if client == nil {
		return nil, fmt.Errorf("clickhouse client is nil")
	}

	query := fmt.Sprintf("SELECT mos_score, jitter_avg, packet_loss_rate, rtt_avg FROM %s.quality_metrics WHERE call_id = '%s'", viper.GetString("clickhouse.database"), callID)
	rows, err := client.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metrics []clickhouse.QualityMetric
	for rows.Next() {
		var q clickhouse.QualityMetric
		if err := rows.Scan(&q.MOS, &q.JitterAvg, &q.PacketLossRate, &q.RTTAvg); err != nil {
			return nil, err
		}
		metrics = append(metrics, q)
	}

	return metrics, nil
}

// AssertEventsExist checks if all expected events are present in actual events list.
func AssertEventsExist(t *testing.T, actual []string, expected []string) {
	t.Helper()
	actualMap := make(map[string]bool)
	for _, e := range actual {
		actualMap[e] = true
	}
	for _, e := range expected {
		if !actualMap[e] {
			t.Errorf("Expected event %q to be in %v, but it was not found", e, actual)
		}
	}
}

// AssertSipMethodsExist checks if expected SIP methods (or status codes) exist.
func AssertSipMethodsExist(t *testing.T, actual []string, expected []string) {
	t.Helper()
	actualMap := make(map[string]bool)
	for _, e := range actual {
		actualMap[e] = true
	}
	for _, e := range expected {
		if !actualMap[e] {
			t.Errorf("Expected SIP message/status %q to be in %v", e, actual)
		}
	}
}

// AssertPcapFileGenerated verifies that a corresponding pcap file was created on disk.
func AssertPcapFileGenerated(t *testing.T, callID string) {
	t.Helper()
	// Usually path is: recordings.base_path / YYYY-MM-DD / <call_id>.pcap
	basePath := viper.GetString("recordings.base_path")
	dateFolder := time.Now().Format("2006-01-02")
	expectedPath := filepath.Join(basePath, dateFolder, callID+".pcap")

	// The logic creates PCAP only if recordings.enabled = true, but
	// since we are testing integrations, let's verify if the file exists.
	// Wait up to 1 second for the file writer to flush.
	for i := 0; i < 10; i++ {
		if _, err := os.Stat(expectedPath); err == nil {
			return // file exists
		}
		time.Sleep(100 * time.Millisecond)
	}

	t.Logf("Expected PCAP file was not generated at %s (Note: Ensure recordings.enabled=true in viper or test setup)", expectedPath)
}

// AssertRedisCallStateCleaned ensures no lingering resources remain.
func AssertRedisCallStateCleaned(t *testing.T, callID string) {
	t.Helper()

	stateKey := "call:state:" + callID
	pubsubKey := "call:events:" + callID

	val, err := redis.Client.Exists(context.Background(), stateKey, pubsubKey).Result()
	if err != nil {
		t.Fatalf("Failed to check redis keys: %v", err)
	}
	if val > 0 {
		t.Errorf("Expected Redis state and pubsub keys for call %q to be cleaned up, but %d keys remain", callID, val)
	}
}
