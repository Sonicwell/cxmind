package config

import (
	"sync"
	"time"

	"github.com/spf13/viper"
)

// SafeConfig provides thread-safe access to viper configuration.
// viper.ReadInConfig() is not thread-safe and will cause race conditions
// if called concurrently with viper.Get* methods.
type SafeConfig struct {
	mu sync.RWMutex
}

var Global = &SafeConfig{}

// Reload wrapping viper.ReadInConfig
func (s *SafeConfig) Reload() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return viper.ReadInConfig()
}

func (s *SafeConfig) GetBool(key string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return viper.GetBool(key)
}

func (s *SafeConfig) GetInt(key string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return viper.GetInt(key)
}

func (s *SafeConfig) GetFloat64(key string) float64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return viper.GetFloat64(key)
}

func (s *SafeConfig) GetString(key string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return viper.GetString(key)
}

func (s *SafeConfig) GetStringSlice(key string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return viper.GetStringSlice(key)
}

func (s *SafeConfig) GetDuration(key string) time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return viper.GetDuration(key)
}

func (s *SafeConfig) GetIntSlice(key string) []int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return viper.GetIntSlice(key)
}

func (s *SafeConfig) MergeInConfig() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return viper.MergeInConfig()
}

func (s *SafeConfig) IsSet(key string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return viper.IsSet(key)
}
