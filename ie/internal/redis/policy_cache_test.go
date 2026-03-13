package redis

import (
	"testing"
	"time"

	"github.com/go-redis/redismock/v9"
	"github.com/redis/go-redis/v9"
)

// setupPolicyMock replaces the global Redis client with a mock and resets policy cache.
func setupPolicyMock() (redismock.ClientMock, func()) {
	db, mock := redismock.NewClientMock()
	originalClient := Client
	Client = db

	// Reset cache for isolated tests
	ResetPolicyCache()

	return mock, func() {
		Client = originalClient
		db.Close()
	}
}

// expectFullPolicyPipeline sets up mock expectations for a full GetAgentPolicies pipeline.
func expectFullPolicyPipeline(mock redismock.ClientMock, agent string, asrGlobal string) {
	mock.ExpectGet("pcap:policy:global").SetVal("optional")
	mock.ExpectGet("asr:policy:global").SetVal(asrGlobal)
	mock.ExpectSIsMember("pcap:enabled:agents", agent).SetVal(false)
	mock.ExpectSIsMember("asr:enabled:agents", agent).SetVal(true)
	mock.ExpectHGet("asr:agent_policy", agent).RedisNil()
}

// TestGetAgentPoliciesCached_CacheMiss verifies that on first call (cache miss),
// the function queries Redis and returns correct policies.
func TestGetAgentPoliciesCached_CacheMiss(t *testing.T) {
	mock, teardown := setupPolicyMock()
	defer teardown()

	agent := "agent-miss@example.com"
	expectFullPolicyPipeline(mock, agent, "enforced")

	policies, err := GetAgentPoliciesCached(agent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !policies.AsrEnabled {
		t.Error("AsrEnabled should be true when global=enforced")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled Redis expectations: %v", err)
	}
}

// TestGetAgentPoliciesCached_CacheHit verifies that the second call
// returns cached data WITHOUT hitting Redis again.
func TestGetAgentPoliciesCached_CacheHit(t *testing.T) {
	mock, teardown := setupPolicyMock()
	defer teardown()

	agent := "agent-hit@example.com"

	// First call: expect Redis pipeline
	expectFullPolicyPipeline(mock, agent, "enforced")

	p1, err := GetAgentPoliciesCached(agent)
	if err != nil {
		t.Fatalf("first call error: %v", err)
	}

	// Second call: should NOT trigger Redis (no new expectations set)
	p2, err := GetAgentPoliciesCached(agent)
	if err != nil {
		t.Fatalf("second call error: %v", err)
	}

	// Both should return the same result
	if p1.AsrEnabled != p2.AsrEnabled {
		t.Errorf("cache hit returned different AsrEnabled: %v vs %v", p1.AsrEnabled, p2.AsrEnabled)
	}

	// All Redis expectations should be met (only 1 pipeline)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled Redis expectations: %v", err)
	}
}

// TestGetAgentPoliciesCached_DifferentAgents verifies independent caching per agent.
func TestGetAgentPoliciesCached_DifferentAgents(t *testing.T) {
	mock, teardown := setupPolicyMock()
	defer teardown()

	// Agent A: ASR enforced
	expectFullPolicyPipeline(mock, "agent-a", "enforced")
	// Agent B: ASR disabled
	expectFullPolicyPipeline(mock, "agent-b", "disabled")

	pA, err := GetAgentPoliciesCached("agent-a")
	if err != nil {
		t.Fatalf("agent-a error: %v", err)
	}

	pB, err := GetAgentPoliciesCached("agent-b")
	if err != nil {
		t.Fatalf("agent-b error: %v", err)
	}

	if !pA.AsrEnabled {
		t.Error("agent-a ASR should be enabled (enforced)")
	}
	if pB.AsrEnabled {
		t.Error("agent-b ASR should be disabled")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

// TestGetAgentPoliciesCached_TTLExpiry verifies cache expiration triggers re-fetch.
func TestGetAgentPoliciesCached_TTLExpiry(t *testing.T) {
	mock, teardown := setupPolicyMock()
	defer teardown()

	agent := "agent-ttl@example.com"

	// Use short TTL for testing
	InitPolicyCache(100*time.Millisecond, 200*time.Millisecond)

	// First call
	expectFullPolicyPipeline(mock, agent, "enforced")
	p1, err := GetAgentPoliciesCached(agent)
	if err != nil {
		t.Fatalf("first call error: %v", err)
	}
	if !p1.AsrEnabled {
		t.Error("first call: ASR should be enabled")
	}

	// Wait for TTL to expire
	time.Sleep(150 * time.Millisecond)

	// Second call after expiry: should hit Redis again (policy changed)
	expectFullPolicyPipeline(mock, agent, "disabled")
	p2, err := GetAgentPoliciesCached(agent)
	if err != nil {
		t.Fatalf("second call error: %v", err)
	}
	if p2.AsrEnabled {
		t.Error("second call: ASR should be disabled after re-fetch")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

// TestGetAgentPoliciesCached_NilClient verifies graceful handling when Redis is nil.
func TestGetAgentPoliciesCached_NilClient(t *testing.T) {
	originalClient := Client
	Client = nil
	defer func() { Client = originalClient }()

	ResetPolicyCache()

	policies, err := GetAgentPoliciesCached("any-agent")
	if err != nil {
		t.Fatalf("should not error with nil client: %v", err)
	}
	// Should return default zero-value policies
	if policies.AsrEnabled || policies.PcapEnabled {
		t.Error("all policies should be false with nil client")
	}
}

// TestGetAgentPoliciesCached_RedisError_NoCacheFallback verifies that Redis errors
// are returned when there's no cached value.
func TestGetAgentPoliciesCached_RedisError_NoCacheFallback(t *testing.T) {
	mock, teardown := setupPolicyMock()
	defer teardown()

	agent := "agent-err@example.com"

	// Simulate Redis error on all pipeline commands
	mock.ExpectGet("pcap:policy:global").SetErr(redis.ErrClosed)
	mock.ExpectGet("asr:policy:global").SetErr(redis.ErrClosed)
	mock.ExpectSIsMember("pcap:enabled:agents", agent).SetErr(redis.ErrClosed)
	mock.ExpectSIsMember("asr:enabled:agents", agent).SetErr(redis.ErrClosed)
	mock.ExpectHGet("asr:agent_policy", agent).SetErr(redis.ErrClosed)

	_, err := GetAgentPoliciesCached(agent)
	if err == nil {
		t.Error("should return error when Redis fails and no cache exists")
	}
}
