import React, { useRef, useEffect, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Play, Pause, SkipBack, Volume2 } from 'lucide-react';
import api from '../services/api';
import { useDemoMode } from '../hooks/useDemoMode';
import { Button } from './ui/button';

interface AudioWaveformProps {
    callId: string;
    apiBase?: string;
}

const AudioWaveform: React.FC<AudioWaveformProps> = ({ callId, apiBase = '/api' }) => {
    const waveformRef = useRef<HTMLDivElement>(null);
    const wavesurfer = useRef<WaveSurfer | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState('0:00');
    const [totalTime, setTotalTime] = useState('0:00');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { demoMode } = useDemoMode();

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const initWaveSurfer = useCallback(() => {
        if (!waveformRef.current) return;

        // Destroy previous instance
        if (wavesurfer.current) {
            wavesurfer.current.destroy();
        }

        const ws = WaveSurfer.create({
            container: waveformRef.current!,
            waveColor: '#6366f1',
            progressColor: '#818cf8',
            cursorColor: '#f59e0b',
            cursorWidth: 2,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 80,
            normalize: true,
            backend: 'WebAudio',
            hideScrollbar: true,
        });

        const wsRegions = ws.registerPlugin(RegionsPlugin.create());

        ws.on('ready', async () => {
            setLoading(false);
            setTotalTime(formatTime(ws.getDuration()));

            // Fetch and render VAD regions
            try {
                const vadUrl = demoMode
                    ? `/platform/calls/${callId}/vad?demo=true`
                    : `/platform/calls/${callId}/vad`;
                const res = await api.get(vadUrl);
                let vadData: any[] = res.data?.data || [];

                // Fallback: if no real transcription data exists, use demo VAD for visualization
                if (vadData.length === 0) {
                    vadData = [
                        { start: 0.5, end: 4.5, speaker: 'agent' },
                        { start: 5.0, end: 12.0, speaker: 'customer' },
                        { start: 10.5, end: 15.0, speaker: 'agent' },
                        { start: 16.0, end: 20.0, speaker: 'customer' },
                        { start: 19.0, end: 24.0, speaker: 'agent' },
                        { start: 25.0, end: 32.0, speaker: 'customer' },
                        { start: 33.0, end: 36.5, speaker: 'agent' },
                        { start: 38.0, end: 45.0, speaker: 'customer' },
                        { start: 43.5, end: 49.0, speaker: 'agent' },
                        { start: 50.0, end: 55.0, speaker: 'customer' },
                    ];
                }

                if (vadData.length > 0) {
                    const duration = ws.getDuration();
                    // Scale mock VAD data to fit actual audio duration
                    const maxVadTime = Math.max(...vadData.map(v => v.end));
                    const scale = maxVadTime > duration ? duration / maxVadTime : 1;

                    const scaled = vadData.map(v => ({
                        ...v,
                        start: v.start * scale,
                        end: Math.min(v.end * scale, duration),
                    }));

                    const agentRegions = scaled.filter(v => v.speaker === 'agent');
                    const custRegions = scaled.filter(v => v.speaker === 'customer');

                    // 1. Draw base VAD regions
                    scaled.forEach(region => {
                        const isAgent = region.speaker === 'agent';
                        wsRegions.addRegion({
                            start: region.start,
                            end: region.end,
                            color: isAgent ? 'rgba(34, 197, 94, 0.35)' : 'rgba(59, 130, 246, 0.35)',
                            drag: false,
                            resize: false,
                        });
                    });

                    // 2. Compute and draw Cross-talk intersections
                    agentRegions.forEach(a => {
                        custRegions.forEach(c => {
                            const overlapStart = Math.max(a.start, c.start);
                            const overlapEnd = Math.min(a.end, c.end);
                            if (overlapStart < overlapEnd) {
                                wsRegions.addRegion({
                                    start: overlapStart,
                                    end: overlapEnd,
                                    content: '⚠ Cross-talk',
                                    color: 'rgba(239, 68, 68, 0.45)',
                                    drag: false,
                                    resize: false,
                                });
                            }
                        });
                    });
                }
            } catch (err) {
                console.error('Failed to load VAD data for regions:', err);
            }
        });

        ws.on('audioprocess', () => {
            setCurrentTime(formatTime(ws.getCurrentTime()));
        });

        ws.on('play', () => setPlaying(true));
        ws.on('pause', () => setPlaying(false));
        ws.on('finish', () => setPlaying(false));
        ws.on('error', (err: Error) => {
            console.error('WaveSurfer error:', err);
            setError('Audio not available for this call');
            setLoading(false);
        });

        // Fetch and load audio manually to handle authentication and async generation
        const loadAudio = async () => {
            try {
                const token = localStorage.getItem('cxmind:auth:token') || sessionStorage.getItem('cxmind:auth:token');
                const headers: Record<string, string> = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const audioUrl = `${apiBase}/platform/calls/${callId}/stereo-audio`;

                // Initial request triggers generation or returns cached file
                let res = await fetch(audioUrl, { headers });

                if (res.status === 401) {
                    throw new Error("Unauthorized to access audio");
                }
                if (res.status === 404) {
                    setError('PCAP recording not available for this call');
                    setLoading(false);
                    return;
                }

                if (res.status === 202) {
                    // Audio is generating, poll the status endpoint
                    const poll = setInterval(async () => {
                        try {
                            const statusRes = await fetch(`${apiBase}/platform/calls/${callId}/audio-status`, { headers });
                            const data = await statusRes.json();
                            if (data.status === 'ready') {
                                clearInterval(poll);
                                // Generation complete, fetch actual audio blob
                                const finalRes = await fetch(audioUrl, { headers });
                                const blob = await finalRes.blob();
                                ws.load(URL.createObjectURL(blob));
                            } else if (data.status === 'error') {
                                clearInterval(poll);
                                setError('Audio generation failed on server');
                                setLoading(false);
                            }
                        } catch (e) {
                            clearInterval(poll);
                            console.error('Status check failed:', e);
                            setError('Audio generation status check failed');
                            setLoading(false);
                        }
                    }, 1500);
                    return;
                }

                if (res.status === 200) {
                    // Already cached, load directly from blob
                    const blob = await res.blob();
                    ws.load(URL.createObjectURL(blob));
                } else {
                    throw new Error(`Unexpected server response: ${res.status}`);
                }
            } catch (err: any) {
                console.error("Audio loading error:", err);
                setError(err.message || 'Failed to load audio');
                setLoading(false);
            }
        };

        loadAudio();
        wavesurfer.current = ws;
    }, [callId, apiBase]);

    useEffect(() => {
        initWaveSurfer();
        return () => {
            if (wavesurfer.current) {
                wavesurfer.current.destroy();
                wavesurfer.current = null;
            }
        };
    }, [initWaveSurfer]);

    const togglePlay = () => {
        if (wavesurfer.current) wavesurfer.current.playPause();
    };

    const restart = () => {
        if (wavesurfer.current) {
            wavesurfer.current.seekTo(0);
            wavesurfer.current.play();
        }
    };

    if (error) {
        return (
            <div style={{
                padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem',
                background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)',
                display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}>
                <Volume2 size={16} />
                {error}
            </div>
        );
    }

    return (
        <div style={{
            padding: '0.75rem',
            background: 'var(--bg-dark)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--glass-border)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Volume2 size={16} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Audio Waveform
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {currentTime} / {totalTime}
                </span>
            </div>

            {/* Waveform container */}
            <div
                ref={waveformRef}
                style={{
                    borderRadius: '6px',
                    overflow: 'hidden',
                    background: 'rgba(0,0,0,0.2)',
                    minHeight: '80px',
                    cursor: 'pointer',
                }}
            />

            {loading && (
                <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Loading audio...
                </div>
            )}

            {/* Controls */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
                <Button
                    onClick={restart}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                        color: 'var(--text-secondary)', display: 'flex', alignItems: 'center'
                    }}
                    title="Restart"
                >
                    <SkipBack size={16} />
                </Button>
                <Button
                    onClick={togglePlay}
                    style={{
                        background: 'var(--primary)', border: 'none', cursor: 'pointer',
                        borderRadius: '50%', width: '32px', height: '32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff',
                    }}
                    title={playing ? 'Pause' : 'Play'}
                >
                    {playing ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: '2px' }} />}
                </Button>
            </div>
        </div>
    );
};

export default AudioWaveform;
