package callsession

import (
	"context"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/go-redis/redismock/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRebuildFromRedis_DropsExpiredSessionsDirectly(t *testing.T) {
	// Setup Redis Mock
	db, mock := redismock.NewClientMock()
	redis.Client = db
	defer func() { redis.Client = nil }()

	// Configure mock to return 2 active calls
	callID1 := "call-valid"
	callID2 := "call-expired"
	mock.ExpectSMembers("active_calls").SetVal([]string{callID1, callID2})

	now := timeutil.Now()

	// call-valid: last_msg is 10s ago, expires in 300s -> Valid
	lastMsgValid := now.Add(-10 * time.Second)
	// redismock for pipeline: just expect the commands in order
	mock.ExpectGet("call:state:" + callID1).SetVal(`{"session_expires": 300}`)
	mock.ExpectGet("call:last_msg:" + callID1).SetVal(lastMsgValid.Format(time.RFC3339Nano))

	// call-expired: last_msg is 2 hours ago, expires in 300s -> Expired
	lastMsgExpired := now.Add(-2 * time.Hour)
	mock.ExpectGet("call:state:" + callID2).SetVal(`{"session_expires": 300}`)
	mock.ExpectGet("call:last_msg:" + callID2).SetVal(lastMsgExpired.Format(time.RFC3339Nano))

	// RebuildFromRedis 必须清理过期条目: SRem + version update + Del state/last_msg
	mock.ExpectSRem("active_calls", callID2).SetVal(1)
	mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")
	mock.ExpectDel("call:state:" + callID2).SetVal(1)
	mock.ExpectDel("call:last_msg:" + callID2).SetVal(1)

	m := newTestManager()
	SetContext(context.Background())

	err := m.RebuildFromRedis()
	require.NoError(t, err)

	// Valid call should be in memory
	_, ok := m.sessions.Load(callID1)
	assert.True(t, ok, "Valid session should be loaded into sessions map")

	// Expired call should NOT be in memory
	_, ok = m.sessions.Load(callID2)
	assert.False(t, ok, "Expired session MUST NOT be loaded into sessions map")

	// Heap should only contain 1 element
	m.mu.Lock()
	heapLen := m.timeouts.Len()
	m.mu.Unlock()
	assert.Equal(t, 1, heapLen, "Heap should only contain valid sessions")

	// 所有 mock expectations 必须被满足 (SRem/Del 被调用)
	require.NoError(t, mock.ExpectationsWereMet(), "Redis cleanup commands must be executed for expired sessions")
}

// 验证所有成员都过期时的完整清理
func TestRebuildFromRedis_CleansAllStaleEntries(t *testing.T) {
	db, mock := redismock.NewClientMock()
	redis.Client = db
	defer func() { redis.Client = nil }()

	staleIDs := []string{"stale-1", "stale-2", "stale-3"}
	mock.ExpectSMembers("active_calls").SetVal(staleIDs)

	now := timeutil.Now()
	oldMsg := now.Add(-3 * time.Hour).Format(time.RFC3339Nano)

	for _, id := range staleIDs {
		mock.ExpectGet("call:state:" + id).SetVal(`{"session_expires": 300}`)
		mock.ExpectGet("call:last_msg:" + id).SetVal(oldMsg)

		mock.ExpectSRem("active_calls", id).SetVal(1)
		mock.Regexp().ExpectSet("active_calls:version", `\d+`, 0).SetVal("OK")
		mock.ExpectDel("call:state:" + id).SetVal(1)
		mock.ExpectDel("call:last_msg:" + id).SetVal(1)
	}

	m := newTestManager()
	SetContext(context.Background())

	err := m.RebuildFromRedis()
	require.NoError(t, err)

	// 内存中应无 session
	count := 0
	m.sessions.Range(func(_, _ any) bool { count++; return true })
	assert.Equal(t, 0, count, "No sessions should remain in memory")

	// 所有 stale ID 标记为 terminated
	for _, id := range staleIDs {
		assert.True(t, m.IsTerminated(id), "Stale call %s should be terminated", id)
	}

	require.NoError(t, mock.ExpectationsWereMet(), "All Redis cleanup commands must be executed")
}
