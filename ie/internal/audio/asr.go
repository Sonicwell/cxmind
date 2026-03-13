package audio

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"log"
	"sync"
	"time"
)

// maskKey returns a safe masked version of an API key for logging (last 4 chars only)
func maskKey(key string) string {
	if len(key) <= 4 {
		return "****"
	}
	return key[len(key)-4:]
}

// ASRProvider defines the interface for batch ASR services
type ASRProvider interface {
	Transcribe(audio []byte, sampleRate int, language string) (*TranscriptionResult, error)
}

// StreamingASRProvider defines the interface for streaming ASR services
type StreamingASRProvider interface {
	ASRProvider
	NewStream(sampleRate int, language string) (ASRStream, error)
}

// ASRStream defines the interface for an active ASR stream
type ASRStream interface {
	SendAudio(data []byte) error
	Close() error
	Results() <-chan TranscriptionResult
	Errors() <-chan error
}

type TranscriptionResult struct {
	Text        string    `json:"text"`
	Quality     string    `json:"quality,omitempty"`
	Intent      string    `json:"intent,omitempty"`
	IntentConf  float32   `json:"intent_conf,omitempty"`
	Toxic       bool      `json:"toxic,omitempty"`
	ToxicConf   float32   `json:"toxic_conf,omitempty"`
	Timestamp   time.Time `json:"timestamp"`
	Confidence  float64   `json:"confidence"`
	IsFinal     bool      `json:"is_final"`
	Speaker     string    `json:"speaker,omitempty"`
	RTTMs       int64     `json:"rtt_ms,omitempty"`
	StartTimeMs int64     `json:"start_time_ms,omitempty"`
	EndTimeMs   int64     `json:"end_time_ms,omitempty"`
}

// ─── Dynamic ASR Config (Hot Reload) ───

// DynamicASRConfig holds the runtime ASR configuration set via API
type DynamicASRConfig struct {
	Provider     string `json:"provider"`
	URL          string `json:"url"`
	APIKey       string `json:"api_key"`
	Model        string `json:"model"`
	PoolSize     int    `json:"pool_size"`
	VendorID     string `json:"vendor_id"`
	CustomParams string `json:"custom_params"` // 用户自定义 JSON，merge 到 StartTaskFrame params
}

var (
	dynamicASRConfig   *DynamicASRConfig
	dynamicASRProvider ASRProvider // cached provider instance
	dynamicConfigMu    sync.RWMutex
)

// GetDynamicASRConfig returns the current dynamic ASR config (or nil if using config file)
func GetDynamicASRConfig() *DynamicASRConfig {
	dynamicConfigMu.RLock()
	defer dynamicConfigMu.RUnlock()
	return dynamicASRConfig
}

// SetDynamicASRConfig updates the dynamic ASR config and triggers pool replacement if needed
func SetDynamicASRConfig(cfg DynamicASRConfig) error {
	log.Printf("[ASR] Setting dynamic config: provider=%s, vendorId=%s",
		cfg.Provider, cfg.VendorID)

	// Create provider from registry
	dynamicConfigMu.Lock()
	dynamicASRConfig = &cfg
	dynamicASRProvider = getProviderFromConfig(cfg.Provider, cfg.URL, cfg.APIKey)
	dynamicConfigMu.Unlock()

	// Pool replacement: iterate registry, replace the active provider's pool,
	// and drain pools of other streaming providers
	for _, entry := range providerRegistryMap {
		if entry.CreateProtocol == nil {
			continue // batch-only providers have no pool
		}

		poolKey := entry.Name
		if entry.PoolKey != nil {
			poolKey = entry.PoolKey(cfg)
		}

		if entry.Name == cfg.Provider {
			// Active provider: create/replace its pool
			poolSize := cfg.PoolSize
			if poolSize <= 0 {
				poolSize = entry.DefaultPoolSize
			}
			protocol := entry.CreateProtocol(cfg)
			ReplaceVendorPool(poolKey, protocol, poolSize)
		} else {
			// Inactive streaming provider: drain its pool with size 0
			// Use a minimal pool key (just vendor name) for draining
			drainKey := entry.Name
			if entry.PoolKey != nil {
				drainKey = entry.PoolKey(DynamicASRConfig{})
			}
			// Only drain if a pool with this key exists
			vendorPoolsMu.RLock()
			_, exists := vendorPools[drainKey]
			vendorPoolsMu.RUnlock()
			if exists {
				ReplaceVendorPool(drainKey, entry.CreateProtocol(DynamicASRConfig{}), 0)
			}
		}
	}

	log.Printf("[ASR] Dynamic config applied successfully: %s", cfg.Provider)
	return nil
}

// CloseGlobalPool drains and closes all active ASR connection pools (for graceful shutdown)
func CloseGlobalPool() {
	vendorPoolsMu.Lock()
	pools := make([]*GenericPool, 0, len(vendorPools))
	for _, p := range vendorPools {
		pools = append(pools, p)
	}
	// Clear the map
	vendorPools = make(map[string]*GenericPool)
	vendorPoolsMu.Unlock()

	for _, p := range pools {
		if p != nil {
			p.drainAndClose()
		}
	}
}

// GetCurrentASRProvider returns the provider based on dynamic config (if set) or viper fallback
func GetCurrentASRProvider() ASRProvider {
	dynamicConfigMu.RLock()
	// cfg := dynamicASRConfig // logic change: Check provider directly
	provider := dynamicASRProvider
	dynamicConfigMu.RUnlock()

	if provider != nil {
		return provider
	}

	// Fallback to config file
	return GetASRProvider()
}

// GetCurrentVendorName returns the active ASR vendor name for error messages
func GetCurrentVendorName() string {
	dynamicConfigMu.RLock()
	cfg := dynamicASRConfig
	dynamicConfigMu.RUnlock()
	if cfg != nil && cfg.Provider != "" {
		return cfg.Provider
	}
	return config.Global.GetString("asr.provider")
}

// SetASRProviderForTesting allows injecting a mock provider for tests
func SetASRProviderForTesting(p ASRProvider) {
	dynamicConfigMu.Lock()
	defer dynamicConfigMu.Unlock()
	dynamicASRProvider = p
	// We don't strictly need to set dynamicASRConfig if we relax the check in GetCurrentASRProvider
}

// getProviderFromConfig creates an ASR provider instance from explicit config values.
// Uses the provider registry for lookup; falls back to mock for unknown providers.
func getProviderFromConfig(provider, url, apiKey string) ASRProvider {
	entry := GetRegisteredProvider(provider)
	if entry == nil {
		log.Printf("Unknown ASR provider: %s, using mock", provider)
		return NewMockASRProvider()
	}

	log.Printf("[ASR] Initializing %s provider...", entry.Name)
	return entry.CreateProvider(DynamicASRConfig{
		Provider: provider,
		URL:      url,
		APIKey:   apiKey,
	})
}

// ─── Provider Implementations ───

// OpenAIProvider implemented in openai.go

// GetASRProvider returns the provider from config file (viper). Used as fallback.
// Uses the provider registry for lookup.
func GetASRProvider() ASRProvider {
	provider := config.Global.GetString("asr.provider")

	entry := GetRegisteredProvider(provider)
	if entry != nil && entry.NewFromViper != nil {
		return entry.NewFromViper()
	}

	log.Printf("Unknown ASR provider: %s, using mock", provider)
	return NewMockASRProvider()
}
