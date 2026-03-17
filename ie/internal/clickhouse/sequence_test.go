package clickhouse

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/go-redis/redismock/v9"
	"github.com/stretchr/testify/assert"
)

// setupRedisMock replaces the global Redis client with a mock
func setupRedisMock() (redismock.ClientMock, func()) {
	db, mock := redismock.NewClientMock()
	originalClient := redis.Client
	redis.Client = db

	return mock, func() {
		redis.Client = originalClient
		db.Close()
	}
}

// TestSequenceGenerator_BasicAllocation tests basic sequence allocation
func TestSequenceGenerator_BasicAllocation(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-call-basic"
	key := "call:seq:" + callID

	// Mock INCRBY triggering pre-allocation
	mock.ExpectIncrBy(key, 100).SetVal(100)

	// Manually create sequence generator to avoid singleton state issues
	gen := &SequenceGenerator{
		ranges: make(map[string]*SeqRange),
	}

	ctx := context.Background()

	// 1st allocation (triggers Redis INCRBY)
	seq1, err := gen.Next(ctx, callID)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), seq1)

	// 2nd allocation (uses cache)
	seq2, err := gen.Next(ctx, callID)
	assert.NoError(t, err)
	assert.Equal(t, int64(2), seq2)

	// Verify Redis interactions
	assert.NoError(t, mock.ExpectationsWereMet())
}

// TestSequenceGenerator_RangeExhaustion tests reallocation when range is exhausted
func TestSequenceGenerator_RangeExhaustion(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-call-exhaust"
	key := "call:seq:" + callID

	// 1st batch: return 100 (range 1-100)
	mock.ExpectIncrBy(key, 100).SetVal(100)
	mock.ExpectExpire(key, 24*time.Hour).SetVal(true)

	gen := &SequenceGenerator{
		ranges: make(map[string]*SeqRange),
	}
	ctx := context.Background()

	// Consume 100 sequences
	for i := 1; i <= 100; i++ {
		seq, err := gen.Next(ctx, callID)
		assert.NoError(t, err)
		assert.Equal(t, int64(i), seq)
	}

	// 2nd batch: return 200 (range 101-200)
	mock.ExpectIncrBy(key, 100).SetVal(200)
	mock.ExpectExpire(key, 24*time.Hour).SetVal(true)

	// 101st sequence
	seq101, err := gen.Next(ctx, callID)
	assert.NoError(t, err)
	assert.Equal(t, int64(101), seq101)

	assert.NoError(t, mock.ExpectationsWereMet())
}

// TestSequenceGenerator_CrashRecovery tests recovery after crash (new instance)
func TestSequenceGenerator_CrashRecovery(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-call-recovery"
	key := "call:seq:" + callID

	// Usage Scenario:
	// Process A allocated 1-100 (Redis=100) and died after using 50
	// Process B starts, needs sequence.

	// Redis has 100.
	// Process B calls INCRBY -> Redis returns 200.
	mock.ExpectIncrBy(key, 100).SetVal(200)
	mock.ExpectExpire(key, 24*time.Hour).SetVal(true)

	gen := &SequenceGenerator{
		ranges: make(map[string]*SeqRange),
	}
	ctx := context.Background()

	// First call on new generator
	seq, err := gen.Next(ctx, callID)
	assert.NoError(t, err)

	// Should be 101 (skipping 51-100 to be safe)
	assert.Equal(t, int64(101), seq)

	assert.NoError(t, mock.ExpectationsWereMet())
}

// TestGetMaxSequenceFromDB_NoSQLInjection verifies that getMaxSequenceFromDB
// uses parameterized queries instead of string interpolation.
// TDD RED: This test should FAIL on the current vulnerable implementation
// and PASS after switching to parameterized queries.
func TestGetMaxSequenceFromDB_NoSQLInjection(t *testing.T) {
	// A malicious callID that attempts SQL injection
	maliciousCallID := "'; DROP TABLE transcription_segments; --"

	// Call the function that builds the query.
	// With the vulnerable implementation (fmt.Sprintf), the callID is directly
	// embedded in the SQL string. With the fixed implementation, it uses
	// parameterized queries (?), so the callID is never in the query string.

	// Since getMaxSequenceFromDB requires a ClickHouse client to execute,
	// we test via buildMaxSequenceQuery which should return (query, args).
	query, args := buildMaxSequenceQuery(maliciousCallID)

	// The query must NOT contain the malicious string
	if strings.Contains(query, maliciousCallID) {
		t.Errorf("SQL INJECTION VULNERABILITY: query contains user input directly.\nQuery: %s", query)
	}

	// The query must NOT contain fmt.Sprintf-style single-quoted interpolation
	if strings.Contains(query, "'") {
		t.Errorf("SQL INJECTION VULNERABILITY: query contains single quotes (string interpolation).\nQuery: %s", query)
	}

	// The query must use parameterized placeholder
	if !strings.Contains(query, "?") {
		t.Error("Query does not use parameterized placeholder (?)")
	}

	// The callID must be passed as a separate argument
	if len(args) != 1 || args[0] != maliciousCallID {
		t.Errorf("Expected args=[%s], got args=%v", maliciousCallID, args)
	}
}

// TestSequenceGenerator_Concurrency tests concurrent access
func TestSequenceGenerator_Concurrency(t *testing.T) {
	mock, teardown := setupRedisMock()
	defer teardown()

	callID := "test-call-concurrent"
	key := "call:seq:" + callID

	// Expect single INCRBY for 100 items
	mock.ExpectIncrBy(key, 100).SetVal(100)
	mock.ExpectExpire(key, 24*time.Hour).SetVal(true)

	gen := &SequenceGenerator{
		ranges: make(map[string]*SeqRange),
	}
	ctx := context.Background()

	count := 100
	results := make(chan int64, count)

	for i := 0; i < count; i++ {
		go func() {
			seq, _ := gen.Next(ctx, callID)
			results <- seq
		}()
	}

	received := make(map[int64]bool)
	for i := 0; i < count; i++ {
		seq := <-results
		received[seq] = true
	}

	assert.Equal(t, count, len(received))
	for i := 1; i <= count; i++ {
		assert.True(t, received[int64(i)], "Missing sequence %d", i)
	}

	assert.NoError(t, mock.ExpectationsWereMet())
}
