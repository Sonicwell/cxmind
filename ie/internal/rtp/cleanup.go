package rtp

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"log"
	"sync/atomic"
	"time"

	"github.com/cxmind/ingestion-go/internal/api"
	"github.com/cxmind/ingestion-go/internal/audio"
	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/metrics"
	"github.com/cxmind/ingestion-go/internal/pcap"
	"github.com/cxmind/ingestion-go/internal/redis"
)

// expiredStreamInfo holds metadata about an expired stream for cleanup outside lock.
type expiredStreamInfo struct {
	callID       string
	portKey      any         // Can be int (physical) or string (virtual)
	needsCleanup bool        // Only non-RTCP streams need full call cleanup
	packetStats  PacketStats // Captured before listener deletion (T3 fix)
}

// collectExpiredStreams identifies expired streams, removes them from maps,
// and returns metadata for deferred cleanup.
// ASR stream Close() calls are done asynchronously to avoid blocking monitorTimeouts.
// Uses sync.Map.Range for safe concurrent iteration — no external lock needed.
func (s *Sniffer) collectExpiredStreams(now time.Time, timeoutDuration time.Duration) []expiredStreamInfo {
	var result []expiredStreamInfo
	var streamsToClose []audio.ASRStream // Collect for async close

	// Check physical listeners
	s.listeners.Range(func(key, value any) bool {
		port := key.(int)
		stream := value.(*RTPStream)

		// Optimization (DA1): Check timeout atomically without locking first
		lastActiveNano := atomic.LoadInt64(&stream.lastActivity)
		lastActive := time.Unix(0, lastActiveNano)
		inactive := now.Sub(lastActive)

		if inactive > timeoutDuration {
			// Potential timeout, acquire lock to double-check and cleanup
			stream.mu.Lock()
			// Double check under lock
			lastActiveNano = atomic.LoadInt64(&stream.lastActivity)
			lastActive = time.Unix(0, lastActiveNano)
			inactive = now.Sub(lastActive)

			if inactive <= timeoutDuration {
				stream.mu.Unlock()
				return true
			}

			callID := stream.callID
			isRTCP := stream.isRTCP
			asrStream := stream.stream // Capture reference before deleting
			ps := stream.packetStats   // Capture stats before deletion (T3 fix)
			stream.mu.Unlock()

			log.Printf("RTP/RTCP timeout for port %d (call %s), inactive for %v", port, callID, inactive)

			// Collect ASR stream for async close (outside Range callback)
			// Bug fix (T7): previously called stream.Close() here which blocks for 2s,
			// halting all timeout monitoring.
			if asrStream != nil {
				streamsToClose = append(streamsToClose, asrStream)
			}

			// GL-1 fix: Stop jitter buffer drainLoop goroutine to prevent leak
			if stream.jitterBuf != nil {
				stream.jitterBuf.Stop()
			}
			// GL-1 fix: Flush remaining audio data to prevent data loss
			if stream.audioBatcher != nil {
				stream.audioBatcher.Flush()
			}
			// Free per-stream CGo decoder resources (Opus/G.729)
			stream.CloseDecoders()

			s.listeners.Delete(port)

			// If call was already terminated by BYE, skip full cleanup
			alreadyTerminated := callsession.GlobalManager != nil && callsession.GlobalManager.IsTerminated(callID)
			result = append(result, expiredStreamInfo{
				callID:       callID,
				portKey:      port,
				needsCleanup: !isRTCP && !alreadyTerminated,
				packetStats:  ps,
			})
		}
		return true
	})

	// Check virtual listeners
	s.virtualListeners.Range(func(key, value any) bool {
		k := key.(string)
		stream := value.(*RTPStream)

		// Optimization (DA1): Check timeout atomically without locking first
		lastActiveNano := atomic.LoadInt64(&stream.lastActivity)
		lastActive := time.Unix(0, lastActiveNano)
		inactive := now.Sub(lastActive)

		if inactive > timeoutDuration {
			// Potential timeout, acquire lock to double-check
			stream.mu.Lock()
			lastActiveNano = atomic.LoadInt64(&stream.lastActivity)
			lastActive = time.Unix(0, lastActiveNano)
			inactive = now.Sub(lastActive)

			if inactive <= timeoutDuration {
				stream.mu.Unlock()
				return true
			}

			callID := stream.callID
			isRTCP := stream.isRTCP
			asrStream := stream.stream // Capture reference before deleting
			ps := stream.packetStats   // Capture stats before deletion (T3 fix)
			stream.mu.Unlock()

			log.Printf("Virtual RTP timeout for %s (call %s), inactive for %v", k, callID, inactive)

			// Collect ASR stream for async close
			if asrStream != nil {
				streamsToClose = append(streamsToClose, asrStream)
			}

			// GL-1 fix: Stop jitter buffer drainLoop goroutine to prevent leak
			if stream.jitterBuf != nil {
				stream.jitterBuf.Stop()
			}
			// GL-1 fix: Flush remaining audio data to prevent data loss
			if stream.audioBatcher != nil {
				stream.audioBatcher.Flush()
			}

			// Free per-stream CGo decoder resources (Opus/G.729)
			stream.CloseDecoders()

			s.virtualListeners.Delete(k)

			// If call was already terminated by BYE, skip full cleanup
			alreadyTerminated := callsession.GlobalManager != nil && callsession.GlobalManager.IsTerminated(callID)
			result = append(result, expiredStreamInfo{
				callID:       callID,
				portKey:      k,
				needsCleanup: !isRTCP && !alreadyTerminated,
				packetStats:  ps,
			})
		}
		return true
	})

	// Async close all collected ASR streams (non-blocking)
	for _, asrStream := range streamsToClose {
		go func(s audio.ASRStream) {
			s.Close()
		}(asrStream)
	}

	// Clean up callIndex and callStreamRefs for expired call IDs
	// ML-1 fix: Previously only callIndex was deleted, leaking callStreamRefs entries
	seen := make(map[string]bool)
	for _, es := range result {
		if !seen[es.callID] {
			seen[es.callID] = true
			s.callIndex.Delete(es.callID)
			s.callStreamRefs.Delete(es.callID)
			metrics.ActiveCalls.Dec()
		}
	}

	return result
}

// cleanupTimeoutCall performs complete cleanup when a call times out.
// capturedStats may be non-nil when called from RTP timeout path (stats captured before listener deletion).
func (s *Sniffer) cleanupTimeoutCall(callID string, endTime time.Time, terminationReason string, capturedStats *PacketStats) {
	// Idempotent: mark as terminated to prevent late SIP messages from re-creating session.
	// GetExpiredSessions/RemoveSession already mark terminated before this function is called,
	// but we MUST NOT skip cleanup — the whole point is to write the terminal ClickHouse record.
	// BYE/CANCEL path has its own guard in handleTermination (L183), so no double-write risk.
	if callsession.GlobalManager != nil {
		callsession.GlobalManager.RemoveSession(callID)
	}

	// Close PCAP recording
	pcapPath := pcap.GetRecorderPath(callID)
	if pcapPath != "" {
		pcap.CloseRecorder(callID)
		log.Printf("Closed PCAP recording for timed-out call %s", callID)
	}

	// Optimized: Try to get state from active stream cache first
	var startTime time.Time
	var answerTime *time.Time
	var callerUser, calleeUser, fromDomain, toDomain, direction string
	var sigSrcCountry, sigSrcCity, sigDstCountry, sigDstCity, sigSrcIp, sigDstIp, codec string
	var state map[string]interface{}
	stateFromRedis := true // Track whether we have valid state to write back

	// Retrieve stream to access cached state
	// Note: Stream might be closing, but struct persists until GC
	stream, found := s.GetStreamByCallID(callID)

	if found && stream.stateLoaded {
		// Use cached values
		startTime = stream.startTime
		answerTime = stream.answerTime
		callerUser = stream.callerUser
		calleeUser = stream.calleeUser
		fromDomain = stream.fromDomain
		toDomain = stream.toDomain
		direction = stream.direction
		sigSrcCountry = stream.sigSrcCountry
		sigSrcCity = stream.sigSrcCity
		sigDstCountry = stream.sigDstCountry
		sigDstCity = stream.sigDstCity
		sigSrcIp = stream.sigSrcIp
		sigDstIp = stream.sigDstIp
		codec = stream.codec

		config.Debugf("[OPTIMIZATION] Used cached call state for timeout cleanup of %s", callID)

		// Still need a map for Redis update
		state = make(map[string]interface{})

	} else {
		// Fallback to Redis query
		var err error
		state, err = redis.GetCallState(callID)
		if err != nil || state == nil {
			log.Printf("Failed to get call state for timeout cleanup (call %s): %v — skipping Redis update to avoid overwrite", callID, err)
			// Create empty map for ClickHouse write only; mark as incomplete
			state = make(map[string]interface{})
			stateFromRedis = false
		} else {
			// Extract from map using shared parser
			data := redis.ParseCallState(state)
			startTime = data.StartTime
			answerTime = data.AnswerTime
			callerUser = data.CallerUser
			calleeUser = data.CalleeUser
			fromDomain = data.FromDomain
			toDomain = data.ToDomain
			direction = data.Direction
			sigSrcCountry = data.SigSrcCountry
			sigSrcCity = data.SigSrcCity
			sigDstCountry = data.SigDstCountry
			sigDstCity = data.SigDstCity
			sigSrcIp = data.SigSrcIp
			sigDstIp = data.SigDstIp
			if c, ok := state["codec"].(string); ok {
				codec = c
			}
		}
	}

	// Fallback to current time if start time is missing
	if startTime.IsZero() {
		timeout := config.Global.GetInt("sniffer.rtp_timeout_seconds")
		if timeout <= 0 {
			timeout = DefaultRTPTimeoutSeconds
		}
		startTime = endTime.Add(-time.Duration(timeout) * time.Second)
	}

	// Calculate duration
	duration := uint32(endTime.Sub(startTime).Seconds())

	// R5-1 fix: Clone state map before mutation to prevent concurrent modification
	// (same pattern as R4-1 handleAnswer fix)
	clonedState := make(map[string]interface{}, len(state)+3)
	for k, v := range state {
		clonedState[k] = v
	}
	clonedState["status"] = "completed"
	clonedState["end_time"] = endTime.Format(time.RFC3339Nano)
	clonedState["termination_reason"] = terminationReason

	// 401/407 stash升级: 如果 session_timeout 且有 last_sip_error，用它替换 disconnect_reason
	if lastErr, ok := state["last_sip_error"].(string); ok && lastErr != "" {
		terminationReason = lastErr
		log.Printf("[SIP] Upgraded disconnect_reason from timeout to %s for call %s", lastErr, callID)
	}

	if stateFromRedis {
		// Batch: SetCallState + SRem active_calls (1 RTT)
		// Summary generation is handled by AS via call_hangup event pipeline
		if err := redis.EndCallBatch(callID, clonedState); err != nil {
			log.Printf("Failed to end call batch for timeout (call %s): %v", callID, err)
		} else {
			config.Debugf("Updated Redis state to 'completed' for timed-out call %s", callID)
		}
	} else {
		log.Printf("Skipping Redis state update for call %s (no valid state to preserve)", callID)
	}

	// Write to ClickHouse with actual termination reason
	clickhouse.WriteSipCall(clickhouse.SipCallRecord{
		CallID:           callID,
		StartTime:        startTime,
		EndTime:          &endTime,
		AnswerTime:       answerTime,
		PcapPath:         pcapPath,
		Status:           terminationReason,
		Duration:         duration,
		Caller:           callerUser,
		Callee:           calleeUser,
		FromDomain:       fromDomain,
		ToDomain:         toDomain,
		StateVersion:     clickhouse.StateVersionTimeout,
		DisconnectReason: terminationReason,
		DisconnectParty:  "system",
		Direction:        direction,
		SigSrcCountry:    sigSrcCountry,
		SigSrcCity:       sigSrcCity,
		SigDstCountry:    sigDstCountry,
		SigDstCity:       sigDstCity,
		SigSrcIp:         sigSrcIp,
		SigDstIp:         sigDstIp,
		Codec:            codec,
	})

	log.Printf("Completed cleanup for %s (call %s, duration %ds)", terminationReason, callID, duration)

	// Publish call_hangup event so AS (WebSocket, Monitoring, Suggestion, Summary) is notified
	// This is the critical piece that was missing — without it, AS never knows timeout calls ended
	callerURI := callerUser
	if fromDomain != "" {
		callerURI = callerUser + "@" + fromDomain
	}
	calleeURI := calleeUser
	if toDomain != "" {
		calleeURI = calleeUser + "@" + toDomain
	}
	// Use pre-captured packet stats if available (T3 fix), otherwise scan listeners (session timeout path)
	var totalPacketsReceived uint64
	var totalBaseSeq, totalMaxSeq uint16
	var statsInitialized bool

	if capturedStats != nil {
		// RTP timeout path: stats pre-captured in collectExpiredStreams
		totalPacketsReceived = capturedStats.PacketsReceived
		if capturedStats.SeqInitialized {
			totalBaseSeq = capturedStats.BaseSeq
			totalMaxSeq = capturedStats.MaxSeq
			statsInitialized = true
		}
	} else {
		// Session timeout path: listeners may still exist, scan them
		s.listeners.Range(func(key, value interface{}) bool {
			st := value.(*RTPStream)
			if st.callID == callID && !st.isRTCP {
				st.mu.Lock()
				ps := st.packetStats
				st.mu.Unlock()
				totalPacketsReceived += ps.PacketsReceived
				if ps.SeqInitialized && !statsInitialized {
					totalBaseSeq = ps.BaseSeq
					totalMaxSeq = ps.MaxSeq
					statsInitialized = true
				}
			}
			return true
		})
	}

	event := &redis.CallEvent{
		EventType: "call_hangup",
		CallID:    callID,
		Realm:     fromDomain,
		CallerURI: callerURI,
		CalleeURI: calleeURI,
		Timestamp: endTime,
		Method:    terminationReason, // Reuse Method field to carry timeout reason
		Extra: map[string]interface{}{
			"rtp_packets_received": totalPacketsReceived,
			"rtp_first_seq":        totalBaseSeq,
			"rtp_max_seq":          totalMaxSeq,
		},
	}
	if redis.GlobalEventPublisher != nil {
		redis.GlobalEventPublisher.Publish(event)
		log.Printf("[call_end] Published call_hangup event for %s call %s (async)", terminationReason, callID)
	} else if err := redis.PublishCallEvent(event); err != nil {
		log.Printf("Failed to publish call_hangup event for timeout (call %s): %v", callID, err)
	} else {
		log.Printf("[call_end] Published call_hangup event for %s call %s", terminationReason, callID)
	}

	// Audit #5: Clear MonitoringCache on timeout (same as StopListenerByCallID does for BYE)
	api.GlobalMonitoringCache.ClearCall(callID)

	// Audit #2: Clear hep localCache via callback (avoids circular dependency)
	if OnCallCleanup != nil {
		OnCallCleanup(callID)
	}
}
