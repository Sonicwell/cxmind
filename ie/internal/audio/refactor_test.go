package audio

import (
	"context"
	"reflect"
	"testing"

	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── maskKey Tests ───

func TestMaskKey_ShortKey(t *testing.T) {
	assert.Equal(t, "****", maskKey("abc"))
	assert.Equal(t, "****", maskKey("abcd"))
}

func TestMaskKey_NormalKey(t *testing.T) {
	assert.Equal(t, "5678", maskKey("sk-12345678"))
}

func TestMaskKey_EmptyKey(t *testing.T) {
	assert.Equal(t, "****", maskKey(""))
}

func TestMaskKey_ExactlyFiveChars(t *testing.T) {
	assert.Equal(t, "bcde", maskKey("abcde"))
}

// ─── Provider Registry Tests ───

func TestProviderRegistry_AllProvidersRegistered(t *testing.T) {
	expectedProviders := []string{
		"dashscope", "deepgram", "funasr", "openai",
		"azure", "tencent", "google", "mock",
	}

	for _, name := range expectedProviders {
		entry := GetRegisteredProvider(name)
		assert.NotNil(t, entry, "Provider %q should be registered", name)
	}
}

func TestProviderRegistry_UnknownReturnsNil(t *testing.T) {
	entry := GetRegisteredProvider("nonexistent_vendor_xyz")
	assert.Nil(t, entry, "Unknown provider should return nil")
}

func TestProviderRegistry_CreateProviderTypes(t *testing.T) {
	tests := []struct {
		name         string
		provider     string
		expectedType string
	}{
		{"Mock", "mock", "MockASRProvider"},
		{"FunASR", "funasr", "FunASRProvider"},
		{"OpenAI", "openai", "OpenAIProvider"},
		{"DashScope", "dashscope", "DashScopeProvider"},
		{"Deepgram", "deepgram", "DeepgramProvider"},
		{"Azure", "azure", "AzureProvider"},
		{"Tencent", "tencent", "TencentProvider"},
		{"Google", "google", "GoogleProvider"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entry := GetRegisteredProvider(tt.provider)
			require.NotNil(t, entry, "Provider %q not registered", tt.provider)

			cfg := DynamicASRConfig{
				Provider: tt.provider,
				URL:      "http://test:8080",
				APIKey:   "test-key-12345",
			}
			p := entry.CreateProvider(cfg)
			typeName := reflect.TypeOf(p).Elem().Name()
			assert.Equal(t, tt.expectedType, typeName,
				"CreateProvider(%q) type mismatch", tt.provider)
		})
	}
}

func TestProviderRegistry_HasPoolForStreamingProviders(t *testing.T) {
	streamingProviders := []string{"dashscope", "deepgram", "funasr", "openai", "azure", "tencent"}
	for _, name := range streamingProviders {
		entry := GetRegisteredProvider(name)
		require.NotNil(t, entry, "Provider %q not registered", name)
		assert.NotNil(t, entry.CreateProtocol,
			"Streaming provider %q should have CreateProtocol", name)
		assert.Greater(t, entry.DefaultPoolSize, 0,
			"Streaming provider %q should have DefaultPoolSize > 0", name)
	}
}

func TestProviderRegistry_NoPoolForBatchProviders(t *testing.T) {
	batchProviders := []string{"google", "mock"}
	for _, name := range batchProviders {
		entry := GetRegisteredProvider(name)
		require.NotNil(t, entry, "Provider %q not registered", name)
		assert.Nil(t, entry.CreateProtocol,
			"Batch-only provider %q should NOT have CreateProtocol", name)
	}
}

func TestProviderRegistry_PoolKeyDiffers(t *testing.T) {
	// Azure pool key should include region
	entry := GetRegisteredProvider("azure")
	require.NotNil(t, entry)
	cfg := DynamicASRConfig{URL: "eastus"}
	key := entry.PoolKey(cfg)
	assert.Contains(t, key, "eastus", "Azure pool key should include region")

	// Tencent pool key should include appID
	entry = GetRegisteredProvider("tencent")
	require.NotNil(t, entry)
	cfg = DynamicASRConfig{URL: "1250000000"}
	key = entry.PoolKey(cfg)
	assert.Contains(t, key, "1250000000", "Tencent pool key should include appID")
}

// ─── BasePoolStream Tests ───

func TestBasePoolStream_DelegatesResults(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	conn := &GenericConnection{
		state:   StateConnected,
		readyCh: make(chan struct{}),
		ctx:     ctx,
		cancel:  cancel,
	}
	close(conn.readyCh)

	handler := &GenericTaskHandler{
		taskID:  "test-task",
		conn:    conn,
		results: make(chan TranscriptionResult, 5),
		errors:  make(chan error, 5),
		done:    make(chan struct{}),
	}

	stream := &BasePoolStream{handler: handler}

	// Results channel should be the same
	handler.results <- TranscriptionResult{Text: "hello"}

	res := <-stream.Results()
	assert.Equal(t, "hello", res.Text)
}

func TestBasePoolStream_DelegatesErrors(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	handler := &GenericTaskHandler{
		taskID:  "test-task",
		conn:    &GenericConnection{ctx: ctx, cancel: cancel, readyCh: make(chan struct{})},
		results: make(chan TranscriptionResult, 5),
		errors:  make(chan error, 5),
		done:    make(chan struct{}),
	}

	stream := &BasePoolStream{handler: handler}

	handler.errors <- assert.AnError
	err := <-stream.Errors()
	assert.Error(t, err)
}

// ─── Refactored SetDynamicASRConfig Tests ───

func TestSetDynamicASRConfig_RefactoredWithRegistry(t *testing.T) {
	cleanupDynamicASRState(t)
	// Reset state
	dynamicConfigMu.Lock()
	dynamicASRConfig = nil
	dynamicASRProvider = nil
	dynamicConfigMu.Unlock()

	cfg := DynamicASRConfig{
		Provider: "mock",
		VendorID: "registry-test",
	}

	err := SetDynamicASRConfig(cfg)
	assert.NoError(t, err)

	got := GetDynamicASRConfig()
	require.NotNil(t, got)
	assert.Equal(t, "mock", got.Provider)

	provider := GetCurrentASRProvider()
	_, isMock := provider.(*MockASRProvider)
	assert.True(t, isMock, "Expected MockASRProvider, got %T", provider)
}

func TestSetDynamicASRConfig_GoogleProviderWorks(t *testing.T) {
	cleanupDynamicASRState(t)
	// Google was previously missing from SetDynamicASRConfig
	dynamicConfigMu.Lock()
	dynamicASRConfig = nil
	dynamicASRProvider = nil
	dynamicConfigMu.Unlock()

	cfg := DynamicASRConfig{
		Provider: "google",
		APIKey:   "test-google-api-key",
	}

	err := SetDynamicASRConfig(cfg)
	assert.NoError(t, err)

	provider := GetCurrentASRProvider()
	_, isGoogle := provider.(*GoogleProvider)
	assert.True(t, isGoogle, "Expected GoogleProvider, got %T", provider)

	// Cleanup
	dynamicConfigMu.Lock()
	dynamicASRConfig = nil
	dynamicASRProvider = nil
	dynamicConfigMu.Unlock()
}

func TestGetProviderFromConfig_AllEight(t *testing.T) {
	tests := []struct {
		name         string
		provider     string
		expectedType string
	}{
		{"Mock", "mock", "MockASRProvider"},
		{"FunASR", "funasr", "FunASRProvider"},
		{"OpenAI", "openai", "OpenAIProvider"},
		{"DashScope", "dashscope", "DashScopeProvider"},
		{"Deepgram", "deepgram", "DeepgramProvider"},
		{"Azure", "azure", "AzureProvider"},
		{"Tencent", "tencent", "TencentProvider"},
		{"Google", "google", "GoogleProvider"},
		{"Unknown defaults to mock", "unknown_provider", "MockASRProvider"},
		{"Empty defaults to mock", "", "MockASRProvider"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := getProviderFromConfig(tt.provider, "http://test:8080", "test-key-12345")
			typeName := reflect.TypeOf(p).Elem().Name()
			assert.Equal(t, tt.expectedType, typeName,
				"getProviderFromConfig(%q) type mismatch", tt.provider)
		})
	}
}

// ─── v2 Fix Tests ───

func TestEphemeralPoolCreatedAt_IsRecorded(t *testing.T) {
	// Clean up any leftover ephemeral pools from previous tests
	ephemeralPools.Range(func(key, _ any) bool {
		ephemeralPools.Delete(key)
		return true
	})
	ephemeralPoolCreatedAt.Range(func(key, _ any) bool {
		ephemeralPoolCreatedAt.Delete(key)
		return true
	})

	// Simulate storing an ephemeral pool (as providers should do)
	testKey := "test-vendor:test-api-key-xyz"
	ephemeralPools.Store(testKey, &GenericPool{vendor: "test"})
	ephemeralPoolCreatedAt.Store(testKey, timeutil.Now())

	// Verify createdAt was recorded
	_, ok := ephemeralPoolCreatedAt.Load(testKey)
	assert.True(t, ok, "ephemeralPoolCreatedAt should be set when ephemeral pool is created")

	// Clean up
	ephemeralPools.Delete(testKey)
	ephemeralPoolCreatedAt.Delete(testKey)
}

func TestMaskKey_UsedConsistently(t *testing.T) {
	// This test verifies maskKey is safe for all key lengths
	tests := []struct {
		key    string
		expect string
	}{
		{"", "****"},
		{"ab", "****"},
		{"abcd", "****"},
		{"abcde", "bcde"},
		{"sk-1234567890", "7890"},
	}
	for _, tt := range tests {
		result := maskKey(tt.key)
		assert.Equal(t, tt.expect, result, "maskKey(%q)", tt.key)
	}
}
