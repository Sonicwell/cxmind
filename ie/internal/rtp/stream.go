package rtp

import (
	"encoding/base64"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/cxmind/ingestion-go/internal/audio"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/ser"
	"github.com/cxmind/ingestion-go/internal/sip"
	hrOpus "github.com/hraban/opus"
	g729lib "github.com/pidato/audio/g729"
	"github.com/pion/srtp/v2"
)

// RTPStream handles a single RTP stream for ASR
type RTPStream struct {
	callID string
	stream audio.ASRStream
	isRTCP bool
	// lastActivity is UnixNano timestamp (atomic)
	lastActivity       int64
	hasReceivedPackets bool // Track if we've ever received RTP packets
	mu                 sync.Mutex
	audioMu            sync.Mutex // Serializes SRTP decryption and VAD/ASR processing (P0 Fix)
	// RTCP Stats
	lastSRTime  time.Time    // Time we received the last SR
	lastSRNTP   uint32       // Middle 32 bits of NTP timestamp from last SR
	vad         VADProcessor // Voice Activity Detection (RMS or Silero)
	serStream   *ser.SERStream
	srtpContext *srtp.Context
	agentID     string // Cached agent ID for monitoring checks

	// Cached call state fields (loaded once from Redis, reused for stream lifetime)
	callerName      string // For speaker identification
	calleeName      string // For speaker identification
	asrEnabled      bool   // Policy flag (legacy)
	asrDisabled     bool   // Dynamic flag: indicates ASR was manually disabled, preventing auto-recreation
	asrCreating     bool   // Gate flag: prevents concurrent ASR creation goroutines in processAudioPayload
	processingLevel int    // 0=Record Only, 1=+SER, 2=+ASR+SER
	srtpKey         string // Cached SRTP key (base64)
	stateLoaded     bool   // Flag to prevent re-querying Redis

	// optimized cleanup fields
	startTime  time.Time
	answerTime *time.Time
	callerUser string
	calleeUser string
	fromDomain string
	toDomain   string
	callerIP   string // Cached for role determination (avoids extra Redis RTT)
	calleeIP   string // Cached for role determination (avoids extra Redis RTT)
	direction  string // Cached direction (inbound/outbound) for timeout cleanup
	role       string // Explicitly stored role/speaker name for this stream

	// GeoIP (loaded from Redis at INVITE time, reused in timeout cleanup)
	sigSrcCountry string
	sigSrcCity    string
	sigDstCountry string
	sigDstCity    string
	sigSrcIp      string
	sigDstIp      string

	// Monitoring audio batcher (lazy-initialized when monitoring is active)
	audioBatcher *AudioBatcher

	// Jitter buffer for RTP packet reordering before ASR (nil = disabled)
	jitterBuf *JitterBuffer

	// Dynamic sample rate tracking for ASR recreation
	lastSampleRate int

	// Dynamic Payload Type mapping (extracted from SDP, keyed by PT integer)
	ptMap map[uint8]sip.PTInfo

	// HP-2: Cached parsed IPs to avoid net.ParseIP per-packet
	parsedSrcIP net.IP // Cached on first PCAP write
	parsedDstIP net.IP // Cached on first PCAP write

	// RTP packet-level statistics (for post-call quality analysis)
	packetStats PacketStats

	// Real-time quality fields
	codec                  string  // Audio codec (e.g. PCMU, G729, opus)
	lastRTTMs              float64 // Last measured RTCP RTT in milliseconds
	unsupportedCodecLogged bool    // Log-once flag for unsupported PT warning

	// Per-stream decoder instances (lazy-init, lifecycle = stream lifetime)
	// Eliminates per-packet CGo alloc and preserves decoder state continuity.
	opusDec *hrOpus.Decoder  // Opus decoder (48kHz, mono or stereo)
	g729Dec *g729lib.Decoder // G.729 decoder (8kHz, stateful LPC)

	// RTP Error Tolerance & Degraded State Tracking
	continuousDecodeErrs uint32 // Atomic counter for continuous decode failures
	isDegraded           bool   // Flag indicating if stream is in degraded state

	// Behavior metrics collector (C2-P1) — accumulates talk/silence/energy per frame
	behavior BehaviorCollector
}

// loadCallState loads call state and SRTP key from Redis in a single pipeline (optimized)
func (stream *RTPStream) loadCallState() error {
	stream.mu.Lock()
	defer stream.mu.Unlock()

	// Already loaded, skip
	if stream.stateLoaded {
		return nil
	}

	// Use pipeline to fetch both call state and SRTP key in 1 RTT
	result, err := redis.GetCallStateWithSRTPKey(stream.callID)
	if err != nil {
		return fmt.Errorf("failed to get call state with SRTP key: %w", err)
	}

	state := result.State
	if state == nil {
		return fmt.Errorf("call state not found for %s", stream.callID)
	}

	// Cache call state fields
	// Use shared parser for all fields
	data := redis.ParseCallState(state)
	stream.callerName = data.CallerName
	stream.calleeName = data.CalleeName
	stream.asrEnabled = data.ASREnabled
	stream.processingLevel = data.ProcessingLevel
	stream.agentID = data.AgentID
	stream.startTime = data.StartTime
	stream.answerTime = data.AnswerTime
	stream.callerUser = data.CallerUser
	stream.calleeUser = data.CalleeUser
	stream.fromDomain = data.FromDomain
	stream.toDomain = data.ToDomain
	stream.callerIP = data.CallerIP
	stream.calleeIP = data.CalleeIP
	stream.direction = data.Direction
	stream.sigSrcCountry = data.SigSrcCountry
	stream.sigSrcCity = data.SigSrcCity
	stream.sigDstCountry = data.SigDstCountry
	stream.sigDstCity = data.SigDstCity
	stream.sigSrcIp = data.SigSrcIp
	stream.sigDstIp = data.SigDstIp

	// Load codec if it was set in handleAnswer
	if codecVal, ok := state["codec"].(string); ok && codecVal != "" {
		stream.codec = codecVal
	}

	// Cache SRTP key (from pipeline result)
	stream.srtpKey = result.SRTPKey

	stream.stateLoaded = true
	log.Printf("[CACHE] Loaded call state for %s (agentID=%s, asrEnabled=%v, srtpKey=%v)",
		stream.callID, stream.agentID, stream.asrEnabled, stream.srtpKey != "")
	return nil
}

// initSRTP initializes SRTP context if a key exists for the call
func (stream *RTPStream) initSRTP() {

	// Use cached SRTP key (loaded via pipeline in loadCallState)
	stream.mu.Lock()
	key := stream.srtpKey
	stream.mu.Unlock()

	if key == "" {
		return
	}

	log.Printf("[CACHE] Using cached SRTP key for call %s", stream.callID)

	keySalt, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		log.Printf("Error decoding SRTP key for call %s: %v", stream.callID, err)
		return
	}

	// Assume AES_CM_128_HMAC_SHA1_80 (Key 16 bytes, Salt 14 bytes)
	if len(keySalt) < SRTPKeyMinLength {
		log.Printf("Invalid SRTP key length for call %s: %d", stream.callID, len(keySalt))
		return
	}

	ctx, err := srtp.CreateContext(keySalt[:16], keySalt[16:], srtp.ProtectionProfileAes128CmHmacSha1_80)
	if err != nil {
		log.Printf("Error creating SRTP context for call %s: %v", stream.callID, err)
		return
	}

	stream.srtpContext = ctx
}

// UpdatePTMap safely updates the dynamic Payload Type map for this stream.
func (stream *RTPStream) UpdatePTMap(newMap map[uint8]sip.PTInfo) {
	stream.mu.Lock()
	defer stream.mu.Unlock()
	stream.ptMap = newMap
}

// GetPTMap safely retrieves the dynamic Payload Type map for this stream.
func (stream *RTPStream) GetPTMap() map[uint8]sip.PTInfo {
	stream.mu.Lock()
	defer stream.mu.Unlock()

	if stream.ptMap == nil {
		return map[uint8]sip.PTInfo{}
	}

	copyMap := make(map[uint8]sip.PTInfo, len(stream.ptMap))
	for k, v := range stream.ptMap {
		copyMap[k] = v
	}
	return copyMap
}

// GetCodecInfo retrieves codec info for a specific payload type without copying
// the entire map. This is the fast-path alternative to GetPTMap() — avoids
// per-packet map allocation (~100/s/call at 50pps × 2 streams).
func (stream *RTPStream) GetCodecInfo(pt uint8) sip.PTInfo {
	stream.mu.Lock()
	defer stream.mu.Unlock()
	return stream.ptMap[pt]
}

// GetOrCreateOpusDec returns the cached Opus decoder for this stream,
// creating one on first use. Must be called under stream.mu lock.
func (stream *RTPStream) GetOrCreateOpusDec(channels int) (*hrOpus.Decoder, error) {
	if stream.opusDec != nil {
		return stream.opusDec, nil
	}
	dec, err := hrOpus.NewDecoder(48000, channels)
	if err != nil {
		return nil, fmt.Errorf("opus: failed to create decoder: %v", err)
	}
	stream.opusDec = dec
	return dec, nil
}

// GetOrCreateG729Dec returns the cached G.729 decoder for this stream,
// creating one on first use. Must be called under stream.mu lock.
func (stream *RTPStream) GetOrCreateG729Dec() (*g729lib.Decoder, error) {
	if stream.g729Dec != nil {
		return stream.g729Dec, nil
	}
	dec := g729lib.NewDecoder()
	if dec == nil {
		return nil, fmt.Errorf("g729: failed to create decoder")
	}
	stream.g729Dec = dec
	return dec, nil
}

// CloseDecoders releases any CGo decoder resources held by this stream.
// Must be called when the stream is being cleaned up (e.g., call timeout).
func (stream *RTPStream) CloseDecoders() {
	stream.mu.Lock()
	defer stream.mu.Unlock()
	// Opus decoder: hraban/opus doesn't have a Close() method (GC handles it)
	stream.opusDec = nil
	// G.729 decoder: requires explicit Close() to free C memory
	if stream.g729Dec != nil {
		if err := stream.g729Dec.Close(); err != nil {
			log.Printf("[Pool] g729 decoder close error for %s: %v", stream.callID, err)
		}
		stream.g729Dec = nil
	}
}
