package rtp

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"log"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/cxmind/ingestion-go/internal/api"
	"github.com/cxmind/ingestion-go/internal/audio"
	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/metrics"
	"github.com/cxmind/ingestion-go/internal/pcap"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/ser"
	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
)

const (
	// DefaultRTPTimeoutSeconds is the fallback RTP inactivity timeout.
	DefaultRTPTimeoutSeconds = 30

	// SRTPKeyMinLength is the minimum decoded SRTP key+salt length (AES_CM_128: 16 key + 14 salt).
	SRTPKeyMinLength = 30

	// RTPHeaderMinSize is the fixed RTP header size (V/P/X/CC/M/PT + SeqNum + Timestamp + SSRC).
	RTPHeaderMinSize = 12
)

// Sniffer captures RTP packets
// OnCallCleanup is called when a call is fully cleaned up (timeout or RTP inactivity).
// Audit #2: Set by hep.InitSharedPipeline to hep.CleanupLocalCache, breaking the
// rtp→hep circular dependency. Clears the in-memory call state cache.
var OnCallCleanup func(callID string)

type Sniffer struct {
	listeners        sync.Map   // int -> *RTPStream (port-based listeners)
	virtualListeners sync.Map   // string -> *RTPStream ("CallID:SrcIP")
	callIndex        sync.Map   // string -> *RTPStream (CallID -> first non-RTCP stream)
	callStreamRefs   sync.Map   // string -> *[]streamRef (CallID -> all stream keys)
	streamRefsMu     sync.Mutex // Protects callStreamRefs Load+append atomicity
	stop             chan struct{}
	schedStop        chan struct{} // closes the GlobalJitterScheduler.Run goroutine

	// TDD Refactor: Tombstone architecture to prevent I/O blocking during timeouts
	trashBin         chan func()
	trashWorkersSync sync.WaitGroup
}

// streamRef identifies a stream entry in either listeners or virtualListeners.
type streamRef struct {
	isVirtual  bool
	portKey    int    // used when isVirtual=false
	virtualKey string // used when isVirtual=true
}

// addStreamRef appends a stream reference for a callID.
// Uses mutex to make Load+append atomic, preventing concurrent appends from losing refs.
func (s *Sniffer) addStreamRef(callID string, ref streamRef) {
	s.streamRefsMu.Lock()
	defer s.streamRefsMu.Unlock()

	if val, ok := s.callStreamRefs.Load(callID); ok {
		refs := val.(*[]streamRef)
		*refs = append(*refs, ref)
		return
	}
	// First ref for this callID
	newRefs := []streamRef{ref}
	s.callStreamRefs.Store(callID, &newRefs)
}

// Global server instance
var GlobalSniffer *Sniffer

func init() {
	GlobalJitterScheduler = NewJitterScheduler()
	GlobalSniffer = NewSniffer()
}

// NewSniffer creates and initializes a new Sniffer instance.
func NewSniffer() *Sniffer {
	schedStop := make(chan struct{})
	s := &Sniffer{
		listeners:        sync.Map{},
		virtualListeners: sync.Map{},
		callIndex:        sync.Map{},
		callStreamRefs:   sync.Map{},
		streamRefsMu:     sync.Mutex{},
		stop:             make(chan struct{}),
		schedStop:        schedStop,
		trashBin:         make(chan func(), 10000), // Pre-allocated massive buffer to guarantee non-blocking sweeping
	}

	// Start the shared JitterBuffer drain scheduler (replaces per-call drainLoop goroutines).
	go GlobalJitterScheduler.Run(schedStop)

	// TDD Part I: Spin up the Sweeper Worker Pool
	const numSweepers = 50
	s.trashWorkersSync.Add(numSweepers)
	for i := 0; i < numSweepers; i++ {
		go s.sweeperWorker()
	}

	return s
}

// sweeperWorker executes cleanup functions sequentially to offload the main timer routines.
func (s *Sniffer) sweeperWorker() {
	defer s.trashWorkersSync.Done()
	for {
		select {
		case task := <-s.trashBin:
			if task != nil {
				task()
			}
		case <-s.stop:
			// Drain remaining safely without blocking other exiting workers
			for {
				select {
				case task := <-s.trashBin:
					if task != nil {
						task()
					}
				default:
					return
				}
			}
		}
	}
}

// SnifferStats holds a snapshot of the RTP sniffer's current state.
type SnifferStats struct {
	PortListeners    int `json:"port_listeners"`
	VirtualListeners int `json:"virtual_listeners"`
	ActiveCalls      int `json:"active_calls"`
}

// Stats returns a snapshot of the sniffer's current state.
// Uses sync.Map.Range (lock-free) — same pattern as collectExpiredStreams.
// Also syncs the Prometheus ie_active_calls gauge.
func (s *Sniffer) Stats() SnifferStats {
	var stats SnifferStats
	s.listeners.Range(func(_, _ any) bool {
		stats.PortListeners++
		return true
	})
	s.virtualListeners.Range(func(_, _ any) bool {
		stats.VirtualListeners++
		return true
	})
	s.callIndex.Range(func(_, _ any) bool {
		stats.ActiveCalls++
		return true
	})
	// Sync Prometheus gauge with authoritative count
	metrics.ActiveCalls.Set(float64(stats.ActiveCalls))
	return stats
}

// Start initiates the sniffing process based on OS
func (s *Sniffer) Start() error {
	// Rebuild sessions from Redis for recovery
	if err := callsession.GlobalManager.RebuildFromRedis(); err != nil {
		log.Printf("[STARTUP] Failed to rebuild sessions from Redis: %v", err)
	}

	// Start timeout monitor
	go s.monitorTimeouts()
	return s.startSniffer()
}

// Stop signals the sniffer to halt packet processing and shuts down sweeps.
// It uses a timeout boundary to prevent shutdown deadlocks.
func (s *Sniffer) Stop() {
	close(s.stop)

	// Stop the shared JitterBuffer scheduler
	close(s.schedStop)

	// Wait for cleanup workers to finish safely or timeout
	done := make(chan struct{})
	go func() {
		s.trashWorkersSync.Wait()
		close(done)
	}()

	select {
	case <-done:
		log.Println("RTP Sniffer sweeper pool drained successfully")
	case <-time.After(3 * time.Second):
		log.Println("[WARN] RTP Sniffer sweeper pool shutdown timed out after 3s")
	}
}

// monitorTimeouts checks for inactive RTP streams and closes them
// Also checks for SIP Session Expirations via CallSession Manager
func (s *Sniffer) monitorTimeouts() {
	timeout := config.Global.GetInt("sniffer.rtp_timeout_seconds")
	if timeout <= 0 {
		timeout = DefaultRTPTimeoutSeconds
	}
	timeoutDuration := time.Duration(timeout) * time.Second

	ticker := time.NewTicker(5 * time.Second) // Check every 5 seconds
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// 1. Check for SIP Session Expirations (Global Heap)
			expiredSessions := callsession.GlobalManager.GetExpiredSessions()
			for _, session := range expiredSessions {
				// Guard: if RTP is still flowing, extend session instead of terminating.
				// PBX without SIP Session-Timer won't send re-INVITE, but active RTP proves call is alive.
				if stream, ok := s.GetStreamByCallID(session.CallID); ok {
					lastActiveNano := atomic.LoadInt64(&stream.lastActivity)
					lastActive := time.Unix(0, lastActiveNano)
					rtpIdle := timeutil.Now().Sub(lastActive)
					if rtpIdle < timeoutDuration {
						// GetExpiredSessions already marked terminated + deleted session.
						// Must clear terminated flag first, otherwise UpdateSession is silently blocked.
						callsession.GlobalManager.ReactivateSession(session.CallID)
						callsession.GlobalManager.UpdateSession(session.CallID, 300, timeutil.Now())
						log.Printf("[SESSION_TIMEOUT] CallID=%s SIP expired but RTP active (idle=%v), extending session", session.CallID, rtpIdle)
						continue
					}
				}

				log.Printf("[SESSION_TIMEOUT] CallID=%s expired (LastMsg=%v)", session.CallID, session.LastSipMsg())

				// Dispatch heavy StopListenerByCallID network teardown to trashBin
				callIDToStop := session.CallID
				s.trashBin <- func() {
					s.StopListenerByCallID(callIDToStop)
				}

				// Audit #1: Consistent order with BYE path — stop listeners first
				s.cleanupTimeoutCall(session.CallID, timeutil.Now(), "session_timeout", nil)
				// Audit #6: Removed redundant Del — EndCallBatch already handles call:last_msg cleanup
			}

			// 2. Check for RTP Inactivity (Local Maps)
			// sync.Map handles concurrency internally — no external lock needed
			now := timeutil.Now()
			expiredStreams := s.collectExpiredStreams(now, timeoutDuration)

			// Phase 2: Cleanup outside lock (I/O operations: Redis, ClickHouse, PCAP)
			cleanedCallIDs := make(map[string]bool)
			for _, es := range expiredStreams {
				if es.needsCleanup && !cleanedCallIDs[es.callID] {
					cleanedCallIDs[es.callID] = true
					callsession.GlobalManager.RemoveSession(es.callID)
					s.cleanupTimeoutCall(es.callID, now, "rtp_timeout", &es.packetStats)
				}
			}

		case <-s.stop:
			return
		}
	}
}

func (s *Sniffer) captureLoop(source *gopacket.PacketSource) {
	for packet := range source.Packets() {
		// ... (skipping UDP/IP extraction)
		// Get UDP layer
		udpLayer := packet.Layer(layers.LayerTypeUDP)
		if udpLayer == nil {
			continue
		}

		udp, _ := udpLayer.(*layers.UDP)
		dstPort := int(udp.DstPort)

		// Get Network layer for IP
		var srcIP, dstIP string
		var netSrcIP, netDstIP net.IP

		ipLayer := packet.Layer(layers.LayerTypeIPv4)
		if ipLayer != nil {
			ip, _ := ipLayer.(*layers.IPv4)
			netSrcIP = ip.SrcIP
			netDstIP = ip.DstIP
			srcIP = netSrcIP.String()
			dstIP = netDstIP.String()
		} else {
			networkLayer := packet.NetworkLayer()
			if networkLayer != nil {
				srcIP = networkLayer.NetworkFlow().Src().String()
				dstIP = networkLayer.NetworkFlow().Dst().String()
				netSrcIP = net.ParseIP(srcIP)
				netDstIP = net.ParseIP(dstIP)
			}
		}
		srcPort := uint16(udp.SrcPort)

		// Fast check if we are listening on this port (lock-free with sync.Map)
		val, exists := s.listeners.Load(dstPort)
		if !exists {
			continue
		}
		stream := val.(*RTPStream)

		// Check for valid UDP payload
		if len(udp.Payload) < 12 {
			continue
		}

		// Delegate to unified ingestRTP, passing the entire original packet bytes directly
		// from the gopacket sniffer slice for zero-alloc passthrough
		s.ingestRTP(stream, packet.Data(), udp.Payload, srcIP, dstIP, int(srcPort), dstPort, packet.Metadata().Timestamp)

	}
}

// InjectRTP allows external injection of RTP packets (e.g. from HEP)
// Updated to accept both raw original packet bytes AND the extracted payload.
func (s *Sniffer) InjectRTP(callID string, originalBytes []byte, payload []byte, srcIP string, dstIP string, srcPort int, dstPort int, timestamp time.Time) {
	// Guard: skip if call was already terminated by BYE
	if callsession.GlobalManager != nil && callsession.GlobalManager.IsTerminated(callID) {
		return
	}

	// Lock-free lookup via sync.Map
	stream, exists := s.getVirtualStream(callID, srcIP)

	if !exists {
		// Lazy creation
		if err := s.StartVirtualListener(callID, srcIP); err != nil {
			log.Printf("Failed to auto-create virtual listener for %s (%s): %v", callID, srcIP, err)
			return
		}
		// Re-fetch
		stream, exists = s.getVirtualStream(callID, srcIP)
		if !exists {
			return
		}
	}

	// Phase 1: Update state + snapshot references (under lock)
	s.ingestRTP(stream, originalBytes, payload, srcIP, dstIP, srcPort, dstPort, timestamp)
}

// ingestRTP unifies packet processing for both physical and virtual streams.
// It handles stats updates, SRTP decryption, PCAP recording, Jitter Buffer, and ASR.
func (s *Sniffer) ingestRTP(stream *RTPStream, originalBytes []byte, payload []byte, srcIP, dstIP string, srcPort, dstPort int, timestamp time.Time) {
	stream.mu.Lock()
	atomic.StoreInt64(&stream.lastActivity, timeutil.Now().UnixNano())
	stream.hasReceivedPackets = true

	// Determine RTP clock rate for Jitter calculation from ptMap
	// Extract PT from byte 1 of payload (mask 0x7F) to lookup clock rate
	clockRateHz := 8000 // Default for PCMU/PCMA/G.722/G.729
	if len(payload) >= 2 {
		pt := payload[1] & 0x7F
		if info, ok := stream.ptMap[pt]; ok && info.ClockRateHz > 0 {
			clockRateHz = info.ClockRateHz
		}
	}
	UpdatePacketStats(&stream.packetStats, payload, clockRateHz) // Track RTP sequence numbers + jitter
	srtpCtx := stream.srtpContext
	agentID := stream.agentID
	vad := stream.vad
	asrStream := stream.stream
	serStream := stream.serStream
	jb := stream.jitterBuf
	// Cache parsed IP under lock to avoid data race
	if stream.parsedSrcIP == nil {
		stream.parsedSrcIP = net.ParseIP(srcIP)
	}
	if stream.parsedDstIP == nil {
		stream.parsedDstIP = net.ParseIP(dstIP)
	}
	cachedSrcIP := stream.parsedSrcIP
	cachedDstIP := stream.parsedDstIP
	stream.mu.Unlock()

	// Phase 2: All processing outside stream.mu (SRTP, PCAP, codec decode, Redis, VAD, ASR)
	// Must be serialized per stream to protect SRTP replay window and VAD/ASR state.
	stream.audioMu.Lock()
	defer stream.audioMu.Unlock()

	// Decrypt SRTP and parse RTP header (shared with captureLoop).
	// payloadType is extracted from the RTP header during parsing — zero extra cost.
	rtpBody, pcapPayload, payloadType := decryptAndParseRTP(payload, srtpCtx)

	// Write to PCAP (Decrypted if SRTP)
	// Only write if a recorder was pre-created by SIP INVITE policy check
	rec := pcap.GetRecorder(stream.callID)
	if rec != nil {
		rec.SmartWritePacket(originalBytes, pcapPayload, cachedSrcIP, cachedDstIP, srcPort, dstPort, timestamp)
	}

	// Helper to handle RTP payload
	if len(rtpBody) == 0 {
		return
	}

	// Route through jitter buffer if enabled, otherwise process directly
	if jb != nil {
		// Push full decrypted packet into jitter buffer together with its PayloadType
		// and RTPTimestamp so the drain goroutine never needs to re-parse the header.
		// This is the Option-B foundation for multi-codec support (G.722, Opus, …).
		rtpTimestamp := extractRTPTimestamp(pcapPayload)
		jb.Push(pcapPayload, payloadType, rtpTimestamp)
		return
	}

	// Direct path (jitter buffer disabled): process immediately
	processAudioPayload(stream, stream.callID, srcIP, agentID, vad, asrStream, serStream, rtpBody, payloadType)
}

// processAudioPayload decodes the RTP payload and runs monitoring → VAD → ASR.
// payloadType selects the codec decoder:
//
//	0  (PCMU) → G.711 µ-law  (DecodeUlawToPCM)
//	8  (PCMA) → G.711 A-law  (DecodeAlawToPCM)
//	other     → PCMU fallback with a one-time WARN log (preserves existing behaviour)
//
// Used by both the direct path (no jitter buffer) and the jitter buffer drain goroutine.
func processAudioPayload(stream *RTPStream, callID, srcIP, agentID string, vad VADProcessor, asrStream audio.ASRStream, serStream *ser.SERStream, rtpBody []byte, payloadType uint8) {
	// Codec decode → 16-bit signed little-endian PCM at 8 kHz or 16 kHz (pooled buffer)
	pcmBuf := GetPCMBuffer()
	defer PutPCMBuffer(pcmBuf)

	var pcm []byte

	// Dynamic Payload Type mapping lookup (lock-free, no map copy)
	ptInfo := stream.GetCodecInfo(payloadType)
	codecName := ptInfo.CodecName

	// Update stream.codec from first RTP packet if not yet set (covers Early Media
	// scenarios where Redis cache may not have the codec field yet).
	if codecName != "" {
		stream.mu.Lock()
		if stream.codec == "" {
			stream.codec = codecName
		}
		stream.mu.Unlock()
	}

	if codecName == "opus" {
		// Output is 16kHz
		pcmLen := len(rtpBody) * 6 // Safe heuristic for Opus compressed to PCM expansion
		if cap(*pcmBuf) < pcmLen {
			pcm = make([]byte, pcmLen)
		} else {
			pcm = (*pcmBuf)[:pcmLen]
		}

		channels := ptInfo.Channels
		if channels < 1 {
			channels = 1
		}

		// Get or create per-stream Opus decoder (eliminates per-packet CGo alloc)
		stream.mu.Lock()
		dec, err := stream.GetOrCreateOpusDec(channels)
		stream.mu.Unlock()
		if err != nil {
			log.Printf("[ERROR] Opus decoder init failed for call %s: %v", callID, err)
			return
		}

		pcm, err = DecodeOpusToPCM16kWithDec(dec, rtpBody, pcm, channels)
		if err != nil {
			stream.mu.Lock()
			stream.continuousDecodeErrs++
			if stream.continuousDecodeErrs >= 50 && !stream.isDegraded {
				stream.isDegraded = true
				log.Printf("[WARN] Stream %s degraded: %d continuous Opus decode errors", callID, stream.continuousDecodeErrs)
			}
			stream.mu.Unlock()
			return // Cannot proceed with invalid audio
		}
		// Decode succeeded, reset error counter
		stream.mu.Lock()
		if stream.continuousDecodeErrs > 0 {
			stream.continuousDecodeErrs = 0
			if stream.isDegraded {
				stream.isDegraded = false
				log.Printf("[INFO] Stream %s recovered from Opus decode errors", callID)
			}
		}
		stream.mu.Unlock()
	} else {
		// Static Payload Type routing
		switch payloadType {
		case 0: // PCMU — G.711 µ-law
			pcm = (*pcmBuf)[:len(rtpBody)*2]
			DecodeUlawToPCM(rtpBody, pcm)
		case 8: // PCMA — G.711 A-law
			pcm = (*pcmBuf)[:len(rtpBody)*2]
			DecodeAlawToPCM(rtpBody, pcm)
		case 9: // G.722 — 16kHz
			pcmLen := len(rtpBody) * 4
			if cap(*pcmBuf) < pcmLen {
				pcm = make([]byte, pcmLen)
			} else {
				pcm = (*pcmBuf)[:pcmLen]
			}
			pcm = DecodeG722ToPCM16k(rtpBody, pcm)
		case 18: // G.729 — 8kHz, 10ms frames (10 bytes compressed)
			// Get or create per-stream G.729 decoder (eliminates per-packet CGo alloc)
			stream.mu.Lock()
			dec, err := stream.GetOrCreateG729Dec()
			stream.mu.Unlock()
			if err != nil {
				log.Printf("[ERROR] G.729 decoder init failed for call %s: %v", callID, err)
				return
			}

			pcm, err = DecodeG729ToPCM8kWithDec(dec, rtpBody)
			if err != nil {
				stream.mu.Lock()
				stream.continuousDecodeErrs++
				if stream.continuousDecodeErrs >= 50 && !stream.isDegraded {
					stream.isDegraded = true
					log.Printf("[WARN] Stream %s degraded: %d continuous G.729 decode errors", callID, stream.continuousDecodeErrs)
				}
				stream.mu.Unlock()
				return
			}
			// Decode succeeded, reset error counter
			stream.mu.Lock()
			if stream.continuousDecodeErrs > 0 {
				stream.continuousDecodeErrs = 0
				if stream.isDegraded {
					stream.isDegraded = false
					log.Printf("[INFO] Stream %s recovered from G.729 decode errors", callID)
				}
			}
			stream.mu.Unlock()
		default:
			// Unknown / unsupported codec: fall back to µ-law so the pipeline keeps
			// running. Log once per stream to avoid log spam at 50 pps.
			pcm = (*pcmBuf)[:len(rtpBody)*2]
			stream.mu.Lock()
			if !stream.unsupportedCodecLogged {
				stream.unsupportedCodecLogged = true
				stream.mu.Unlock()
				log.Printf("[WARN] Unsupported RTP PayloadType=%d for call %s, falling back to PCMU", payloadType, callID)
			} else {
				stream.mu.Unlock()
			}
			DecodeUlawToPCM(rtpBody, pcm)
		}
	}

	// Check if this call is being monitored — batch audio for Redis publish
	if api.GlobalMonitoringCache.ShouldMonitorCall(callID, agentID) {
		// Lazy-init batcher (first monitored packet for this stream)
		stream.mu.Lock()
		if stream.audioBatcher == nil {
			stream.audioBatcher = NewAudioBatcher(callID, srcIP)
		}
		batcher := stream.audioBatcher
		stream.mu.Unlock()

		// Add to batch (auto-flushes every 10 frames / 200ms)
		batcher.Add(pcm)
	}

	// Process SER (Real-time Emotion Recognition)
	if serStream != nil {
		serStream.ProcessAudio(pcm)
	}

	// Determine target sample rate for VAD and ASR
	// G.722 (PT=9), Opus → 16kHz; PCMU (PT=0), PCMA (PT=8), G.729 (PT=18) → 8kHz
	var sampleRate int
	if payloadType == 9 || codecName == "opus" {
		sampleRate = 16000
	} else {
		sampleRate = 8000
	}

	// Dynamic ASR Stream Switcher (Phase 1 & 3: lazily initialize or swap ASR if sample rate changes)
	// CRITICAL: ASR creation MUST be async — NewStream() can block 5s+ waiting for pool connections,
	// which would exhaust all HEP worker goroutines and starve SIP processing (BYE, etc).
	// Bug introduced in b9451152 (2026-02-25), fixed here to match initStreamPipeline's async pattern.
	var vadForPacket VADProcessor
	var asrStreamForPacket audio.ASRStream
	asrSkipped := false

	stream.mu.Lock()
	if stream.processingLevel >= 2 && !stream.asrDisabled {
		recreate := false
		if stream.stream == nil {
			recreate = true
		} else if stream.lastSampleRate != 0 && stream.lastSampleRate != sampleRate {
			log.Printf("Dynamically switching ASR sample rate from %d to %d for call %s", stream.lastSampleRate, sampleRate, stream.callID)
			stream.stream.Close()
			stream.stream = nil
			recreate = true
		}

		if recreate && !stream.asrCreating {
			stream.asrCreating = true
			asyncCallID := stream.callID
			asyncRole := stream.role
			asyncRate := sampleRate
			stream.lastSampleRate = sampleRate
			vadForPacket = stream.vad
			stream.mu.Unlock()

			go func() {
				provider := audio.GetCurrentASRProvider()
				streamProvider, ok := provider.(audio.StreamingASRProvider)
				if !ok {
					stream.mu.Lock()
					stream.asrCreating = false
					stream.mu.Unlock()
					return
				}
				newASR, err := streamProvider.NewStream(asyncRate, "auto")
				stream.mu.Lock()
				stream.asrCreating = false
				if err != nil {
					log.Printf("[WARNING] Failed to create ASR stream for call %s (rate %d): %v", asyncCallID, asyncRate, err)
					stream.stream = nil
					stream.asrDisabled = true
					stream.mu.Unlock()
					go publishASRErrorTranscription(asyncCallID, asyncRole, err)
					return
				}
				// BYE 已清理 或 initStreamPipeline 已创建 → 丢弃
				if stream.stream != nil || stream.asrDisabled {
					stream.mu.Unlock()
					newASR.Close()
					return
				}
				stream.stream = newASR
				if stream.vad == nil {
					stream.vad = NewVADFromConfig()
				}
				stream.mu.Unlock()
				startASRResultHandler(asyncCallID, asyncRole, newASR)
				log.Printf("ASR stream connected for call %s (Role: %s, Rate: %d)", asyncCallID, asyncRole, asyncRate)
			}()

			asrSkipped = true
		}
	}

	if !asrSkipped {
		stream.lastSampleRate = sampleRate
		vadForPacket = stream.vad
		asrStreamForPacket = stream.stream
		stream.mu.Unlock()
	}

	// VAD Check - returns (isSpeech, rmsEnergy) for behavior metrics (C2-P1)
	var isSpeech bool
	var rmsEnergy float64
	if vadForPacket != nil {
		isSpeech, rmsEnergy = vadForPacket.Process(pcm, sampleRate, timeutil.Now())
	}

	// Behavior metrics collection (C2-P1)
	// Determine channel: srcIP matches callerIP → agent(0), else customer(1)
	if stream.behavior != nil {
		channel := 1 // default: customer
		if srcIP == stream.callerIP {
			channel = 0 // agent
		}
		stream.behavior.OnFrame(channel, isSpeech, rmsEnergy, timeutil.Now())
	}

	// VAD gate: skip ASR on silence
	if vad != nil && !isSpeech {
		return
	}

	// Feed audio to ASR Stream only if ASR is running and speech is detected (or RMS fallback says speech)
	if asrStreamForPacket != nil && isSpeech {
		if err := asrStreamForPacket.SendAudio(pcm); err != nil {
			log.Printf("Failed to send audio to stream: %v", err)
		}
	}
}

// newSEREmotionCallback creates a shared SER emotion callback.
// Extracted from StartListener / StartVirtualListener / StartListenerWithPreConnect
// to eliminate code duplication (3× ~25 lines → 1 factory function).
func newSEREmotionCallback(callID string, role string, behavior BehaviorCollector) func(clickhouse.SpeechEmotionRecord) {
	return func(record clickhouse.SpeechEmotionRecord) {
		// Feed ALL SER emotions into BehaviorCollector for stress score (Tier 2)
		if behavior != nil {
			behavior.SetLastEmotion(record.Emotion)
		}
		if record.Confidence > 0.6 && (record.Emotion == "angry" || record.Emotion == "frustrated") {
			event := &redis.CallEvent{
				EventType: "call_emotion",
				CallID:    callID,
				Extra: map[string]interface{}{
					"emotion":    record.Emotion,
					"confidence": record.Confidence,
					"speaker":    record.Speaker,
				},
				Timestamp: timeutil.Now(),
			}
			if err := redis.PublishCallEvent(event); err != nil {
				log.Printf("[SER] Failed to publish emotion event: %v", err)
			}

			// S-3: Submit to fixed sweeper pool instead of unbounded goroutine.
			// Captures values by closure to avoid data race.
			cID, emotion, confidence := callID, record.Emotion, record.Confidence
			select {
			case GlobalSniffer.trashBin <- func() {
				state, err := redis.GetCallState(cID)
				if err == nil && state != nil {
					cloned := make(map[string]interface{}, len(state)+2)
					for k, v := range state {
						cloned[k] = v
					}
					cloned["emotion"] = emotion
					cloned["emotion_confidence"] = confidence
					redis.SetCallState(cID, cloned)
				}
			}:
			default:
				log.Printf("[SER] trashBin full, dropping emotion state update for call %s", cID)
			}
		}
	}
}

// InjectRTCP allows external injection of RTCP packets.
// Accepts timestamp to match HEP packet timing (avoids per-packet time.Now).
func (s *Sniffer) InjectRTCP(callID string, payload []byte, srcIP string, dstIP string, srcPort uint16, dstPort uint16, timestamp time.Time) {
	// Write to PCAP if enabled
	if rec := pcap.GetRecorder(callID); rec != nil {
		sIP := net.ParseIP(srcIP)
		dIP := net.ParseIP(dstIP)
		rec.WritePacket(payload, sIP, dIP, int(srcPort), int(dstPort), timestamp)
	}

	stream, exists := s.getVirtualStream(callID, srcIP)

	if !exists {
		// Lazy creation for RTCP too
		if err := s.StartVirtualRTCPListener(callID, srcIP); err != nil {
			return
		}
		stream, exists = s.getVirtualStream(callID, srcIP)
		if !exists {
			return
		}
	}

	// N9 fix: atomic.StoreInt64 is inherently thread-safe; no need for stream.mu
	atomic.StoreInt64(&stream.lastActivity, timeutil.Now().UnixNano())

	// Process the RTCP packet
	s.processRTCP(payload, stream, srcIP, dstIP, srcPort, dstPort)
}

// GetStreamByCallID finds a non-RTCP stream by CallID using O(1) index lookup.
func (s *Sniffer) GetStreamByCallID(callID string) (*RTPStream, bool) {
	val, ok := s.callIndex.Load(callID)
	if !ok {
		return nil, false
	}
	return val.(*RTPStream), true
}

// indexStream adds a non-RTCP stream to the callIndex for O(1) lookup.
// Only the first non-RTCP stream per callID is indexed (LoadOrStore is atomic).
func (s *Sniffer) indexStream(callID string, stream *RTPStream) {
	if !stream.isRTCP {
		if _, loaded := s.callIndex.LoadOrStore(callID, stream); !loaded {
			// New call registered — update Prometheus gauge
			metrics.ActiveCalls.Inc()
		}
	}
}

// getVirtualStream finds specific virtual stream by key (CallID:SrcIP)
// HP-1 fix: uses string concat instead of fmt.Sprintf (saves 2 allocs/call at 250K/sec)
func (s *Sniffer) getVirtualStream(callID string, srcIP string) (*RTPStream, bool) {
	key := callID + ":" + srcIP
	val, exists := s.virtualListeners.Load(key)
	if !exists {
		return nil, false
	}
	return val.(*RTPStream), true
}

// initStreamPipeline is the factory method for initializing common RTP stream components.
// It loads Redis call state, initializes behavior collectors, SRTP, ASR, and SER based on processingLevel.
// ASR creation is async to prevent blocking HEP workers (NewTask → waitForConnection can block 5s).
// Returns the resolved role. ASR stream is attached to the stream asynchronously.
func (s *Sniffer) initStreamPipeline(stream *RTPStream, callID, defaultRole string, isVirtual bool) string {
	if err := stream.loadCallState(); err != nil {
		log.Printf("[WARN] Failed to load call state for %s: %v, continuing with defaults", callID, err)
	}

	stream.behavior = NewRMSBehavior(callID)

	role := defaultRole
	if isVirtual {
		if defaultRole == stream.callerIP && stream.callerUser != "" {
			role = stream.callerUser
		} else if defaultRole == stream.calleeIP && stream.calleeUser != "" {
			role = stream.calleeUser
		}
	}

	stream.role = role
	stream.initSRTP()

	if stream.processingLevel == 0 {
		return role
	}

	// ASR: async creation to avoid blocking HEP workers on pool connection wait
	if stream.processingLevel >= 2 {
		provider := audio.GetCurrentASRProvider()
		if streamProvider, ok := provider.(audio.StreamingASRProvider); ok {
			// 在注册到 virtualListeners 之前设置，此时 stream 未暴露给其他 goroutine，无需加锁
			stream.asrCreating = true
			go func() {
				asrStream, err := streamProvider.NewStream(8000, "auto")
				if err != nil {
					log.Printf("Failed to start ASR stream for call %s: %v, continuing without ASR", callID, err)
					stream.mu.Lock()
					stream.asrCreating = false
					stream.mu.Unlock()
					return
				}

				stream.mu.Lock()
				stream.asrCreating = false
				// BYE 已清理 或 另一条路径已创建 → 丢弃
				if stream.stream != nil || stream.asrDisabled {
					stream.mu.Unlock()
					asrStream.Close()
					return
				}
				stream.vad = NewVADFromConfig()
				stream.stream = asrStream
				stream.lastSampleRate = 8000
				stream.mu.Unlock()

				startASRResultHandler(callID, role, asrStream)
				log.Printf("ASR stream connected for call %s (Role: %s)", callID, role)
			}()
		} else {
			log.Printf("ASR provider does not support streaming")
		}
	}

	if stream.processingLevel >= 1 {
		analyzer := ser.GetAnalyzer()
		monitor := ser.GetResourceMonitor()
		if analyzer != nil && monitor != nil {
			stream.serStream = ser.NewSERStream(callID, role, analyzer, monitor, newSEREmotionCallback(callID, role, stream.behavior))
		}
	}

	return role
}

// StartListener registers a port for RTP capturing and ASR
func (s *Sniffer) StartListener(port int, callID string, role string) error {
	// If listener already exists, close old stream and replace
	if val, loaded := s.listeners.LoadAndDelete(port); loaded {
		existingStream := val.(*RTPStream)
		log.Printf("Port %d already registered, closing old stream for new call %s", port, callID)
		if existingStream.stream != nil {
			existingStream.stream.Close()
		}
	}

	stream := &RTPStream{
		callID:       callID,
		isRTCP:       false,
		lastActivity: timeutil.Now().UnixNano(),
	}

	role = s.initStreamPipeline(stream, callID, role, false)

	if stream.processingLevel == 0 {
		config.Debugf("Record-Only (Level 0) policy for call %s (port %d)", callID, port)
		s.listeners.Store(port, stream)
		s.addStreamRef(callID, streamRef{isVirtual: false, portKey: port})
		s.indexStream(callID, stream)
		config.Debugf("Sniffer registered RTP port %d for call %s (Role: %s) - ASR & SER disabled", port, callID, role)
		return nil
	}

	s.listeners.Store(port, stream)
	s.addStreamRef(callID, streamRef{isVirtual: false, portKey: port})
	s.indexStream(callID, stream)

	jbDepth := config.Global.GetInt("sniffer.jitter_buffer_ms") / 20
	if jbDepth > 0 {
		stream.jitterBuf = GlobalJitterScheduler.NewManagedJitterBuffer(jbDepth)
		go func() {
			for pkt := range stream.jitterBuf.Output() {
				if len(pkt.Data) <= RTPHeaderMinSize {
					continue
				}
				rtpBody := pkt.Data[RTPHeaderMinSize:]
				stream.mu.Lock()
				v := stream.vad
				a := stream.stream
				ss := stream.serStream
				agentID := stream.agentID
				stream.mu.Unlock()
				processAudioPayload(stream, callID, "0.0.0.0", agentID, v, a, ss, rtpBody, pkt.PayloadType)
			}
		}()
		config.Debugf("Jitter buffer enabled for physical listener %d (call %s, depth=%dms)", port, callID, jbDepth*20)
	}

	config.Debugf("Sniffer registered RTP port %d for call %s (Role: %s)", port, callID, role)
	return nil
}

// StartVirtualListener registers a virtual listener for HEP injection without port binding
// Using srcIP as "role" identifier initially
func (s *Sniffer) StartVirtualListener(callID string, srcIP string) error {
	key := callID + ":" + srcIP

	// Atomic occupy — 保证唯一赢者执行 initStreamPipeline，消除竞态
	stream := &RTPStream{
		callID:       callID,
		isRTCP:       false,
		lastActivity: timeutil.Now().UnixNano(),
	}

	if _, loaded := s.virtualListeners.LoadOrStore(key, stream); loaded {
		return nil // 已存在，快速返回
	}

	// 唯一赢者执行 pipeline（Redis + ASR + SER）
	role := s.initStreamPipeline(stream, callID, srcIP, true)
	s.indexStream(callID, stream)
	s.addStreamRef(callID, streamRef{isVirtual: true, virtualKey: key})

	jbDepth := config.Global.GetInt("sniffer.jitter_buffer_ms") / 20
	if jbDepth > 0 {
		stream.jitterBuf = GlobalJitterScheduler.NewManagedJitterBuffer(jbDepth)
		go func() {
			for pkt := range stream.jitterBuf.Output() {
				if len(pkt.Data) <= RTPHeaderMinSize {
					continue
				}
				rtpBody := pkt.Data[RTPHeaderMinSize:]
				stream.mu.Lock()
				v := stream.vad
				a := stream.stream
				ss := stream.serStream
				agentID := stream.agentID
				stream.mu.Unlock()
				processAudioPayload(stream, callID, srcIP, agentID, v, a, ss, rtpBody, pkt.PayloadType)
			}
		}()
		config.Debugf("Jitter buffer enabled for call %s (depth=%dms)", callID, jbDepth*20)
	}

	if stream.processingLevel == 0 {
		config.Debugf("Sniffer registered virtual listener for call %s (SrcIP: %s, Speaker: %s) - Level 0, ASR & SER disabled", callID, srcIP, role)
	} else {
		config.Debugf("Sniffer registered virtual listener for call %s (SrcIP: %s, Speaker: %s) - Level %d", callID, srcIP, role, stream.processingLevel)
	}

	return nil
}

// StartRTCPListener registers a port for RTCP capturing (discard)
func (s *Sniffer) StartRTCPListener(port int, callID string) error {
	s.listeners.Store(port, &RTPStream{
		callID:       callID,
		stream:       nil,
		isRTCP:       true,
		lastActivity: timeutil.Now().UnixNano(),
	})

	config.Debugf("Sniffer registered RTCP port %d for call %s", port, callID)
	s.addStreamRef(callID, streamRef{isVirtual: false, portKey: port})
	return nil
}

// StartVirtualRTCPListener registers a virtual listener for RTCP (discard)
func (s *Sniffer) StartVirtualRTCPListener(callID string, srcIP string) error {
	key := callID + ":" + srcIP // HP-1 fix: avoid fmt.Sprintf

	s.virtualListeners.Store(key, &RTPStream{
		callID:       callID,
		stream:       nil,
		isRTCP:       true,
		lastActivity: timeutil.Now().UnixNano(),
	})

	config.Debugf("Sniffer registered virtual RTCP listener for call %s (SrcIP: %s)", callID, srcIP)
	s.addStreamRef(callID, streamRef{isVirtual: true, virtualKey: key})
	return nil
}

// StartListenerWithPreConnect registers a listener and pre-creates ASR stream
func (s *Sniffer) StartListenerWithPreConnect(port int, callID string, role string) error {
	if val, loaded := s.listeners.LoadAndDelete(port); loaded {
		existingStream := val.(*RTPStream)
		log.Printf("Port %d already registered, closing old stream for new call %s", port, callID)
		if existingStream.stream != nil {
			existingStream.stream.Close()
		}
	}

	stream := &RTPStream{
		callID:       callID,
		isRTCP:       false,
		lastActivity: timeutil.Now().UnixNano(),
	}

	role = s.initStreamPipeline(stream, callID, role, false)

	if stream.processingLevel == 0 {
		config.Debugf("Record-Only policy for call %s (port %d), skipping pre-connect", callID, port)
		s.listeners.Store(port, stream)
		s.addStreamRef(callID, streamRef{isVirtual: false, portKey: port})
		s.indexStream(callID, stream)
		config.Debugf("Sniffer registered RTP port %d for call %s (Role: %s) - ASR & SER disabled", port, callID, role)
		return nil
	}

	s.listeners.Store(port, stream)
	s.addStreamRef(callID, streamRef{isVirtual: false, portKey: port})
	s.indexStream(callID, stream)

	config.Debugf("Listener registered for RTP port %d (call %s, role %s)", port, callID, role)
	return nil
}

// StopListener removes port from listeners
func (s *Sniffer) StopListener(port int) {
	if val, loaded := s.listeners.LoadAndDelete(port); loaded {
		stream := val.(*RTPStream)
		if stream.stream != nil {
			stream.stream.Close()
		}
		log.Printf("Stopped listener on port %d", port)
	}
}

func (s *Sniffer) cleanupSingleStream(stream *RTPStream) audio.ASRStream {
	if stream.jitterBuf != nil {
		GlobalJitterScheduler.Unregister(stream.jitterBuf)
		stream.jitterBuf.Stop()
	}
	if stream.audioBatcher != nil {
		stream.audioBatcher.Flush()
	}
	stream.CloseDecoders()
	// 加锁标记终止，防止异步 goroutine 在 BYE 清理后往已死 stream 上挂 ASR
	stream.mu.Lock()
	asr := stream.stream
	stream.stream = nil
	stream.asrDisabled = true
	stream.mu.Unlock()
	return asr
}

// StopListenerByCallID removes all listeners for a specific call.
// 通过 callStreamRefs 索引做 O(1) 查找，找不到则退化为全扫描。
// if no refs are registered (backward compat with pre-index code paths).
func (s *Sniffer) StopListenerByCallID(callID string) {
	var streamsToClose []audio.ASRStream

	// 先用索引快速移除
	if val, ok := s.callStreamRefs.LoadAndDelete(callID); ok {
		refs := val.(*[]streamRef)
		for _, ref := range *refs {
			if ref.isVirtual {
				if v, loaded := s.virtualListeners.LoadAndDelete(ref.virtualKey); loaded {
					stream := v.(*RTPStream)
					if asr := s.cleanupSingleStream(stream); asr != nil {
						streamsToClose = append(streamsToClose, asr)
					}
					log.Printf("Stopped virtual listener %s for CallID %s", ref.virtualKey, callID)
				}
			} else {
				if v, loaded := s.listeners.LoadAndDelete(ref.portKey); loaded {
					stream := v.(*RTPStream)
					if asr := s.cleanupSingleStream(stream); asr != nil {
						streamsToClose = append(streamsToClose, asr)
					}
					log.Printf("Stopped listener on port %d for CallID %s", ref.portKey, callID)
				}
			}
		}
	} else {
		// Fallback: full scan (for streams registered before index was available)
		s.listeners.Range(func(key, value any) bool {
			port := key.(int)
			stream := value.(*RTPStream)
			if stream.callID == callID {
				if asr := s.cleanupSingleStream(stream); asr != nil {
					streamsToClose = append(streamsToClose, asr)
				}
				s.listeners.Delete(port)
				log.Printf("Stopped listener on port %d for CallID %s (fallback)", port, callID)
			}
			return true
		})

		s.virtualListeners.Range(func(key, value any) bool {
			k := key.(string)
			stream := value.(*RTPStream)
			if stream.callID == callID || strings.HasPrefix(k, callID+":") {
				if asr := s.cleanupSingleStream(stream); asr != nil {
					streamsToClose = append(streamsToClose, asr)
				}
				s.virtualListeners.Delete(k)
				log.Printf("Stopped virtual listener %s for CallID %s (fallback)", k, callID)
			}
			return true
		})
	}

	// Async close all collected ASR streams (non-blocking, avoids 2s sleep per stream)
	for _, asrStream := range streamsToClose {
		go func(s audio.ASRStream) {
			s.Close()
		}(asrStream)
	}

	// Clear monitoring cache for this call
	api.GlobalMonitoringCache.ClearCall(callID)

	// Remove from callIndex
	s.callIndex.Delete(callID)
	metrics.ActiveCalls.Dec()
}
