package config

import "log"

// BuildMode is injected at compile time via -ldflags:
//
//	-X github.com/cxmind/ingestion-go/internal/config.BuildMode=production
//
// Empty string (go run / dev build) = dev mode, full debug output.
var BuildMode string

// IsDebug reports whether IE is running in development mode (non-production).
func IsDebug() bool {
	return BuildMode != "production"
}

// Debugf prints a log line only in dev mode. No-op in production builds.
func Debugf(format string, args ...interface{}) {
	if BuildMode != "production" {
		log.Printf(format, args...)
	}
}
