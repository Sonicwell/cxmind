package redis

import (
	"testing"

	"github.com/go-redis/redismock/v9"
)

// ────────────────────────────────────────────────────────────────────
// global=optional + agent NOT in enabled SET → AgentAsrPolicy 仍为 optional
// 这是 canToggle=true 的前提, 坐席可在通话中控制 ASR
// ────────────────────────────────────────────────────────────────────

func TestGetAgentPolicies_OptionalGlobal_AgentNotInSet(t *testing.T) {
	db, mock := redismock.NewClientMock()
	origClient := Client
	Client = db
	defer func() { Client = origClient; db.Close() }()

	agent := "5001@example.com"

	// global=optional, agent NOT in asr:enabled:agents
	mock.ExpectGet("pcap:policy:global").SetVal("optional")
	mock.ExpectGet("asr:policy:global").SetVal("optional")
	mock.ExpectSIsMember("pcap:enabled:agents", agent).SetVal(false)
	mock.ExpectSIsMember("asr:enabled:agents", agent).SetVal(false) // 偏好关闭
	mock.ExpectHGet("asr:agent_policy", agent).RedisNil()            // Hash 无值 → 走兼容路径

	p, err := GetAgentPolicies(agent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// AgentAsrPolicy 应继承为 optional (坐席可控), 而非 disabled
	if p.AgentAsrPolicy != "optional" {
		t.Errorf("AgentAsrPolicy = %q, want 'optional' (global=optional inherits)", p.AgentAsrPolicy)
	}
	// AsrEnabled 应为 false (偏好关闭, 通话中不自动启动)
	if p.AsrEnabled {
		t.Error("AsrEnabled should be false (agent default preference is off)")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestGetAgentPolicies_OptionalGlobal_AgentInSet(t *testing.T) {
	db, mock := redismock.NewClientMock()
	origClient := Client
	Client = db
	defer func() { Client = origClient; db.Close() }()

	agent := "5002@example.com"

	mock.ExpectGet("pcap:policy:global").SetVal("optional")
	mock.ExpectGet("asr:policy:global").SetVal("optional")
	mock.ExpectSIsMember("pcap:enabled:agents", agent).SetVal(false)
	mock.ExpectSIsMember("asr:enabled:agents", agent).SetVal(true) // 偏好开启
	mock.ExpectHGet("asr:agent_policy", agent).RedisNil()

	p, err := GetAgentPolicies(agent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if p.AgentAsrPolicy != "optional" {
		t.Errorf("AgentAsrPolicy = %q, want 'optional'", p.AgentAsrPolicy)
	}
	if !p.AsrEnabled {
		t.Error("AsrEnabled should be true (agent preference is on)")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestGetAgentPolicies_DisabledGlobal_AgentInSet_StillDisabled(t *testing.T) {
	db, mock := redismock.NewClientMock()
	origClient := Client
	Client = db
	defer func() { Client = origClient; db.Close() }()

	agent := "5003@example.com"

	// global=disabled 时, 即使 agent 在 SET 中, 也不能开 ASR
	mock.ExpectGet("pcap:policy:global").SetVal("optional")
	mock.ExpectGet("asr:policy:global").SetVal("disabled")
	mock.ExpectSIsMember("pcap:enabled:agents", agent).SetVal(false)
	mock.ExpectSIsMember("asr:enabled:agents", agent).SetVal(true)
	mock.ExpectHGet("asr:agent_policy", agent).RedisNil()

	p, err := GetAgentPolicies(agent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if p.AgentAsrPolicy != "optional" {
		t.Errorf("AgentAsrPolicy = %q, want 'optional' (agent is in SET)", p.AgentAsrPolicy)
	}
	if p.AsrEnabled {
		t.Error("AsrEnabled should be false (global=disabled overrides agent)")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestGetAgentPolicies_DisabledGlobal_AgentNotInSet(t *testing.T) {
	db, mock := redismock.NewClientMock()
	origClient := Client
	Client = db
	defer func() { Client = origClient; db.Close() }()

	agent := "5004@example.com"

	// global=disabled, agent 不在 SET → AgentAsrPolicy 应为 disabled
	mock.ExpectGet("pcap:policy:global").SetVal("optional")
	mock.ExpectGet("asr:policy:global").SetVal("disabled")
	mock.ExpectSIsMember("pcap:enabled:agents", agent).SetVal(false)
	mock.ExpectSIsMember("asr:enabled:agents", agent).SetVal(false)
	mock.ExpectHGet("asr:agent_policy", agent).RedisNil()

	p, err := GetAgentPolicies(agent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if p.AgentAsrPolicy != "disabled" {
		t.Errorf("AgentAsrPolicy = %q, want 'disabled' (global!=optional + agent not in SET)", p.AgentAsrPolicy)
	}
	if p.AsrEnabled {
		t.Error("AsrEnabled should be false")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

func TestGetAgentPolicies_EnforcedGlobal_OverridesAgent(t *testing.T) {
	db, mock := redismock.NewClientMock()
	origClient := Client
	Client = db
	defer func() { Client = origClient; db.Close() }()

	agent := "5005@example.com"

	// global=enforced → ASR 强制开启, AgentAsrPolicy 跟 SET 走
	mock.ExpectGet("pcap:policy:global").SetVal("optional")
	mock.ExpectGet("asr:policy:global").SetVal("enforced")
	mock.ExpectSIsMember("pcap:enabled:agents", agent).SetVal(false)
	mock.ExpectSIsMember("asr:enabled:agents", agent).SetVal(false) // agent 不在 SET
	mock.ExpectHGet("asr:agent_policy", agent).RedisNil()

	p, err := GetAgentPolicies(agent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// global=enforced → AgentAsrPolicy = disabled (因 agent 不在 SET, 且 global!=optional)
	if p.AgentAsrPolicy != "disabled" {
		t.Errorf("AgentAsrPolicy = %q, want 'disabled'", p.AgentAsrPolicy)
	}
	// 但 AsrEnabled 应为 true (global=enforced 覆盖)
	if !p.AsrEnabled {
		t.Error("AsrEnabled should be true (global=enforced)")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

// ────────────────────────────────────────────────────────────────────
// global=optional + agent policy Hash = "enforced" → AgentAsrPolicy 必须为 enforced
// 这是 canToggle=false 的前提, 坐席不可控制 ASR
// Bug 回归守护: IE 曾硬编码 optional 导致 enforced 失效
// ────────────────────────────────────────────────────────────────────

func TestGetAgentPolicies_OptionalGlobal_AgentPolicyEnforced(t *testing.T) {
	db, mock := redismock.NewClientMock()
	origClient := Client
	Client = db
	defer func() { Client = origClient; db.Close() }()

	agent := "5006@example.com"

	mock.ExpectGet("pcap:policy:global").SetVal("optional")
	mock.ExpectGet("asr:policy:global").SetVal("optional")
	mock.ExpectSIsMember("pcap:enabled:agents", agent).SetVal(false)
	mock.ExpectSIsMember("asr:enabled:agents", agent).SetVal(true)
	mock.ExpectHGet("asr:agent_policy", agent).SetVal("enforced")

	p, err := GetAgentPolicies(agent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Hash 明确返回 enforced → AgentAsrPolicy 必须为 enforced
	if p.AgentAsrPolicy != "enforced" {
		t.Errorf("AgentAsrPolicy = %q, want 'enforced'", p.AgentAsrPolicy)
	}
	if !p.AsrEnabled {
		t.Error("AsrEnabled should be true (agent in enabled SET)")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}

// ────────────────────────────────────────────────────────────────────
// global=optional + agent policy Hash = "disabled" → AgentAsrPolicy 必须为 disabled
// Bug 回归守护: IE 曾硬编码 optional
// ────────────────────────────────────────────────────────────────────

func TestGetAgentPolicies_OptionalGlobal_AgentPolicyDisabled(t *testing.T) {
	db, mock := redismock.NewClientMock()
	origClient := Client
	Client = db
	defer func() { Client = origClient; db.Close() }()

	agent := "5007@example.com"

	mock.ExpectGet("pcap:policy:global").SetVal("optional")
	mock.ExpectGet("asr:policy:global").SetVal("optional")
	mock.ExpectSIsMember("pcap:enabled:agents", agent).SetVal(false)
	mock.ExpectSIsMember("asr:enabled:agents", agent).SetVal(false)
	mock.ExpectHGet("asr:agent_policy", agent).SetVal("disabled")

	p, err := GetAgentPolicies(agent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if p.AgentAsrPolicy != "disabled" {
		t.Errorf("AgentAsrPolicy = %q, want 'disabled'", p.AgentAsrPolicy)
	}
	if p.AsrEnabled {
		t.Error("AsrEnabled should be false")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %v", err)
	}
}
