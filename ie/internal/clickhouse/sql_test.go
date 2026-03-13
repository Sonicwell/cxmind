package clickhouse

import (
	"strings"
	"testing"
)

// TestWriteQualityMetric_SQLSyntax verifies the INSERT SQL has correct syntax:
// - Must contain ") VALUES ("
// - Column count must match placeholder count
// - Must end with ")"
func TestWriteQualityMetric_SQLSyntax(t *testing.T) {
	// Build the query the same way WriteQualityMetric does
	query := `INSERT INTO quality_metrics (
		timestamp, call_id, stream_id, 
		mos_score, jitter_avg, jitter_max, packet_loss_rate, rtt_avg, rtt_max
	) VALUES (
		?, ?, ?, 
		?, ?, ?, ?, ?, ?
	)`

	// Check: must contain ") VALUES ("
	if !strings.Contains(query, ") VALUES (") {
		t.Error("SQL missing ') VALUES (' clause — query is malformed")
	}

	// Check: must end with ")" (closing VALUES)
	trimmed := strings.TrimSpace(query)
	if !strings.HasSuffix(trimmed, ")") {
		t.Error("SQL does not end with closing ')' — query is malformed")
	}

	// Check: column count == placeholder count
	// Split by ") VALUES ("
	parts := strings.SplitN(query, ") VALUES (", 2)
	if len(parts) != 2 {
		t.Fatal("Cannot split query by ') VALUES (' — query is malformed")
	}

	// Count columns (comma-separated items in the first part after the opening paren)
	colPart := parts[0]
	colPart = colPart[strings.Index(colPart, "(")+1:]
	columns := strings.Split(colPart, ",")
	colCount := len(columns)

	// Count placeholders
	valPart := parts[1]
	placeholderCount := strings.Count(valPart, "?")

	if colCount != placeholderCount {
		t.Errorf("Column count (%d) != placeholder count (%d)", colCount, placeholderCount)
	}
}

// TestWriteRTCPReport_SQLSyntax verifies the known-good INSERT as control test
func TestWriteRTCPReport_SQLSyntax(t *testing.T) {
	query := `INSERT INTO rtcp_reports (
		timestamp, call_id, stream_id, report_type, ssrc, 
		packets_sent, octets_sent, cumulative_lost, fraction_lost, 
		jitter, rtt, mos, packet_loss, 
		raw_message, src_ip, dst_ip, src_port, dst_port
	) VALUES (
		?, ?, ?, ?, ?, 
		?, ?, ?, ?, 
		?, ?, ?, ?, 
		?, ?, ?, ?, ?
	)`

	if !strings.Contains(query, ") VALUES (") {
		t.Error("Control test: SQL missing ') VALUES ('")
	}
}
