#!/bin/bash

# ASR Reconnection Strategy Integration Test
# Tests circuit breaker and exponential backoff behavior

set -e

echo "=== ASR 重连策略集成测试 ==="
echo ""

# Configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/config/config.yaml"
LOG_FILE="/tmp/ingestion_test.log"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up..."
    if [ ! -z "$IE_PID" ]; then
        kill $IE_PID 2>/dev/null || true
    fi
    # Restore original config
    if [ -f "$CONFIG_FILE.bak" ]; then
        mv "$CONFIG_FILE.bak" "$CONFIG_FILE"
    fi
}

trap cleanup EXIT

# Test 1: Service Unavailable Scenario
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 1: DashScope 服务不可用场景"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Backup original config
cp "$CONFIG_FILE" "$CONFIG_FILE.bak"

# Modify config to use invalid URL
echo "1. 修改配置为无效 URL..."
sed -i.tmp 's|dashscope.aliyuncs.com|invalid-host-for-testing.example.com|' "$CONFIG_FILE"
rm -f "$CONFIG_FILE.tmp"

# Start Ingestion Engine
echo "2. 启动 Ingestion Engine..."
cd "$PROJECT_ROOT"
go run main.go > "$LOG_FILE" 2>&1 &
IE_PID=$!
echo "   PID: $IE_PID"
sleep 5

# Check if process is running
if ! kill -0 $IE_PID 2>/dev/null; then
    echo -e "${RED}❌ FAIL: Ingestion Engine failed to start${NC}"
    cat "$LOG_FILE"
    exit 1
fi

echo "3. 观察日志 30 秒..."
sleep 30

# Count reconnection attempts
echo "4. 统计重连次数..."
RECONNECT_COUNT=$(grep -c "Connecting to DashScope" "$LOG_FILE" || true)
CIRCUIT_BREAKER_OPEN=$(grep -c "Circuit breaker open" "$LOG_FILE" || true)

echo "   重连尝试次数: $RECONNECT_COUNT"
echo "   熔断器打开次数: $CIRCUIT_BREAKER_OPEN"

# Verify circuit breaker is working (should have < 10 reconnection attempts in 30s)
if [ $RECONNECT_COUNT -lt 10 ]; then
    echo -e "${GREEN}✅ PASS: 熔断器工作正常 (重连次数: $RECONNECT_COUNT < 10)${NC}"
else
    echo -e "${RED}❌ FAIL: 重连次数过多 (重连次数: $RECONNECT_COUNT >= 10)${NC}"
    echo "   预期: < 10 次 (有熔断器)"
    echo "   实际: $RECONNECT_COUNT 次"
fi

if [ $CIRCUIT_BREAKER_OPEN -gt 0 ]; then
    echo -e "${GREEN}✅ PASS: 检测到熔断器打开${NC}"
else
    echo -e "${YELLOW}⚠️  WARNING: 未检测到熔断器打开日志${NC}"
fi

# Verify exponential backoff
echo "5. 验证指数退避..."
RETRY_5S=$(grep -c "Retrying in 5" "$LOG_FILE" || true)
RETRY_10S=$(grep -c "Retrying in 10" "$LOG_FILE" || true)
RETRY_20S=$(grep -c "Retrying in 20" "$LOG_FILE" || true)

echo "   5s 延迟: $RETRY_5S 次"
echo "   10s 延迟: $RETRY_10S 次"
echo "   20s 延迟: $RETRY_20S 次"

if [ $RETRY_5S -gt 0 ] && [ $RETRY_10S -gt 0 ]; then
    echo -e "${GREEN}✅ PASS: 检测到指数退避序列${NC}"
else
    echo -e "${YELLOW}⚠️  WARNING: 指数退避序列不明显${NC}"
fi

# Restore config and reload
echo "6. 恢复配置并重新加载..."
mv "$CONFIG_FILE.bak" "$CONFIG_FILE"

# Send reload request
curl -X POST http://localhost:8081/api/config/reload -s > /dev/null 2>&1 || true
sleep 10

# Check if connections recovered
CONNECTED=$(grep -c "Connected successfully" "$LOG_FILE" | tail -5 || true)
if [ $CONNECTED -ge 1 ]; then
    echo -e "${GREEN}✅ PASS: 配置重新加载后连接恢复${NC}"
else
    echo -e "${YELLOW}⚠️  WARNING: 配置重新加载后未检测到连接恢复${NC}"
fi

# Stop service
kill $IE_PID 2>/dev/null || true
IE_PID=""
sleep 2

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "日志文件: $LOG_FILE"
echo "查看完整日志: cat $LOG_FILE"
