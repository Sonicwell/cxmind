package clickhouse

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"context"
	"fmt"
	"log"
	"sync/atomic"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

var (
	Client    driver.Conn
	atomicCtx atomic.Value // stores chCtxWrapper; race-free
)

// chCtxWrapper wraps context.Context for consistent atomic.Value type.
type chCtxWrapper struct{ ctx context.Context }

func init() {
	atomicCtx.Store(chCtxWrapper{ctx: context.Background()})
}

// Ctx returns the package-level context for ClickHouse operations.
func Ctx() context.Context {
	return atomicCtx.Load().(chCtxWrapper).ctx
}

// SetContext replaces the package-level context for ClickHouse operations.
// Thread-safe: uses atomic.Value to prevent data races.
func SetContext(c context.Context) {
	atomicCtx.Store(chCtxWrapper{ctx: c})
}

func Initialize() error {
	host := config.Global.GetString("clickhouse.host")
	if host == "" {
		host = "localhost:9000"
	}
	database := config.Global.GetString("clickhouse.database")
	if database == "" {
		database = "cxmind"
	}
	username := config.Global.GetString("clickhouse.username")
	if username == "" {
		username = "default"
	}
	password := config.Global.GetString("clickhouse.password")

	maxOpenConns := config.Global.GetInt("clickhouse.max_open_conns")
	if maxOpenConns <= 0 {
		maxOpenConns = 50
	}
	maxIdleConns := config.Global.GetInt("clickhouse.max_idle_conns")
	if maxIdleConns <= 0 {
		maxIdleConns = 3
	}

	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{host},
		Auth: clickhouse.Auth{
			Database: database,
			Username: username,
			Password: password,
		},
		Settings: clickhouse.Settings{
			"max_execution_time": 60,
		},
		DialTimeout:     5 * time.Second,
		MaxOpenConns:    maxOpenConns,
		MaxIdleConns:    maxIdleConns,
		ConnMaxLifetime: time.Hour,
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
	})

	if err != nil {
		return fmt.Errorf("failed to connect to ClickHouse: %v", err)
	}

	if err := conn.Ping(Ctx()); err != nil {
		return fmt.Errorf("failed to ping ClickHouse: %v", err)
	}

	Client = conn

	if err := initTables(); err != nil {
		return fmt.Errorf("failed to initialize tables: %v", err)
	}

	return nil
}

type CallEventRecord struct {
	Timestamp  time.Time `ch:"timestamp"`
	CallID     string    `ch:"call_id"`
	Realm      string    `ch:"realm"`
	EventType  string    `ch:"event_type"`
	CallerURI  string    `ch:"caller_uri"`
	CalleeURI  string    `ch:"callee_uri"`
	SrcIP      string    `ch:"src_ip"`
	DstIP      string    `ch:"dst_ip"`
	SrcCountry string    `ch:"src_country"`
	SrcCity    string    `ch:"src_city"`
	DstCountry string    `ch:"dst_country"`
	DstCity    string    `ch:"dst_city"`
}

type SipCallRecord struct {
	StartTime        time.Time  `ch:"start_time"`
	EndTime          *time.Time `ch:"end_time"`
	AnswerTime       *time.Time `ch:"answer_time"`
	CallID           string     `ch:"call_id"`
	Caller           string     `ch:"caller"`
	Callee           string     `ch:"callee"`
	FromDomain       string     `ch:"from_domain"`
	ToDomain         string     `ch:"to_domain"`
	PcapPath         string     `ch:"pcap_path"`
	Status           string     `ch:"status"`
	Duration         uint32     `ch:"duration"`
	Codec            string     `ch:"codec"`
	ClientID         string     `ch:"client_id"`
	SigSrcCountry    string     `ch:"sig_src_country"`
	SigSrcCity       string     `ch:"sig_src_city"`
	SigDstCountry    string     `ch:"sig_dst_country"`
	SigDstCity       string     `ch:"sig_dst_city"`
	MediaSrcCountry  string     `ch:"media_src_country"`
	MediaSrcCity     string     `ch:"media_src_city"`
	MediaDstCountry  string     `ch:"media_dst_country"`
	MediaDstCity     string     `ch:"media_dst_city"`
	StateVersion     uint64     `ch:"state_version"`
	Direction        string     `ch:"direction"`
	DisconnectReason string     `ch:"disconnect_reason"`
	DisconnectParty  string     `ch:"disconnect_party"`
	SigSrcIp         string     `ch:"sig_src_ip"`
	SigDstIp         string     `ch:"sig_dst_ip"`
	HoldDuration     uint32     `ch:"hold_duration"`
	HoldCount        uint32     `ch:"hold_count"`
	EndedOnHold      uint8      `ch:"ended_on_hold"`
}

type SipMessageRecord struct {
	Timestamp  time.Time `ch:"timestamp"`
	CallID     string    `ch:"call_id"`
	Realm      string    `ch:"realm"`
	Method     string    `ch:"method"`
	StatusCode int32     `ch:"status_code"`
	CSeq       string    `ch:"cseq"`
	SrcIP      string    `ch:"src_ip"`
	DstIP      string    `ch:"dst_ip"`
	SrcPort    uint16    `ch:"src_port"`
	DstPort    uint16    `ch:"dst_port"`
	RawMessage string    `ch:"raw_message"`
}

type RTCPReport struct {
	Timestamp    time.Time `ch:"timestamp"`
	CallID       string    `ch:"call_id"`
	StreamID     string    `ch:"stream_id"`
	Direction    string    `ch:"direction"`
	ReportType   string    `ch:"report_type"`
	SSRC         uint32    `ch:"ssrc"`
	PacketsSent  uint32    `ch:"packets_sent"`
	OctetsSent   uint32    `ch:"octets_sent"`
	PacketsLost  int32     `ch:"packets_lost"`
	FractionLost uint8     `ch:"fraction_lost"`
	Jitter       float32   `ch:"jitter"`
	RTT          float32   `ch:"rtt"`
	MOS          float32   `ch:"mos"`
	PacketLoss   float32   `ch:"packet_loss"`
	RawMessage   string    `ch:"raw_message"`
	SrcIP        string    `ch:"src_ip"`
	DstIP        string    `ch:"dst_ip"`
	SrcPort      uint16    `ch:"src_port"`
	DstPort      uint16    `ch:"dst_port"`
	SrcCountry   string    `ch:"src_country"`
	SrcCity      string    `ch:"src_city"`
	DstCountry   string    `ch:"dst_country"`
	DstCity      string    `ch:"dst_city"`
}

type QualityMetric struct {
	Timestamp      time.Time `ch:"timestamp"`
	CallID         string    `ch:"call_id"`
	StreamID       string    `ch:"stream_id"`
	MOS            float32   `ch:"mos_score"`
	JitterAvg      float32   `ch:"jitter_avg"`
	JitterMax      float32   `ch:"jitter_max"`
	PacketLossRate float32   `ch:"packet_loss_rate"`
	RTTAvg         float32   `ch:"rtt_avg"`
	RTTMax         float32   `ch:"rtt_max"`
}

type TranscriptionSegment struct {
	Timestamp      time.Time `ch:"timestamp"`
	CallID         string    `ch:"call_id"`
	Realm          string    `ch:"realm"`
	Text           string    `ch:"text"`
	Confidence     float32   `ch:"confidence"`
	Speaker        string    `ch:"speaker"`
	IsFinal        uint8     `ch:"is_final"`
	SequenceNumber uint64    `ch:"sequence_number"`
	ASRSource      string    `ch:"asr_source"`
}

const MaxBufferSize = 10000
const MaxFlushRetries = 3

var (
	GlobalSipCallWriter       *GenericBatchWriter[SipCallRecord]
	GlobalCallEventWriter     *GenericBatchWriter[CallEventRecord]
	GlobalSipMessageWriter    *GenericBatchWriter[SipMessageRecord]
	GlobalRTCPWriter          *GenericBatchWriter[RTCPReport]
	GlobalQualityWriter       *GenericBatchWriter[QualityMetric]
	GlobalTranscriptionWriter *GenericBatchWriter[TranscriptionSegment]
)

func InitSipCallBatchWriter(maxSize int, interval time.Duration) {
	if GlobalSipCallWriter != nil {
		return
	}
	GlobalSipCallWriter = NewGenericBatchWriter[SipCallRecord](maxSize, interval, func(ctx context.Context, items []SipCallRecord) error {
		if Client == nil {
			return nil
		}
		batch, err := Client.PrepareBatch(ctx, `INSERT INTO sip_calls (
			start_time, end_time, call_id, caller, callee,
			pcap_path, status, duration,
			sig_src_country, sig_src_city, sig_dst_country, sig_dst_city,
			media_src_country, media_src_city, media_dst_country, media_dst_city,
			codec, answer_time, client_id, from_domain, to_domain, state_version, direction,
			disconnect_reason, disconnect_party,
			sig_src_ip, sig_dst_ip,
			hold_duration, hold_count, ended_on_hold
		)`)
		if err != nil {
			return err
		}
		var appendErrs int
		for _, r := range items {
			var endTime interface{} = nil
			if r.EndTime != nil {
				endTime = r.EndTime
			}
			var answerTime interface{} = nil
			if r.AnswerTime != nil {
				answerTime = r.AnswerTime
			}
			if err := batch.Append(
				r.StartTime, endTime, r.CallID, r.Caller, r.Callee,
				r.PcapPath, r.Status, r.Duration,
				r.SigSrcCountry, r.SigSrcCity, r.SigDstCountry, r.SigDstCity,
				r.MediaSrcCountry, r.MediaSrcCity, r.MediaDstCountry, r.MediaDstCity,
				r.Codec, answerTime, r.ClientID, r.FromDomain, r.ToDomain, r.StateVersion, r.Direction,
				r.DisconnectReason, r.DisconnectParty,
				r.SigSrcIp, r.SigDstIp,
				r.HoldDuration, r.HoldCount, r.EndedOnHold,
			); err != nil {
				appendErrs++
				if appendErrs == 1 {
					log.Printf("[WARN] sip_calls batch.Append error: %v", err)
				}
			}
		}
		if appendErrs > 1 {
			log.Printf("[WARN] sip_calls batch.Append: %d total errors", appendErrs)
		}
		return batch.Send()
	})
	GlobalSipCallWriter.SetContext(Ctx())
}

func InitCallEventBatchWriter(maxSize int, interval time.Duration) {
	if GlobalCallEventWriter != nil {
		return
	}
	GlobalCallEventWriter = NewGenericBatchWriter[CallEventRecord](maxSize, interval, func(ctx context.Context, items []CallEventRecord) error {
		if Client == nil {
			return nil
		}
		batch, err := Client.PrepareBatch(ctx, "INSERT INTO call_events")
		if err != nil {
			return err
		}
		var appendErrs int
		for _, r := range items {
			if err := batch.Append(
				r.Timestamp, r.CallID, r.Realm, r.EventType,
				r.CallerURI, r.CalleeURI, r.SrcIP, r.DstIP,
				r.SrcCountry, r.SrcCity, r.DstCountry, r.DstCity,
				"", // client_id
			); err != nil {
				appendErrs++
				if appendErrs == 1 {
					log.Printf("[WARN] call_events batch.Append error: %v", err)
				}
			}
		}
		if appendErrs > 1 {
			log.Printf("[WARN] call_events batch.Append: %d total errors", appendErrs)
		}
		return batch.Send()
	})
	GlobalCallEventWriter.SetContext(Ctx())
}

func InitSipMessageBatchWriter(maxSize int, interval time.Duration) {
	if GlobalSipMessageWriter != nil {
		return
	}
	GlobalSipMessageWriter = NewGenericBatchWriter[SipMessageRecord](maxSize, interval, func(ctx context.Context, items []SipMessageRecord) error {
		if Client == nil {
			return nil
		}
		batch, err := Client.PrepareBatch(ctx, "INSERT INTO sip_messages")
		if err != nil {
			return err
		}
		var appendErrs int
		for _, r := range items {
			if err := batch.Append(
				r.Timestamp, r.CallID, r.Realm, r.Method, r.StatusCode, r.CSeq,
				r.SrcIP, r.DstIP, r.SrcPort, r.DstPort, r.RawMessage,
			); err != nil {
				appendErrs++
				if appendErrs == 1 {
					log.Printf("[WARN] sip_messages batch.Append error: %v", err)
				}
			}
		}
		if appendErrs > 1 {
			log.Printf("[WARN] sip_messages batch.Append: %d total errors", appendErrs)
		}
		return batch.Send()
	})
	GlobalSipMessageWriter.SetContext(Ctx())
}

func InitRTCPBatchWriter(maxSize int, interval time.Duration) {
	if GlobalRTCPWriter != nil {
		return
	}
	GlobalRTCPWriter = NewGenericBatchWriter[RTCPReport](maxSize, interval, func(ctx context.Context, items []RTCPReport) error {
		if Client == nil {
			return nil
		}
		batch, err := Client.PrepareBatch(ctx, `INSERT INTO rtcp_reports (
			timestamp, call_id, stream_id, direction, report_type, ssrc,
			packets_sent, octets_sent, cumulative_lost, fraction_lost,
			ia_jitter, jitter, rtt, mos, packet_loss,
			raw_message, src_ip, dst_ip, src_port, dst_port,
			src_country, src_city, dst_country, dst_city
		)`)
		if err != nil {
			return err
		}
		var appendErrs int
		for _, r := range items {
			if err := batch.Append(
				r.Timestamp, r.CallID, r.StreamID, r.Direction, r.ReportType, r.SSRC,
				r.PacketsSent, r.OctetsSent, uint32(r.PacketsLost), r.FractionLost,
				uint32(r.Jitter), r.Jitter, r.RTT, r.MOS, r.PacketLoss,
				r.RawMessage, r.SrcIP, r.DstIP, r.SrcPort, r.DstPort,
				r.SrcCountry, r.SrcCity, r.DstCountry, r.DstCity,
			); err != nil {
				appendErrs++
				if appendErrs == 1 {
					log.Printf("[WARN] rtcp_reports batch.Append error: %v", err)
				}
			}
		}
		if appendErrs > 1 {
			log.Printf("[WARN] rtcp_reports batch.Append: %d total errors", appendErrs)
		}
		return batch.Send()
	})
	GlobalRTCPWriter.SetContext(Ctx())
}

func InitQualityBatchWriter(maxSize int, interval time.Duration) {
	if GlobalQualityWriter != nil {
		return
	}
	GlobalQualityWriter = NewGenericBatchWriter[QualityMetric](maxSize, interval, func(ctx context.Context, items []QualityMetric) error {
		if Client == nil {
			return nil
		}
		batch, err := Client.PrepareBatch(ctx, "INSERT INTO quality_metrics")
		if err != nil {
			return err
		}
		var appendErrs int
		for _, m := range items {
			if err := batch.Append(
				m.Timestamp, m.CallID, m.StreamID,
				m.MOS, m.JitterAvg, m.JitterMax, m.PacketLossRate, m.RTTAvg, m.RTTMax,
			); err != nil {
				appendErrs++
				if appendErrs == 1 {
					log.Printf("[WARN] quality_metrics batch.Append error: %v", err)
				}
			}
		}
		if appendErrs > 1 {
			log.Printf("[WARN] quality_metrics batch.Append: %d total errors", appendErrs)
		}
		return batch.Send()
	})
	GlobalQualityWriter.SetContext(Ctx())
}

func InitTranscriptionBatchWriter(maxSize int, interval time.Duration) {
	if GlobalTranscriptionWriter != nil {
		return
	}
	GlobalTranscriptionWriter = NewGenericBatchWriter[TranscriptionSegment](maxSize, interval, func(ctx context.Context, items []TranscriptionSegment) error {
		if Client == nil {
			return nil
		}
		batch, err := Client.PrepareBatch(ctx, `INSERT INTO transcription_segments (
			timestamp, call_id, realm, text, confidence, speaker, is_final, sequence_number, asr_source
		)`)
		if err != nil {
			return err
		}
		var appendErrs int
		for _, s := range items {
			asrSource := s.ASRSource
			if asrSource == "" {
				asrSource = "realtime"
			}
			if err := batch.Append(
				s.Timestamp, s.CallID, s.Realm, s.Text,
				s.Confidence, s.Speaker, s.IsFinal, s.SequenceNumber, asrSource,
			); err != nil {
				appendErrs++
				if appendErrs == 1 {
					log.Printf("[WARN] transcription_segments batch.Append error: %v", err)
				}
			}
		}
		if appendErrs > 1 {
			log.Printf("[WARN] transcription_segments batch.Append: %d total errors", appendErrs)
		}
		return batch.Send()
	})
	GlobalTranscriptionWriter.SetContext(Ctx())
}

// -------------------------------------------------------------
// Write Functions (Strictly Async, No Synchronous Fallbacks)
// -------------------------------------------------------------

func WriteSipCall(record SipCallRecord) error {
	if GlobalSipCallWriter == nil {
		log.Printf("[WARN] WriteSipCall: GlobalSipCallWriter is nil. Dropping record.")
		return nil
	}
	GlobalSipCallWriter.Add(record)
	return nil
}

func WriteRTCPReport(report RTCPReport) error {
	if GlobalRTCPWriter == nil {
		log.Printf("[WARN] WriteRTCPReport: GlobalRTCPWriter is nil. Dropping record.")
		return nil
	}
	GlobalRTCPWriter.Add(report)
	return nil
}

func WriteQualityMetric(metric QualityMetric) error {
	if GlobalQualityWriter == nil {
		log.Printf("[WARN] WriteQualityMetric: GlobalQualityWriter is nil. Dropping record.")
		return nil
	}
	GlobalQualityWriter.Add(metric)
	return nil
}

func WriteTranscriptionSegment(segment TranscriptionSegment) error {
	if GlobalTranscriptionWriter == nil {
		log.Printf("[WARN] WriteTranscriptionSegment: GlobalTranscriptionWriter is nil. Dropping record.")
		return nil
	}
	GlobalTranscriptionWriter.Add(segment)
	return nil
}

func Ping() error {
	if Client == nil {
		return fmt.Errorf("not initialized")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return Client.Ping(ctx)
}

func Close() error {
	if Client != nil {
		return Client.Close()
	}
	return nil
}
