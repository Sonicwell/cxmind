package config

import (
	"sync"
	"testing"
	"time"

	"github.com/spf13/viper"
)

func TestSafeConfig_GetString(t *testing.T) {
	viper.Reset()
	viper.Set("test.key", "hello")
	sc := &SafeConfig{}

	got := sc.GetString("test.key")
	if got != "hello" {
		t.Errorf("GetString = %q, want %q", got, "hello")
	}
}

func TestSafeConfig_GetBool(t *testing.T) {
	viper.Reset()
	viper.Set("test.flag", true)
	sc := &SafeConfig{}

	if !sc.GetBool("test.flag") {
		t.Error("GetBool = false, want true")
	}
}

func TestSafeConfig_GetInt(t *testing.T) {
	viper.Reset()
	viper.Set("test.port", 9060)
	sc := &SafeConfig{}

	if got := sc.GetInt("test.port"); got != 9060 {
		t.Errorf("GetInt = %d, want 9060", got)
	}
}

func TestSafeConfig_GetFloat64(t *testing.T) {
	viper.Reset()
	viper.Set("test.ratio", 3.14)
	sc := &SafeConfig{}

	if got := sc.GetFloat64("test.ratio"); got != 3.14 {
		t.Errorf("GetFloat64 = %f, want 3.14", got)
	}
}

func TestSafeConfig_GetStringSlice(t *testing.T) {
	viper.Reset()
	viper.Set("test.hosts", []string{"a", "b"})
	sc := &SafeConfig{}

	got := sc.GetStringSlice("test.hosts")
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Errorf("GetStringSlice = %v, want [a b]", got)
	}
}

func TestSafeConfig_GetDuration(t *testing.T) {
	viper.Reset()
	viper.Set("test.timeout", "5s")
	sc := &SafeConfig{}

	if got := sc.GetDuration("test.timeout"); got != 5*time.Second {
		t.Errorf("GetDuration = %v, want 5s", got)
	}
}

func TestSafeConfig_GetIntSlice(t *testing.T) {
	viper.Reset()
	viper.Set("test.ports", []int{5060, 5061})
	sc := &SafeConfig{}

	got := sc.GetIntSlice("test.ports")
	if len(got) != 2 || got[0] != 5060 {
		t.Errorf("GetIntSlice = %v, want [5060 5061]", got)
	}
}

func TestSafeConfig_IsSet(t *testing.T) {
	viper.Reset()
	viper.Set("exists", "yes")
	sc := &SafeConfig{}

	if !sc.IsSet("exists") {
		t.Error("IsSet(exists) = false, want true")
	}
	if sc.IsSet("nope") {
		t.Error("IsSet(nope) = true, want false")
	}
}

func TestSafeConfig_MissingKey_ReturnsZeroValue(t *testing.T) {
	viper.Reset()
	sc := &SafeConfig{}

	if sc.GetString("nonexistent") != "" {
		t.Error("expected empty string for missing key")
	}
	if sc.GetInt("nonexistent") != 0 {
		t.Error("expected 0 for missing int key")
	}
	if sc.GetBool("nonexistent") {
		t.Error("expected false for missing bool key")
	}
}

func TestSafeConfig_ConcurrentAccess(t *testing.T) {
	viper.Reset()
	viper.Set("concurrent.key", "value")
	sc := &SafeConfig{}

	var wg sync.WaitGroup
	// concurrent readers
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = sc.GetString("concurrent.key")
			_ = sc.GetBool("concurrent.flag")
			_ = sc.GetInt("concurrent.num")
			_ = sc.IsSet("concurrent.key")
		}()
	}
	// concurrent writer (Reload without config file just returns error, fine for race test)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = sc.Reload() // expected to error (no file), but must not race
		}()
	}
	wg.Wait()
}

func TestGlobal_IsNotNil(t *testing.T) {
	if Global == nil {
		t.Fatal("Global SafeConfig should not be nil")
	}
}
