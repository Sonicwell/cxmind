import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocket } from '../context/WebSocketContext';
import { AudioPlayer } from '../components/AudioPlayer';
import { StereoMonitoringPlayer } from '../components/StereoMonitoringPlayer';
import { ContextBriefCard } from '../components/monitoring/ContextBriefCard';
import '../styles/monitoring.css';
// useAuth no longer needed — api.get() handles auth automatically
import { useDemoMode } from '../hooks/useDemoMode';
import { getMockCalls } from '../services/mock-data';
import api from '../services/api';
import { EmotionCurve } from '../components/monitoring/EmotionCurve';

import { Button } from '../components/ui/button';

interface ActiveCall {
    call_id: string;
    caller_uri: string;
    callee_uri: string;
    caller_name: string;
    callee_name: string;
    start_time: string;
    status: string;
}

interface MonitoringSession {
    callId: string;
    leftPlayer: AudioPlayer;
    rightPlayer: AudioPlayer;
    startTime: Date;
    callerName: string;
    calleeName: string;
}

interface ViewingSession {
    callId: string;
    startTime: Date;
    callerName?: string;
    calleeName?: string;
}

interface Transcription {
    timestamp: string;
    speaker: string;
    text: string;
    confidence: number;
    sequenceNumber?: number;  // for gap detection
    isPartial?: boolean;      // partial ASR result (is_final=false)
}

interface QualityMetric {
    source: string;
    direction: string;
    mos_score?: number;
    jitter_ms?: number;
    packet_loss_pct?: number;
}

const MAX_MONITORING_SESSIONS = 1;
const MAX_VIEWING_SESSIONS = 5;

// sip:user@domain -> user
const extractNumber = (uri: string): string => {
    if (!uri) return '';
    let num = uri.replace(/^sip:/i, '');
    const atIdx = num.indexOf('@');
    if (atIdx !== -1) num = num.substring(0, atIdx);
    return num;
};

export const Monitoring: React.FC = () => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);

    const [monitoringSessions, setMonitoringSessions] = useState<Map<string, MonitoringSession>>(new Map());
    const [viewingSessions, setViewingSessions] = useState<Map<string, ViewingSession>>(new Map());
    const [transcriptions, setTranscriptions] = useState<Map<string, Transcription[]>>(new Map());
    const [lastSequenceNumbers, setLastSequenceNumbers] = useState<Map<string, number>>(new Map());  // NEW: track sequence numbers
    const [callQualityMap, setCallQualityMap] = useState<Map<string, { caller?: QualityMetric, callee?: QualityMetric }>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const audioPlayersRef = useRef<Map<string, AudioPlayer>>(new Map());

    // Use refs to track latest session state for WebSocket handler (avoid closure issues)
    const monitoringSessionsRef = useRef(monitoringSessions);
    const viewingSessionsRef = useRef(viewingSessions);

    // state变了同步ref
    useEffect(() => {
        monitoringSessionsRef.current = monitoringSessions;
    }, [monitoringSessions]);

    useEffect(() => {
        viewingSessionsRef.current = viewingSessions;
    }, [viewingSessions]);


    // Use global WebSocket context
    const { connected, send, subscribe } = useWebSocket();

    // Fetch active calls
    const fetchActiveCalls = async () => {
        if (demoMode) {
            const mockCalls = await getMockCalls();
            // Filter only "active" calls, but mock calls usually have status 'completed'.
            // For demo, we can just take a few and pretend they are active.
            const active = mockCalls.data.calls.slice(0, 3).map((c: any) => ({
                call_id: c.call_id,
                caller_uri: c.caller_number,
                callee_uri: c.callee_number,
                caller_name: 'Demo Caller',
                callee_name: 'Demo Agent',
                start_time: new Date().toISOString(),
                status: 'in-progress'
            }));
            setActiveCalls(active);
            setLoading(false);
            return;
        }

        try {
            const response = await api.get('/platform/active-calls');
            setActiveCalls(response.data?.calls || []);
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch active calls:', error);
            setError('Failed to load active calls');
            setLoading(false);
        }
    };

    // 处理双通道audio frame
    const handleAudioFrame = (audioFrame: any) => {
        const callId = audioFrame.call_id;
        const channel = audioFrame.channel; // 'left' or 'right'

        // Get the appropriate player based on channel
        const playerKey = `${callId}:${channel}`;
        const player = audioPlayersRef.current.get(playerKey);

        if (player) {
            player.playAudioFrame(audioFrame);
        }
    };

    // 转写文本(含gap检测 + is_final处理)
    const handleTranscription = (data: any) => {
        const callId = data.call_id;
        const sequenceNumber = data.sequence_number;
        const isFinal = data.is_final !== false; // 缺省视为 final

        // Use ref to get latest state (avoid closure issues)
        if (viewingSessionsRef.current.has(callId) || monitoringSessionsRef.current.has(callId)) {
            // Check for gap (only for final segments)
            if (isFinal) {
                const lastSeq = lastSequenceNumbers.get(callId) || 0;
                if (sequenceNumber && sequenceNumber > lastSeq + 1) {
                    console.warn(`[TRANSCRIPTION] Gap detected! Expected seq=${lastSeq + 1}, got seq=${sequenceNumber}`);
                    fetchMissingSegments(callId, lastSeq, sequenceNumber);
                }
            }

            // 更新转写列表: partial 原地更新, final 固化
            setTranscriptions(prev => {
                const newMap = new Map(prev);
                const existing = [...(newMap.get(callId) || [])];

                if (!isFinal) {
                    // partial: 找同 speaker 的最后一个 partial 条目，原地替换
                    const lastPartialIdx = existing.findLastIndex(
                        t => t.isPartial && t.speaker === (data.speaker || 'Unknown')
                    );
                    if (lastPartialIdx >= 0) {
                        existing[lastPartialIdx] = {
                            ...existing[lastPartialIdx],
                            text: data.text || '',
                            timestamp: data.timestamp || existing[lastPartialIdx].timestamp,
                        };
                    } else {
                        // 新 partial 条目
                        existing.push({
                            timestamp: data.timestamp || new Date().toISOString(),
                            speaker: data.speaker || 'Unknown',
                            text: data.text || '',
                            confidence: data.confidence || 0,
                            sequenceNumber,
                            isPartial: true,
                        });
                    }
                } else {
                    // final: 找同 speaker 的最后一个 partial, 将其固化; 否则新增
                    const lastPartialIdx = existing.findLastIndex(
                        t => t.isPartial && t.speaker === (data.speaker || 'Unknown')
                    );
                    if (lastPartialIdx >= 0) {
                        existing[lastPartialIdx] = {
                            ...existing[lastPartialIdx],
                            text: data.text || '',
                            timestamp: data.timestamp || existing[lastPartialIdx].timestamp,
                            confidence: data.confidence || 0,
                            sequenceNumber,
                            isPartial: false,
                        };
                    } else {
                        // 直接收到 final (没有先前的 partial)
                        // 去重检查: 避免与已有 final 重复
                        const newKey = (sequenceNumber && sequenceNumber > 0)
                            ? `seq-${sequenceNumber}`
                            : `ts-${new Date(data.timestamp || new Date()).getTime()}-${data.speaker}`;
                        const existingKeys = new Set(existing.map(t =>
                            (t.sequenceNumber && t.sequenceNumber > 0)
                                ? `seq-${t.sequenceNumber}`
                                : `ts-${new Date(t.timestamp).getTime()}-${t.speaker}`
                        ));
                        if (!existingKeys.has(newKey)) {
                            existing.push({
                                timestamp: data.timestamp || new Date().toISOString(),
                                speaker: data.speaker || 'Unknown',
                                text: data.text || '',
                                confidence: data.confidence || 0,
                                sequenceNumber,
                                isPartial: false,
                            });
                        }
                    }
                }

                newMap.set(callId, existing);
                return newMap;
            });

            // 更新最后seq号 (仅 final)
            if (isFinal && sequenceNumber) {
                const lastSeq = lastSequenceNumbers.get(callId) || 0;
                setLastSequenceNumbers(prev => {
                    const newMap = new Map(prev);
                    newMap.set(callId, Math.max(lastSeq, sequenceNumber));
                    return newMap;
                });
            }
        }
    };

    // 订阅WS消息
    useEffect(() => {
        const unsubscribeAudio = subscribe('monitor:audio', (message) => {
            if (message.data) handleAudioFrame(message.data);
        });

        const unsubscribeTranscription = subscribe('call:transcription', (message) => {
            if (message.data) handleTranscription(message.data);
        });

        const unsubscribeStarted = subscribe('monitor:started', (message) => {
            console.log('Monitoring started:', message.data);
        });

        const unsubscribeQuality = subscribe('call:quality', (message) => {
            if (message.data?.source === 'rtp') {
                const qMsg = message.data;
                const callId = qMsg.call_id;
                setCallQualityMap(prev => {
                    const newMap = new Map(prev);
                    const current = newMap.get(callId) || {};
                    if (qMsg.direction === 'caller') {
                        current.caller = qMsg;
                    } else if (qMsg.direction === 'callee') {
                        current.callee = qMsg;
                    }
                    newMap.set(callId, current);
                    return newMap;
                });
            }
        });

        const unsubscribeStopped = subscribe('monitor:stopped', (message) => {
            console.log('Monitoring stopped:', message.data);
        });

        const unsubscribeError = subscribe('monitor:error', (message) => {
            setError(message.data.message);
            setTimeout(() => setError(null), 5000);
        });

        const unsubscribeActiveCalls = subscribe('monitor:active_calls', (message) => {
            if (message.data && message.data.calls) {
                setActiveCalls(message.data.calls);
            }
        });

        return () => {
            unsubscribeAudio();
            unsubscribeTranscription();
            unsubscribeQuality();
            unsubscribeStarted();
            unsubscribeStopped();
            unsubscribeError();
            unsubscribeActiveCalls();
        };
    }, [subscribe]);

    // Demo Mode Simulation
    useEffect(() => {
        let demoInterval: number;

        if (demoMode && activeCalls.length > 0) {
            demoInterval = window.setInterval(() => {
                monitoringSessionsRef.current.forEach((_, callId) => {
                    const text = "Simulated live transcription segment...";
                    handleTranscription({
                        call_id: callId,
                        text,
                        speaker: 'caller',
                        timestamp: new Date().toISOString(),
                        sequence_number: Date.now() // fake
                    });
                });
            }, 3000);
        }
        return () => {
            if (demoInterval) clearInterval(demoInterval);
        };
    }, [activeCalls]);




    // Start monitoring call (dual-channel)
    const startCallMonitoring = (call: ActiveCall) => {
        if (monitoringSessions.size >= MAX_MONITORING_SESSIONS) {
            setError(`Cannot monitor more than ${MAX_MONITORING_SESSIONS} call(s) simultaneously`);
            setTimeout(() => setError(null), 3000);
            return;
        }

        // Create dual audio players (left + right channels)
        const leftPlayer = new AudioPlayer();
        const rightPlayer = new AudioPlayer();

        // Start recording segments
        leftPlayer.startNewSegment();
        rightPlayer.startNewSegment();
        console.log('[Monitoring] Started recording segments for call:', call.call_id);

        audioPlayersRef.current.set(`${call.call_id}:left`, leftPlayer);
        audioPlayersRef.current.set(`${call.call_id}:right`, rightPlayer);

        // Send WebSocket message
        send({
            type: 'monitor:start',
            callId: call.call_id
        });

        // Add to sessions
        setMonitoringSessions(prev => {
            const newMap = new Map(prev);
            newMap.set(call.call_id, {
                callId: call.call_id,
                leftPlayer,
                rightPlayer,
                startTime: new Date(),
                callerName: call.caller_name || 'Unknown',
                calleeName: call.callee_name || 'Unknown'
            });
            return newMap;
        });
    };

    // Stop monitoring call (dual-channel)
    // Now only clears buffers when user explicitly clicks button
    const stopCallMonitoring = (callId: string) => {
        const session = monitoringSessions.get(callId);
        if (session) {
            // Stop and cleanup both audio players
            session.leftPlayer.stop();
            session.rightPlayer.stop();
            audioPlayersRef.current.delete(`${callId}:left`);
            audioPlayersRef.current.delete(`${callId}:right`);

            // Send WebSocket message
            send({
                type: 'monitor:stop',
                callId
            });

            // Remove from sessions
            setMonitoringSessions(prev => {
                const newMap = new Map(prev);
                newMap.delete(callId);
                return newMap;
            });
        }
    };

    // Start viewing transcription
    // Helper: Merge and deduplicate transcriptions by sequence number
    const mergeTranscriptions = (historical: Transcription[], live: Transcription[]): Transcription[] => {
        const map = new Map<string, Transcription>();

        // Add historical first
        historical.forEach(t => {
            // Use sequence number if available and > 0, otherwise use timestamp as unique key
            const key = (t.sequenceNumber && t.sequenceNumber > 0)
                ? `seq-${t.sequenceNumber}`
                : `ts-${new Date(t.timestamp).getTime()}-${t.speaker}`;
            map.set(key, t);
        });

        // Add live (overwrites if duplicate key)
        live.forEach(t => {
            const key = (t.sequenceNumber && t.sequenceNumber > 0)
                ? `seq-${t.sequenceNumber}`
                : `ts-${new Date(t.timestamp).getTime()}-${t.speaker}`;
            map.set(key, t);
        });

        // Sort by sequence number if available, otherwise by timestamp
        return Array.from(map.values()).sort((a, b) => {
            // If both have valid sequence numbers (> 0), sort by sequence
            if (a.sequenceNumber && b.sequenceNumber &&
                a.sequenceNumber > 0 && b.sequenceNumber > 0) {
                return a.sequenceNumber - b.sequenceNumber;
            }
            // Otherwise sort by timestamp
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });
    };

    // Helper: Fetch missing segments when gap is detected
    const fetchMissingSegments = async (callId: string, afterSeq: number, beforeSeq: number) => {
        try {
            console.log(`[GAP_FILL] Fetching segments ${afterSeq + 1} to ${beforeSeq - 1} for call ${callId}`);

            const response = await api.get(
                `/platform/calls/${callId}/transcriptions?after_seq=${afterSeq}&before_seq=${beforeSeq}`
            );

            const missingSegments = response.data?.transcriptions || [];

            console.log(`[GAP_FILL] Fetched ${missingSegments.length} missing segments`);

            // Merge missing segments
            setTranscriptions(prev => {
                const newMap = new Map(prev);
                const existing = newMap.get(callId) || [];
                const merged = mergeTranscriptions(missingSegments, existing);
                newMap.set(callId, merged);
                return newMap;
            });
        } catch (error) {
            console.error('[GAP_FILL] Failed to fetch missing segments:', error);
        }
    };

    // Start viewing transcription (SUBSCRIBE FIRST approach)
    const startViewingTranscription = async (call: ActiveCall) => {
        console.log(`[VIEW_START] Starting view for call: ${call.call_id}`);
        console.log(`[VIEW_START] Current viewingSessions size: ${viewingSessions.size}`);

        if (viewingSessions.size >= MAX_VIEWING_SESSIONS) {
            setError(`Cannot view more than ${MAX_VIEWING_SESSIONS} transcriptions simultaneously`);
            setTimeout(() => setError(null), 3000);
            return;
        }

        // STEP 1: Subscribe to WebSocket FIRST (to avoid missing messages)
        console.log(`[VIEW_START] Subscribing to WebSocket for call: ${call.call_id}`);
        send({
            type: 'join',
            callId: call.call_id
        });

        // STEP 2: Add to viewing sessions immediately
        setViewingSessions(prev => {
            const newMap = new Map(prev);
            newMap.set(call.call_id, {
                callId: call.call_id,
                startTime: new Date(),
                callerName: call.caller_name,
                calleeName: call.callee_name
            });
            console.log(`[VIEW_START] Updated viewingSessions, new size: ${newMap.size}`);
            return newMap;
        });

        // STEP 3: Fetch historical transcriptions in parallel
        try {
            const response = await api.get(`/platform/calls/${call.call_id}/transcriptions`);

            if (response.data) {
                const historicalTranscriptions = response.data.transcriptions || [];

                console.log(`[VIEW_START] Loaded ${historicalTranscriptions.length} historical transcriptions`);

                // STEP 4: Merge historical data with any live data received during fetch
                setTranscriptions(prev => {
                    const newMap = new Map(prev);
                    const existing = newMap.get(call.call_id) || [];

                    // Merge and deduplicate by sequence number
                    const merged = mergeTranscriptions(historicalTranscriptions, existing);
                    newMap.set(call.call_id, merged);

                    return newMap;
                });

                // STEP 5: Update last sequence number
                if (historicalTranscriptions.length > 0) {
                    const lastSeq = Math.max(...historicalTranscriptions.map((t: Transcription) => t.sequenceNumber || 0));
                    setLastSequenceNumbers(prev => {
                        const newMap = new Map(prev);
                        newMap.set(call.call_id, lastSeq);
                        return newMap;
                    });
                }
            }
        } catch (error) {
            console.error('[VIEW_START] Failed to fetch historical transcriptions:', error);
            // Continue anyway - we're already subscribed to live updates
        }
    };

    // Stop viewing transcription
    const stopViewingTranscription = (callId: string) => {
        // Leave call room
        send({
            type: 'leave',
            callId
        });

        // Remove from viewing sessions
        setViewingSessions(prev => {
            const newMap = new Map(prev);
            newMap.delete(callId);
            return newMap;
        });

        // Clean up transcriptions data
        setTranscriptions(prev => {
            const newMap = new Map(prev);
            newMap.delete(callId);
            return newMap;
        });

        // Clean up sequence number tracking
        setLastSequenceNumbers(prev => {
            const newMap = new Map(prev);
            newMap.delete(callId);
            return newMap;
        });
    };

    // Fetch initial data and restore sessions on connect
    useEffect(() => {
        if (connected) {
            console.log('WebSocket connected - fetching initial data');
            fetchActiveCalls();


            // Restore monitoring sessions
            monitoringSessions.forEach((session) => {
                send({
                    type: 'monitor:start',
                    callId: session.callId
                });
            });

            // Restore viewing sessions
            viewingSessions.forEach((session) => {
                send({
                    type: 'join',
                    callId: session.callId
                });
            });
        }
    }, [connected]);

    // unmount清理
    useEffect(() => {
        return () => {
            // Stop all monitoring sessions (dual-channel)
            monitoringSessions.forEach((session) => {
                session.leftPlayer.stop();
                session.rightPlayer.stop();
            });
            audioPlayersRef.current.clear();
        };
    }, []);

    if (loading) {
        return <div className="monitoring-page"><div className="loading">{t('common.loading', 'Loading...')}</div></div>;
    }

    return (
        <div className="monitoring-page">
            <h1>{t('monitoring.title', 'Real-time Monitoring')}</h1>

            {error && (
                <div className="error-banner">
                    {error}
                </div>
            )}

            {/* Active Monitoring Sessions */}
            {monitoringSessions.size > 0 && (
                <div className="monitoring-sessions">
                    <h2>🎧 {t('monitoring.activeMonitoring', 'Active Monitoring')} ({monitoringSessions.size}/{MAX_MONITORING_SESSIONS})</h2>
                    <div className="sessions-grid">
                        {Array.from(monitoringSessions.values()).map(session => {
                            const call = activeCalls.find(c => c.call_id === session.callId);
                            const callEnded = !call; // Call ended if not in active calls

                            return (
                                <div key={session.callId} className="session-card monitoring">
                                    <div className="session-header">
                                        <span className="call-info">
                                            {session.callerName || call?.caller_name || t('common.unknown', 'Unknown')} → {session.calleeName || call?.callee_name || t('common.unknown', 'Unknown')}
                                        </span>
                                        <Button
                                            className={callEnded ? "btn-ended" : "btn-stop"}
                                            onClick={() => stopCallMonitoring(session.callId)}
                                        >
                                            {callEnded ? t('monitoring.callEnded', 'Call Ended') : t('monitoring.stopMonitoring', 'Stop Monitoring')}
                                        </Button>
                                    </div>
                                    <StereoMonitoringPlayer
                                        callId={session.callId}
                                        leftPlayerRef={session.leftPlayer}
                                        rightPlayerRef={session.rightPlayer}
                                        callEnded={callEnded}
                                    />
                                    <EmotionCurve callId={session.callId} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Active Viewing Sessions */}
            {viewingSessions.size > 0 && (
                <div className="viewing-sessions">
                    <h2>👁️ {t('monitoring.viewingTranscriptions', 'Viewing Transcriptions')} ({viewingSessions.size}/{MAX_VIEWING_SESSIONS})</h2>
                    <div className="sessions-grid">
                        {Array.from(viewingSessions.values()).map(session => {
                            const call = activeCalls.find(c => c.call_id === session.callId);
                            const callTranscriptions = transcriptions.get(session.callId) || [];

                            // Helper function to format relative time
                            const formatRelativeTime = (timestamp: string) => {
                                const segmentTime = new Date(timestamp);
                                // Use call start time if available, otherwise use viewing session start time
                                const callStartTime = call?.start_time ? new Date(call.start_time) : session.startTime;

                                const diffMs = segmentTime.getTime() - callStartTime.getTime();
                                const diffSec = Math.floor(diffMs / 1000);

                                // Always show as relative time (MM:SS format)
                                const totalSeconds = Math.abs(diffSec);
                                const minutes = Math.floor(totalSeconds / 60);
                                const seconds = totalSeconds % 60;
                                const sign = diffSec < 0 ? '-' : '';
                                return `${sign}${minutes}:${seconds.toString().padStart(2, '0')}`;
                            };

                            return (
                                <div key={session.callId} className="session-card viewing">
                                    <div className="session-header">
                                        <span className="call-info">
                                            {session.callerName || call?.caller_name || t('common.unknown', 'Unknown')} → {session.calleeName || call?.callee_name || t('common.unknown', 'Unknown')}
                                        </span>
                                        <div className="header-actions">
                                            <Button className="-stop"
                                                onClick={() => stopViewingTranscription(session.callId)}
                                            >
                                                {t('monitoring.stopViewing', 'Stop Viewing')}
                                            </Button>
                                            {!call && <span className="call-ended-badge">{t('monitoring.callEnded', 'Call Ended')}</span>}
                                        </div>
                                    </div>
                                    <div style={{ padding: '0 1rem' }}>
                                        <ContextBriefCard callId={session.callId} callerPhone={call?.caller_uri} />
                                    </div>
                                    <div className="transcription-container">
                                        {callTranscriptions.length === 0 ? (
                                            <div className="no-transcription">{t('monitoring.waitingForTranscription', 'Waiting for transcription...')}</div>
                                        ) : (
                                            callTranscriptions.map((t, idx) => (
                                                <div key={idx} className={`transcription-item ${t.isPartial ? 'partial' : ''}`}>
                                                    <span className="timestamp">[{formatRelativeTime(t.timestamp)}]</span>
                                                    <span className="speaker">{t.speaker}:</span>
                                                    <span className="text">
                                                        {t.text}
                                                        {t.isPartial && <span className="cursor-blink">▋</span>}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <EmotionCurve callId={session.callId} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Active Calls */}
            <div className="active-calls-section">
                <h2>{t('monitoring.activeCalls', 'Active Calls')} ({activeCalls.length})</h2>
                <div className="calls-grid">
                    {activeCalls.map(call => {
                        const isMonitoring = monitoringSessions.has(call.call_id);
                        const isViewing = viewingSessions.has(call.call_id);

                        return (
                            <div key={call.call_id} className="call-card">
                                <div className="call-header">
                                    <div className="call-parties">
                                        <div className="party caller">
                                            <span className="label">{t('monitoring.caller', 'Caller')}:</span>
                                            <span className="name">{call.caller_name}</span>
                                            <span className="uri">{extractNumber(call.caller_uri)}</span>
                                            {(() => {
                                                const q = callQualityMap.get(call.call_id)?.caller;
                                                if (!q || !q.mos_score) return null;
                                                const isGood = q.mos_score >= 3.8;
                                                const isPoor = q.mos_score < 3.5;
                                                return (
                                                    <span style={{ marginLeft: 8, fontSize: '0.75rem', padding: '2px 6px', borderRadius: 4, background: isGood ? 'rgba(0,255,100,0.1)' : (isPoor ? 'rgba(255,0,0,0.1)' : 'rgba(255,200,0,0.1)'), color: isGood ? '#00e676' : (isPoor ? '#ff5252' : '#ffa000'), border: '1px solid', borderColor: isGood ? 'rgba(0,255,100,0.2)' : (isPoor ? 'rgba(255,0,0,0.2)' : 'rgba(255,200,0,0.2)') }}>
                                                        MOS: {q.mos_score.toFixed(1)} {isPoor ? '↓' : ''}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        <div className="arrow">→</div>
                                        <div className="party callee">
                                            <span className="label">{t('monitoring.callee', 'Callee')}:</span>
                                            <span className="name">{call.callee_name}</span>
                                            <span className="uri">{extractNumber(call.callee_uri)}</span>
                                            {(() => {
                                                const q = callQualityMap.get(call.call_id)?.callee;
                                                if (!q || !q.mos_score) return null;
                                                const isGood = q.mos_score >= 3.8;
                                                const isPoor = q.mos_score < 3.5;
                                                return (
                                                    <span style={{ marginLeft: 8, fontSize: '0.75rem', padding: '2px 6px', borderRadius: 4, background: isGood ? 'rgba(0,255,100,0.1)' : (isPoor ? 'rgba(255,0,0,0.1)' : 'rgba(255,200,0,0.1)'), color: isGood ? '#00e676' : (isPoor ? '#ff5252' : '#ffa000'), border: '1px solid', borderColor: isGood ? 'rgba(0,255,100,0.2)' : (isPoor ? 'rgba(255,0,0,0.2)' : 'rgba(255,200,0,0.2)') }}>
                                                        MOS: {q.mos_score.toFixed(1)} {isPoor ? '↓' : ''}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                                <div className="call-actions">
                                    <Button
                                        className={`btn-action ${isMonitoring ? 'active' : ''}`}
                                        onClick={() => isMonitoring ? stopCallMonitoring(call.call_id) : startCallMonitoring(call)}
                                        disabled={!isMonitoring && monitoringSessions.size >= MAX_MONITORING_SESSIONS}
                                    >
                                        {isMonitoring ? `🎧 ${t('monitoring.monitoring', 'Monitoring')}` : `🎧 ${t('monitoring.monitor', 'Monitor')}`}
                                    </Button>
                                    <Button
                                        className={`btn-action ${isViewing ? 'active' : ''}`}
                                        onClick={() => isViewing ? stopViewingTranscription(call.call_id) : startViewingTranscription(call)}
                                        disabled={!isViewing && viewingSessions.size >= MAX_VIEWING_SESSIONS}
                                    >
                                        {isViewing ? `👁️ ${t('monitoring.viewing', 'Viewing')}` : `👁️ ${t('monitoring.view', 'View')}`}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
