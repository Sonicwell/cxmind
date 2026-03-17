/**
 * CXMind Demo Showcase Page
 *
 * Interactive demo page with 6 tabs to showcase CXMind AI capabilities:
 * 1. ASR Vendor Playground — switch vendors, compare transcription
 * 2. VAD Effectiveness — waveform visualization + filtering metrics
 * 3. Emotion & Stress — SER ONNX inference + stress scoring
 * 4. LLM AI Features — sentiment, QI, summary, outcome, checklist
 * 5. RAG Knowledge — vector search + AI suggestions
 * 6. Pipeline Overview — end-to-end flow diagram
 */
import { Checkbox } from '../components/ui/Checkbox';
import { Textarea } from '../components/ui/Textarea';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Badge } from '../components/ui/badge';
import { useTranslation } from 'react-i18next';
import { useTabParam } from '../hooks/useTabParam';
import {
    Mic, Upload, Play, BarChart3, Brain, Zap, Network,
    FileAudio, Loader2, CheckCircle2, Download,
    Sparkles, Volume2, VolumeX, Activity, Gauge, ArrowRight, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { STORAGE_KEYS } from '../constants/storage-keys';
import api, { getPlatformSettings } from '../services/api';
import '../styles/cxmind-demo.css';

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

// Direct API helper that bypasses the demo mode mock adapter
// (CXMind Demo page always uses real inference, even in demo mode)
const demoApi = {
    post: async (url: string, data: any) => {
        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)
            || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        const baseURL = (import.meta as any).env?.VITE_API_URL || '/api';
        const res = await fetch(`${baseURL}/demo${url}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `API error: ${res.status}`);
        }
        return res.json();
    },
    get: async (url: string) => {
        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)
            || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        const baseURL = (import.meta as any).env?.VITE_API_URL || '/api';
        const res = await fetch(`${baseURL}/demo${url}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `API error: ${res.status}`);
        }
        return res.json();
    },
};

// ─── Types ───────────────────────────────────────────────────────────────

interface GroundTruthSegment {
    speaker: string;
    text: string;
    emotion: string;
    start_ms: number;
    end_ms: number;
}

interface GroundTruth {
    [scenario: string]: {
        title: string;
        description: string;
        total_duration_ms: number;
        segments: GroundTruthSegment[];
        expected_emotions: string[];
        network: { jitter_ms: number; loss_pct: number; rtt_ms: number };
        full_transcript: string;
    };
}

interface SERResult {
    emotions?: Array<{ emotion: string; confidence: number; arousal: number; valence: number; start?: number; end?: number }>;
    dominant?: string;
    avg_arousal?: number;
    avg_valence?: number;
    vendor?: string;
    latency_ms?: number;
    stress_score?: number;
}

type TabId = 'asr' | 'vad' | 'emotion' | 'llm' | 'rag' | 'pipeline' | 'pcap' | 'live_emotion' | 'pii';

// ─── Demo Samples ────────────────────────────────────────────────────────

const DEMO_SAMPLES_STATIC = [
    { id: 'standard_service', labelKey: 'demo.samples.standard', fallback: 'Standard Service', icon: '🎧', file: '/demo-samples/standard_service.pcap', wav: '/demo-samples/standard_service.wav' },
    { id: 'angry_complaint', labelKey: 'demo.samples.angry', fallback: 'Angry Complaint', icon: '😡', file: '/demo-samples/angry_complaint.pcap', wav: '/demo-samples/angry_complaint.wav' },
    { id: 'noisy_environment', labelKey: 'demo.samples.noisy', fallback: 'Noisy Environment', icon: '🔊', file: '/demo-samples/noisy_environment.pcap', wav: '/demo-samples/noisy_environment.wav' },
];

// Inline audio player for preset samples
function SampleAudioPlayer({ sampleId }: { sampleId: string | null }) {
    const { t } = useTranslation();
    const sample = DEMO_SAMPLES_STATIC.find(s => s.id === sampleId);
    if (!sample) return null;
    return (
        <div style={{
            marginTop: 12,
            padding: '10px 14px',
            background: 'rgba(0,0,0,0.03)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
        }}>
            <Volume2 size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                {t(sample.labelKey, sample.fallback)}
            </span>
            <audio controls src={sample.wav}
                style={{ flex: 1, height: 32 }} />
        </div>
    );
}

const SAMPLE_CONVERSATIONS = [
    {
        id: 'positive',
        label: 'Positive Interaction',
        text: `Agent: Good morning! Thank you for calling CXMind. How can I help you today?\nCustomer: Hi, I placed an order last week and I just wanted to check when it will arrive.\nAgent: Of course! Let me look that up for you. I can see your order was shipped yesterday and should arrive by Friday.\nCustomer: That's great news! Thank you so much for your help.\nAgent: You're welcome! Is there anything else I can assist you with?\nCustomer: No, that's all. Have a wonderful day!\nAgent: Thank you, you too! Goodbye.`,
    },
    {
        id: 'negative',
        label: 'Complaint Escalation',
        text: `Agent: Thank you for calling, how may I assist you?\nCustomer: I've been waiting three weeks for my refund and nobody has helped me! This is ridiculous!\nAgent: I'm very sorry about the delay. Let me look into this right away.\nCustomer: Every time I call, I get the same response. I want to speak to a manager!\nAgent: I completely understand your frustration. Let me escalate this immediately and process your refund today.\nCustomer: Fine. But if this isn't resolved, I'm switching to your competitor.\nAgent: I've submitted the expedited refund. You'll see it in your account within 24 hours.`,
    },
    {
        id: 'technical',
        label: 'Technical Support',
        text: `Agent: Technical support, how can I help?\nCustomer: My internet keeps disconnecting every 10 minutes. I work from home and this is causing serious problems.\nAgent: I understand how frustrating that must be. Let me run a remote diagnostic on your connection.\nCustomer: I've already restarted the router three times today.\nAgent: I can see the issue — your router firmware is outdated, which is causing the disconnections.\nCustomer: Can you fix it remotely?\nAgent: Yes, I'm pushing a firmware update now. It should take about 5 minutes. Your connection will restart automatically.\nCustomer: Thank you, I really appreciate the quick help.`,
    },
];

const EMOTION_COLORS: Record<string, string> = {
    angry: '#ef4444', disgusted: '#a855f7', fearful: '#f59e0b',
    happy: '#22c55e', neutral: '#6b7280', sad: '#3b82f6', surprised: '#ec4899',
};

// ─── Tab Definitions ─────────────────────────────────────────────────────

const TABS_STATIC: { id: TabId; labelKey: string; fallback: string; icon: React.ReactNode; descKey: string; descFallback: string }[] = [
    { id: 'asr', labelKey: 'demo.tabs.asr.label', fallback: 'ASR Playground', icon: <Mic size={18} />, descKey: 'demo.tabs.asr.desc', descFallback: 'Compare ASR vendors' },
    { id: 'vad', labelKey: 'demo.tabs.vad.label', fallback: 'VAD Effectiveness', icon: <VolumeX size={18} />, descKey: 'demo.tabs.vad.desc', descFallback: 'Voice Activity Detection' },
    { id: 'emotion', labelKey: 'demo.tabs.emotion.label', fallback: 'Live Emotion & Stress', icon: <Gauge size={18} />, descKey: 'demo.tabs.emotion.desc', descFallback: 'Real-time WebSocket' },
    { id: 'llm', labelKey: 'demo.tabs.llm.label', fallback: 'LLM AI Features', icon: <Sparkles size={18} />, descKey: 'demo.tabs.llm.desc', descFallback: 'Text Analysis' },
    { id: 'rag', labelKey: 'demo.tabs.rag.label', fallback: 'RAG Knowledge', icon: <Network size={18} />, descKey: 'demo.tabs.rag.desc', descFallback: 'Vector Search' },
    { id: 'pipeline', labelKey: 'demo.tabs.pipeline.label', fallback: 'Pipeline', icon: <Activity size={18} />, descKey: 'demo.tabs.pipeline.desc', descFallback: 'End-to-End Flow' },
    { id: 'pcap', labelKey: 'demo.tabs.pcap.label', fallback: 'Protocol Inspector', icon: <Activity size={18} />, descKey: 'demo.tabs.pcap.desc', descFallback: 'Auto-Analyze SIP PCAPs' },
    { id: 'live_emotion', labelKey: 'demo.tabs.liveEmotion.label', fallback: 'Full Audio Emotion', icon: <Brain size={18} />, descKey: 'demo.tabs.liveEmotion.desc', descFallback: 'Offline / Static SER' },
    { id: 'pii', labelKey: 'demo.tabs.pii.label', fallback: 'Data Desensitization', icon: <ShieldCheck size={18} />, descKey: 'demo.tabs.pii.desc', descFallback: 'Regex & AI NER' },
];

// ─── Main Component ──────────────────────────────────────────────────────

export default function CXMindDemo() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useTabParam<TabId>('tab', 'asr');
    const [groundTruth, setGroundTruth] = useState<GroundTruth | null>(null);

    useEffect(() => {
        fetch('/demo-samples/ground_truth.json')
            .then(r => r.json())
            .then(setGroundTruth)
            .catch(() => console.warn('Ground truth not loaded'));
    }, []);

    return (
        <div className="cxmind-demo">
            {/* Header */}
            <div className="demo-header">
                <div className="demo-header-text">
                    <h1><Sparkles size={28} className="header-icon" /> {t('demo.title', 'CXMind AI Demo')}</h1>
                    <p>{t('demo.subtitle', "Interactive showcase of CXMind's core AI capabilities. Upload audio files or use preset examples to see real-time inference.")}</p>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="demo-tabs">
                {TABS_STATIC.map(tab => (
                    <Button
                        key={tab.id}
                        className={`demo-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.icon}
                        <span className="tab-label">{t(tab.labelKey, tab.fallback)}</span>
                        <span className="tab-desc">{t(tab.descKey, tab.descFallback)}</span>
                    </Button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="demo-content">
                {activeTab === 'asr' && <ASRTab groundTruth={groundTruth} />}
                {activeTab === 'vad' && <VADTab groundTruth={groundTruth} />}
                {activeTab === 'emotion' && <LiveEmotionRadar />}
                {activeTab === 'llm' && <LLMTab />}
                {activeTab === 'rag' && <RAGTab />}
                {activeTab === 'pipeline' && <PipelineTab />}
                {activeTab === 'pcap' && <SipInspector />}
                {activeTab === 'live_emotion' && <EmotionTab />}
                {activeTab === 'pii' && <PIITab />}
            </div>
        </div>
    );
}

// ─── File Upload Hook ────────────────────────────────────────────────────

function useFileUpload(accept: string) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) setFile(f);
    }, []);

    const triggerUpload = useCallback(() => inputRef.current?.click(), []);

    return {
        inputRef, file, setFile, dragOver, setDragOver, handleDrop, triggerUpload,
        DropZone: ({ children }: { children: React.ReactNode }) => (
            <div
                className={`drop-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={triggerUpload}
            >
                <Input ref={inputRef} type="file" accept={accept} hidden
                    onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }} />
                {children}
            </div>
        ),
    };
}

// ─── Audio Helpers ───────────────────────────────────────────────────────

/** Decode WAV/MP3 file to raw PCM (signed 16-bit LE, mono) using Web Audio API */
async function audioFileToPCM(file: File): Promise<{ pcm: ArrayBuffer; sampleRate: number }> {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = decoded.getChannelData(0); // mono (left channel)
    const sampleRate = decoded.sampleRate;

    // Float32 -> Int16 LE
    const int16 = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    audioCtx.close();
    return { pcm: int16.buffer, sampleRate };
}

/** Send raw PCM binary to a demo API endpoint */
async function sendPCM(path: string, pcm: ArrayBuffer, sampleRate: number, extra: Record<string, string> = {}): Promise<any> {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)
        || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    const baseURL = (import.meta as any).env?.VITE_API_URL || '/api';
    const params = new URLSearchParams({ sample_rate: String(sampleRate), ...extra });
    const res = await fetch(`${baseURL}/demo${path}?${params}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/octet-stream',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: pcm,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `API error: ${res.status}`);
    }
    return res.json();
}

/** Compute Word Error Rate (WER) between hypothesis and reference text. Returns 0-100%. */
function computeWER(hypothesis: string, reference: string): number {
    const hyp = hypothesis.toLowerCase().replace(/[^\w\s]/g, '').trim().split(/\s+/).filter(Boolean);
    const ref = reference.toLowerCase().replace(/[^\w\s]/g, '').trim().split(/\s+/).filter(Boolean);
    if (ref.length === 0) return hyp.length === 0 ? 0 : 100;
    // Levenshtein on word arrays
    const n = ref.length, m = hyp.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) dp[i][0] = i;
    for (let j = 0; j <= m; j++) dp[0][j] = j;
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            dp[i][j] = ref[i - 1] === hyp[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return Math.min(100, (dp[n][m] / ref.length) * 100);
}

/** Filter PCM to keep only speech segments (as detected by VAD). */
function filterPCMBySpeechSegments(
    pcm: ArrayBuffer, _sampleRate: number,
    segments: Array<{ start: number; end: number; speech: boolean }>
): ArrayBuffer {
    const totalSamples = pcm.byteLength / 2;
    const src = new Int16Array(pcm);
    const speechParts: Int16Array[] = [];
    for (const seg of segments) {
        if (!seg.speech) continue;
        const from = Math.floor(seg.start * totalSamples);
        const to = Math.min(Math.floor(seg.end * totalSamples), totalSamples);
        if (to > from) speechParts.push(src.slice(from, to));
    }
    const totalLen = speechParts.reduce((s, p) => s + p.length, 0);
    const out = new Int16Array(totalLen);
    let offset = 0;
    for (const part of speechParts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out.buffer;
}

/** Download JSON data as a file */
function downloadJSON(data: object, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Tab Components ───────────────────────────────────────────────────────

// ─── Native SIP Inspector Component (Migrated from Landing)
function SipInspector() {
    const { t } = useTranslation();
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const logEndRef = useRef<HTMLDivElement>(null);

    const SIP_API = "/demo/analyze/sip";

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    };

    const handleFileUpload = async (uploadedFile: File) => {
        setFile(uploadedFile);
        setIsAnalyzing(true);
        setLogs([`> Uploading ${uploadedFile.name} (${(uploadedFile.size / 1024).toFixed(1)} KB)...`]);

        const formData = new FormData();
        formData.append("file", uploadedFile);

        try {
            const res = await fetch(SIP_API, {
                method: "POST",
                body: formData
            });

            const data = await res.json();

            setLogs(prev => [...prev, `> Parsing complete. Explored ${data.packets_parsed || 0} SIP packets.`]);
            await new Promise(r => setTimeout(r, 600));

            if (data.anomalies && data.anomalies.length > 0) {
                setLogs(prev => [...prev, `> Validating RFC 3261 constraints... [FAILED]`]);
                await new Promise(r => setTimeout(r, 400));
                data.anomalies.forEach((a: any) => {
                    setLogs(prev => [...prev, `[DEFECT_DETECTED] Rule: ${a.rule}`]);
                    setLogs(prev => [...prev, `    < ${a.desc} >`]);
                });
            } else {
                setLogs(prev => [...prev, `> Validating RFC 3261 constraints... [PASSED]`]);
                setLogs(prev => [...prev, `[CLEAN] No anomalies detected.`]);
            }
        } catch (error) {
            setLogs(prev => [...prev, `[ERROR] Connection refused. Is API server running?`]);
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className="tab-section">
            <div className="section-grid two-col" style={{ minHeight: 500 }}>
                {/* Left: Input */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ marginBottom: 20 }}>
                        <h3 style={{ textDecoration: 'underline', textDecorationColor: 'var(--primary)' }}>{t('demo.pcap.title', 'Deep Packet Inspector')}</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('demo.pcap.desc', 'Drop a .pcap file to automatically detect missing ACKs or Session Update timeouts.')}</p>
                    </div>

                    {!file && (
                        <label
                            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl cursor-pointer transition-colors`}
                            style={{ flex: 1, borderColor: isDragging ? 'var(--primary)' : 'rgba(255,255,255,0.1)', background: isDragging ? 'rgba(139,92,246,0.05)' : 'transparent' }}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setIsDragging(false);
                                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                    handleFileUpload(e.dataTransfer.files[0]);
                                }
                            }}
                        >
                            <Upload size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{t('demo.pcap.dropPrompt', 'Click or drag PCAP file here')}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t('demo.pcap.maxSize', 'Max size: 10MB')}</div>
                            <Input type="file" style={{ display: 'none' }} accept=".pcap,.pcapng" onChange={onFileChange} />
                        </label>
                    )}
                </div>

                {/* Right: Terminal logs */}
                {file && (
                    <div className="glass-card" style={{ padding: 0 }}>
                        <div style={{ background: '#050505', height: '100%', borderRadius: 'inherit', padding: 16, fontFamily: 'monospace', fontSize: '0.75rem', overflowY: 'auto', position: 'relative' }}>
                            <Button
                                onClick={() => { setFile(null); setLogs([]); }}
                                style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: '0.65rem' }}
                            >
                                {t('common.reset', 'Reset')}
                            </Button>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {logs.map((log, i) => (
                                    <div key={i} style={{ color: log.includes('[DEFECT_DETECTED]') || log.includes('FAILED') ? '#ef4444' : log.includes('[CLEAN]') || log.includes('PASSED') ? '#10b981' : '#94a3b8' }}>
                                        {log}
                                    </div>
                                ))}
                                {isAnalyzing && (
                                    <div style={{ width: 8, height: 16, background: 'var(--primary)', marginTop: 8, animation: 'pulse 0.8s infinite' }} />
                                )}
                                <div ref={logEndRef} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Native Emotion Radar Component (Migrated from Landing)

function LiveEmotionRadar() {
    const { t } = useTranslation();
    const [isRecording, setIsRecording] = useState(false);
    const [emotionData, setEmotionData] = useState<{ emotion: string, valance: number, energy: number, confidence: number } | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
    const [serError, setSerError] = useState<string | null>(null);
    const [voiceState, setVoiceState] = useState<'active' | 'paused' | 'warning' | 'stopped'>('stopped');
    const [countdownSec, setCountdownSec] = useState(0);

    const wsRef = useRef<WebSocket | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const animationRef = useRef<number | null>(null);
    const silenceTimeoutRef = useRef<number | null>(null);
    const lastVoiceTimeRef = useRef<number>(Date.now());
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const isPausedRef = useRef(false);
    const stopReasonRef = useRef<string | null>(null);

    const getWsUrl = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/api/demo/emotion/ws`;
    };

    const EMOTION_WS = getWsUrl();

    // ── Waveform drawing ──
    const drawWaveform = useCallback(() => {
        const canvas = canvasRef.current;
        const analyser = analyserRef.current;
        if (!canvas || !analyser || !streamRef.current) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Gradient stroke: cyan → purple
        const gradient = ctx.createLinearGradient(0, 0, w, 0);
        gradient.addColorStop(0, '#06b6d4');
        gradient.addColorStop(0.5, '#8b5cf6');
        gradient.addColorStop(1, '#06b6d4');

        ctx.lineWidth = 2;
        ctx.strokeStyle = gradient;
        ctx.beginPath();

        const sliceWidth = w / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * h) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
        }

        ctx.lineTo(w, h / 2);
        ctx.stroke();

        // Glow effect
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
        ctx.beginPath();
        x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * h) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
        }
        ctx.lineTo(w, h / 2);
        ctx.stroke();
    }, []);

    const toggleRecording = async () => {
        if (serError) return;
        if (isRecording) {
            stopRecording('user');
        } else {
            startRecording();
        }
    };

    const startRecording = async () => {
        if (serError) return;
        stopReasonRef.current = null;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 8000 });
            audioContextRef.current = audioCtx;
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;
            const source = audioCtx.createMediaStreamSource(stream);

            // ScriptProcessor for PCM extraction
            const processor = audioCtx.createScriptProcessor(4096, 1, 1);
            source.connect(analyser);
            source.connect(processor);
            processor.connect(audioCtx.destination);

            const freqData = new Uint8Array(analyser.frequencyBinCount);

            lastVoiceTimeRef.current = Date.now();
            isPausedRef.current = false;

            const SILENCE_THRESHOLD = 0.02;
            const PAUSE_MS = 3000;   // 3s → pause sending
            const WARNING_MS = 8000; // 8s → show countdown
            const STOP_MS = 15000;   // 15s → auto-stop

            const updateVolume = () => {
                if (!streamRef.current) return;
                analyser.getByteFrequencyData(freqData);
                let sum = 0;
                for (let i = 0; i < freqData.length; i++) sum += freqData[i];
                const currentVolume = sum / freqData.length / 255.0;

                const silenceDuration = Date.now() - lastVoiceTimeRef.current;

                if (currentVolume > SILENCE_THRESHOLD) {
                    lastVoiceTimeRef.current = Date.now();
                    // Resume from paused state
                    if (isPausedRef.current) {
                        isPausedRef.current = false;
                    }
                    setVoiceState('active');
                    setCountdownSec(0);
                } else if (silenceDuration > STOP_MS) {
                    // Level 3: Auto-stop
                    stopReasonRef.current = 'No voice detected for 15s';
                    stopRecording('silence');
                    return;
                } else if (silenceDuration > WARNING_MS) {
                    // Level 2: Countdown warning
                    isPausedRef.current = true;
                    setVoiceState('warning');
                    const remaining = Math.ceil((STOP_MS - silenceDuration) / 1000);
                    setCountdownSec(remaining);
                } else if (silenceDuration > PAUSE_MS) {
                    // Level 1: Pause inference
                    isPausedRef.current = true;
                    setVoiceState('paused');
                    setCountdownSec(0);
                }

                // Draw waveform
                drawWaveform();

                animationRef.current = requestAnimationFrame(updateVolume);
            };
            updateVolume();

            setConnectionStatus('CONNECTING');
            const ws = new WebSocket(EMOTION_WS);
            wsRef.current = ws;

            ws.onopen = () => {
                setConnectionStatus('CONNECTED');
                setVoiceState('active');
                processor.onaudioprocess = (e) => {
                    if (ws.readyState !== WebSocket.OPEN) return;
                    // Don't send data when paused (silence detected)
                    if (isPausedRef.current) return;

                    const channelData = e.inputBuffer.getChannelData(0);
                    const int16 = new Int16Array(channelData.length);
                    for (let i = 0; i < channelData.length; i++) {
                        const s = Math.max(-1, Math.min(1, channelData[i]));
                        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }
                    ws.send(int16.buffer);
                };

                setIsRecording(true);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.error) {
                        setSerError(data.error);
                        stopRecording('error');
                    } else if (data.silence) {
                        // Backend detected silence — don't update emotion display
                    } else {
                        setEmotionData(data);
                    }
                } catch (e) { }
            };

            ws.onerror = () => setConnectionStatus('DISCONNECTED');
            ws.onclose = () => setConnectionStatus('DISCONNECTED');

        } catch (err) {
            console.error("Microphone access denied or error:", err);
            alert("Microphone access is required for this demo.");
        }
    };

    const stopRecording = (reason?: string) => {
        if (silenceTimeoutRef.current) window.clearTimeout(silenceTimeoutRef.current);
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
        if (wsRef.current) wsRef.current.close();
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        if (audioContextRef.current) audioContextRef.current.close();

        streamRef.current = null;
        analyserRef.current = null;
        isPausedRef.current = false;

        setIsRecording(false);
        setConnectionStatus('DISCONNECTED');
        setEmotionData(null);
        setVoiceState('stopped');
        setCountdownSec(0);
        if (reason === 'silence') {
            // Keep the stop reason visible
        }

        // Clear waveform canvas
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };

    useEffect(() => {
        // Proactive config check for SER on component mount
        demoApi.get('/emotion/status')
            .then((status: any) => {
                if (!status.enabled) {
                    setSerError('Realtime SER disabled in config.');
                } else if (!status.initialized) {
                    setSerError('SER model not initialized or CPU Degraded');
                }
            })
            .catch((err: any) => setSerError(err.message || 'Failed to check SER status'));

        return () => { stopRecording(); };
    }, []);

    const pointerRotate = emotionData ? (emotionData.valance * 90) : 0;
    const isAngry = emotionData?.emotion === 'ANGRY';

    // Status message logic
    const getStatusMessage = () => {
        if (serError) return `⚠️ ${serError}`;
        if (stopReasonRef.current && !isRecording) return `⏹ ${stopReasonRef.current}`;
        if (voiceState === 'warning') return t('demo.liveEmotion.autoStopping', 'Auto-stopping in {{sec}}s…', { sec: countdownSec });
        if (voiceState === 'paused') return t('demo.liveEmotion.paused', 'Paused — no voice detected');
        if (isRecording) return t('demo.liveEmotion.listening', 'Listening (WS Streaming)');
        return t('demo.liveEmotion.tapToStart', 'Tap to Start');
    };

    const getStatusColor = () => {
        if (serError) return '#ef4444';
        if (stopReasonRef.current && !isRecording) return '#f59e0b';
        if (voiceState === 'warning') return '#f59e0b';
        if (voiceState === 'paused') return '#f59e0b';
        return '#64748b';
    };

    return (
        <div className="tab-section" style={{ display: 'flex', gap: 24, alignItems: 'stretch', minHeight: 600 }}>

            {/* Main Radar View */}
            <div className="glass-card" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 24, left: 24 }}>
                    <h3 style={{ textDecoration: 'underline', textDecorationColor: '#06b6d4', margin: 0 }}>{t('demo.liveEmotion.title', 'Live Emotion & Stress')}</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('demo.liveEmotion.desc', 'Streaming WebSocket inference. Speak into the mic to see real-time emotional shift.')}</p>
                </div>

                <div style={{ position: 'absolute', top: 24, right: 24, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: '#475569', fontWeight: 600, fontFamily: 'monospace' }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: connectionStatus === 'CONNECTED' ? '#06b6d4' : '#94a3b8' }} />
                    {connectionStatus}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: 80 }}>
                    {/* Dashboard Display */}
                    <div style={{ position: 'relative', width: 256, height: 128, overflow: 'hidden', marginBottom: 48 }}>
                        {/* Half Circle Arc */}
                        <div style={{ width: 256, height: 256, border: '20px solid #1e293b', borderRadius: '50%', borderBottomColor: 'transparent', borderLeftColor: 'rgba(244,63,94,0.5)', borderRightColor: 'rgba(16,185,129,0.5)', transform: 'rotate(45deg)', boxSizing: 'border-box' }} />

                        {/* Needle */}
                        <div style={{ position: 'absolute', bottom: 0, left: 120, width: 8, height: 112, background: '#1e293b', transformOrigin: 'bottom', zIndex: 10, boxShadow: '0 0 10px rgba(0,0,0,0.15)', transform: `rotate(${pointerRotate}deg)`, transition: 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }} />

                        {/* Center Hub */}
                        <div style={{ position: 'absolute', bottom: -10, left: 108, width: 40, height: 40, background: '#0f172a', borderRadius: '50%', border: '4px solid #334155', zIndex: 20, boxSizing: 'border-box' }} />

                        <div style={{ position: 'absolute', bottom: 8, left: 8, fontSize: '10px', fontWeight: 'bold', color: '#f43f5e' }}>{t('demo.liveEmotion.negative', 'NEGATIVE')}</div>
                        <div style={{ position: 'absolute', bottom: 8, right: 8, fontSize: '10px', fontWeight: 'bold', color: '#10b981' }}>{t('demo.liveEmotion.positive', 'POSITIVE')}</div>
                    </div>

                    <div style={{ height: 80, textAlign: 'center' }}>
                        {emotionData ? (
                            <div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: 4, color: isAngry ? '#f43f5e' : '#1e293b' }}>
                                    {emotionData.emotion}
                                </div>
                                <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: '0.85rem', marginTop: 4 }}>
                                    {t('demo.liveEmotion.confidence', 'CONFIDENCE')}: {(emotionData.confidence * 100).toFixed(1)}% | {t('demo.liveEmotion.energy', 'ENERGY')}: {emotionData.energy}
                                </div>
                            </div>
                        ) : (
                            <div style={{ color: '#475569', fontFamily: 'monospace', fontSize: '0.85rem', marginTop: 16 }}>
                                {voiceState === 'paused' ? t('demo.liveEmotion.pausedWaiting', 'Paused — waiting for voice…') : t('demo.liveEmotion.waiting', 'Waiting for audio stream...')}
                            </div>
                        )}
                    </div>

                    {/* Waveform Visualization */}
                    <div style={{
                        width: 320, height: 64, borderRadius: 12, overflow: 'hidden',
                        background: isRecording ? 'rgba(6, 182, 212, 0.06)' : 'rgba(0,0,0,0.02)',
                        border: `1px solid ${isRecording ? 'rgba(6, 182, 212, 0.2)' : 'rgba(0,0,0,0.05)'}`,
                        marginTop: 8, transition: 'all 0.3s',
                    }}>
                        <canvas
                            ref={canvasRef}
                            width={320}
                            height={64}
                            style={{ display: 'block', width: '100%', height: '100%' }}
                        />
                    </div>

                    <Button
                        disabled={!!serError}
                        onClick={toggleRecording}
                        style={{ marginTop: 16, width: 80, height: 80, borderRadius: '50%', border: 'none', background: serError ? 'rgba(0,0,0,0.05)' : isRecording ? 'rgba(244,63,94,0.2)' : '#1e293b', color: serError ? '#cbd5e1' : isRecording ? '#f43f5e' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: serError ? 'not-allowed' : 'pointer', boxShadow: isRecording ? '0 0 30px rgba(244,63,94,0.4)' : 'none', transition: 'all 0.3s', opacity: serError ? 0.6 : 1 }}
                    >
                        <Mic size={32} />
                    </Button>

                    {/* Silence countdown progress bar */}
                    {voiceState === 'warning' && (
                        <div style={{ width: 200, height: 4, borderRadius: 2, background: 'rgba(245, 158, 11, 0.15)', marginTop: 8, overflow: 'hidden' }}>
                            <div style={{
                                width: `${(countdownSec / 7) * 100}%`,
                                height: '100%', borderRadius: 2,
                                background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                                transition: 'width 0.5s ease',
                            }} />
                        </div>
                    )}

                    <div style={{ marginTop: voiceState === 'warning' ? 8 : 16, fontSize: '0.75rem', fontFamily: 'monospace', color: getStatusColor(), textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', maxWidth: 300 }}>
                        {getStatusMessage()}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Tab 1: ASR Playground ───────────────────────────────────────────────

interface TranscriptSegment {
    id: number;
    text: string;
    start: number;
    end: number;
    isPartial: boolean;
}

function ASRTab({ groundTruth }: { groundTruth: GroundTruth | null }) {
    const { t } = useTranslation();
    const [selectedSample, setSelectedSample] = useState(DEMO_SAMPLES_STATIC[0].id);
    const [vendor, setVendor] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ vendor: string, confidence: number, latency_ms: number, latency_ws_ms?: number, rtt_ms?: number } | null>(null);
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [vendors, setVendors] = useState<Array<{ id: string; provider: string; name: string }>>([]);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const audioRef = useRef<HTMLAudioElement>(null);
    const transcriptRef = useRef<HTMLDivElement>(null);

    // VAD toggle + threshold
    const [vadEnabled, setVadEnabled] = useState(false);
    const [sileroThreshold, setSileroThreshold] = useState(0.5);
    const [vadStats, setVadStats] = useState<{ totalFrames: number; speechFrames: number; vadFilteredFrames: number; frameSavingsPct: number; vadMode: string; vadLatencyMs: number } | null>(null);

    const upload = useFileUpload('.pcap,.wav,.mp3');

    // Auto-scroll the transcript box to the bottom when new segments arrive,
    // but ONLY if the user is already near the bottom (hasn't scrolled up to read history).
    useEffect(() => {
        if (transcriptRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = transcriptRef.current;
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 150; // 150px threshold
            if (isNearBottom) {
                transcriptRef.current.scrollTop = scrollHeight;
            }
        }
    }, [segments]);

    // Load ASR vendors from platform settings — show all that have passed testing
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await api.get('/platform/asr-vendors');
                if (!mounted) return;
                const data = res.data?.data || res.data;
                const allVendors: Array<{ id: string; provider: string; name: string; lastTestResult?: string }> = data.vendors || [];
                const activeIds: string[] = data.activeIds || [];

                // Show non-mock vendors that are active OR have passed testing
                const available = allVendors.filter((v: any) =>
                    v.provider !== 'mock' && (activeIds.includes(v.id) || v.lastTestResult === 'success')
                );

                if (available.length > 0) {
                    setVendors(available);
                    // Default to the active vendor, or first available
                    const activeVendor = available.find((v: any) => activeIds.includes(v.id));
                    setVendor((activeVendor || available[0]).provider);
                } else if (allVendors.length > 0) {
                    // Fallback: show all vendors even if untested
                    setVendors(allVendors);
                    setVendor(allVendors[0].provider);
                } else {
                    setVendors([{ id: 'mock', provider: 'mock', name: 'Mock' }]);
                    setVendor('mock');
                }
            } catch (err) {
                if (!mounted) return;
                console.warn('Failed to load ASR vendors, using fallback', err);
                setVendors([{ id: 'mock', provider: 'mock', name: 'Mock' }]);
                setVendor('mock');
            }
        })();
        return () => { mounted = false; };
    }, []);

    const handleAnalyze = async () => {
        setLoading(true);
        setResult(null);
        setSegments([]);
        setError(null);
        setCurrentTime(0);
        setVadStats(null);

        try {
            let pcm: ArrayBuffer;
            let sampleRate = 16000;

            if (upload.file) {
                const decoded = await audioFileToPCM(upload.file);
                pcm = decoded.pcm;
                sampleRate = decoded.sampleRate;
                setAudioUrl(URL.createObjectURL(upload.file));
            } else {
                const sample = DEMO_SAMPLES_STATIC.find(s => s.id === selectedSample);
                if (sample) {
                    const response = await fetch(sample.wav);
                    const blob = await response.blob();
                    const decoded = await audioFileToPCM(new File([blob], 'preset.wav', { type: 'audio/wav' }));
                    pcm = decoded.pcm;
                    sampleRate = decoded.sampleRate;
                    setAudioUrl(sample.wav);
                } else {
                    throw new Error('Please select a valid sample');
                }
            }

            const start = Date.now();

            // If VAD is enabled, do a synchronous ASR-with-VAD request first
            if (vadEnabled) {
                try {
                    const vadResult = await sendPCM('/asr-with-vad', pcm, sampleRate, {
                        language: 'zh',
                        vendor,
                        silero_threshold: String(sileroThreshold),
                    });
                    setVadStats({
                        totalFrames: vadResult.totalFrames || 0,
                        speechFrames: vadResult.speechFrames || 0,
                        vadFilteredFrames: vadResult.vadFilteredFrames || 0,
                        frameSavingsPct: vadResult.frameSavingsPct || 0,
                        vadMode: vadResult.vadMode || 'rms',
                        vadLatencyMs: vadResult.vadLatencyMs || 0,
                    });
                    // Show the ASR result from VAD path
                    const latency = Date.now() - start;
                    setResult({
                        vendor: vadResult.provider || vendor,
                        confidence: vadResult.confidence || 0,
                        latency_ms: latency,
                        latency_ws_ms: 0,
                        rtt_ms: 0,
                    });
                    if (vadResult.text) {
                        setSegments([{ id: 1, text: vadResult.text, start: 0, end: 1, isPartial: false }]);
                    }
                    setLoading(false);
                    return;
                } catch (err: any) {
                    setError(err.message || 'ASR+VAD failed');
                    setLoading(false);
                    return;
                }
            }

            const baseURL = (import.meta as any).env?.VITE_API_URL || '/api';
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            let wsUrl = '';
            if (baseURL.startsWith('http')) {
                wsUrl = baseURL.replace(/^http/, 'ws') + '/demo/asr/ws';
            } else {
                wsUrl = `${protocol}//${window.location.host}${baseURL}/demo/asr/ws`;
            }

            wsUrl += `?sample_rate=${sampleRate}&language=zh&vendor=${vendor}`;

            const ws = new WebSocket(wsUrl);
            ws.binaryType = 'arraybuffer';

            let firstTokenLatency = 0;
            let wsOpenTime = 0;
            let currentSegId = 0;

            ws.onopen = () => {
                wsOpenTime = Date.now() - start;
                let offset = 0;

                // Auto-play the audio when we start sending chunks.
                const tryPlay = () => {
                    if (audioRef.current) {
                        audioRef.current.currentTime = 0;
                        audioRef.current.play().catch(e => console.error("Auto-play failed:", e));

                        const streamStartTime = Date.now();

                        // Start the sending loop ONLY after play is confirmed
                        const interval = setInterval(() => {
                            if (ws.readyState !== WebSocket.OPEN) {
                                clearInterval(interval);
                                return;
                            }

                            // 按wall-clock算应已播放的byte数
                            // This prevents issues where audioRef gets stuck, buffered, or throttled in background tabs
                            const elapsedMs = Date.now() - streamStartTime;
                            const targetOffset = Math.floor((elapsedMs / 1000.0) * sampleRate * 2);
                            const alignedTarget = targetOffset - (targetOffset % 2); // 16-bit aligned

                            if (offset < alignedTarget && offset < pcm.byteLength) {
                                // Cap the max chunk size to 16KB per tick to prevent huge burst dumps if the tab wakes up
                                const chunkSize = Math.min(alignedTarget - offset, 16384);
                                const end = Math.min(offset + chunkSize, pcm.byteLength);

                                ws.send(pcm.slice(offset, end));
                                offset = end;
                            }

                            // Clean up when we've reached the end
                            if (offset >= pcm.byteLength) {
                                ws.send(JSON.stringify({ action: 'stop' }));
                                clearInterval(interval);
                            }
                        }, 50); // 50ms resolution with completely stable Date offset tracking
                    } else {
                        setTimeout(tryPlay, 10);
                    }
                };
                tryPlay();
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.error) {
                        setError(data.error);
                        ws.close();
                        setLoading(false);
                        return;
                    }

                    if (data.text) {
                        // Correctly lock the very first token latency
                        if (firstTokenLatency === 0) {
                            firstTokenLatency = Date.now() - start;

                            // Adjust for WebSocket handshake overhead
                            if (wsOpenTime > 0) {
                                firstTokenLatency -= wsOpenTime;
                            }
                        }

                        // Confidence update if available
                        setResult(prev => ({
                            vendor: data.vendor_id || vendor,
                            confidence: data.confidence !== undefined && data.confidence > 0 ? data.confidence : (prev?.confidence || 0),
                            latency_ms: firstTokenLatency,
                            latency_ws_ms: wsOpenTime,
                            rtt_ms: data.rtt_ms !== undefined ? data.rtt_ms : prev?.rtt_ms
                        }));


                        setSegments(prev => {
                            const newSegments = [...prev];

                            // Check if this is the first message or if the last message was final
                            if (newSegments.length === 0 || newSegments[newSegments.length - 1].isPartial === false) {
                                // Important: For some vendors (like FunASR), the text might contain the *entire* transcript
                                // rather than just the new segment. We need to handle this by checking if the new text
                                // starts with the previously accumulated text.
                                const fullPreviousText = newSegments.map(s => s.text).join('');

                                let newText = data.text;
                                if (data.text.startsWith(fullPreviousText) && fullPreviousText.length > 0) {
                                    // The vendor is sending cumulative text. We should only store the delta.
                                    newText = data.text.substring(fullPreviousText.length).trimStart();
                                }

                                // Only add if there's actually new text
                                if (newText.length > 0) {
                                    currentSegId++;
                                    newSegments.push({
                                        id: currentSegId,
                                        text: newText,
                                        start: data.start_time || Math.max(0, currentSegId - 1),
                                        end: data.end_time || currentSegId,
                                        isPartial: !data.is_final
                                    });
                                }
                            } else {
                                // 更新已有的partial segment
                                const last = newSegments[newSegments.length - 1];

                                // Same cumulative check for partial updates
                                const previousFinalText = newSegments.slice(0, -1).map(s => s.text).join('');
                                let updatedText = data.text;
                                if (data.text.startsWith(previousFinalText) && previousFinalText.length > 0) {
                                    updatedText = data.text.substring(previousFinalText.length).trimStart();
                                }

                                // HEURISTIC for missing is_final: 
                                // Some custom ASR vendors never emit `is_final: true` but clear their buffers for new sentences.
                                // If updatedText has no significant common prefix with last.text, it's likely a buffer reset!
                                let isNewSentence = false;
                                if (last.text.length > 4 && updatedText.length > 0) {
                                    let i = 0;
                                    while (i < last.text.length && i < updatedText.length && last.text[i] === updatedText[i]) {
                                        i++;
                                    }
                                    if (i < 3) {
                                        isNewSentence = true;
                                    }
                                }

                                // Also trigger if the last text has punctuation and updated doesn't share it
                                if (/[.!?。！？]$/.test(last.text.trim()) && !updatedText.startsWith(last.text.trim().slice(0, -1))) {
                                    isNewSentence = true;
                                }

                                if (isNewSentence && !data.is_final) {
                                    // Implicitly finalize the last sentence
                                    last.isPartial = false;

                                    currentSegId++;
                                    newSegments.push({
                                        id: currentSegId,
                                        text: updatedText,
                                        start: data.start_time || Math.max(0, currentSegId - 1),
                                        end: data.end_time || currentSegId,
                                        isPartial: true
                                    });
                                } else {
                                    last.text = updatedText;
                                    last.isPartial = !data.is_final;
                                    if (data.end_time) last.end = data.end_time;
                                }
                            }

                            return newSegments;
                        });
                    }
                } catch (e) {
                    console.error('Invalid WS message', e);
                }
            };

            ws.onerror = () => {
                setError('WebSocket connection error');
                setLoading(false);
            };

            ws.onclose = () => {
                setLoading(false);
            };

        } catch (err: any) {
            setError(err.message || 'ASR analysis failed');
            setLoading(false);
        }
    };

    const gt = (!upload.file && selectedSample) ? groundTruth?.[selectedSample] : null;

    return (
        <div className="tab-section">
            <div className="section-grid two-col">
                {/* Left: Input */}
                <div className="glass-card">
                    <h3><Mic size={20} /> {t('demo.asr.audioSource', 'Audio Source')}</h3>

                    {/* Sample selector */}
                    <div className="sample-selector">
                        <label>{t('demo.presetSamples', 'Preset Samples')}</label>
                        <div className="sample-buttons">
                            {DEMO_SAMPLES_STATIC.map(s => (
                                <Button key={s.id}
                                    className={`sample-btn ${selectedSample === s.id && !upload.file ? 'active' : ''}`}
                                    onClick={() => { setSelectedSample(s.id); upload.setFile(null); }}>
                                    <span>{s.icon}</span> {s.fallback}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <SampleAudioPlayer sampleId={(!upload.file && selectedSample) ? selectedSample : null} />

                    {/* File upload */}
                    <div className="upload-section">
                        <label>{t('demo.uploadOwn', 'Or Upload Your Own')}</label>
                        <upload.DropZone>
                            {upload.file ? (
                                <div className="file-info">
                                    <FileAudio size={24} />
                                    <span>{upload.file.name}</span>
                                    <span className="file-size">({(upload.file.size / 1024).toFixed(1)} KB)</span>
                                </div>
                            ) : (
                                <div className="drop-prompt">
                                    <Upload size={32} />
                                    <p>{t('demo.asr.dropPrompt', 'Drop PCAP, WAV, or MP3 here')}</p>
                                    <span>{t('demo.asr.stereoHint', 'Supports stereo (L=Agent, R=Customer)')}</span>
                                </div>
                            )}
                        </upload.DropZone>
                    </div>

                    {/* Vendor selector */}
                    <div className="vendor-selector">
                        <label>{t('demo.asr.vendor', 'ASR Vendor')}</label>
                        <div className="vendor-buttons">
                            {vendors.map(v => (
                                <Button key={v.id}
                                    className={`vendor-btn ${vendor === v.provider ? 'active' : ''}`}
                                    onClick={() => setVendor(v.provider)}>
                                    {v.name}
                                </Button>
                            ))}
                            {vendors.length === 0 && (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('demo.loadingVendors', 'Loading vendors...')}</span>
                            )}
                        </div>
                    </div>

                    {/* VAD Toggle */}
                    <div className="vendor-selector" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <Checkbox
                                checked={vadEnabled}
                                onChange={(e) => { setVadEnabled(e.target.checked); setVadStats(null); }}
                                style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                            />
                            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>🧠 {t('demo.asr.vadPrefilter', 'IE VAD Pre-filter')}</span>
                            {vadEnabled && <Badge variant="success" style={{ fontSize: '0.7rem' }}>Silero</Badge>}
                        </label>
                        {vadEnabled && (
                            <div style={{ marginTop: 8 }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {t('demo.asr.sileroThreshold', 'Silero Threshold')}: <strong>{sileroThreshold.toFixed(2)}</strong>
                                </label>
                                <Input
                                    type="range"
                                    min="0.1"
                                    max="0.9"
                                    step="0.05"
                                    value={sileroThreshold}
                                    onChange={(e) => setSileroThreshold(parseFloat(e.target.value))}
                                    style={{ width: '100%', marginTop: 4, accentColor: 'var(--primary)' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                    <span>{t('demo.asr.sensitive', 'Sensitive (more speech)')}</span>
                                    <span>{t('demo.asr.strict', 'Strict (less speech)')}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <Button onClick={handleAnalyze} disabled={loading}>
                        {loading ? <><Loader2 size={18} className="spin" /> {t('demo.asr.processing', 'Processing...')}</> :
                            <><Play size={18} /> {t('demo.asr.analyzeAudio', 'Analyze Audio')}</>}
                    </Button>
                </div>

                {/* Right: Results */}
                <div className="glass-card">
                    <h3><BarChart3 size={20} /> {t('demo.results', 'Results')}</h3>
                    {error && (
                        <div className="empty-state" style={{ color: '#ef4444', minHeight: 'auto', padding: '16px' }}>
                            <p>⚠️ {error}</p>
                        </div>
                    )}

                    {/* The audio element MUST be rendered early, independent of `result` or `segments.length`
                        so that `audioRef.current` is not null when `ws.onopen` fires and initiates `tryPlay()`. */}
                    <div className="result-display">
                        <div
                            className="audio-playback"
                            style={{
                                marginBottom: 16,
                                width: '100%',
                                display: audioUrl ? 'block' : 'none'
                            }}
                        >
                            <audio
                                ref={audioRef}
                                src={audioUrl || undefined}
                                controls
                                style={{ width: '100%', height: 40 }}
                                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                            />
                        </div>

                        {!(result || segments.length > 0) && loading && (
                            <div className="empty-state" style={{ minHeight: 200 }}>
                                <Loader2 size={32} className="spin text-muted" />
                                <p>{t('demo.asr.connecting', 'Connecting to {{vendor}} engine...', { vendor })}</p>
                            </div>
                        )}

                        {!(result || segments.length > 0) && !loading && (
                            <div className="empty-state">
                                <Mic size={48} />
                                <p>{t('demo.asr.emptyPrompt', 'Select a sample or upload audio, then click <strong>Analyze</strong>')}</p>
                            </div>
                        )}

                        {(result || segments.length > 0) && (
                            <>
                                {result && (
                                    <div className="result-meta">
                                        <div className="meta-item">
                                            <span className="meta-label">{t('demo.asr.metaVendor', 'Vendor')}</span>
                                            <span className="meta-value badge">{result.vendor}</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="meta-label">{t('demo.asr.metaConfidence', 'Confidence')}</span>
                                            <span className="meta-value">{(result.confidence * 100).toFixed(1)}%</span>
                                        </div>
                                        <div className="meta-item" title="WebSocket connection setup latency">
                                            <span className="meta-label">{t('demo.asr.metaWsHandshake', 'WS Handshake')}</span>
                                            <span className="meta-value">{result.latency_ws_ms ? `${result.latency_ws_ms}ms` : '...'}</span>
                                        </div>
                                        <div className="meta-item" title="Ping-Pong RTT between Ingestion Engine and upstream ASR vendor">
                                            <span className="meta-label">{t('demo.asr.metaModelRtt', 'Model RTT')}</span>
                                            <span className="meta-value">{result.rtt_ms ? `${result.rtt_ms}ms` : '...'}</span>
                                        </div>
                                        <div className="meta-item" title="Time To First Token since audio start">
                                            <span className="meta-label">{t('demo.asr.metaLatency', 'Latency (TTFT)')}</span>
                                            <span className="meta-value">{result.latency_ms.toFixed(0)}ms</span>
                                        </div>
                                    </div>
                                )}

                                {/* VAD Frame Savings Bar */}
                                {vadStats && (
                                    <div style={{
                                        background: 'var(--bg-secondary)',
                                        borderRadius: 'var(--radius-sm)',
                                        padding: '12px 16px',
                                        marginBottom: 12,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>🧠 {t('demo.asr.vadFrameAnalysis', 'VAD Frame Analysis')}</span>
                                            <Badge variant="success" style={{ fontSize: '0.65rem' }}>{vadStats.vadMode.toUpperCase()}</Badge>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{t('demo.asr.vadLatency', 'VAD latency')}: {vadStats.vadLatencyMs}ms</span>
                                        </div>
                                        {/* Stacked bar */}
                                        <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
                                            <div style={{
                                                width: `${vadStats.totalFrames > 0 ? (vadStats.speechFrames / vadStats.totalFrames * 100) : 100}%`,
                                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.65rem', fontWeight: 700, color: '#fff',
                                            }}>
                                                {vadStats.speechFrames} speech
                                            </div>
                                            <div style={{
                                                flex: 1,
                                                background: 'linear-gradient(135deg, #94a3b8, #64748b)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.65rem', fontWeight: 700, color: '#fff',
                                            }}>
                                                {vadStats.vadFilteredFrames} filtered
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.7rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Total: {vadStats.totalFrames} frames</span>
                                            <span style={{ color: '#16a34a', fontWeight: 700 }}>↓ {vadStats.frameSavingsPct}% frames saved</span>
                                        </div>
                                    </div>
                                )}

                                <div className="transcript-box" ref={transcriptRef} style={{ maxHeight: 400, overflowY: 'auto', scrollBehavior: 'smooth' }}>
                                    <h4>{t('demo.asr.transcriptionRecord', 'Transcription Record')}</h4>
                                    <div className="transcript-segments" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {segments.map((seg, idx) => {
                                            const isActive = seg.isPartial || (currentTime >= seg.start && currentTime <= (seg.end || seg.start + 5));

                                            // 时间戳 MM:SS
                                            const ms = Math.floor(seg.start * 1000);
                                            const m = Math.floor(ms / 60000);
                                            const s = Math.floor((ms % 60000) / 1000);
                                            const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                                            return (
                                                <div key={seg.id || idx} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                                    <div style={{
                                                        fontSize: '0.75rem',
                                                        color: 'var(--text-muted)',
                                                        fontFamily: 'monospace',
                                                        paddingTop: '0.2rem',
                                                        minWidth: '40px'
                                                    }}>
                                                        {timeStr}
                                                    </div>
                                                    <div
                                                        className={`transcript-segment ${isActive ? 'active-highlight' : ''} ${seg.isPartial ? 'partial-text' : ''}`}
                                                        style={{
                                                            cursor: 'pointer',
                                                            padding: '0.2rem 0.4rem',
                                                            borderRadius: 'var(--radius-sm)',
                                                            transition: 'all 0.2s',
                                                            background: isActive ? 'var(--primary-light)' : 'transparent',
                                                            color: isActive ? 'var(--primary-dark)' : 'var(--text-primary)',
                                                            flex: 1,
                                                            lineHeight: 1.5
                                                        }}
                                                        onClick={() => {
                                                            if (audioRef.current && seg.start > 0) {
                                                                audioRef.current.currentTime = seg.start;
                                                                audioRef.current.play();
                                                            }
                                                        }}
                                                    >
                                                        {seg.text}
                                                        {idx === segments.length - 1 && seg.isPartial && (
                                                            <span className="cursor-pulse" style={{ animation: 'pulse 1s infinite', marginLeft: '4px' }}>▋</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {gt && (
                                    <div className="ground-truth-box">
                                        <h4><CheckCircle2 size={16} /> {t('demo.asr.groundTruth', 'Ground Truth')}</h4>
                                        <p>{gt.full_transcript}</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Download Stats Button */}
            {result && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
                    <Button className="sample-"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}
                        onClick={() => {
                            const fullTranscriptText = segments.map(s => s.text).join(' ');
                            const exportData = {
                                timestamp: new Date().toISOString(),
                                sample: selectedSample || 'uploaded_file',
                                vendor: result.vendor,
                                confidence: result.confidence,
                                latency_ms: result.latency_ms,
                                transcription: fullTranscriptText,
                                ground_truth: gt?.full_transcript || null,
                                wer: gt?.full_transcript ? computeWER(fullTranscriptText, gt.full_transcript) : null,
                            };
                            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                            downloadJSON(exportData, `asr_report_${selectedSample || 'upload'}_${ts}.json`);
                        }}
                    >
                        <Download size={14} /> {t('demo.exportReport', 'Export Report')}
                    </Button>
                </div>
            )}
        </div>
    );
}

// ─── Tab 2: VAD Effectiveness ────────────────────────────────────────────

function VADTab({ groundTruth }: { groundTruth: GroundTruth | null }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [vadData, setVadData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedSample, setSelectedSample] = useState<string | null>(null);
    const upload = useFileUpload('.wav,.mp3');

    const handleAnalyzePreset = async (sampleId: string) => {
        const sample = DEMO_SAMPLES_STATIC.find(s => s.id === sampleId);
        if (!sample) return;
        setSelectedSample(sampleId);
        setLoading(true);
        setError(null);

        try {
            // Step 1: Fetch WAV and decode to PCM
            const response = await fetch(sample.wav);
            const blob = await response.blob();
            const file = new File([blob], `${sampleId}.wav`, { type: 'audio/wav' });
            const { pcm, sampleRate } = await audioFileToPCM(file);

            // Step 2: Call IE VAD for real frame-level analysis
            const vadResult = await sendPCM('/vad', pcm, sampleRate);

            // Step 3: Call ASR on full audio (simulates "without VAD" — all frames sent)
            const asrFullStart = Date.now();
            const asrFull = await sendPCM('/asr', pcm, sampleRate, { vendor: 'dashscope', language: 'en' });
            const asrFullLatency = Date.now() - asrFullStart;

            // Step 4: Filter PCM to speech-only using VAD segments, then call ASR
            const speechPcm = filterPCMBySpeechSegments(pcm, sampleRate, vadResult.segments || []);
            const asrVadStart = Date.now();
            const asrVad = await sendPCM('/asr', speechPcm, sampleRate, { vendor: 'dashscope', language: 'en' });
            const asrVadLatency = Date.now() - asrVadStart;

            // Step 5: Compute WER against ground truth
            const gt = groundTruth?.[sampleId];
            const refText = gt?.full_transcript || '';
            const werFull = computeWER(asrFull.text || '', refText);
            const werVad = computeWER(asrVad.text || '', refText);

            // Merge VAD frame data with real ASR accuracy
            setVadData({
                ...vadResult,
                withVad: {
                    ...vadResult.withVad,
                    accuracy: parseFloat((100 - werVad).toFixed(1)),
                    latency: asrVadLatency,
                    wer: parseFloat(werVad.toFixed(1)),
                    transcription: asrVad.text || '',
                },
                withoutVad: {
                    ...vadResult.withoutVad,
                    accuracy: parseFloat((100 - werFull).toFixed(1)),
                    latency: asrFullLatency,
                    wer: parseFloat(werFull.toFixed(1)),
                    transcription: asrFull.text || '',
                },
                vendor: asrFull.vendor || 'dashscope',
                groundTruth: refText,
                sampleId,
                timestamp: new Date().toISOString(),
            });
        } catch (err: any) {
            console.error('VAD preset analysis failed:', err);
            setError(err.message || 'VAD analysis failed. Ensure the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    const handleAnalyze = async () => {
        if (!upload.file) {
            setError('Upload a WAV or MP3 file, or select a preset sample');
            return;
        }
        setLoading(true);
        setError(null);
        setSelectedSample(null);
        try {
            const { pcm, sampleRate } = await audioFileToPCM(upload.file);
            const data = await sendPCM('/vad', pcm, sampleRate);
            setVadData(data);
        } catch (err: any) {
            setError(err.message || 'VAD analysis failed');
        } finally {
            setLoading(false);
        }
    };

    const vadStats = vadData || {
        withVad: { frames: 0, tokens: 0, cost: 0, accuracy: 0, falsePositiveRate: 0, latency: 0 },
        withoutVad: { frames: 0, tokens: 0, cost: 0, accuracy: 0, falsePositiveRate: 0, latency: 0 },
        savings: { frames: 0, tokens: 0, cost: 0 },
    };
    const savings = vadData?.savings || { frames: 0, tokens: 0, cost: 0 };

    return (
        <div className="tab-section">
            {/* Preset samples + Upload */}
            <div className="glass-card" style={{ marginBottom: 16 }}>
                <h3><Activity size={20} /> {t('demo.vad.audioSource', 'Audio Source for VAD Analysis')}</h3>

                {/* Preset samples */}
                <div className="sample-selector">
                    <label>{t('demo.presetSamples', 'Preset Samples')}</label>
                    <div className="sample-buttons">
                        {DEMO_SAMPLES_STATIC.map(s => (
                            <Button key={s.id}
                                className={`sample-btn ${selectedSample === s.id ? 'active' : ''}`}
                                onClick={() => handleAnalyzePreset(s.id)}
                                disabled={loading}>
                                <span>{s.icon}</span> {s.fallback}
                            </Button>
                        ))}
                    </div>
                </div>

                <SampleAudioPlayer sampleId={selectedSample} />

                {/* Or upload */}
                <div className="upload-section">
                    <label>{t('demo.uploadOwn', 'Or Upload Your Own')}</label>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <upload.DropZone>
                            {upload.file ? (
                                <div className="file-info">
                                    <FileAudio size={24} />
                                    <span>{upload.file.name}</span>
                                    <span className="file-size">({(upload.file.size / 1024).toFixed(1)} KB)</span>
                                </div>
                            ) : (
                                <div className="drop-prompt">
                                    <Upload size={24} />
                                    <p>{t('demo.vad.dropPrompt', 'Drop WAV / MP3 for real-time VAD')}</p>
                                </div>
                            )}
                        </upload.DropZone>
                        <Button onClick={handleAnalyze} disabled={loading}>
                            {loading ? <><Loader2 size={18} className="spin" /> {t('demo.analyzing', 'Analyzing...')}</> :
                                <><Activity size={18} /> {t('demo.vad.analyzeUpload', 'Analyze Upload')}</>}
                        </Button>
                    </div>
                </div>
                {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>⚠️ {error}</p>}
                {vadData && <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 13 }}>
                    Duration: {vadData.durationSec}s · Talk ratio: {(vadData.talkRatio * 100).toFixed(1)}%
                    {vadData.source === 'ground_truth' ? ' · Source: Ground Truth' : ` · ⏱ ${vadData.latency_ms}ms`}
                </p>}
            </div>

            {/* Savings banner */}
            <div className="savings-banner glass-card">
                <div className="saving-item">
                    <span className="saving-value">-{savings.frames}%</span>
                    <span className="saving-label">{t('demo.vad.framesSent', 'Frames Sent to ASR')}</span>
                </div>
                <div className="saving-item">
                    <span className="saving-value">-{savings.tokens}%</span>
                    <span className="saving-label">{t('demo.vad.tokenConsumption', 'Token Consumption')}</span>
                </div>
                <div className="saving-item">
                    <span className="saving-value">-{savings.cost}%</span>
                    <span className="saving-label">{t('demo.vad.apiCost', 'API Cost')}</span>
                </div>
                <div className="saving-item accent">
                    <span className="saving-value">+{(vadStats.withVad.accuracy - vadStats.withoutVad.accuracy).toFixed(1)}pp</span>
                    <span className="saving-label">{t('demo.vad.asrAccuracy', 'ASR Accuracy (WER)')}</span>
                </div>
            </div>

            {/* Comparison table */}
            <div className="section-grid two-col">
                <div className="glass-card comparison-card">
                    <h3><VolumeX size={20} /> {t('demo.vad.withoutVad', 'Without VAD')}</h3>
                    <div className="stat-grid">
                        <StatItem label="Frames" value={vadStats.withoutVad.frames.toLocaleString()} />
                        <StatItem label="Tokens" value={vadStats.withoutVad.tokens.toLocaleString()} />
                        <StatItem label="Cost" value={`$${vadStats.withoutVad.cost.toFixed(5)}`} />
                        <StatItem label="Accuracy" value={`${vadStats.withoutVad.accuracy.toFixed(1)}%`} />
                        <StatItem label="False Positive" value={`${vadStats.withoutVad.falsePositiveRate}%`} status="bad" />
                        <StatItem label="Latency" value={`${vadStats.withoutVad.latency}ms`} status="bad" />
                    </div>
                </div>
                <div className="glass-card comparison-card highlight">
                    <h3><Volume2 size={20} /> {t('demo.vad.withVad', 'With IE VAD')} <Badge variant="success">{t('demo.vad.recommended', 'Recommended')}</Badge></h3>
                    <div className="stat-grid">
                        <StatItem label="Frames" value={vadStats.withVad.frames.toLocaleString()} status="good"
                            delta={`${(((vadStats.withVad.frames - vadStats.withoutVad.frames) / (vadStats.withoutVad.frames || 1)) * 100).toFixed(1)}%`} />
                        <StatItem label="Tokens" value={vadStats.withVad.tokens.toLocaleString()} status="good"
                            delta={`${(((vadStats.withVad.tokens - vadStats.withoutVad.tokens) / (vadStats.withoutVad.tokens || 1)) * 100).toFixed(1)}%`} />
                        <StatItem label="Cost" value={`$${vadStats.withVad.cost.toFixed(5)}`} status="good"
                            delta={`${(((vadStats.withVad.cost - vadStats.withoutVad.cost) / (vadStats.withoutVad.cost || 1)) * 100).toFixed(1)}%`} />
                        <StatItem label="Accuracy" value={`${vadStats.withVad.accuracy.toFixed(1)}%`} status="good"
                            delta={`+${(vadStats.withVad.accuracy - vadStats.withoutVad.accuracy).toFixed(1)}pp`} deltaUp />
                        <StatItem label="False Positive" value={`${vadStats.withVad.falsePositiveRate}%`} status="good"
                            delta={`${(((vadStats.withVad.falsePositiveRate - vadStats.withoutVad.falsePositiveRate) / (vadStats.withoutVad.falsePositiveRate || 1)) * 100).toFixed(0)}%`} />
                        <StatItem label="Latency" value={`${vadStats.withVad.latency}ms`} status="good"
                            delta={`${(((vadStats.withVad.latency - vadStats.withoutVad.latency) / (vadStats.withoutVad.latency || 1)) * 100).toFixed(0)}%`} />
                    </div>
                </div>
            </div>

            {/* Waveform visualization */}
            <div className="glass-card">
                <h3><Activity size={20} /> {t('demo.vad.waveformTitle', 'VAD Waveform Visualization')}</h3>
                <WaveformViz segments={vadData?.segments} />
            </div>

            {/* Download Stats Button */}
            {vadData && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
                    <Button className="sample-"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}
                        onClick={() => {
                            const exportData = {
                                timestamp: vadData.timestamp || new Date().toISOString(),
                                sample: selectedSample || 'uploaded_file',
                                source: vadData.source || 'ie_vad',
                                vendor: vadData.vendor || 'dashscope',
                                duration_sec: vadData.durationSec,
                                talk_ratio: vadData.talkRatio,
                                vad_analysis: {
                                    total_frames: vadData.totalFrames,
                                    speech_frames: vadData.speechFrames,
                                    silence_frames: vadData.silenceFrames,
                                    vad_latency_ms: vadData.latency_ms,
                                },
                                without_vad: vadData.withoutVad,
                                with_vad: vadData.withVad,
                                savings: vadData.savings,
                                accuracy_gain_pp: vadData.accuracyGain || (vadData.withVad.accuracy - vadData.withoutVad.accuracy),
                                ground_truth: vadData.groundTruth || null,
                                segments: vadData.segments,
                            };
                            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                            downloadJSON(exportData, `vad_report_${selectedSample || 'upload'}_${ts}.json`);
                        }}
                    >
                        <Download size={14} /> {t('demo.exportReport', 'Export Report')}
                    </Button>
                </div>
            )}
        </div>
    );
}

function StatItem({ label, value, status, delta, deltaUp }: { label: string; value: string; status?: 'good' | 'bad'; delta?: string; deltaUp?: boolean }) {
    return (
        <div className={`stat-item ${status || ''}`}>
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
            {delta && (
                <span style={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: '8px',
                    marginTop: '2px',
                    background: deltaUp ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.12)',
                    color: '#16a34a',
                }}>
                    {deltaUp ? '↑' : '↓'} {delta}
                </span>
            )}
        </div>
    );
}

function WaveformViz({ segments: externalSegments }: { segments?: Array<{ start: number; end: number; speech: boolean }> }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width = canvas.offsetWidth * 2;
        const h = canvas.height = 200;
        ctx.clearRect(0, 0, w, h);

        // Use real segments from VAD analysis if available, otherwise demo
        const segments = externalSegments || [
            { start: 0.02, end: 0.15, speech: true },
            { start: 0.15, end: 0.22, speech: false },
            { start: 0.22, end: 0.38, speech: true },
            { start: 0.38, end: 0.42, speech: false },
            { start: 0.42, end: 0.60, speech: true },
            { start: 0.60, end: 0.68, speech: false },
            { start: 0.68, end: 0.82, speech: true },
            { start: 0.82, end: 0.88, speech: false },
            { start: 0.88, end: 0.98, speech: true },
        ];

        // Draw segments
        for (const seg of segments) {
            const x1 = seg.start * w;
            const x2 = seg.end * w;
            ctx.fillStyle = seg.speech ? 'rgba(34, 197, 94, 0.15)' : 'rgba(107, 114, 128, 0.08)';
            ctx.fillRect(x1, 0, x2 - x1, h);
        }

        // Draw waveform
        ctx.lineWidth = 1;
        const mid = h / 2;
        for (let x = 0; x < w; x++) {
            const t = x / w;
            const seg = segments.find(s => t >= s.start && t < s.end);
            const isSpeech = seg?.speech ?? false;
            const amp = isSpeech ? (30 + Math.random() * 40) : (2 + Math.random() * 8);
            ctx.strokeStyle = isSpeech ? '#22c55e' : '#4b5563';
            ctx.beginPath();
            ctx.moveTo(x, mid - amp);
            ctx.lineTo(x, mid + amp);
            ctx.stroke();
        }

        // Labels
        ctx.font = '20px Inter, sans-serif';
        ctx.fillStyle = '#16a34a';
        ctx.fillText('■ Speech (sent to ASR)', 10, h - 10);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('■ Silence (filtered by VAD)', 340, h - 10);
    }, [externalSegments]);

    return <canvas ref={canvasRef} className="waveform-canvas" />;
}

// ─── Tab 3: Emotion & Stress ─────────────────────────────────────────────

function EmotionTab() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [serResult, setSerResult] = useState<SERResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [selectedSample, setSelectedSample] = useState<string | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = React.useRef<HTMLAudioElement>(null);
    const timelineRef = React.useRef<HTMLDivElement>(null);
    const upload = useFileUpload('.wav,.mp3');
    const [silenceThreshold, setSilenceThreshold] = useState(0.03);
    const [serviceStatus, setServiceStatus] = useState<{ available: boolean; message?: string; checking: boolean }>({ available: true, checking: true });

    // Load persisted silence threshold from platform settings
    useEffect(() => {
        (async () => {
            try {
                const settings = await getPlatformSettings();
                const st = settings?.speechEmotion?.silenceThreshold;
                if (st && st > 0) setSilenceThreshold(st);
            } catch { /* use default */ }
        })();
    }, []);

    // Remote Configuration State
    const [config, setConfig] = useState({
        vad_energy_threshold: 0.05,
        confidence_baseline: 0.35,
        noise_reduction: 0.1
    });

    // Check service availability via /health endpoint
    useEffect(() => {
        let mounted = true;
        const checkService = async () => {
            try {
                const res = await fetch('/demo/ser-health');
                if (!res.ok) throw new Error(`Health endpoint returned ${res.status}`);
                const data = await res.json();
                if (!mounted) return;
                if (data.status === 'ok' && data.models_loaded) {
                    setServiceStatus({ available: true, checking: false });
                } else {
                    setServiceStatus({
                        available: false,
                        checking: false,
                        message: `SER service is loading (status: ${data.status}). Please wait and refresh.`
                    });
                }
            } catch (err) {
                console.error('SER service unavailable:', err);
                if (mounted) {
                    setServiceStatus({
                        available: false,
                        checking: false,
                        message: 'SER analysis service is not reachable. Please ensure the Python SER service (ser-service) is running on port 8000.'
                    });
                }
            }
        };
        checkService();
        return () => { mounted = false; };
    }, []);

    // Fetch initial configuration from Python backend (separate, non-blocking)
    useEffect(() => {
        let mounted = true;
        fetch('/demo/analyze/emotion/config')
            .then(res => res.json())
            .then(data => {
                if (!mounted) return;
                setConfig({
                    vad_energy_threshold: data.vad_energy_threshold ?? 0.05,
                    confidence_baseline: data.confidence_baseline ?? 0.35,
                    noise_reduction: data.noise_reduction ?? 0.1
                });
            })
            .catch(err => console.error("Failed to fetch initial SER config", err));
        return () => { mounted = false; };
    }, []);

    // Push configuration updates to Python backend
    const updateConfig = async (key: string, value: number) => {
        setConfig(prev => ({ ...prev, [key]: value }));
        try {
            await fetch('/demo/analyze/emotion/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: value })
            });
        } catch (err) { }
    };

    // Progress tracking
    const [progress, setProgress] = useState<{ current: number; total: number; segments: number } | null>(null);
    const progressTimerRef = React.useRef<ReturnType<typeof setInterval> | undefined>(undefined);

    const startProgress = (totalDurationSec: number) => {
        const totalSegments = Math.ceil(totalDurationSec / 1.5);
        setProgress({ current: 0, total: totalDurationSec, segments: totalSegments });
        const stepMs = 400; // update every 400ms
        const stepsToFill = Math.max(5, totalSegments * 2); // ~0.8s per segment
        let step = 0;
        progressTimerRef.current = setInterval(() => {
            step++;
            const pct = Math.min(0.92, step / stepsToFill);
            setProgress(prev => prev ? { ...prev, current: +(pct * prev.total).toFixed(1) } : null);
            if (step >= stepsToFill) clearInterval(progressTimerRef.current);
        }, stepMs);
    };
    const stopProgress = () => {
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        setProgress(prev => prev ? { ...prev, current: prev.total } : null);
        setTimeout(() => setProgress(null), 800);
    };

    const handleAnalyzePreset = async (sampleId: string) => {
        const sample = DEMO_SAMPLES_STATIC.find(s => s.id === sampleId);
        if (!sample) return;
        setSelectedSample(sampleId);
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(sample.wav);
            const blob = await response.blob();
            const file = new File([blob], `${sampleId}.wav`, { type: 'audio/wav' });
            const { pcm, sampleRate } = await audioFileToPCM(file);
            const durationSec = (pcm.byteLength / 2) / sampleRate;
            startProgress(durationSec);
            const data = await sendPCM('/ser', pcm, sampleRate, {
                vad_energy_threshold: String(config.vad_energy_threshold ?? 0.05),
                confidence_baseline: String(config.confidence_baseline ?? 0.35),
                noise_reduction: String(config.noise_reduction ?? 0.1)
            });
            setSerResult(data);
            setLatencyMs(data.latency_ms || null);
            setAudioUrl(sample.wav);
            setCurrentTime(0);
            stopProgress();
        } catch (err: any) {
            console.error('SER preset analysis failed:', err);
            setError(err.message || 'SER analysis failed. Ensure the backend is running.');
            stopProgress();
        } finally {
            setLoading(false);
        }
    };

    const handleAnalyze = async () => {
        if (!upload.file) {
            setError('Upload a WAV or MP3 file, or select a preset sample');
            return;
        }
        setLoading(true);
        setError(null);
        setSerResult(null);
        setSelectedSample(null);
        try {
            const { pcm, sampleRate } = await audioFileToPCM(upload.file);
            const durationSec = (pcm.byteLength / 2) / sampleRate;
            startProgress(durationSec);
            const data = await sendPCM('/ser', pcm, sampleRate, {
                vad_energy_threshold: String(config.vad_energy_threshold ?? 0.05),
                confidence_baseline: String(config.confidence_baseline ?? 0.35),
                noise_reduction: String(config.noise_reduction ?? 0.1)
            });
            setSerResult(data);
            setLatencyMs(data.latency_ms || null);
            setAudioUrl(URL.createObjectURL(upload.file));
            setCurrentTime(0);
            stopProgress();
        } catch (err: any) {
            console.error('SER analysis failed:', err);
            setError(err.message || 'SER analysis failed. Ensure the Ingestion Engine is running.');
            stopProgress();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tab-section">
            {/* Service availability warning */}
            {!serviceStatus.checking && !serviceStatus.available && (
                <div className="service-warning-banner">
                    <AlertTriangle size={20} />
                    <div>
                        <strong>{t('demo.ser.serviceUnavailable', 'SER Service Unavailable')}</strong>
                        <p>{serviceStatus.message}</p>
                    </div>
                </div>
            )}
            <div className="section-grid two-col">
                {/* Input */}
                <div className="glass-card">
                    <h3><Brain size={20} /> {t('demo.ser.audioInput', 'Audio Input')}</h3>

                    {/* Preset samples */}
                    <div className="sample-selector">
                        <label>{t('demo.presetSamples', 'Preset Samples')}</label>
                        <div className="sample-buttons">
                            {DEMO_SAMPLES_STATIC.map(s => (
                                <Button key={s.id}
                                    className={`sample-btn ${selectedSample === s.id ? 'active' : ''}`}
                                    onClick={() => handleAnalyzePreset(s.id)}
                                    disabled={loading}>
                                    <span>{s.icon}</span> {s.fallback}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Unified audio player (preset or uploaded) */}
                    {audioUrl && serResult && (
                        <div style={{
                            marginTop: 12,
                            padding: '10px 14px',
                            background: 'rgba(0,0,0,0.03)',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                        }}>
                            <Volume2 size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                                {selectedSample
                                    ? DEMO_SAMPLES_STATIC.find(s => s.id === selectedSample)?.fallback || 'Preset'
                                    : upload.file?.name || 'Audio'}
                            </span>
                            <audio
                                ref={audioRef}
                                controls
                                src={audioUrl}
                                style={{ flex: 1, height: 32 }}
                                onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
                            />
                        </div>
                    )}

                    {/* Upload */}
                    <div className="upload-section">
                        <label>{t('demo.uploadOwn', 'Or Upload Your Own')}</label>
                        <upload.DropZone>
                            {upload.file ? (
                                <div className="file-info">
                                    <FileAudio size={24} />
                                    <span>{upload.file.name}</span>
                                </div>
                            ) : (
                                <div className="drop-prompt">
                                    <Upload size={32} />
                                    <p>{t('demo.ser.dropPrompt', 'Drop audio file for emotion analysis')}</p>
                                    <span>{t('demo.ser.stereoHint', 'PCAP / WAV / MP3 · Stereo supported')}</span>
                                </div>
                            )}
                        </upload.DropZone>
                    </div>
                    {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>⚠️ {error}</p>}
                    {latencyMs && !loading && <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 13 }}>⏱ {latencyMs}ms</p>}

                    {/* Analysis Progress Bar */}
                    {progress && loading && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.75rem' }}>
                                <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                    Analyzing... {progress.current.toFixed(1)}s / {progress.total.toFixed(1)}s
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>
                                    ~{progress.segments} segments
                                </span>
                            </div>
                            <div style={{
                                height: 6,
                                borderRadius: 3,
                                background: 'rgba(0,0,0,0.08)',
                                overflow: 'hidden',
                                position: 'relative',
                            }}>
                                <div style={{
                                    width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
                                    height: '100%',
                                    borderRadius: 3,
                                    background: 'linear-gradient(90deg, var(--primary), #a78bfa, var(--primary))',
                                    backgroundSize: '200% 100%',
                                    animation: 'progress-shimmer 1.5s linear infinite',
                                    transition: 'width 0.4s ease',
                                }} />
                            </div>
                        </div>
                    )}
                    {/* Silence threshold slider */}
                    <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                🔇 {t('demo.ser.silenceFilter', 'Silence Filter (RMS threshold)')}
                            </label>
                            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600 }}>
                                {silenceThreshold.toFixed(3)}
                            </span>
                        </div>
                        <Input
                            type="range" min="0.005" max="0.10" step="0.005"
                            value={silenceThreshold}
                            onChange={e => setSilenceThreshold(parseFloat(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--primary)' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            <span>{t('demo.ser.sensitive', 'Sensitive (0.005)')}</span>
                            <span>{t('demo.ser.aggressive', 'Aggressive (0.10)')}</span>
                        </div>
                    </div>

                    {/* Heuristic Tuning Sliders */}
                    <div style={{ marginTop: 12, padding: '12px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-sm)' }}>
                        <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: 6 }}>{t('demo.ser.heuristicTuning', 'Heuristic Tuning')}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Slider 1: VAD Energy */}
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    <span>{t('demo.ser.energyThreshold', 'Energy Threshold')}</span>
                                    <span style={{ color: 'var(--primary)' }}>{(config?.vad_energy_threshold ?? 0.05).toFixed(2)}</span>
                                </div>
                                <Input
                                    type="range" min="0.01" max="0.30" step="0.01" value={config?.vad_energy_threshold ?? 0.05}
                                    onChange={(e) => updateConfig('vad_energy_threshold', parseFloat(e.target.value))}
                                    style={{ accentColor: 'var(--primary)', width: '100%' }}
                                />
                            </label>

                            {/* Slider 2: Confidence Baseline */}
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    <span>{t('demo.ser.confidenceBaseline', 'Confidence Baseline')}</span>
                                    <span style={{ color: 'var(--primary)' }}>{(config?.confidence_baseline ?? 0.35).toFixed(2)}</span>
                                </div>
                                <Input
                                    type="range" min="0.1" max="0.8" step="0.01" value={config?.confidence_baseline ?? 0.35}
                                    onChange={(e) => updateConfig('confidence_baseline', parseFloat(e.target.value))}
                                    style={{ accentColor: 'var(--primary)', width: '100%' }}
                                />
                            </label>

                            {/* Slider 3: Noise Reduction */}
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    <span>{t('demo.ser.signalPolish', 'Signal Polish')}</span>
                                    <span style={{ color: 'var(--primary)' }}>{(config?.noise_reduction ?? 0.1).toFixed(2)}</span>
                                </div>
                                <Input
                                    type="range" min="0.0" max="0.5" step="0.05" value={config?.noise_reduction ?? 0.1}
                                    onChange={(e) => updateConfig('noise_reduction', parseFloat(e.target.value))}
                                    style={{ accentColor: 'var(--primary)', width: '100%' }}
                                />
                            </label>
                        </div>
                    </div>

                    <Button onClick={handleAnalyze} disabled={loading} style={{ marginTop: 12 }}>
                        {loading ? <><Loader2 size={18} className="spin" /> {t('demo.analyzing', 'Analyzing...')}</> :
                            <><Brain size={18} /> {t('demo.ser.analyzeUpload', 'Analyze Upload')}</>}
                    </Button>

                    {/* Stress Score — computed from SER result */}
                    <div className="stress-section">
                        <h4><Gauge size={18} /> {t('demo.ser.stressFormula', 'Stress Score Formula')}</h4>
                        {(() => {
                            // 从SER结果算stress (或用默认值)
                            const arousal = serResult?.avg_arousal ?? 0;
                            const valence = serResult?.avg_valence ?? 0;
                            const dominant = serResult?.dominant || 'neutral';
                            const emotionCount = serResult?.emotions?.length || 0;

                            // Stress factors derived from emotion data
                            const emotionStress = dominant === 'angry' ? 0.9 : dominant === 'sad' ? 0.6 : dominant === 'happy' ? 0.1 : 0.2;
                            const arousalFactor = Math.min(1, arousal); // high arousal = more stress
                            const valenceFactor = Math.max(0, (1 - (valence + 1) / 2)); // negative valence = more stress
                            const variabilityFactor = emotionCount > 3 ? 0.4 : emotionCount > 1 ? 0.2 : 0.05;

                            const overall = (emotionStress * 0.30 + arousalFactor * 0.25 + valenceFactor * 0.25 + variabilityFactor * 0.20);
                            const stressColor = overall > 0.6 ? '#ef4444' : overall > 0.35 ? '#f59e0b' : '#22c55e';
                            const stressLabel = overall > 0.6 ? t('demo.ser.high', 'High') : overall > 0.35 ? t('demo.ser.moderate', 'Moderate') : t('demo.ser.low', 'Low');

                            return (
                                <>
                                    <div className="stress-factors">
                                        <StressFactor label="Emotion Intensity" weight={30} value={parseFloat(emotionStress.toFixed(2))} />
                                        <StressFactor label="Arousal Level" weight={25} value={parseFloat(arousalFactor.toFixed(2))} />
                                        <StressFactor label="Valence (neg→stress)" weight={25} value={parseFloat(valenceFactor.toFixed(2))} />
                                        <StressFactor label="Emotion Variability" weight={20} value={parseFloat(variabilityFactor.toFixed(2))} />
                                    </div>
                                    <div className="stress-total">
                                        <span>{t('demo.ser.overallStress', 'Overall Stress')}:</span>
                                        <span className="stress-value" style={{ color: stressColor }}>{overall.toFixed(2)}</span>
                                        <span className="stress-label">{stressLabel}</span>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>

                {/* Results */}
                <div className="glass-card">
                    <h3><BarChart3 size={20} /> {t('demo.ser.emotionAnalysis', 'Emotion Analysis')}</h3>
                    {serResult ? (
                        <div className="emotion-results">
                            {/* Header summary */}
                            <div className="dominant-emotion">
                                <span className="dominant-label">{t('demo.ser.dominant', 'Dominant')}:</span>
                                <span className="dominant-value" style={{ color: EMOTION_COLORS[serResult.dominant || 'neutral'] }}>
                                    {serResult.dominant}
                                </span>
                                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {serResult.emotions?.length || 0} segments · {
                                        serResult.emotions?.length
                                            ? `${serResult.emotions[0]?.start?.toFixed(1)}s – ${serResult.emotions[serResult.emotions.length - 1]?.end?.toFixed(1)}s`
                                            : '—'
                                    }
                                </span>
                            </div>

                            {/* Arousal-Valence summary */}
                            <div className="av-display">
                                <div className="av-item">
                                    <span>{t('demo.ser.avgArousal', 'Avg Arousal')}</span>
                                    <span className="av-value">{serResult.avg_arousal?.toFixed(2)}</span>
                                </div>
                                <div className="av-item">
                                    <span>{t('demo.ser.avgValence', 'Avg Valence')}</span>
                                    <span className="av-value">{serResult.avg_valence?.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Emotion timeline with playback sync */}
                            <div className="emotion-timeline" ref={timelineRef} style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '12px' }}>
                                {serResult.emotions?.map((e, i) => {
                                    const color = EMOTION_COLORS[e.emotion] || '#6b7280';
                                    const isActive = isPlaying && currentTime >= (e.start ?? 0) && currentTime < (e.end ?? 0);
                                    return (
                                        <div
                                            key={i}
                                            className={`timeline-row ${isActive ? 'timeline-active' : ''}`}
                                            ref={(el) => { if (isActive && el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: '60px 70px 1fr 50px',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '4px 6px',
                                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                fontSize: '0.78rem',
                                                borderRadius: '4px',
                                                background: isActive ? `${color}18` : 'transparent',
                                                boxShadow: isActive ? `inset 3px 0 0 ${color}` : 'none',
                                                transition: 'background 0.15s, box-shadow 0.15s',
                                                cursor: 'pointer',
                                            }}
                                            onClick={() => {
                                                if (audioRef.current && e.start !== undefined) {
                                                    audioRef.current.currentTime = e.start;
                                                    audioRef.current.play();
                                                }
                                            }}
                                        >
                                            {/* Time */}
                                            <span style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: isActive ? 600 : 400 }}>
                                                {e.start?.toFixed(1)}s
                                            </span>
                                            {/* Emotion label */}
                                            <span style={{ color, fontWeight: 600, textTransform: 'capitalize' }}>
                                                {e.emotion}
                                            </span>
                                            {/* Bar */}
                                            <div style={{
                                                height: '14px',
                                                borderRadius: '3px',
                                                background: 'rgba(255,255,255,0.06)',
                                                overflow: 'hidden',
                                            }}>
                                                <div style={{
                                                    width: `${e.confidence * 100}%`,
                                                    height: '100%',
                                                    background: isActive
                                                        ? `linear-gradient(90deg, ${color}, ${color})`
                                                        : `linear-gradient(90deg, ${color}88, ${color})`,
                                                    borderRadius: '3px',
                                                    transition: 'width 0.3s ease',
                                                }} />
                                            </div>
                                            {/* Percentage */}
                                            <span style={{ textAlign: 'right', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                                {(e.confidence * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <Brain size={48} />
                            <p>{t('demo.ser.emptyPrompt', 'Upload audio and run <strong>SER Analysis</strong> to see results')}</p>
                            <span>{t('demo.ser.modelDesc', 'Uses ONNX wav2vec2-XLSR model (7-class emotion)')}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Download Stats Button */}
            {serResult && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
                    <Button className="sample-"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}
                        onClick={() => {
                            const exportData = {
                                timestamp: new Date().toISOString(),
                                sample: selectedSample || 'uploaded_file',
                                source: 'ie_ser',
                                vendor: serResult.vendor || 'onnx_wav2vec2',
                                latency_ms: latencyMs,
                                emotions: serResult.emotions,
                                dominant: serResult.dominant,
                                avg_arousal: serResult.avg_arousal,
                                avg_valence: serResult.avg_valence,
                                stress_score: serResult.stress_score,
                            };
                            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                            downloadJSON(exportData, `emotion_report_${selectedSample || 'upload'}_${ts}.json`);
                        }}
                    >
                        <Download size={14} /> {t('demo.exportReport', 'Export Report')}
                    </Button>
                </div>
            )}
        </div>
    );
}

function StressFactor({ label, weight, value }: { label: string; weight: number; value: number }) {
    return (
        <div className="stress-factor">
            <div className="stress-factor-header">
                <span>{label}</span>
                <span className="weight">{weight}%</span>
            </div>
            <div className="stress-bar-track">
                <div className="stress-bar-fill" style={{ width: `${value * 100}%` }} />
            </div>
            <span className="stress-factor-val">{value.toFixed(2)}</span>
        </div>
    );
}

// ─── Tab 4: LLM AI Features ─────────────────────────────────────────────

function LLMTab() {
    const { t } = useTranslation();
    const [selectedConv, setSelectedConv] = useState(SAMPLE_CONVERSATIONS[0].id);
    const [customText, setCustomText] = useState('');
    const [vendor, setVendor] = useState('dashscope');
    const [vendors, setVendors] = useState<Array<{ id: string; provider: string; name: string }>>([]);
    const [vendorsLoading, setVendorsLoading] = useState(true);
    const [feature, setFeature] = useState<string>('sentiment');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);

    const conv = SAMPLE_CONVERSATIONS.find(c => c.id === selectedConv)!;

    useEffect(() => {
        const fetchVendors = async () => {
            try {
                const response = await api.get('/platform/llm-vendors');
                if (response.data?.success && response.data.data?.vendors) {
                    const allVendors = response.data.data.vendors;
                    // For LLMs, we just show all configured vendors (except if they explicitly failed)
                    let available = allVendors.filter((v: any) => v.provider === 'mock' || v.lastTestResult !== 'failed');

                    // If we have actual working real vendors (i.e. length > 1 because mock is always there),
                    // let's hide the mock one so the user only sees real ones as requested.
                    const realVendors = available.filter((v: any) => v.provider !== 'mock');
                    if (realVendors.length > 0) {
                        available = realVendors;
                    }

                    if (available.length > 0) {
                        setVendors(available);
                        // Try to select primary vendor if it's available and tested
                        const primaryId = response.data.data.primaryId;
                        const activeVendor = available.find((v: any) => v.id === primaryId);
                        setVendor((activeVendor || available[0]).provider);
                    } else if (allVendors.length > 0) {
                        // If no one passed tests, just show them anyway to let user see error
                        setVendors(allVendors);
                        setVendor(allVendors[0].provider);
                    } else {
                        // Fallback completely
                        setVendors([{ id: 'mock', provider: 'mock', name: 'Mock' }]);
                        setVendor('mock');
                    }
                }
            } catch (err) {
                console.warn('Failed to load LLM vendors, using fallback', err);
                setVendors([{ id: 'mock', provider: 'mock', name: 'Mock' }]);
                setVendor('mock');
            } finally {
                setVendorsLoading(false);
            }
        };
        fetchVendors();
    }, []);

    const features = [
        { id: 'sentiment', label: t('demo.llm.sentiment', 'Sentiment Analysis'), icon: '😊' },
        { id: 'quality', label: t('demo.llm.quality', 'Quality Inspection'), icon: '✅' },
        { id: 'summary', label: t('demo.llm.summary', 'Call Summary'), icon: '📝' },
        { id: 'outcome', label: t('demo.llm.outcome', 'Outcome Prediction'), icon: '🎯' },
        { id: 'checklist', label: t('demo.llm.checklist', 'Checklist Generation'), icon: '📋' },
    ];

    const [error, setError] = useState<string | null>(null);

    const handleRun = async () => {
        setLoading(true);
        setResult(null);
        setError(null);
        const inputText = customText || conv.text;

        try {
            let data: any;

            switch (feature) {
                case 'sentiment':
                    data = await demoApi.post('/sentiment', { text: inputText, vendor });
                    break;
                case 'quality':
                    data = await demoApi.post('/quality', { text: inputText, vendor });
                    break;
                case 'summary':
                    data = await demoApi.post('/summary', { text: inputText, vendor });
                    break;
                case 'outcome':
                    data = await demoApi.post('/outcome', { text: inputText, vendor });
                    break;
                case 'checklist':
                    data = await demoApi.post('/checklist', {
                        description: 'Generate a quality checklist for this customer service call',
                        industry: 'contact_center',
                        vendor
                    });
                    break;
            }
            setResult(data);
        } catch (err: any) {
            console.error('LLM analysis failed:', err);
            setError(err.message || 'Analysis failed. Check that app-server is running.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tab-section">
            <div className="section-grid two-col">
                {/* Left: Input */}
                <div className="glass-card">
                    <h3><Sparkles size={20} /> {t('demo.llm.input', 'Input')}</h3>

                    {/* Conversation selector */}
                    <div className="sample-selector">
                        <label>{t('demo.llm.sampleConversations', 'Sample Conversations')}</label>
                        <div className="sample-buttons">
                            {SAMPLE_CONVERSATIONS.map(c => (
                                <Button key={c.id}
                                    className={`sample-btn ${selectedConv === c.id ? 'active' : ''}`}
                                    onClick={() => { setSelectedConv(c.id); setCustomText(''); setResult(null); }}>
                                    {c.label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Text area */}
                    <Textarea
                        className="text-input"
                        rows={8}
                        value={customText || conv.text}
                        onChange={e => setCustomText(e.target.value)}
                        placeholder="Paste or edit conversation text..."
                    />

                    {/* Vendor + Feature selectors */}
                    <div className="vendor-selector">
                        <label>{t('demo.llm.vendor', 'LLM Vendor')} {vendorsLoading && <Loader2 size={12} className="spin" style={{ display: 'inline', marginLeft: 6, verticalAlign: 'middle' }} />}</label>
                        <div className="vendor-buttons">
                            {vendors.map(v => (
                                <Button key={v.id}
                                    className={`vendor-btn ${vendor === v.provider ? 'active' : ''}`}
                                    onClick={() => { setVendor(v.provider); setResult(null); }}
                                    title={v.name}
                                >
                                    {v.provider === 'dashscope' ? 'DashScope' :
                                        v.provider === 'openai' ? 'OpenAI' :
                                            v.provider === 'anthropic' ? 'Anthropic' :
                                                v.provider === 'openrouter' ? 'OpenRouter' : 'Mock'}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className="feature-selector">
                        <label>{t('demo.llm.aiFeature', 'AI Feature')}</label>
                        <div className="feature-buttons">
                            {features.map(f => (
                                <Button key={f.id}
                                    className={`feature-btn ${feature === f.id ? 'active' : ''}`}
                                    onClick={() => { setFeature(f.id); setResult(null); }}>
                                    <span>{f.icon}</span> {f.label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <Button onClick={handleRun} disabled={loading}>
                        {loading ? <><Loader2 size={18} className="spin" /> {t('demo.llm.running', 'Running...')}</> :
                            <><Zap size={18} /> {t('demo.llm.runAnalysis', 'Run Analysis')}</>}
                    </Button>
                </div>

                {/* Right: Results */}
                <div className="glass-card">
                    <h3><BarChart3 size={20} /> {t('demo.results', 'Results')}</h3>
                    {error && (
                        <div className="empty-state" style={{ color: '#ef4444' }}>
                            <p>⚠️ {error}</p>
                        </div>
                    )}
                    {result ? (
                        <div className="llm-result">
                            {/* Token/latency usage */}
                            <div className="token-usage">
                                {result.model && <span className="token-badge">Model: {result.model}</span>}
                                {result.vendor && <span className="token-badge">Vendor: {result.vendor}</span>}
                                {result.latency_ms && <span className="token-badge">⏱ {result.latency_ms}ms</span>}
                                {result.tokens && (
                                    <span className="token-badge">
                                        Tokens: {result.tokens.total}
                                    </span>
                                )}
                            </div>

                            {/* Feature-specific render */}
                            {feature === 'sentiment' && (
                                <div className="sentiment-result">
                                    <div className={`sentiment-badge ${result.sentiment}`}>
                                        {result.sentiment === 'positive' ? '😊' : result.sentiment === 'negative' ? '😠' : '😐'}
                                        {result.sentiment}
                                    </div>
                                    <div className="score-bar">
                                        <div className="score-fill" style={{
                                            width: `${result.score * 100}%`,
                                            background: result.sentiment === 'positive' ? '#22c55e' : '#ef4444'
                                        }} />
                                    </div>
                                    <p className="reason-text">{result.reason}</p>
                                </div>
                            )}
                            {feature === 'quality' && (
                                <div className="qi-result">
                                    <div className="qi-overall">Overall: <strong>{result.overall}/100</strong></div>
                                    {result.results.map((r: any, i: number) => (
                                        <div key={i} className="qi-rule">
                                            <span>{r.ruleName}</span>
                                            <span className="qi-score">{r.score}</span>
                                            <p>{r.reason}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {feature === 'summary' && (
                                <div className="summary-result">
                                    <p>{result.summary}</p>
                                </div>
                            )}
                            {feature === 'outcome' && (
                                <div className="outcome-result">
                                    <div className="outcome-badge">{result.outcome}</div>
                                    <div className="outcome-confidence">Confidence: {(result.confidence * 100).toFixed(0)}%</div>
                                    <p>{result.reasoning}</p>
                                </div>
                            )}
                            {feature === 'checklist' && (
                                <div className="checklist-result">
                                    {result.rules.map((r: any, i: number) => (
                                        <div key={i} className="checklist-rule">
                                            <CheckCircle2 size={16} />
                                            <span className="rule-name">{r.name}</span>
                                            <span className="rule-cat">{r.category}</span>
                                            <span className="rule-weight">{r.weight}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="empty-state">
                            <Sparkles size={48} />
                            <p>{t('demo.llm.emptyPrompt', 'Select a feature and click <strong>Run Analysis</strong>')}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Tab 5: RAG Knowledge ────────────────────────────────────────────────

function RAGTab() {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<any[]>([]);

    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const data = await demoApi.post('/rag', { query });
            setResults(data.results || []);
        } catch (err: any) {
            console.error('RAG search failed:', err);
            setError(err.message || 'Search failed. Check that app-server is running.');
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tab-section">
            <div className="glass-card">
                <h3><Network size={20} /> {t('demo.rag.title', 'Knowledge Base Search')}</h3>
                <p className="section-desc">{t('demo.rag.desc', 'Search the knowledge base using vector similarity (Qdrant). Results are ranked by embedding cosine similarity.')}</p>
                <div className="search-row">
                    <Input type="text" className="search-input" placeholder={t('demo.rag.placeholder', 'e.g., How to handle refund complaints?')}
                        value={query} onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                    <Button onClick={handleSearch} disabled={loading}>
                        {loading ? <Loader2 size={18} className="spin" /> : <Zap size={18} />}
                        {t('common.search', 'Search')}
                    </Button>
                </div>
                {error && (
                    <div className="empty-state" style={{ color: '#ef4444', minHeight: 'auto', padding: '16px' }}>
                        <p>⚠️ {error}</p>
                    </div>
                )}
                {results.length > 0 && (
                    <div className="rag-results">
                        {results.map((r, i) => (
                            <div key={i} className="rag-result-card">
                                <div className="rag-header">
                                    <span className="rag-title">{r.title}</span>
                                    <span className="rag-score">Score: {r.score.toFixed(2)}</span>
                                </div>
                                <span className="rag-category">{r.category}</span>
                                <p className="rag-content">{r.content}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Tab 6: Pipeline Overview ────────────────────────────────────────────

function PipelineTab() {
    const { t } = useTranslation();
    return (
        <div className="tab-section">
            <div className="glass-card pipeline-card">
                <h3><Activity size={20} /> {t('demo.pipeline.title', 'CXMind End-to-End Pipeline')}</h3>
                <p className="section-desc">
                    {t('demo.pipeline.desc', 'Data flows from SIP/RTP ingestion through AI analysis to actionable insights.')}
                </p>

                <div className="pipeline-flow">
                    {/* Row 1: Audio Ingestion → VAD → ASR (IE) */}
                    <div className="pipeline-branch" style={{ marginBottom: 0 }}>
                        <div className="branch-line" />
                        <span>🟢 Ingestion Engine (Go)</span>
                    </div>
                    <div className="pipeline-row">
                        <PipelineNode icon="📡" label="RTP Audio" sub="G.711/G.722/G.729/Opus" />
                        <PipelineArrow />
                        <PipelineNode icon="🔓" label="SRTP Decrypt" sub="+ PCAP Record" />
                        <PipelineArrow />
                        <PipelineNode icon="🔊" label="PCM Decode" sub="Codec → 16kHz PCM" />
                        <PipelineArrow />
                        <PipelineNode icon="🔇" label="VAD Filter" sub="Silero Neural" highlight />
                        <PipelineArrow />
                        <PipelineNode icon="🎙️" label="ASR" sub="DashScope/FunASR" highlight />
                    </div>

                    {/* Branch connector */}
                    <div className="pipeline-branch">
                        <div className="branch-line" />
                        <span>SER receives all PCM (pre-VAD)</span>
                    </div>

                    {/* Row 2: SER Pipeline (IE) */}
                    <div className="pipeline-row">
                        <PipelineNode icon="🧠" label="SER (ONNX)" sub="1.5s buffer → 16kHz" highlight />
                        <PipelineArrow />
                        <PipelineNode icon="😊" label="Emotion" sub="7-class" />
                        <PipelineArrow />
                        <PipelineNode icon="📊" label="Stress Score" sub="0.0 – 1.0" />
                        <PipelineArrow />
                        <PipelineNode icon="⚡" label="Redis PubSub" sub="call:behavior" />
                    </div>

                    {/* Row 3: RTP Quality (IE) */}
                    <div className="pipeline-row">
                        <PipelineNode icon="📦" label="RTP Packets" sub="3s Window Stats" />
                        <PipelineArrow />
                        <PipelineNode icon="⭐" label="RTP MOS (IE)" sub="Codec-aware E-Model" highlight />
                        <PipelineArrow />
                        <PipelineNode icon="⚡" label="Redis PubSub" sub="call:quality" highlight />
                    </div>

                    {/* AS boundary */}
                    <div className="pipeline-branch">
                        <div className="branch-line" />
                        <span>🔵 App Server (Node.js) — via Redis PubSub</span>
                    </div>

                    {/* Row 4: Real-time Copilot Pipeline (AS) */}
                    <div className="pipeline-row">
                        <PipelineNode icon="📝" label="Transcript" sub="Real-time stream" />
                        <PipelineArrow />
                        <PipelineNode icon="🔍" label="Intent Detect" sub="MiniLM + Centroids" highlight />
                        <PipelineArrow />
                        <PipelineNode icon="📋" label="Action Draft" sub="LLM Generation" highlight />
                        <PipelineArrow />
                        <PipelineNode icon="🔄" label="Progressive" sub="3s Debounce" />
                        <PipelineArrow />
                        <PipelineNode icon="💻" label="Copilot" sub="WebSocket Push" />
                    </div>

                    {/* Row 5: Post-call LLM Analysis (AS) */}
                    <div className="pipeline-row">
                        <PipelineNode icon="📝" label="Transcript" sub="Complete text" />
                        <PipelineArrow />
                        <PipelineNode icon="🤖" label="LLM" sub="Multi-vendor" highlight />
                        <PipelineArrow />
                        <PipelineNode icon="✅" label="QI / Summary" sub="Quality Score" />
                        <PipelineArrow />
                        <PipelineNode icon="🗺️" label="Agent Map" sub="Real-time UI" />
                        <PipelineArrow />
                        <PipelineNode icon="🔔" label="Alerts" sub="Rule Engine" />
                    </div>

                    {/* Row 6: Webhook Pipeline (AS) */}
                    <div className="pipeline-row">
                        <PipelineNode icon="📞" label="Call Events" sub="Create/Hangup" />
                        <PipelineArrow />
                        <PipelineNode icon="📮" label="Redis Queue" sub="LPUSH/RPOP" highlight />
                        <PipelineArrow />
                        <PipelineNode icon="🛡️" label="Circuit Breaker" sub="HMAC Signed" />
                        <PipelineArrow />
                        <PipelineNode icon="🔗" label="Webhook" sub="CRM / ERP" highlight />
                    </div>
                </div>

                {/* Tech specs */}
                <div className="pipeline-specs">
                    <div className="spec-item">
                        <span className="spec-label">{t('demo.pipeline.capacity', 'Capacity')}</span>
                        <span className="spec-value">5,000 concurrent calls</span>
                    </div>
                    <div className="spec-item">
                        <span className="spec-label">{t('demo.pipeline.pcapRecording', 'PCAP Recording')}</span>
                        <span className="spec-value">6,000 max recorders</span>
                    </div>
                    <div className="spec-item">
                        <span className="spec-label">{t('demo.pipeline.asrLatency', 'ASR Latency')}</span>
                        <span className="spec-value">&lt; 200ms (streaming)</span>
                    </div>
                    <div className="spec-item">
                        <span className="spec-label">{t('demo.pipeline.serInference', 'SER Inference')}</span>
                        <span className="spec-value">&lt; 50ms (ONNX CPU)</span>
                    </div>
                    <div className="spec-item">
                        <span className="spec-label">{t('demo.pipeline.webhookEvents', 'Webhook Events')}</span>
                        <span className="spec-value">6 types (create/hangup/outcome/summary/quality/action)</span>
                    </div>
                    <div className="spec-item">
                        <span className="spec-label">{t('demo.pipeline.actionDraft', 'Action Draft')}</span>
                        <span className="spec-value">Intent → LLM → Progressive Refresh</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PipelineNode({ icon, label, sub, highlight }: { icon: string; label: string; sub: string; highlight?: boolean }) {
    return (
        <div className={`pipeline-node ${highlight ? 'highlight' : ''}`}>
            <span className="node-icon">{icon}</span>
            <span className="node-label">{label}</span>
            <span className="node-sub">{sub}</span>
        </div>
    );
}

function PipelineArrow() {
    return <div className="pipeline-arrow"><ArrowRight size={16} /></div>;
}

// ─── Tab 7: Data Desensitization (PII) ───────────────────────────────────

function PIITab() {
    const { t } = useTranslation();
    const [text, setText] = useState("Agent: Hi, this is Alice calling from CXMind Support. Am I speaking with John Doe?\n\nCustomer: Yes, speaking. My ID card is 110105199001011234, phone number is +8613812345678, and my email is john.doe@example.com.");
    const [loading, setLoading] = useState(false);
    const [policy, setPolicy] = useState<'regex' | 'ner'>('regex');
    const [lang, setLang] = useState<'zh' | 'en' | 'ja' | 'auto'>('auto');
    const [nerAvailable, setNerAvailable] = useState(true);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Check if NER is available via SER health check
    useEffect(() => {
        let mounted = true;
        demoApi.get('/ser-health')
            .then((data: any) => {
                if (mounted) {
                    setNerAvailable(data.status === 'ok' && data.models_loaded);
                }
            })
            .catch(() => {
                if (mounted) setNerAvailable(false);
            });
        return () => { mounted = false; };
    }, []);

    const handleRun = async () => {
        if (!text.trim()) return;
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const data = await demoApi.post('/pii', { text, policy, lang });
            setResult(data);
        } catch (err: any) {
            console.error('PII sanitization failed:', err);
            setError(err.message || t('demo.piiSanitizationFailed', 'Sanitization failed. Check that app-server and Python ser-service are running.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tab-section">
            <div className="section-grid two-col">
                <div className="glass-card">
                    <h3><ShieldCheck size={20} /> {t('demo.inputConfig', 'Input & Configuration')}</h3>

                    <Textarea
                        className="text-input"
                        rows={8}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder={t('demo.piiPlaceholder', 'Paste text containing PII (Phone, ID, Email, Names, Orgs)...')}
                    />

                    <div className="vendor-selector">
                        <label>{t('demo.sanitizationRule', 'Sanitization Rule')}</label>
                        <div className="vendor-buttons">
                            <Button
                                className={`vendor-btn ${policy === 'regex' ? 'active' : ''}`}
                                onClick={() => setPolicy('regex')}
                            >
                                {t('demo.regexDefault', 'Regex (Default)')}
                            </Button>
                            <Button
                                className={`vendor-btn ${policy === 'ner' ? 'active' : ''}`}
                                onClick={() => setPolicy('ner')}
                                disabled={!nerAvailable}
                                title={!nerAvailable ? t('demo.nerUnavailableTooltip', 'Python SER service running the NER model is unavailable.') : undefined}
                                style={{ opacity: nerAvailable ? 1 : 0.5, cursor: nerAvailable ? 'pointer' : 'not-allowed' }}
                            >
                                {t('demo.aiNerAdvanced', 'AI NER (Advanced)')} {!nerAvailable && t('demo.unavailable', '(Unavailable)')}
                            </Button>
                        </div>
                    </div>

                    {policy === 'ner' && (
                        <div className="vendor-selector" style={{ marginTop: '1rem' }}>
                            <label>{t('demo.langContext', 'Language Context (NER Model)')}</label>
                            <div className="vendor-buttons">
                                <Button className={`vendor-btn ${lang === 'auto' ? 'active' : ''}`} onClick={() => setLang('auto')}>{t('demo.autoDetect', 'Auto-Detect')}</Button>
                                <Button className={`vendor-btn ${lang === 'zh' ? 'active' : ''}`} onClick={() => setLang('zh')}>{t('demo.chinese', 'Chinese')}</Button>
                                <Button className={`vendor-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>{t('demo.english', 'English')}</Button>
                                <Button className={`vendor-btn ${lang === 'ja' ? 'active' : ''}`} onClick={() => setLang('ja')}>{t('demo.japanese', 'Japanese')}</Button>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                                {t('demo.langHelper', 'Explicitly specifying the language helps load the most accurate spaCy model.')}
                            </span>
                        </div>
                    )}

                    <Button onClick={handleRun} disabled={loading || !text.trim()}>
                        {loading ? <><Loader2 size={18} className="spin" /> {t('demo.sanitizing', 'Sanitizing...')}</> :
                            <><ShieldCheck size={18} /> {t('demo.runSanitizer', 'Run Sanitizer')}</>}
                    </Button>
                </div>

                <div className="glass-card">
                    <h3><BarChart3 size={20} /> {t('demo.results', 'Results')}</h3>
                    {error && (
                        <div className="empty-state" style={{ color: '#ef4444' }}>
                            <p>⚠️ {error}</p>
                        </div>
                    )}
                    {result ? (
                        <div className="llm-result">
                            <div className="token-usage">
                                <span className="token-badge">{t('demo.rule', 'Rule')}: {result.policy === 'regex' ? 'Regex' : 'AI NER'}</span>
                                {result.policy === 'ner' && <span className="token-badge">{t('demo.lang', 'Lang')}: {result.lang}</span>}
                                {result.latency_ms && <span className="token-badge">⏱ {result.latency_ms}ms</span>}
                            </div>

                            <div style={{ marginTop: '1rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('demo.sanitizedOutput', 'Sanitized Output:')}</label>
                                <div style={{
                                    padding: '1rem',
                                    background: 'rgba(0,0,0,0.2)',
                                    borderRadius: 'var(--radius-sm)',
                                    marginTop: '0.5rem',
                                    whiteSpace: 'pre-wrap',
                                    fontFamily: 'monospace',
                                    lineHeight: 1.5,
                                    border: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    {result.sanitized}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <ShieldCheck size={48} />
                            <p>{t('demo.selectPolicyPrompt', 'Select a policy and click <strong>Run Sanitizer</strong>')}</p>
                            <span style={{ maxWidth: 280, marginTop: 8 }}>{t('demo.piiDesc', 'Regex catches formats like emails, IDs, etc. NER uses AI to catch context-dependent entities like Person Names, Places, or Organizations.')}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

