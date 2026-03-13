package audio

import (
	"testing"
)

// ── Provider Registry ──────────────────────────────────────

func TestProviderRegistry_AllRegistered(t *testing.T) {
	// init() → initRegistry() runs at package load
	expected := []string{
		"dashscope", "deepgram", "funasr", "openai",
		"azure", "tencent", "google", "mock",
	}
	registered := ListRegisteredProviders()

	if len(registered) < len(expected) {
		t.Fatalf("expected at least %d providers, got %d: %v",
			len(expected), len(registered), registered)
	}

	nameSet := make(map[string]bool)
	for _, n := range registered {
		nameSet[n] = true
	}
	for _, want := range expected {
		if !nameSet[want] {
			t.Errorf("provider %q not registered", want)
		}
	}
}

func TestGetRegisteredProvider_Known(t *testing.T) {
	p := GetRegisteredProvider("deepgram")
	if p == nil {
		t.Fatal("expected deepgram provider entry, got nil")
	}
	if p.Name != "deepgram" {
		t.Errorf("expected name 'deepgram', got %q", p.Name)
	}
	if p.DefaultPoolSize <= 0 {
		t.Error("expected positive DefaultPoolSize for deepgram")
	}
}

func TestGetRegisteredProvider_Unknown(t *testing.T) {
	p := GetRegisteredProvider("nonexistent_provider")
	if p != nil {
		t.Fatal("expected nil for unknown provider")
	}
}

func TestProviderEntry_GoogleIsRestOnly(t *testing.T) {
	p := GetRegisteredProvider("google")
	if p == nil {
		t.Fatal("google not registered")
	}
	if p.CreateProtocol != nil {
		t.Error("google should not have a protocol (REST-only)")
	}
	if p.DefaultPoolSize != 0 {
		t.Errorf("google pool size should be 0, got %d", p.DefaultPoolSize)
	}
}

func TestProviderEntry_MockIsRestOnly(t *testing.T) {
	p := GetRegisteredProvider("mock")
	if p == nil {
		t.Fatal("mock not registered")
	}
	if p.CreateProtocol != nil {
		t.Error("mock should not have a protocol")
	}
}

// ── DashScope Protocol ─────────────────────────────────────

func TestDashScopeProtocol_Endpoint(t *testing.T) {
	p := NewDashScopeProtocol("wss://custom.dashscope.com/ws", "test-key")
	ep := p.Endpoint()
	if ep != "wss://custom.dashscope.com/ws" {
		t.Errorf("unexpected endpoint: %s", ep)
	}
}

func TestDashScopeProtocol_AuthHeaders(t *testing.T) {
	p := NewDashScopeProtocol("wss://test.com", "my-api-key")
	headers := p.AuthHeaders()
	if headers == nil {
		t.Fatal("expected non-nil headers")
	}
	authVal := headers.Get("Authorization")
	if authVal == "" {
		t.Error("expected non-empty Authorization header")
	}
}

func TestDashScopeProtocol_StartTaskFrame(t *testing.T) {
	p := NewDashScopeProtocol("wss://test.com", "key")
	frame, err := p.StartTaskFrame("task-1", 16000, "zh")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if frame == nil {
		t.Fatal("expected non-nil start frame")
	}
}

func TestDashScopeProtocol_StopTaskFrame(t *testing.T) {
	p := NewDashScopeProtocol("wss://test.com", "key")
	frame, err := p.StopTaskFrame("task-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if frame == nil {
		t.Fatal("expected non-nil stop frame")
	}
}

// ── Deepgram Protocol ──────────────────────────────────────

func TestDeepgramProtocol_Endpoint(t *testing.T) {
	p := NewDeepgramProtocol("wss://api.deepgram.com", "dk", 16000, "en")
	ep := p.Endpoint()
	if ep == "" {
		t.Error("endpoint should not be empty")
	}
}

func TestDeepgramProtocol_AuthHeaders(t *testing.T) {
	p := NewDeepgramProtocol("wss://api.deepgram.com", "dk", 16000, "en")
	h := p.AuthHeaders()
	if h == nil {
		t.Fatal("expected non-nil headers")
	}
}

func TestDeepgramProtocol_StopTaskFrame(t *testing.T) {
	p := NewDeepgramProtocol("wss://api.deepgram.com", "dk", 16000, "en")
	frame, err := p.StopTaskFrame("task-2")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if frame == nil {
		t.Fatal("expected non-nil stop frame")
	}
}

// ── FunASR Protocol ────────────────────────────────────────

func TestFunASRProtocol_Endpoint(t *testing.T) {
	p := NewFunASRProtocol("wss://funasr.example.com", "key", 8000, "zh")
	ep := p.Endpoint()
	if ep == "" {
		t.Error("funasr endpoint should not be empty")
	}
}

func TestFunASRProtocol_AuthHeaders(t *testing.T) {
	p := NewFunASRProtocol("wss://funasr.example.com", "key", 8000, "zh")
	h := p.AuthHeaders()
	// FunASR may or may not need auth headers depending on impl
	_ = h // Just verify no panic
}

func TestFunASRProtocol_StartTaskFrame(t *testing.T) {
	p := NewFunASRProtocol("wss://funasr.example.com", "key", 8000, "zh")
	frame, err := p.StartTaskFrame("task-3", 8000, "zh")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if frame == nil {
		t.Fatal("expected non-nil start frame")
	}
}

func TestFunASRProtocol_StopTaskFrame(t *testing.T) {
	p := NewFunASRProtocol("wss://funasr.example.com", "key", 8000, "zh")
	frame, err := p.StopTaskFrame("task-3")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if frame == nil {
		t.Fatal("expected non-nil stop frame")
	}
}

// ── Azure Protocol ─────────────────────────────────────────

func TestAzureProtocol_Endpoint(t *testing.T) {
	p := NewAzureProtocol("westus", "azure-key", 16000, "en-US")
	ep := p.Endpoint()
	if ep == "" {
		t.Error("azure endpoint should not be empty")
	}
}

func TestAzureProtocol_AuthHeaders(t *testing.T) {
	p := NewAzureProtocol("westus", "azure-key", 16000, "en-US")
	h := p.AuthHeaders()
	if h == nil {
		t.Fatal("expected non-nil headers")
	}
}

func TestAzureProtocol_StartTaskFrame(t *testing.T) {
	p := NewAzureProtocol("westus", "azure-key", 16000, "en-US")
	frame, err := p.StartTaskFrame("task-4", 16000, "en-US")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if frame == nil {
		t.Fatal("expected non-nil start frame")
	}
}

func TestAzureProtocol_StopTaskFrame(t *testing.T) {
	p := NewAzureProtocol("westus", "azure-key", 16000, "en-US")
	_, err := p.StopTaskFrame("task-4")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// nil frame is valid per StreamProtocol interface ("如果不需要返回 nil 即可")
}

// ── OpenAI Protocol ────────────────────────────────────────

func TestOpenAIProtocol_Endpoint(t *testing.T) {
	p := NewOpenAIProtocol("wss://api.openai.com/v1/realtime", "ok", "gpt-4o", 16000, "en")
	ep := p.Endpoint()
	if ep == "" {
		t.Error("openai endpoint should not be empty")
	}
}

func TestOpenAIProtocol_AuthHeaders(t *testing.T) {
	p := NewOpenAIProtocol("wss://api.openai.com/v1/realtime", "ok", "gpt-4o", 16000, "en")
	h := p.AuthHeaders()
	if h == nil {
		t.Fatal("expected non-nil headers")
	}
}

// ── Tencent Protocol ───────────────────────────────────────

func TestTencentProtocol_Endpoint(t *testing.T) {
	p := NewTencentProtocol("appid", "key", "secret", 8000)
	ep := p.Endpoint()
	if ep == "" {
		t.Error("tencent endpoint should not be empty")
	}
}

func TestTencentProtocol_AuthHeaders(t *testing.T) {
	p := NewTencentProtocol("appid", "key", "secret", 8000)
	h := p.AuthHeaders()
	_ = h // Just verify no panic
}
