import { useState, useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import type { CallEvent } from "~/hooks/useWebSocket"

interface AsrInfo {
    enabled: boolean
    canToggle: boolean
    reason: string
    globalPolicy?: string
    agentPolicy?: string
    hasActiveVendor?: boolean
}

interface AsrStatusBarProps {
    asrInfo: AsrInfo | null
    callId: string
}

/**
 * ASR 状态条 — 紧凑嵌入转录区域顶部
 * 三种状态: 启用(绿) / 禁用(红) / 可控(橙开关)
 */
export function AsrStatusBar({ asrInfo, callId }: AsrStatusBarProps) {
    const { t } = useTranslation()
    const [toggling, setToggling] = useState(false)

    // Handle cross-instance sync using a CustomEvent since there are two instances of this component rendered (responsive design)
    const [localEnabled, setLocalEnabled] = useState<boolean | null>(null)
    const isEnabled = localEnabled !== null ? localEnabled : asrInfo?.enabled ?? false

    // Listen for sync events from siblings
    useEffect(() => {
        const handler = (e: any) => {
            if (e.detail.callId === callId) setLocalEnabled(e.detail.enabled);
        }
        window.addEventListener('asr_toggle_sync', handler)
        return () => window.removeEventListener('asr_toggle_sync', handler)
    }, [callId])


    const handleToggle = useCallback(async () => {
        if (!asrInfo?.canToggle || toggling) return
        setToggling(true)
        try {
            const [syncRes, localRes] = await Promise.all([
                new Promise<{ apiUrl?: string }>((resolve) =>
                    chrome.storage.sync.get(["apiUrl"], (r) => resolve(r as any))
                ),
                new Promise<{ token?: string }>((resolve) =>
                    chrome.storage.local.get(["token"], (r) => resolve(r as any))
                ),
            ])
            const apiUrl = syncRes.apiUrl || "http://localhost:3000"
            const action = isEnabled ? "disable" : "enable"
            const res = await fetch(`${apiUrl}/api/calls/${callId}/asr/${action}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${localRes.token}` },
            })
            if (res.ok) {
                const newEnabled = !isEnabled
                setLocalEnabled(newEnabled)
                // Dispatch cross-instance sync
                window.dispatchEvent(new CustomEvent('asr_toggle_sync', { detail: { callId, enabled: newEnabled } }))
                // Also explicitly trigger a global change so TranscriptionList hides
                window.dispatchEvent(new CustomEvent('copilot:asr_local_override', { detail: { enabled: newEnabled } }))
            }
        } catch (e) {
            console.error("[AsrStatusBar] toggle failed:", e)
        } finally {
            setToggling(false)
        }
    }, [asrInfo, callId, isEnabled, toggling])

    if (!asrInfo) return null

    // reason → 用户可读文案
    const reasonText: Record<string, string> = {
        asr_globally_disabled: t('asr.globallyDisabled', 'Transcription disabled by policy'),
        asr_agent_disabled: t('asr.agentDisabled', 'Transcription not enabled for your account'),
        asr_no_vendor: t('asr.noVendor', 'ASR service not configured'),
        asr_enforced: t('asr.enforced', 'Transcription active'),
        asr_optional: t('asr.optional', 'Transcription available'),
        asr_reconnect: isEnabled
            ? t('asr.enforced', 'Transcription active')
            : t('asr.reconnectDisabled', 'Transcription disabled'),
    }

    // 可控模式 — 带开关
    if (asrInfo.canToggle) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', borderRadius: 8, fontSize: '0.75rem',
                background: isEnabled ? 'rgba(34, 197, 94, 0.08)' : 'rgba(250, 204, 21, 0.08)',
                border: `1px solid ${isEnabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(250, 204, 21, 0.2)'}`,
                color: isEnabled ? 'var(--success, #22c55e)' : 'var(--warning, #facc15)',
                transition: 'all 0.2s ease',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.85rem' }}>{isEnabled ? '🎙️' : '🔇'}</span>
                    <span style={{ fontWeight: 500 }}>
                        {isEnabled
                            ? t('asr.transcribing', 'Transcribing')
                            : t('asr.paused', 'Transcription Paused')
                        }
                    </span>
                </div>
                <button
                    onClick={handleToggle}
                    disabled={toggling}
                    style={{
                        padding: '3px 10px', borderRadius: 6,
                        border: 'none', cursor: toggling ? 'wait' : 'pointer',
                        fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit',
                        background: isEnabled
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(34, 197, 94, 0.15)',
                        color: isEnabled ? '#ef4444' : '#22c55e',
                        opacity: toggling ? 0.6 : 1,
                        transition: 'all 0.15s ease',
                    }}
                >
                    {toggling ? '...' : isEnabled
                        ? t('asr.stop', 'Stop')
                        : t('asr.start', 'Start')
                    }
                </button>
            </div>
        )
    }

    // 强制启用
    if (isEnabled) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 8, fontSize: '0.72rem',
                background: 'rgba(34, 197, 94, 0.06)',
                border: '1px solid rgba(34, 197, 94, 0.15)',
                color: 'var(--success, #22c55e)',
            }}>
                <span style={{ fontSize: '0.8rem' }}>🎙️</span>
                <span style={{ fontWeight: 500 }}>{reasonText[asrInfo.reason] || t('asr.enforced', 'Transcription active')}</span>
            </div>
        )
    }

    // 禁用状态 — 灰色/红色提示
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 8, fontSize: '0.72rem',
            background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.12)',
            color: 'var(--text-muted, #94a3b8)',
        }}>
            <span style={{ fontSize: '0.8rem' }}>🔇</span>
            <span>{reasonText[asrInfo.reason] || t('asr.disabled', 'Transcription unavailable')}</span>
        </div>
    )
}
