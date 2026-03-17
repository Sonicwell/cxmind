package rtp

import (
	"math"
	"sync"
	"time"
)

// FrameDuration is the standard RTP frame duration for G.711 (20ms per frame / 160 samples at 8kHz).
const FrameDurationMs = 20

// BehaviorCollector accumulates per-frame speech/silence/energy metrics
// for real-time behavioral analysis (C2-P1).
//
// Design: zero-allocation per-frame. OnFrame() only increments int64/float64 counters.
// Snapshot() produces a report and resets accumulators.
//
// Compatible with both RMS-based VAD (current) and future Silero VAD upgrades
// via the interface contract.
type BehaviorCollector interface {
	// OnFrame is called per-frame from processAudioPayload hot path.
	// channel: 0=agent, 1=customer. isSpeech from VAD. energy is RMS.
	OnFrame(channel int, isSpeech bool, energy float64, now time.Time)

	// SetLastEmotion feeds the latest SER emotion label (e.g. "angry", "happy")
	// into the collector. Called asynchronously when SER results arrive.
	// The emotion is mapped to a sentiment value (0.0=very negative, 1.0=very positive)
	// and used in the next Snapshot() stress score calculation.
	SetLastEmotion(emotion string)

	// Snapshot produces a point-in-time behavioral snapshot and resets accumulators.
	Snapshot() *BehaviorSnapshot

	// Reset clears all accumulators without producing a snapshot.
	Reset()
}

// BehaviorSnapshot is the JSON-serializable output of BehaviorCollector.Snapshot().
// Published to Redis `call:behavior:{callId}` every 5 seconds.
type BehaviorSnapshot struct {
	CallID      string  `json:"call_id"`
	AgentID     string  `json:"agent_id,omitempty"` // Set by BehaviorPublisher from RTPStream.agentID
	AgentTalkMs int64   `json:"agent_talk_ms"`
	AgentSilMs  int64   `json:"agent_sil_ms"`
	CustTalkMs  int64   `json:"cust_talk_ms"`
	CustSilMs   int64   `json:"cust_sil_ms"`
	AgentEnergy float64 `json:"agent_energy"` // Average RMS
	CustEnergy  float64 `json:"cust_energy"`  // Average RMS
	TalkRatio   float64 `json:"talk_ratio"`   // agent_talk / (agent_talk + cust_talk)
	StressScore float64 `json:"stress_score"` // 0.0–1.0, computed via CalcStressScore
	Timestamp   int64   `json:"ts"`
}

// channelAccum holds per-channel accumulators. No lock needed — protected by parent mu.
type channelAccum struct {
	speechFrames int64
	silFrames    int64
	totalFrames  int64
	sumEnergy    float64
}

// RMSBehavior implements BehaviorCollector using RMS energy from VAD.
type RMSBehavior struct {
	callID      string
	channels    [2]channelAccum // 0=agent, 1=customer
	lastEmotion string          // Latest SER emotion label (e.g. "angry")
	mu          sync.Mutex
}

// emotionToSentiment maps SER 7-class emotion labels to a 0.0–1.0 sentiment value.
// 0.0 = very negative (high stress), 1.0 = very positive (low stress).
var emotionToSentiment = map[string]float64{
	"angry":    0.10,
	"disgust":  0.15,
	"sad":      0.25,
	"fearful":  0.20,
	"neutral":  0.55,
	"surprise": 0.65,
	"happy":    0.85,
}

// NewRMSBehavior creates a new BehaviorCollector for the given call.
func NewRMSBehavior(callID string) BehaviorCollector {
	return &RMSBehavior{callID: callID}
}

// OnFrame accumulates one frame of data. Called from processAudioPayload hot path.
// Zero allocation — only int64/float64 counter increments.
func (b *RMSBehavior) OnFrame(channel int, isSpeech bool, energy float64, now time.Time) {
	if channel < 0 || channel > 1 {
		return
	}
	b.mu.Lock()
	ch := &b.channels[channel]
	ch.totalFrames++
	ch.sumEnergy += energy
	if isSpeech {
		ch.speechFrames++
	} else {
		ch.silFrames++
	}
	b.mu.Unlock()
}

// Snapshot produces a BehaviorSnapshot and resets all accumulators.
func (b *RMSBehavior) Snapshot() *BehaviorSnapshot {
	b.mu.Lock()
	agent := b.channels[0]
	cust := b.channels[1]
	// Reset
	b.channels[0] = channelAccum{}
	b.channels[1] = channelAccum{}
	b.mu.Unlock()

	snap := &BehaviorSnapshot{
		CallID:      b.callID,
		AgentTalkMs: agent.speechFrames * FrameDurationMs,
		AgentSilMs:  agent.silFrames * FrameDurationMs,
		CustTalkMs:  cust.speechFrames * FrameDurationMs,
		CustSilMs:   cust.silFrames * FrameDurationMs,
		Timestamp:   time.Now().UnixMilli(),
	}

	// Calculate average energy
	if agent.totalFrames > 0 {
		snap.AgentEnergy = agent.sumEnergy / float64(agent.totalFrames)
	}
	if cust.totalFrames > 0 {
		snap.CustEnergy = cust.sumEnergy / float64(cust.totalFrames)
	}

	// TalkRatio: agent_talk / (agent_talk + cust_talk)
	totalTalk := snap.AgentTalkMs + snap.CustTalkMs
	if totalTalk > 0 {
		snap.TalkRatio = float64(snap.AgentTalkMs) / float64(totalTalk)
	}

	// Build sentiment from last SER emotion (if available)
	var sentiment *float64
	if b.lastEmotion != "" {
		if v, ok := emotionToSentiment[b.lastEmotion]; ok {
			sentiment = &v
		}
	}

	// Stress score with optional SER sentiment
	// WPM remains nil until ASR word-count integration is added
	snap.StressScore = CalcStressScore(snap.TalkRatio, snap.AgentEnergy, snap.CustEnergy, nil, sentiment)

	return snap
}

// SetLastEmotion stores the latest SER emotion label for stress score enrichment.
// Thread-safe. Called asynchronously when SER results arrive via Redis.
func (b *RMSBehavior) SetLastEmotion(emotion string) {
	b.mu.Lock()
	b.lastEmotion = emotion
	b.mu.Unlock()
}

// Reset clears all accumulators without producing a snapshot.
func (b *RMSBehavior) Reset() {
	b.mu.Lock()
	b.channels[0] = channelAccum{}
	b.channels[1] = channelAccum{}
	b.mu.Unlock()
}

// ---- Stress Score Calculation ----
//
// Two-tier formula:
//   - RTP-only (no ASR): 60% talk_ratio_deviation + 40% energy_deviation
//   - Full (with ASR):   30% talk_ratio_dev + 20% energy_dev + 20% wpm_dev + 30% sentiment
//
// wpm and sentiment are optional (*float64); nil = ASR unavailable.

const (
	// Baselines for normalization
	baselineEnergy = 400.0  // Typical RMS energy for normal speech
	baselineWPM    = 140.0  // Typical words per minute
	maxEnergy      = 1500.0 // Energy cap for normalization
	maxWPM         = 250.0  // WPM cap for normalization
)

// CalcStressScore computes a 0.0–1.0 stress score.
// wpm and sentiment are nil when unavailable.
// sentiment: 0.0 = very negative, 1.0 = very positive.
//
// Three-tier formula:
//   - RTP-only (no SER, no ASR):  60% talk_dev + 40% energy_dev
//   - RTP+SER  (sentiment only):  40% talk_dev + 25% energy_dev + 35% sentiment
//   - Full     (SER + ASR):       30% talk_dev + 20% energy_dev + 20% wpm_dev + 30% sentiment
func CalcStressScore(talkRatio, agentEnergy, custEnergy float64, wpm, sentiment *float64) float64 {
	// Talk ratio deviation: how far from balanced (0.5)
	talkDev := math.Abs(talkRatio-0.5) / 0.5 // 0..1

	// Energy deviation: max energy vs baseline
	maxE := math.Max(agentEnergy, custEnergy)
	energyDev := clamp01((maxE - baselineEnergy) / (maxEnergy - baselineEnergy))

	// Tier 1: RTP-only
	if sentiment == nil {
		return clamp01(0.60*talkDev + 0.40*energyDev)
	}

	sentimentStress := clamp01(1.0 - *sentiment) // Invert: positive = low stress

	// Tier 2: RTP + SER (sentiment available, no WPM)
	if wpm == nil {
		return clamp01(0.40*talkDev + 0.25*energyDev + 0.35*sentimentStress)
	}

	// Tier 3: Full (RTP + SER + ASR)
	wpmDev := clamp01(math.Abs(*wpm-baselineWPM) / (maxWPM - baselineWPM))
	return clamp01(0.30*talkDev + 0.20*energyDev + 0.20*wpmDev + 0.30*sentimentStress)
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
