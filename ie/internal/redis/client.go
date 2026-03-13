package redis

import (
	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"

	"context"
	"encoding/json"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
)

// IsPcapEnabled checks if a user (or domain) is in the enabled set
func IsPcapEnabled(user string) (bool, error) {
	if Client == nil {
		return false, nil
	}
	return Client.SIsMember(Ctx(), "pcap:enabled_users", user).Result()
}

// IsPcapRealmEnabled checks if a realm (domain) is in the enabled realms set
func IsPcapRealmEnabled(realm string) (bool, error) {
	if Client == nil {
		return false, nil
	}
	return Client.SIsMember(Ctx(), "pcap:enabled_realms", realm).Result()
}

// AgentPolicies holds the effective policy settings for an agent
// Summary is NOT handled here — AS decides summary independently.
type AgentPolicies struct {
	PcapEnabled     bool
	AsrEnabled      bool
	GlobalAsrPolicy string // "disabled" | "enforced" | "optional" — for Copilot ASR status
	AgentAsrPolicy  string // agent-level policy raw value
}

// GetAgentPolicies retrieves all policies for an agent (fully optimized with pipeline)
func GetAgentPolicies(agent string) (*AgentPolicies, error) {
	if Client == nil {
		return &AgentPolicies{}, nil
	}

	// Pipeline: Get global policies AND agent-level policies in 1 RTT
	pipe := Client.Pipeline()
	pcapGlobalCmd := pipe.Get(Ctx(), "pcap:policy:global")
	asrGlobalCmd := pipe.Get(Ctx(), "asr:policy:global")

	// Pre-fetch agent-level policies (even if not needed, to avoid extra RTT)
	pcapAgentCmd := pipe.SIsMember(Ctx(), "pcap:enabled:agents", agent)
	asrAgentCmd := pipe.SIsMember(Ctx(), "asr:enabled:agents", agent)
	// AS 同步的 per-agent policy 枚举值 (enforced/optional/disabled)
	asrAgentPolicyCmd := pipe.HGet(Ctx(), "asr:agent_policy", agent)

	_, err := pipe.Exec(Ctx())
	if err != nil && err != redis.Nil {
		return nil, err
	}

	policies := &AgentPolicies{}

	// Resolve PCAP
	pcapGlobal := pcapGlobalCmd.Val()
	if pcapGlobal == "" {
		pcapGlobal = "optional" // Default if not set
	}

	switch pcapGlobal {
	case "enforced":
		policies.PcapEnabled = true
	case "disabled":
		policies.PcapEnabled = false
	case "optional":
		policies.PcapEnabled = pcapAgentCmd.Val()
	}

	// Resolve ASR
	asrGlobal := asrGlobalCmd.Val()
	if asrGlobal == "" {
		asrGlobal = "optional"
	}

	policies.GlobalAsrPolicy = asrGlobal
	// 优先从 Redis Hash 读取 AS 同步的 per-agent policy 枚举值
	agentPolicyVal := asrAgentPolicyCmd.Val()
	if agentPolicyVal != "" {
		policies.AgentAsrPolicy = agentPolicyVal
	} else if asrGlobal == "optional" {
		// 兼容旧数据: Hash 不存在时降级为原逻辑
		policies.AgentAsrPolicy = "optional"
	} else {
		policies.AgentAsrPolicy = "disabled"
		if asrAgentCmd.Val() {
			policies.AgentAsrPolicy = "optional"
		}
	}

	switch asrGlobal {
	case "enforced":
		policies.AsrEnabled = true
	case "disabled":
		policies.AsrEnabled = false
	case "optional":
		policies.AsrEnabled = asrAgentCmd.Val()
	}

	return policies, nil
}

var (
	Client    *redis.Client
	atomicCtx atomic.Value // stores ctxWrapper; race-free
)

// ctxWrapper wraps context.Context so that atomic.Value always stores the same
// concrete type (different context implementations would cause a panic).
type ctxWrapper struct{ ctx context.Context }

func init() {
	atomicCtx.Store(ctxWrapper{ctx: context.Background()})
}

// Ctx returns the package-level context for Redis operations.
// Thread-safe: reads from atomic.Value.
func Ctx() context.Context {
	return atomicCtx.Load().(ctxWrapper).ctx
}

// SetContext replaces the package-level context for Redis operations.
// Call from main.go with a cancelable context derived from signal handling
// so that all Redis operations are canceled on graceful shutdown.
// Thread-safe: uses atomic.Value to prevent data races with concurrent Ctx() callers.
func SetContext(c context.Context) {
	atomicCtx.Store(ctxWrapper{ctx: c})
}

// Initialize creates a Redis client connection
func Initialize() error {
	addr := config.Global.GetString("redis.addr")
	if addr == "" {
		addr = "localhost:6379"
	}

	password := config.Global.GetString("redis.password")
	db := config.Global.GetInt("redis.db")

	poolSize := config.Global.GetInt("redis.pool_size")
	if poolSize <= 0 {
		poolSize = 50 // Default: handles ~500 concurrent calls comfortably
	}
	minIdleConns := config.Global.GetInt("redis.min_idle_conns")
	if minIdleConns <= 0 {
		minIdleConns = 10
	}

	Client = redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		PoolSize:     poolSize,
		MinIdleConns: minIdleConns,
		MaxRetries:   3,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
	})

	// Test connection
	_, err := Client.Ping(Ctx()).Result()
	return err
}

// CallEvent represents a call event to publish
type CallEvent struct {
	EventType  string                 `json:"event_type"` // call_create, call_answer, call_hangup, etc.
	CallID     string                 `json:"call_id"`
	Realm      string                 `json:"realm"`
	CallerURI  string                 `json:"caller_uri"`
	CalleeURI  string                 `json:"callee_uri"`
	Timestamp  time.Time              `json:"timestamp"`
	SrcIP      string                 `json:"src_ip"`
	DstIP      string                 `json:"dst_ip"`
	Method     string                 `json:"method,omitempty"`
	StatusCode int                    `json:"status_code,omitempty"`
	Extra      map[string]interface{} `json:"extra,omitempty"` // Additional metadata (e.g. RTP stats)
}

// PublishCallEvent publishes a call event to Redis
func PublishCallEvent(event *CallEvent) error {
	if Client == nil {
		return nil
	}
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	// Publish to call-specific channel
	channel := "call:event:" + event.CallID
	return Client.Publish(Ctx(), channel, data).Err()
}

// PublishTranscription publishes a transcription segment
func PublishTranscription(callID string, segment map[string]interface{}) error {
	if Client == nil {
		return nil
	}
	data, err := json.Marshal(segment)
	if err != nil {
		return err
	}

	channel := "call:transcription:" + callID
	return Client.Publish(Ctx(), channel, data).Err()
}


// SetCallState sets the current state of a call using pipeline (1 RTT)
func SetCallState(callID string, state map[string]interface{}) error {
	if Client == nil {
		return nil
	}
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}

	key := "call:state:" + callID

	// Pipeline: Set + SAdd/SRem in single RTT
	pipe := Client.Pipeline()
	pipe.Set(Ctx(), key, data, 24*time.Hour)

	// Maintain active_calls set based on status
	status, ok := state["status"].(string)
	if ok {
		now := timeutil.Now().UnixMilli()
		if status == "active" || status == "ringing" || status == "answered" {
			pipe.SAdd(Ctx(), "active_calls", callID)
			pipe.Set(Ctx(), "active_calls:version", now, 0)
		} else if status == "ended" || status == "failed" {
			pipe.SRem(Ctx(), "active_calls", callID)
			pipe.Set(Ctx(), "active_calls:version", now, 0)
		}
	}

	_, err = pipe.Exec(Ctx())
	return err
}

// EndCallBatch ends a call with batched operations (optimized with pipeline)
func EndCallBatch(callID string, state map[string]interface{}) error {
	if Client == nil {
		return nil
	}

	// N2 fix: copy state map before mutating, so caller's reference stays intact
	stateCopy := make(map[string]interface{}, len(state)+1)
	for k, v := range state {
		stateCopy[k] = v
	}
	stateCopy["status"] = "completed"
	stateData, err := json.Marshal(stateCopy)
	if err != nil {
		return err
	}

	// Pipeline: batch all write operations
	pipe := Client.Pipeline()
	pipe.Set(Ctx(), "call:state:"+callID, stateData, 24*time.Hour)
	pipe.SRem(Ctx(), "active_calls", callID)
	pipe.Set(Ctx(), "active_calls:version", timeutil.Now().UnixMilli(), 0)
	pipe.Del(Ctx(), "call:last_msg:"+callID) // Merged from handleTermination to save 1 RTT
	pipe.Del(Ctx(), "call:srtp:"+callID)     // Audit #4: delete SRTP key immediately (security)

	_, err = pipe.Exec(Ctx())
	return err
}

// GetCallState retrieves the current state of a call
func GetCallState(callID string) (map[string]interface{}, error) {
	if Client == nil {
		return nil, nil
	}
	key := "call:state:" + callID
	data, err := Client.Get(Ctx(), key).Result()
	if err != nil {
		return nil, err
	}

	var state map[string]interface{}
	err = json.Unmarshal([]byte(data), &state)
	return state, err
}

// CallStateWithSRTP holds call state and SRTP key
type CallStateWithSRTP struct {
	State   map[string]interface{}
	SRTPKey string
}

// GetCallStateWithSRTPKey retrieves call state and SRTP key in a single pipeline (optimization)
func GetCallStateWithSRTPKey(callID string) (*CallStateWithSRTP, error) {
	if Client == nil {
		return &CallStateWithSRTP{}, nil
	}

	// Pipeline: batch query call state and SRTP key
	pipe := Client.Pipeline()
	stateCmd := pipe.Get(Ctx(), "call:state:"+callID)
	srtpKeyCmd := pipe.Get(Ctx(), "call:srtp:"+callID)

	_, err := pipe.Exec(Ctx())
	if err != nil && err != redis.Nil {
		return nil, err
	}

	// Parse call state
	var state map[string]interface{}
	stateData, err := stateCmd.Result()
	if err == nil && stateData != "" {
		json.Unmarshal([]byte(stateData), &state)
	}

	// Get SRTP key (may be empty)
	srtpKey, _ := srtpKeyCmd.Result()

	return &CallStateWithSRTP{
		State:   state,
		SRTPKey: srtpKey,
	}, nil
}

// PublishQualityMetric publishes a quality metric update
func PublishQualityMetric(callID string, metric interface{}) error { // accepting interface{} to avoid circular dependency or redefining struct
	if Client == nil {
		return nil
	}
	data, err := json.Marshal(metric)
	if err != nil {
		return err
	}

	channel := "call:quality:" + callID
	return Client.Publish(Ctx(), channel, data).Err()
}

// SetSRTPKey stores the SRTP master key for a call
func SetSRTPKey(callID string, key string) error {
	if Client == nil {
		return nil
	}
	k := "call:srtp:" + callID
	// SEC-S2 fix: configurable TTL (default 24h to match call:state TTL).
	// Previously hardcoded to 1h, which caused SRTP decryption failure for long calls.
	ttl := config.Global.GetDuration("redis.srtp_key_ttl")
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	return Client.Set(Ctx(), k, key, ttl).Err()
}

// GetSRTPKey retrieves the SRTP master key for a call
func GetSRTPKey(callID string) (string, error) {
	if Client == nil {
		return "", nil
	}
	k := "call:srtp:" + callID
	val, err := Client.Get(Ctx(), k).Result()
	if err == redis.Nil {
		return "", nil
	}
	return val, err
}

// PublishAudio publishes audio data for monitoring
func PublishAudio(callID string, audioData map[string]interface{}) error {
	if Client == nil {
		return nil
	}
	data, err := json.Marshal(audioData)
	if err != nil {
		return err
	}

	channel := "call:audio:" + callID
	return Client.Publish(Ctx(), channel, data).Err()
}

// PublishRecordingReady notifies subscribers that a PCAP recording file has been
// flushed to disk and is ready for cloud upload.
func PublishRecordingReady(callID string, pcapPath string, realm string) error {
	if Client == nil {
		return nil
	}
	payload := map[string]string{
		"call_id":   callID,
		"pcap_path": pcapPath,
		"realm":     realm,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	channel := "recording:ready:" + callID
	return Client.Publish(Ctx(), channel, data).Err()
}

// Close closes the Redis connection
func Close() error {
	if Client != nil {
		return Client.Close()
	}
	return nil
}
