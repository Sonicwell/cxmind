#!/usr/bin/env bash
# scripts/download-models.sh — 下载 IE 运行所需的 AI 模型
#
# ONNX 模型文件过大 (>100MB)，不随源码发布。
# 运行此脚本自动下载到正确位置。
#
# 用法: bash scripts/download-models.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IE_DIR="${SCRIPT_DIR}/../ie"
# Gitee 结构兼容
[[ ! -d "$IE_DIR" ]] && IE_DIR="${SCRIPT_DIR}/../services/ingestion-go"

MODELS_DIR="$IE_DIR/models"

echo "════════════════════════════════════════════════════════"
echo " CXMind IE — Model Downloader"
echo "════════════════════════════════════════════════════════"

# ── 模型注册表 ─────────────────────────────────────────────
# 格式: "子目录|文件名|下载URL|大小描述"
MODELS=(
    ".|model.onnx|https://github.com/Sonicwell/cxmind-models/releases/download/v1.0/wav2vec2-xlsr-ser.onnx|~361MB (Speech Emotion Recognition)"
    "textfilter|minilm.onnx|https://github.com/Sonicwell/cxmind-models/releases/download/v1.0/minilm-l6-v2.onnx|~449MB (Text Filter - MiniLM)"
    "textfilter|tokenizer.json|https://github.com/Sonicwell/cxmind-models/releases/download/v1.0/minilm-tokenizer.json|~8.7MB (MiniLM Tokenizer)"
    "textfilter/toxic|model.onnx|https://github.com/Sonicwell/cxmind-models/releases/download/v1.0/toxic-bert.onnx|~1GB (Toxicity Detection)"
    "textfilter/toxic|tokenizer.json|https://github.com/Sonicwell/cxmind-models/releases/download/v1.0/toxic-tokenizer.json|~16MB (Toxic Tokenizer)"
)

# ── ONNX Runtime ───────────────────────────────────────────
OS_NAME=$(uname -s)
if [[ "$OS_NAME" == "Linux" ]]; then
    RUNTIME_FILE="libonnxruntime.so"
    RUNTIME_URL="https://github.com/Sonicwell/cxmind-models/releases/download/v1.0/libonnxruntime-linux-x64.so"
elif [[ "$OS_NAME" == "Darwin" ]]; then
    RUNTIME_FILE="libonnxruntime.dylib"
    RUNTIME_URL="https://github.com/Sonicwell/cxmind-models/releases/download/v1.0/libonnxruntime-darwin-arm64.dylib"
else
    echo "⚠️  Unsupported OS: $OS_NAME — skip ONNX Runtime download"
    RUNTIME_FILE=""
fi

# ── 下载函数 ───────────────────────────────────────────────
download() {
    local url="$1"
    local dest="$2"
    local desc="$3"

    if [[ -f "$dest" ]]; then
        echo "  ✅ 已存在: $(basename "$dest")"
        return 0
    fi

    echo "  ⬇️  下载: $desc"
    echo "     → $dest"
    mkdir -p "$(dirname "$dest")"

    if command -v curl &>/dev/null; then
        curl -fSL --progress-bar -o "$dest" "$url" || {
            echo "  ❌ 下载失败: $url"
            rm -f "$dest"
            return 1
        }
    elif command -v wget &>/dev/null; then
        wget -q --show-progress -O "$dest" "$url" || {
            echo "  ❌ 下载失败: $url"
            rm -f "$dest"
            return 1
        }
    else
        echo "  ❌ 需要 curl 或 wget"
        return 1
    fi

    echo "  ✅ 完成: $(du -sh "$dest" | cut -f1)"
}

# ── 执行下载 ───────────────────────────────────────────────
echo ""
echo "下载目录: $MODELS_DIR"
echo ""

FAILED=0

for entry in "${MODELS[@]}"; do
    IFS='|' read -r subdir filename url desc <<< "$entry"
    dest="$MODELS_DIR/$subdir/$filename"
    download "$url" "$dest" "$desc" || ((FAILED++))
done

# ONNX Runtime
if [[ -n "$RUNTIME_FILE" ]]; then
    download "$RUNTIME_URL" "$MODELS_DIR/$RUNTIME_FILE" "ONNX Runtime ($OS_NAME)" || ((FAILED++))
fi

echo ""
echo "════════════════════════════════════════════════════════"
if [[ $FAILED -eq 0 ]]; then
    echo "✅ 所有模型下载完成"
else
    echo "⚠️  $FAILED 个文件下载失败（请检查网络或 URL）"
fi
echo ""
echo "提示: 模型文件已在 .gitignore 中排除，不会被提交。"
echo "════════════════════════════════════════════════════════"
