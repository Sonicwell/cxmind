import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { TranscriptBubble } from './TranscriptBubble';
import type { EmotionSegmentData } from './TranscriptBubble';
import { TranscriptDiff } from './TranscriptDiff';
import { MotionButton } from '../ui/MotionButton';
import { Loader2, Rocket, RefreshCw, Plus, Check, Hammer, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useWebSocket } from '../../context/WebSocketContext';
import toast from 'react-hot-toast';
import { STORAGE_KEYS } from '../../constants/storage-keys';

// SOP Cart 购物车 helpers
interface SopCartItem {
    callId: string;
    caller: string;
    callee: string;
    intent: string;
    addedAt: string;
}

function getSopCart(): SopCartItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.SOP_CART);
        if (!raw) return [];
        const data = JSON.parse(raw);
        const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
        // 过滤 7 天内的条目
        return (data.calls || []).filter((c: SopCartItem) => new Date(c.addedAt).getTime() > sevenDaysAgo);
    } catch { return []; }
}

function saveSopCart(calls: SopCartItem[]) {
    localStorage.setItem(STORAGE_KEYS.SOP_CART, JSON.stringify({ calls }));
}

interface TranscriptionSegment {
    timestamp: string;
    text: string;
    speaker: string;
    confidence?: number;
    asrSource?: string;
    textEmotion?: string;
}

interface TranscriptPanelProps {
    callId: string;
    realtimeTranscripts: TranscriptionSegment[];
    emotionSegments?: EmotionSegmentData[];
    acousticEmotions?: EmotionSegmentData[];
    currentTime?: number;
    startTime?: string;
    caller?: string;
    callee?: string;
    direction?: string;
    onTextEmotionSegments?: (segments: EmotionSegmentData[]) => void;
}

type TabType = 'realtime' | 'post-call' | 'diff';

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
    callId,
    realtimeTranscripts,
    emotionSegments = [],
    acousticEmotions = [],
    currentTime = 0,
    startTime,
    caller,
    callee,
    direction,
    onTextEmotionSegments,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    // ... (state defs remain the same) ...
    const [activeTab, setActiveTab] = useState<TabType>('realtime');
    const [initialTabResolved, setInitialTabResolved] = useState(false);
    const [postCallTranscripts, setPostCallTranscripts] = useState<TranscriptionSegment[]>([]);
    const [postCallLoading, setPostCallLoading] = useState(false);
    const [postCallChecked, setPostCallChecked] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [jobError, setJobError] = useState<string | null>(null);
    const [asrMeta, setAsrMeta] = useState<{ vendorName?: string; asrDurationMs?: number; segmentCount?: number } | null>(null);

    // SOP Cart state
    const [sopCartAdded, setSopCartAdded] = useState(false);
    const [addedAnimation, setAddedAnimation] = useState(false);
    const [showBuildConfirm, setShowBuildConfirm] = useState(false);

    // 检查当前 callId 是否已在 cart 中
    useEffect(() => {
        const cart = getSopCart();
        setSopCartAdded(cart.some(c => c.callId === callId));
    }, [callId]);

    const handleAddToSopCart = () => {
        const cart = getSopCart();
        if (cart.some(c => c.callId === callId)) return;
        cart.push({
            callId,
            caller: caller || 'unknown',
            callee: callee || 'unknown',
            intent: '',
            addedAt: new Date().toISOString(),
        });
        saveSopCart(cart);
        setSopCartAdded(true);
        setAddedAnimation(true);
        setTimeout(() => setAddedAnimation(false), 1500);
        toast.success(t('sopBuilder.cart.callAdded'));
    };

    const handleRemoveFromSopCart = () => {
        const cart = getSopCart().filter(c => c.callId !== callId);
        saveSopCart(cart);
        setSopCartAdded(false);
        toast.success(t('sopBuilder.cart.removedFromCart'));
    };
    const { subscribe } = useWebSocket();

    // Fetch post-call transcripts
    const fetchPostCall = useCallback(async () => {
        setPostCallLoading(true);
        try {
            const res = await api.get(`/platform/calls/${callId}/transcription?source=post_call`);
            const transcripts = res.data.transcriptions || [];
            setPostCallTranscripts(transcripts);
            // 保存 ASR 元信息
            const js = res.data.jobStatus;
            if (js?.vendorName || js?.asrDurationMs) {
                setAsrMeta({ vendorName: js.vendorName, asrDurationMs: js.asrDurationMs, segmentCount: js.segmentCount });
            } else if (transcripts.length > 0 && !asrMeta) {
                // fallback: jobStatus 不可用（如 AS 重启后）, 从转写结果推导
                const source = transcripts[0]?.asrSource;
                setAsrMeta({
                    vendorName: source === 'post_call' ? 'local asr' : (source || 'ASR'),
                    segmentCount: transcripts.length,
                });
            }
            // 刷新后恢复 generating 状态
            if (js?.status === 'pending' || js?.status === 'processing') {
                setGenerating(true);
            }
        } catch {
            setPostCallTranscripts([]);
        } finally {
            setPostCallLoading(false);
            setPostCallChecked(true);
        }
    }, [callId]);

    // 挂载时立即探测离线转写数据，有则默认切到 post-call tab
    useEffect(() => {
        if (!initialTabResolved) {
            fetchPostCall().then(() => {
                setInitialTabResolved(true);
            });
        }
    }, [initialTabResolved, fetchPostCall]);

    // 离线数据加载完成后，如有数据则自动切到 post-call tab
    useEffect(() => {
        if (initialTabResolved && postCallTranscripts.length > 0 && activeTab === 'realtime') {
            setActiveTab('post-call');
        }
    }, [initialTabResolved, postCallTranscripts.length]);

    // 将离线转写的 textEmotion 转换为 EmotionSegmentData 通知父组件
    useEffect(() => {
        if (!onTextEmotionSegments || postCallTranscripts.length === 0 || !startTime) return;
        const callStart = new Date(startTime).getTime();
        const segments: EmotionSegmentData[] = postCallTranscripts
            .filter(t => t.textEmotion && t.textEmotion !== 'neutral')
            .map(t => {
                const tsSec = (new Date(t.timestamp).getTime() - callStart) / 1000;
                return {
                    startSec: Math.max(0, tsSec),
                    endSec: Math.max(0, tsSec + 3),
                    speaker: resolveSpeakerRole(t.speaker) as 'caller' | 'callee' | 'mixed',
                    emotion: t.textEmotion as EmotionSegmentData['emotion'],
                    confidence: 0.8,
                    source: 'text_anchor' as const,
                };
            });
        onTextEmotionSegments(segments);
    }, [postCallTranscripts, startTime]);

    // 手动切 tab 时仍需 fetch（处理 diff tab 等场景）
    useEffect(() => {
        if ((activeTab === 'post-call' || activeTab === 'diff') && !postCallChecked) {
            fetchPostCall();
        }
    }, [activeTab, postCallChecked, fetchPostCall]);

    // WebSocket: post-call ASR 完成/失败时自动刷新
    useEffect(() => {
        const unsubscribe = subscribe('call:post_call_asr', (message: any) => {
            const data = message.data || message;
            if (data.callId !== callId) return;

            if (data.status === 'completed') {
                // 自动刷新结果
                fetchPostCall();
                setGenerating(false);
                setJobError(null);
                toast.success(t('transcript.toastAsrComplete', 'ASR transcription complete'));
                if (data.vendorName || data.asrDurationMs) {
                    setAsrMeta({ vendorName: data.vendorName, asrDurationMs: data.asrDurationMs, segmentCount: data.segmentCount });
                }
            } else if (data.status === 'failed') {
                setGenerating(false);
                const errMsg = data.error || 'Post-call ASR failed';
                setJobError(errMsg);
                toast.error(t('transcript.toastAsrFailed', { error: errMsg, defaultValue: 'ASR failed: {{error}}' }));
            }
        });
        return () => unsubscribe();
    }, [callId, subscribe, fetchPostCall]);

    // Trigger post-call ASR generation
    const handleGenerate = async () => {
        setGenerating(true);
        setJobError(null);
        try {
            await api.post(`/platform/calls/${callId}/post-call-asr`);
            // 基于 jobStatus 轮询: 等 job completed 后再取结果, 避免旧数据秒回
            const poll = setInterval(async () => {
                try {
                    const res = await api.get(`/platform/calls/${callId}/transcription?source=post_call`);
                    const transcripts = res.data.transcriptions || [];
                    const jobStatus = res.data.jobStatus;

                    // job 仍在队列/处理中 → 继续等
                    if (jobStatus?.status === 'pending' || jobStatus?.status === 'processing') {
                        return;
                    }

                    if (jobStatus?.status === 'failed') {
                        setGenerating(false);
                        clearInterval(poll);
                        const errMsg = jobStatus.error || t('transcript.errJobFailed');
                        setJobError(errMsg);
                        toast.error(t('transcript.toastAsrFailed', { error: errMsg, defaultValue: 'ASR failed: {{error}}' }));
                        return;
                    }

                    // job completed 或无 job 记录（首次生成）→ 查看结果
                    if (transcripts.length > 0) {
                        setPostCallTranscripts(transcripts);
                        if (jobStatus?.vendorName || jobStatus?.asrDurationMs) {
                            setAsrMeta({ vendorName: jobStatus.vendorName, asrDurationMs: jobStatus.asrDurationMs, segmentCount: jobStatus.segmentCount });
                        }
                        setGenerating(false);
                        clearInterval(poll);
                    } else if (jobStatus?.status === 'completed') {
                        setGenerating(false);
                        clearInterval(poll);
                        setJobError(t('transcript.errNoTranscripts'));
                    }
                } catch { /* keep polling */ }
            }, 3000);
            // 安全网: 10 分钟防止内存泄漏 (正常靠 jobStatus 驱动停止)
            setTimeout(() => {
                clearInterval(poll);
                setGenerating((prev) => {
                    if (prev) setJobError(t('transcript.errTimeout'));
                    return false;
                });
            }, 600000);
        } catch (err: any) {
            setGenerating(false);
            setJobError(err.response?.data?.error || t('transcript.errTriggerFailed'));
        }
    };

    // 将转写 speaker (号码/分机) 映射到 caller/callee 角色
    const resolveSpeakerRole = (speaker: string): string => {
        const s = speaker.toLowerCase();
        if (caller && (s === caller.toLowerCase() || s.includes(caller.toLowerCase()) || caller.toLowerCase().includes(s))) return 'caller';
        if (callee && (s === callee.toLowerCase() || s.includes(callee.toLowerCase()) || callee.toLowerCase().includes(s))) return 'callee';
        if (/^(alice|caller)/i.test(speaker)) return 'caller';
        return 'callee';
    };

    const findEmotion = (speaker: string, timestamp: string, textEmotion?: string): EmotionSegmentData | undefined => {
        const speakerKey = resolveSpeakerRole(speaker);

        // 最优先: 文本情绪（来自 CXAI EmotionAnchor 语义分析）
        if (textEmotion) {
            return {
                speaker: speakerKey,
                emotion: textEmotion,
                confidence: 0.8,
                startSec: 0,
                endSec: 0,
                source: 'text_anchor',
            } as EmotionSegmentData;
        }

        const tsSec = parseTimestamp(timestamp);

        // 次优: 声学情绪段按时间对齐
        if (acousticEmotions.length > 0) {
            const match = acousticEmotions.find(e =>
                (e.speaker === speakerKey || e.speaker === 'mixed') &&
                tsSec >= e.startSec && tsSec <= e.endSec
            );
            if (match) return match;
        }

        // 降级: 文本关键词情绪
        if (emotionSegments.length > 0) {
            return emotionSegments.find(e =>
                e.speaker === speakerKey && e.source === 'text'
            );
        }
        return undefined;
    };

    const parseTimestamp = (ts: string | number): number => {
        if (typeof ts === 'number') return ts / 1000;

        if (startTime) {
            // ISO 8601 格式
            const date = new Date(ts);
            if (!isNaN(date.getTime()) && (ts.includes('T') || ts.includes('-') || ts.includes('/'))) {
                const start = new Date(startTime).getTime();
                return Math.max(0, (date.getTime() - start) / 1000);
            }

            // "HH:MM:SS AM/PM" 墙钟格式 → 结合 startTime 计算通话相对秒数
            const ampmMatch = ts.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
            if (ampmMatch) {
                let h = parseInt(ampmMatch[1]);
                const m = parseInt(ampmMatch[2]);
                const s = parseInt(ampmMatch[3]);
                const isPM = ampmMatch[4].toUpperCase() === 'PM';
                if (isPM && h !== 12) h += 12;
                if (!isPM && h === 12) h = 0;

                const startDate = new Date(startTime);
                const tsDate = new Date(startDate);
                tsDate.setHours(h, m, s, 0);
                // 跨午夜场景
                if (tsDate.getTime() < startDate.getTime() - 3600000) {
                    tsDate.setDate(tsDate.getDate() + 1);
                }
                return Math.max(0, (tsDate.getTime() - startDate.getTime()) / 1000);
            }
        }

        // Fallback: "MM:SS" or "HH:MM:SS" 相对格式
        const parts = ts.toString().split(':');
        if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
        if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);

        return 0;
    };

    const getActiveSegmentIndex = (transcripts: TranscriptionSegment[]) => {
        // Find the last segment that started before currentTime
        let activeIdx = -1;
        for (let i = 0; i < transcripts.length; i++) {
            const time = parseTimestamp(transcripts[i].timestamp);
            if (time <= currentTime) {
                activeIdx = i;
            } else {
                break;
            }
        }
        return activeIdx;
    };

    const tabs: { key: TabType; label: string }[] = [
        { key: 'realtime', label: t('transcript.tabRealtime') },
        { key: 'post-call', label: t('transcript.tabPostCall') },
        { key: 'diff', label: t('transcript.tabDiff') },
    ];

    const renderBubbles = (transcripts: TranscriptionSegment[]) => {
        if (transcripts.length === 0) {
            return (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
                    <div>{t('transcript.noTranscript')}</div>
                </div>
            );
        }

        const activeIdx = getActiveSegmentIndex(transcripts);

        // alignment logic
        const checkIsRight = (speaker: string) => {
            const s = speaker.toLowerCase();
            const isOutbound = direction === 'outbound';
            // 坐席侧参考号码：outbound → caller 是坐席，inbound → callee 是坐席
            const agentRef = isOutbound ? caller?.toLowerCase() : callee?.toLowerCase();
            const custRef = isOutbound ? callee?.toLowerCase() : caller?.toLowerCase();

            if (agentRef && (s === agentRef || s.includes(agentRef) || agentRef.includes(s))) return true;
            if (custRef && (s === custRef || s.includes(custRef) || custRef.includes(s))) return false;

            return /^(bob|callee|agent|b\s|sys)/i.test(speaker);
        };

        return (
            <div style={{ overflowY: 'auto', maxHeight: '400px', padding: '0.5rem', scrollBehavior: 'smooth' }}>
                {transcripts.map((t, idx) => (
                    <TranscriptBubble
                        key={idx}
                        text={t.text}
                        speaker={t.speaker}
                        timestamp={t.timestamp}
                        emotion={findEmotion(t.speaker, t.timestamp, t.textEmotion)}
                        isRight={checkIsRight(t.speaker)}
                        isCurrent={idx === activeIdx}
                    />
                ))}
            </div>
        );
    };

    return (
        <div>
            {/* Tab Bar */}
            <div style={{
                display: 'flex',
                gap: '0',
                borderBottom: '1px solid var(--glass-border)',
                marginBottom: '0.75rem',
            }}>
                {tabs.map(tab => (
                    <Button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            padding: '0.5rem 1rem',
                            fontSize: '0.8rem',
                            fontWeight: activeTab === tab.key ? 600 : 400,
                            color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {tab.label}
                    </Button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'realtime' && renderBubbles(realtimeTranscripts)}

            {activeTab === 'post-call' && (
                postCallLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
                    </div>
                ) : postCallTranscripts.length > 0 ? (
                    <>
                        {renderBubbles(postCallTranscripts)}
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0.75rem 0', borderTop: '1px solid var(--glass-border)', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {asrMeta && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    🤖 {asrMeta.vendorName || 'ASR'}
                                    {asrMeta.segmentCount != null && ` · ${asrMeta.segmentCount} segments`}
                                    {asrMeta.asrDurationMs != null && ` · ${Math.floor(asrMeta.asrDurationMs / 60000)}m ${Math.floor((asrMeta.asrDurationMs % 60000) / 1000)}s`}
                                </span>
                            )}
                            {jobError && (
                                <span style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{jobError}</span>
                            )}
                            <MotionButton
                                className="flex items-center gap-sm"
                                onClick={() => { setPostCallTranscripts([]); setAsrMeta(null); handleGenerate(); }}
                                disabled={generating}
                                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                            >
                                {generating ? (
                                    <><Loader2 size={12} className="animate-spin" /> {t('transcript.generating')}</>
                                ) : (
                                    <><RefreshCw size={12} /> {t('transcript.regenerate', '重新转写')}</>
                                )}
                            </MotionButton>

                            {/* Add/Remove SOP Cart toggle */}
                            <Button
                                onClick={sopCartAdded ? handleRemoveFromSopCart : handleAddToSopCart}
                                style={{
                                    fontSize: '0.78rem', padding: '0.35rem 0.75rem',
                                    background: sopCartAdded
                                        ? (addedAnimation ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)')
                                        : 'rgba(99,102,241,0.1)',
                                    color: sopCartAdded ? '#10b981' : 'var(--primary)',
                                    border: `1px solid ${sopCartAdded ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}`,
                                    borderRadius: '6px', cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                }}
                            >
                                {sopCartAdded ? <><Check size={12} /> {t('sopBuilder.cart.addedToSop')}</> : <><Plus size={12} /> {t('sopBuilder.cart.addToSop')}</>}
                            </Button>

                            {/* Build SOP — cart 非空时显示 */}
                            {getSopCart().length > 0 && (
                                <>
                                <Button
                                    onClick={() => setShowBuildConfirm(true)}
                                    style={{
                                        fontSize: '0.78rem', padding: '0.35rem 0.75rem',
                                        background: 'var(--primary)', color: 'white',
                                        border: 'none', borderRadius: '6px', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                    }}
                                >
                                    <Hammer size={12} /> {t('sopBuilder.cart.buildSopCount', { count: getSopCart().length })}
                                </Button>
                                <button
                                    onClick={() => { saveSopCart([]); setSopCartAdded(false); toast.success(t('sopBuilder.cart.cartCleared')); }}
                                    title={t('sopBuilder.cart.clearCart')}
                                    style={{
                                        background: 'none', border: '1px solid rgba(239,68,68,0.3)',
                                        borderRadius: '6px', cursor: 'pointer', padding: '0.35rem',
                                        color: 'var(--danger)', display: 'flex', alignItems: 'center',
                                    }}
                                >
                                    <Trash2 size={12} />
                                </button>
                                </>
                            )}

                            <ConfirmModal
                                open={showBuildConfirm}
                                onClose={() => setShowBuildConfirm(false)}
                                onConfirm={() => navigate('/sop/builder?from=calls')}
                                title={t('sopBuilder.cart.confirmTitle')}
                                description={t('sopBuilder.cart.confirmDesc', { count: getSopCart().length })}
                                confirmText={t('sopBuilder.cart.confirmBtn')}
                                isDanger={false}
                            />
                        </div>
                    </>
                ) : generating ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '0.75rem' }} />
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {t('transcript.generating', '正在转写中...')}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                            {t('transcript.generatingHint', '转写完成后将自动显示结果')}
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                        <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
                            {t('transcript.noPostCallData')}
                        </div>

                        {jobError && (
                            <div style={{
                                color: 'var(--danger)',
                                padding: '0.5rem',
                                marginBottom: '1rem',
                                background: 'rgba(239, 68, 68, 0.1)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.85rem'
                            }}>
                                {t('transcript.errorPrefix', { error: jobError })}
                            </div>
                        )}
                        <MotionButton
                            className="flex items-center gap-sm"
                            onClick={handleGenerate}
                            disabled={generating}
                            style={{ margin: '0 auto' }}
                        >
                            <Rocket size={14} /> {t('transcript.generateNow')}
                        </MotionButton>
                    </div>
                )
            )}

            {activeTab === 'diff' && (
                <TranscriptDiff
                    realtimeTexts={realtimeTranscripts}
                    postCallTexts={postCallTranscripts}
                    caller={caller}
                    callee={callee}
                    direction={direction}
                />
            )}
        </div>
    );
};

export default TranscriptPanel;
