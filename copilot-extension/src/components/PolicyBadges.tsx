import { useState, useEffect, useCallback } from 'react'
import { Mic, FileText, Bot, ToggleLeft, ToggleRight } from 'lucide-react'
import { useApi } from '~/hooks/useApi'
import { useTranslation } from 'react-i18next'

interface PolicyState {
    enabled: boolean
    canToggle: boolean
    reason: string
}

/**
 * Home Dashboard 双 Badge: ASR + Summary 策略显示+切换
 * optional 模式下坐席可通过 toggle 控制偏好, 下通生效
 */
export function PolicyBadges() {
    const { fetchApi, isInitialized } = useApi()
    const { t } = useTranslation()
    const [asr, setAsr] = useState<PolicyState>({ enabled: false, canToggle: false, reason: '' })
    const [summary, setSummary] = useState<PolicyState>({ enabled: false, canToggle: false, reason: '' })
    const [assistant, setAssistant] = useState<PolicyState>({ enabled: false, canToggle: false, reason: '' })
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState<string | null>(null)

    const fetchPolicies = useCallback(async () => {
        // 逐个 catch: 402/403 不应拖垮其他 badge
        const safeFetch = async (url: string): Promise<any | null> => {
            try { return await fetchApi<any>(url) }
            catch { return null }
        }
        try {
            const [asrRes, summaryRes, assistantRes] = await Promise.all([
                safeFetch('/api/asr/policy'),
                safeFetch('/api/summary/policy'),
                safeFetch('/api/assistant/policy'),
            ])
            if (asrRes) setAsr({
                enabled: asrRes.enabled ?? false,
                canToggle: asrRes.canToggle ?? false,
                reason: asrRes.reason ?? '',
            })
            if (summaryRes) setSummary({
                enabled: summaryRes.enabled ?? false,
                canToggle: summaryRes.canToggle ?? false,
                reason: summaryRes.reason ?? '',
            })
            if (assistantRes) setAssistant({
                enabled: assistantRes.enabled ?? false,
                canToggle: assistantRes.canToggle ?? false,
                reason: assistantRes.reason ?? '',
            })
        } catch {
            // 全局降级
        } finally {
            setLoading(false)
        }
    }, [fetchApi])

    useEffect(() => {
        if (!isInitialized) return
        fetchPolicies()
    }, [isInitialized, fetchPolicies])

    // 管理员改策略后 WS 推送 → DOM event → re-fetch + toast
    useEffect(() => {
        const handler = () => {
            fetchPolicies()
            setToast(t('copilot.policyBadges.adminUpdated', 'Policy updated by admin'))
            setTimeout(() => setToast(null), 4000)
        }
        window.addEventListener('copilot:policy_updated', handler)
        return () => window.removeEventListener('copilot:policy_updated', handler)
    }, [fetchPolicies, t])

    const handleToggle = async (type: 'asr' | 'summary' | 'assistant') => {
        const current = type === 'asr' ? asr : type === 'summary' ? summary : assistant
        const setter = type === 'asr' ? setAsr : type === 'summary' ? setSummary : setAssistant
        if (!current.canToggle) return
        const newValue = !current.enabled

        // Optimistic update
        setter(s => ({ ...s, enabled: newValue }))

        try {
            const endpoint = type === 'asr'
                ? '/api/asr/preference/toggle'
                : type === 'summary'
                    ? '/api/summary/toggle'
                    : '/api/assistant/preference/toggle'
            await fetchApi(endpoint, {
                method: 'POST',
                body: JSON.stringify({ enabled: newValue }),
            })
            setToast(t('copilot.policyBadges.nextCallEffect'))
            setTimeout(() => setToast(null), 3000)
        } catch {
            // Rollback
            setter(s => ({ ...s, enabled: !newValue }))
        }
    }

    if (loading) return null

    // 全部 disabled → 不显示 badge
    const showAsr = asr.reason !== 'asr_globally_disabled' && asr.reason !== 'asr_no_vendor'
    const showSummary = summary.reason !== 'summary_globally_disabled'
    const showAssistant = assistant.reason !== 'assistant_globally_disabled'
    if (!showAsr && !showSummary && !showAssistant) return null

    return (
        <div style={{ position: 'relative' }}>
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '0 8px 8px',
            }}>
                {showAsr && (
                    <Badge
                        icon={<Mic size={14} />}
                        label={t('badges.asr', 'ASR')}
                        enabled={asr.enabled}
                        canToggle={asr.canToggle}
                        reason={asr.reason}
                        onToggle={() => handleToggle('asr')}
                    />
                )}
                {showSummary && (
                    <Badge
                        icon={<FileText size={14} />}
                        label={t('badges.aiSummary', 'AI Summary')}
                        enabled={summary.enabled}
                        canToggle={summary.canToggle}
                        reason={summary.reason}
                        onToggle={() => handleToggle('summary')}
                    />
                )}
                {showAssistant && (
                    <Badge
                        icon={<Bot size={14} />}
                        label={t('badges.aiAssistant', 'AI Assistant')}
                        enabled={assistant.enabled}
                        canToggle={assistant.canToggle}
                        reason={assistant.reason}
                        onToggle={() => handleToggle('assistant')}
                    />
                )}
            </div>
            {toast && (
                <div style={{
                    position: 'absolute', bottom: -28, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                    borderRadius: 6, padding: '4px 10px', fontSize: '0.68rem',
                    color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                    backdropFilter: 'blur(8px)', zIndex: 10,
                }}>
                    {toast}
                </div>
            )}
        </div>
    )
}

function Badge({ icon, label, enabled, canToggle, reason, onToggle }: {
    icon: React.ReactNode
    label: string
    enabled: boolean
    canToggle: boolean
    reason: string
    onToggle: () => void
}) {
    const color = enabled ? 'var(--success, #22c55e)' : 'var(--text-muted, #94a3b8)'
    const reasonLabel = reason?.includes('enforced') ? 'Enforced'
        : reason?.includes('disabled') ? 'Disabled' : ''

    return (
        <button
            onClick={canToggle ? onToggle : undefined}
            disabled={!canToggle}
            style={{
                flex: 1,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', borderRadius: 8,
                background: enabled ? 'rgba(34, 197, 94, 0.08)' : 'var(--glass-bg)',
                border: `1px solid ${enabled ? 'rgba(34, 197, 94, 0.2)' : 'var(--glass-border)'}`,
                cursor: canToggle ? 'pointer' : 'default',
                opacity: canToggle ? 1 : 0.7,
                transition: 'all 0.2s ease',
                fontFamily: 'inherit',
                color: 'inherit',
            }}
            title={canToggle ? `Toggle ${label}` : reasonLabel}
        >
            <span style={{ color, display: 'flex', alignItems: 'center' }}>{icon}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 500, flex: 1, textAlign: 'left' }}>{label}</span>
            {canToggle ? (
                enabled
                    ? <ToggleRight size={16} color="var(--success, #22c55e)" />
                    : <ToggleLeft size={16} color="var(--text-muted, #94a3b8)" />
            ) : (
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {reasonLabel}
                </span>
            )}
        </button>
    )
}
