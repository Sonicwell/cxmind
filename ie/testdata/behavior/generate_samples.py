#!/usr/bin/env python3
"""
Generate PCM test samples for C2-P1 Behavioral Metrics validation.

Produces 16-bit LE signed PCM at 8000 Hz (G.711 telephony standard).
Uses macOS `say` for TTS, then converts + mixes with noise patterns.

Output files:
  1. calm_agent_30s.raw       — Steady calm agent speech
  2. angry_customer_30s.raw   — Loud, fast customer complaint
  3. long_silence_30s.raw     — Speech-silence-speech pattern
  4. background_noise_30s.raw — Speech mixed with keyboard/fan noise
  5. bilingual_30s.raw        — Chinese + English mixed speech

Each file is a single channel (mono), 8000 Hz, 16-bit signed LE.
Total size per 30s file: 8000 * 2 * 30 = 480,000 bytes
"""

import subprocess
import struct
import math
import random
import os
import tempfile
import sys

SAMPLE_RATE = 8000
DURATION_SEC = 30
TOTAL_SAMPLES = SAMPLE_RATE * DURATION_SEC
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))


def say_to_pcm(text: str, voice: str = "Samantha", rate: int = 200) -> bytes:
    """Use macOS `say` to synthesize speech, return raw PCM (8kHz 16-bit LE mono)."""
    with tempfile.NamedTemporaryFile(suffix=".aiff", delete=False) as f:
        aiff_path = f.name

    try:
        # Generate speech with macOS TTS
        subprocess.run(
            ["say", "-v", voice, "-r", str(rate), "-o", aiff_path, text],
            check=True, capture_output=True
        )

        # Convert AIFF to raw PCM using Python's audioop
        import wave
        import audioop

        # First convert AIFF to WAV using afconvert (macOS built-in)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wf:
            wav_path = wf.name

        subprocess.run(
            ["afconvert", "-f", "WAVE", "-d", "LEI16@8000", "-c", "1", aiff_path, wav_path],
            check=True, capture_output=True
        )

        # Read WAV file raw data
        with wave.open(wav_path, 'rb') as w:
            raw = w.readframes(w.getnframes())
            # Ensure mono 16-bit
            if w.getnchannels() == 2:
                raw = audioop.tomono(raw, 2, 1, 1)

        os.unlink(wav_path)
        return raw
    finally:
        os.unlink(aiff_path)


def generate_silence(duration_sec: float) -> bytes:
    """Generate silence (zero samples)."""
    n = int(SAMPLE_RATE * duration_sec)
    return struct.pack(f"<{n}h", *([0] * n))


def generate_noise(duration_sec: float, amplitude: int = 500) -> bytes:
    """Generate random noise simulating background sounds."""
    n = int(SAMPLE_RATE * duration_sec)
    samples = [random.randint(-amplitude, amplitude) for _ in range(n)]
    return struct.pack(f"<{n}h", *samples)


def generate_sine(duration_sec: float, freq: float = 440, amplitude: int = 3000) -> bytes:
    """Generate a sine wave tone."""
    n = int(SAMPLE_RATE * duration_sec)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        sample = int(amplitude * math.sin(2 * math.pi * freq * t))
        samples.append(max(-32768, min(32767, sample)))
    return struct.pack(f"<{n}h", *samples)


def generate_keyboard_clicks(duration_sec: float) -> bytes:
    """Simulate keyboard typing noise — short bursts of noise."""
    n = int(SAMPLE_RATE * duration_sec)
    samples = [0] * n
    # Insert click bursts at random intervals
    pos = 0
    while pos < n:
        gap = random.randint(int(SAMPLE_RATE * 0.1), int(SAMPLE_RATE * 0.4))
        pos += gap
        if pos >= n:
            break
        # Click duration: 5-15ms
        click_len = random.randint(int(SAMPLE_RATE * 0.005), int(SAMPLE_RATE * 0.015))
        for j in range(click_len):
            if pos + j < n:
                samples[pos + j] = random.randint(-2000, 2000)
        pos += click_len
    return struct.pack(f"<{n}h", *samples)


def mix_pcm(a: bytes, b: bytes, b_gain: float = 0.3) -> bytes:
    """Mix two PCM buffers, scaling b by b_gain."""
    n = min(len(a), len(b)) // 2
    fmt = f"<{n}h"
    samples_a = struct.unpack(fmt, a[:n * 2])
    samples_b = struct.unpack(fmt, b[:n * 2])
    mixed = []
    for sa, sb in zip(samples_a, samples_b):
        val = int(sa + sb * b_gain)
        mixed.append(max(-32768, min(32767, val)))
    return struct.pack(fmt, *mixed)


def amplify_pcm(pcm: bytes, gain: float) -> bytes:
    """Amplify or attenuate PCM data."""
    n = len(pcm) // 2
    fmt = f"<{n}h"
    samples = struct.unpack(fmt, pcm)
    amplified = [max(-32768, min(32767, int(s * gain))) for s in samples]
    return struct.pack(fmt, *amplified)


def speed_up_pcm(pcm: bytes, factor: float) -> bytes:
    """Speed up PCM by dropping samples (simple nearest-neighbor)."""
    n = len(pcm) // 2
    fmt_in = f"<{n}h"
    samples = struct.unpack(fmt_in, pcm)
    new_n = int(n / factor)
    new_samples = []
    for i in range(new_n):
        idx = int(i * factor)
        if idx < n:
            new_samples.append(samples[idx])
    return struct.pack(f"<{new_n}h", *new_samples)


def pad_or_trim(pcm: bytes, target_bytes: int) -> bytes:
    """Pad with silence or trim to exact target length."""
    if len(pcm) >= target_bytes:
        return pcm[:target_bytes]
    else:
        return pcm + b'\x00' * (target_bytes - len(pcm))


def compute_rms(pcm: bytes) -> float:
    """Compute RMS energy of PCM data."""
    n = len(pcm) // 2
    if n == 0:
        return 0
    samples = struct.unpack(f"<{n}h", pcm)
    sum_sq = sum(s * s for s in samples)
    return math.sqrt(sum_sq / n)


TARGET_BYTES = TOTAL_SAMPLES * 2  # 480000 bytes for 30s


def generate_sample_1():
    """Sample 1: Calm Agent Speech — steady moderate volume, normal pace."""
    print("Generating sample 1: calm_agent_30s.raw ...")

    # Generate enough speech to fill 30s
    texts = [
        "Hello, thank you for calling customer support. My name is Sarah. How may I help you today?",
        "I understand your concern. Let me look into that for you right away.",
        "I can see your account information here. Let me check the details.",
        "That should be resolved now. Is there anything else I can help you with?",
        "Thank you for your patience. Have a wonderful day.",
    ]

    pcm = b""
    for text in texts:
        speech = say_to_pcm(text, voice="Samantha", rate=180)
        pcm += speech
        pcm += generate_silence(1.0)  # Natural pause between sentences

    pcm = pad_or_trim(pcm, TARGET_BYTES)
    rms = compute_rms(pcm)
    print(f"  RMS energy: {rms:.1f}, length: {len(pcm)} bytes")
    return pcm


def generate_sample_2():
    """Sample 2: Angry Customer — loud, fast speech."""
    print("Generating sample 2: angry_customer_30s.raw ...")

    texts = [
        "This is absolutely unacceptable! I have been waiting for two weeks!",
        "Nobody told me about this! This is terrible service!",
        "I want to speak to your manager right now! This is ridiculous!",
        "I am going to file a complaint! You people are wasting my time!",
        "Fix this immediately or I will cancel my subscription!",
    ]

    pcm = b""
    for text in texts:
        speech = say_to_pcm(text, voice="Alex", rate=240)  # Faster speech
        speech = amplify_pcm(speech, 2.0)  # Louder
        pcm += speech
        pcm += generate_silence(0.3)  # Short angry pauses

    pcm = pad_or_trim(pcm, TARGET_BYTES)
    rms = compute_rms(pcm)
    print(f"  RMS energy: {rms:.1f}, length: {len(pcm)} bytes")
    return pcm


def generate_sample_3():
    """Sample 3: Long Silence — speech, 8s silence, speech, 5s silence, speech."""
    print("Generating sample 3: long_silence_30s.raw ...")

    part1 = say_to_pcm("Let me put you on hold for a moment while I check.", voice="Samantha", rate=170)
    silence1 = generate_silence(8.0)
    part2 = say_to_pcm("Thank you for waiting. I found the information.", voice="Samantha", rate=170)
    silence2 = generate_silence(5.0)
    part3 = say_to_pcm("Your request has been processed successfully.", voice="Samantha", rate=170)

    pcm = part1 + silence1 + part2 + silence2 + part3
    pcm = pad_or_trim(pcm, TARGET_BYTES)
    rms = compute_rms(pcm)
    print(f"  RMS energy: {rms:.1f}, length: {len(pcm)} bytes")
    return pcm


def generate_sample_4():
    """Sample 4: Background Noise — speech mixed with keyboard clicks + fan hum."""
    print("Generating sample 4: background_noise_30s.raw ...")

    texts = [
        "I can help you with that billing question.",
        "Let me pull up your account details now.",
        "The charge you see is from last month processing.",
    ]

    speech = b""
    for text in texts:
        s = say_to_pcm(text, voice="Samantha", rate=180)
        speech += s
        speech += generate_silence(1.5)

    speech = pad_or_trim(speech, TARGET_BYTES)

    # Generate background noise layers
    keyboard = generate_keyboard_clicks(DURATION_SEC)
    fan_hum = generate_sine(DURATION_SEC, freq=120, amplitude=400)  # Low-freq fan
    ambient = generate_noise(DURATION_SEC, amplitude=200)

    # Mix: speech + keyboard (0.5) + fan (0.3) + ambient (0.2)
    pcm = mix_pcm(speech, keyboard, 0.5)
    pcm = mix_pcm(pcm, fan_hum, 0.3)
    pcm = mix_pcm(pcm, ambient, 0.2)

    rms = compute_rms(pcm)
    print(f"  RMS energy: {rms:.1f}, length: {len(pcm)} bytes")
    return pcm


def generate_sample_5():
    """Sample 5: Bilingual — Chinese + English mixed speech."""
    print("Generating sample 5: bilingual_30s.raw ...")

    # Check available Chinese voices
    result = subprocess.run(["say", "-v", "?"], capture_output=True, text=True)
    chinese_voices = [line.split()[0] for line in result.stdout.splitlines()
                      if "zh_CN" in line or "zh_TW" in line]

    cn_voice = chinese_voices[0] if chinese_voices else "Ting-Ting"
    print(f"  Using Chinese voice: {cn_voice}")

    segments = [
        ("您好，请问有什么可以帮您的？", cn_voice, 180),
        ("I need help with my order number A B C one two three.", "Samantha", 180),
        ("好的，我来查询一下您的订单信息。", cn_voice, 180),
        ("The tracking shows it was shipped yesterday.", "Samantha", 180),
        ("明白了，谢谢您的帮助。", cn_voice, 180),
        ("You are welcome. Have a nice day!", "Samantha", 180),
    ]

    pcm = b""
    for text, voice, rate in segments:
        try:
            speech = say_to_pcm(text, voice=voice, rate=rate)
            pcm += speech
        except Exception as e:
            print(f"  Warning: voice {voice} failed for '{text[:20]}...': {e}")
            # Fallback to default
            speech = say_to_pcm(text, voice="Samantha", rate=rate)
            pcm += speech
        pcm += generate_silence(1.0)

    pcm = pad_or_trim(pcm, TARGET_BYTES)
    rms = compute_rms(pcm)
    print(f"  RMS energy: {rms:.1f}, length: {len(pcm)} bytes")
    return pcm


def generate_vad_comparison_pair():
    """Generate a pair for VAD comparison: clean speech + same speech with noise."""
    print("Generating VAD comparison pair ...")

    text = "This is a test sentence for voice activity detection comparison."
    clean = say_to_pcm(text, voice="Samantha", rate=180)

    # Pad to 10s
    target = SAMPLE_RATE * 2 * 10
    clean = pad_or_trim(clean, target)

    # Add noise at different levels
    noise_low = generate_noise(10, amplitude=100)
    noise_mid = generate_noise(10, amplitude=400)
    noise_high = generate_noise(10, amplitude=1500)

    noisy_low = mix_pcm(clean, noise_low, 1.0)
    noisy_mid = mix_pcm(clean, noise_mid, 1.0)
    noisy_high = mix_pcm(clean, noise_high, 1.0)

    return clean, noisy_low, noisy_mid, noisy_high


def main():
    print(f"=== C2-P1 Behavioral Metrics Test Sample Generator ===")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Format: 8000 Hz, 16-bit signed LE, mono")
    print(f"Duration: {DURATION_SEC}s per sample ({TARGET_BYTES} bytes)")
    print()

    # --- Main test samples ---
    samples = {
        "calm_agent_30s.raw": generate_sample_1,
        "angry_customer_30s.raw": generate_sample_2,
        "long_silence_30s.raw": generate_sample_3,
        "background_noise_30s.raw": generate_sample_4,
        "bilingual_30s.raw": generate_sample_5,
    }

    rms_values = {}
    for filename, generator in samples.items():
        pcm = generator()
        path = os.path.join(OUTPUT_DIR, filename)
        with open(path, "wb") as f:
            f.write(pcm)
        rms_values[filename] = compute_rms(pcm)
        print(f"  ✅ Written {path} ({len(pcm)} bytes)")
        print()

    # --- VAD comparison samples ---
    clean, noisy_low, noisy_mid, noisy_high = generate_vad_comparison_pair()

    vad_files = {
        "vad_clean_10s.raw": clean,
        "vad_noisy_low_10s.raw": noisy_low,
        "vad_noisy_mid_10s.raw": noisy_mid,
        "vad_noisy_high_10s.raw": noisy_high,
    }

    for filename, pcm in vad_files.items():
        path = os.path.join(OUTPUT_DIR, filename)
        with open(path, "wb") as f:
            f.write(pcm)
        rms_values[filename] = compute_rms(pcm)
        print(f"  ✅ Written {path} ({len(pcm)} bytes)")

    # --- Summary ---
    print()
    print("=" * 60)
    print("SUMMARY — RMS Energy Comparison")
    print("=" * 60)
    print(f"{'File':<30} {'RMS Energy':>12} {'Expected VAD':>15}")
    print("-" * 60)
    for filename, rms in rms_values.items():
        if "calm" in filename:
            expected = "Speech OK"
        elif "angry" in filename:
            expected = "Loud Speech"
        elif "silence" in filename:
            expected = "Mixed"
        elif "background" in filename:
            expected = "Noise + Speech"
        elif "bilingual" in filename:
            expected = "Speech OK"
        elif "clean" in filename:
            expected = "Speech OK"
        elif "low" in filename:
            expected = "Speech + Low Noise"
        elif "mid" in filename:
            expected = "Speech + Mid Noise"
        elif "high" in filename:
            expected = "Noise Dominates"
        else:
            expected = "?"
        print(f"{filename:<30} {rms:>12.1f} {expected:>15}")

    print()
    print("VAD NOISE FILTERING TEST:")
    print("  - vad_clean_10s.raw:      100% speech should pass VAD")
    print("  - vad_noisy_low_10s.raw:  ~95% speech should pass (low floor noise)")
    print("  - vad_noisy_mid_10s.raw:  ~70% speech should pass (some false positives on noise)")
    print("  - vad_noisy_high_10s.raw: ~40% — noise may trigger false speech detection")
    print()
    print("  → Compare VAD pass rates across these 4 files to measure noise filtering quality.")
    print("  → Silero VAD should have HIGHER pass rate on clean + LOWER false positive on noisy.")


if __name__ == "__main__":
    main()
