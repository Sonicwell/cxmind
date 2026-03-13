package hep

import (
	"testing"

	"github.com/spf13/viper"
)

// === HP-4: handlePacket should NOT call config.Global.GetString per packet ===

// TestCachedAuthToken_MatchesViper verifies that the cached auth token
// stays in sync with viper configuration after initialization.
func TestCachedAuthToken_MatchesViper(t *testing.T) {
	// Set a token value
	viper.Set("hep.auth_token", "test-secret-token-123")
	defer viper.Reset()

	// Initialize cache (simulating what StartHEPServer should do)
	initCachedConfig()

	// Verify cached value matches
	if tokenPtr := cachedAuthToken.Load(); tokenPtr == nil || *tokenPtr != "test-secret-token-123" {
		actual := "<nil>"
		if tokenPtr != nil {
			actual = *tokenPtr
		}
		t.Fatalf("HP-4 FAIL: cachedAuthToken=%q, want %q", actual, "test-secret-token-123")
	}
}

// TestCachedAuthToken_Empty verifies empty auth token works (auth disabled).
func TestCachedAuthToken_Empty(t *testing.T) {
	viper.Set("hep.auth_token", "")
	defer viper.Reset()

	initCachedConfig()

	if tokenPtr := cachedAuthToken.Load(); tokenPtr == nil || *tokenPtr != "" {
		actual := "<nil>"
		if tokenPtr != nil {
			actual = *tokenPtr
		}
		t.Fatalf("HP-4 FAIL: cachedAuthToken should be empty when auth is disabled, got %q", actual)
	}
}

// === SEC-1: Auth token must be checked BEFORE RTP/RTCP processing ===

// TestAuthToken_CheckedBeforeRTP verifies that when auth is enabled,
// an RTP packet with an invalid token is rejected (not processed).
// This is a structural test: we verify that shouldRejectPacket returns
// true for invalid-token RTP packets.
func TestAuthToken_CheckedBeforeRTP(t *testing.T) {
	// Enable auth
	func() { s := "valid-secret"; cachedAuthToken.Store(&s) }()
	defer func() { func() { s := ""; cachedAuthToken.Store(&s) }() }()

	// An RTP packet with wrong token should be rejected
	packet := &HEPPacket{
		ProtocolType:  PROTO_RTP,
		AuthToken:     "wrong-token",
		CorrelationID: "call-123",
		Payload:       []byte{0x80, 0x00}, // minimal RTP
	}

	if !shouldRejectAuth(packet) {
		t.Fatal("SEC-1 FAIL: RTP packet with invalid auth token was NOT rejected")
	}
}

// TestAuthToken_CheckedBeforeRTCP verifies the same for RTCP packets.
func TestAuthToken_CheckedBeforeRTCP(t *testing.T) {
	func() { s := "valid-secret"; cachedAuthToken.Store(&s) }()
	defer func() { func() { s := ""; cachedAuthToken.Store(&s) }() }()

	packet := &HEPPacket{
		ProtocolType:  PROTO_RTCP,
		AuthToken:     "bad-token",
		CorrelationID: "call-456",
		Payload:       []byte{0x80, 0xC8}, // minimal RTCP SR
	}

	if !shouldRejectAuth(packet) {
		t.Fatal("SEC-1 FAIL: RTCP packet with invalid auth token was NOT rejected")
	}
}

// TestAuthToken_ValidTokenAllowed verifies valid tokens pass.
func TestAuthToken_ValidTokenAllowed(t *testing.T) {
	func() { s := "valid-secret"; cachedAuthToken.Store(&s) }()
	defer func() { func() { s := ""; cachedAuthToken.Store(&s) }() }()

	packet := &HEPPacket{
		ProtocolType: PROTO_RTP,
		AuthToken:    "valid-secret",
	}

	if shouldRejectAuth(packet) {
		t.Fatal("SEC-1 FAIL: Valid auth token was rejected")
	}
}

// TestAuthToken_DisabledAllowsAll verifies that empty token config allows all.
func TestAuthToken_DisabledAllowsAll(t *testing.T) {
	func() { s := ""; cachedAuthToken.Store(&s) }()

	packet := &HEPPacket{
		ProtocolType: PROTO_RTP,
		AuthToken:    "",
	}

	if shouldRejectAuth(packet) {
		t.Fatal("SEC-1 FAIL: Packet rejected when auth is disabled")
	}
}
