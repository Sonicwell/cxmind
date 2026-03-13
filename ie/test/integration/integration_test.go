//go:build integration
// +build integration

package integration

import (
	"context"
	"fmt"
	"log"
	"os"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/clickhouse"
	"github.com/cxmind/ingestion-go/internal/config"
	"github.com/cxmind/ingestion-go/internal/hep"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/spf13/viper"
)

var (
	testCtx    context.Context
	testCancel context.CancelFunc
)

func TestMain(m *testing.M) {
	// 1. Setup minimal configuration
	// We override viper settings so we don't accidentally touch production DBs
	viper.Set("redis.addr", "127.0.0.1:6379")
	viper.Set("clickhouse.host", "127.0.0.1:9000")
	viper.Set("clickhouse.database", "cxmi_test")
	viper.Set("clickhouse.batch_size", 10)
	viper.Set("clickhouse.flush_interval_ms", 100)
	viper.Set("hep.port", "9060")
	viper.Set("recordings.base_path", "/tmp/ie_recordings_test")

	config.Global = viper.GetViper()

	// 2. Initialize Core Dependencies
	if err := redis.Initialize(); err != nil {
		log.Fatalf("TestMain: failed to connect Redis: %v", err)
	}

	if err := clickhouse.Initialize(); err != nil {
		log.Fatalf("TestMain: failed to connect ClickHouse: %v", err)
	}

	testCtx, testCancel = context.WithCancel(context.Background())
	defer testCancel()

	redis.SetContext(testCtx)
	clickhouse.SetContext(testCtx)
	callsession.SetContext(testCtx)
	callsession.Initialize()

	// Initialize Batch Writers with tiny intervals for rapid tests
	clickhouse.InitSipCallBatchWriter(10, 100*time.Millisecond)
	clickhouse.InitTranscriptionBatchWriter(10, 100*time.Millisecond)
	clickhouse.InitQualityBatchWriter(10, 100*time.Millisecond)

	// 3. Setup Test ClickHouse Mock Dictionaries
	if err := setupMockDictionaries(); err != nil {
		log.Fatalf("TestMain: failed to setup mock dictionaries: %v", err)
	}

	// 4. Start HEP Server locally
	hep.InitSharedPipeline()
	go func() {
		if err := hep.StartHEPServer("9060"); err != nil {
			log.Fatalf("TestMain: failed to start HEP server: %v", err)
		}
	}()

	// Wait for HEP to bind
	time.Sleep(500 * time.Millisecond)

	// 5. Run Tests
	log.Println("TestMain: Environment Ready. Running integration tests...")
	code := m.Run()

	// 6. Teardown
	log.Println("TestMain: Tearing down...")
	hep.StopHEPServer()
	os.Exit(code)
}

func setupMockDictionaries() error {
	client := clickhouse.Client
	if client == nil {
		return fmt.Errorf("clickhouse client is nil")
	}

	db := "cxmi_test"

	// Create sync table
	ddlSyncTable := fmt.Sprintf(`
		CREATE TABLE IF NOT EXISTS %s.agent_directory_sync (
			sip_number String,
			client_id String,
			group_id String,
			agent_id String
		) ENGINE = ReplacingMergeTree()
		ORDER BY sip_number;
	`, db)

	// Create Dictionary
	ddlDict := fmt.Sprintf(`
		CREATE DICTIONARY IF NOT EXISTS %s.agent_dict (
			sip_number String,
			client_id String,
			group_id String,
			agent_id String
		)
		PRIMARY KEY sip_number
		SOURCE(CLICKHOUSE(DB '%s' TABLE 'agent_directory_sync'))
		LIFETIME(MIN 0 MAX 0)
		LAYOUT(COMPLEX_KEY_HASHED());
	`, db, db)

	// Execute DDLs
	if err := client.Exec(context.Background(), ddlSyncTable); err != nil {
		return err
	}
	if err := client.Exec(context.Background(), ddlDict); err != nil {
		return err
	}

	// Truncate and Insert test mock agents
	client.Exec(context.Background(), fmt.Sprintf("TRUNCATE TABLE %s.agent_directory_sync", db))

	mockValues := []struct {
		SipNumber string
		ClientID  string
		GroupID   string
		AgentID   string
	}{
		{"1001", "test_client_1", "test_group_user", "customer_agent_1"},
		{"1002", "test_client_1", "test_group_support", "support_agent_2"},
	}

	for _, v := range mockValues {
		q := fmt.Sprintf("INSERT INTO %s.agent_directory_sync (sip_number, client_id, group_id, agent_id) VALUES ('%s', '%s', '%s', '%s')",
			db, v.SipNumber, v.ClientID, v.GroupID, v.AgentID)
		if err := client.Exec(context.Background(), q); err != nil {
			return err
		}
	}

	// Reload dictionary
	client.Exec(context.Background(), fmt.Sprintf("SYSTEM RELOAD DICTIONARY %s.agent_dict", db))

	return nil
}

// Ensure mock test agents exist in the database for each test
func refreshMockAgents() {
	client := clickhouse.Client
	db := "cxmi_test"
	client.Exec(context.Background(), fmt.Sprintf("TRUNCATE TABLE %s.agent_directory_sync", db))

	// Re-insert standard agents
	client.Exec(context.Background(), fmt.Sprintf("INSERT INTO %s.agent_directory_sync (sip_number, client_id, group_id, agent_id) VALUES ('1001', 'test_client_1', 'test_group_user', 'customer_agent_1')", db))
	client.Exec(context.Background(), fmt.Sprintf("INSERT INTO %s.agent_directory_sync (sip_number, client_id, group_id, agent_id) VALUES ('1002', 'test_client_1', 'test_group_support', 'support_agent_2')", db))
	client.Exec(context.Background(), fmt.Sprintf("SYSTEM RELOAD DICTIONARY %s.agent_dict", db))
}
