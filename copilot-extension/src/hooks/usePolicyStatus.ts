import { useState, useEffect, useCallback } from 'react'

interface PolicyState {
    enabled: boolean
    canToggle: boolean
    reason: string
}

const defaultPolicy: PolicyState = { enabled: true, canToggle: false, reason: '' }

/**
 * 登录后一次性 fetch ASR/Summary/Assistant 三个策略
 * 管理员改策略 → WS policy:updated → DOM event → re-fetch
 */
export function usePolicyStatus() {
    const [asr, setAsr] = useState<PolicyState>(defaultPolicy)
    const [summary, setSummary] = useState<PolicyState>(defaultPolicy)
    const [assistant, setAssistant] = useState<PolicyState>(defaultPolicy)

    const fetchPolicies = useCallback(async () => {
        try {
            const [syncRes, localRes] = await Promise.all([
                new Promise<{ apiUrl?: string }>((resolve) =>
                    chrome.storage.sync.get(['apiUrl'], (r) => resolve(r as any))
                ),
                new Promise<{ token?: string }>((resolve) =>
                    chrome.storage.local.get(['token'], (r) => resolve(r as any))
                ),
            ])
            const apiUrl = syncRes.apiUrl || 'http://localhost:3000'
            if (!localRes.token) return

            const headers = { Authorization: `Bearer ${localRes.token}` }
            const [asrRes, sumRes, astRes] = await Promise.all([
                fetch(`${apiUrl}/api/asr/policy`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
                fetch(`${apiUrl}/api/summary/policy`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
                fetch(`${apiUrl}/api/assistant/policy`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
            ])

            if (asrRes) setAsr({ enabled: asrRes.enabled ?? true, canToggle: asrRes.canToggle ?? false, reason: asrRes.reason ?? '' })
            if (sumRes) setSummary({ enabled: sumRes.enabled ?? true, canToggle: sumRes.canToggle ?? false, reason: sumRes.reason ?? '' })
            if (astRes) setAssistant({ enabled: astRes.enabled ?? true, canToggle: astRes.canToggle ?? false, reason: astRes.reason ?? '' })
        } catch { /* 降级: 保持默认值 */ }
    }, [])

    useEffect(() => {
        fetchPolicies()
    }, [fetchPolicies])

    // 管理员改策略 → re-fetch
    useEffect(() => {
        const handler = () => { fetchPolicies() }
        window.addEventListener('copilot:policy_updated', handler)
        return () => window.removeEventListener('copilot:policy_updated', handler)
    }, [fetchPolicies])

    // 向后兼容: assistantEnabled 仍可独立使用
    return {
        asr, summary, assistant,
        assistantEnabled: assistant.enabled,
        refetchPolicies: fetchPolicies,
    }
}
