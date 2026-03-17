import { useState, useCallback, useRef } from "react"
import { useApi } from "./useApi"

export interface ActivityItem {
    type: 'call' | 'chat'
    id: string
    startTime: string
    endTime?: string
    displayName: string
    channel: string               // 'voice' | 'webchat' | 'whatsapp' | ...
    duration: number              // seconds
    direction: string             // 'inbound' | 'outbound' | ''
    status: string                // call status or resolution_status
    outcome: string               // success/failure/follow_up or resolveReason
    messageCount: number          // chat only
    summaryPreview: string        // 1-line AI summary
}

export interface ContactMini {
    id: string
    name: string
    avatar?: string
    company?: string
    tier: 'standard' | 'premium' | 'vip'
    tags: string[]
    verified: boolean
}

export interface ContactGroup {
    contactNumber: string
    contact?: ContactMini         // batch-lookup 后填充
    callCount: number
    chatCount: number
    totalDuration: number
    successCount: number
    missedCount: number
    totalMessages: number
    latestTime: string
    latestSummary: string
    // 展开明细（lazy loaded）
    expanded: boolean
    detailItems?: ActivityItem[]
    detailLoading: boolean
}

interface ActivityStats {
    totalCalls: number
    totalChats: number
    missedToday: number
}

export type TypeFilter = 'all' | 'call' | 'chat'
export type ViewMode = 'grouped' | 'timeline'

const PAGE_SIZE = 20

export function useActivityHistory() {
    const { fetchApi, isInitialized } = useApi()

    // 视图模式
    const [viewMode, setViewMode] = useState<ViewMode>('grouped')

    // grouped 视图 state
    const [groups, setGroups] = useState<ContactGroup[]>([])
    const [groupsTotal, setGroupsTotal] = useState(0)
    const [hasMoreGroups, setHasMoreGroups] = useState(true)
    const groupOffsetRef = useRef(0)

    // timeline 视图 state (保持既有兼容)
    const [items, setItems] = useState<ActivityItem[]>([])
    const [hasMore, setHasMore] = useState(true)
    const offsetRef = useRef(0)

    // 共享 state
    const [stats, setStats] = useState<ActivityStats>({ totalCalls: 0, totalChats: 0, missedToday: 0 })
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
    const [search, setSearch] = useState('')

    // ── batch-lookup 联系人解析 ──────────────────────────────────────
    const batchLookupContacts = useCallback(async (contactNumbers: string[]) => {
        if (contactNumbers.length === 0) return {}
        try {
            const res = await fetchApi<{ contacts: Record<string, ContactMini> }>(
                '/api/contacts/batch-lookup',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phones: contactNumbers }),
                }
            )
            return res.contacts || {}
        } catch {
            return {}
        }
    }, [fetchApi])

    // ── Grouped 视图加载 ─────────────────────────────────────────────
    const loadGrouped = useCallback(
        async (reset = false) => {
            if (isLoading || !isInitialized) return
            const offset = reset ? 0 : groupOffsetRef.current
            setIsLoading(true)
            setError(null)

            try {
                const params = new URLSearchParams({
                    view: 'grouped',
                    limit: String(PAGE_SIZE),
                    offset: String(offset),
                    type: typeFilter,
                })
                if (search) params.set('search', search)

                const response = await fetchApi<{
                    groups: any[]
                    stats: ActivityStats
                    total: number
                }>(`/api/agent/activity-history?${params}`)

                const newGroups: ContactGroup[] = (response.groups || []).map((g: any) => ({
                    contactNumber: g.contactNumber,
                    callCount: g.callCount || 0,
                    chatCount: g.chatCount || 0,
                    totalDuration: g.totalDuration || 0,
                    successCount: g.successCount || 0,
                    missedCount: g.missedCount || 0,
                    totalMessages: g.totalMessages || 0,
                    latestTime: g.latestTime,
                    latestSummary: g.latestSummary || '',
                    expanded: false,
                    detailLoading: false,
                }))

                groupOffsetRef.current = offset + newGroups.length
                const allGroups = reset ? newGroups : [...groups, ...newGroups]
                setGroups(allGroups)
                setStats(response.stats || stats)
                setGroupsTotal(response.total || 0)
                setHasMoreGroups(newGroups.length >= PAGE_SIZE)
                setIsLoading(false)

                // batch-lookup 联系人
                const uniqueNumbers = [...new Set(allGroups.map(g => g.contactNumber).filter(Boolean))]
                const contactMap = await batchLookupContacts(uniqueNumbers)
                if (Object.keys(contactMap).length > 0) {
                    setGroups(prev => prev.map(g => ({
                        ...g,
                        contact: contactMap[g.contactNumber] || g.contact,
                    })))
                }
            } catch (err: any) {
                setIsLoading(false)
                setError(err.message || 'Failed to load activity groups')
            }
        },
        [fetchApi, isLoading, typeFilter, search, isInitialized, groups, stats, batchLookupContacts]
    )

    // ── 展开某联系人的明细 ────────────────────────────────────────────
    const toggleGroupExpand = useCallback(
        async (contactNumber: string) => {
            setGroups(prev => prev.map(g => {
                if (g.contactNumber !== contactNumber) return g
                // 折叠
                if (g.expanded) return { ...g, expanded: false }
                // 已有明细数据，展开
                if (g.detailItems) return { ...g, expanded: true }
                // 首次展开，触发加载
                return { ...g, expanded: true, detailLoading: true }
            }))

            // 查找是否需要加载
            const group = groups.find(g => g.contactNumber === contactNumber)
            if (group?.detailItems || !group) return

            try {
                const params = new URLSearchParams({
                    view: 'timeline',
                    contact: contactNumber,
                    limit: '50',
                    type: typeFilter,
                })
                const response = await fetchApi<{ data: ActivityItem[] }>(
                    `/api/agent/activity-history?${params}`
                )
                setGroups(prev => prev.map(g => {
                    if (g.contactNumber !== contactNumber) return g
                    return { ...g, detailItems: response.data || [], detailLoading: false }
                }))
            } catch {
                setGroups(prev => prev.map(g => {
                    if (g.contactNumber !== contactNumber) return g
                    return { ...g, detailItems: [], detailLoading: false }
                }))
            }
        },
        [fetchApi, groups, typeFilter]
    )

    // ── Timeline 视图加载（保持原有逻辑）─────────────────────────────
    const loadTimeline = useCallback(
        async (reset = false) => {
            if (isLoading || !isInitialized) return
            const offset = reset ? 0 : offsetRef.current
            setIsLoading(true)
            setError(null)

            try {
                const params = new URLSearchParams({
                    view: 'timeline',
                    limit: String(PAGE_SIZE),
                    offset: String(offset),
                    type: typeFilter,
                })
                if (search) params.set('search', search)

                const response = await fetchApi<{
                    data: ActivityItem[]
                    stats: ActivityStats
                    total: number
                }>(`/api/agent/activity-history?${params}`)

                const newItems = response.data || []
                offsetRef.current = offset + newItems.length

                setItems(reset ? newItems : [...items, ...newItems])
                setStats(response.stats || stats)
                setHasMore(newItems.length >= PAGE_SIZE)
                setIsLoading(false)
            } catch (err: any) {
                setIsLoading(false)
                setError(err.message || 'Failed to load activity history')
            }
        },
        [fetchApi, isLoading, typeFilter, search, isInitialized, items, stats]
    )

    // ── 统一 loadMore 入口 ─────────────────────────────────────────
    const loadMore = useCallback(
        (reset = false) => {
            if (viewMode === 'grouped') return loadGrouped(reset)
            return loadTimeline(reset)
        },
        [viewMode, loadGrouped, loadTimeline]
    )

    const refresh = useCallback(() => {
        groupOffsetRef.current = 0
        offsetRef.current = 0
        loadMore(true)
    }, [loadMore])

    const updateFilter = useCallback((filter: TypeFilter) => {
        setTypeFilter(filter)
        groupOffsetRef.current = 0
        offsetRef.current = 0
    }, [])

    const updateSearch = useCallback((q: string) => {
        setSearch(q)
        groupOffsetRef.current = 0
        offsetRef.current = 0
    }, [])

    const switchView = useCallback((mode: ViewMode) => {
        setViewMode(mode)
        // 切换视图时重置对应的 offset
        if (mode === 'grouped') groupOffsetRef.current = 0
        else offsetRef.current = 0
    }, [])

    return {
        // 视图模式
        viewMode,
        switchView,
        // grouped 视图
        groups,
        groupsTotal,
        hasMoreGroups,
        toggleGroupExpand,
        // timeline 视图
        items,
        hasMore,
        // 共享
        stats,
        isLoading,
        error,
        isInitialized,
        typeFilter,
        search,
        setTypeFilter: updateFilter,
        setSearch: updateSearch,
        loadMore,
        refresh,
    }
}
