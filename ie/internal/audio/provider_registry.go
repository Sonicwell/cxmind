package audio

import (
	"log"
	"net/http"
	"time"
)

// ProviderEntry defines a registered ASR provider with its factory functions
type ProviderEntry struct {
	Name            string
	CreateProvider  func(cfg DynamicASRConfig) ASRProvider
	CreateProtocol  func(cfg DynamicASRConfig) StreamProtocol // nil = no pool (batch-only)
	PoolKey         func(cfg DynamicASRConfig) string         // nil = use Name as pool key
	DefaultPoolSize int                                       // 0 = no pool
	NewFromViper    func() ASRProvider                        // fallback from config file
}

// Global registry
var providerRegistryMap = make(map[string]*ProviderEntry)

// RegisterProvider adds a provider to the global registry
func RegisterProvider(entry ProviderEntry) {
	providerRegistryMap[entry.Name] = &entry
}

// GetRegisteredProvider returns the entry for a given provider name, or nil if not found
func GetRegisteredProvider(name string) *ProviderEntry {
	return providerRegistryMap[name]
}

// ListRegisteredProviders returns all registered provider names
func ListRegisteredProviders() []string {
	names := make([]string, 0, len(providerRegistryMap))
	for k := range providerRegistryMap {
		names = append(names, k)
	}
	return names
}

// initRegistry centralizes all provider registrations.
// Called explicitly rather than via init() to avoid file-ordering dependencies.
func initRegistry() {
	// ─── DashScope ───
	RegisterProvider(ProviderEntry{
		Name: "dashscope",
		CreateProvider: func(cfg DynamicASRConfig) ASRProvider {
			if cfg.URL != "" || cfg.APIKey != "" {
				return &DashScopeProvider{apiURL: cfg.URL, apiKey: cfg.APIKey}
			}
			return NewDashScopeProvider()
		},
		CreateProtocol: func(cfg DynamicASRConfig) StreamProtocol {
			p := NewDashScopeProtocol(cfg.URL, cfg.APIKey)
			p.SetCustomParams(cfg.CustomParams)
			return p
		},
		PoolKey:         func(cfg DynamicASRConfig) string { return "dashscope" },
		DefaultPoolSize: 20,
		NewFromViper:    func() ASRProvider { return NewDashScopeProvider() },
	})

	// ─── Deepgram ───
	RegisterProvider(ProviderEntry{
		Name: "deepgram",
		CreateProvider: func(cfg DynamicASRConfig) ASRProvider {
			if cfg.URL != "" || cfg.APIKey != "" {
				return &DeepgramProvider{apiURL: cfg.URL, apiKey: cfg.APIKey}
			}
			return NewDeepgramProvider()
		},
		CreateProtocol: func(cfg DynamicASRConfig) StreamProtocol {
			return NewDeepgramProtocol(cfg.URL, cfg.APIKey, 8000, "auto")
		},
		PoolKey:         func(cfg DynamicASRConfig) string { return "deepgram_8000_auto" },
		DefaultPoolSize: 20,
		NewFromViper:    func() ASRProvider { return NewDeepgramProvider() },
	})

	// ─── FunASR ───
	RegisterProvider(ProviderEntry{
		Name: "funasr",
		CreateProvider: func(cfg DynamicASRConfig) ASRProvider {
			return &FunASRProvider{
				apiURL: cfg.URL,
				apiKey: cfg.APIKey,
				client: &http.Client{Timeout: 30 * time.Second},
			}
		},
		CreateProtocol: func(cfg DynamicASRConfig) StreamProtocol {
			p := NewFunASRProtocol(cfg.URL, cfg.APIKey, 8000, "auto")
			p.SetCustomParams(cfg.CustomParams)
			return p
		},
		PoolKey:         func(cfg DynamicASRConfig) string { return "funasr_8000_auto" },
		DefaultPoolSize: 20,
		NewFromViper:    func() ASRProvider { return NewFunASRProvider() },
	})

	// ─── OpenAI ───
	RegisterProvider(ProviderEntry{
		Name: "openai",
		CreateProvider: func(cfg DynamicASRConfig) ASRProvider {
			return &OpenAIProvider{
				apiKey: cfg.APIKey,
				client: &http.Client{Timeout: 60 * time.Second},
			}
		},
		CreateProtocol: func(cfg DynamicASRConfig) StreamProtocol {
			model := cfg.Model
			if model == "" {
				model = "gpt-4o-realtime-preview"
			}
			p := NewOpenAIProtocol("wss://api.openai.com/v1/realtime", cfg.APIKey, model, 8000, "auto")
			p.SetCustomParams(cfg.CustomParams)
			return p
		},
		PoolKey:         func(cfg DynamicASRConfig) string { return "openai" },
		DefaultPoolSize: 10,
		NewFromViper:    func() ASRProvider { return NewOpenAIProvider() },
	})

	// ─── Azure ───
	RegisterProvider(ProviderEntry{
		Name: "azure",
		CreateProvider: func(cfg DynamicASRConfig) ASRProvider {
			if cfg.URL != "" || cfg.APIKey != "" {
				return &AzureProvider{apiURL: cfg.URL, apiKey: cfg.APIKey}
			}
			return NewAzureProvider()
		},
		CreateProtocol: func(cfg DynamicASRConfig) StreamProtocol {
			return NewAzureProtocol(cfg.URL, cfg.APIKey, 8000, "auto")
		},
		PoolKey:         func(cfg DynamicASRConfig) string { return "azure_" + cfg.URL },
		DefaultPoolSize: 20,
		NewFromViper:    func() ASRProvider { return NewAzureProvider() },
	})

	// ─── Tencent ───
	RegisterProvider(ProviderEntry{
		Name: "tencent",
		CreateProvider: func(cfg DynamicASRConfig) ASRProvider {
			if cfg.URL != "" || cfg.APIKey != "" {
				return &TencentProvider{appID: cfg.URL, apiKey: cfg.APIKey}
			}
			return NewTencentProvider()
		},
		CreateProtocol: func(cfg DynamicASRConfig) StreamProtocol {
			return NewTencentProtocol(cfg.URL, cfg.APIKey, "", 8000)
		},
		PoolKey:         func(cfg DynamicASRConfig) string { return "tencent_" + cfg.URL },
		DefaultPoolSize: 20,
		NewFromViper:    func() ASRProvider { return NewTencentProvider() },
	})

	// ─── Google (batch-only, no pool) ───
	RegisterProvider(ProviderEntry{
		Name: "google",
		CreateProvider: func(cfg DynamicASRConfig) ASRProvider {
			if cfg.APIKey != "" {
				return &GoogleProvider{
					apiKey:    cfg.APIKey,
					projectID: cfg.URL,
					client:    &http.Client{Timeout: 120 * time.Second},
				}
			}
			return NewGoogleProvider()
		},
		CreateProtocol:  nil, // REST-only, no WebSocket pool
		PoolKey:         nil,
		DefaultPoolSize: 0,
		NewFromViper:    func() ASRProvider { return NewGoogleProvider() },
	})

	// ─── Mock ───
	RegisterProvider(ProviderEntry{
		Name: "mock",
		CreateProvider: func(cfg DynamicASRConfig) ASRProvider {
			return NewMockASRProvider()
		},
		CreateProtocol:  nil,
		PoolKey:         nil,
		DefaultPoolSize: 0,
		NewFromViper:    func() ASRProvider { return NewMockASRProvider() },
	})
}

func init() {
	initRegistry()
	log.Printf("[ASR] Provider registry initialized with %d providers", len(providerRegistryMap))
}
