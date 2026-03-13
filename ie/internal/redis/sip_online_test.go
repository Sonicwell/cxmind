package redis

import (
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/go-redis/redismock/v9"
	goredis "github.com/redis/go-redis/v9"
)

func setupSIPOnlineMock() (redismock.ClientMock, func()) {
	db, mock := redismock.NewClientMock()
	oldClient := Client
	Client = db
	return mock, func() { Client = oldClient }
}

func TestAgentSIPOnline(t *testing.T) {
	mock, cleanup := setupSIPOnlineMock()
	defer cleanup()

	agent := "1001@sip.example.com"
	expiresAt := timeutil.Now().Add(3600 * time.Second).Unix()

	mock.ExpectZAdd(SIPOnlineKey, goredis.Z{
		Score:  float64(expiresAt),
		Member: agent,
	}).SetVal(1)

	err := AgentSIPOnline(agent, expiresAt)
	if err != nil {
		t.Fatalf("AgentSIPOnline() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestAgentSIPOffline(t *testing.T) {
	mock, cleanup := setupSIPOnlineMock()
	defer cleanup()

	agent := "1001@sip.example.com"

	mock.ExpectZRem(SIPOnlineKey, agent).SetVal(1)

	err := AgentSIPOffline(agent)
	if err != nil {
		t.Fatalf("AgentSIPOffline() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestCleanExpiredSIPOnline(t *testing.T) {
	mock, cleanup := setupSIPOnlineMock()
	defer cleanup()

	// We can't predict exact timestamp, so use a custom expectation
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil // Accept any args
	}).ExpectZRemRangeByScore(SIPOnlineKey, "-inf", "0").SetVal(2)

	removed, err := CleanExpiredSIPOnline()
	if err != nil {
		t.Fatalf("CleanExpiredSIPOnline() error = %v", err)
	}
	if removed != 2 {
		t.Errorf("CleanExpiredSIPOnline() removed = %d, want 2", removed)
	}
}

func TestCleanExpiredSIPOnline_Error(t *testing.T) {
	mock, cleanup := setupSIPOnlineMock()
	defer cleanup()

	customErr := goredis.TxFailedErr
	mock.CustomMatch(func(expected, actual []interface{}) error {
		return nil
	}).ExpectZRemRangeByScore(SIPOnlineKey, "-inf", "0").SetErr(customErr)

	_, err := CleanExpiredSIPOnline()
	if err == nil {
		t.Fatal("CleanExpiredSIPOnline() expected error, got nil")
	}
}
