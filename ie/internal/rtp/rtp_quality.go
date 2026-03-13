package rtp

import (
	"log"
	"math"
	"strings"
	"sync/atomic"
	"time"

	"github.com/cxmind/ingestion-go/internal/redis"
)

// codecImpairments holds ITU-T G.107 E-Model impairment factors per codec.
// Ie: Equipment Impairment Factor (inherent codec distortion)
// Bpl: Packet Loss Robustness Factor (codec's tolerance to loss)
// Keys are lowercase — callers must use strings.ToLower(codec) for lookup.
var codecImpairments = map[string]struct{ Ie, Bpl float64 }{
	"pcmu": {0, 4.3}, // G.711 µ-law
	"pcma": {0, 4.3}, // G.711 A-law
	"g729": {11, 19}, // G.729
	"g722": {0, 4.3}, // G.722
	"opus": {0, 10},  // Opus
	"":     {0, 4.3}, // Unknown codec → assume G.711
}

// RTPQualityMetric extends QualityMetric with RTP-specific fields.
// Published to Redis call:quality:{callId} every 3 seconds.
type RTPQualityMetric struct {
	CallID     string  `json:"call_id"`
	Source     string  `json:"source"`    // "rtp"
	Direction  string  `json:"direction"` // "caller" or "callee"
	MOS        float32 `json:"mos_score"`
	RFactor    float64 `json:"r_factor"`
	JitterMs   float64 `json:"jitter_ms"`
	PacketLoss float64 `json:"packet_loss_pct"` // 0.0 - 1.0
	RttMs      float64 `json:"rtt_ms"`
	Codec      string  `json:"codec"`
	WindowPkts uint64  `json:"window_packets"`
	Timestamp  int64   `json:"timestamp"`
}

// RTPQualityPublisher scans active streams every 3 seconds and publishes
// codec-aware MOS to Redis for real-time Copilot and Agent Map consumption.
type RTPQualityPublisher struct {
	stop chan struct{}
}

// NewRTPQualityPublisher creates a new publisher.
func NewRTPQualityPublisher() *RTPQualityPublisher {
	return &RTPQualityPublisher{
		stop: make(chan struct{}),
	}
}

// Start begins the 3-second publish loop. Should be called as a goroutine.
func (p *RTPQualityPublisher) Start() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	log.Println("[RTPQuality] Publisher started (3s interval)")

	for {
		select {
		case <-ticker.C:
			p.publishAll()
		case <-p.stop:
			log.Println("[RTPQuality] Publisher stopped")
			return
		}
	}
}

// Stop signals the publisher to exit.
func (p *RTPQualityPublisher) Stop() {
	select {
	case <-p.stop:
		// Already stopped
	default:
		close(p.stop)
	}
}

// publishAll iterates all active virtual streams, snapshots window stats,
// computes MOS, and publishes to Redis.
func (p *RTPQualityPublisher) publishAll() {
	if GlobalSniffer == nil {
		return
	}

	now := time.Now()

	GlobalSniffer.virtualListeners.Range(func(key, val any) bool {
		stream := val.(*RTPStream)
		if stream.isRTCP {
			return true // Skip RTCP-only streams
		}

		// Check if stream is active (received packets recently)
		lastAct := atomic.LoadInt64(&stream.lastActivity)
		if now.UnixNano()-lastAct > 10*time.Second.Nanoseconds() {
			return true // Stale stream, skip
		}

		// Snapshot window stats under lock
		stream.mu.Lock()
		snap := stream.packetStats.SnapshotAndResetWindow()
		codec := stream.codec
		callID := stream.callID
		callerIP := stream.callerIP
		calleeIP := stream.calleeIP
		cachedRTT := stream.lastRTTMs
		stream.mu.Unlock()

		// Skip if no packets in this window
		if snap.Packets == 0 {
			return true
		}

		// Determine direction from virtual listener key "callID:srcIP"
		keyStr := key.(string)
		srcIP := extractSrcIP(keyStr, callID)
		direction := DetermineDirection(srcIP, callerIP, calleeIP)

		// Compute codec-aware MOS
		mos, rFactor := ComputeMOS(snap.LossRate, cachedRTT, snap.AvgJitterMs, codec)

		metric := RTPQualityMetric{
			CallID:     callID,
			Source:     "rtp",
			Direction:  direction,
			MOS:        float32(mos),
			RFactor:    rFactor,
			JitterMs:   math.Round(snap.AvgJitterMs*100) / 100,
			PacketLoss: math.Round(snap.LossRate*10000) / 10000,
			RttMs:      cachedRTT,
			Codec:      codec,
			WindowPkts: snap.Packets,
			Timestamp:  now.Unix(),
		}

		// Publish to Redis using existing PublishQualityMetric
		if err := redis.PublishQualityMetric(callID, metric); err != nil {
			log.Printf("[RTPQuality] Publish error for %s: %v", callID, err)
		}

		return true
	})
}

// extractSrcIP extracts the srcIP from a virtual listener key "callID:srcIP".
func extractSrcIP(key, callID string) string {
	prefix := callID + ":"
	if len(key) > len(prefix) {
		return key[len(prefix):]
	}
	return ""
}

// ComputeMOS calculates codec-aware MOS using the ITU-T G.107 E-Model.
// Returns MOS (1.0-4.5) and R-factor (0-100).
func ComputeMOS(packetLoss, rttMs, jitterMs float64, codec string) (float64, float64) {
	// Base R-factor
	R := 93.2

	// Delay impairment (Id)
	// Effective delay = RTT/2 + jitter buffer delay (assume 2x jitter)
	effectiveDelay := rttMs/2.0 + jitterMs*2.0
	if effectiveDelay > 177.3 {
		R -= 0.024*effectiveDelay - 0.024*177.3
	}

	// Normalize codec name to lowercase for case-insensitive lookup.
	// SDP codec names vary by PBX vendor (e.g. "PCMU" vs "pcmu").
	normCodec := strings.ToLower(codec)

	// Equipment impairment (Ie-eff) with codec-specific factors
	imp, ok := codecImpairments[normCodec]
	if !ok {
		imp = codecImpairments[""] // Default to G.711
	}

	// Ie-eff = Ie + (95 - Ie) * Ppl / (Ppl + Bpl)
	ppl := packetLoss * 100.0 // Convert to percentage
	if ppl > 0 || imp.Ie > 0 {
		ieEff := imp.Ie + (95.0-imp.Ie)*ppl/(ppl+imp.Bpl)
		R -= ieEff
	}

	// Clamp R to [0, 100]
	if R < 0 {
		R = 0
	}
	if R > 100 {
		R = 100
	}

	// Convert R-factor to MOS (ITU-T G.107 Annex B)
	var mos float64
	if R < 6.5 {
		mos = 1.0
	} else if R > 100 {
		mos = 4.5
	} else {
		mos = 1.0 + 0.035*R + R*(R-60.0)*(100.0-R)*7e-6
	}

	// Round to 2 decimal places
	mos = math.Round(mos*100) / 100
	R = math.Round(R*100) / 100

	return mos, R
}
