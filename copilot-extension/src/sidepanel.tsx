import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "~/hooks/useAuth"
import { useWebSocket } from "~/hooks/useWebSocket"
import { usePiP } from "~/hooks/usePiP"
import { useSettings } from "~/hooks/useSettings"
import { useApi } from "~/hooks/useApi"
import { decodeJWT } from "~/utils/jwt"
import { useTheme } from "~/hooks/useTheme"
import { useModules } from "~/hooks/useModules"
import { BootScreen } from "~/components/BootScreen"
import { LoginView } from "~/components/LoginView"
import { Header } from "~/components/Header"
import { TabBar, type ConversationSlot } from "~/components/TabBar"
import { CallStage } from "~/components/CallStage"
import { TranscriptionList } from "~/components/TranscriptionList"
import { SuggestionsPanel } from "~/components/SuggestionsPanel"
import { ActionList } from "~/components/ActionList"
import { ComplianceList } from "~/components/ComplianceList"
import { SummaryCard } from "~/components/SummaryCard"
import { OutcomeCard } from "~/components/OutcomeCard"
import { PostCallBreather } from "~/components/PostCallBreather"
import { CallerContext360 } from "~/components/CallerContext360"
import { CollapsibleWidget } from "~/components/CollapsibleWidget"
import { CopilotSidebar } from "~/components/CopilotSidebar"
import { ChatPanel } from "~/components/Chat/ChatPanel"
import { InboxPanel } from "~/components/Chat/InboxPanel"
import { MeTab } from "~/components/MeTab"
import { HomeDashboard } from "~/components/HomeDashboard"
import { MonitorPanel } from "~/components/MonitorPanel"
import { SOPGuidePanel } from "~/components/SOPGuidePanel"
import { ToolkitPanel, type WrapupItem } from "~/components/ToolkitPanel"
import { AsrStatusBar } from "~/components/AsrStatusBar"
import { usePolicyStatus } from "~/hooks/usePolicyStatus"
import { useContainerWidth } from "~/hooks/useContainerWidth"

import { Phone } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { PageTransition } from "~/components/PageTransition"
import { useTranslation } from "react-i18next"

import "~/i18n/config"
import "~/style.css"
import { DEMO_ENABLED } from "~/utils/demo-flag"

function getWorstQuality(quality: { caller: any, callee: any } | null) {
    if (!quality) return null;
    let worst = null;
    let desc = '';

    // Check Caller (Customer)
    if (quality.caller && quality.caller.mos_score < 3.5) {
        worst = quality.caller;
        desc = "Customer Network Poor";
    }

    // Check Callee (Agent)
    if (quality.callee && quality.callee.mos_score < 3.5) {
        if (!worst || quality.callee.mos_score < worst.mos_score) {
            worst = quality.callee;
            desc = "Your Network Poor";
        }
    }

    // Check if both are poor
    if (quality.caller?.mos_score < 3.5 && quality.callee?.mos_score < 3.5) {
        desc = "Both Networks Poor";
    }

    if (worst) {
        return { mos: worst.mos_score, desc };
    }
    return null;
}

function SidePanel() {
    const { isAuthenticated, isLoading, agentInfo } = useAuth()
    const { t } = useTranslation()
    const {
        currentCall: _currentCall, transcriptions, suggestions,
        complianceItems, completedComplianceItems,
        omniComplianceItems, omniCompletedComplianceItems, omniComplianceConvId,
        callSummary, callOutcome, lastEndedCallId, lastEndedCallInfo, summaryLoading, summaryTimedOut, summaryNotEnabled, summarySkipped, dismissSummary,
        triggerMockSummary, connected, connecting,
        chatMessages, addOptimisticChatMessage, callQuality, contextBrief, crmData, asrInfo
    } = useWebSocket()
    const { openPiP } = usePiP()
    const { settings } = useSettings() // Added settings

    const currentCall = _currentCall;
    const activeCallData = currentCall; // Ensure TabBar doesn't break if my previous sed hit it

    const { assistantEnabled } = usePolicyStatus()
    const asrEnabled = asrInfo?.enabled !== false

    const { isModuleEnabled } = useModules()

    const [localAsrOverride, setLocalAsrOverride] = useState<boolean | null>(null)
    const effectiveAsrEnabled = localAsrOverride !== null ? localAsrOverride : asrEnabled

    useEffect(() => {
        const handler = (e: any) => setLocalAsrOverride(e.detail.enabled)
        window.addEventListener('copilot:asr_local_override', handler)
        return () => window.removeEventListener('copilot:asr_local_override', handler)
    }, [])

    useEffect(() => {
        // Reset override when a new call starts or ends
        setLocalAsrOverride(null)
    }, [currentCall?.call_id])

    // UX-1: Call Tab Aura & Global Glow
    const getAuraClass = () => { } // Placeholder for actual implementation
    const { ref: containerRef, isWide, isExtraWide } = useContainerWidth()
    const { fetchApi, isInitialized: apiInitialized } = useApi() // Add API status
    const [activeTab, setActiveTab] = useState("home")
    const [showBootScreen, setShowBootScreen] = useState(true)
    const [chatBadge, setChatBadge] = useState<'none' | 'assigned' | 'unread' | 'active'>('none')
    const [queueCount, setQueueCount] = useState(0)
    const [convSlots, setConvSlots] = useState<ConversationSlot[]>([])
    const [chatShaking, setChatShaking] = useState(false)
    const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [callCount, setCallCount] = useState(0)
    const [lastCallDuration, setLastCallDuration] = useState(0)
    const [showBreather, setShowBreather] = useState(false)
    const prevCallRef = useRef<string | null>(null)
    const currentCallRef = useRef(currentCall)
    const role = agentInfo?.role

    // Toolkit state
    const [toolkitOpen, setToolkitOpen] = useState(false)
    const [wrapupQueue, setWrapupQueue] = useState<WrapupItem[]>([])

    // Persist: mount 时从 chrome.storage 恢复（函数式 merge 防竞态）
    useEffect(() => {
        chrome.storage.local.get(['wrapupQueue'], (result) => {
            if (Array.isArray(result.wrapupQueue) && result.wrapupQueue.length > 0) {
                const cutoff = Date.now() - 12 * 60 * 60 * 1000
                const valid = result.wrapupQueue.filter(
                    (w: WrapupItem) => new Date(w.endedAt).getTime() > cutoff
                )
                if (valid.length > 0) {
                    setWrapupQueue(current => {
                        const existingIds = new Set(current.map(w => w.id))
                        const restored = valid.filter((w: WrapupItem) => !existingIds.has(w.id))
                        return [...restored, ...current]
                    })
                }
            }
        })
    }, [])

    // Persist: wrapupQueue 变更 → 写入 chrome.storage（统一收口 6 个触发点）
    useEffect(() => {
        chrome.storage.local.set({ wrapupQueue: wrapupQueue.slice(-20) })
    }, [wrapupQueue])

    // 用 ref 跟踪 currentCall，让 handleTabChange 始终能读到最新值且不重新创建
    currentCallRef.current = currentCall

    // Group chat multi-group unread tracking
    const [groupChatUnread, setGroupChatUnread] = useState<Record<string, number>>({})
    const groupSeenCountRef = useRef<Record<string, number>>({})
    const myGroupIds: string[] = agentInfo?.groupIds || []
    const [groupNames, setGroupNames] = useState<Record<string, string>>({})

    // B1: 挂载时 fetch 组名 — dep 用 stringify 确保换组同长度也触发
    const groupIdsKey = JSON.stringify(myGroupIds)
    useEffect(() => {
        if (myGroupIds.length === 0 || !apiInitialized) return
        fetchApi<{ data: any[] }>('/api/groups')
            .then(res => {
                const groups = res?.data || []
                const names: Record<string, string> = {}
                for (const g of groups) {
                    if (myGroupIds.includes(g._id?.toString())) {
                        names[g._id.toString()] = g.name || `Group ${g._id.toString().slice(-4)}`
                    }
                }
                setGroupNames(names)
            })
            .catch(() => { })
    }, [groupIdsKey, apiInitialized])

    // B3: 读取持久化多组未读计数
    useEffect(() => {
        chrome.storage.local.get(['groupChatUnread'], (result) => {
            const unreadMap = result.groupChatUnread || {}
            if (typeof unreadMap === 'object' && !Array.isArray(unreadMap)) {
                setGroupChatUnread(unreadMap)
            }
        })
    }, [])

    // 实时同步 chrome.storage 中的 groupChatUnread（background 负责计数）
    const myAgentId = agentInfo?.agentId || agentInfo?.userId || null
    useEffect(() => {
        const listener = (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => {
            if (namespace === 'local' && changes.groupChatUnread) {
                const newMap = changes.groupChatUnread.newValue || {}
                setGroupChatUnread(newMap)
            }
        }
        chrome.storage.onChanged.addListener(listener)
        return () => chrome.storage.onChanged.removeListener(listener)
    }, [])

    // 清除指定组未读
    const handleChatTabGroupSeen = useCallback((groupId: string) => {
        setGroupChatUnread(prev => ({ ...prev, [groupId]: 0 }))
        chrome.storage.local.get(['groupChatUnread'], (result) => {
            const unreadMap = result.groupChatUnread || {}
            unreadMap[groupId] = 0
            chrome.storage.local.set({ groupChatUnread: unreadMap })
        })
    }, [])

    // Theme — MUST be called before any early returns (Rules of Hooks)
    const { theme, isDark } = useTheme()

    const breatherTimerRef = useRef<any>(null)
    const ongoingCallRef = useRef<any>(null)
    useEffect(() => { ongoingCallRef.current = _currentCall }, [_currentCall])

    // 跟踪通话结束 → 显示 breather toast + 追加 wrapup
    useEffect(() => {
        if (lastEndedCallId && lastEndedCallId !== prevCallRef.current) {
            prevCallRef.current = lastEndedCallId
            setCallCount(c => c + 1)
            if (lastEndedCallInfo?.startTime) {
                const start = new Date(lastEndedCallInfo.startTime).getTime()
                const end = (lastEndedCallInfo as any).endTime ? new Date((lastEndedCallInfo as any).endTime).getTime() : Date.now()
                setLastCallDuration(Math.round((end - start) / 1000))
            }
            setShowBreather(true)

            // Toolkit: 追加到 wrapup 队列
            setWrapupQueue(q => {
                if (q.some(w => w.id === lastEndedCallId)) return q
                // label = 对方号码（not 自己）
                const info = lastEndedCallInfo as any
                const callerNum = (info?.caller || '').replace(/sip:|@.*/g, '')
                const isCallerMe = !!(agentInfo?.sipNumber && callerNum === agentInfo.sipNumber)
                const remoteParty = (isCallerMe ? info?.callee : info?.caller || '').replace(/sip:|@.*/g, '')
                return [...q, {
                    id: lastEndedCallId,
                    type: 'voice' as const,
                    label: remoteParty || lastEndedCallId,
                    endedAt: new Date().toISOString(),
                    summary: undefined,
                    summaryLoading: !(summaryNotEnabled || summarySkipped),
                    status: 'pending' as const,
                }]
            })
            // 延迟打开 toolkit（≥ COUNTDOWN_MS），给进行中的 action Undo 窗口留时间
            if (breatherTimerRef.current) clearTimeout(breatherTimerRef.current)
            breatherTimerRef.current = setTimeout(() => {
                 // RACE CONDITION FIX: If agent immediately took another call, do NOT slide Toolkit open over it!
                 if (!ongoingCallRef.current) {
                     setToolkitOpen(true)
                 }
            }, 3500)
        }
    }, [lastEndedCallId, lastEndedCallInfo, agentInfo?.sipNumber])

    // callSummary 到达 → 更新对应 wrapup item
    useEffect(() => {
        if (callSummary && lastEndedCallId) {
            const summaryText = callSummary.rawSummary
                || `${callSummary.intent} — ${callSummary.outcome}. Next: ${callSummary.nextAction}`
            setWrapupQueue(q => q.map(w =>
                w.id === lastEndedCallId && !w.summary
                    ? { ...w, summary: summaryText }
                    : w
            ))
        }
    }, [callSummary, lastEndedCallId])

    // callOutcome (AI预测) 到达 → 同步到 wrapup queue item
    useEffect(() => {
        if (callOutcome?.outcome && lastEndedCallId) {
            setWrapupQueue(q => q.map(w =>
                w.id === lastEndedCallId ? { ...w, aiOutcome: callOutcome.outcome } : w
            ))
        }
    }, [callOutcome, lastEndedCallId])

    // PiP 完成 wrap-up → 同步 wrapupQueue 状态（useWebSocket 只清了 summary，不管 queue）
    useEffect(() => {
        const handler = (msg: any) => {
            if (msg.type === 'wrapup:completed') {
                // 标记当前 pending call 为 completed
                setWrapupQueue(q => q.map(w => w.status === 'pending' ? { ...w, status: 'completed' as const } : w))
            }
        }
        chrome.runtime.onMessage.addListener(handler)
        return () => chrome.runtime.onMessage.removeListener(handler)
    }, [])

    // omni:summary 到达 → 也更新 chat wrapup item (lastEndedCallId 只适用于 voice)
    useEffect(() => {
        const handler = (msg: any) => {
            if (msg.type === 'omni:summary' && msg.data) {
                const convId = msg.data.sessionId
                const raw = msg.data.summary || msg.data
                if (!convId || !raw?.intent) return
                // 构造 CallSummary 格式
                const summaryData = {
                    callId: convId,
                    intent: raw.intent || '',
                    outcome: raw.outcome || '',
                    nextAction: raw.nextAction || raw.next_action || '',
                    entities: raw.entities || {},
                    sentiment: raw.sentiment || '',
                    rawSummary: raw.raw_summary || raw.rawSummary || '',
                }
                setWrapupQueue(q => q.map(w =>
                    w.id === convId
                        ? { ...w, summaryData, summaryLoading: false, summary: summaryData.rawSummary || `${summaryData.intent} — ${summaryData.outcome}` }
                        : w
                ))
            }
        }
        chrome.runtime.onMessage.addListener(handler)
        return () => chrome.runtime.onMessage.removeListener(handler)
    }, [])

    // summary 异常状态到达 → 精准停止对应 chat/voice wrapup item 的 loading 动画
    useEffect(() => {
        const handler = (msg: any) => {
            if (msg.type === 'call:summary_skipped' || msg.type === 'call:summary_not_enabled' || msg.type === 'omni:summary_timeout') {
                const callId = msg.data?.call_id || msg.data?.sessionId
                if (!callId) return
                setWrapupQueue(q => q.map(w =>
                    w.id === callId
                        ? {
                            ...w,
                            summaryLoading: false,
                            // @ts-ignore - added to ToolkitPanel.tsx WrapupItem next
                            summarySkipped: msg.type === 'call:summary_skipped',
                            // @ts-ignore
                            summaryTimedOut: msg.type === 'omni:summary_timeout',
                            // @ts-ignore
                            summaryNotEnabled: msg.type === 'call:summary_not_enabled'
                        }
                        : w
                ))
            }
        }
        chrome.runtime.onMessage.addListener(handler)
        return () => chrome.runtime.onMessage.removeListener(handler)
    }, [])

    // Chat resolve → 追加 wrapup
    useEffect(() => {
        const handler = (msg: any) => {
            // resolve_prompt (auto after reply) 或 conversation_resolved (手动 resolve)
            if ((msg.type === 'omni:resolve_prompt' || msg.type === 'omni:conversation_resolved') && msg.data?.conversationId) {
                const convId = msg.data.conversationId
                setWrapupQueue(q => {
                    const existing = q.find(w => w.id === convId)
                    if (existing && existing.status === 'pending') return q
                    // reopen 后再次 resolve — 重置 completed 项为 pending
                    if (existing) {
                        return q.map(w => w.id === convId ? {
                            ...w,
                            status: 'pending' as const,
                            endedAt: new Date().toISOString(),
                            summary: undefined,
                            summaryData: null,
                            summaryLoading: true,
                        } : w)
                    }
                    return [...q, {
                        id: convId,
                        type: 'chat' as const,
                        label: msg.data.visitorName || msg.data.channel || convId.slice(-6),
                        channel: msg.data.channel,
                        endedAt: new Date().toISOString(),
                        summary: undefined,
                        summaryData: null,
                        summaryLoading: true,
                        status: 'pending' as const,
                    }]
                })
                setToolkitOpen(true)
            }
        }
        chrome.runtime.onMessage.addListener(handler)
        return () => chrome.runtime.onMessage.removeListener(handler)
    }, [])

    const handleBootComplete = useCallback(() => {
        setShowBootScreen(false)
    }, [])

    // Helper: check inbox and compute badge state
    const checkInboxBadge = useCallback(async () => {
        if (!isModuleEnabled('inbox')) return
        try {
            const [syncRes, localRes] = await Promise.all([
                new Promise<{ apiUrl?: string }>((resolve) => chrome.storage.sync.get(["apiUrl"], (r) => resolve(r as any))),
                new Promise<{ token?: string }>((resolve) => chrome.storage.local.get(["token"], (r) => resolve(r as any)))
            ])
            if (!localRes.token) return
            const payload = decodeJWT(localRes.token)
            const agentId = payload?.agentId
            if (!agentId) return
            const apiUrl = syncRes.apiUrl || "http://localhost:3000"
            const res = await fetch(`${apiUrl}/api/conversations/inbox?agentId=${agentId}`, {
                headers: { Authorization: `Bearer ${localRes.token}` },
            })
            if (!res.ok) return
            const data = await res.json()
            const convs: any[] = data.data || []
            if (convs.length === 0) {
                setChatBadge('none')
                return
            }
            // Priority: assigned > unread > none
            // Only show badge when something needs agent attention
            const hasAssigned = convs.some((c: any) => c.status === 'assigned')
            if (hasAssigned) { setChatBadge('assigned'); return }
            const hasUnread = convs.some((c: any) => (c.unreadCount || 0) > 0)
            if (hasUnread) { setChatBadge('unread'); return }
            // Active conversations with no unread don't need a badge
            setChatBadge('none')
        } catch (e) { /* silent */ }
    }, [])

    // Listen for omni and auth events → re-check badge & handle forced logout
    useEffect(() => {
        const listener = (msg: any) => {
            if (msg.type === 'force_logout') {
                alert(`⚠️ Session Terminated\n\n${msg.reason || 'Your account has been deactivated.'}`);
                return;
            }
            if (msg.type === 'auth:identity_changed') {
                const reasonCode = msg.data?.reasonCode || 'unknown';
                const reasonText = t(`identity.${reasonCode}`);
                alert(`⚠️ ${reasonText}`);
                setTimeout(() => {
                    chrome.storage.local.remove(["token", "currentCall", "userProfile", "wrapupQueue"]);
                    window.location.reload();
                }, 5000);
                return;
            }
            if (msg.type === 'agent:group_changed') {
                // background.ts 已更新 chrome.storage.userProfile.groupIds
                // useAuth() 会自动重新读取 storage => myGroupIds 变更
                // groupIdsKey 变更 => B1 useEffect 会自动触发组名重新 fetch
                // 清空旧组未读计数
                setGroupChatUnread({})
                return;
            }

            // Defense-in-depth: if inbox is disabled, ignore all omni channel events
            if (msg.type.startsWith('omni:') && !isModuleEnabled('inbox')) {
                return;
            }

            if (msg.type === 'omni:customer_message' || msg.type === 'omni:new_conversation') {
                checkInboxBadge()
            }
            // Segmented Status Bar: 新会话到达 → 添加 slot + shake 3s
            if (msg.type === 'omni:new_conversation') {
                const convId = msg.data?.id || msg.data?._id || msg.data?.conversationId
                if (convId) {
                    setConvSlots(prev => {
                        if (prev.find(s => s.id === convId)) return prev
                        return [...prev, { id: convId, status: 'assigned', unread: 1 }]
                    })
                }
                // 同步更新 chatBadge/queueCount 供 ChatPanel 预览使用
                setQueueCount(prev => prev + 1)
                setChatBadge('assigned')
                setChatShaking(true)
                if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current)
                shakeTimerRef.current = setTimeout(() => setChatShaking(false), 3000)
            }
            // 会话被 accept → slot 状态改为 accepted, unread 清零
            if (msg.type === 'omni:conversation_accepted') {
                checkInboxBadge()
                const convId = msg.data?.conversationId || msg.data?._id
                if (convId) {
                    setConvSlots(prev => prev.map(s => s.id === convId ? { ...s, status: 'accepted' as const, unread: 0 } : s))
                }
            }
            // 新消息到达 → 非当前查看的会话递增 unread
            if (msg.type === 'omni:customer_message' || msg.type === 'omni:agent_message') {
                const cid = msg.data?.conversationId || msg.data?.channelId
                if (cid) setConvSlots(prev => prev.map(s => s.id === cid ? { ...s, unread: s.unread + 1 } : s))
            }
            // 会话 resolve → 移除 slot
            if (msg.type === 'omni:conversation_resolved') {
                checkInboxBadge()
                const convId = msg.data?.conversationId || msg.data?._id
                if (convId) {
                    setConvSlots(prev => prev.filter(s => s.id !== convId))
                }
            }
            if (msg.type === 'omni:queue_update' && msg.data?.queued !== undefined) {
                setQueueCount(msg.data.queued)
            }
            // Preemption: conversation was taken away
            if (msg.type === 'omni:conversation_preempted') {
                checkInboxBadge()
                chrome.notifications?.create?.({ type: 'basic', iconUrl: 'icon-128.png', title: '🔄 Conversation Preempted', message: msg.data?.reason || 'Higher priority conversation assigned', priority: 2 })
            }
            // Toxic alert for supervisors
            if (msg.type === 'omni:toxic_alert') {
                chrome.notifications?.create?.({ type: 'basic', iconUrl: 'icon-128.png', title: '🛡️ Toxic Content Detected', message: `Score: ${((msg.data?.toxicScore || 0) * 100).toFixed(0)}% — "${(msg.data?.text || '').slice(0, 60)}"`, priority: 2 })
            }
            // Urgent conversation: auto-switch to inbox
            if (msg.type === 'omni:new_conversation' && msg.data?.urgentLock) {
                setActiveTab('chat')
                setChatDeepNav('inbox')
            }
        }
        chrome.runtime.onMessage.addListener(listener)
        return () => chrome.runtime.onMessage.removeListener(listener)
    }, [checkInboxBadge])

    // On initial load: check inbox badge
    useEffect(() => {
        if (!apiInitialized || !isAuthenticated) return
        checkInboxBadge()
    }, [apiInitialized, isAuthenticated, checkInboxBadge])

    // Re-check badge when switching to chat tab (clears stale badges)
    useEffect(() => {
        if (activeTab === 'chat' && apiInitialized && isAuthenticated) {
            checkInboxBadge()
            setQueueCount(0)
        }
    }, [activeTab, apiInitialized, isAuthenticated, checkInboxBadge])

    // Tab change — supports deep navigation e.g. 'chat:inbox', 'me:schedule'
    const [chatDeepNav, setChatDeepNav] = useState<string | null>(null)
    const [meDeepNav, setMeDeepNav] = useState<string | null>(null)
    const handleTabChange = useCallback((tab: string) => {
        if (tab.includes(':')) {
            const [tabName, subView] = tab.split(':')
            setActiveTab(tabName)
            if (tabName === 'chat') setChatDeepNav(subView)
            else if (tabName === 'me') setMeDeepNav(subView)
        } else {
            setActiveTab(tab)
        }
    }, [])

    // Determine current engine status for BootScreen
    const authStatus = isAuthenticated ? "authenticated" : isLoading ? "loading" : "unauthenticated"
    const wsStatus = connected ? "connected" : connecting ? "connecting" : "disconnected"
    const apiStatus = apiInitialized ? "ready" : "loading"

    // Show BootScreen until initialization is complete (or explicit completion callback)
    // If showBootScreen is true, we overlay the boot screen.
    // We only unmount it when handleBootComplete is called by the component itself (after 100% progress)

    if (showBootScreen) {
        return (
            <BootScreen
                authStatus={authStatus}
                wsStatus={wsStatus}
                apiStatus={apiStatus}
                isDemoMode={DEMO_ENABLED && !!agentInfo?.isDemo}
                onComplete={handleBootComplete}
            />
        )
    }

    // Show login if not authenticated (and boot screen finished)
    if (!isAuthenticated) {
        return <LoginView />
    }

    // Aura状态class, 会随通话时长变化
    let auraClass = 'aura-idle'
    if (currentCall) {
        const callStart = new Date(currentCall.start_time).getTime()
        const elapsed = (Date.now() - callStart) / 1000
        if (elapsed > 600) auraClass = 'aura-call-hot'    // 10min+
        else if (elapsed > 300) auraClass = 'aura-call-warm' // 5min+
        else auraClass = 'aura-call'
    } else if (showBreather) {
        auraClass = 'aura-wrapup'
    }

    return (
        <div className={`side-panel ${auraClass}`} style={{ position: 'relative' }}>
            <Header />
            <TabBar activeTab={activeTab} onTabChange={handleTabChange} chatBadge={chatBadge} queueCount={queueCount} activeCallIndicator={!!currentCall} hasActiveCall={!!activeCallData} callStatus={activeCallData?.status} conversationSlots={convSlots} chatShaking={chatShaking} onToolkitToggle={() => setToolkitOpen(o => !o)} toolkitBadge={wrapupQueue.filter(w => w.status === 'pending').length + Object.values(groupChatUnread).reduce((a, b) => a + b, 0)} toolkitExpanded={toolkitOpen} />

            {/* Agent Toolkit — inline 展开, 推挤下方内容 */}
            {toolkitOpen && (
                <ToolkitPanel
                    open={toolkitOpen}
                    onClose={() => setToolkitOpen(false)}
                    wrapupQueue={wrapupQueue}
                    onWrapupComplete={(id) => setWrapupQueue(q => q.map(w => w.id === id ? { ...w, status: 'completed' as const } : w))}
                    groupChatMessages={chatMessages}
                    groupIds={myGroupIds}
                    groupNames={groupNames}
                    groupUnreadMap={groupChatUnread}
                    onGroupChatSend={(text, groupId) => {
                        if (!groupId) return

                        const tempId = `opt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                        addOptimisticChatMessage({
                            _id: tempId,
                            tempId: tempId,
                            channelId: `group:${groupId}`,
                            sender: { 
                                id: agentInfo?.agentId || agentInfo?.userId || 'me', 
                                name: agentInfo?.displayName || agentInfo?.name || 'Me', 
                                role: agentInfo?.role || 'agent'
                            },
                            content: { text },
                            createdAt: new Date().toISOString(),
                            type: 'internal'
                        });

                        chrome.runtime.sendMessage({
                            type: 'chat:send',
                            data: { tempId, recipientType: 'group', recipientId: groupId, content: { text }, messageType: 'internal' }
                        })
                    }}
                    onGroupChatSeen={handleChatTabGroupSeen}
                    coachMessages={[]}
                    postCallData={lastEndedCallId ? {
                        callId: lastEndedCallId,
                        callInfo: lastEndedCallInfo,
                        summary: callSummary,
                        summaryLoading: (summaryNotEnabled || summarySkipped) ? false : summaryLoading,
                        summaryTimedOut: summaryTimedOut,
                        summaryNotEnabled: summaryNotEnabled,
                        summarySkipped: summarySkipped,
                        outcome: callOutcome,
                        onDismiss: dismissSummary,
                        onSave: async (text) => {
                            try {
                                await fetchApi(`/api/agent-calls/sessions/${lastEndedCallId}/summary`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ summary: text }),
                                })
                            } catch (err) {
                                console.error('[SummaryCard] save failed:', err)
                            }
                        },
                        onWrapupComplete: () => {
                            setWrapupQueue(q => q.map(w => w.id === lastEndedCallId ? { ...w, status: 'completed' as const } : w))
                            dismissSummary()
                            // 通知 PiP 关闭
                            chrome.runtime.sendMessage({ type: 'sidepanel:wrapupComplete' }).catch(() => { })
                        },
                        onOutcomeSelect: (oc: string) => {
                            setWrapupQueue(q => q.map(w =>
                                w.id === lastEndedCallId ? { ...w, agentOutcome: oc } : w
                            ))
                        },
                    } : undefined}
                    forceTab={lastEndedCallId ? 'wrapup' : (Object.values(groupChatUnread).reduce((a, b) => a + b, 0) > 0 ? 'messages' : undefined)}
                />
            )}

            {/* ① 全局 Toast：通话结束轻量提示，悬浮在 TabBar 正上方，不阻断操作 */}
            {showBreather && (
                <div style={{
                    position: 'absolute', bottom: 56, left: 0, right: 0,
                    zIndex: 200, pointerEvents: 'none',
                }}>
                    <div style={{ pointerEvents: 'auto' }}>
                        <PostCallBreather
                            duration={lastCallDuration}
                            consecutiveCalls={callCount}
                            complianceScore={
                                completedComplianceItems.length > 0 && complianceItems.length > 0
                                    ? Math.round((completedComplianceItems.length / complianceItems.length) * 100)
                                    : undefined
                            }
                            onDismiss={() => setShowBreather(false)}
                        />
                    </div>
                </div>
            )}



            <div className="side-panel-body relative overflow-hidden">
                <AnimatePresence mode="wait">
                    {activeTab === "home" ? (
                        <PageTransition key="home" mode="slide">
                            <HomeDashboard
                                hasActiveCall={!!activeCallData}
                                callCount={callCount}
                                onNavigate={handleTabChange}
                            />
                            {(role === 'supervisor' || role === 'admin') && (
                                <MonitorPanel />
                            )}
                        </PageTransition>
                    ) : activeTab === "current" ? (
                        <PageTransition key="current" mode="slide">
                            <div ref={containerRef as any} className="current-tab flex-col" style={{ display: "flex", gap: 12 }}>
                                {currentCall ? (
                                    <>
                                        {/* CallStage 始终置顶 */}
                                        <CallStage call={currentCall} />

                                        {/* Quality Warning — 全宽 */}
                                        {(() => {
                                            const warning = getWorstQuality(callQuality);
                                            if (!warning) return null;
                                            return (
                                                <div style={{ padding: '8px 12px', background: 'rgba(255, 60, 60, 0.1)', color: '#ff4d4d', border: '1px solid rgba(255, 60, 60, 0.2)', borderRadius: 8, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8, margin: '0 8px' }}>
                                                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{warning.desc}</div>
                                                        <div style={{ opacity: 0.8, fontSize: '0.75rem' }}>MOS: {warning.mos.toFixed(1)} — Audio may drop or delay</div>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* 统一布局: 宽屏 master-detail，窄屏堆叠 — 不做条件卸载，用 display 切换避免 remount */}
                                        <div className={`chat-thread-body ${isWide ? 'wide' : ''}`} style={{ flex: 1 }}>
                                            {/* 主内容区 */}
                                            <div className="chat-main" style={{ padding: 8 }}>
                                                {/* 宽屏: ASR 占据主内容区 */}
                                                <div style={{ display: isWide ? 'block' : 'none' }}>
                                                    {currentCall && <AsrStatusBar asrInfo={asrInfo} callId={currentCall.call_id} />}
                                                    {effectiveAsrEnabled && <TranscriptionList
                                                        transcriptions={transcriptions}
                                                        pipSupported={!settings.enablePIP}
                                                        pipOpen={false}
                                                        onPopOut={() => openPiP()}
                                                    />}
                                                </div>

                                                {/* 窄屏: 所有 widget 堆叠在一列 */}
                                                <div style={{ display: isWide ? 'none' : 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {/* 1. Context Brief 或 Internal Notice */}
                                                    {(() => {
                                                        const callerNum = (currentCall.caller || '').replace(/sip:|@.*/g, '');
                                                        const isCallerMe = !!(agentInfo?.sipNumber && callerNum === agentInfo.sipNumber);
                                                        const targetId = (isCallerMe ? currentCall.callee : currentCall.caller || '').replace(/sip:|@.*/g, '');
                                                        const targetType = isCallerMe ? (currentCall as any).callee_type : (currentCall as any).caller_type;
                                                        const isInternal = targetType === 'agent';

                                                        return isInternal ? null : (
                                                            <>
                                                                <CallerContext360
                                                                    callerId={targetId}
                                                                    callerName={targetId}
                                                                    activeCallId={currentCall.call_id}
                                                                    contextBrief={contextBrief}
                                                                />
                                                                {crmData && (
                                                                    <CollapsibleWidget
                                                                        title={`CRM: ${crmData.provider || 'CRM'}`}
                                                                        icon={<span>🔍</span>}
                                                                        collapsedHint={`${crmData.contact?.name || ''} · ${crmData.account?.healthScore || ''}`}
                                                                        badge={crmData.account?.healthScore}>
                                                                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.75rem' }}>
                                                                            {crmData.contact?.name && <span>Name: <b>{crmData.contact.name}</b></span>}
                                                                            {crmData.account?.healthScore && <span>Health: <b style={{ color: crmData.account.healthScore === 'Critical' || crmData.account.healthScore === 'At Risk' ? 'var(--danger)' : 'var(--success)' }}>{crmData.account.healthScore}</b></span>}
                                                                            {crmData.account?.ltv && <span>LTV: <b style={{ color: 'var(--success)' }}>{crmData.account.ltv}</b></span>}
                                                                            {crmData.account?.openTickets != null && <span>Tickets: <b>{crmData.account.openTickets}</b></span>}
                                                                        </div>
                                                                    </CollapsibleWidget>
                                                                )}
                                                            </>
                                                        );
                                                    })()}

                                                    {/* 2b. SOP Guide */}
                                                    <SOPGuidePanel callId={currentCall.call_id} />

                                                    {/* 3. Live Transcript — 组件自带标题栏 */}
                                                    {currentCall && <AsrStatusBar asrInfo={asrInfo} callId={currentCall.call_id} />}
                                                    {effectiveAsrEnabled && <TranscriptionList
                                                        transcriptions={transcriptions}
                                                        pipSupported={!settings.enablePIP}
                                                        pipOpen={false}
                                                        onPopOut={() => openPiP()}
                                                    />}

                                                    {/* 4. AI Suggestions */}
                                                    {assistantEnabled ? (
                                                        <SuggestionsPanel suggestions={suggestions} isVoice={true} callId={currentCall.call_id} />
                                                    ) : (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.12)', color: 'var(--text-muted, #94a3b8)' }}>
                                                            <span style={{ fontSize: '0.8rem' }}>🤖</span>
                                                            <span>{t('copilot.assistantNotEnabled', 'AI Assistant not enabled')}</span>
                                                        </div>
                                                    )}

                                                    {/* 5. Action Drafts */}
                                                    {isModuleEnabled('action_center') && <ActionList callId={currentCall.call_id} />}

                                                    {/* 6. Compliance Coach — 固定最底部 */}
                                                    {complianceItems.length > 0 && (
                                                        <ComplianceList items={complianceItems} completedItems={completedComplianceItems} />
                                                    )}
                                                </div>
                                            </div>

                                            {/* 宽屏: 右侧卡片边栏 — display 切换, 不做条件卸载 */}
                                            <div style={{ display: isWide ? 'flex' : 'none' }}>
                                                <CopilotSidebar>
                                                    <CopilotSidebar.Brief>
                                                        {(() => {
                                                            const callerNum = (currentCall.caller || '').replace(/sip:|@.*/g, '');
                                                            const isCallerMe = !!(agentInfo?.sipNumber && callerNum === agentInfo.sipNumber);
                                                            const targetId = (isCallerMe ? currentCall.callee : currentCall.caller || '').replace(/sip:|@.*/g, '');
                                                            const targetType = isCallerMe ? (currentCall as any).callee_type : (currentCall as any).caller_type;
                                                            const isInternal = targetType === 'agent';

                                                            return isInternal ? null : (
                                                                <CallerContext360
                                                                    callerId={targetId}
                                                                    callerName={targetId}
                                                                    activeCallId={currentCall.call_id}
                                                                    contextBrief={contextBrief}
                                                                />
                                                            );
                                                        })()}
                                                    </CopilotSidebar.Brief>

                                                    <CopilotSidebar.Crm data={crmData} />

                                                    {/* SOP Guide */}
                                                    <SOPGuidePanel callId={currentCall.call_id} />

                                                    {assistantEnabled && <CopilotSidebar.Suggestions>
                                                        <SuggestionsPanel suggestions={suggestions} isVoice={true} callId={currentCall.call_id} />
                                                    </CopilotSidebar.Suggestions>}

                                                    <CopilotSidebar.Actions>
                                                        {isModuleEnabled('action_center') && <ActionList callId={currentCall.call_id} />}
                                                    </CopilotSidebar.Actions>

                                                    {/* 通话刚接通时显示空状态 */}
                                                    {!crmData && suggestions.length === 0 && complianceItems.length === 0 && (
                                                        <CopilotSidebar.EmptyState />
                                                    )}

                                                    <CopilotSidebar.Compliance items={complianceItems} completed={completedComplianceItems} />
                                                </CopilotSidebar>
                                            </div>
                                        </div>
                                    </>
                                ) : (lastEndedCallId || transcriptions.length > 0 || suggestions.length > 0) ? (
                                    // 通话结束后回顾模式
                                    <>
                                        {/* 统一布局: 宽屏 master-detail */}
                                        <div className={`chat-thread-body ${isWide ? 'wide' : ''}`} style={{ flex: 1 }}>
                                            <div className="chat-main" style={{ padding: 8 }}>
                                                {/* 窄屏: 回顾模式卡片 */}
                                                {!isWide ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        {/* 1. Context Brief — 组件自带标题栏 */}
                                                        {(() => {
                                                            const info = lastEndedCallInfo as any;
                                                            const callerNum = (info?.caller || '').replace(/sip:|@.*/g, '');
                                                            const isCallerMe = !!(agentInfo?.sipNumber && callerNum === agentInfo.sipNumber);
                                                            const targetType = isCallerMe ? info?.callee_type : info?.caller_type;
                                                            const isInternal = targetType === 'agent';
                                                            const targetId = (isCallerMe ? (info?.callee || '') : (info?.caller || '')).replace(/sip:|@.*/g, '');

                                                            return isInternal ? null : (
                                                                <>
                                                                    <CallerContext360
                                                                        callerId={targetId}
                                                                        callerName={targetId}
                                                                        activeCallId={'review-mode'}
                                                                        contextBrief={contextBrief}
                                                                    />
                                                                    {crmData && (
                                                                        <CollapsibleWidget
                                                                            title={`CRM: ${crmData.provider || 'CRM'}`}
                                                                            icon={<span>🔍</span>}
                                                                            collapsedHint={`${crmData.contact?.name || ''} · ${crmData.account?.healthScore || ''}`}>
                                                                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.75rem' }}>
                                                                                {crmData.contact?.name && <span>Name: <b>{crmData.contact.name}</b></span>}
                                                                                {crmData.account?.healthScore && <span>Health: <b>{crmData.account.healthScore}</b></span>}
                                                                                {crmData.account?.ltv && <span>LTV: <b>{crmData.account.ltv}</b></span>}
                                                                                {crmData.account?.openTickets != null && <span>Tickets: <b>{crmData.account.openTickets}</b></span>}
                                                                            </div>
                                                                        </CollapsibleWidget>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}

                                                        {/* 3. Transcript — 组件自带标题栏 */}
                                                        {asrEnabled && <TranscriptionList
                                                            transcriptions={transcriptions}
                                                            pipSupported={false}
                                                            pipOpen={false}
                                                            onPopOut={undefined}
                                                        />}

                                                        {/* 4. Suggestions + Actions */}
                                                        {assistantEnabled && <SuggestionsPanel suggestions={suggestions} readOnly={true} isVoice={true} callId={lastEndedCallId || undefined} />}
                                                        {lastEndedCallId && isModuleEnabled('action_center') && <ActionList callId={lastEndedCallId} />}

                                                        {/* 5. Compliance */}
                                                        {complianceItems.length > 0 && (
                                                            <ComplianceList items={complianceItems} completedItems={completedComplianceItems} />
                                                        )}
                                                    </div>
                                                ) : (
                                                    /* 宽屏: ASR 占主内容区 */
                                                    <div style={{ marginTop: 8 }}>
                                                        <TranscriptionList
                                                            transcriptions={transcriptions}
                                                            pipSupported={false}
                                                            pipOpen={false}
                                                            onPopOut={undefined}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* 宽屏: 右侧卡片 */}
                                            {isWide && (
                                                <CopilotSidebar>
                                                    <CopilotSidebar.Brief>
                                                        {(() => {
                                                            const info = lastEndedCallInfo as any;
                                                            const callerNum = (info?.caller || '').replace(/sip:|@.*/g, '');
                                                            const isCallerMe = !!(agentInfo?.sipNumber && callerNum === agentInfo.sipNumber);
                                                            const targetType = isCallerMe ? info?.callee_type : info?.caller_type;
                                                            const isInternal = targetType === 'agent';
                                                            const targetId = (isCallerMe ? (info?.callee || '') : (info?.caller || '')).replace(/sip:|@.*/g, '');

                                                            return isInternal ? null : (
                                                                <CallerContext360
                                                                    callerId={targetId}
                                                                    callerName={targetId}
                                                                    activeCallId={'review-mode'}
                                                                    contextBrief={contextBrief}
                                                                />
                                                            );
                                                        })()}
                                                    </CopilotSidebar.Brief>

                                                    <CopilotSidebar.Crm data={crmData} />

                                                    {assistantEnabled && <CopilotSidebar.Suggestions>
                                                        <SuggestionsPanel suggestions={suggestions} readOnly={true} isVoice={true} callId={lastEndedCallId || undefined} />
                                                    </CopilotSidebar.Suggestions>}

                                                    <CopilotSidebar.Actions>
                                                        {lastEndedCallId && isModuleEnabled('action_center') && <ActionList callId={lastEndedCallId} />}
                                                    </CopilotSidebar.Actions>

                                                    <CopilotSidebar.Compliance items={complianceItems} completed={completedComplianceItems} />
                                                </CopilotSidebar>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 12, color: 'var(--text-muted)' }}>
                                        <button
                                            onClick={() => handleTabChange('me:history')}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            title="View History"
                                        >
                                            <Phone size={32} style={{ opacity: 0.2, color: 'var(--text-muted)' }} />
                                        </button>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>No active call</div>
                                        <div style={{ fontSize: '0.72rem', textAlign: 'center', lineHeight: 1.5 }}>
                                            Ready for your next call.<br />Browse recent calls and chats below.
                                        </div>
                                        <button
                                            onClick={() => handleTabChange('me:history')}
                                            style={{
                                                marginTop: 8, padding: '6px 16px', borderRadius: 8,
                                                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                                color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 600,
                                                cursor: 'pointer', fontFamily: 'inherit',
                                            }}
                                        >
                                            {t('tabs.viewHistory')}
                                        </button>
                                    </div>
                                )}

                            </div>
                        </PageTransition>
                    ) : activeTab === "chat" ? (
                        <PageTransition key="chat" mode="slide">
                            {isModuleEnabled('inbox') ? (
                                <InboxPanel onBack={() => handleTabChange('home')} omniComplianceItems={omniComplianceItems} omniCompletedComplianceItems={omniCompletedComplianceItems} omniComplianceConvId={omniComplianceConvId} />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                                    <div>Inbox module is not enabled for your account.</div>
                                </div>
                            )}
                        </PageTransition>
                    ) : activeTab === "me" ? (
                        <PageTransition key="me" mode="slide">
                            <MeTab onTestSummary={triggerMockSummary} initialView={meDeepNav} onInitialViewConsumed={() => setMeDeepNav(null)} />
                        </PageTransition>
                    ) : null}
                </AnimatePresence>
            </div>

        </div >
    )
}

export default SidePanel
