package hep

import (
	"crypto/subtle"
	"sync/atomic"

	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"

	"bufio"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/geoip"
	"github.com/cxmind/ingestion-go/internal/metrics"
	"github.com/cxmind/ingestion-go/internal/pcap"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/rtp"
	"github.com/cxmind/ingestion-go/internal/sip"
	"github.com/patrickmn/go-cache"
)

const (
	// LocalCacheTTL is the TTL for the local call state cache.
	LocalCacheTTL = 10 * time.Minute

	// DefaultSessionExpires is the default SIP Session-Expires value (seconds).
	DefaultSessionExpires = 300

	// InviteNoReplyTimeout: 首次 INVITE 无响应的应用层超时（秒）
	// RFC 3261 Timer B = 32s, 但 IE 是被动 HEP 采集器, 8s 足以覆盖常规重传周期
	InviteNoReplyTimeout = 8
)

var (
	// Batch writers are now managed globally in clickhouse package
	localCache     *cache.Cache
	hepUDPConn     *net.UDPConn
	hepTCPListener *net.TCPListener
	// TCP connection-level flood protection
	tcpConnLimiter *ConnectionLimiter

	// HD-4: Cached viper config values for hot-path access (avoids RWMutex per-packet)
	cachedAuthToken   atomic.Pointer[string]
	cachedIgnorePorts atomic.Pointer[map[int]bool]

	// P6 fix: initSharedPipelineOnce ensures InitSharedPipeline is idempotent.
	// It may be invoked from both raw sniffer mode and SIPREC mode setup paths.
	initSharedPipelineOnce sync.Once
)

// initCachedConfig caches viper config values used on hot paths.
// Called at startup and on config reload.
func initCachedConfig() {
	token := config.Global.GetString("hep.auth_token")
	cachedAuthToken.Store(&token)

	// V7 fix: Cache ignore_ports as a map for O(1) lock-free lookup in HandleSIPPayload
	ports := config.Global.GetIntSlice("sniffer.ignore_ports")
	portMap := make(map[int]bool, len(ports))
	for _, p := range ports {
		portMap[p] = true
	}
	cachedIgnorePorts.Store(&portMap)
}

// initTCPConnLimiter initializes the TCP connection limiter from config.
// Reads hep.tcp_max_connections (default 500). Idempotent: no-op if already initialized.
func initTCPConnLimiter() {
	if tcpConnLimiter != nil {
		return
	}
	maxConns := config.Global.GetInt("hep.tcp_max_connections")
	if maxConns <= 0 {
		maxConns = 500
	}
	tcpConnLimiter = NewConnectionLimiter(maxConns)
}

// shouldRejectAuth checks if a packet should be rejected due to auth token mismatch.
// SEC-1 fix: This is called BEFORE RTP/RTCP/SIP dispatch to ensure ALL packet types
// are subject to authentication when auth is enabled.
func shouldRejectAuth(packet *HEPPacket) bool {
	tokenPtr := cachedAuthToken.Load()
	if tokenPtr == nil || *tokenPtr == "" {
		return false // Auth disabled
	}
	return subtle.ConstantTimeCompare([]byte(packet.AuthToken), []byte(*tokenPtr)) != 1
}

// InitSharedPipeline initializes the batch writers and local cache needed by
// HandleSIPPayload. This is called automatically by StartHEPServer in HEP mode.
// For raw sniffer mode, call this explicitly before starting the SIP sniffer.
//
// P6 fix: idempotent — safe to call multiple times (raw mode + SIPREC paths).
func InitSharedPipeline() {
	initSharedPipelineOnce.Do(func() {
		initCachedConfig()

		batchSize := config.Global.GetInt("clickhouse.batch_size")
		if batchSize <= 0 {
			batchSize = 1000
		}
		flushIntervalMs := config.Global.GetInt("clickhouse.flush_interval_ms")
		if flushIntervalMs <= 0 {
			flushIntervalMs = 2000
		}
		flushInterval := time.Duration(flushIntervalMs) * time.Millisecond
		// N5 fix: Init ALL batch writers here so sniffer/SIPREC modes get full pipeline
		clickhouse.InitCallEventBatchWriter(batchSize, flushInterval)
		clickhouse.InitSipMessageBatchWriter(batchSize, flushInterval)
		clickhouse.InitRTCPBatchWriter(batchSize, flushInterval)
		localCache = cache.New(LocalCacheTTL, LocalCacheTTL)

		log.Printf("[SHARED] SIP pipeline initialized (batch_size=%d, flush_interval=%v)", batchSize, flushInterval)

		// Audit #2: Register localCache cleanup for timeout path (rtp → hep callback)
		rtp.OnCallCleanup = CleanupLocalCache
	})
}

// CleanupLocalCache removes a call's cached state from the local cache.
// Audit #2: Exported for use by rtp.cleanupTimeoutCall (timeout path).
// BYE path already calls localCache.Delete in handleTermination.
func CleanupLocalCache(callID string) {
	if localCache != nil {
		localCache.Delete(callID)
	}
}

// StartHEPServer starts UDP and TCP servers to listen for HEP packets
func StartHEPServer(port string) error {
	// N5 fix: use shared pipeline init (idempotent, handles all writers + localCache)
	InitSharedPipeline()
	// TCP connection limiter is HEP-specific (not shared with sniffer mode)
	initTCPConnLimiter()

	p, err := strconv.Atoi(port)
	if err != nil {
		return err
	}

	// 1. Start UDP Listener
	udpAddr := net.UDPAddr{
		Port: p,
		IP:   net.ParseIP("0.0.0.0"),
	}
	udpConn, err := net.ListenUDP("udp", &udpAddr)
	if err != nil {
		return err
	}
	hepUDPConn = udpConn // Store for shutdown
	// defer udpConn.Close() // Don't close if we want it to run

	// Initialize UDP worker pool (replaces per-packet goroutines)
	udpWorkers := config.Global.GetInt("hep.udp_workers")
	if udpWorkers <= 0 {
		udpWorkers = 20 // Default: 20 fixed workers
	}
	udpQueueSize := config.Global.GetInt("hep.udp_queue_size")
	if udpQueueSize <= 0 {
		udpQueueSize = 4096
	}
	GlobalHEPWorkerPool = NewHEPWorkerPool(udpWorkers, udpQueueSize)
	log.Printf("HEP UDP worker pool started: workers=%d queue=%d", udpWorkers, udpQueueSize)

	log.Printf("HEP Server listening on UDP :%s", port)

	// Start UDP Loop in Goroutine — each packet is dispatched to the fixed worker pool
	go func() {
		buffer := make([]byte, 65535) // Max UDP size
		for {
			n, remoteAddr, err := udpConn.ReadFromUDP(buffer)
			if err != nil {
				if !strings.Contains(err.Error(), "use of closed network connection") {
					log.Printf("Error reading from UDP: %v", err)
				}
				return
			}
			// Copy packet data to avoid overwrite by next ReadFromUDP
			data := make([]byte, n)
			copy(data, buffer[:n])

			// Enqueue to fixed worker pool (non-blocking, drops on full queue)
			if !GlobalHEPWorkerPool.TrySubmit(packetJob{data: data, remoteAddr: remoteAddr}) {
				log.Printf("Dropping UDP HEP packet from %s (worker pool queue full)", remoteAddr)
			}
		}
	}()

	// 2. Start TCP Listener
	tcpAddr := net.TCPAddr{
		Port: p,
		IP:   net.ParseIP("0.0.0.0"),
	}
	tcpListener, err := net.ListenTCP("tcp", &tcpAddr)
	if err != nil {
		return err
	}
	hepTCPListener = tcpListener // Store for shutdown
	defer tcpListener.Close()

	log.Printf("HEP Server listening on TCP :%s", port)

	// Start TCP Loop (Blocking main thread)
	for {
		conn, err := tcpListener.Accept()
		if err != nil {
			// Graceful exit when listener is closed during shutdown
			if errors.Is(err, net.ErrClosed) {
				log.Println("TCP listener closed, exiting accept loop")
				return nil
			}
			log.Printf("Error accepting TCP connection: %v", err)
			continue
		}
		// TCP flood protection: limit concurrent connections (initialized at startup)
		if !tcpConnLimiter.TryAcquire() {
			log.Printf("[FLOOD] Rejecting TCP connection from %s (connection limit reached)", conn.RemoteAddr())
			conn.Close()
			continue
		}
		go func(c net.Conn) {
			defer tcpConnLimiter.Release()
			handleTCPConnection(c)
		}(conn)
	}
}

// StopHEPServer gracefully stops the HEP server.
// Closes UDP/TCP listeners and flushes batch writers.
func StopHEPServer() {
	if hepUDPConn != nil {
		hepUDPConn.Close()
		log.Println("HEP UDP listener closed")
	}
	if hepTCPListener != nil {
		hepTCPListener.Close()
		log.Println("HEP TCP listener closed")
	}
	if clickhouse.GlobalCallEventWriter != nil {
		clickhouse.GlobalCallEventWriter.Stop()
		log.Println("Call event batch writer flushed")
	}
	if clickhouse.GlobalSipMessageWriter != nil {
		clickhouse.GlobalSipMessageWriter.Stop()
		log.Println("SIP message batch writer flushed")
	}
	// HEP-4: Flush RTCP batch writer (was missing)
	if clickhouse.GlobalRTCPWriter != nil {
		clickhouse.GlobalRTCPWriter.Stop()
		log.Println("RTCP batch writer flushed")
	}
}

// handleTCPConnection reads HEP streams from a TCP connection.
// Uses the configured idle timeout (default 60s) to prevent resource leaks.
func handleTCPConnection(conn net.Conn) {
	idleTimeout := config.Global.GetDuration("hep.tcp_idle_timeout")
	if idleTimeout <= 0 {
		idleTimeout = 60 * time.Second
	}
	handleTCPConnectionWithTimeout(conn, idleTimeout)
}

// handleTCPConnectionWithTimeout reads HEP streams from a TCP connection
// with a configurable idle timeout. Connections are closed if no data is
// received within the timeout period.
func handleTCPConnectionWithTimeout(conn net.Conn, idleTimeout time.Duration) {
	defer conn.Close()
	defer func() {
		if r := recover(); r != nil {
			metrics.HEPPanics.Inc()
			log.Printf("[PANIC] handleTCPConnection recovered: %v", r)
		}
	}()
	reader := bufio.NewReader(conn)
	// HEP-1: Use global semaphore instead of per-connection.
	// Per-connection semaphore allowed N×5000 total goroutines across N TCP connections.

	// log.Printf("New TCP connection from %s", conn.RemoteAddr())

	// Check for Proxy Protocol (v1/v2) Header once at start
	// Only peek to avoid consuming if not present
	// Set initial deadline for proxy header detection
	conn.SetReadDeadline(timeutil.Now().Add(idleTimeout))
	headerPeek, err := reader.Peek(12)
	if err == nil {
		// Proxy Protocol v2 Signature: \x0D\x0A\x0D\x0A\x00\x0D\x0A\x51\x55\x49\x54\x0A
		v2Sig := []byte{0x0D, 0x0A, 0x0D, 0x0A, 0x00, 0x0D, 0x0A, 0x51, 0x55, 0x49, 0x54, 0x0A}

		if string(headerPeek) == string(v2Sig) {
			// log.Printf("Detected Proxy Protocol v2 header from %s", conn.RemoteAddr())
			// Read signature (12 bytes)
			reader.Discard(12)
			// Read version/command (1 byte)
			if _, err := reader.ReadByte(); err != nil {
				return
			}
			// Read family/transport (1 byte)
			if _, err := reader.ReadByte(); err != nil {
				return
			}
			// Read length (2 bytes)
			lenBuf := make([]byte, 2)
			if _, err := io.ReadFull(reader, lenBuf); err != nil {
				return
			}
			length := int(binary.BigEndian.Uint16(lenBuf))
			// Skip actual addresses
			if _, err := reader.Discard(length); err != nil {
				return
			}
		} else if string(headerPeek[:5]) == "PROXY" {
			// log.Printf("Detected Proxy Protocol v1 header from %s", conn.RemoteAddr())
			// Read until newline
			if _, err := reader.ReadString('\n'); err != nil {
				return
			}
		}
	}

	for {
		// Reset deadline before each read — idle connections are closed after timeout
		conn.SetReadDeadline(timeutil.Now().Add(idleTimeout))
		hb, err := readHEPPacketPooled(reader)
		if err != nil {
			if err != io.EOF {
				// Check if it's a timeout error — don't log those as errors
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					return // Clean exit on idle timeout
				}
				log.Printf("Error reading HEP packet from %s: %v", conn.RemoteAddr(), err)
			}
			return
		}
		if hb == nil {
			continue // Empty payload (keepalive)
		}

		// Use WorkerPool for consistent TCP/UDP concurrency control.
		// Copy data from pooled buffer since worker processes asynchronously.
		data := make([]byte, len(hb.Data))
		copy(data, hb.Data)
		hb.Release()

		if GlobalHEPWorkerPool != nil && !GlobalHEPWorkerPool.TrySubmit(packetJob{
			data:       data,
			remoteAddr: conn.RemoteAddr(),
		}) {
			log.Printf("Dropping HEP packet from %s (worker pool full)", conn.RemoteAddr())
		}
	}
}

func handlePacket(data []byte, remoteAddr net.Addr) {
	defer func() {
		if r := recover(); r != nil {
			metrics.HEPPanics.Inc()
			log.Printf("[PANIC] handlePacket recovered: %v", r)
		}
	}()
	// Debug log
	// log.Printf("Received %d bytes from %s", len(data), remoteAddr)

	packet, err := DecodeHEP3(data)
	if err != nil {
		log.Printf("Error decoding HEP3 packet from %s: %v", remoteAddr, err)
		return
	}

	// SEC-1 fix: Auth token validation MUST happen before ANY packet processing.
	// Previously, RTP/RTCP had early returns that bypassed auth entirely.
	if shouldRejectAuth(packet) {
		log.Printf("Authentication failed for HEP packet from %s (Token Mismatch)", remoteAddr)
		return
	}

	// Handle RTP (Protocol 34 / 0x22)
	// Updated to pass SrcIP for lazy stream creation
	if packet.ProtocolType == PROTO_RTP {
		if packet.CorrelationID != "" {
			ts := timeutil.Unix(int64(packet.TimestampSec), int64(packet.TimestampUSec)*1000)
			// Also pass the whole packetData (which includes fake eth/ip headers from earlier) to enjoy SmartWritePacket zero-alloc passthrough
			rtp.GlobalSniffer.InjectRTP(packet.CorrelationID, data, packet.Payload, packet.SrcIP, packet.DstIP, int(packet.SrcPort), int(packet.DstPort), ts)
		}
		return
	}

	// Handle RTCP (Protocol 5 / 0x05)
	if packet.ProtocolType == PROTO_RTCP {
		if packet.CorrelationID != "" {
			ts := timeutil.Unix(int64(packet.TimestampSec), int64(packet.TimestampUSec)*1000)
			rtp.GlobalSniffer.InjectRTCP(packet.CorrelationID, packet.Payload, packet.SrcIP, packet.DstIP, uint16(packet.SrcPort), uint16(packet.DstPort), ts)
		}
		return
	}

	// Only process SIP packets (protocol type 0x01)
	if packet.ProtocolType != PROTO_SIP {
		log.Printf("Skipping non-SIP packet: protocol=%d", packet.ProtocolType)
		return
	}

	HandleSIPPayload(packet)
}

// HandleSIPPayload processes a SIP packet that has already been decoded into a HEPPacket.
// This is the shared pipeline used by both HEP mode and raw sniffer mode.
// It handles SIP parsing, call state management, event publishing, PCAP recording, and ClickHouse writes.
func HandleSIPPayload(packet *HEPPacket) {
	// ── Optional port filtering (e.g. PBX internal loopback) ──
	// We flag ignored ports to skip inserting them into sip_calls or call state,
	// while STILL writing them to PCAP and sip_messages for debugging.
	// V7 fix: Use O(1) lock-free atomic cache instead of Viper lookup per packet
	isIgnoredPort := false
	if portsPtr := cachedIgnorePorts.Load(); portsPtr != nil {
		portsMap := *portsPtr
		if len(portsMap) > 0 {
			srcPort := int(packet.SrcPort)
			dstPort := int(packet.DstPort)
			if portsMap[srcPort] || portsMap[dstPort] {
				isIgnoredPort = true
			}
		}
	}

	sipMsg, err := sip.ParseSIP(packet.Payload)
	if err != nil || sipMsg == nil {
		log.Printf("Error parsing SIP message: %v", err)
		return
	}

	// ── Prometheus: count SIP responses by code class ──
	if !sipMsg.IsRequest && sipMsg.StatusCode > 0 {
		codeClass := fmt.Sprintf("%dxx", sipMsg.StatusCode/100)
		metrics.SIPResponses.WithLabelValues(codeClass).Inc()
	} else if sipMsg.IsRequest {
		metrics.SIPResponses.WithLabelValues("req").Inc()
	}

	// Track SIP online status from REGISTER messages (before filtering them out)
	if isRegisterMessage(sipMsg) {
		handleRegister(sipMsg)
	}

	// Filter out REGISTER, OPTIONS, SUBSCRIBE, PUBLISH methods
	if sipMsg.Method == "REGISTER" || sipMsg.Method == "OPTIONS" || sipMsg.Method == "SUBSCRIBE" || sipMsg.Method == "PUBLISH" {
		return
	}
	if !sipMsg.IsRequest {
		cseq := sipMsg.GetCSeq()
		if strings.Contains(cseq, "REGISTER") || strings.Contains(cseq, "OPTIONS") || strings.Contains(cseq, "SUBSCRIBE") || strings.Contains(cseq, "PUBLISH") {
			return
		}
	}

	callID := sipMsg.GetCallID()
	if callID == "" {
		log.Printf("Skipping packet with no Call-ID")
		return
	}

	// [TEMP-DBG] Trace all SIP messages to diagnose missing BYE
	if sipMsg.Method == "BYE" || sipMsg.Method == "CANCEL" {
		log.Printf("[SIP-DBG] %s CallID=%s IsRequest=%v Src=%s:%d Dst=%s:%d",
			sipMsg.Method, callID, sipMsg.IsRequest, packet.SrcIP, packet.SrcPort, packet.DstIP, packet.DstPort)
	}

	// SRTP key extraction removed from handlePacket.
	// Now handled only in handleInvite (INVITE) and handleAnswer (200 OK),
	// preventing double-write race where 200 OK key could overwrite INVITE key.

	// Extract realm from From header
	fromURI := sip.ExtractURI(sipMsg.GetFrom())
	toURI := sip.ExtractURI(sipMsg.GetTo())
	realm := sip.ExtractDomain(fromURI)
	fromUser := sip.ExtractUser(fromURI)
	toUser := sip.ExtractUser(toURI)
	fromDomain := sip.ExtractDomain(fromURI)
	toDomain := sip.ExtractDomain(toURI)

	// Extract Display Names
	callerName := sip.ExtractDisplayName(sipMsg.GetFrom())
	calleeName := sip.ExtractDisplayName(sipMsg.GetTo())

	// Ensure we don't have empty names
	if callerName == "" {
		callerName = fromUser
	}
	if calleeName == "" {
		calleeName = toUser
	}

	// Calculate Timestamp
	timestamp := timeutil.Unix(int64(packet.TimestampSec), int64(packet.TimestampUSec)*1000)

	// For all messages, try to recover state from Redis/Cache
	var state map[string]interface{}
	// HEP-3: Check local cache first to reduce Redis reads
	if cached, found := localCache.Get(callID); found {
		state = cached.(map[string]interface{})
	} else {
		state, _ = redis.GetCallState(callID)
		if state != nil {
			localCache.Set(callID, state, 0) // Use default TTL
		}
	}

	if state != nil {
		// Try to recover names from state if missing from packet
		if cn, ok := state["caller_name"].(string); ok && callerName == "" {
			callerName = cn
		}
		if cn, ok := state["callee_name"].(string); ok && calleeName == "" {
			calleeName = cn
		}
	}

	// --- Optimized Session Management ---
	// Update session in memory (high performance)
	sessionExpires := DefaultSessionExpires

	// 1. Try to get from state (if available)
	if state != nil {
		if exp, ok := state["session_expires"].(float64); ok && exp > 0 {
			sessionExpires = int(exp)
		} else if exp, ok := state["session_expires"].(int); ok && exp > 0 {
			sessionExpires = exp // handle int case if unmarshaled as int
		}
	}

	// 2. Try to get from SIP header (overrides state default)
	if expires, _ := sipMsg.GetSessionExpires(); expires > 0 {
		sessionExpires = expires
	}

	// 只对 INVITE 请求才因 last_sip_error 跳过 UpdateSession
	// 非 INVITE（100/180/200）必须正常延长 session 到 300s
	skipDefaultSession := false
	if state != nil && sipMsg.Method == "INVITE" {
		if _, ok := state["last_sip_error"].(string); ok {
			skipDefaultSession = true
		}
	}
	if sipMsg.StatusCode == 401 || sipMsg.StatusCode == 407 {
		skipDefaultSession = true
	}
	// INVITE retransmit（无 answer_time）不刷新超时 — 让首次 8s 短超时生效
	// re-INVITE（有 answer_time）应正常刷新 session 到 300s
	if sipMsg.Method == "INVITE" && state != nil && !isReInvite(state) {
		skipDefaultSession = true
	}
	if !skipDefaultSession {
		se := sessionExpires
		if sipMsg.Method == "INVITE" {
			se = InviteNoReplyTimeout // 首次 INVITE: 8s 后无响应则超时
		}
		callsession.GlobalManager.UpdateSession(callID, se, timestamp)
	}
	// ------------------------------------

	// Query agent policies on INVITE (optimized with global flags)
	isInvite := sipMsg.Method == "INVITE"
	recorderExists := pcap.GetRecorder(callID) != nil
	enabled := false
	var policies *redis.AgentPolicies

	if isIgnoredPort {
		enabled = true // Force PCAP for ignored PBX ports to retain troubleshooting logs
	} else if recorderExists {
		enabled = true
	} else if isInvite {
		// Get all policies for the caller
		policies, err = redis.GetAgentPoliciesCached(fromUser)
		if err != nil {
			log.Printf("[ERROR] Failed to get policies for %s: %v", fromUser, err)
			policies = &redis.AgentPolicies{}
		}
		config.Debugf("[PCAP-DEBUG] fromUser=%s pcap=%v asr=%v", fromUser, policies.PcapEnabled, policies.AsrEnabled)

		// OR-merge: check toUser policies and merge individually
		toPolicies, toErr := redis.GetAgentPoliciesCached(toUser)
		if toErr == nil && toPolicies != nil {
			config.Debugf("[PCAP-DEBUG] toUser=%s pcap=%v asr=%v agentPolicy=%s", toUser, toPolicies.PcapEnabled, toPolicies.AsrEnabled, toPolicies.AgentAsrPolicy)
			if toPolicies.PcapEnabled {
				policies.PcapEnabled = true
			}
			if toPolicies.AsrEnabled {
				policies.AsrEnabled = true
			}
			// 呼入场景: toUser 是坐席, fromUser 是客户 (无策略)
			// 必须把坐席侧的 AgentAsrPolicy 传播到最终 policies
			if toPolicies.AgentAsrPolicy != "" && toPolicies.AgentAsrPolicy != "optional" {
				// enforced/disabled 覆盖客户侧的默认 optional
				policies.AgentAsrPolicy = toPolicies.AgentAsrPolicy
			} else if policies.AgentAsrPolicy == "" {
				policies.AgentAsrPolicy = toPolicies.AgentAsrPolicy
			}
		}

		enabled = policies.PcapEnabled
		config.Debugf("[PCAP-DEBUG] Final decision for callID=%s: pcap_enabled=%v asr_enabled=%v", callID, enabled, policies.AsrEnabled)
	}

	if enabled {
		_, err := pcap.GetOrCreateRecorder(callID, realm, timeutil.Now())
		if err != nil {
			log.Printf("[ERROR] Failed to create PCAP recorder for call %s: %v check path permissions?", callID, err)
		}
	}

	// Write to SIP Messages (All packets)
	if clickhouse.GlobalSipMessageWriter != nil {
		clickhouse.GlobalSipMessageWriter.Add(clickhouse.SipMessageRecord{
			Timestamp:  timeutil.Unix(int64(packet.TimestampSec), int64(packet.TimestampUSec)*1000),
			CallID:     callID,
			Realm:      realm,
			Method:     sipMsg.Method,
			StatusCode: int32(sipMsg.StatusCode),
			CSeq:       sipMsg.GetCSeq(),
			SrcIP:      packet.SrcIP,
			DstIP:      packet.DstIP,
			SrcPort:    uint16(packet.SrcPort),
			DstPort:    uint16(packet.DstPort),
			RawMessage: string(packet.Payload),
		})
	}

	// Handle Call State Logic
	// timestamp derived above

	// Build sipContext for handler dispatch
	ctx := &sipContext{
		packet:         packet,
		sipMsg:         sipMsg,
		callID:         callID,
		timestamp:      timestamp,
		realm:          realm,
		fromUser:       fromUser,
		toUser:         toUser,
		fromDomain:     fromDomain,
		toDomain:       toDomain,
		callerName:     callerName,
		calleeName:     calleeName,
		fromURI:        fromURI,
		toURI:          toURI,
		policies:       policies,
		state:          state,
		sessionExpires: sessionExpires,
	}

	// If the packet matches an ignored port, we only wrote it to sip_messages.
	// We DO NOT process it for call state, sip_calls, or event recording.
	// Wait to execute writePCAPPacket before returning.
	if isIgnoredPort {
		writePCAPPacket(ctx)
		return
	}

	if sipMsg.Method == "INVITE" {
		isTrueInitial := (state == nil)

		if isReInvite(state) {
			// re-INVITE: skip handleInvite (avoid overwriting call state)
			// Only process SDP for hold/resume detection + media updates
			log.Printf("[re-INVITE] CallID=%s — skipping handleInvite, processing SDP only", ctx.callID)
			handleSDP(ctx)
			// re-INVITE proves call is alive — refresh session (this path returns before skipDefaultSession block)
			callsession.GlobalManager.UpdateSession(ctx.callID, sessionExpires, ctx.timestamp)
		} else {
			// Initial INVITE: create new call state
			handleInvite(ctx)
			handleSDP(ctx)
		}
		writePCAPPacket(ctx)
		if isTrueInitial {
			publishAndRecordEvent(ctx)
		}
		return
	}

	// Check for dialog termination (BYE, CANCEL, 4xx-6xx error responses)
	if reason := checkTermination(ctx); reason != "" {
		writePCAPPacket(ctx) // Write BYE/CANCEL to PCAP before closing recorder
		handleTermination(ctx, reason)
		return
	}

	// 401/407 auth challenge: stash error code + shorten session to 33s
	// 超时后 cleanupTimeoutCall 会用 last_sip_error 升级 disconnect_reason
	if sipMsg.StatusCode == 401 || sipMsg.StatusCode == 407 {
		if ctx.state != nil {
			clonedState := make(map[string]interface{}, len(ctx.state)+1)
			for k, v := range ctx.state {
				clonedState[k] = v
			}
			clonedState["last_sip_error"] = fmt.Sprintf("%d %s", sipMsg.StatusCode, sipMsg.StatusText)
			redis.SetCallState(ctx.callID, clonedState)
			if localCache != nil {
				localCache.Set(ctx.callID, clonedState, 0)
			}
		}
		callsession.GlobalManager.ShortenSession(ctx.callID, 33, ctx.timestamp)
	}

	// Handle Answer (200 OK to INVITE)
	// re-INVITE 200 OK: 通话已接听，跳过 handleAnswer 避免覆盖 answer_time
	if sipMsg.StatusCode == 200 {
		if !isReInvite(state) {
			handleAnswer(ctx)
		}
		if cseq := sipMsg.GetCSeq(); strings.HasSuffix(cseq, "BYE") {
			callsession.GlobalManager.ClearTerminated(ctx.callID)
		}
	}

	handleSDP(ctx)
	writePCAPPacket(ctx)

	// re-INVITE 200 OK 的 CSeq 仍然是 INVITE，会被 determineEventType 映射为 call_answer
	// 已接听通话不应重复发布 call_answer 事件
	if sipMsg.StatusCode == 200 && isReInvite(state) {
		cseq := sipMsg.GetCSeq()
		if strings.HasSuffix(cseq, "INVITE") || strings.HasSuffix(cseq, "INV") {
			log.Printf("[re-INVITE] Skipping duplicate call_answer for 200 OK, CallID=%s", ctx.callID)
		} else {
			publishAndRecordEvent(ctx)
		}
	} else {
		publishAndRecordEvent(ctx)
	}
}

// checkTermination determines if a SIP message terminates the dialog.
// Returns the termination reason string, or "" if not a termination.
func checkTermination(ctx *sipContext) string {
	switch ctx.sipMsg.Method {
	case "BYE":
		return "BYE"
	case "CANCEL":
		return "CANCEL"
	}

	// Error responses (4xx-6xx) only terminate on INITIAL INVITE failure.
	// 401/407是认证挑战(auth challenge)，UAC会带凭据重发，不应终结
	if ctx.sipMsg.StatusCode < 400 || ctx.sipMsg.StatusCode >= 700 ||
		ctx.sipMsg.StatusCode == 401 || ctx.sipMsg.StatusCode == 407 {
		return ""
	}

	cseq := ctx.sipMsg.GetCSeq()
	if strings.HasSuffix(cseq, "INVITE") {
		// 487 Request Terminated 总是 CANCEL 的副产品 (RFC 3261 §15.1.2)
		// CANCEL 已独立作为终止事件处理，忽略 487 避免竞态导致状态覆盖
		if ctx.sipMsg.StatusCode == 487 {
			log.Printf("[SIP] Ignoring 487 response for %s on call %s (CANCEL already handles termination)", cseq, ctx.callID)
			return ""
		}
		// Check if call is already established (answered with 200 OK)
		isEstablished := false
		if ctx.state != nil {
			if _, hasAnswer := ctx.state["answer_time"]; hasAnswer {
				isEstablished = true
			}
		}
		if isEstablished {
			log.Printf("[SIP] Ignoring %d response for re-INVITE on established call %s (CSeq: %s)",
				ctx.sipMsg.StatusCode, ctx.callID, cseq)
			return ""
		}
		return fmt.Sprintf("%d %s", ctx.sipMsg.StatusCode, ctx.sipMsg.StatusText)
	}

	if strings.HasSuffix(cseq, "BYE") || strings.HasSuffix(cseq, "CANCEL") {
		log.Printf("[SIP] Ignoring %d response for %s on call %s", ctx.sipMsg.StatusCode, cseq, ctx.callID)
	} else {
		log.Printf("[SIP] Ignoring %d response for mid-dialog %s on call %s", ctx.sipMsg.StatusCode, cseq, ctx.callID)
	}
	return ""
}

// writePCAPPacket writes the SIP packet to the PCAP recorder if active.
func writePCAPPacket(ctx *sipContext) {
	if rec := pcap.GetRecorder(ctx.callID); rec != nil {
		srcIP := net.ParseIP(ctx.packet.SrcIP)
		dstIP := net.ParseIP(ctx.packet.DstIP)
		ts := timeutil.Unix(int64(ctx.packet.TimestampSec), int64(ctx.packet.TimestampUSec)*1000)
		rec.WritePacket(ctx.packet.Payload, srcIP, dstIP, int(ctx.packet.SrcPort), int(ctx.packet.DstPort), ts)
	}
}

// publishAndRecordEvent publishes a call event to Redis and writes to ClickHouse.
func publishAndRecordEvent(ctx *sipContext) {
	eventType := determineEventType(ctx.sipMsg)
	if eventType == "" {
		return
	}

	event := &redis.CallEvent{
		EventType:  eventType,
		CallID:     ctx.callID,
		Realm:      ctx.realm,
		CallerURI:  ctx.fromURI,
		CalleeURI:  ctx.toURI,
		Timestamp:  ctx.timestamp,
		SrcIP:      ctx.packet.SrcIP,
		DstIP:      ctx.packet.DstIP,
		Method:     ctx.sipMsg.Method,
		StatusCode: ctx.sipMsg.StatusCode,
	}

	// Support carrying over agent policies into WebSocket streams via Extra block
	if ctx.policies != nil {
		event.Extra = map[string]interface{}{
			"asr_enabled":       ctx.policies.AsrEnabled,
			"global_asr_policy": ctx.policies.GlobalAsrPolicy,
			"agent_asr_policy":  ctx.policies.AgentAsrPolicy,
		}
	}

	if redis.GlobalEventPublisher != nil {
		redis.GlobalEventPublisher.Publish(event)
	} else if err := redis.PublishCallEvent(event); err != nil {
		log.Printf("Failed to publish event: %v", err)
	}

	srcLoc, _ := geoip.Lookup(event.SrcIP)
	dstLoc, _ := geoip.Lookup(event.DstIP)

	if clickhouse.GlobalCallEventWriter != nil {
		clickhouse.GlobalCallEventWriter.Add(clickhouse.CallEventRecord{
			Timestamp:  event.Timestamp,
			CallID:     event.CallID,
			Realm:      event.Realm,
			EventType:  event.EventType,
			CallerURI:  event.CallerURI,
			CalleeURI:  event.CalleeURI,
			SrcIP:      event.SrcIP,
			DstIP:      event.DstIP,
			SrcCountry: srcLoc.Country,
			SrcCity:    srcLoc.City,
			DstCountry: dstLoc.Country,
			DstCity:    dstLoc.City,
		})
	}

	log.Printf("[%s] CallID=%s Realm=%s From=%s To=%s",
		eventType, ctx.callID, ctx.realm, ctx.fromURI, ctx.toURI)
}

// determineEventType maps SIP messages to event types
func determineEventType(msg *sip.SIPMessage) string {
	if msg.IsRequest {
		switch msg.Method {
		case "INVITE":
			return "call_create"
		case "BYE":
			return "call_hangup"
		case "CANCEL":
			return "call_hangup"
		case "REFER":
			return "transfer_start"
		}
	} else {
		// Response
		switch msg.StatusCode {
		case 180, 183:
			return "caller_ringing"
		case 200:
			// Check CSeq to determine if it's answer or hangup confirmation
			cseq := msg.GetCSeq()
			if cseq != "" && (strings.HasSuffix(cseq, "INVITE") || strings.HasSuffix(cseq, "INV")) {
				return "call_answer"
			}
		default:
			// 401/407是认证挑战，487是CANCEL副产品，均不产生hangup事件
			if msg.StatusCode >= 400 && msg.StatusCode != 401 && msg.StatusCode != 407 && msg.StatusCode != 487 {
				return "call_hangup"
			}
		}
	}
	return "" // Ignore other messages
}

// isReInvite checks if a SIP INVITE is a re-INVITE (mid-dialog) by checking
// if the call state already has an answer_time. Initial INVITEs have no state
// or no answer_time yet.
func isReInvite(state map[string]interface{}) bool {
	if state == nil {
		return false
	}
	_, hasAnswer := state["answer_time"]
	return hasAnswer
}

// localIPSet caches all local IP addresses at startup for O(1) lookup.
// Populated by InitLocalIPCache(), used by isLocalIP().
var localIPSet sync.Map

// InitLocalIPCache discovers all local IPs and caches them.
// Must be called once at startup before any SDP processing.
func InitLocalIPCache() {
	count := 0

	// Always consider these local
	localIPSet.Store("0.0.0.0", true)
	localIPSet.Store("127.0.0.1", true)
	localIPSet.Store("::1", true)
	count += 3

	// Add configured public IP
	publicIP := config.Global.GetString("sip.public_ip")
	if publicIP != "" {
		localIPSet.Store(publicIP, true)
		count++
		// Also resolve if it's a hostname
		if net.ParseIP(publicIP) == nil {
			addrs, err := net.LookupIP(publicIP)
			if err == nil {
				for _, addr := range addrs {
					localIPSet.Store(addr.String(), true)
					count++
				}
			}
		}
	}

	// Enumerate all network interfaces
	interfaces, err := net.Interfaces()
	if err != nil {
		log.Printf("[WARN] Failed to enumerate network interfaces: %v", err)
		return
	}
	for _, iface := range interfaces {
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip != nil {
				localIPSet.Store(ip.String(), true)
				count++
			}
		}
	}

	log.Printf("[CACHE] Local IP cache initialized with %d entries", count)
}

// isLocalIP checks if the given IP address belongs to any local interface.
// Uses the cached localIPSet for O(1) lookup (initialized by InitLocalIPCache).
func isLocalIP(ipStr string) (bool, error) {
	// Fast path: direct cache hit
	if _, ok := localIPSet.Load(ipStr); ok {
		return true, nil
	}

	// If input is a hostname (not a valid IP), resolve and check
	if net.ParseIP(ipStr) == nil {
		addrs, err := net.LookupIP(ipStr)
		if err != nil || len(addrs) == 0 {
			return false, fmt.Errorf("failed to resolve hostname %s: %v", ipStr, err)
		}
		for _, addr := range addrs {
			if _, ok := localIPSet.Load(addr.String()); ok {
				return true, nil
			}
		}
	}

	return false, nil
}
