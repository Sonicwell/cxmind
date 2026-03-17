import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Check, X, RotateCcw, AlertTriangle, Send, Undo2 } from 'lucide-react';

export interface ActionDraft {
    actionId: string;
    intentSlug: string;
    intentName: string;
    status: 'suggested' | 'edited' | 'confirmed' | 'rejected' | 'ignored';
    draft: any;
    originalDraft: any;
    confidence?: number;
}

interface ActionDraftCardProps {
    draft: ActionDraft;
    onConfirm: (id: string, payload: any) => void;
    onReject: (id: string, reason: string) => void;
    onUpdate: (id: string, payload: any) => void;
    onReset: (id: string) => void;
    isNew?: boolean;
    disabled?: boolean;
    disabledHint?: string;
    readOnly?: boolean;
}

const COUNTDOWN_MS = 3000;
const SUCCESS_DISPLAY_MS = 2000;

// 模块级: 跨实例同步「执行中」状态 (宽屏/窄屏各有一个 ActionDraftCard 实例)
// CustomEvent 广播 — 实例A点Execute时，实例B(display:none)也同步启动倒计时
const _execStateCache = new Map<string, { executing: boolean; startedAt: number }>();
const EXEC_SYNC_EVT = 'action-exec-sync';

// 共用 styles
const cardBase: React.CSSProperties = {
    borderRadius: 2, padding: 12, position: 'relative',
    background: 'var(--glass-bg)', backdropFilter: 'blur(10px)',
    border: '1px solid var(--glass-border)',
    transition: 'all 0.4s ease',
    overflow: 'hidden',
};
const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', fontSize: '0.78rem',
    borderRadius: 6, border: '1px solid var(--glass-border)',
    background: 'var(--bg-card)', color: 'var(--text-primary)',
    outline: 'none', fontFamily: 'inherit',
    transition: 'border-color 0.2s',
};
const labelStyle: React.CSSProperties = {
    fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)',
    textTransform: 'capitalize' as const, marginBottom: 2,
};
const btnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 14px', borderRadius: 6, border: 'none',
    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.2s',
};

export const ActionDraftCard: React.FC<ActionDraftCardProps> = ({
    draft, onConfirm, onReject, onUpdate, onReset,
    isNew = false, disabled = false, disabledHint = '', readOnly = false,
}) => {
    const [formData, setFormData] = useState<any>(draft.draft);
    const [isEditing, setIsEditing] = useState(draft.status === 'edited');
    const [rejectReason, setRejectReason] = useState('');
    const [showRejectForm, setShowRejectForm] = useState(false);
    const [showPulse, setShowPulse] = useState(isNew);

    // 倒计时撤回
    const [executing, setExecuting] = useState(false);
    const [countdown, setCountdown] = useState(COUNTDOWN_MS);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 成功 → 折叠（初始已确认则跳过动画直接折叠）
    const [showSuccess, setShowSuccess] = useState(false);
    const [collapsed, setCollapsed] = useState(draft.status === 'confirmed');

    useEffect(() => { setFormData(draft.draft); }, [draft.draft]);
    useEffect(() => {
        if (isNew) { setShowPulse(true); const t = setTimeout(() => setShowPulse(false), 2000); return () => clearTimeout(t); }
    }, [isNew]);

    // 收到 confirmed status 从外部 → 直接显示成功然后折叠
    useEffect(() => {
        if (draft.status === 'confirmed' && !showSuccess && !collapsed) {
            setExecuting(false);
            setShowSuccess(true);
            const t = setTimeout(() => { setShowSuccess(false); setCollapsed(true); }, SUCCESS_DISPLAY_MS);
            return () => clearTimeout(t);
        }
    }, [draft.status]);

    // 跟踪 formData/onConfirm 用于 cleanup（ref 避免闭包陷阱）
    const formDataRef = useRef(formData);
    useEffect(() => { formDataRef.current = formData; }, [formData]);
    const onConfirmRef = useRef(onConfirm);
    useEffect(() => { onConfirmRef.current = onConfirm; }, [onConfirm]);

    // 内部: 启动本实例的倒计时 timer（供 startExecution 和 sync listener 复用）
    const _beginCountdown = useCallback((startedAt: number, isOrigin: boolean) => {
        // 清理旧 timer
        if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

        const remaining = Math.max(0, COUNTDOWN_MS - (Date.now() - startedAt));
        if (remaining <= 0) return; // 已过期

        setExecuting(true);
        setCountdown(remaining);

        countdownRef.current = setInterval(() => {
            const rem = Math.max(0, COUNTDOWN_MS - (Date.now() - startedAt));
            setCountdown(rem);
            if (rem <= 0 && countdownRef.current) {
                clearInterval(countdownRef.current);
                countdownRef.current = null;
            }
        }, 50);

        // 倒计时结束 → 只有 origin 实例执行 confirm（避免双发）
        timerRef.current = setTimeout(() => {
            _execStateCache.delete(draft.actionId);
            setExecuting(false);
            setShowSuccess(true);
            if (isOrigin) {
                onConfirmRef.current(draft.actionId, formDataRef.current);
            }
            setTimeout(() => { setShowSuccess(false); setCollapsed(true); }, SUCCESS_DISPLAY_MS);
        }, remaining);
    }, [draft.actionId]);

    // 监听其他实例广播的 start/cancel 事件
    useEffect(() => {
        const handler = (e: Event) => {
            const { actionId, type, startedAt } = (e as CustomEvent).detail || {};
            if (actionId !== draft.actionId) return;

            if (type === 'start') {
                // 另一个实例发起了执行 → 本实例同步启动倒计时(非 origin)
                _beginCountdown(startedAt, false);
            } else if (type === 'cancel') {
                if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
                if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
                setExecuting(false);
                setCountdown(COUNTDOWN_MS);
            }
        };
        window.addEventListener(EXEC_SYNC_EVT, handler);
        return () => window.removeEventListener(EXEC_SYNC_EVT, handler);
    }, [draft.actionId, _beginCountdown]);

    // cleanup：unmount 时清理 timer
    useEffect(() => {
        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    // mount-recovery: 视图切换 remount 时从 _execStateCache 恢复倒计时
    // isOrigin=true 因为原实例已 unmount，新实例接管 confirm 责任
    useEffect(() => {
        const cached = _execStateCache.get(draft.actionId);
        if (!cached?.executing) return;
        const remaining = COUNTDOWN_MS - (Date.now() - cached.startedAt);
        if (remaining > 0) {
            _beginCountdown(cached.startedAt, true);
        } else {
            // 已过期 — 直接 confirm + 清理
            _execStateCache.delete(draft.actionId);
            onConfirmRef.current(draft.actionId, formDataRef.current);
            setShowSuccess(true);
            setTimeout(() => { setShowSuccess(false); setCollapsed(true); }, SUCCESS_DISPLAY_MS);
        }
    }, []); // mount only

    const allFields = Object.entries(formData || {});
    const filledFields = allFields.filter(([, v]) => v != null && v !== '' && v !== undefined);
    const totalCount = allFields.length;
    const filledCount = filledFields.length;
    const progressPct = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;
    const allFilled = totalCount > 0 && filledCount === totalCount;

    const handleFieldChange = (key: string, value: string) => {
        const newData = { ...formData, [key]: value };
        setFormData(newData);
        onUpdate(draft.actionId, newData);
        setIsEditing(true);
    };

    const startExecution = useCallback(() => {
        const startedAt = Date.now();
        _execStateCache.set(draft.actionId, { executing: true, startedAt });

        // 本实例启动（origin = true → 倒计时结束时真正 confirm）
        _beginCountdown(startedAt, true);

        // 广播给其他实例
        window.dispatchEvent(new CustomEvent(EXEC_SYNC_EVT, {
            detail: { actionId: draft.actionId, type: 'start', startedAt },
        }));
    }, [draft.actionId, _beginCountdown]);

    const cancelExecution = useCallback(() => {
        _execStateCache.delete(draft.actionId);
        if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        setExecuting(false);
        setCountdown(COUNTDOWN_MS);

        // 广播取消
        window.dispatchEvent(new CustomEvent(EXEC_SYNC_EVT, {
            detail: { actionId: draft.actionId, type: 'cancel' },
        }));
    }, [draft.actionId]);

    // ── 已折叠（执行完毕后） ──
    if (collapsed) {
        return (
            <div style={{
                ...cardBase, padding: '8px 12px',
                borderLeft: '3px solid var(--success, #22c55e)',
                background: 'rgba(34,197,94,0.04)',
                opacity: 0.7,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={13} style={{ color: 'var(--success, #22c55e)' }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--success, #22c55e)' }}>
                        ✅ {draft.intentName}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Executed</span>
                </div>
            </div>
        );
    }

    // ── 成功动效（卡片内） ──
    if (showSuccess) {
        return (
            <div style={{
                ...cardBase,
                borderTop: '3px solid var(--success, #22c55e)',
                background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 100%)',
                animation: 'action-success-flash 0.5s ease-out',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'var(--success, #22c55e)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'action-check-pop 0.4s ease-out',
                    }}>
                        <Check size={16} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--success, #22c55e)' }}>
                            {draft.intentName}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            Executed successfully
                        </div>
                    </div>
                </div>
                {/* 自动折叠进度条 */}
                <div style={{ marginTop: 8, height: 2, borderRadius: 1, background: 'rgba(34,197,94,0.15)', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', background: 'var(--success, #22c55e)',
                        animation: `action-shrink ${SUCCESS_DISPLAY_MS}ms linear forwards`,
                    }} />
                </div>
                <style>{`
                    @keyframes action-success-flash {
                        0% { transform: scale(1.02); box-shadow: 0 0 20px rgba(34,197,94,0.3); }
                        100% { transform: scale(1); box-shadow: none; }
                    }
                    @keyframes action-check-pop {
                        0% { transform: scale(0); opacity: 0; }
                        60% { transform: scale(1.2); }
                        100% { transform: scale(1); opacity: 1; }
                    }
                    @keyframes action-shrink {
                        from { width: 100%; }
                        to { width: 0%; }
                    }
                `}</style>
            </div>
        );
    }

    // ── 已确认状态(外部设置 — fallback) ──
    if (draft.status === 'confirmed') {
        return (
            <div style={{ ...cardBase, padding: '8px 12px', borderLeft: '3px solid var(--success, #22c55e)', background: 'rgba(34,197,94,0.04)', opacity: 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={13} style={{ color: 'var(--success, #22c55e)' }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--success)' }}>✅ {draft.intentName}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Executed</span>
                </div>
            </div>
        );
    }

    // ── 已拒绝 ──
    if (draft.status === 'rejected') {
        return (
            <div style={{ ...cardBase, opacity: 0.5, borderLeft: '3px solid var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <X size={14} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>{draft.intentName}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>Rejected</span>
                </div>
            </div>
        );
    }

    // ── 已超时 ──
    if (draft.status === 'ignored') {
        return (
            <div style={{ ...cardBase, opacity: 0.35 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <X size={14} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{draft.intentName}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>Timed out</span>
                </div>
            </div>
        );
    }

    // ── ReadOnly 简化模式 ──
    if (readOnly) {
        const isExecuted = draft.draft?.status === 'EXECUTED';
        const accent = isExecuted ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)';
        const btnDisabled = disabled || isExecuted;
        return (
            <div style={{ ...cardBase, borderLeft: `3px solid ${accent}` }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: accent, marginBottom: 4 }}>
                    ⚡ Action: {draft.intentName}
                </div>
                <pre style={{
                    margin: '4px 0', fontSize: '0.65rem', padding: 6, borderRadius: 4,
                    background: 'var(--glass-highlight)', color: 'var(--text-primary)', overflow: 'auto',
                    border: '1px solid var(--glass-border)',
                }}>
                    {JSON.stringify(draft.draft, null, 2)}
                </pre>
                {isExecuted ? (
                    <div style={{ marginTop: 4, fontSize: '0.65rem', color: 'var(--success)', fontWeight: 600 }}>✅ Action executed</div>
                ) : (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                        <button disabled={btnDisabled} onClick={() => onConfirm(draft.actionId, draft.draft)}
                            style={{ ...btnPrimary, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', ...(btnDisabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}>
                            Approve
                        </button>
                        <button disabled={btnDisabled} onClick={() => onReject(draft.actionId, 'dismissed')}
                            style={{ ...btnPrimary, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--glass-border)', ...(btnDisabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}>
                            Dismiss
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // ── 主要的 Active draft 卡片 ──
    const borderTopColor = executing ? '#f59e0b' : isEditing ? '#f59e0b' : 'var(--primary, #6366f1)';

    return (
        <div style={{
            ...cardBase,
            borderTop: `3px solid ${borderTopColor}`,
            ...(showPulse ? { boxShadow: '0 0 0 2px rgba(99,102,241,0.4)', animation: 'pulse 1s ease-in-out' } : {}),
            ...(executing ? { opacity: 0.85 } : {}),
        }}>
            {/* 倒计时进度条 — 执行中显示在卡片顶部 */}
            {executing && (
                <div style={{
                    position: 'absolute', top: 3, left: 0, right: 0, height: 3,
                    background: 'rgba(245,158,11,0.15)',
                }}>
                    <div style={{
                        height: '100%',
                        background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                        width: `${(countdown / COUNTDOWN_MS) * 100}%`,
                        transition: 'width 50ms linear',
                    }} />
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary, #1f2937)' }}>
                            {draft.intentName}
                        </span>
                        {isEditing && !executing && (
                            <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600 }}>
                                Editing
                            </span>
                        )}
                        {executing && (
                            <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600, animation: 'pulse 1s infinite' }}>
                                ⏳ {Math.ceil(countdown / 1000)}s
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted, #9ca3af)', marginTop: 2 }}>
                        {executing ? 'Click Undo to cancel' : 'Use <b>Alt+Enter</b> to confirm'}
                    </div>
                </div>
                {!executing && (
                    <button onClick={() => onReset(draft.actionId)} title="Reset to original"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: 'var(--text-muted)', display: 'flex' }}>
                        <RotateCcw size={14} />
                    </button>
                )}
            </div>

            {/* Progress */}
            {totalCount > 0 && !executing && (
                <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 500, color: allFilled ? 'var(--success, #22c55e)' : 'var(--text-muted)' }}>
                            {allFilled ? '✅ Ready to confirm' : `${filledCount}/${totalCount} fields filled`}
                        </span>
                        <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: allFilled ? 'var(--success)' : 'var(--text-muted)' }}>
                            {progressPct}%
                        </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 4, background: 'var(--glass-highlight)', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', borderRadius: 4, transition: 'width 0.5s ease-out',
                            width: `${progressPct}%`,
                            background: allFilled
                                ? 'linear-gradient(90deg, #10b981, #34d399)'
                                : 'linear-gradient(90deg, var(--primary, #6366f1), #818cf8)',
                        }} />
                    </div>
                </div>
            )}

            {/* Fields — 执行中变灰 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...(executing ? { opacity: 0.4, pointerEvents: 'none' as const } : {}) }}>
                {Object.entries(formData || {}).map(([key, value]) => (
                    <div key={key}>
                        <div style={labelStyle}>{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}</div>
                        <div style={{ position: 'relative' }}>
                            <input
                                value={value as string || ''}
                                onChange={(e) => handleFieldChange(key, e.target.value)}
                                disabled={executing || draft.status === 'confirmed'}
                                placeholder={`Enter ${key.replace(/_/g, ' ')}...`}
                                style={{
                                    ...inputStyle,
                                    ...(!value ? { borderColor: 'rgba(245,158,11,0.5)' } : {}),
                                }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--primary, #6366f1)'; }}
                                onBlur={(e) => { e.target.style.borderColor = value ? 'var(--glass-border)' : 'rgba(245,158,11,0.5)'; }}
                            />
                            {!value && (
                                <AlertTriangle size={14} style={{ position: 'absolute', right: 8, top: 7, color: '#f59e0b', pointerEvents: 'none' }} />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--glass-border, rgba(0,0,0,0.06))' }}>
                {executing ? (
                    /* 执行中：Undo 按钮 */
                    <button
                        onClick={cancelExecution}
                        style={{
                            ...btnPrimary, flex: 1, justifyContent: 'center',
                            background: 'rgba(245,158,11,0.1)',
                            color: '#f59e0b',
                            border: '1px solid rgba(245,158,11,0.3)',
                            animation: 'pulse 1s infinite',
                        }}
                    >
                        <Undo2 size={12} />
                        Undo — {Math.ceil(countdown / 1000)}s
                    </button>
                ) : (
                    /* 正常态：Execute 按钮 */
                    <>
                        <button
                            onClick={startExecution}
                            disabled={disabled || !allFilled}
                            title={disabled ? disabledHint : undefined}
                            style={{
                                ...btnPrimary, flex: 1, justifyContent: 'center',
                                background: (disabled || !allFilled) ? 'var(--glass-highlight)' : 'var(--primary, #6366f1)',
                                color: (disabled || !allFilled) ? 'var(--text-muted)' : '#fff',
                                ...((disabled || !allFilled) ? { cursor: 'not-allowed', opacity: 0.6 } : { boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }),
                            }}
                        >
                            <Send size={12} />
                            {disabled ? (disabledHint || 'Disabled') : allFilled ? 'Execute Action' : `Fill ${totalCount - filledCount} more`}
                        </button>

                        {!showRejectForm ? (
                            <button onClick={() => setShowRejectForm(true)} title="Reject"
                                style={{ ...btnPrimary, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '5px 8px' }}>
                                <X size={14} />
                            </button>
                        ) : (
                            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                                <input
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Reason..."
                                    autoFocus
                                    style={{ ...inputStyle, flex: 1, borderColor: 'rgba(239,68,68,0.3)' }}
                                />
                                <button onClick={() => onReject(draft.actionId, rejectReason || 'No reason')}
                                    style={{ ...btnPrimary, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '5px 8px' }}>
                                    <Check size={12} />
                                </button>
                                <button onClick={() => setShowRejectForm(false)}
                                    style={{ ...btnPrimary, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--glass-border)', padding: '5px 8px' }}>
                                    <X size={12} />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
