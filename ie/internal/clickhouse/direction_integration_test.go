package clickhouse

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	ch "github.com/ClickHouse/clickhouse-go/v2"
)

// ── 方案 1: struct tag 反射检查 (零依赖) ──

func TestSipCallRecord_DirectionTag(t *testing.T) {
	typ := reflect.TypeOf(SipCallRecord{})
	field, ok := typ.FieldByName("Direction")
	if !ok {
		t.Fatal("SipCallRecord must have a Direction field")
	}
	tag := field.Tag.Get("ch")
	if tag != "direction" {
		t.Errorf("Direction ch tag = %q, want %q", tag, "direction")
	}
}

// ── 方案 2: ClickHouse 写入→读回 roundtrip ──

// skipIfNoCH 跳过测试如果没有可用的 ClickHouse
func skipIfNoCH(t *testing.T) ch.Conn {
	t.Helper()
	host := os.Getenv("CLICKHOUSE_HOST")
	if host == "" {
		host = "localhost:9000"
	}
	db := os.Getenv("CLICKHOUSE_DATABASE")
	if db == "" {
		db = "cxmind"
	}
	password := os.Getenv("CLICKHOUSE_PASSWORD")
	if password == "" {
		password = "password123"
	}

	conn, err := ch.Open(&ch.Options{
		Addr: []string{host},
		Auth: ch.Auth{Database: db, Username: "default", Password: password},
		Settings: ch.Settings{
			"max_execution_time": 10,
		},
		DialTimeout: 2 * time.Second,
	})
	if err != nil {
		t.Skipf("ClickHouse not available: %v", err)
	}
	if err := conn.Ping(context.Background()); err != nil {
		t.Skipf("ClickHouse ping failed: %v", err)
	}
	return conn
}

func TestDirectionWriteRoundtrip(t *testing.T) {
	conn := skipIfNoCH(t)
	defer conn.Close()

	ctx := context.Background()

	// 用临时表隔离测试数据，避免污染实际表
	tmpTable := fmt.Sprintf("_test_sip_calls_%d", time.Now().UnixNano())
	ddl := fmt.Sprintf(`
		CREATE TABLE %s (
			call_id        String,
			start_time     DateTime64(3, 'UTC'),
			end_time       Nullable(DateTime64(3, 'UTC')),
			answer_time    Nullable(DateTime64(3, 'UTC')),
			caller         String,
			callee         String,
			from_domain    String,
			to_domain      String,
			pcap_path      String,
			status         String,
			duration       UInt32,
			client_id      String,
			direction      String,
			codec          String,
			state_version  UInt64,
			sig_src_country  String,
			sig_src_city     String,
			sig_dst_country  String,
			sig_dst_city     String,
			media_src_country String,
			media_src_city   String,
			media_dst_country String,
			media_dst_city   String
		) ENGINE = ReplacingMergeTree(state_version)
		ORDER BY call_id
	`, tmpTable)

	if err := conn.Exec(ctx, ddl); err != nil {
		t.Fatalf("CREATE TABLE failed: %v", err)
	}
	defer conn.Exec(ctx, fmt.Sprintf("DROP TABLE IF EXISTS %s", tmpTable))

	// ── INSERT ──
	now := time.Now().UTC().Truncate(time.Millisecond)
	cases := []struct {
		callID    string
		direction string
	}{
		{"roundtrip-inbound-001", "inbound"},
		{"roundtrip-outbound-002", "outbound"},
		{"roundtrip-unknown-003", "unknown"},
		{"roundtrip-empty-004", ""},
	}

	batch, err := conn.PrepareBatch(ctx, fmt.Sprintf(`INSERT INTO %s (
		call_id, start_time, caller, callee, status, direction, state_version
	)`, tmpTable))
	if err != nil {
		t.Fatalf("PrepareBatch failed: %v", err)
	}
	for i, c := range cases {
		if err := batch.Append(c.callID, now, "alice", "bob", "active", c.direction, uint64(i+1)); err != nil {
			t.Fatalf("Append %s failed: %v", c.callID, err)
		}
	}
	if err := batch.Send(); err != nil {
		t.Fatalf("batch.Send failed: %v", err)
	}

	// ── SELECT 验证 ──
	for _, c := range cases {
		var got string
		err := conn.QueryRow(ctx,
			fmt.Sprintf("SELECT direction FROM %s WHERE call_id = $1", tmpTable),
			c.callID,
		).Scan(&got)
		if err != nil {
			t.Errorf("[%s] SELECT failed: %v", c.callID, err)
			continue
		}
		if got != c.direction {
			t.Errorf("[%s] direction = %q, want %q", c.callID, got, c.direction)
		}
	}
}
