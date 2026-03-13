#!/usr/bin/env python3
"""
Generate multilingual filler and intent centroid embeddings for TextFilter.

Requirements:
    pip install onnxruntime tokenizers numpy
    (or: pip install sentence-transformers numpy)

Models needed:
    models/textfilter/minilm.onnx       (downloaded by download-textfilter-models.sh)
    models/textfilter/tokenizer.json    (downloaded by download-textfilter-models.sh)

Run from services/ingestion-go/:
    python3 scripts/generate-centroids.py

Output:
    models/textfilter/filler_centroids.json
    models/textfilter/intent_centroids.json
"""

import json
import os
import sys
import numpy as np


# ─── Multilingual Phrases (ZH/EN/JA/KO/ES/AR) ───────────────────

FILLER_PHRASES = {
    "greeting": [
        # Chinese
        "你好", "您好", "早上好", "下午好", "晚上好",
        # English
        "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
        # Japanese
        "こんにちは", "おはようございます", "こんばんは",
        # Korean
        "안녕하세요", "좋은 아침이에요", "좋은 오후예요",
        # Spanish
        "hola", "buenos días", "buenas tardes", "buenas noches",
        # Arabic
        "مرحبا", "صباح الخير", "مساء الخير",
    ],
    "filler": [
        # Chinese
        "嗯", "啊", "哦", "额", "那个", "就是",
        # English
        "um", "uh", "well", "like", "you know", "so",
        # Japanese
        "えーと", "あのー", "そうですね", "まあ",
        # Korean
        "음", "어", "그", "저기", "글쎄",
        # Spanish
        "pues", "bueno", "este", "o sea",
        # Arabic
        "يعني", "اممم", "طيب",
    ],
    "acknowledgment": [
        # Chinese
        "好的", "好", "行", "嗯好", "知道了", "明白了", "没问题",
        # English
        "ok", "okay", "sure", "got it", "I see", "right", "understood",
        # Japanese
        "はい", "わかりました", "了解です", "承知しました",
        # Korean
        "네", "알겠습니다", "그렇군요", "이해했습니다",
        # Spanish
        "sí", "vale", "de acuerdo", "entendido", "claro",
        # Arabic
        "نعم", "حسنا", "فهمت", "تمام",
    ],
    "closing": [
        # Chinese
        "再见", "拜拜", "谢谢", "没有了", "没别的了",
        # English
        "goodbye", "bye", "thank you", "thanks", "have a nice day",
        # Japanese
        "さようなら", "ありがとうございます", "失礼します", "お疲れ様です",
        # Korean
        "감사합니다", "안녕히 계세요", "수고하세요",
        # Spanish
        "adiós", "gracias", "hasta luego", "que tenga buen día",
        # Arabic
        "مع السلامة", "شكرا", "إلى اللقاء",
    ],
}

INTENT_PHRASES = {
    "refund": [
        # Chinese
        "我要退款", "退款", "退钱", "把钱退给我", "退货退款",
        # English
        "I want a refund", "refund", "return the money", "money back", "get my money back",
        # Japanese
        "返金してほしい", "返品したい", "払い戻しをお願いします",
        # Korean
        "환불해 주세요", "환불 요청", "돈 돌려주세요",
        # Spanish
        "quiero un reembolso", "devolución", "devuélveme el dinero",
        # Arabic
        "أريد استرداد المال", "استرجاع", "أعيدوا لي المال",
    ],
    "complaint": [
        # Chinese
        "投诉", "我要投诉", "这个太差了", "非常不满意", "质量太差", "服务太差",
        # English
        "I want to complain", "complaint", "terrible service", "very dissatisfied", "unacceptable",
        # Japanese
        "苦情を言いたい", "サービスが悪い", "ひどい", "不満です",
        # Korean
        "불만", "항의하고 싶어요", "서비스가 너무 나빠요", "불만족",
        # Spanish
        "quiero quejarme", "servicio terrible", "muy insatisfecho", "inaceptable",
        # Arabic
        "أريد تقديم شكوى", "خدمة سيئة", "غير مقبول",
    ],
    "inquiry": [
        # Chinese
        "咨询", "我想问一下", "请问", "想了解", "查询", "能帮我查一下吗",
        # English
        "I'd like to ask", "inquiry", "question", "can you check", "I have a question",
        # Japanese
        "お聞きしたいのですが", "質問があります", "確認したい", "教えてください",
        # Korean
        "문의드립니다", "질문이 있어요", "확인해 주세요",
        # Spanish
        "quisiera preguntar", "consulta", "tengo una pregunta",
        # Arabic
        "أريد أن أسأل", "استفسار", "عندي سؤال",
    ],
    "order": [
        # Chinese
        "下单", "我要买", "购买", "订购", "加入购物车",
        # English
        "I want to order", "place an order", "buy", "purchase", "add to cart",
        # Japanese
        "注文したい", "購入したい", "買いたい", "カートに入れたい",
        # Korean
        "주문하고 싶어요", "구매", "사고 싶어요",
        # Spanish
        "quiero hacer un pedido", "comprar", "ordenar",
        # Arabic
        "أريد الطلب", "شراء", "أريد أن أشتري",
    ],
    "technical_support": [
        # Chinese
        "技术问题", "无法使用", "系统故障", "报错了", "打不开", "连不上", "用不了",
        # English
        "technical issue", "not working", "error", "system down", "can't access", "broken",
        # Japanese
        "技術的な問題", "動かない", "エラーが出る", "接続できない",
        # Korean
        "기술 문제", "작동하지 않아요", "오류", "접속이 안 돼요",
        # Spanish
        "problema técnico", "no funciona", "error del sistema",
        # Arabic
        "مشكلة تقنية", "لا يعمل", "خطأ في النظام",
    ],
    "account": [
        # Chinese
        "修改密码", "账户问题", "登录不了", "忘记密码", "更新信息",
        # English
        "change password", "account issue", "can't login", "forgot password", "update info",
        # Japanese
        "パスワード変更", "ログインできない", "アカウント問題",
        # Korean
        "비밀번호 변경", "로그인이 안 돼요", "계정 문제",
        # Spanish
        "cambiar contraseña", "no puedo iniciar sesión", "problema con la cuenta",
        # Arabic
        "تغيير كلمة المرور", "مشكلة في الحساب", "لا أستطيع تسجيل الدخول",
    ],
}


def try_onnx_runtime():
    """Generate centroids using ONNX Runtime (lower memory)."""
    import onnxruntime as ort
    from tokenizers import Tokenizer

    MODEL_PATH = "models/textfilter/minilm.onnx"
    TOKENIZER_PATH = "models/textfilter/tokenizer.json"

    print("Loading ONNX model...")
    session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
    print("Loading tokenizer...")
    tokenizer = Tokenizer.from_file(TOKENIZER_PATH)
    tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
    tokenizer.enable_truncation(max_length=128)

    def encode_texts(texts):
        encoded = tokenizer.encode_batch(texts)
        input_ids = np.array([e.ids for e in encoded], dtype=np.int64)
        attention_mask = np.array([e.attention_mask for e in encoded], dtype=np.int64)
        token_type_ids = np.zeros_like(input_ids)
        outputs = session.run(None, {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "token_type_ids": token_type_ids,
        })
        token_embs = outputs[0]
        mask_expanded = attention_mask[:, :, np.newaxis].astype(np.float32)
        sum_embs = np.sum(token_embs * mask_expanded, axis=1)
        sum_mask = np.sum(mask_expanded, axis=1)
        mean_embs = sum_embs / np.maximum(sum_mask, 1e-9)
        norms = np.linalg.norm(mean_embs, axis=1, keepdims=True)
        return mean_embs / np.maximum(norms, 1e-9)

    return encode_texts


def try_sentence_transformers():
    """Generate centroids using sentence-transformers (higher memory)."""
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2", device="cpu")
    print(f"Model loaded. Embedding dim: {model.get_sentence_embedding_dimension()}")

    def encode_texts(texts):
        return model.encode(texts, normalize_embeddings=True, batch_size=8)

    return encode_texts


def generate_centroids(encode_fn, phrases_dict):
    centroids = []
    for label, phrases in phrases_dict.items():
        embeddings = encode_fn(phrases)
        centroid = np.mean(embeddings, axis=0)
        centroid = centroid / np.linalg.norm(centroid)
        centroids.append({
            "label": label,
            "embedding": centroid.tolist(),
        })
        print(f"  {label}: {len(phrases)} phrases → {embeddings.shape[1]}D")
    return centroids


def main():
    os.makedirs("models/textfilter", exist_ok=True)

    # Try ONNX Runtime first (lower memory), fallback to sentence-transformers
    encode_fn = None
    try:
        encode_fn = try_onnx_runtime()
        print("Using ONNX Runtime backend")
    except Exception as e:
        print(f"ONNX Runtime failed: {e}")
        try:
            encode_fn = try_sentence_transformers()
            print("Using sentence-transformers backend")
        except Exception as e2:
            print(f"sentence-transformers also failed: {e2}")
            print("\nPlease install one of:")
            print("  pip install onnxruntime tokenizers numpy")
            print("  pip install sentence-transformers numpy")
            sys.exit(1)

    # Generate filler centroids
    print("\n=== Generating Multilingual Filler Centroids ===")
    filler_centroids = generate_centroids(encode_fn, FILLER_PHRASES)
    with open("models/textfilter/filler_centroids.json", "w", encoding="utf-8") as f:
        json.dump(filler_centroids, f, indent=2, ensure_ascii=False)
    print(f"✅ Saved {len(filler_centroids)} filler centroids")

    # Generate intent centroids
    print("\n=== Generating Multilingual Intent Centroids ===")
    intent_centroids = generate_centroids(encode_fn, INTENT_PHRASES)
    with open("models/textfilter/intent_centroids.json", "w", encoding="utf-8") as f:
        json.dump(intent_centroids, f, indent=2, ensure_ascii=False)
    print(f"✅ Saved {len(intent_centroids)} intent centroids")

    # Verification with multilingual samples
    print("\n=== Multilingual Verification ===")
    test_texts = [
        ("你好", "filler/greeting"),
        ("hello", "filler/greeting"),
        ("こんにちは", "filler/greeting"),
        ("안녕하세요", "filler/greeting"),
        ("hola", "filler/greeting"),
        ("مرحبا", "filler/greeting"),
        ("我要退款", "intent/refund"),
        ("I want a refund", "intent/refund"),
        ("返金してほしい", "intent/refund"),
        ("환불해 주세요", "intent/refund"),
        ("嗯嗯好的", "filler/acknowledgment"),
        ("technical issue", "intent/technical_support"),
    ]
    for text, expected in test_texts:
        emb = encode_fn([text])[0]
        bf = max(filler_centroids, key=lambda c: np.dot(emb, c["embedding"]))
        fs = np.dot(emb, bf["embedding"])
        bi = max(intent_centroids, key=lambda c: np.dot(emb, c["embedding"]))
        ins = np.dot(emb, bi["embedding"])
        print(f'  "{text}" → filler:{bf["label"]}({fs:.3f}) intent:{bi["label"]}({ins:.3f})  [{expected}]')

    print("\n✅ Done! Multilingual centroids ready for IE TextFilter.")


if __name__ == "__main__":
    main()
