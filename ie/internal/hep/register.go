package hep

import (
	"log"
	"strings"

	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/sip"
	"github.com/cxmind/ingestion-go/internal/timeutil"
)

const (
	// DefaultRegisterExpires is the default expiry (seconds) when no Expires header is present.
	DefaultRegisterExpires = 3600
)

// handleRegister processes SIP REGISTER messages to track agent online/offline status.
// Instead of directly writing to Redis, publishes a sip_register event for AS to process.
func handleRegister(sipMsg *sip.SIPMessage) {
	// Extract sipNumber (user part) from From URI
	fromURI := sip.ExtractURI(sipMsg.GetFrom())
	sipNumber := sip.ExtractUser(fromURI)
	if sipNumber == "" {
		return
	}

	// For 200 OK responses to REGISTER, also process
	// For REGISTER requests, extract Expires
	expires := sipMsg.GetExpires()

	// Default expires if not specified
	if expires < 0 {
		expires = DefaultRegisterExpires
	}

	action := "online"
	expiresAt := timeutil.Now().UTC().Unix() + int64(expires)

	if expires == 0 {
		action = "offline"
		expiresAt = 0
		log.Printf("[REGISTER] Agent %s offline (Expires=0)", sipNumber)
	} else {
		log.Printf("[REGISTER] Agent %s online (expires in %ds)", sipNumber, expires)
	}

	// Publish sip_register event — AS handles Redis ZSET maintenance
	event := &redis.CallEvent{
		EventType: "sip_register",
		CallID:    "sip_register",
		Timestamp: timeutil.Now().UTC(),
		Extra: map[string]interface{}{
			"sip_number": sipNumber,
			"action":     action,
			"expires":    expires,
			"expires_at": expiresAt,
		},
	}
	if redis.GlobalEventPublisher != nil {
		redis.GlobalEventPublisher.Publish(event)
	} else {
		if err := redis.PublishCallEvent(event); err != nil {
			log.Printf("[REGISTER] Failed to publish sip_register event for %s: %v", sipNumber, err)
		}
	}
}

// isRegisterMessage checks if a SIP message is a REGISTER request or a response to REGISTER.
func isRegisterMessage(sipMsg *sip.SIPMessage) bool {
	if sipMsg.Method == "REGISTER" {
		return true
	}
	if !sipMsg.IsRequest {
		cseq := sipMsg.GetCSeq()
		if strings.Contains(cseq, "REGISTER") {
			return true
		}
	}
	return false
}

// StartSIPOnlineCleanup is a no-op. SIP online cleanup is now handled by
// AS (AgentStatusService.startSipOnlineCleanup). Kept for API compatibility.
func StartSIPOnlineCleanup(stop <-chan struct{}) {
	log.Println("[SIP_ONLINE] Cleanup delegated to AS — IE goroutine disabled")
}
