#!/bin/bash
# ============================================================
# Download TextFilter ONNX models and Silero VAD
# Run: bash scripts/download-textfilter-models.sh
# ============================================================

set -euo pipefail

MODELS_DIR="models/textfilter"
VAD_DIR="models"

echo "=== TextFilter Model Downloader ==="
echo ""

# --- MiniLM (Sentence Embedding for Quality + Intent) ---
MINILM_URL="https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/onnx/model.onnx"
MINILM_TOKENIZER_URL="https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/tokenizer.json"
MINILM_MODEL="$MODELS_DIR/minilm.onnx"
MINILM_TOKENIZER="$MODELS_DIR/tokenizer.json"

mkdir -p "$MODELS_DIR"

if [ -f "$MINILM_MODEL" ]; then
    echo "✅ MiniLM model already exists: $MINILM_MODEL"
else
    echo "⬇️  Downloading MiniLM model (~130MB)..."
    curl -L -o "$MINILM_MODEL" "$MINILM_URL"
    echo "✅ MiniLM model downloaded: $MINILM_MODEL"
fi

if [ -f "$MINILM_TOKENIZER" ]; then
    echo "✅ MiniLM tokenizer already exists: $MINILM_TOKENIZER"
else
    echo "⬇️  Downloading MiniLM tokenizer..."
    curl -L -o "$MINILM_TOKENIZER" "$MINILM_TOKENIZER_URL"
    echo "✅ MiniLM tokenizer downloaded: $MINILM_TOKENIZER"
fi

# --- Toxic XLM-RoBERTa ---
# Using citizenlab/twitter-xlm-roberta-base-sentiment-finetunned (multilingual toxic)
# Note: For production, you may want to export your own fine-tuned model
TOXIC_URL="https://huggingface.co/citizenlab/twitter-xlm-roberta-base-sentiment-finetunned/resolve/main/onnx/model.onnx"
TOXIC_TOKENIZER_URL="https://huggingface.co/citizenlab/twitter-xlm-roberta-base-sentiment-finetunned/resolve/main/tokenizer.json"
TOXIC_MODEL="$MODELS_DIR/toxic.onnx"
TOXIC_TOKENIZER="$MODELS_DIR/toxic_tokenizer.json"

if [ -f "$TOXIC_MODEL" ]; then
    echo "✅ Toxic model already exists: $TOXIC_MODEL"
else
    echo "⬇️  Downloading Toxic XLM-R model (~110MB)..."
    echo "   (Note: You may need to export this model manually with optimum-cli)"
    echo "   Run: pip install optimum[onnxruntime] && optimum-cli export onnx --model citizenlab/twitter-xlm-roberta-base-sentiment-finetunned $MODELS_DIR/toxic/"
    # curl -L -o "$TOXIC_MODEL" "$TOXIC_URL"  # Uncomment if pre-exported ONNX is available
    echo "⚠️  Toxic model not auto-downloaded. See instructions above."
fi

# --- Silero VAD ---
SILERO_URL="https://github.com/snakers4/silero-vad/raw/master/files/silero_vad.onnx"
SILERO_MODEL="$VAD_DIR/silero_vad.onnx"

if [ -f "$SILERO_MODEL" ]; then
    echo "✅ Silero VAD model already exists: $SILERO_MODEL"
else
    echo "⬇️  Downloading Silero VAD model (~2MB)..."
    curl -L -o "$SILERO_MODEL" "$SILERO_URL"
    echo "✅ Silero VAD model downloaded: $SILERO_MODEL"
fi

echo ""
echo "=== Download Summary ==="
echo "MiniLM:    $([ -f "$MINILM_MODEL" ] && echo "✅" || echo "❌") $MINILM_MODEL"
echo "Tokenizer: $([ -f "$MINILM_TOKENIZER" ] && echo "✅" || echo "❌") $MINILM_TOKENIZER"
echo "Toxic:     $([ -f "$TOXIC_MODEL" ] && echo "✅" || echo "❌") $TOXIC_MODEL"
echo "Silero:    $([ -f "$SILERO_MODEL" ] && echo "✅" || echo "❌") $SILERO_MODEL"
echo ""
echo "Next: Run 'python scripts/generate-centroids.py' to create filler/intent centroids."
