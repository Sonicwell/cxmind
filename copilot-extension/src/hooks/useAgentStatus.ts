import { useState, useEffect, useCallback, useRef } from "react"
import { useApi } from "./useApi"
import { useAuth } from "./useAuth"
import { useMessageBus } from "./useMessageBus"

interface AgentStatus {
    id: string
    label: string
    type: string
    color: string
    isSystem?: boolean
}

const COLOR_MAP: Record<string, string> = {
    green: "#22c55e",
    orange: "#f59e0b",
    yellow: "#eab308",
    red: "#ef4444",
    gray: "#6b7280",
    blue: "#3b82f6",
    purple: "#8b5cf6",
    cyan: "#06b6d4",
    "#ff6b35": "#ff6b35",   // wrapup custom color
}

/** 系统专用status, dropdown不展示 */
const SYSTEM_ONLY = new Set(["ring", "oncall", "onhold", "wrapup", "working", "busy", "offline"])

const DEBOUNCE_MS = 3000

const DEFAULT_STATUSES: AgentStatus[] = [
    { id: "available", label: "Available", type: "available", color: "green" },
    { id: "away", label: "Away", type: "away", color: "orange" },
    { id: "break", label: "Break", type: "away", color: "purple" },
    { id: "dnd", label: "Do Not Disturb", type: "dnd", color: "red" },
]

export function useAgentStatus() {
    const { fetchApi, hasToken, isInitialized } = useApi()
    const { agentInfo } = useAuth()
    const [statuses, setStatuses] = useState<AgentStatus[]>(DEFAULT_STATUSES)
    const [currentStatus, setCurrentStatus] = useState<string>("available")
    const [callStatus, setCallStatus] = useState<string>("idle")
    const [bizStatus, setBizStatus] = useState<string>("available")
    const [isLoading, setIsLoading] = useState(false)
    const loadedRef = useRef(false)
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingStatusRef = useRef<string | null>(null)

    // Load statuses + current status on mount
    useEffect(() => {
        if (!hasToken || !isInitialized || loadedRef.current) return
        loadedRef.current = true

        const load = async () => {
            try {
                const [statusList, current] = await Promise.all([
                    fetchApi<AgentStatus[]>("/api/agent/statuses"),
                    fetchApi<{ status: string; bizStatus?: string; callStatus?: string }>("/api/agent/current-status"),
                ])
                if (statusList && statusList.length > 0) {
                    setStatuses(statusList)
                }
                setCurrentStatus(current.status || "available")

                // Read local storage to prevent server's default 'available' from overwriting local cached bizStatus on reconnect
                chrome.storage.local.get(["cachedBizStatus"], (result) => {
                    const localCached = result.cachedBizStatus as string | undefined;
                    const serverBiz = current.bizStatus;

                    let resolvedBiz = "available";
                    // If server actually has a meaningful state (offline persistence, or crash recovery)
                    if (serverBiz && serverBiz !== "offline" && serverBiz !== "available") {
                        resolvedBiz = serverBiz;
                    }
                    // Otherwise trust the client's local cache from before disconnect
                    else if (localCached && localCached !== "available") {
                        resolvedBiz = localCached;
                    }

                    setBizStatus(resolvedBiz);
                    // Only write if it changed to prevent redundant storage events and keep the valid state
                    chrome.storage.local.set({ cachedBizStatus: resolvedBiz });

                    // 首次连接立即同步到 AS, 不走 debounce, 消除 Dashboard 真空窗口
                    fetchApi("/api/agent/status", {
                        method: "PUT",
                        body: JSON.stringify({ availabilityStatus: resolvedBiz }),
                    }).catch(() => {});
                });

                setCallStatus(current.callStatus || "idle")
            } catch (err) {
                console.error("Failed to load agent statuses:", err)
            } finally {
                setIsLoading(false)
            }
        }
        load()
    }, [hasToken, isInitialized, fetchApi])

    // server-push status 变更
    useMessageBus('agent:status_change', (message) => {
        if (!message?.data) return
        // 后端 emitAndLog 传的 agentId 是 Agent._id, JWT 中对应字段也是 agentId
        const myAgentId = (agentInfo as any)?.agentId
        if (myAgentId && message.data.agentId !== myAgentId) return
        const { status, bizStatus: biz, callStatus: call } = message.data
        if (status) setCurrentStatus(status)
        if (biz) {
            setBizStatus(biz)
            chrome.storage.local.set({ cachedBizStatus: biz })
        }
        if (call) setCallStatus(call)
    })

    /**
     * 改bizStatus, 3s debounce. UI先变, API延后发.
     * debounce窗口内只发最后一次.
     */
    const updateStatus = useCallback(
        (statusId: string) => {
            // Reject system-only statuses from manual selection
            if (SYSTEM_ONLY.has(statusId)) return

            // Optimistic local update
            setBizStatus(statusId)
            // Persist to storage for reconnect re-sync
            chrome.storage.local.set({ cachedBizStatus: statusId })
            // If not in a call, display status follows bizStatus
            if (callStatus === "idle") {
                setCurrentStatus(statusId)
            }

            // Immediately broadcast a local status change event so LiveFeed picks it up
            const statusLabel = statuses.find(s => s.id === statusId)?.label || statusId
            chrome.runtime.sendMessage({
                type: "agent:status_change",
                data: {
                    agentId: agentInfo?.userId || "",
                    status: statusId,
                    bizStatus: statusId,
                    callStatus: callStatus,
                    displayName: agentInfo?.displayName || "Agent",
                    metadata: {
                        displayName: agentInfo?.displayName || "Agent",
                        sipNumber: agentInfo?.sipNumber || "",
                    },
                    timestamp: new Date().toISOString(),
                }
            }).catch(() => { /* sidepanel may not be listening */ })

            // Cancel any pending debounce
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
            }
            pendingStatusRef.current = statusId

            // Fire after debounce
            debounceTimerRef.current = setTimeout(async () => {
                const finalStatus = pendingStatusRef.current
                if (!finalStatus) return
                pendingStatusRef.current = null

                try {
                    await fetchApi("/api/agent/status", {
                        method: "PUT",
                        body: JSON.stringify({
                            availabilityStatus: finalStatus,
                            changedAt: new Date().toISOString(),
                        }),
                    })
                } catch (err) {
                    console.error("Failed to update status:", err)
                }
            }, DEBOUNCE_MS)
        },
        [fetchApi, callStatus, statuses, agentInfo]
    )

    // unmount清debounce timer
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
            }
        }
    }, [])

    // Resolve hex color from status id
    const getStatusColor = useCallback(
        (statusId: string): string => {
            const s = statuses.find((s) => s.id === statusId)
            const colorName = s?.color || "gray"
            return COLOR_MAP[colorName] || colorName
        },
        [statuses]
    )

    /**
     * dropdown选项, 过滤掉系统专用status
     */
    const dropdownStatuses = statuses.filter((s) => !SYSTEM_ONLY.has(s.id))

    /** header圆点显示的status, oncall时被callStatus覆盖 */
    const displayStatus = callStatus !== "idle" ? callStatus : currentStatus

    return {
        statuses,
        dropdownStatuses,
        currentStatus,
        displayStatus,
        bizStatus,
        callStatus,
        isLoading,
        updateStatus,
        getStatusColor,
    }
}
