package clickhouse

import (
	"context"
	"log"
)

// MigrationErrors tracks the number of schema migration warnings during initTables.
// Exported for testing.
var MigrationErrors int

// execMigration runs a schema migration DDL and logs a warning on failure.
// It does NOT stop init — migrations are best-effort since most use IF NOT EXISTS / IF EXISTS.
func execMigration(ctx context.Context, ddl string) {
	if err := Client.Exec(ctx, ddl); err != nil {
		MigrationErrors++
		log.Printf("[WARN] Schema migration failed (ddl=%q): %v", ddl, err)
	}
}

func initTables() error {
	ctx := context.Background()
	MigrationErrors = 0

	// 1. RTCP Reports
	queryRTCP := `
        CREATE TABLE IF NOT EXISTS rtcp_reports (
            timestamp DateTime64(3, 'UTC'),
            call_id String,
            stream_id String,
            src_ip String,
            dst_ip String,
            src_port UInt16,
            dst_port UInt16,
            ssrc UInt32,
            fraction_lost UInt8,
            cumulative_lost UInt32,
            ia_jitter UInt32,
            jitter Float32,
            packet_loss Float32,
            rtt Float32,
            mos Float32,
			report_type String,
			raw_message String
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (call_id, timestamp)
    `
	if err := Client.Exec(ctx, queryRTCP); err != nil {
		return err
	}

	// 1.5 Alter RTCP Reports (if old table exists)
	execMigration(ctx, "ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS report_type String")
	execMigration(ctx, "ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS raw_message String")
	execMigration(ctx, "ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS packets_sent UInt32")
	execMigration(ctx, "ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS octets_sent UInt32")
	execMigration(ctx, "ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS cumulative_lost UInt32")
	execMigration(ctx, "ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS direction String")
	execMigration(ctx, "ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS src_country String")
	execMigration(ctx, "ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS src_city String")
	execMigration(ctx, "ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS dst_country String")
	execMigration(ctx, "ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS dst_city String")

	// 1.6 Alter Call Events (remove old columns, add GeoIP if missing, add client_id)
	execMigration(ctx, "ALTER TABLE call_events DROP COLUMN IF EXISTS method")
	execMigration(ctx, "ALTER TABLE call_events DROP COLUMN IF EXISTS status_code")
	execMigration(ctx, "ALTER TABLE call_events DROP COLUMN IF EXISTS body")
	execMigration(ctx, "ALTER TABLE call_events ADD COLUMN IF NOT EXISTS src_country String")
	execMigration(ctx, "ALTER TABLE call_events ADD COLUMN IF NOT EXISTS src_city String")
	execMigration(ctx, "ALTER TABLE call_events ADD COLUMN IF NOT EXISTS dst_country String")
	execMigration(ctx, "ALTER TABLE call_events ADD COLUMN IF NOT EXISTS dst_city String")
	execMigration(ctx, "ALTER TABLE call_events ADD COLUMN IF NOT EXISTS client_id String")

	// 1.6.1 Alter transcription_segments (add asr_source)
	execMigration(ctx, "ALTER TABLE transcription_segments ADD COLUMN IF NOT EXISTS asr_source String DEFAULT 'realtime'")

	// 1.7 Create/Alter Sip Calls Table
	querySipCalls := `
		CREATE TABLE IF NOT EXISTS sip_calls (
			call_id String,
			start_time DateTime64(3, 'UTC'),
			end_time Nullable(DateTime64(3, 'UTC')),
			answer_time Nullable(DateTime64(3, 'UTC')),
			caller String,
			callee String,
			from_domain String,
			to_domain String,
			pcap_path String,
			status String,
			duration UInt32,
			client_id String,
			direction String,
			state_version UInt64
		) ENGINE = ReplacingMergeTree(state_version)
		ORDER BY call_id
	`
	if err := Client.Exec(ctx, querySipCalls); err != nil {
		return err
	}

	// Ensure columns exist if table already existed (schema evolution)
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS answer_time Nullable(DateTime64(3, 'UTC'))")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS client_id String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS from_domain String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS to_domain String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS state_version UInt64")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS sig_src_country String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS sig_src_city String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS sig_dst_country String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS sig_dst_city String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS sig_src_ip String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS sig_dst_ip String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS media_src_country String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS media_src_city String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS media_dst_country String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS media_dst_city String")
	execMigration(ctx, "ALTER TABLE sip_calls ADD COLUMN IF NOT EXISTS direction String")

	// 1.8 Quality Metrics table (used by AS for post-call quality analysis)
	queryQM := `
		CREATE TABLE IF NOT EXISTS quality_metrics (
			timestamp DateTime64(3, 'UTC'),
			call_id String,
			stream_id String,
			direction String,
			mos_score Float32,
			r_factor Float32,
			jitter_avg Float32,
			jitter_max Float32,
			packet_loss_rate Float32,
			rtt_avg Float32,
			rtt_max Float32,
			codec String,
			pdd_ms UInt32,
			packets_received UInt64,
			packets_expected UInt64,
			quality_grade String,
			src_country String,
			src_city String,
			dst_country String,
			dst_city String
		) ENGINE = ReplacingMergeTree()
		ORDER BY (call_id, direction)
	`
	if err := Client.Exec(ctx, queryQM); err != nil {
		log.Printf("Failed to create quality_metrics table: %v", err)
	}

	// 2. SIP Messages
	querySIP := `
		CREATE TABLE IF NOT EXISTS sip_messages (
			timestamp DateTime64(3, 'UTC'),
			call_id String,
			realm String,
			method String,
			status_code Int32,
			cseq String,
			src_ip String,
			dst_ip String,
			src_port UInt16,
			dst_port UInt16,
			raw_message String
		) ENGINE = MergeTree()
		PARTITION BY toYYYYMM(timestamp)
		ORDER BY (call_id, timestamp)
	`
	if err := Client.Exec(ctx, querySIP); err != nil {
		return err
	}

	return nil
}
