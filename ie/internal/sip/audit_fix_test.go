package sip

import (
	"testing"
)

// === CS-S1: parseStatusCode should reject non-digit characters ===

func TestParseStatusCode_NonDigitChars(t *testing.T) {
	tests := []struct {
		input string
		want  int
	}{
		{"200", 200},
		{"404", 404},
		{"603", 603},
		{"2x0", 0},   // CS-S1: non-digit should return 0, not 20
		{"abc", 0},   // All non-digits
		{"1a2b3", 0}, // Mixed — should fail, not return 123
		{"", 0},      // Empty
		{"100", 100}, // Valid
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := parseStatusCode(tt.input)
			if got != tt.want {
				t.Errorf("parseStatusCode(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}
