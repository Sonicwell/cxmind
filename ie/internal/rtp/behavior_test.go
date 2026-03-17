package rtp

import (
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// ===== RED Phase: BehaviorCollector Tests =====

// TestRMSBehavior_OnFrame verifies per-frame accumulation precision.
func TestRMSBehavior_OnFrame(t *testing.T) {
	bc := NewRMSBehavior("test-call-1")

	now := timeutil.Now()

	// 10 frames of agent speech (channel 0) with energy 500.0
	for i := 0; i < 10; i++ {
		bc.OnFrame(0, true, 500.0, now)
		now = now.Add(20 * time.Millisecond) // 20ms per frame
	}

	// 5 frames of agent silence
	for i := 0; i < 5; i++ {
		bc.OnFrame(0, false, 50.0, now)
		now = now.Add(20 * time.Millisecond)
	}

	// 8 frames of customer speech (channel 1) with energy 300.0
	for i := 0; i < 8; i++ {
		bc.OnFrame(1, true, 300.0, now)
		now = now.Add(20 * time.Millisecond)
	}

	snap := bc.Snapshot()

	// Agent: 10 speech × 20ms = 200ms, 5 silence × 20ms = 100ms
	if snap.AgentTalkMs != 200 {
		t.Errorf("AgentTalkMs = %d, want 200", snap.AgentTalkMs)
	}
	if snap.AgentSilMs != 100 {
		t.Errorf("AgentSilMs = %d, want 100", snap.AgentSilMs)
	}

	// Customer: 8 speech × 20ms = 160ms
	if snap.CustTalkMs != 160 {
		t.Errorf("CustTalkMs = %d, want 160", snap.CustTalkMs)
	}

	// Agent avg energy = 500*10 + 50*5 / 15 = 5250/15 = 350
	expectedAgentEnergy := (500.0*10 + 50.0*5) / 15
	if abs(snap.AgentEnergy-expectedAgentEnergy) > 0.1 {
		t.Errorf("AgentEnergy = %.2f, want %.2f", snap.AgentEnergy, expectedAgentEnergy)
	}

	// TalkRatio = agent_talk / (agent_talk + cust_talk) = 200 / (200+160) = 0.5555
	expectedRatio := 200.0 / (200.0 + 160.0)
	if abs(snap.TalkRatio-expectedRatio) > 0.01 {
		t.Errorf("TalkRatio = %.4f, want %.4f", snap.TalkRatio, expectedRatio)
	}

	if snap.CallID != "test-call-1" {
		t.Errorf("CallID = %s, want test-call-1", snap.CallID)
	}
}

// TestRMSBehavior_Snapshot_Reset verifies snapshot resets accumulators.
func TestRMSBehavior_Snapshot_Reset(t *testing.T) {
	bc := NewRMSBehavior("test-call-2")

	now := timeutil.Now()
	for i := 0; i < 5; i++ {
		bc.OnFrame(0, true, 400.0, now)
		now = now.Add(20 * time.Millisecond)
	}

	snap1 := bc.Snapshot()
	if snap1.AgentTalkMs != 100 {
		t.Errorf("First snapshot AgentTalkMs = %d, want 100", snap1.AgentTalkMs)
	}

	// After snapshot, accumulators should be reset
	snap2 := bc.Snapshot()
	if snap2.AgentTalkMs != 0 {
		t.Errorf("After reset AgentTalkMs = %d, want 0", snap2.AgentTalkMs)
	}
	if snap2.CustTalkMs != 0 {
		t.Errorf("After reset CustTalkMs = %d, want 0", snap2.CustTalkMs)
	}
	if snap2.TalkRatio != 0 {
		t.Errorf("After reset TalkRatio = %.4f, want 0", snap2.TalkRatio)
	}
}

// TestRMSBehavior_ZeroFrames verifies no panic on empty snapshot.
func TestRMSBehavior_ZeroFrames(t *testing.T) {
	bc := NewRMSBehavior("test-call-3")
	snap := bc.Snapshot()

	if snap.AgentTalkMs != 0 || snap.CustTalkMs != 0 {
		t.Error("Zero frames should produce zero talk")
	}
	if snap.TalkRatio != 0 {
		t.Error("Zero frames should produce zero ratio")
	}
	if snap.AgentEnergy != 0 || snap.CustEnergy != 0 {
		t.Error("Zero frames should produce zero energy")
	}
}

// TestRMSBehavior_ConcurrentSafety verifies OnFrame + Snapshot thread-safety.
func TestRMSBehavior_ConcurrentSafety(t *testing.T) {
	bc := NewRMSBehavior("test-call-concurrent")

	done := make(chan struct{})
	go func() {
		now := timeutil.Now()
		for i := 0; i < 10000; i++ {
			bc.OnFrame(i%2, true, float64(i%1000), now)
			now = now.Add(20 * time.Millisecond)
		}
		close(done)
	}()

	// Concurrent snapshots should not panic or data-race
	for i := 0; i < 100; i++ {
		snap := bc.Snapshot()
		_ = snap.TalkRatio // Access to ensure no race
	}

	<-done
}

// TestStressScore_RTPOnly verifies stress score with RTP-only data (no WPM/sentiment).
func TestStressScore_RTPOnly(t *testing.T) {
	// Balanced conversation, normal energy → low stress
	score := CalcStressScore(0.50, 300.0, 280.0, nil, nil)
	if score > 0.3 {
		t.Errorf("Balanced call should have low stress, got %.2f", score)
	}

	// Agent dominates conversation → higher stress
	score = CalcStressScore(0.85, 600.0, 100.0, nil, nil)
	if score < 0.4 {
		t.Errorf("Agent-dominated call should have higher stress, got %.2f", score)
	}

	// Energy spike alone (balanced talk) → moderate stress from energy component
	score = CalcStressScore(0.50, 1200.0, 200.0, nil, nil)
	if score < 0.2 {
		t.Errorf("Energy spike should increase stress above 0.2, got %.2f", score)
	}

	// Both high talk deviation AND energy spike → highest stress in RTP-only mode
	score = CalcStressScore(0.90, 1200.0, 200.0, nil, nil)
	if score < 0.6 {
		t.Errorf("Talk deviation + energy spike should be high stress, got %.2f", score)
	}
}

// TestStressScore_FullMode verifies stress score with ASR data available.
func TestStressScore_FullMode(t *testing.T) {
	wpm := float64(180)
	sentiment := float64(0.2) // Negative sentiment

	score := CalcStressScore(0.80, 500.0, 200.0, &wpm, &sentiment)
	if score < 0.5 {
		t.Errorf("High talk ratio + fast WPM + negative sentiment should be high stress, got %.2f", score)
	}

	// Calm call: balanced talk, normal WPM, positive sentiment
	wpm2 := float64(130)
	sentiment2 := float64(0.8)
	score2 := CalcStressScore(0.50, 300.0, 280.0, &wpm2, &sentiment2)
	if score2 > 0.3 {
		t.Errorf("Calm call should have low stress, got %.2f", score2)
	}
}

// TestStressScore_Tier2_SEROnly verifies stress score with SER sentiment but no WPM.
func TestStressScore_Tier2_SEROnly(t *testing.T) {
	// Angry customer call: agent dominated, negative sentiment from SER
	angry := float64(0.10) // angry → 0.10 sentiment
	score := CalcStressScore(0.80, 500.0, 200.0, nil, &angry)
	if score < 0.5 {
		t.Errorf("Angry sentiment + high talk ratio should be high stress, got %.2f", score)
	}

	// Happy customer call: balanced talk, positive sentiment from SER
	happy := float64(0.85) // happy → 0.85 sentiment
	score2 := CalcStressScore(0.50, 300.0, 280.0, nil, &happy)
	if score2 > 0.2 {
		t.Errorf("Happy sentiment + balanced call should be low stress, got %.2f", score2)
	}

	// Tier 2 should produce higher stress than Tier 1 for negative emotion
	scoreNoSER := CalcStressScore(0.80, 500.0, 200.0, nil, nil)
	if score <= scoreNoSER {
		t.Errorf("Angry SER (%.2f) should produce higher stress than no SER (%.2f)", score, scoreNoSER)
	}
}

// TestSetLastEmotion_AffectsStress verifies that feeding SER emotion changes stress score.
func TestSetLastEmotion_AffectsStress(t *testing.T) {
	// Snapshot without emotion
	b1 := NewRMSBehavior("call-emotion-1")
	for i := 0; i < 100; i++ {
		b1.OnFrame(0, true, 600.0, timeutil.Now())
		b1.OnFrame(1, false, 100.0, timeutil.Now())
	}
	snapNoEmotion := b1.Snapshot()

	// Snapshot with angry emotion
	b2 := NewRMSBehavior("call-emotion-2")
	b2.SetLastEmotion("angry")
	for i := 0; i < 100; i++ {
		b2.OnFrame(0, true, 600.0, timeutil.Now())
		b2.OnFrame(1, false, 100.0, timeutil.Now())
	}
	snapAngry := b2.Snapshot()

	if snapAngry.StressScore <= snapNoEmotion.StressScore {
		t.Errorf("Angry emotion stress (%.3f) should be > no-emotion stress (%.3f)",
			snapAngry.StressScore, snapNoEmotion.StressScore)
	}

	// Snapshot with happy emotion should be lower than no-emotion
	b3 := NewRMSBehavior("call-emotion-3")
	b3.SetLastEmotion("happy")
	for i := 0; i < 100; i++ {
		b3.OnFrame(0, true, 600.0, timeutil.Now())
		b3.OnFrame(1, false, 100.0, timeutil.Now())
	}
	snapHappy := b3.Snapshot()

	if snapHappy.StressScore >= snapNoEmotion.StressScore {
		t.Errorf("Happy emotion stress (%.3f) should be < no-emotion stress (%.3f)",
			snapHappy.StressScore, snapNoEmotion.StressScore)
	}
}

// TestVAD_Process_ReturnsEnergy verifies the updated VAD signature.
func TestVAD_Process_ReturnsEnergy(t *testing.T) {
	vad := NewVAD()

	// Create a PCM frame with known amplitude
	pcm := make([]byte, 320) // 160 samples × 2 bytes
	// Fill with amplitude ~1000 (little-endian int16)
	for i := 0; i < len(pcm); i += 2 {
		pcm[i] = 0xE8   // low byte of 1000
		pcm[i+1] = 0x03 // high byte of 1000
	}

	isSpeech, energy := vad.Process(pcm, 8000, timeutil.Now())

	if energy < 900 || energy > 1100 {
		t.Errorf("Energy should be ~1000, got %.2f", energy)
	}
	if !isSpeech {
		t.Error("Amplitude 1000 should be detected as speech")
	}

	// Test silence frame
	silentPCM := make([]byte, 320)
	isSpeech2, energy2 := vad.Process(silentPCM, 8000, timeutil.Now().Add(time.Second))

	if energy2 > 10 {
		t.Errorf("Silent frame energy should be ~0, got %.2f", energy2)
	}
	_ = isSpeech2 // may or may not be true due to hangover
}

// ===== C2-P2: StressScore auto-computation =====

func TestSnapshot_StressScore_Computed(t *testing.T) {
	b := NewRMSBehavior("call-stress-1")
	for i := 0; i < 100; i++ {
		b.OnFrame(0, true, 800.0, timeutil.Now())  // agent: high energy speech
		b.OnFrame(1, false, 100.0, timeutil.Now()) // customer: silence
	}
	snap := b.Snapshot()
	if snap.StressScore <= 0 {
		t.Errorf("Expected StressScore > 0 for unbalanced conversation, got %f", snap.StressScore)
	}
	if snap.StressScore > 1.0 {
		t.Errorf("StressScore should be clamped to [0,1], got %f", snap.StressScore)
	}
}

func TestSnapshot_StressScore_LowForBalanced(t *testing.T) {
	b := NewRMSBehavior("call-stress-2")
	for i := 0; i < 100; i++ {
		b.OnFrame(0, true, 350.0, timeutil.Now())
		b.OnFrame(1, true, 350.0, timeutil.Now())
	}
	snap := b.Snapshot()
	if snap.StressScore > 0.3 {
		t.Errorf("Expected low StressScore for balanced conversation, got %f", snap.StressScore)
	}
}

func TestSnapshot_AgentID_EmptyByDefault(t *testing.T) {
	b := NewRMSBehavior("call-agent-id")
	b.OnFrame(0, true, 400.0, timeutil.Now())
	snap := b.Snapshot()
	if snap.AgentID != "" {
		t.Errorf("AgentID should be empty by default, got %q", snap.AgentID)
	}
	// Publisher sets it externally
	snap.AgentID = "agent-xyz"
	if snap.AgentID != "agent-xyz" {
		t.Errorf("AgentID should be settable, got %q", snap.AgentID)
	}
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
