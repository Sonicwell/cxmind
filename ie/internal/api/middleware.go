package api

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"encoding/json"
	"log"
	"net"
	"net/http"
	"strings"
)

// MaxRequestBodySize limits POST request body to 1MB to prevent OOM from oversized payloads.
const MaxRequestBodySize = 1 << 20 // 1 MB

// LimitBody is a middleware that wraps r.Body with http.MaxBytesReader.
// R-10: Prevents unbounded memory allocation from large POST bodies.
func LimitBody(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, MaxRequestBodySize)
		next.ServeHTTP(w, r)
	}
}

// trustedSources holds additional trusted IPs loaded from config.
// 127.0.0.1 and ::1 are always implicitly trusted.
var trustedSources []string
var trustedCIDRs []*net.IPNet
var corsAllowedOrigins []string

// InitMiddleware loads trusted sources and CORS origins from config.
// Should be called once at startup.
func InitMiddleware() {
	rawSources := config.Global.GetStringSlice("http.trusted_sources")
	trustedSources = nil
	trustedCIDRs = nil
	for _, src := range rawSources {
		if strings.Contains(src, "/") {
			if _, cidr, err := net.ParseCIDR(src); err == nil {
				trustedCIDRs = append(trustedCIDRs, cidr)
			} else {
				log.Printf("[SECURITY] Invalid CIDR in trusted_sources: %s", src)
			}
		} else {
			trustedSources = append(trustedSources, src)
		}
	}
	corsAllowedOrigins = config.Global.GetStringSlice("http.cors_allowed_origins")

	log.Printf("[SECURITY] Trusted sources: %v (+ localhost always trusted)", trustedSources)
	log.Printf("[SECURITY] CORS allowed origins: %v", corsAllowedOrigins)
}

// RequireLocalAccess is a middleware that restricts access to trusted source IPs.
// /health is always exempt from this check.
func RequireLocalAccess(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// /health is always exempt (K8s/LB probes)
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		if !IsSourceTrusted(r.RemoteAddr) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "forbidden: source IP not trusted",
			})
			return
		}

		next.ServeHTTP(w, r)
	}
}

// SetCORSHeaders sets CORS headers based on the configured whitelist.
// Only the exact requesting Origin is reflected if it matches the whitelist.
func SetCORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return
	}

	for _, allowed := range corsAllowedOrigins {
		if origin == allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			return
		}
	}
	// Origin not in whitelist — no CORS headers set
}

// IsSourceTrusted checks whether a remote address is in the trusted list.
// 127.0.0.1 and ::1 are always trusted.
func IsSourceTrusted(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		// If no port, try using remoteAddr directly as host
		host = remoteAddr
	}

	// Localhost is always trusted
	if host == "127.0.0.1" || host == "::1" || host == "localhost" {
		return true
	}

	// Check configured trusted sources (exact match)
	for _, trusted := range trustedSources {
		if host == trusted {
			return true
		}
	}

	// CIDR subnet matching
	if ip := net.ParseIP(host); ip != nil {
		for _, cidr := range trustedCIDRs {
			if cidr.Contains(ip) {
				return true
			}
		}
	}

	return false
}
