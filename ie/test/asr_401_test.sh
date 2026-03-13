#!/bin/bash

# ASR 401 Authentication Failure Test
# Tests that 401 errors result in permanent failure state

set -e

echo "=== ASR 401 认证失败测试 ==="
echo ""

# Configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/config/config.yaml"
LOG_FILE="/tmp/ingestion_401_test.log"

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

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test: 401 认证失败不重连"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Backup original config
cp "$CONFIG_FILE" "$CONFIG_FILE.bak"

# Set invalid API key
echo "1. 设置无效 API Key..."
sed -i.tmp 's/key: .*/key: "invalid_test_key_12345"/' "$CONFIG_FILE"
# Also set provider to dashscope (not mock)
sed -i.tmp 's/provider: "mock"/provider: "dashscope"/' "$CONFIG_FILE"
rm -f "$CONFIG_FILE.tmp"

# Start Ingestion Engine
echo "2. 启动 Ingestion Engine..."
cd "$PROJECT_ROOT"
go run main.go > "$LOG_FILE" 2>&1 &
IE_PID=$!
echo "   PID: $IE_PID"
sleep 10

# Check if process is running
if ! kill -0 $IE_PID 2>/dev/null; then
    echo -e "${RED}❌ FAIL: Ingestion Engine failed to start${NC}"
    cat "$LOG_FILE"
    exit 1
fi

# Check for 401 error detection
echo "3. 检查 401 错误处理..."
AUTH_FAILED=$(grep -c "Authentication failed" "$LOG_FILE" || true)
PERMANENT_FAILED=$(grep -c "StatePermanentlyFailed" "$LOG_FILE" || true)

if [ $AUTH_FAILED -gt 0 ]; then
    echo -e "${GREEN}✅ PASS: 检测到认证失败 ($AUTH_FAILED 次)${NC}"
else
    echo -e "${RED}❌ FAIL: 未检测到认证失败日志${NC}"
fi

# Wait and verify no more reconnection attempts
echo "4. 等待 20 秒,验证不再重连..."
sleep 20

# Count reconnection attempts after initial failure
INITIAL_RECONNECTS=$(grep -c "Connecting to DashScope" "$LOG_FILE" || true)
sleep 10
FINAL_RECONNECTS=$(grep -c "Connecting to DashScope" "$LOG_FILE" || true)

RECONNECT_DIFF=$((FINAL_RECONNECTS - INITIAL_RECONNECTS))

if [ $RECONNECT_DIFF -eq 0 ]; then
    echo -e "${GREEN}✅ PASS: 401 错误后不再重连 (差值: $RECONNECT_DIFF)${NC}"
else
    echo -e "${RED}❌ FAIL: 401 错误后仍在重连 (差值: $RECONNECT_DIFF)${NC}"
fi

# Test config reload recovery
echo "5. 测试配置重新加载恢复..."
mv "$CONFIG_FILE.bak" "$CONFIG_FILE"

# Reload config
curl -X POST http://localhost:8081/api/config/reload -s > /dev/null 2>&1 || true
sleep 10

# Check for connection recovery
RESET_MSG=$(grep -c "Resetting permanently failed connection" "$LOG_FILE" || true)
CONNECTED_AFTER=$(grep "Connected successfully" "$LOG_FILE" | tail -5 | wc -l || true)

if [ $RESET_MSG -gt 0 ]; then
    echo -e "${GREEN}✅ PASS: 检测到永久失败状态重置 ($RESET_MSG 次)${NC}"
else
    echo -e "${YELLOW}⚠️  WARNING: 未检测到状态重置日志${NC}"
fi

if [ $CONNECTED_AFTER -ge 1 ]; then
    echo -e "${GREEN}✅ PASS: 配置重新加载后连接恢复${NC}"
else
    echo -e "${YELLOW}⚠️  WARNING: 配置重新加载后未检测到连接${NC}"
fi

# Stop service
kill $IE_PID 2>/dev/null || true
IE_PID=""

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "日志文件: $LOG_FILE"
echo "查看完整日志: cat $LOG_FILE"
