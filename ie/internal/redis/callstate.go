package redis

import (
	"strings"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// CallStateData holds parsed call state fields.
// Replaces repeated map[string]interface{} extraction across hep and rtp packages.
type CallStateData struct {
	StartTime       time.Time
	AnswerTime      *time.Time
	CallerUser      string
	CalleeUser      string
	FromDomain      string
	ToDomain        string
	CallerIP        string
	CalleeIP        string
	CallerName      string
	CalleeName      string
	ASREnabled      bool
	ProcessingLevel int    // 0=Record Only, 1=SER, 2=ASR+SER
	AgentID         string // Derived from caller_uri (strip "sip:" prefix)
	// Signaling GeoIP (stored at INVITE time)
	SigSrcCountry     string
	SigSrcCity        string
	SigDstCountry     string
	SigDstCity        string
	SigSrcIp          string
	SigDstIp          string
	LastSipError      string
	Direction         string
	HoldStartTime     *time.Time
	TotalHoldDuration int // in milliseconds
	HoldCount         int
}

// ParseCallState extracts common fields from a Redis call state map.
// Returns a zero-value CallStateData if state is nil.
func ParseCallState(state map[string]interface{}) CallStateData {
	var data CallStateData
	if state == nil {
		return data
	}

	// Time fields
	if stStr, ok := state["start_time"].(string); ok {
		if st, err := timeutil.ParseRFC3339(stStr); err == nil {
			data.StartTime = st
		}
	}
	if atStr, ok := state["answer_time"].(string); ok {
		if at, err := timeutil.ParseRFC3339(atStr); err == nil {
			data.AnswerTime = &at
		}
	}

	// String fields
	if u, ok := state["caller_user"].(string); ok {
		data.CallerUser = u
	}
	if u, ok := state["callee_user"].(string); ok {
		data.CalleeUser = u
	}
	if d, ok := state["from_domain"].(string); ok {
		data.FromDomain = d
	}
	if d, ok := state["to_domain"].(string); ok {
		data.ToDomain = d
	}
	if ip, ok := state["caller_ip"].(string); ok {
		data.CallerIP = ip
	}
	if ip, ok := state["callee_ip"].(string); ok {
		data.CalleeIP = ip
	}
	if cn, ok := state["caller_name"].(string); ok {
		data.CallerName = cn
	}
	if cn, ok := state["callee_name"].(string); ok {
		data.CalleeName = cn
	}

	// Boolean fields
	if asr, ok := state["asr_enabled"].(bool); ok {
		data.ASREnabled = asr
	}


	// Integer/Float fields
	if pl, ok := state["processing_level"].(float64); ok {
		data.ProcessingLevel = int(pl)
	} else if pl, ok := state["processing_level"].(int); ok {
		data.ProcessingLevel = pl
	} else {
		// Default backward compatibility
		data.ProcessingLevel = 1
		if data.ASREnabled {
			data.ProcessingLevel = 2
		}
	}

	// Derived: AgentID from caller_uri
	if callerURI, ok := state["caller_uri"].(string); ok {
		if strings.HasPrefix(callerURI, "sip:") {
			data.AgentID = callerURI[4:]
		}
	}

	// Signaling GeoIP
	if v, ok := state["sig_src_country"].(string); ok {
		data.SigSrcCountry = v
	}
	if v, ok := state["sig_src_city"].(string); ok {
		data.SigSrcCity = v
	}
	if v, ok := state["sig_dst_country"].(string); ok {
		data.SigDstCountry = v
	}
	if v, ok := state["sig_dst_city"].(string); ok {
		data.SigDstCity = v
	}
	if v, ok := state["sig_src_ip"].(string); ok {
		data.SigSrcIp = v
	}
	if v, ok := state["sig_dst_ip"].(string); ok {
		data.SigDstIp = v
	}
	if v, ok := state["last_sip_error"].(string); ok {
		data.LastSipError = v
	}
	if v, ok := state["direction"].(string); ok {
		data.Direction = v
	}

	// Hold Metrics
	if hsStr, ok := state["hold_start_time"].(string); ok && hsStr != "" {
		if hs, err := timeutil.ParseRFC3339(hsStr); err == nil {
			data.HoldStartTime = &hs
		}
	}
	if thd, ok := state["total_hold_duration_ms"].(float64); ok {
		data.TotalHoldDuration = int(thd)
	} else if thd, ok := state["total_hold_duration_ms"].(int); ok {
		data.TotalHoldDuration = thd
	}
	if hc, ok := state["hold_count"].(float64); ok {
		data.HoldCount = int(hc)
	} else if hc, ok := state["hold_count"].(int); ok {
		data.HoldCount = hc
	}

	return data
}
