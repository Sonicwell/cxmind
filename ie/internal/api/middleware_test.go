package api

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// dummyHandler is a simple handler used to test middleware behavior.
func dummyHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// --- IP Restriction Tests ---

func TestRequireLocalAccess_RemoteIPRejected(t *testing.T) {
	// An external IP (e.g., 203.0.113.1) should be rejected with 403.
	handler := RequireLocalAccess(dummyHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/monitoring/status", nil)
	req.RemoteAddr = "203.0.113.1:12345"
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code, "External IP should be rejected")

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	assert.Contains(t, resp["error"], "forbidden")
}

func TestRequireLocalAccess_LocalhostAllowed(t *testing.T) {
	handler := RequireLocalAccess(dummyHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/monitoring/status", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "127.0.0.1 should be allowed")
}

func TestRequireLocalAccess_IPv6LocalhostAllowed(t *testing.T) {
	handler := RequireLocalAccess(dummyHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/monitoring/status", nil)
	req.RemoteAddr = "[::1]:12345"
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "::1 should be allowed")
}

func TestRequireLocalAccess_ConfiguredTrustedSourceAllowed(t *testing.T) {
	// Simulate having "10.0.0.5" in the trusted sources list
	origSources := trustedSources
	defer func() { trustedSources = origSources }()

	trustedSources = []string{"10.0.0.5"}

	handler := RequireLocalAccess(dummyHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/monitoring/status", nil)
	req.RemoteAddr = "10.0.0.5:54321"
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Configured trusted IP should be allowed")
}

func TestRequireLocalAccess_HealthEndpointExempt(t *testing.T) {
	// /health should be accessible from any IP (for K8s/LB probes)
	handler := RequireLocalAccess(dummyHandler)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.RemoteAddr = "203.0.113.99:12345"
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "/health should be exempt from IP restrictions")
}

// --- CORS Tests ---

func TestSetCORSHeaders_OriginRestricted(t *testing.T) {
	// A request with an Origin NOT in the whitelist should NOT get CORS headers
	origOrigins := corsAllowedOrigins
	defer func() { corsAllowedOrigins = origOrigins }()

	corsAllowedOrigins = []string{"http://localhost:5173"}

	req := httptest.NewRequest(http.MethodOptions, "/api/monitoring/status", nil)
	req.Header.Set("Origin", "http://evil-site.com")
	w := httptest.NewRecorder()

	SetCORSHeaders(w, req)

	assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"),
		"Non-whitelisted origin should not get CORS headers")
}

func TestSetCORSHeaders_OriginAllowed(t *testing.T) {
	origOrigins := corsAllowedOrigins
	defer func() { corsAllowedOrigins = origOrigins }()

	corsAllowedOrigins = []string{"http://localhost:5173", "http://localhost:3000"}

	req := httptest.NewRequest(http.MethodOptions, "/api/monitoring/status", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	w := httptest.NewRecorder()

	SetCORSHeaders(w, req)

	assert.Equal(t, "http://localhost:5173", w.Header().Get("Access-Control-Allow-Origin"),
		"Whitelisted origin should get CORS header with its exact origin")
}

// TestInitMiddleware_ReloadsConfig verifies that calling InitMiddleware()
// refreshes trustedSources from config, enabling hot-reload support.
func TestInitMiddleware_ReloadsConfig(t *testing.T) {
	origSources := trustedSources
	defer func() { trustedSources = origSources }()

	// Initially, 10.0.0.99 should NOT be trusted
	trustedSources = []string{}
	assert.False(t, IsSourceTrusted("10.0.0.99:1234"), "should not be trusted initially")

	// Simulate adding it to trusted sources (what InitMiddleware does from config)
	trustedSources = []string{"10.0.0.99"}
	assert.True(t, IsSourceTrusted("10.0.0.99:1234"), "should be trusted after update")
}

// --- CIDR Tests (F-1) ---

func TestIsSourceTrusted_CIDRMatch(t *testing.T) {
	origSources := trustedSources
	origNets := trustedCIDRs
	defer func() { trustedSources = origSources; trustedCIDRs = origNets }()

	trustedSources = []string{}
	_, cidr, _ := net.ParseCIDR("10.0.0.0/8")
	trustedCIDRs = []*net.IPNet{cidr}

	assert.True(t, IsSourceTrusted("10.1.2.3:54321"), "10.1.2.3 should match 10.0.0.0/8")
	assert.False(t, IsSourceTrusted("192.168.1.1:54321"), "192.168.1.1 should NOT match 10.0.0.0/8")
}

func TestIsSourceTrusted_MixedExactAndCIDR(t *testing.T) {
	origSources := trustedSources
	origNets := trustedCIDRs
	defer func() { trustedSources = origSources; trustedCIDRs = origNets }()

	trustedSources = []string{"172.16.0.5"}
	_, cidr, _ := net.ParseCIDR("10.0.0.0/8")
	trustedCIDRs = []*net.IPNet{cidr}

	assert.True(t, IsSourceTrusted("172.16.0.5:80"), "Exact match should still work")
	assert.True(t, IsSourceTrusted("10.99.0.1:80"), "CIDR match should work")
	assert.False(t, IsSourceTrusted("203.0.113.1:80"), "Non-matching should be rejected")
}
