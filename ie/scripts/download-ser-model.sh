#!/usr/bin/env bash
# Download SER (Speech Emotion Recognition) ONNX model and runtime
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/../models"
mkdir -p "$MODELS_DIR"

# 从 Dockerfile 提取 ORT 版本 (SSOT)，避免手动硬编码导致版本漂移
DOCKERFILE="$SCRIPT_DIR/../Dockerfile"
if [[ -f "$DOCKERFILE" ]]; then
    ORT_VERSION=$(grep -oP 'ARG ORT_VERSION=\K[0-9.]+' "$DOCKERFILE" || true)
fi
if [[ -z "${ORT_VERSION:-}" ]]; then
    ORT_VERSION="1.24.2"
    echo "⚠️  Could not extract ORT_VERSION from Dockerfile, using fallback: $ORT_VERSION"
fi

# ---------- 1. ONNX Runtime shared library ----------
echo "=== Downloading ONNX Runtime v${ORT_VERSION} (from Dockerfile) ==="
OS=$(uname -s)
ARCH=$(uname -m)

if [[ "$OS" == "Darwin" ]]; then
    if [[ "$ARCH" == "arm64" ]]; then
        ORT_URL="https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-osx-arm64-${ORT_VERSION}.tgz"
        LIB_NAME="libonnxruntime.dylib"
    else
        ORT_URL="https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-osx-x86_64-${ORT_VERSION}.tgz"
        LIB_NAME="libonnxruntime.dylib"
    fi
elif [[ "$OS" == "Linux" ]]; then
    if [[ "$ARCH" == "aarch64" ]]; then
        ORT_URL="https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-aarch64-${ORT_VERSION}.tgz"
    else
        ORT_URL="https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-x64-${ORT_VERSION}.tgz"
    fi
    LIB_NAME="libonnxruntime.so"
fi

if [[ ! -f "$MODELS_DIR/$LIB_NAME" ]]; then
    TMP=$(mktemp -d)
    curl -L -o "$TMP/ort.tgz" "$ORT_URL"
    tar xzf "$TMP/ort.tgz" -C "$TMP"
    cp "$TMP"/onnxruntime-*/lib/$LIB_NAME "$MODELS_DIR/"
    rm -rf "$TMP"
    echo "✅ ONNX Runtime downloaded: $MODELS_DIR/$LIB_NAME"
else
    echo "⏭  ONNX Runtime already exists: $MODELS_DIR/$LIB_NAME"
fi

# ---------- 2. wav2vec2-SER ONNX model ----------
echo "=== Downloading wav2vec2-SER ONNX model ==="
MODEL_URL="https://huggingface.co/prithivMLmods/Speech-Emotion-Classification-ONNX/resolve/main/onnx/model.onnx"

if [[ ! -f "$MODELS_DIR/model.onnx" ]]; then
    curl -L -o "$MODELS_DIR/model.onnx" "$MODEL_URL"
    echo "✅ SER model downloaded: $MODELS_DIR/model.onnx"
else
    echo "⏭  SER model already exists: $MODELS_DIR/model.onnx"
fi

echo ""
echo "=== Download complete ==="
ls -lh "$MODELS_DIR"
