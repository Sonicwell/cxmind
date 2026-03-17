package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
)

func TestConfigReload_ConcurrencyRace(t *testing.T) {
	// Setup a temporary valid config file
	configContent := []byte(`
textfilter:
  enabled: true
  workers: 4
  channel_size: 256
`)
	err := os.WriteFile("test_config.yaml", configContent, 0644)
	assert.NoError(t, err)
	defer os.Remove("test_config.yaml")

	// Set viper to use this file
	viper.SetConfigFile("test_config.yaml")
	err = viper.ReadInConfig()
	assert.NoError(t, err)

	InitMiddleware()

	reloadHandler := http.HandlerFunc(RequireLocalAccess(func(w http.ResponseWriter, r *http.Request) {
		if err := config.Global.Reload(); err != nil {
			t.Logf("ReadInConfig error: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		InitMiddleware()
		w.WriteHeader(http.StatusOK)
	}))

	// 模拟并发测试: 1 协程负责配置重载 (Config reload simulation)
	// and multiple goroutines reading it in the hot path.
	var wg sync.WaitGroup
	stopCh := make(chan struct{})

	// Hot path readers (e.g. RTP stream checking if textfilter is enabled)
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stopCh:
					return
				default:
					// This is the hot-path read that races with ReadInConfig
					_ = config.Global.GetBool("textfilter.enabled")
					_ = config.Global.GetInt("textfilter.workers")
				}
			}
		}()
	}

	// Hot path readers (e.g. InitMiddleware checking trusted sources)
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stopCh:
					return
				default:
					// Another common hot path read
					_ = config.Global.GetStringSlice("http.trusted_sources")
					// and simulated RTP hot path
					_ = config.Global.GetInt("sniffer.rtp_timeout_seconds")
				}
			}
		}()
	}

	// 1 config reloader
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 100; i++ {
			req := httptest.NewRequest("POST", "/api/config/reload", nil)
			req.Header.Set("X-Forwarded-For", "127.0.0.1")
			w := httptest.NewRecorder()
			reloadHandler.ServeHTTP(w, req)
			time.Sleep(1 * time.Millisecond) // yield
		}
		close(stopCh) // stop readers when done
	}()

	// Wait for test to finish
	wg.Wait()
	// If run with -race, the race detector will panic or fail the test if viper.ReadInConfig
	// races with viper.Get*
}
