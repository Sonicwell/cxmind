package rtp

import (
	"encoding/base64"
	"log"
	"time"

	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/geoip"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/pion/rtcp"
)

// QualityMetric represents a calculated quality metric
type QualityMetric struct {
	Timestamp      time.Time `json:"timestamp"`
	CallID         string    `json:"call_id"`
	StreamID       string    `json:"stream_id"`
	Direction      string    `json:"direction"` // "caller", "callee", or "unknown"
	MOS            float32   `json:"mos"`
	Jitter         float32   `json:"jitter"`       // In milliseconds
	PacketLossRate float32   `json:"packet_loss"`  // 0.0 to 1.0
	RTT            float32   `json:"rtt"`          // In milliseconds
	PacketsLost    int32     `json:"packets_lost"` // Cumulative
	PacketsSent    uint32    `json:"packets_sent"` // From SR
	OctetsSent     uint32    `json:"octets_sent"`  // From SR
	ReportType     string    `json:"report_type"`  // SR or RR
	SourceSSRC     uint32    `json:"source_ssrc"`
	FractionLost   uint8     `json:"fraction_lost"` // From RR
	RawMessage     string    `json:"raw_message"`
	SrcIP          string    `json:"src_ip"`
	DstIP          string    `json:"dst_ip"`
	SrcPort        uint16    `json:"src_port"`
	DstPort        uint16    `json:"dst_port"`
	// GeoIP (populated at saveMetric time)
	SrcCountry string `json:"src_country,omitempty"`
	SrcCity    string `json:"src_city,omitempty"`
	DstCountry string `json:"dst_country,omitempty"`
	DstCity    string `json:"dst_city,omitempty"`
}

// DetermineDirection determines whether an RTCP report is from the caller or callee
// by comparing the source IP of the RTCP packet against known caller/callee IPs.
func DetermineDirection(srcIP, callerIP, calleeIP string) string {
	if callerIP != "" && srcIP == callerIP {
		return "caller"
	}
	if calleeIP != "" && srcIP == calleeIP {
		return "callee"
	}
	return "unknown"
}

// MakeStreamID creates a unique stream identifier from callID and source IP.
// This distinguishes the two RTP streams within a single call.
func MakeStreamID(callID, srcIP string) string {
	return callID + ":" + srcIP
}

// EstimateRTT estimates round-trip time using passive SR/RR correlation.
// In a passive sniffer we observe both SRs and RRs transiting the network.
// When an RR references an SR we previously observed (LSR == lastSRNTP),
// we can compute: RTT = (now - timeWeObservedSR) - DLSR.
// Falls back to DLSR (converted to ms) when no SR correlation is available.
func EstimateRTT(lsr uint32, dlsr uint32, lastSRNTP uint32, lastSRTime time.Time) float32 {
	if lsr == 0 {
		return 0 // No SR reference, no RTT
	}

	dlsrMs := float64(dlsr) / 65536.0 * 1000 // Convert DLSR from 1/65536s to ms

	// Passive correlation: if the RR references the SR we captured
	if lastSRNTP != 0 && lsr == lastSRNTP && !lastSRTime.IsZero() {
		timeSinceSR := float64(time.Since(lastSRTime).Milliseconds())
		rtt := float32(timeSinceSR - dlsrMs)
		if rtt < 0 {
			rtt = 0 // Clock skew protection
		}
		return rtt
	}

	// Fallback: DLSR alone (less accurate but still useful)
	return float32(dlsrMs)
}

// processRTCP parses an RTCP packet and updates metrics
func (s *Sniffer) processRTCP(packetData []byte, stream *RTPStream, srcIP, dstIP string, srcPort, dstPort uint16) {
	packets, err := rtcp.Unmarshal(packetData)
	if err != nil {
		// RTCP packets can be compound, but if unmarshal fails, we can't do much
		return
	}

	rawMsgBase64 := base64.StdEncoding.EncodeToString(packetData)

	for _, packet := range packets {
		switch p := packet.(type) {
		case *rtcp.SenderReport:
			s.handleSenderReport(p, stream, rawMsgBase64, srcIP, dstIP, srcPort, dstPort)
		case *rtcp.ReceiverReport:
			s.handleReceiverReport(p, stream, rawMsgBase64, srcIP, dstIP, srcPort, dstPort)
		}
	}
}

func (s *Sniffer) handleSenderReport(sr *rtcp.SenderReport, stream *RTPStream, rawMsg, srcIP, dstIP string, srcPort, dstPort uint16) {
	// Update last known SR time for RTT calculation
	// NTP timestamp: most significant 32 bits are seconds since 1900, least significant 32 are fractions
	// Middle 32 bits are used for LSR in RR
	ntp := sr.NTPTime
	middle32 := uint32((ntp >> 16) & 0xFFFFFFFF)

	// R4-2 fix: single time.Now() call for both lastSRTime and Timestamp
	now := timeutil.Now()

	stream.mu.Lock()
	stream.lastSRTime = now
	stream.lastSRNTP = middle32
	callerIP := stream.callerIP
	calleeIP := stream.calleeIP
	stream.mu.Unlock()

	// Create metric record
	metric := QualityMetric{
		Timestamp:   now,
		CallID:      stream.callID,
		StreamID:    MakeStreamID(stream.callID, srcIP),
		Direction:   DetermineDirection(srcIP, callerIP, calleeIP),
		ReportType:  "SR",
		SourceSSRC:  sr.SSRC,
		PacketsSent: sr.PacketCount,
		OctetsSent:  sr.OctetCount,
		RawMessage:  rawMsg,
		SrcIP:       srcIP,
		DstIP:       dstIP,
		SrcPort:     srcPort,
		DstPort:     dstPort,
	}

	// Persist
	s.saveMetric(metric)
}

func (s *Sniffer) handleReceiverReport(rr *rtcp.ReceiverReport, stream *RTPStream, rawMsg, srcIP, dstIP string, srcPort, dstPort uint16) {
	for _, report := range rr.Reports {
		// Estimate RTT using passive SR/RR correlation
		stream.mu.Lock()
		lastSRTime := stream.lastSRTime
		lastSRNTP := stream.lastSRNTP
		callerIP := stream.callerIP
		calleeIP := stream.calleeIP
		stream.mu.Unlock()

		rtt := EstimateRTT(report.LastSenderReport, report.Delay, lastSRNTP, lastSRTime)

		// Cache RTT for RTP real-time MOS publisher
		stream.mu.Lock()
		stream.lastRTTMs = float64(rtt)
		stream.mu.Unlock()

		// Calculate Packet Loss Rate
		lossRate := float32(report.FractionLost) / 256.0

		// Jitter
		jitter := float32(report.Jitter) // Timestamp units, usually equivalent to samples

		// Calculate MOS
		mos := calculateMOS(lossRate, float32(rtt), jitter)

		metric := QualityMetric{
			Timestamp:      timeutil.Now(),
			CallID:         stream.callID,
			StreamID:       MakeStreamID(stream.callID, srcIP),
			Direction:      DetermineDirection(srcIP, callerIP, calleeIP),
			ReportType:     "RR",
			SourceSSRC:     rr.SSRC, // SSRC of packet sender (the reporter)
			FractionLost:   uint8(report.FractionLost),
			PacketsLost:    int32(report.TotalLost),
			Jitter:         jitter,
			PacketLossRate: lossRate,
			RTT:            rtt,
			MOS:            mos,
			RawMessage:     rawMsg,
			SrcIP:          srcIP,
			DstIP:          dstIP,
			SrcPort:        srcPort,
			DstPort:        dstPort,
		}

		s.saveMetric(metric)
	}
}

func (s *Sniffer) saveMetric(m QualityMetric) {
	// GeoIP lookup for media IPs
	if srcLoc, err := geoip.Lookup(m.SrcIP); err == nil && srcLoc != nil {
		m.SrcCountry = srcLoc.Country
		m.SrcCity = srcLoc.City
	}
	if dstLoc, err := geoip.Lookup(m.DstIP); err == nil && dstLoc != nil {
		m.DstCountry = dstLoc.Country
		m.DstCity = dstLoc.City
	}

	// 1. Send to ClickHouse (Batch)
	clickhouseRecord := clickhouse.RTCPReport{
		Timestamp:    m.Timestamp,
		CallID:       m.CallID,
		StreamID:     m.StreamID,
		Direction:    m.Direction,
		ReportType:   m.ReportType,
		SSRC:         m.SourceSSRC,
		PacketsSent:  m.PacketsSent,
		OctetsSent:   m.OctetsSent,
		PacketsLost:  m.PacketsLost,
		FractionLost: m.FractionLost,
		Jitter:       m.Jitter,
		RTT:          m.RTT,
		MOS:          m.MOS,
		PacketLoss:   m.PacketLossRate,
		RawMessage:   m.RawMessage,
		SrcIP:        m.SrcIP,
		DstIP:        m.DstIP,
		SrcPort:      m.SrcPort,
		DstPort:      m.DstPort,
		SrcCountry:   m.SrcCountry,
		SrcCity:      m.SrcCity,
		DstCountry:   m.DstCountry,
		DstCity:      m.DstCity,
	}

	if err := clickhouse.WriteRTCPReport(clickhouseRecord); err != nil {
		log.Printf("Failed to write RTCP report: %v", err)
	}

	// 2. Publish to Redis for Real-time UI
	if err := redis.PublishQualityMetric(m.CallID, m); err != nil {
		log.Printf("Failed to publish quality metric: %v", err)
	}
}

// calculateMOS estimates Mean Opinion Score (1-5)
// Simplified E-Model (R-factor) approximation
func calculateMOS(lossRate float32, rttMs float32, jitter float32) float32 {
	// Base R-value
	r := 93.2

	// Effective Latency: RTT + Jitter buffer (assumed 2 * jitter)
	latency := rttMs + (jitter * 2)

	// Deduct for latency (Id)
	var id float32
	if latency < 160 {
		id = latency / 40
	} else {
		id = (latency - 120) / 10
	}

	// Deduct for packet loss (Ie)
	// Curve fitting for loss
	ie := 0.0
	if lossRate > 0 {
		ie = float64(lossRate * 100 * 2.5) // Crude approximation
	}

	rFactor := r - float64(id) - ie

	if rFactor < 0 {
		rFactor = 0
	}
	if rFactor > 100 {
		rFactor = 100
	}

	// Convert R-factor to MOS
	// MOS = 1 + (0.035 * R) + (R * (R - 60) * (100 - R) * 7e-6)
	mos := 1 + (0.035 * rFactor) + (rFactor * (rFactor - 60) * (100 - rFactor) * 7e-6)

	if mos < 1 {
		mos = 1
	}
	if mos > 5 {
		mos = 5
	}

	return float32(mos)
}
