package hep

import (
	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/timeutil"

	"log"
	"strconv"
	"strings"
	"time"

	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/geoip"
	"github.com/cxmind/ingestion-go/internal/pcap"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/rtp"
	"github.com/cxmind/ingestion-go/internal/sip"
)

// IsServerIPFunc 由 main.go 注入，避免 hep→sniffer 循环依赖
// port 参数用于同一 IP 上多 SIP 服务的精确方向判定
var IsServerIPFunc func(ip string, port uint16) bool

// sipContext holds shared state extracted from a SIP packet,
// passed between handler functions to avoid long parameter lists.
type sipContext struct {
	packet         *HEPPacket
	sipMsg         *sip.SIPMessage
	callID         string
	timestamp      time.Time
	realm          string
	fromUser       string
	toUser         string
	fromDomain     string
	toDomain       string
	callerName     string
	calleeName     string
	fromURI        string
	toURI          string
	policies       *redis.AgentPolicies
	state          map[string]interface{} // Cached call state from Redis (may be nil)
	sessionExpires int                    // Negotiated Session-Expires value
}

// handleInvite processes an INVITE request: creates call state in Redis and ClickHouse.
func handleInvite(ctx *sipContext) {
	// Determine processing level (0=Record Only, 1=SER, 2=ASR+SER)
	processingLevel := config.Global.GetInt("processing.default_level")
	if redis.Client != nil {
		ctxVal := redis.Ctx()
		// Check caller level
		if val, err := redis.Client.Get(ctxVal, "asr:level:"+ctx.fromUser).Int(); err == nil && val > processingLevel {
			processingLevel = val
		}
		// Check callee level
		if val, err := redis.Client.Get(ctxVal, "asr:level:"+ctx.toUser).Int(); err == nil && val > processingLevel {
			processingLevel = val
		}
	}

	callState := map[string]interface{}{
		"start_time": ctx.timestamp.Format(time.RFC3339Nano),

		"caller_user":      ctx.fromUser,
		"callee_user":      ctx.toUser,
		"from_domain":      ctx.fromDomain,
		"to_domain":        ctx.toDomain,
		"caller_name":      ctx.callerName,
		"callee_name":      ctx.calleeName,
		"caller_ip":        ctx.packet.SrcIP,
		"callee_ip":        ctx.packet.DstIP,
		"status":           "active",
		"caller_uri":       ctx.fromURI,
		"callee_uri":       ctx.toURI,
		"session_expires":  ctx.sessionExpires, // Negotiated value from SIP header
		"processing_level": processingLevel,    // 0, 1, or 2
	}

	// 将 AgentPolicies 与 processingLevel 打通：
	// policy 层 AsrEnabled=true 时，确保 processingLevel 提升到 2 以实际创建 ASR stream
	if ctx.policies != nil {
		if ctx.policies.AsrEnabled && processingLevel < 2 {
			processingLevel = 2
			callState["processing_level"] = processingLevel
		}

		callState["pcap_enabled"] = ctx.policies.PcapEnabled
		callState["asr_enabled"] = ctx.policies.AsrEnabled
		callState["global_asr_policy"] = ctx.policies.GlobalAsrPolicy
		callState["agent_asr_policy"] = ctx.policies.AgentAsrPolicy
	} else if ctx.state != nil {
		// B-leg INVITE (policies 未重新查询)，必须从 A-leg state 中继承策略和降级级别，否则会被冲掉
		if v, ok := ctx.state["pcap_enabled"]; ok {
			callState["pcap_enabled"] = v
		}
		if v, ok := ctx.state["asr_enabled"]; ok {
			callState["asr_enabled"] = v
			// 如果 A-leg 是 ASR enabled，确保 level 为 2
			if asr, isBool := v.(bool); isBool && asr && processingLevel < 2 {
				processingLevel = 2
				callState["processing_level"] = processingLevel
			} else if asrStr, isStr := v.(string); isStr && asrStr == "true" && processingLevel < 2 {
				processingLevel = 2
				callState["processing_level"] = processingLevel
			}
		}
		if v, ok := ctx.state["global_asr_policy"]; ok {
			callState["global_asr_policy"] = v
		}
		if v, ok := ctx.state["agent_asr_policy"]; ok {
			callState["agent_asr_policy"] = v
		}
		if v, ok := ctx.state["processing_level"]; ok {
			// A-leg 可能通过其它方式提升了 level，合并最大的 level
			var aLegLevel int
			if lf, ok := v.(float64); ok {
				aLegLevel = int(lf)
			} else if li, ok := v.(int); ok {
				aLegLevel = li
			}
			if aLegLevel > processingLevel {
				processingLevel = aLegLevel
				callState["processing_level"] = processingLevel
			}
		}
	}

	// Signaling GeoIP lookup (SIP INVITE src/dst IPs)
	var sigSrcCountry, sigSrcCity, sigDstCountry, sigDstCity string
	if srcLoc, err := geoip.Lookup(ctx.packet.SrcIP); err == nil && srcLoc != nil {
		sigSrcCountry = srcLoc.Country
		sigSrcCity = srcLoc.City
	}
	if dstLoc, err := geoip.Lookup(ctx.packet.DstIP); err == nil && dstLoc != nil {
		sigDstCountry = dstLoc.Country
		sigDstCity = dstLoc.City
	}

	// Store GeoIP in callState for downstream use (BYE/timeout)
	callState["sig_src_country"] = sigSrcCountry
	callState["sig_src_city"] = sigSrcCity
	callState["sig_dst_country"] = sigDstCountry
	callState["sig_dst_city"] = sigDstCity
	callState["sig_src_ip"] = ctx.packet.SrcIP
	callState["sig_dst_ip"] = ctx.packet.DstIP

	direction := determineLegDirection(ctx.packet.SrcIP, uint16(ctx.packet.SrcPort), ctx.packet.DstIP, uint16(ctx.packet.DstPort))

	// B2BUA/Proxy 场景：同一 Call-ID 会收到两个 INVITE（A-leg + B-leg）
	// 第一个 INVITE 决定方向，后续 INVITE 不覆盖
	// PROTO-A: 直接复用 ctx.state (HandleSIPPayload 已从 localCache/Redis 获取)，省 1 RTT
	if ctx.state != nil {
		if existingDir, ok := ctx.state["direction"].(string); ok && existingDir != "" && existingDir != "unknown" {
			log.Printf("[INVITE] CallID=%s keeping existing direction=%s (B-leg direction=%s ignored)", ctx.callID, existingDir, direction)
			direction = existingDir
		}
	}

	// Add direction to call state to carry over to Answer/Termination
	callState["direction"] = direction
	redis.SetCallState(ctx.callID, callState)

	// Write initial sip_calls record with signaling GeoIP
	clickhouse.WriteSipCall(clickhouse.SipCallRecord{
		StartTime:     ctx.timestamp,
		CallID:        ctx.callID,
		Caller:        ctx.fromUser,
		Callee:        ctx.toUser,
		FromDomain:    ctx.fromDomain,
		ToDomain:      ctx.toDomain,
		PcapPath:      pcap.GetRecorderPath(ctx.callID),
		Status:        "active",
		SigSrcCountry: sigSrcCountry,
		SigSrcCity:    sigSrcCity,
		SigDstCountry: sigDstCountry,
		SigDstCity:    sigDstCity,
		SigSrcIp:      ctx.packet.SrcIP,
		SigDstIp:      ctx.packet.DstIP,
		StateVersion:  clickhouse.StateVersionInvite,
		Direction:     direction,
	})

	// Extract and store SRTP Key if present
	if key := ctx.sipMsg.ExtractCrypto(); key != "" {
		if err := redis.SetSRTPKey(ctx.callID, key); err != nil {
			log.Printf("Failed to store SRTP key for call %s: %v", ctx.callID, err)
		}
	}
}

// determineLegDirection determines the direction of the call (inbound/outbound)
// based on whether the source or destination IP:port matches the configured system IP(s).
func determineLegDirection(srcIP string, srcPort uint16, dstIP string, dstPort uint16) string {
	if IsServerIPFunc == nil {
		config.Debugf("[DEBUG] determineLegDirection: IsServerIPFunc is nil for srcIP=%s, dstIP=%s", srcIP, dstIP)
		return "unknown"
	}

	srcMatch := IsServerIPFunc(srcIP, srcPort)
	dstMatch := IsServerIPFunc(dstIP, dstPort)
	config.Debugf("[DEBUG] determineLegDirection: srcIP=%s:%d (match=%v), dstIP=%s:%d (match=%v)", srcIP, srcPort, srcMatch, dstIP, dstPort, dstMatch)

	if dstMatch {
		return "inbound"
	}
	if srcMatch {
		return "outbound"
	}
	return "unknown"
}

// handleTermination processes BYE, CANCEL, and error responses (4xx/5xx/6xx).
func handleTermination(ctx *sipContext, terminationReason string) {
	// Guard: prevent duplicate processing when both BYE and session timeout fire concurrently.
	// RemoveSession marks the call as terminated, so a second handleTermination call will exit early.
	if callsession.GlobalManager.IsTerminated(ctx.callID) {
		log.Printf("[call_end] CallID=%s Reason=%s — skipped (already terminated)", ctx.callID, terminationReason)
		return
	}

	log.Printf("[call_end] CallID=%s Reason=%s", ctx.callID, terminationReason)
	rtp.GlobalSniffer.StopListenerByCallID(ctx.callID)

	// Cleanup Session from Memory & Redis
	callsession.GlobalManager.RemoveSession(ctx.callID)
	localCache.Delete(ctx.callID) // Prevent stale cache reads for late packets

	// Delay PCAP close by 4s to capture trailing 200 OK to BYE
	// RES-A: time.AfterFunc 由 runtime timer heap 统一管理，
	// 比 goroutine+sleep 节省 ~96% 内存 (80B vs 2-4KB per entry)
	pcapPath := pcap.GetRecorderPath(ctx.callID)
	if pcapPath != "" {
		callID := ctx.callID
		time.AfterFunc(4*time.Second, func() {
			pcap.CloseRecorder(callID)
		})
	}

	// Use state already fetched by handlePacket (eliminates redundant Redis Get)
	state := ctx.state
	data := redis.ParseCallState(state)

	startTime := data.StartTime
	answerTime := data.AnswerTime
	callerUser := data.CallerUser
	calleeUser := data.CalleeUser
	fromDom := data.FromDomain
	toDom := data.ToDomain

	if startTime.IsZero() {
		startTime = ctx.timestamp // fallback
	}
	if callerUser == "" {
		callerUser = ctx.fromUser
	}
	if calleeUser == "" {
		calleeUser = ctx.toUser
	}
	if fromDom == "" {
		fromDom = ctx.fromDomain
	}
	if toDom == "" {
		toDom = ctx.toDomain
	}

	// Calculate Duration
	duration := uint32(ctx.timestamp.Sub(startTime).Seconds())

	// Calculate Final Hold Metrics
	holdDurationMs := uint32(data.TotalHoldDuration)
	holdCount := uint32(data.HoldCount)
	var endedOnHold uint8 = 0

	if data.HoldStartTime != nil && !data.HoldStartTime.IsZero() {
		// Call ended while still on hold!
		endedOnHold = 1
		durationMs := int(ctx.timestamp.Sub(*data.HoldStartTime).Milliseconds())
		if durationMs > 0 {
			holdDurationMs += uint32(durationMs)
		}
	}

	// Update Redis state to ended (batched)
	if state != nil {
		// CS-3 fix: Clone state map to avoid mutating shared localCache reference.
		// Same pattern as R4-1 fix in handleAnswer.
		clonedState := make(map[string]interface{}, len(state)+2)
		for k, v := range state {
			clonedState[k] = v
		}
		clonedState["end_time"] = ctx.timestamp.Format(time.RFC3339Nano)

		// Batch: SetCallState + SRem active_calls (1 RTT)
		// Summary generation is handled by AS via call_hangup event pipeline
		if err := redis.EndCallBatch(ctx.callID, clonedState); err != nil {
			log.Printf("[ERROR] Failed to end call batch for %s: %v", ctx.callID, err)
		}
	}

	// Read signaling GeoIP and direction from callState (stored at INVITE time)
	sigSrcCountry := data.SigSrcCountry
	sigSrcCity := data.SigSrcCity
	sigDstCountry := data.SigDstCountry
	sigDstCity := data.SigDstCity
	dirStr := data.Direction

	// Publish call_hangup event for UI/Extension
	hangupEvent := &redis.CallEvent{
		EventType:  "call_hangup",
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
	if redis.GlobalEventPublisher != nil {
		redis.GlobalEventPublisher.Publish(hangupEvent)
	} else {
		if err := redis.PublishCallEvent(hangupEvent); err != nil {
			log.Printf("Failed to publish hangup event: %v", err)
		}
	}

	// Write BYE to call_events table
	if clickhouse.GlobalCallEventWriter != nil {
		clickhouse.GlobalCallEventWriter.Add(clickhouse.CallEventRecord{
			Timestamp:  hangupEvent.Timestamp,
			CallID:     hangupEvent.CallID,
			Realm:      hangupEvent.Realm,
			EventType:  hangupEvent.EventType,
			CallerURI:  hangupEvent.CallerURI,
			CalleeURI:  hangupEvent.CalleeURI,
			SrcIP:      hangupEvent.SrcIP,
			DstIP:      hangupEvent.DstIP,
			SrcCountry: sigSrcCountry,
			SrcCity:    sigSrcCity,
			DstCountry: sigDstCountry,
			DstCity:    sigDstCity,
		})
	}

	disconnectParty := determineDisconnectParty(terminationReason, ctx.fromUser, callerUser, calleeUser)

	// BYE/CANCEL → completed; 4xx/5xx → show error reason
	callStatus := "completed"
	if terminationReason != "BYE" && terminationReason != "CANCEL" {
		callStatus = terminationReason
	}

	// Log completion to sip_calls with GeoIP
	clickhouse.WriteSipCall(clickhouse.SipCallRecord{
		CallID:           ctx.callID,
		StartTime:        startTime,
		EndTime:          &ctx.timestamp,
		AnswerTime:       answerTime,
		PcapPath:         pcapPath,
		Status:           callStatus,
		Duration:         duration,
		Caller:           callerUser,
		Callee:           calleeUser,
		FromDomain:       fromDom,
		ToDomain:         toDom,
		SigSrcCountry:    sigSrcCountry,
		SigSrcCity:       sigSrcCity,
		SigDstCountry:    sigDstCountry,
		SigDstCity:       sigDstCity,
		SigSrcIp:         data.SigSrcIp,
		SigDstIp:         data.SigDstIp,
		Direction:        dirStr,
		StateVersion:     clickhouse.StateVersionTermination,
		DisconnectReason: terminationReason,
		DisconnectParty:  disconnectParty,
		HoldDuration:     holdDurationMs / 1000, // Convert to seconds for ClickHouse
		HoldCount:        holdCount,
		EndedOnHold:      endedOnHold,
	})
}

// handleAnswer processes a 200 OK response to an INVITE.
func handleAnswer(ctx *sipContext) {
	cseq := ctx.sipMsg.GetCSeq()
	if cseq == "" || (!strings.HasSuffix(cseq, "INVITE") && !strings.HasSuffix(cseq, "INV")) {
		return
	}

	log.Printf("[call_answer] CallID=%s", ctx.callID)

	// R4-1 fix: Clone state map to avoid mutating shared localCache reference.
	// Without this, concurrent 200 OK and re-INVITE for the same call could race.
	state := ctx.state
	if state == nil {
		state, _ = redis.GetCallState(ctx.callID)
	}

	clonedState := make(map[string]interface{}, len(state)+3)
	for k, v := range state {
		clonedState[k] = v
	}
	clonedState["answer_time"] = ctx.timestamp.Format(time.RFC3339Nano)
	clonedState["callee_ip"] = ctx.packet.SrcIP
	clonedState["status"] = "answered"

	// RFC 3264: extract final negotiated codec from 200 OK SDP Answer
	if codec := ctx.sipMsg.ExtractCodec(); codec != "" {
		clonedState["codec"] = codec
		config.Debugf("[call_answer] Negotiated codec for call %s: %s", ctx.callID, codec)
	}

	redis.SetCallState(ctx.callID, clonedState)

	// Sync localCache so BYE handler sees answer_time (prevents NULL answer_time in ClickHouse)
	if localCache != nil {
		localCache.Set(ctx.callID, clonedState, 0)
	}

	// Extract and store dynamic payload type mapping from SDP
	ptMap := ctx.sipMsg.ExtractPTMap()
	if len(ptMap) > 0 {
		if stream, found := rtp.GlobalSniffer.GetStreamByCallID(ctx.callID); found {
			stream.UpdatePTMap(ptMap)
			config.Debugf("Injected dynamic PT map into stream %s (200 OK): %v", ctx.callID, ptMap)
		}
	}

	// Extract and store SRTP Key if present (from Callee)
	if key := ctx.sipMsg.ExtractCrypto(); key != "" {
		if err := redis.SetSRTPKey(ctx.callID, key); err != nil {
			log.Printf("Failed to store SRTP key for call %s (200 OK): %v", ctx.callID, err)
		} else {
			config.Debugf("Stored SRTP key for call %s (200 OK)", ctx.callID)
		}
	}

	// Parse state using shared parser
	// R5-1 fix: use clonedState instead of state so we parse the newly added fields
	// (answer_time, callee_ip, status, codec) which are needed for the ClickHouse write below
	data := redis.ParseCallState(clonedState)
	startTime := data.StartTime
	if startTime.IsZero() {
		startTime = ctx.timestamp
	}

	// Fallback: if Redis state doesn't have caller/callee, use SIP packet values
	// (Same guard as handleTermination — prevents empty values overwriting INVITE record)
	callerUser := data.CallerUser
	calleeUser := data.CalleeUser
	fromDom := data.FromDomain
	toDom := data.ToDomain
	if callerUser == "" {
		callerUser = ctx.fromUser
	}
	if calleeUser == "" {
		calleeUser = ctx.toUser
	}
	if fromDom == "" {
		fromDom = ctx.fromDomain
	}
	if toDom == "" {
		toDom = ctx.toDomain
	}

	dirStr := data.Direction

	// Write to sip_calls
	clickhouse.WriteSipCall(clickhouse.SipCallRecord{
		CallID:       ctx.callID,
		StartTime:    startTime,
		AnswerTime:   &ctx.timestamp,
		Status:       "answered",
		Caller:       callerUser,
		Callee:       calleeUser,
		FromDomain:   fromDom,
		ToDomain:     toDom,
		Direction:    dirStr,
		StateVersion: clickhouse.StateVersionAnswer,
	})
}

// handleSDP parses SDP body to extract RTP port and sets up listeners.
func handleSDP(ctx *sipContext) {
	contentType := ctx.sipMsg.GetHeader("content-type")
	// R-4: Use HasPrefix to accept "application/sdp; charset=utf-8" etc.
	if !strings.HasPrefix(contentType, "application/sdp") || ctx.sipMsg.Body == "" {
		return
	}

	body := ctx.sipMsg.Body
	lines := strings.Split(body, "\n")
	var port int
	var connIP string

	// FN-2 fix: Track session-level vs media-level c= separately.
	// Media-level c= (after m=audio) takes precedence per RFC 4566.
	var sessionConnIP string
	var mediaConnIP string
	inAudioSection := false

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "m=audio ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				p, err := strconv.Atoi(parts[1])
				if err == nil {
					port = p
				}
			}
			inAudioSection = true
		} else if strings.HasPrefix(line, "m=") {
			// Another media section (e.g. m=video) — stop capturing c= for audio
			inAudioSection = false
		} else if strings.HasPrefix(line, "c=") {
			parts := strings.Split(line, " ")
			if len(parts) >= 3 {
				if inAudioSection {
					mediaConnIP = parts[2]
				} else if !inAudioSection && port == 0 {
					// Session-level c= (before any m= line)
					sessionConnIP = parts[2]
				}
			}
		}
	}

	// Media-level c= takes precedence over session-level
	if mediaConnIP != "" {
		connIP = mediaConnIP
	} else {
		connIP = sessionConnIP
	}

	if port == 0 {
		return
	}

	// Verify if Connection IP is Local
	isLocal, err := isLocalIP(connIP)
	if err != nil {
		log.Printf("Error checking local IP: %v", err)
	}

	// ── Hold/Resume detection from SDP direction ──
	// This MUST be done regardless of whether the media is local or remote!
	// Only for re-INVITE (call already has answer_time in state)
	if ctx.state != nil {
		if _, hasAnswer := ctx.state["answer_time"]; hasAnswer {
			dir := extractMediaDirection(body)

			// Hold Time Tracking implementation
			if dir == "sendonly" || dir == "inactive" {
				publishHoldResumeEvent(ctx, "call_hold", dir)

				// Record Hold Start Time
				holdStartStr, _ := ctx.state["hold_start_time"].(string)
				if holdStartStr == "" {
					clonedState := make(map[string]interface{}, len(ctx.state)+1)
					for k, v := range ctx.state {
						clonedState[k] = v
					}

					// Timestamp the hold start
					clonedState["hold_start_time"] = ctx.timestamp.Format(time.RFC3339Nano)

					// Increment hold_count here
					count := 0
					if prev, ok := ctx.state["hold_count"].(float64); ok {
						count = int(prev)
					}
					if prev, ok := ctx.state["hold_count"].(int); ok {
						count = prev
					}
					clonedState["hold_count"] = count + 1

					redis.SetCallState(ctx.callID, clonedState)

					// Update context state for next operations
					ctx.state = clonedState
					if localCache != nil {
						localCache.Set(ctx.callID, clonedState, 0)
					}
				}

			} else if dir == "sendrecv" {
				// 只有存在活跃的 hold 状态时才触发 resume，
				// 否则就是普通 re-INVITE（codec重协商/session-timer刷新）不应产生事件
				if holdStartStr, hasHold := ctx.state["hold_start_time"].(string); hasHold && holdStartStr != "" {
					publishHoldResumeEvent(ctx, "call_resume", dir)
					if holdStart, err := timeutil.ParseRFC3339(holdStartStr); err == nil {
						durationMs := int(ctx.timestamp.Sub(holdStart).Milliseconds())
						if durationMs < 0 {
							durationMs = 0
						} // defensive

						clonedState := make(map[string]interface{}, len(ctx.state)+2)
						for k, v := range ctx.state {
							clonedState[k] = v
						}

						// Accumulate total duration
						totalMs := 0
						if prev, ok := ctx.state["total_hold_duration_ms"].(float64); ok {
							totalMs = int(prev)
						}
						if prev, ok := ctx.state["total_hold_duration_ms"].(int); ok {
							totalMs = prev
						}

						clonedState["total_hold_duration_ms"] = totalMs + durationMs

						// Clear active hold
						clonedState["hold_start_time"] = ""

						redis.SetCallState(ctx.callID, clonedState)

						// Update context state
						ctx.state = clonedState
						if localCache != nil {
							localCache.Set(ctx.callID, clonedState, 0)
						}
					}
				}
			}
		}
	}

	if !isLocal {
		// 远端流，等待外部 InjectRTP
		return
	}

	// Local Stream
	speakerName := "unknown"
	if ctx.sipMsg.Method == "INVITE" {
		speakerName = ctx.calleeName
	} else if ctx.sipMsg.StatusCode == 200 || ctx.sipMsg.StatusCode == 183 {
		speakerName = ctx.callerName
	}

	if speakerName == "" {
		if ctx.sipMsg.Method == "INVITE" {
			speakerName = "callee"
		} else {
			speakerName = "caller"
		}
	}

	// rtcp-mux
	rtcpMux := strings.Contains(body, "a=rtcp-mux")

	config.Debugf("Found Local RTP port %d in SDP (CallID: %s, IP: %s, Speaker: %s)", port, ctx.callID, connIP, speakerName)

	// 断路保护：如果禁止本地 RTP PCAP 抓取，只注册 Virtual Listener 等待外部注入
	if !config.Global.GetBool("sniffer.rtp_pcap_enabled") {
		log.Printf("[SDP] Local IP detected but rtp_pcap disabled, registering virtual listener for call %s", ctx.callID)
		rtp.GlobalSniffer.StartVirtualListener(ctx.callID, connIP)
	} else {
		// 在本机网卡抓取
		if ctx.sipMsg.Method == "INVITE" {
			config.Debugf("[pre_asr] Pre-creating ASR stream for CallID=%s Port=%d", ctx.callID, port)
			if err := rtp.GlobalSniffer.StartListenerWithPreConnect(port, ctx.callID, speakerName); err != nil {
				log.Printf("Failed to pre-create ASR stream: %v", err)
			}
		} else {
			if err := rtp.GlobalSniffer.StartListener(port, ctx.callID, speakerName); err != nil {
				log.Printf("Failed to start RTP listener: %v", err)
			}
		}

		// RTCP Listener if not muxed
		if !rtcpMux {
			if err := rtp.GlobalSniffer.StartRTCPListener(port+1, ctx.callID); err != nil {
				log.Printf("Failed to start RTCP listener: %v", err)
			}
		}
	}
}

// extractMediaDirection parses SDP body to find the media direction attribute
// within the audio media section. Returns "sendrecv", "sendonly", "recvonly",
// "inactive", or "" if not found.
func extractMediaDirection(sdpBody string) string {
	lines := strings.Split(sdpBody, "\n")
	inAudioSection := false
	var sessionDir, mediaDir string

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "m=audio ") {
			inAudioSection = true
		} else if strings.HasPrefix(line, "m=") {
			inAudioSection = false
		}

		if line == "a=sendonly" || line == "a=recvonly" || line == "a=inactive" || line == "a=sendrecv" {
			dir := strings.TrimPrefix(line, "a=")
			if inAudioSection {
				mediaDir = dir
			} else if sessionDir == "" {
				sessionDir = dir
			}
		}
	}

	// Media-level direction takes precedence over session-level
	if mediaDir != "" {
		return mediaDir
	}
	return sessionDir
}

// publishHoldResumeEvent publishes a call_hold or call_resume event.
func publishHoldResumeEvent(ctx *sipContext, eventType string, sdpDirection string) {
	log.Printf("[%s] CallID=%s Direction=%s", eventType, ctx.callID, sdpDirection)

	event := &redis.CallEvent{
		EventType: eventType,
		CallID:    ctx.callID,
		Realm:     ctx.realm,
		CallerURI: ctx.fromURI,
		CalleeURI: ctx.toURI,
		Timestamp: ctx.timestamp,
		SrcIP:     ctx.packet.SrcIP,
		DstIP:     ctx.packet.DstIP,
		Method:    ctx.sipMsg.Method,
		Extra: map[string]interface{}{
			"sdp_direction": sdpDirection,
		},
	}
	if redis.GlobalEventPublisher != nil {
		redis.GlobalEventPublisher.Publish(event)
	} else {
		if err := redis.PublishCallEvent(event); err != nil {
			log.Printf("Failed to publish %s event: %v", eventType, err)
		}
	}

	// 2. Persist to ClickHouse (GeoIP enriched)
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
}

// determineDisconnectParty identifies who initiated the hangup.
// BYE: compare sender (fromUser) with original caller/callee
// CANCEL: always caller (RFC 3261 §9.1 — only INVITE sender can CANCEL)
// 4xx-6xx error: callee (rejection = callee side behavior)
func determineDisconnectParty(reason, fromUser, callerUser, calleeUser string) string {
	switch {
	case reason == "BYE":
		if fromUser == callerUser {
			return "caller"
		} else if fromUser == calleeUser {
			return "callee"
		}
		return "" // Can't determine (From mismatch)
	case reason == "CANCEL":
		return "caller"
	default:
		// 4xx/5xx/6xx error responses
		return "callee"
	}
}
