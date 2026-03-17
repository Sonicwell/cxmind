package clickhouse

import (
	"context"
	"log"
	"time"
)

// GetNextSequenceNumber generates a strictly increasing sequence number for a call
// Optimized to use batch pre-allocation via SequenceGenerator
func GetNextSequenceNumber(callID string) uint64 {
	gen := GetSequenceGenerator()

	// Use background context as this is usually called in async goroutines
	// Ideally pass context from caller, but this maintains signature compatibility
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	seq, err := gen.Next(ctx, callID)
	if err != nil {
		// Fallback to ClickHouse query if Redis fails completely (and generator fails)
		// This is a slow path but prevents data loss
		log.Printf("[SEQ] Generator failed for %s: %v, falling back to ClickHouse", callID, err)
		return getMaxSequenceFromDB(callID) + 1
	}

	// Since seq is int64 (from Redis INCR), we cast to uint64.
	// Typical sequence numbers are positive.
	if seq < 0 {
		// Should not happen for INCR/INCRBY from 0 unless manually manipulated
		return 0
	}

	return uint64(seq)
}

// buildMaxSequenceQuery returns the parameterized SQL query and arguments
// for fetching the maximum sequence number for a call.
// Separated from getMaxSequenceFromDB to enable SQL injection testing (TDD).
func buildMaxSequenceQuery(callID string) (string, []interface{}) {
	query := `
		SELECT COALESCE(MAX(sequence_number), 0) as max_seq
		FROM transcription_segments
		WHERE call_id = ?
	`
	return query, []interface{}{callID}
}

// getMaxSequenceFromDB queries ClickHouse for the maximum sequence number
// Used for fallback if Redis is unavailable
func getMaxSequenceFromDB(callID string) uint64 {
	if Client == nil {
		log.Printf("[SEQ] ClickHouse unavailable, returning 0")
		return 0
	}

	query, args := buildMaxSequenceQuery(callID)

	ctx := context.Background()
	var maxSeq uint64

	// Using parameterized query to prevent SQL injection
	err := Client.QueryRow(ctx, query, args...).Scan(&maxSeq)
	if err != nil {
		log.Printf("[SEQ] Failed to query max sequence for %s: %v", callID, err)
		return 0
	}

	log.Printf("[SEQ] ClickHouse max sequence for %s: %d", callID, maxSeq)
	return maxSeq
}
