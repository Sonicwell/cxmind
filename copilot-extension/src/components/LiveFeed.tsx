import { useState, useEffect, useRef } from "react"
import i18n from "~/i18n/config"
import { Radio } from "lucide-react"
import { useMessageBus } from "~/hooks/useMessageBus"
import { useTranslation } from "react-i18next"

interface FeedItem {
    id: string
    icon: string
    text: string
    time: Date
    type: 'info' | 'alert' | 'success' | 'warning'
}

const TYPE_COLORS: Record<string, string> = {
    info: 'var(--text-muted)',
    alert: 'var(--danger)',
    success: 'var(--success)',
    warning: '#f59e0b',
}

function timeAgo(date: Date): string {
    const sec = Math.floor((Date.now() - date.getTime()) / 1000)
    if (sec < 10) return i18n.t('common.justNow')
    if (sec < 60) return i18n.t('common.sAgo', { n: sec })
    if (sec < 3600) return i18n.t('common.mAgo', { n: Math.floor(sec / 60) })
    return i18n.t('common.hAgo', { n: Math.floor(sec / 3600) })
}

export function LiveFeed() {
    const { t } = useTranslation()
    const [items, setItems] = useState<FeedItem[]>([])
    const [, setTick] = useState(0) // force re-render for relative times
    const maxItems = 50
    const containerRef = useRef<HTMLDivElement>(null)
    const recentKeysRef = useRef<Map<string, number>>(new Map()) // dedup key → timestamp
    const DEDUP_WINDOW_MS = 10000 // suppress same event within 10s

    // Add a feed item with deduplication
    const addItem = (dedupKey: string, item: FeedItem) => {
        const now = Date.now()
        const lastSeen = recentKeysRef.current.get(dedupKey)
        if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return // suppress duplicate
        recentKeysRef.current.set(dedupKey, now)

        // 清过期的dedup key, 别让map太大
        if (recentKeysRef.current.size > 200) {
            const cutoff = now - DEDUP_WINDOW_MS * 2
            for (const [k, t] of recentKeysRef.current) {
                if (t < cutoff) recentKeysRef.current.delete(k)
            }
        }

        setItems(prev => {
            const next = [item, ...prev]
            return next.slice(0, maxItems)
        })
    }

    // LiveFeed 监听多种事件类型
    useMessageBus(
        ['omni:new_conversation', 'omni:queue_update', 'agent:status_change', 'chat:message'],
        (msg) => {
            const ts = new Date()
            const id = `${msg.type}-${Date.now()}-${Math.random()}`

            switch (msg.type) {
                case 'omni:new_conversation': {
                    const name = msg.data?.metadata?.visitorName || 'A visitor'
                    addItem(`omni:new:${msg.data?.conversationId}`, { id, icon: '💬', text: t('liveFeed.newChat', { name }), time: ts, type: 'info' })
                    break
                }
                case 'omni:queue_update': {
                    const q = msg.data?.queued ?? 0
                    if (q > 3) {
                        addItem('queue:alert', { id, icon: '🔴', text: t('liveFeed.queueAlert', { count: q }), time: ts, type: 'warning' })
                    }
                    break
                }
                case 'agent:status_change': {
                    const meta = msg.data?.metadata || {}
                    const sip = meta.sipNumber || msg.data?.sipNumber || ''
                    const agentKey = msg.data?.agentId || sip || 'unknown'
                    const display = meta.displayName || msg.data?.displayName || msg.data?.agentName
                    const name = display ? display : (sip ? `Agent ${sip}` : 'Agent')
                    const status = msg.data?.status || 'unknown'
                    const icon = status === 'available' ? '🟢' : status === 'offline' ? '⚫' : '🟡'
                    addItem(`agent:${agentKey}:${status}`, { id, icon, text: t('liveFeed.agentStatus', { name, status }), time: ts, type: 'info' })
                    break
                }
                case 'chat:message': {
                    const sender = msg.data?.sender?.name || msg.data?.sender?.displayName
                    if (sender && msg.data?.channelId?.startsWith('group:')) {
                        addItem(`chat:group:${msg.data?._id}`, { id, icon: '👥', text: t('liveFeed.groupMessage', { name: sender }), time: ts, type: 'info' })
                    }
                    break
                }
            }
        }
    )

    // 30s刷一次相对时间
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 30000)
        return () => clearInterval(timer)
    }, [])

    return (
        <div className="glass-panel" style={{ padding: '10px 16px' }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8
            }}>
                <Radio size={12} style={{ color: 'var(--success)' }} />
                <span>{t('common.liveFeed')}</span>
                {items.length > 0 && (
                    <span style={{
                        marginLeft: 'auto', fontSize: '0.6rem',
                        opacity: 0.6, cursor: 'pointer'
                    }} onClick={() => setItems([])}>{t('common.clear')}</span>
                )}
            </div>

            <div ref={containerRef} style={{
                maxHeight: 140, overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: 4,
            }}>
                {items.length === 0 ? (
                    <div style={{
                        fontSize: '0.7rem', color: 'var(--text-muted)',
                        textAlign: 'center', padding: '8px 0', opacity: 0.6
                    }}>
                        {t('common.listeningForEvents')}
                    </div>
                ) : (
                    items.map(item => (
                        <div key={item.id} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                            fontSize: '0.72rem', lineHeight: 1.3,
                            animation: 'feedSlideIn 0.3s ease',
                        }}>
                            <span style={{ flexShrink: 0 }}>{item.icon}</span>
                            <span style={{ flex: 1, color: TYPE_COLORS[item.type] || 'var(--text-secondary)' }}>
                                {item.text}
                            </span>
                            <span style={{
                                flexShrink: 0, fontSize: '0.58rem',
                                color: 'var(--text-muted)', opacity: 0.5,
                                whiteSpace: 'nowrap'
                            }}>
                                {timeAgo(item.time)}
                            </span>
                        </div>
                    ))
                )}
            </div>

            <style>{`
                @keyframes feedSlideIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
