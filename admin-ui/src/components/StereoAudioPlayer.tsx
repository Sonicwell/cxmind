import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { useTranslation } from 'react-i18next';
import { demoAudio, type TranscriptSegment } from '../services/mock-audio';
import { getMockCallDetails } from '../services/mock-data';

import { Button } from './ui/button';

interface StereoAudioPlayerProps {
    callId: string;
    onTimeUpdate?: (currentTime: number) => void;
    seekTo?: number;
}

type AudioStatus = 'idle' | 'not_started' | 'processing' | 'ready' | 'error';

// Module-level cache to track generation attempts across remounts (Strict Mode / HMR)
const generationCache = new Set<string>();

export const StereoAudioPlayer: React.FC<StereoAudioPlayerProps> = ({ callId, onTimeUpdate, seekTo }) => {
    const { t } = useTranslation();
    const [status, setStatus] = useState<AudioStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [balance, setBalance] = useState(0); // -1 (left) to 1 (right)
    const [mockTranscript, setMockTranscript] = useState<TranscriptSegment[]>([]);

    // Web Audio API context tracking is handled inside the loadWaveforms effect

    const leftAudioRef = useRef<HTMLAudioElement>(null);
    const rightAudioRef = useRef<HTMLAudioElement>(null);
    const leftCanvasRef = useRef<HTMLCanvasElement>(null);
    const rightCanvasRef = useRef<HTMLCanvasElement>(null);

    // Poll for audio status
    useEffect(() => {
        const isDemo = localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true';
        if (isDemo) return;

        let pollInterval: number;

        const checkStatus = async () => {
            try {
                const response = await api.get(`/platform/calls/${callId}/audio-status`);
                // ... same logic
                console.log('[StereoAudioPlayer] Status poll:', response.data);
                setStatus(response.data.status);
                setProgress(response.data.progress || 0);

                if (response.data.error) {
                    setError(response.data.error);
                    setErrorCode(response.data.errorCode || null);
                }

                if (response.data.status === 'ready') {
                    console.log('[StereoAudioPlayer] Audio ready!');
                    clearInterval(pollInterval);
                }
            } catch (err) {
                console.error('[StereoAudioPlayer] Failed to check audio status:', err);
            }
        };

        if (status === 'processing') {
            pollInterval = window.setInterval(checkStatus, 1000);
        }

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [callId, status]);

    const parseTimestamp = (ts: string): number => {
        const parts = ts.split(':');
        if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
        return 0;
    };

    useEffect(() => {
        const isDemo = localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true';
        if (isDemo) {
            const details = getMockCallDetails(callId);
            setMockTranscript(details.transcript);
            setStatus('ready');
            setDuration(details.callData.duration || 180);
        }
    }, [callId]);

    // Draw fake waveform for demo mode
    useEffect(() => {
        const isDemo = localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true';
        if (isDemo && status === 'ready') {
            // Draw fake waveform
            if (leftCanvasRef.current) {
                const ctx = leftCanvasRef.current.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#1a1a1a';
                    ctx.fillRect(0, 0, leftCanvasRef.current.width, leftCanvasRef.current.height);
                    ctx.fillStyle = '#6366f1';
                    for (let i = 0; i < 800; i += 2) {
                        const h = Math.random() * 20 + 5;
                        ctx.fillRect(i, 30 - h / 2, 1, h);
                    }
                }
            }
            if (rightCanvasRef.current) {
                const ctx = rightCanvasRef.current.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#1a1a1a';
                    ctx.fillRect(0, 0, rightCanvasRef.current.width, rightCanvasRef.current.height);
                    ctx.fillStyle = '#f59e0b';
                    for (let i = 0; i < 800; i += 2) {
                        const h = Math.random() * 20 + 5;
                        ctx.fillRect(i, 30 - h / 2, 1, h);
                    }
                }
            }
        }
    }, [status, callId]);

    // Start audio generation
    const handleGenerateAudio = async () => {
        console.log('[StereoAudioPlayer] Starting audio generation for call:', callId);
        setStatus('processing');
        setError(null);

        try {
            const response = await api.get(`/platform/calls/${callId}/stereo-audio`);
            console.log('[StereoAudioPlayer] Audio generation response:', response.status, response.data);

            // 202 Accepted (开始处理)
            if (response.status === 202) {
                console.log('[StereoAudioPlayer] Audio generation started, will poll for status');
                // Status polling is handled by the useEffect hook
            }
        } catch (err: any) {
            console.error('[StereoAudioPlayer] Audio generation failed:', err);
            setError(err.response?.data?.error || 'Failed to generate audio');
            setErrorCode(err.response?.data?.errorCode || 'generation_failed');
            setStatus('error');
        }
    };

    // Get audio URLs with token
    const getAudioUrl = (channel: 'left' | 'right'): string => {
        if (status !== 'ready') return '';

        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (!token) return '';

        // NOTE: Token in URL is a known limitation of <audio src>. The element cannot
        // set HTTP headers, so we pass the token as a query parameter. This is acceptable
        // because the endpoint is same-origin and short-lived. A future improvement would
        // be to use a Service Worker to intercept the request and attach the header.
        return `/api/platform/calls/${callId}/stereo-audio?token=${token}&channel=${channel}`;
    };

    const leftAudioUrl = getAudioUrl('left');
    const rightAudioUrl = getAudioUrl('right');

    // Sync playback between channels
    const syncPlayback = () => {
        if (!leftAudioRef.current || !rightAudioRef.current) return;

        // If one channel has ended, do not force sync
        if (leftAudioRef.current.ended || rightAudioRef.current.ended) return;

        const timeDiff = Math.abs(leftAudioRef.current.currentTime - rightAudioRef.current.currentTime);
        if (timeDiff > 0.2) {  // Increased tolerance to 200ms
            // Sync to the one that is further ahead? Or strict master?
            // Strict master (left) is safer for now, unless left is lagging significantly
            rightAudioRef.current.currentTime = leftAudioRef.current.currentTime;
        }
    };

    // Playback controls
    const togglePlayPause = async () => {
        if (!leftAudioRef.current || !rightAudioRef.current) {
            console.warn('[StereoAudioPlayer] Audio refs not ready');
            return;
        }

        const isDemo = localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true';

        if (isDemo) {
            if (isPlaying) {
                demoAudio.stop();
                setIsPlaying(false);
            } else {
                setIsPlaying(true);
                demoAudio.playConversation(mockTranscript, (idx) => {
                    if (mockTranscript[idx]) {
                        const time = parseTimestamp(mockTranscript[idx].timestamp);
                        setCurrentTime(time);
                        if (onTimeUpdate) onTimeUpdate(time);
                    }
                }, () => setIsPlaying(false));
            }
            return;
        }

        if (isPlaying) {
            leftAudioRef.current.pause();
            rightAudioRef.current.pause();
            setIsPlaying(false);
        } else {
            try {
                // partial sync before start
                if (!leftAudioRef.current.ended && !rightAudioRef.current.ended) {
                    rightAudioRef.current.currentTime = leftAudioRef.current.currentTime;
                }

                const p1 = leftAudioRef.current.ended ? Promise.resolve() : leftAudioRef.current.play();
                const p2 = rightAudioRef.current.ended ? Promise.resolve() : rightAudioRef.current.play();

                await Promise.all([p1, p2]);
                setIsPlaying(true);
            } catch (err) {
                console.error('[StereoAudioPlayer] Play failed:', err);
                setError('Failed to play audio. Please try again.');
            }
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = parseFloat(e.target.value);
        if (leftAudioRef.current && rightAudioRef.current) {
            leftAudioRef.current.currentTime = newTime;
            rightAudioRef.current.currentTime = newTime;
            setCurrentTime(newTime);
        }
    };

    // 外部 seekTo prop 驱动播放器跳转
    useEffect(() => {
        if (seekTo == null || seekTo < 0) return;
        if (leftAudioRef.current && rightAudioRef.current) {
            leftAudioRef.current.currentTime = seekTo;
            rightAudioRef.current.currentTime = seekTo;
            setCurrentTime(seekTo);
            if (onTimeUpdate) onTimeUpdate(seekTo);
        }
    }, [seekTo]);

    const handleSpeedChange = (rate: number) => {
        if (leftAudioRef.current && rightAudioRef.current) {
            leftAudioRef.current.playbackRate = rate;
            rightAudioRef.current.playbackRate = rate;
            setPlaybackRate(rate);
        }
    };

    const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBalance(parseFloat(e.target.value));
    };

    // Update current time and duration
    useEffect(() => {
        const leftAudio = leftAudioRef.current;
        const rightAudio = rightAudioRef.current;
        if (!leftAudio || !rightAudio) return;

        const updateTime = () => {
            // Use the maximum current time to ensure we cover the longest channel
            const time = Math.max(leftAudio.currentTime, rightAudio.currentTime);
            setCurrentTime(time);
            if (onTimeUpdate) onTimeUpdate(time);
            syncPlayback();
        };

        const updateDuration = () => {
            // max duration
            const d = Math.max(leftAudio.duration || 0, rightAudio.duration || 0);
            if (!isNaN(d) && d > 0) setDuration(d);
        };

        const handleEnded = () => {
            // Only stop if both have effectively finished (ended or duration reached)
            const leftDone = leftAudio.ended || leftAudio.currentTime >= leftAudio.duration;
            const rightDone = rightAudio.ended || rightAudio.currentTime >= rightAudio.duration;

            if (leftDone && rightDone) {
                setIsPlaying(false);
            }
        };

        leftAudio.addEventListener('timeupdate', updateTime);
        rightAudio.addEventListener('timeupdate', updateTime);
        leftAudio.addEventListener('loadedmetadata', updateDuration);
        rightAudio.addEventListener('loadedmetadata', updateDuration);
        leftAudio.addEventListener('ended', handleEnded);
        rightAudio.addEventListener('ended', handleEnded);

        return () => {
            leftAudio.removeEventListener('timeupdate', updateTime);
            rightAudio.removeEventListener('timeupdate', updateTime);
            leftAudio.removeEventListener('loadedmetadata', updateDuration);
            rightAudio.removeEventListener('loadedmetadata', updateDuration);
            leftAudio.removeEventListener('ended', handleEnded);
            rightAudio.removeEventListener('ended', handleEnded);

            // CLEANUP: pause on unmount
            leftAudio.pause();
            rightAudio.pause();
        };
    }, [status]);

    // Update channel volumes based on balance
    useEffect(() => {
        if (!leftAudioRef.current || !rightAudioRef.current) return;

        // 根据balance(-1~1)算左右音量
        // balance = -1: left 100%, right 0%
        // balance = 0: left 100%, right 100%
        // balance = 1: left 0%, right 100%
        const leftVolume = Math.max(0, Math.min(1, 1 - balance));
        const rightVolume = Math.max(0, Math.min(1, 1 + balance));

        leftAudioRef.current.volume = leftVolume;
        rightAudioRef.current.volume = rightVolume;
    }, [balance]);



    // Load and decode full audio for static waveform visualization + VAD analysis
    useEffect(() => {
        let activeAudioContext: AudioContext | null = null;
        let worker: Worker | null = null;

        if (status !== 'ready' || !leftCanvasRef.current || !rightCanvasRef.current) return;

        const loadWaveforms = async () => {
            try {
                // Initialize context
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                activeAudioContext = ctx;

                const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
                if (!token) {
                    console.error('No authentication token found');
                    return;
                }

                console.log('Loading waveforms for call:', callId);

                // Fetch and decode left channel audio
                const leftUrl = `/api/platform/calls/${callId}/stereo-audio?token=${token}&channel=left`;
                const leftResponse = await fetch(leftUrl);
                if (!leftResponse.ok) {
                    throw new Error(`Failed to fetch left audio: ${leftResponse.status}`);
                }
                const leftArrayBuffer = await leftResponse.arrayBuffer();
                const leftAudioBuffer = await ctx.decodeAudioData(leftArrayBuffer);

                // Fetch and decode right channel audio
                const rightUrl = `/api/platform/calls/${callId}/stereo-audio?token=${token}&channel=right`;
                const rightResponse = await fetch(rightUrl);
                if (!rightResponse.ok) {
                    throw new Error(`Failed to fetch right audio: ${rightResponse.status}`);
                }
                const rightArrayBuffer = await rightResponse.arrayBuffer();
                const rightAudioBuffer = await ctx.decodeAudioData(rightArrayBuffer);

                console.log('Audio decoded successfully, offloading VAD analysis to Web Worker...');

                // Offload amplitude-based VAD computation to Web Worker
                worker = new Worker(new URL('../workers/vad.worker.ts', import.meta.url), { type: 'module' });

                worker.onmessage = (e) => {
                    const { leftVAD, rightVAD, crosstalk, error } = e.data;

                    if (error) {
                        console.error('VAD Worker Error:', error);
                        return;
                    }

                    console.log(`VAD results (from Worker): Left=${leftVAD.length} regions, Right=${rightVAD.length} regions, Cross-talk=${crosstalk.length} overlaps`);

                    // Draw waveforms with VAD overlays (Canvas operations are fast)
                    if (leftCanvasRef.current) {
                        drawFullWaveform(leftAudioBuffer, leftCanvasRef.current, '#6366f1', leftVAD, 'rgba(34, 197, 94, 0.3)', crosstalk);
                    }
                    if (rightCanvasRef.current) {
                        drawFullWaveform(rightAudioBuffer, rightCanvasRef.current, '#f59e0b', rightVAD, 'rgba(59, 130, 246, 0.3)', crosstalk);
                    }
                    console.log('Waveforms with VAD drawn successfully');
                };

                // Extract PCM float arrays for processing
                const leftData = leftAudioBuffer.getChannelData(0);
                const rightData = rightAudioBuffer.getChannelData(0);

                // Post data to Worker for processing
                worker.postMessage({
                    leftData,
                    rightData,
                    sampleRate: leftAudioBuffer.sampleRate,
                    threshold: 0.02,
                    minDurationSec: 0.15
                });

            } catch (err) {
                console.error('Failed to load waveforms:', err);
            }
        };

        loadWaveforms();

        // 🛑 CRITICAL FIX: Memory Leak Cleanup
        return () => {
            if (worker) {
                worker.terminate();
                worker = null;
            }
            if (activeAudioContext && activeAudioContext.state !== 'closed') {
                console.log('[StereoAudioPlayer] Closing AudioContext to free memory');
                activeAudioContext.close().catch(console.error);
                activeAudioContext = null;
            }
        };
    }, [status, callId]); // Cleanly responds to changes and releases previous leaks

    // Draw full waveform from AudioBuffer with VAD regions and cross-talk overlays
    const drawFullWaveform = (
        audioBuffer: AudioBuffer,
        canvas: HTMLCanvasElement,
        color: string,
        vadRegions: { start: number; end: number }[] = [],
        vadColor: string = 'rgba(34, 197, 94, 0.3)',
        crosstalkRegions: { start: number; end: number }[] = [],
    ) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;
        const totalDuration = audioBuffer.duration;

        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw VAD regions (green/blue background bands)
        for (const region of vadRegions) {
            const x1 = Math.floor((region.start / totalDuration) * canvas.width);
            const x2 = Math.ceil((region.end / totalDuration) * canvas.width);
            ctx.fillStyle = vadColor;
            ctx.fillRect(x1, 0, x2 - x1, canvas.height);
        }

        // Draw cross-talk regions (red overlay)
        for (const ct of crosstalkRegions) {
            const x1 = Math.floor((ct.start / totalDuration) * canvas.width);
            const x2 = Math.ceil((ct.end / totalDuration) * canvas.width);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
            ctx.fillRect(x1, 0, x2 - x1, canvas.height);

            // Draw cross-talk label if wide enough
            const width = x2 - x1;
            if (width > 30) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.font = 'bold 9px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('⚠ Cross-talk', x1 + width / 2, 10);
            }
        }

        // Draw waveform on top
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;

        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0;
            let max = -1.0;

            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum !== undefined) {
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
            }

            const yMin = (1 + min) * amp;
            const yMax = (1 + max) * amp;
            ctx.fillRect(i, yMin, 1, Math.max(1, yMax - yMin));
        }

        // Draw center line
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, amp);
        ctx.lineTo(canvas.width, amp);
        ctx.stroke();
    };


    const formatTime = (seconds: number): string => {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Check audio status on mount
    useEffect(() => {
        const isDemo = localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true';
        if (isDemo) return;

        const checkInitialStatus = async () => {
            try {
                const response = await api.get(`/platform/calls/${callId}/audio-status`);
                const serverStatus = response.data.status || 'idle';

                setStatus(prev => {
                    // Prevent overwriting 'processing' with 'idle' due to race condition
                    // where checkInitialStatus resolves after handleGenerateAudio has started
                    if (prev === 'processing' && serverStatus === 'idle') {
                        console.log('[StereoAudioPlayer] Ignoring idle status from server (race condition fix)');
                        return prev;
                    }
                    return serverStatus;
                });
                setProgress(response.data.progress || 0);

                // 同步 error/errorCode, 否则组件重挂载后丢失错误分类
                if (response.data.error) {
                    setError(response.data.error);
                    setErrorCode(response.data.errorCode || null);
                }
            } catch (err) {
                console.error('Failed to check initial audio status:', err);
            }
        };

        checkInitialStatus();
    }, [callId]);

    // Auto-trigger audio generation when status is idle or not_started
    useEffect(() => {
        const isDemo = localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true';
        if (isDemo) return;

        console.log('[StereoAudioPlayer] Status changed to:', status);

        // Use module-level cache to prevent duplicate calls in Strict Mode
        if ((status === 'idle' || status === 'not_started') && !generationCache.has(callId)) {
            console.log('[StereoAudioPlayer] Auto-triggering audio generation...');
            generationCache.add(callId);
            handleGenerateAudio();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, callId]);

    if (status === 'idle' || status === 'not_started') {
        return (
            <div className="stereo-audio-player processing">
                <div className="processing-indicator">
                    <div className="spinner"></div>
                    <span>{t('audioPlayer.preparing', 'Preparing audio...')}</span>
                </div>
            </div>
        );
    }

    if (status === 'processing') {
        return (
            <div className="stereo-audio-player processing">
                <div className="processing-indicator">
                    <div className="spinner"></div>
                    <span>{t('audioPlayer.generating', 'Generating audio...')} {progress}%</span>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        // no_rtp: PCAP 仅含 SIP 信令，重试无意义
        if (errorCode === 'no_rtp') {
            return (
                <div className="stereo-audio-player error" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                    <div className="error-message" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0.75rem' }}>
                        <span style={{ fontWeight: 600, color: '#3b82f6' }}>📦 {t('audioPlayer.errorNoRtp', 'No RTP Audio Data')}</span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('audioPlayer.errorNoRtpDesc', 'This PCAP contains SIP signaling only — no RTP audio was captured.')}</span>
                    </div>
                </div>
            );
        }

        // ffmpeg_missing: 服务端缺组件
        if (errorCode === 'ffmpeg_missing') {
            return (
                <div className="stereo-audio-player error" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                    <div className="error-message" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0.75rem' }}>
                        <span style={{ fontWeight: 600, color: '#f59e0b' }}>⚠️ {t('audioPlayer.errorFfmpegMissing', 'Audio Processing Unavailable')}</span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('audioPlayer.errorFfmpegMissingDesc', 'Server is missing ffmpeg. Contact your system administrator.')}</span>
                    </div>
                </div>
            );
        }

        // generation_failed / unknown: 通用错误，可重试
        return (
            <div className="stereo-audio-player error" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                <div className="error-message" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: '#ef4444' }}>⚠️ {t('audioPlayer.errorGenericTitle', 'Audio Generation Failed')}</span>
                        <Button onClick={handleGenerateAudio}>{t('audioPlayer.retry', 'Retry')}</Button>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {error || t('audioPlayer.errorGenericDesc', 'An error occurred while processing the audio. You can retry or check the server logs.')}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="stereo-audio-player">
            {/* Hidden audio elements */}
            <audio ref={leftAudioRef} src={leftAudioUrl || undefined} preload="auto" />
            <audio ref={rightAudioRef} src={rightAudioUrl || undefined} preload="auto" />

            {/* Title + Playback controls in one row */}
            <div className="playback-controls">
                <Button onClick={togglePlayPause} className="play-pause-">
                    {isPlaying ? `⏸️ ${t('audioPlayer.pause', 'Pause')}` : `▶️ ${t('audioPlayer.play', 'Play')}`}
                </Button>

                <div className="time-display">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </div>

                <div className="speed-controls">
                    <label>{t('audioPlayer.speed', 'Speed')}:</label>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                        <Button
                            key={rate}
                            onClick={() => handleSpeedChange(rate)}
                            className={playbackRate === rate ? 'active' : ''}
                        >
                            {rate}x
                        </Button>
                    ))}
                </div>

                <h3 style={{ margin: 0, marginLeft: 'auto', fontSize: '14px', fontWeight: 600, flexShrink: 0 }}>🎧 {t('audioPlayer.playback', 'Playback')}</h3>
            </div>

            {/* Progress bar */}
            <div className="progress-bar">
                <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={handleSeek}
                    step="0.1"
                />
            </div>

            {/* Waveform Visualization */}
            <div className="waveform-container">
                <div className="waveform-channel">
                    <label>📞 {t('audioPlayer.leftCaller', 'Left (Caller)')}</label>
                    <canvas ref={leftCanvasRef} width={800} height={60} />
                </div>
                <div className="waveform-channel">
                    <label>📞 {t('audioPlayer.rightCallee', 'Right (Callee)')}</label>
                    <canvas ref={rightCanvasRef} width={800} height={60} />
                </div>
            </div>

            {/* Balance control */}
            <div className="balance-control">
                <label></label>
                <span className="balance-label left">{t('audioPlayer.leftCaller', 'L(Caller)')}</span>
                <input
                    type="range"
                    min="-1"
                    max="1"
                    value={balance}
                    onChange={handleBalanceChange}
                    step="0.1"
                />
                <span className="balance-label right">{t('audioPlayer.rightCallee', 'R(Callee)')}</span>
                <span className="balance-value">
                    {balance === 0 ? t('audioPlayer.center', 'Center') : balance < 0 ? `L ${Math.abs(balance * 100).toFixed(0)}%` : `R ${(balance * 100).toFixed(0)}%`}
                </span>
            </div>



            <style>{`
                .stereo-audio-player {
                    background: #f5f5f5;
                    border-radius: 6px;
                    padding: 8px;
                    margin-top: 8px;
                }

                .playback-controls {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 6px;
                    flex-wrap: nowrap;
                }

                .play-pause-btn {
                    background: #6366f1;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    white-space: nowrap;
                    flex-shrink: 0;
                }

                .play-pause-btn:hover {
                    background: #4f46e5;
                }

                .time-display {
                    font-family: monospace;
                    font-size: 12px;
                    color: #666;
                    white-space: nowrap;
                    flex-shrink: 0;
                }

                .speed-controls {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    flex-shrink: 0;
                }

                .speed-controls label {
                    font-size: 11px;
                    color: #666;
                    margin-right: 3px;
                    white-space: nowrap;
                }

                .speed-controls button {
                    background: #e5e7eb;
                    border: 1px solid #d1d5db;
                    padding: 2px 5px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 10px;
                    white-space: nowrap;
                }

                .speed-controls button.active {
                    background: #6366f1;
                    color: white;
                    border-color: #6366f1;
                }

                .progress-bar {
                    margin-bottom: 6px;
                }

                .progress-bar input[type="range"] {
                    width: 100%;
                    height: 4px;
                    border-radius: 2px;
                    background: #d1d5db;
                    outline: none;
                    -webkit-appearance: none;
                }

                .progress-bar input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: #6366f1;
                    cursor: pointer;
                }

                .waveform-container {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    margin-bottom: 6px;
                }

                .waveform-channel {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }

                .waveform-channel label {
                    font-size: 10px;
                    font-weight: 600;
                    color: #374151;
                }

                .waveform-channel canvas {
                    width: 100%;
                    height: 60px;
                    background: #1a1a1a;
                    border-radius: 4px;
                    border: 1px solid #e5e7eb;
                }

                .balance-control {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 6px;
                    font-size: 11px;
                }

                .balance-control label {
                    color: #666;
                    font-weight: 500;
                }

                .balance-label {
                    color: #666;
                    font-weight: 600;
                    min-width: 60px;
                }

                .balance-control input[type="range"] {
                    flex: 1;
                    height: 4px;
                    border-radius: 2px;
                    background: linear-gradient(to right, #6366f1 0%, #9ca3af 50%, #f59e0b 100%);
                    outline: none;
                    -webkit-appearance: none;
                }

                .balance-control input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: white;
                    border: 2px solid #6366f1;
                    cursor: pointer;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                }

                .balance-value {
                    min-width: 60px;
                    text-align: right;
                    color: #374151;
                    font-weight: 500;
                    font-size: 11px;
                }


                .processing-indicator {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px;
                }

                .spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #e5e7eb;
                    border-top-color: #6366f1;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .error-message {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px;
                    background: #fee2e2;
                    border-radius: 4px;
                    color: #991b1b;
                    font-size: 13px;
                }

                .error-message button {
                    background: #dc2626;
                    color: white;
                    border: none;
                    padding: 4px 10px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                }
            `}</style>
        </div>
    );
};
