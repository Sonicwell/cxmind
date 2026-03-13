package hep

import (
	"context"
	"encoding/json"
	"net"
	"strconv"
	"testing"
	"time"

	"github.com/cxmind/ingestion-go/internal/callsession"
	"github.com/cxmind/ingestion-go/internal/redis"
	"github.com/cxmind/ingestion-go/internal/timeutil"
	"github.com/go-redis/redismock/v9"
	"github.com/patrickmn/go-cache"
	"github.com/stretchr/testify/assert"
)

func TestHandleTermination_PublishesHangupEvent(t *testing.T) {
	// 1. Setup minimal environment
	localCache = cache.New(5*time.Minute, 10*time.Minute)
	callsession.GlobalManager = callsession.NewTestManager()

	// Mock Redis
	db, mock := redismock.NewClientMock()
	redis.Client = db
	redis.SetContext(context.Background())

	// Ensure sync path is used
	redis.GlobalEventPublisher = nil

	// Fixed timestamp (UTC)
	tsSec := int64(1704110400) // 2024-01-01 12:00:00 UTC

	// Expected timestamp (Local, matching time.Unix behavior in code)
	expectedTime := timeutil.Unix(tsSec, 0)

	// 2. Expect Redis GetCallState
	mock.ExpectGet("call:state:test-call-id").RedisNil()

	// 3. Construct expected event
	expectedEvent := &redis.CallEvent{
		EventType:  "call_hangup",
		CallID:     "test-call-id",
		Realm:      "example.com",
		CallerURI:  "sip:alice@example.com",
		CalleeURI:  "sip:bob@example.com",
		Timestamp:  expectedTime,
		SrcIP:      "192.168.1.1",
		DstIP:      "10.0.0.1",
		Method:     "BYE",
		StatusCode: 0,
	}
	eventJSON, _ := json.Marshal(expectedEvent)

	mock.ExpectPublish("call:event:test-call-id", eventJSON).SetVal(1)

	// 4. Construct SIP BYE Packet
	sipPayload := "BYE sip:bob@example.com SIP/2.0\r\n" +
		"Via: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK-74bf9\r\n" +
		"From: Alice <sip:alice@example.com>;tag=12345\r\n" +
		"To: Bob <sip:bob@example.com>;tag=67890\r\n" +
		"Call-ID: test-call-id\r\n" +
		"CSeq: 2 BYE\r\n" +
		"Content-Length: 0\r\n\r\n"

	packet := &HEPPacket{
		SrcIP:        "192.168.1.1",
		DstIP:        "10.0.0.1",
		SrcPort:      5060,
		DstPort:      5060,
		TimestampSec: uint32(tsSec),
		ProtocolType: PROTO_SIP,
		Payload:      []byte(sipPayload),
	}

	// 5. Run Handler
	HandleSIPPayload(packet)

	// 6. Verify expectations
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("there were unfulfilled expectations: %s", err)
	}

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestDetermineLegDirection(t *testing.T) {
	// 构造 IP set — 纯 IP 通配（忽略端口）
	makeIPSet := func(ips ...string) func(string, uint16) bool {
		set := make(map[string]bool, len(ips))
		for _, ip := range ips {
			set[ip] = true
		}
		return func(ip string, port uint16) bool { return set[ip] }
	}

	// 构造 ip:port 精确匹配 set
	makePortIPSet := func(entries ...string) func(string, uint16) bool {
		wildIPs := make(map[string]bool)
		portIPs := make(map[string]map[uint16]bool)
		for _, entry := range entries {
			host, portStr, err := net.SplitHostPort(entry)
			if err != nil {
				wildIPs[entry] = true
			} else {
				p, _ := strconv.Atoi(portStr)
				if portIPs[host] == nil {
					portIPs[host] = make(map[uint16]bool)
				}
				portIPs[host][uint16(p)] = true
			}
		}
		return func(ip string, port uint16) bool {
			if wildIPs[ip] {
				return true
			}
			if ports, ok := portIPs[ip]; ok {
				return ports[port]
			}
			return false
		}
	}

	tests := []struct {
		name     string
		setup    func()
		srcIP    string
		srcPort  uint16
		dstIP    string
		dstPort  uint16
		expected string
	}{
		{
			name: "Single server IP - Inbound",
			setup: func() {
				IsServerIPFunc = makeIPSet("192.168.1.100")
			},
			srcIP: "10.0.0.1", srcPort: 5060,
			dstIP: "192.168.1.100", dstPort: 5060,
			expected: "inbound",
		},
		{
			name: "Single server IP - Outbound",
			setup: func() {
				IsServerIPFunc = makeIPSet("192.168.1.100")
			},
			srcIP: "192.168.1.100", srcPort: 5060,
			dstIP: "10.0.0.1", dstPort: 5060,
			expected: "outbound",
		},
		{
			name: "Single server IP - Unknown",
			setup: func() {
				IsServerIPFunc = makeIPSet("192.168.1.100")
			},
			srcIP: "10.0.0.1", srcPort: 5060,
			dstIP: "10.0.0.2", dstPort: 5060,
			expected: "unknown",
		},
		{
			name: "Multiple server IPs - Inbound to first IP",
			setup: func() {
				IsServerIPFunc = makeIPSet("192.168.1.100", "192.168.1.101")
			},
			srcIP: "10.0.0.1", srcPort: 5060,
			dstIP: "192.168.1.100", dstPort: 5060,
			expected: "inbound",
		},
		{
			name: "Multiple server IPs - Inbound to second IP",
			setup: func() {
				IsServerIPFunc = makeIPSet("192.168.1.100", "192.168.1.101")
			},
			srcIP: "10.0.0.1", srcPort: 5060,
			dstIP: "192.168.1.101", dstPort: 5060,
			expected: "inbound",
		},
		{
			name: "Multiple server IPs - Outbound from first IP",
			setup: func() {
				IsServerIPFunc = makeIPSet("192.168.1.100", "192.168.1.101")
			},
			srcIP: "192.168.1.100", srcPort: 5060,
			dstIP: "10.0.0.1", dstPort: 5060,
			expected: "outbound",
		},
		{
			name: "Multiple server IPs - Unknown (neither IP in set)",
			setup: func() {
				IsServerIPFunc = makeIPSet("192.168.1.100", "192.168.1.101")
			},
			srcIP: "10.0.0.1", srcPort: 5060,
			dstIP: "10.0.0.2", dstPort: 5060,
			expected: "unknown",
		},
		{
			name: "Nil IsServerIPFunc - always unknown",
			setup: func() {
				IsServerIPFunc = nil
			},
			srcIP: "192.168.1.100", srcPort: 5060,
			dstIP: "10.0.0.1", dstPort: 5060,
			expected: "unknown",
		},
		// === 端口精确匹配场景 ===
		{
			name: "Port match - Inbound to exact port",
			setup: func() {
				IsServerIPFunc = makePortIPSet("192.168.1.100:5060")
			},
			srcIP: "10.0.0.1", srcPort: 5060,
			dstIP: "192.168.1.100", dstPort: 5060,
			expected: "inbound",
		},
		{
			name: "Port match - Wrong port, no match",
			setup: func() {
				IsServerIPFunc = makePortIPSet("192.168.1.100:5060")
			},
			srcIP: "10.0.0.1", srcPort: 5060,
			dstIP: "192.168.1.100", dstPort: 5080,
			expected: "unknown",
		},
		{
			name: "Port match - Same IP different services",
			setup: func() {
				IsServerIPFunc = makePortIPSet("192.168.1.100:5060", "192.168.1.100:5080")
			},
			srcIP: "10.0.0.1", srcPort: 5060,
			dstIP: "192.168.1.100", dstPort: 5080,
			expected: "inbound",
		},
		{
			name: "Mixed - Wild IP takes precedence",
			setup: func() {
				IsServerIPFunc = makePortIPSet("192.168.1.200", "192.168.1.100:5060")
			},
			srcIP: "192.168.1.200", srcPort: 9999,
			dstIP: "10.0.0.1", dstPort: 5060,
			expected: "outbound",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()
			direction := determineLegDirection(tt.srcIP, tt.srcPort, tt.dstIP, tt.dstPort)
			assert.Equal(t, tt.expected, direction)
		})
	}

	// cleanup
	IsServerIPFunc = nil
}
