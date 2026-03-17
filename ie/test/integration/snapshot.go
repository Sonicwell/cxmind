package integration

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/spf13/viper"
)

// Snapshot represents a full dump of the DB state for a specific scenario run.
type Snapshot struct {
	SipCalls    []clickhouse.SipCallRecord        `json:"sip_calls"`
	CallEvents  []clickhouse.CallEventRecord      `json:"call_events"`
	SipMessages []clickhouse.SipMessageRecord     `json:"sip_messages"`
	RTCPReports []clickhouse.RTCPReport           `json:"rtcp_reports"`
	Quality     []clickhouse.QualityMetric        `json:"quality_metrics"`
	Transcripts []clickhouse.TranscriptionSegment `json:"transcriptions"`
}

// TakeSnapshot queries all relevant records for a given CallID and normalizes dynamic fields
// to ensure deterministic JSON comparisons across multiple test runs.
func TakeSnapshot(ctx context.Context, callID string) (*Snapshot, error) {
	snap := &Snapshot{}
	client := clickhouse.Client
	db := viper.GetString("clickhouse.database")
	if client == nil {
		return nil, fmt.Errorf("clickhouse client is nil")
	}

	// 1. sip_calls
	qCall := fmt.Sprintf("SELECT * FROM %s.sip_calls WHERE call_id = '%s'", db, callID)
	rowsCall, err := client.Query(ctx, qCall)
	if err == nil {
		defer rowsCall.Close()
		for rowsCall.Next() {
			var r clickhouse.SipCallRecord
			if rowsCall.ScanStruct(&r) == nil {
				// Normalize dynamic fields
				r.StartTime = r.StartTime.Truncate(0) // or zero value
				if r.EndTime != nil {
					*r.EndTime = r.EndTime.Truncate(0)
				}
				if r.AnswerTime != nil {
					*r.AnswerTime = r.AnswerTime.Truncate(0)
				}
				r.PcapPath = "NORMALIZED_PATH.pcap"
				snap.SipCalls = append(snap.SipCalls, r)
			}
		}
	}

	// 2. call_events
	qEvents := fmt.Sprintf("SELECT * FROM %s.call_events WHERE call_id = '%s' ORDER BY event_type", db, callID)
	rowsE, err := client.Query(ctx, qEvents)
	if err == nil {
		defer rowsE.Close()
		for rowsE.Next() {
			var r clickhouse.CallEventRecord
			if rowsE.ScanStruct(&r) == nil {
				r.Timestamp = r.Timestamp.Truncate(0)
				snap.CallEvents = append(snap.CallEvents, r)
			}
		}
	}

	// 3. sip_messages
	qMsg := fmt.Sprintf("SELECT * FROM %s.sip_messages WHERE call_id = '%s' ORDER BY method, status_code", db, callID)
	rowsM, err := client.Query(ctx, qMsg)
	if err == nil {
		defer rowsM.Close()
		for rowsM.Next() {
			var r clickhouse.SipMessageRecord
			if rowsM.ScanStruct(&r) == nil {
				r.Timestamp = r.Timestamp.Truncate(0)
				// Raw messages have branch tags that could be random if using simulator API.
				// If using PCAP, they are static. But to be safe, we mask RawMessage.
				r.RawMessage = "NORMALIZED"
				snap.SipMessages = append(snap.SipMessages, r)
			}
		}
	}

	// 4. quality_metrics
	qQ := fmt.Sprintf("SELECT * FROM %s.quality_metrics WHERE call_id = '%s'", db, callID)
	rowsQ, err := client.Query(ctx, qQ)
	if err == nil {
		defer rowsQ.Close()
		for rowsQ.Next() {
			var r clickhouse.QualityMetric
			if rowsQ.ScanStruct(&r) == nil {
				r.Timestamp = r.Timestamp.Truncate(0)
				snap.Quality = append(snap.Quality, r)
			}
		}
	}

	// Optional: add RTCP and Transcriptions if needed in the future

	return snap, nil
}

// CompareSnapshot performs a fuzzy Deep-Diff between actual and expected JSON snapshots.
// Returns a slice of error strings if there are differences.
func CompareSnapshot(expectedJSON []byte, actual *Snapshot) []string {
	var expected Snapshot
	if err := json.Unmarshal(expectedJSON, &expected); err != nil {
		return []string{fmt.Sprintf("failed to parse expected JSON: %v", err)}
	}

	actualJSON, _ := json.Marshal(actual)
	var acl Snapshot
	json.Unmarshal(actualJSON, &acl)

	var diffs []string

	// Compare SipCalls
	if len(expected.SipCalls) != len(acl.SipCalls) {
		diffs = append(diffs, fmt.Sprintf("SipCalls count mismatch: expected %d, got %d", len(expected.SipCalls), len(acl.SipCalls)))
	} else {
		for i, exp := range expected.SipCalls {
			act := acl.SipCalls[i]
			if exp.Status != act.Status {
				diffs = append(diffs, fmt.Sprintf("SipCalls[%d].Status: expected %v, got %v", i, exp.Status, act.Status))
			}
			if exp.Direction != act.Direction {
				diffs = append(diffs, fmt.Sprintf("SipCalls[%d].Direction: expected %v, got %v", i, exp.Direction, act.Direction))
			}
			if exp.ClientID != act.ClientID {
				diffs = append(diffs, fmt.Sprintf("SipCalls[%d].ClientID: expected %v, got %v", i, exp.ClientID, act.ClientID))
			}
			// Add more critical fields as needed
		}
	}

	// Compare CallEvents
	if len(expected.CallEvents) != len(acl.CallEvents) {
		diffs = append(diffs, fmt.Sprintf("CallEvents count mismatch: expected %d, got %d", len(expected.CallEvents), len(acl.CallEvents)))
	} else {
		for i, exp := range expected.CallEvents {
			act := acl.CallEvents[i]
			if exp.EventType != act.EventType {
				diffs = append(diffs, fmt.Sprintf("CallEvents[%d].EventType: expected %v, got %v", i, exp.EventType, act.EventType))
			}
		}
	}

	// Compare SipMessages
	if len(expected.SipMessages) != len(acl.SipMessages) {
		diffs = append(diffs, fmt.Sprintf("SipMessages count mismatch: expected %d, got %d", len(expected.SipMessages), len(acl.SipMessages)))
	} else {
		for i, exp := range expected.SipMessages {
			act := acl.SipMessages[i]
			if exp.Method != act.Method || exp.StatusCode != act.StatusCode {
				diffs = append(diffs, fmt.Sprintf("SipMessages[%d]: expected %s %d, got %s %d", i, exp.Method, exp.StatusCode, act.Method, act.StatusCode))
			}
		}
	}

	return diffs
}
