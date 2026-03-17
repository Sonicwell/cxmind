package redis

import (
	"log"
	"time"

	gocache "github.com/patrickmn/go-cache"
)

const (
	// PolicyCacheDefaultTTL is the default TTL for cached agent policies.
	// AgentPolicies are determined at call setup (INVITE) and don't change
	// during a call's lifetime. This cache reduces Redis reads for repeated
	// lookups of the same agent across concurrent calls.
	PolicyCacheDefaultTTL = 30 * time.Second

	// PolicyCacheCleanupInterval controls how often expired entries are purged.
	PolicyCacheCleanupInterval = 60 * time.Second
)

// policyCache holds cached AgentPolicies keyed by agent identifier.
var policyCache *gocache.Cache

func init() {
	policyCache = gocache.New(PolicyCacheDefaultTTL, PolicyCacheCleanupInterval)
}

// InitPolicyCache re-initializes the policy cache with custom TTL and cleanup interval.
// Useful for testing with shorter TTLs.
func InitPolicyCache(ttl, cleanup time.Duration) {
	policyCache = gocache.New(ttl, cleanup)
}

// ResetPolicyCache clears all cached entries and resets to default TTL.
// Used in tests to ensure isolation between test cases.
func ResetPolicyCache() {
	policyCache = gocache.New(PolicyCacheDefaultTTL, PolicyCacheCleanupInterval)
}

// GetAgentPoliciesCached returns agent policies with an in-memory cache layer.
// On cache miss, it calls GetAgentPolicies (Redis pipeline) and caches the result.
// On cache hit, it returns immediately without any Redis I/O.
func GetAgentPoliciesCached(agent string) (*AgentPolicies, error) {
	// Check cache first
	if cached, found := policyCache.Get(agent); found {
		return cached.(*AgentPolicies), nil
	}

	// Cache miss: fetch from Redis
	policies, err := GetAgentPolicies(agent)
	if err != nil {
		return nil, err
	}

	// Store in cache
	policyCache.Set(agent, policies, gocache.DefaultExpiration)
	log.Printf("[POLICY_CACHE] Cached policies for agent %s (TTL=%v)", agent, PolicyCacheDefaultTTL)

	return policies, nil
}
