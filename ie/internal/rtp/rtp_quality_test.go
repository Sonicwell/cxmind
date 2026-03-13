package rtp

import (
	"math"
	"testing"
)

func TestComputeMOS_PerfectQuality(t *testing.T) {
	// 0 loss, 0 rtt, 0 jitter -> should be max MOS
	mos, r := ComputeMOS(0.0, 0.0, 0.0, "PCMU")
	if mos < 4.35 || mos > 4.45 {
		t.Errorf("Perfect MOS G.711 = %f, want ~4.4", mos)
	}
	if r < 92 || r > 94 {
		t.Errorf("Perfect R-Factor G.711 = %f, want ~93.2", r)
	}
}

func TestComputeMOS_CodecDifferences(t *testing.T) {
	// G.711 vs G.729 under perfect conditions
	mos711, _ := ComputeMOS(0.0, 0.0, 0.0, "PCMU")
	mos729, r729 := ComputeMOS(0.0, 0.0, 0.0, "G729")

	// G.729 inherently has lower MOS due to compression (Ie=11)
	if mos729 >= mos711 {
		t.Errorf("G.729 MOS (%f) should be lower than G.711 MOS (%f)", mos729, mos711)
	}
	if mos729 < 3.9 || mos729 > 4.1 {
		t.Errorf("G.729 perfect MOS = %f, want ~4.0", mos729)
	}
	if r729 < 81 || r729 > 83 {
		t.Errorf("G.729 perfect R-Factor = %f, want ~82.2 (93.2 - 11)", r729)
	}
}

func TestComputeMOS_PacketLoss(t *testing.T) {
	// 2% packet loss on G.711
	mos, _ := ComputeMOS(0.02, 0.0, 0.0, "PCMU")

	// 2% loss is quite noticeable on G.711 (Ie jumps)
	if mos >= 4.0 {
		t.Errorf("MOS with 2%% loss = %f, want < 4.0", mos)
	}
	if mos < 2.5 {
		t.Errorf("MOS with 2%% loss = %f, want > 2.5", mos)
	}

	// Opus is more robust to packet loss (Bpl = 10)
	mosOpus, _ := ComputeMOS(0.02, 0.0, 0.0, "opus")
	if mosOpus <= mos {
		t.Errorf("Opus MOS (%f) should handle loss better than G.711 (%f)", mosOpus, mos)
	}
}

func TestComputeMOS_DelayAndJitter(t *testing.T) {
	// High delay but no loss
	// RTT = 800ms (effective delay = 400ms)
	mosHighDelay, rHighDelay := ComputeMOS(0.0, 800.0, 0.0, "PCMU")

	if rHighDelay >= 93.0 {
		t.Errorf("High delay should lower R-factor. Got: %f", rHighDelay)
	}
	if mosHighDelay >= 4.3 {
		t.Errorf("High delay should lower MOS. Got: %f", mosHighDelay)
	}

	// High jitter also counts towards effective delay (assumes jitter buffer)
	// Jitter = 100ms (effective delay = approx 200ms)
	mosHighJitter, _ := ComputeMOS(0.0, 0.0, 100.0, "PCMU")

	// They should be roughly similar in impairment
	if math.Abs(mosHighDelay-mosHighJitter) > 0.2 {
		t.Errorf("Delay (%f) and Jitter (%f) should have similar impairments", mosHighDelay, mosHighJitter)
	}
}

func TestComputeMOS_PoorQuality(t *testing.T) {
	// 10% packet loss, 500ms RTT, 100ms jitter
	mos, r := ComputeMOS(0.10, 500.0, 100.0, "PCMU")

	if mos > 2.5 {
		t.Errorf("Terrible network MOS = %f, want < 2.5", mos)
	}
	if r > 60 {
		t.Errorf("Terrible network R-Factor = %f, want < 60", r)
	}
}

func TestComputeMOS_UnknownCodec(t *testing.T) {
	// Unknown codec should fallback to G.711 equivalent
	mosG711, _ := ComputeMOS(0.05, 50.0, 10.0, "PCMA")
	mosUnknown, _ := ComputeMOS(0.05, 50.0, 10.0, "WeirdCodec")

	if mosG711 != mosUnknown {
		t.Errorf("Unknown codec MOS %f should match G.711 %f", mosUnknown, mosG711)
	}
}

// TestComputeMOS_CaseInsensitive verifies that codec name casing does not
// affect MOS calculation. Bug fix: impairment map now uses lowercase keys
// and ComputeMOS normalizes input with strings.ToLower.
func TestComputeMOS_CaseInsensitive(t *testing.T) {
	codecs := []struct{ upper, lower string }{
		{"PCMU", "pcmu"},
		{"PCMA", "pcma"},
		{"G729", "g729"},
		{"G722", "g722"},
		{"OPUS", "opus"},
	}

	for _, c := range codecs {
		t.Run(c.upper, func(t *testing.T) {
			mos1, r1 := ComputeMOS(0.02, 50.0, 10.0, c.upper)
			mos2, r2 := ComputeMOS(0.02, 50.0, 10.0, c.lower)

			if math.Abs(mos1-mos2) > 0.001 || math.Abs(r1-r2) > 0.001 {
				t.Errorf("MOS(%q)=%.2f,R=%.2f != MOS(%q)=%.2f,R=%.2f",
					c.upper, mos1, r1, c.lower, mos2, r2)
			}
		})
	}
}
