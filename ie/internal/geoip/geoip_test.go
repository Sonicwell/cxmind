package geoip

import (
	"fmt"
	"sync"
	"testing"

	"github.com/spf13/viper"
)

// TestInitialize_ReturnsError verifies that Initialize returns the actual error
// when the GeoIP database file cannot be opened (fix #18).
func TestInitialize_ReturnsError(t *testing.T) {
	// Reset once so we can call Initialize again
	once = sync.Once{}
	db = nil

	viper.Set("geoip.path", "/nonexistent/path/to/GeoLite2-City.mmdb")
	defer viper.Reset()

	err := Initialize()
	if err == nil {
		t.Error("expected Initialize to return an error for nonexistent DB path, got nil")
	}
}

func TestLookupDistribution(t *testing.T) {
	// Ensure DB is not loaded (it shouldn't be in test unless Initialize is called)
	if db != nil {
		t.Skip("GeoIP DB is loaded, skipping mock distribution test")
	}

	counts := make(map[string]int)
	total := 100

	// Generate 100 random IPs (simulated by incrementing last octet)
	for i := 0; i < total; i++ {
		ip := fmt.Sprintf("192.168.1.%d", i)
		loc, err := Lookup(ip)
		if err != nil {
			t.Fatalf("Lookup failed: %v", err)
		}
		counts[loc.Country]++
	}

	t.Logf("Country distribution for %d IPs: %v", total, counts)

	// Verify we have at least 3 distinct countries
	if len(counts) < 3 {
		t.Errorf("Expected at least 3 distinct countries, got %d: %v", len(counts), counts)
	}

	// Verify "GB" is not overwhelming (e.g., > 50%)
	if counts["GB"] > total/2 {
		t.Errorf("GB count %d is too high (>50%%)", counts["GB"])
	}
}
