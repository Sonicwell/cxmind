package rtp

import (
	"testing"
	"time"
)

// Mock Redis/ClickHouse if needed, but for now we just test the logic flow
// We might need to mock GlobalSniffer or just instance a sniffer.

func TestCalculateMOS(t *testing.T) {
	tests := []struct {
		lossRate float32
		rttMs    float32
		jitter   float32
		wantMin  float32
		wantMax  float32
	}{
		{0.0, 20.0, 5.0, 4.3, 4.5},   // Excellent
		{0.05, 50.0, 10.0, 3.5, 4.0}, // Good
		{0.1, 100.0, 20.0, 2.5, 3.5}, // Fair/Poor
		{0.3, 200.0, 50.0, 1.0, 2.0}, // Bad
	}

	for _, tt := range tests {
		mos := calculateMOS(tt.lossRate, tt.rttMs, tt.jitter)
		if mos < tt.wantMin || mos > tt.wantMax {
			t.Errorf("calculateMOS(%v, %v, %v) = %v, want [%v, %v]",
				tt.lossRate, tt.rttMs, tt.jitter, mos, tt.wantMin, tt.wantMax)
		}
	}
}

func TestDetermineDirection(t *testing.T) {
	tests := []struct {
		name     string
		srcIP    string
		callerIP string
		calleeIP string
		wantDir  string
	}{
		{
			name:     "RTCP from caller side",
			srcIP:    "10.0.1.100",
			callerIP: "10.0.1.100",
			calleeIP: "10.0.2.200",
			wantDir:  "caller",
		},
		{
			name:     "RTCP from callee side",
			srcIP:    "10.0.2.200",
			callerIP: "10.0.1.100",
			calleeIP: "10.0.2.200",
			wantDir:  "callee",
		},
		{
			name:     "Unknown direction - IPs not matching",
			srcIP:    "192.168.1.50",
			callerIP: "10.0.1.100",
			calleeIP: "10.0.2.200",
			wantDir:  "unknown",
		},
		{
			name:     "Unknown direction - empty callerIP",
			srcIP:    "10.0.1.100",
			callerIP: "",
			calleeIP: "10.0.2.200",
			wantDir:  "unknown",
		},
		{
			name:     "Unknown direction - both empty",
			srcIP:    "10.0.1.100",
			callerIP: "",
			calleeIP: "",
			wantDir:  "unknown",
		},
		{
			name:     "Caller and callee same IP (loopback test)",
			srcIP:    "127.0.0.1",
			callerIP: "127.0.0.1",
			calleeIP: "127.0.0.1",
			wantDir:  "caller", // Caller takes precedence
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DetermineDirection(tt.srcIP, tt.callerIP, tt.calleeIP)
			if got != tt.wantDir {
				t.Errorf("DetermineDirection(%q, %q, %q) = %q, want %q",
					tt.srcIP, tt.callerIP, tt.calleeIP, got, tt.wantDir)
			}
		})
	}
}

func TestMakeStreamID(t *testing.T) {
	tests := []struct {
		callID string
		srcIP  string
		want   string
	}{
		{"abc-123", "10.0.1.100", "abc-123:10.0.1.100"},
		{"call-1", "", "call-1:"},
	}

	for _, tt := range tests {
		got := MakeStreamID(tt.callID, tt.srcIP)
		if got != tt.want {
			t.Errorf("MakeStreamID(%q, %q) = %q, want %q",
				tt.callID, tt.srcIP, got, tt.want)
		}
	}
}

func TestEstimateRTT(t *testing.T) {
	tests := []struct {
		name       string
		lsr        uint32
		dlsr       uint32
		lastSRNTP  uint32
		lastSRTime time.Time
		wantMin    float32
		wantMax    float32
	}{
		{
			name:       "SR/RR correlation - 100ms RTT",
			lsr:        0xAABBCCDD,
			dlsr:       65536 * 1, // 1 second DLSR
			lastSRNTP:  0xAABBCCDD,
			lastSRTime: time.Now().Add(-1100 * time.Millisecond), // SR 1.1s ago → RTT ≈ 100ms
			wantMin:    50,
			wantMax:    200,
		},
		{
			name:       "DLSR fallback - no matching SR",
			lsr:        0x11223344,
			dlsr:       65536 / 2,  // 0.5 second DLSR
			lastSRNTP:  0x55667788, // Different NTP → no correlation
			lastSRTime: time.Now().Add(-2 * time.Second),
			wantMin:    450,
			wantMax:    550, // ~500ms DLSR
		},
		{
			name:       "Zero LSR - no RTT",
			lsr:        0,
			dlsr:       65536,
			lastSRNTP:  0xAABB,
			lastSRTime: time.Now(),
			wantMin:    0,
			wantMax:    0,
		},
		{
			name:       "Clock skew protection - negative RTT clamped to 0",
			lsr:        0xAABBCCDD,
			dlsr:       65536 * 5, // 5 second DLSR but SR was observed only 1s ago
			lastSRNTP:  0xAABBCCDD,
			lastSRTime: time.Now().Add(-1 * time.Second),
			wantMin:    0,
			wantMax:    0,
		},
		{
			name:       "Zero LSR and zero DLSR",
			lsr:        0,
			dlsr:       0,
			lastSRNTP:  0,
			lastSRTime: time.Time{},
			wantMin:    0,
			wantMax:    0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := EstimateRTT(tt.lsr, tt.dlsr, tt.lastSRNTP, tt.lastSRTime)
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("EstimateRTT() = %v, want [%v, %v]", got, tt.wantMin, tt.wantMax)
			}
		})
	}
}
