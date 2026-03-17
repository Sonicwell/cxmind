package redis

import (
	"fmt"
	"strconv"

	"github.com/cxmind/ingestion-go/internal/timeutil"
	goredis "github.com/redis/go-redis/v9"
)

const SIPOnlineKey = "agents:sip_online"

// AgentSIPOnline marks an agent as SIP-online by adding/updating their entry
// in the ZSET with score = expiresAt (Unix timestamp).
func AgentSIPOnline(agent string, expiresAt int64) error {
	return Client.ZAdd(Ctx(), SIPOnlineKey, goredis.Z{
		Score:  float64(expiresAt),
		Member: agent,
	}).Err()
}

// AgentSIPOffline removes an agent from the SIP-online ZSET (explicit unregister).
func AgentSIPOffline(agent string) error {
	return Client.ZRem(Ctx(), SIPOnlineKey, agent).Err()
}

// CleanExpiredSIPOnline removes all agents whose expiry timestamp is in the past.
// Returns the number of members removed.
func CleanExpiredSIPOnline() (int64, error) {
	now := strconv.FormatInt(timeutil.Now().UTC().Unix(), 10)
	removed, err := Client.ZRemRangeByScore(Ctx(), SIPOnlineKey, "-inf", now).Result()
	if err != nil {
		return 0, fmt.Errorf("CleanExpiredSIPOnline: %w", err)
	}
	return removed, nil
}
