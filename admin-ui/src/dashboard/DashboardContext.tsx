import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../services/api';
import { formatUTCToLocal } from '../utils/date';
import type {
    DashboardData, Stats, ChartData, MOSDistribution,
    CodecInfo, TrendPoint, GeoItem, WorstCall, LiveCall,
    AgentStatusCounts, OutcomeStats, OutcomeTrendPoint, OutcomeByBucket,
    TopCloserEntry, AICostROI, ROISummary, BehaviorSnapshot, EmotionSnapshot,
    EmotionAlert, BurnoutAlert, ToxicAlert, DirectionalStats, DataGroup,
} from './types';
import { COUNTRY_NAME_TO_ISO } from './helpers';
import { useWebSocket } from '../context/WebSocketContext';
import { useDemoMode } from '../hooks/useDemoMode';
import { WIDGET_MAP } from './widget-registry';

// ─── 5-way context split: 各group独立useMemo, 变化互不传播 ───

interface CoreSlice {
    stats: Stats | null;
    chartData: ChartData | null;
    overviewLoading: boolean;
    totalCalls24h: number;
    avgDuration: number | null;
    liveCount: number;
    geoCountSet: Set<string>;
    directionalStats: DirectionalStats | null;
    hours: number;
    setHours: (h: number) => void;
    groupIds: string[];
    setGroupIds: (ids: string[]) => void;
    demoMode: boolean;
    setDemoMode: (on: boolean) => void;
    refreshAll?: () => void;
}

interface QualitySlice {
    mosDist: MOSDistribution | null;
    codecData: CodecInfo[];
    trends: TrendPoint[];
    geoMedia: GeoItem[];
    worstCalls: WorstCall[];
    qualityLoading: boolean;
}

interface LiveSlice {
    liveCalls: LiveCall[];
    opsAgentCounts?: AgentStatusCounts;
}

interface AnalyticsSlice {
    outcomeStats: OutcomeStats | null;
    outcomeLoading: boolean;
    outcomeTrends: OutcomeTrendPoint[];
    outcomeByQuality: OutcomeByBucket[];
    outcomeByDuration: OutcomeByBucket[];
    outcomeBySentiment: OutcomeByBucket[];
    outcomeByTalkPattern: OutcomeByBucket[];
    topClosers: TopCloserEntry[];
    aiCostROI: AICostROI | null;
    roiSummary: ROISummary | null;
}

interface RealtimeSlice {
    stressMap: Map<string, BehaviorSnapshot>;
    emotionMap: Map<string, EmotionSnapshot>;
    emotionAlerts: EmotionAlert[];
    burnoutAlerts: BurnoutAlert[];
    toxicAlerts: ToxicAlert[];
}

const CoreCtx = createContext<CoreSlice | null>(null);
const QualityCtx = createContext<QualitySlice | null>(null);
const LiveCtx = createContext<LiveSlice | null>(null);
const AnalyticsCtx = createContext<AnalyticsSlice | null>(null);
const RealtimeCtx = createContext<RealtimeSlice | null>(null);

// ─── Selector hooks: 消费者只订阅需要的数据分组 ───

export function useDashboardCore(): CoreSlice {
    const ctx = useContext(CoreCtx);
    if (!ctx) throw new Error('useDashboardCore must be used inside DashboardProvider');
    return ctx;
}
export function useDashboardQuality(): QualitySlice {
    const ctx = useContext(QualityCtx);
    if (!ctx) throw new Error('useDashboardQuality must be used inside DashboardProvider');
    return ctx;
}
export function useDashboardLive(): LiveSlice {
    const ctx = useContext(LiveCtx);
    if (!ctx) throw new Error('useDashboardLive must be used inside DashboardProvider');
    return ctx;
}
export function useDashboardAnalytics(): AnalyticsSlice {
    const ctx = useContext(AnalyticsCtx);
    if (!ctx) throw new Error('useDashboardAnalytics must be used inside DashboardProvider');
    return ctx;
}
export function useDashboardRealtime(): RealtimeSlice {
    const ctx = useContext(RealtimeCtx);
    if (!ctx) throw new Error('useDashboardRealtime must be used inside DashboardProvider');
    return ctx;
}

// ─── Façade: 向后兼容, 聚合全部 slice ───
// 注意: 消费全部字段意味着任何group变化都触发re-render, 新代码应用selector hooks
export function useDashboard(): DashboardData {
    const core = useContext(CoreCtx);
    const quality = useContext(QualityCtx);
    const live = useContext(LiveCtx);
    const analytics = useContext(AnalyticsCtx);
    const realtime = useContext(RealtimeCtx);
    if (!core || !quality || !live || !analytics || !realtime) {
        throw new Error('useDashboard must be used inside DashboardProvider');
    }
    return useMemo(() => ({
        ...core,
        ...quality,
        ...live,
        ...analytics,
        ...realtime,
        now: 0,
    }), [core, quality, live, analytics, realtime]);
}

interface DashboardProviderProps {
    children: React.ReactNode;
    /** Widget IDs currently visible — used to determine which data groups to load */
    activeWidgetIds?: string[];
}

export const DashboardProvider: React.FC<DashboardProviderProps> = ({ children, activeWidgetIds = [] }) => {
    const [hours, setHours] = useState(24);
    const { demoMode, setDemoMode } = useDemoMode();
    const [groupIds, setGroupIds] = useState<string[]>([]);

    // 记忆化extraParams, 避免每次render生成新字符串触发useCallback重建 → interval全清重建
    const extraParams = useMemo(() => {
        const selectedGroupsParam = groupIds.length > 0 ? `&groupIds=${groupIds.join(',')}` : '';
        const demoParam = demoMode ? '&demo=true' : '';
        return `${demoParam}${selectedGroupsParam}`;
    }, [groupIds, demoMode]);

    // ─── Derive active data groups from visible widgets ───
    const activeDataGroups = useMemo(() => {
        const groups = new Set<DataGroup>(['core']); // core always loaded
        for (const wid of activeWidgetIds) {
            const def = WIDGET_MAP.get(wid);
            if (def?.dataGroup) groups.add(def.dataGroup);
        }
        return groups;
    }, [activeWidgetIds]);

    // Track which data groups have been loaded at least once
    const loadedGroupsRef = useRef(new Set<DataGroup>());

    // Overview state (core)
    const [stats, setStats] = useState<Stats | null>(null);
    const [chartData, setChartData] = useState<ChartData | null>(null);
    const [overviewLoading, setOverviewLoading] = useState(true);
    const [totalCalls24h, setTotalCalls24h] = useState(0);
    const [avgDuration, setAvgDuration] = useState<number | null>(null);

    // Quality state
    const [mosDist, setMosDist] = useState<MOSDistribution | null>(null);
    const [codecData, setCodecData] = useState<CodecInfo[]>([]);
    const [trends, setTrends] = useState<TrendPoint[]>([]);
    const [geoMedia, setGeoMedia] = useState<GeoItem[]>([]);
    const [worstCalls, setWorstCalls] = useState<WorstCall[]>([]);
    const [qualityLoading, setQualityLoading] = useState(true);

    // Live state
    const [liveCalls, setLiveCalls] = useState<LiveCall[]>([]);
    const [liveCount, setLiveCount] = useState(0);

    // Ops agent status counts
    const [opsAgentCounts, setOpsAgentCounts] = useState<AgentStatusCounts | undefined>();

    // Outcome stats (analytics)
    const [outcomeStats, setOutcomeStats] = useState<OutcomeStats | null>(null);
    const [outcomeLoading, setOutcomeLoading] = useState(true);
    const [outcomeTrends, setOutcomeTrends] = useState<OutcomeTrendPoint[]>([]);
    const [outcomeByQuality, setOutcomeByQuality] = useState<OutcomeByBucket[]>([]);
    const [outcomeByDuration, setOutcomeByDuration] = useState<OutcomeByBucket[]>([]);
    const [outcomeBySentiment, setOutcomeBySentiment] = useState<OutcomeByBucket[]>([]);
    const [outcomeByTalkPattern, setOutcomeByTalkPattern] = useState<OutcomeByBucket[]>([]);
    const [topClosers, setTopClosers] = useState<TopCloserEntry[]>([]);
    const [aiCostROI, setAICostROI] = useState<AICostROI | null>(null);

    // ROI summary (analytics)
    const [roiSummary, setROISummary] = useState<ROISummary | null>(null);

    // Behavior stress map
    const [stressMap, setStressMap] = useState<Map<string, BehaviorSnapshot>>(() => new Map());

    // Emotion map
    const [emotionMap, setEmotionMap] = useState<Map<string, EmotionSnapshot>>(() => new Map());
    const [emotionAlerts, setEmotionAlerts] = useState<EmotionAlert[]>([]);
    const [burnoutAlerts, setBurnoutAlerts] = useState<BurnoutAlert[]>([]);
    const [toxicAlerts, setToxicAlerts] = useState<ToxicAlert[]>([]);

    // Directional stats (core)
    const [directionalStats, setDirectionalStats] = useState<DirectionalStats | null>(null);

    // ──── Data Group: CORE ────
    const fetchCore = useCallback(async () => {
        try {
            const [statsRes, chartsRes, directionalRes] = await Promise.all([
                api.get(`/platform/stats?_=1${extraParams}`).catch((e) => { console.warn('/platform/stats failed:', e); return { data: null }; }),
                api.get(`/platform/dashboard-stats?hours=3${extraParams}`).catch((e) => { console.warn('/platform/dashboard-stats failed:', e); return { data: { quality: [], sipResponses: [] } }; }),
                api.get(`/analytics/sla/directional?days=7${extraParams}`).catch((e) => { console.warn('sla/directional failed:', e); return { data: { data: null } }; }),
            ]);
            setStats(statsRes.data);
            setLiveCount(statsRes.data?.system?.activeCalls || 0);
            setTotalCalls24h(statsRes.data?.system?.totalCalls24h || 0);

            const qualRaw = chartsRes.data.quality || [];
            if (qualRaw.length > 0) {
                const acdVals = qualRaw.map((q: any) => q.acd).filter((v: any) => v > 0);
                setAvgDuration(acdVals.length > 0 ? acdVals.reduce((a: number, b: number) => a + b, 0) / acdVals.length : null);
            }

            const errMap = new Map<string, any>();
            (chartsRes.data.sipResponses || []).forEach((item: any) => {
                const time = formatUTCToLocal(item.time, 'HH:mm');
                if (!errMap.has(time)) errMap.set(time, { time, '4xx': 0, '5xx': 0, RTP_Timeout: 0, SIP_Timeout: 0 });
                const bucket = errMap.get(time);
                const code = parseInt(item.status_code);
                if (isNaN(code)) {
                    if (item.status_code === 'rtp_timeout') {
                        bucket['RTP_Timeout'] += parseInt(item.count);
                    } else {
                        bucket['SIP_Timeout'] += parseInt(item.count);
                    }
                } else if (code >= 500) {
                    bucket['5xx'] += parseInt(item.count);
                } else {
                    bucket['4xx'] += parseInt(item.count);
                }
            });
            const sipErrorData = Array.from(errMap.values()).sort((a, b) => a.time.localeCompare(b.time));

            const qualityData = (chartsRes.data.quality || []).map((item: any) => ({
                ...item,
                time: formatUTCToLocal(item.time, 'HH:mm'),
                acd: parseFloat(item.acd?.toFixed(1) || 0),
                asr: parseFloat(item.asr?.toFixed(1) || 0),
            }));
            setChartData({ sipErrors: sipErrorData, quality: qualityData, topErrorIps: chartsRes.data.topErrorIps || [] });

            setDirectionalStats(directionalRes.data?.data || null);
            loadedGroupsRef.current.add('core');
        } catch (e) { console.error('Core fetch failed', e); }
        finally { setOverviewLoading(false); }
    }, [extraParams]);

    // ──── Data Group: QUALITY ────
    const fetchQualityData = useCallback(async () => {
        try {
            const [qualityRes, trendsRes, geoRes, worstRes] = await Promise.all([
                api.get(`/platform/quality/overview?hours=${hours}${extraParams}`).catch((e) => { console.warn('/quality/overview failed:', e); return { data: { data: null } }; }),
                api.get(`/platform/quality/trends?hours=${hours}&interval=${hours <= 6 ? '1m' : hours <= 24 ? '5m' : '1h'}${extraParams}`).catch((e) => { console.warn('/quality/trends failed:', e); return { data: { data: [] } }; }),
                api.get(`/platform/quality/geo?hours=${hours}${extraParams}`).catch((e) => { console.warn('/quality/geo failed:', e); return { data: { data: { media: [], signaling: [] } } }; }),
                api.get(`/platform/quality/worst-calls?hours=${hours}&limit=15${extraParams}`).catch((e) => { console.warn('/quality/worst-calls failed:', e); return { data: { data: [] } }; }),
            ]);

            const ov = qualityRes.data?.data;
            setMosDist(ov?.mos_distribution || null);
            setCodecData(ov?.codec_breakdown || []);
            const trendData = (trendsRes.data?.data || []).map((t: any) => ({
                ...t,
                time: formatUTCToLocal(t.bucket, hours <= 6 ? 'HH:mm' : 'MM/dd HH:mm'),
                avg_mos: parseFloat((t.avg_mos || 0).toFixed(2)),
                avg_loss: parseFloat(((t.avg_loss || 0) * 100).toFixed(2)),
                avg_jitter: parseFloat((t.avg_jitter || 0).toFixed(1)),
                avg_rtt: parseFloat((t.avg_rtt || 0).toFixed(1)),
            }));
            setTrends(trendData);
            setGeoMedia(geoRes.data?.data?.media || []);
            setWorstCalls(worstRes.data?.data || []);
            loadedGroupsRef.current.add('quality');
        } catch (e) { console.error('Quality fetch failed', e); }
        finally { setQualityLoading(false); }
    }, [hours, extraParams]);

    // ──── Data Group: ANALYTICS ────
    const fetchAnalytics = useCallback(async () => {
        try {
            const [outcomeRes, trendsRes, byQualityRes, byDurationRes, bySentimentRes, byTalkPatternRes, topClosersRes, aiCostRes, roiSummaryRes] = await Promise.all([
                api.get(`/platform/calls/analytics/outcome-stats?_=1${extraParams}`).catch((e) => { console.warn('outcome-stats failed:', e); return { data: { data: null } }; }),
                api.get(`/platform/calls/analytics/outcome-trends?days=14${extraParams}`).catch((e) => { console.warn('outcome-trends failed:', e); return { data: { data: [] } }; }),
                api.get(`/platform/calls/analytics/outcome-by-quality?days=30${extraParams}`).catch((e) => { console.warn('outcome-by-quality failed:', e); return { data: { data: [] } }; }),
                api.get(`/platform/calls/analytics/outcome-by-duration?days=30${extraParams}`).catch((e) => { console.warn('outcome-by-duration failed:', e); return { data: { data: [] } }; }),
                api.get(`/platform/calls/analytics/outcome-by-sentiment?days=30${extraParams}`).catch((e) => { console.warn('outcome-by-sentiment failed:', e); return { data: { data: [] } }; }),
                api.get(`/platform/calls/analytics/outcome-by-talk-pattern?days=30${extraParams}`).catch((e) => { console.warn('outcome-by-talk-pattern failed:', e); return { data: { data: [] } }; }),
                api.get(`/platform/calls/analytics/top-closers?days=30${extraParams}`).catch((e) => { console.warn('top-closers failed:', e); return { data: { data: [] } }; }),
                api.get(`/platform/calls/analytics/ai-cost-roi?days=30${extraParams}`).catch((e) => { console.warn('ai-cost-roi failed:', e); return { data: { data: null } }; }),
                api.get(`/analytics/roi/summary?days=30${extraParams}`).catch((e) => { console.warn('roi/summary failed:', e); return { data: { data: null } }; }),
            ]);

            setOutcomeStats(outcomeRes.data?.data || null);
            setOutcomeTrends(trendsRes.data?.data || []);
            setOutcomeByQuality(byQualityRes.data?.data || []);
            setOutcomeByDuration(byDurationRes.data?.data || []);
            setOutcomeBySentiment(bySentimentRes.data?.data || []);
            setOutcomeByTalkPattern(byTalkPatternRes.data?.data || []);
            setTopClosers(topClosersRes.data?.data || []);
            setAICostROI(aiCostRes.data?.data || null);
            setROISummary(roiSummaryRes.data?.data || null);
            loadedGroupsRef.current.add('analytics');
        } catch (e) { console.error('Analytics fetch failed', e); }
        finally { setOutcomeLoading(false); }
    }, [extraParams]);

    // ──── Live calls fetch ────
    const fetchLive = useCallback(async () => {
        try {
            const res = await api.get(`/platform/quality/live-calls?_=1${extraParams}`);
            setLiveCalls(res.data?.data || []);
            setLiveCount(res.data?.active_count || 0);
        } catch (e) { console.error('Live calls fetch failed', e); }
    }, [extraParams]);

    // ──── Effects ────

    // WebSocket subscription for real-time invalidation
    const { subscribe, connected } = useWebSocket();

    // Debounced fetch refs
    const coreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const debouncedFetchCore = useCallback(() => {
        if (coreTimerRef.current) return;
        coreTimerRef.current = setTimeout(() => {
            coreTimerRef.current = null;
            fetchCore();
        }, 1000);
    }, [fetchCore]);

    const debouncedFetchLive = useCallback(() => {
        if (liveTimerRef.current) return;
        liveTimerRef.current = setTimeout(() => {
            liveTimerRef.current = null;
            fetchLive();
        }, 1000);
    }, [fetchLive]);

    // Subscribe to dashboard:invalidate WS events
    useEffect(() => {
        const unsubscribe = subscribe('dashboard:invalidate', (message: any) => {
            const data = message.data || message;
            const groups: string[] = data.groups || [];

            if (typeof data.activeCallCount === 'number') {
                setLiveCount(data.activeCallCount);
            }

            if (data.opsAgentCounts) {
                setOpsAgentCounts(data.opsAgentCounts);
            }

            if (groups.includes('overview')) {
                debouncedFetchCore();
            }
            if (groups.includes('live')) {
                debouncedFetchLive();
            }
        });

        return () => unsubscribe();
    }, [subscribe, debouncedFetchCore, debouncedFetchLive]);

    // WS behavior:snapshot 批处理 — 累积到ref，rAF合并flush
    const snapshotBufRef = useRef<BehaviorSnapshot[]>([]);
    const snapshotRafRef = useRef(0);
    useEffect(() => {
        const unsubscribe = subscribe('behavior:snapshot', (message: any) => {
            const snapshot: BehaviorSnapshot = message.data || message;
            const key = snapshot.agent_id || snapshot.call_id;
            if (!key) return;
            snapshotBufRef.current.push(snapshot);
            if (!snapshotRafRef.current) {
                snapshotRafRef.current = requestAnimationFrame(() => {
                    const batch = snapshotBufRef.current.splice(0);
                    snapshotRafRef.current = 0;
                    if (batch.length === 0) return;
                    setStressMap(prev => {
                        const next = new Map(prev);
                        batch.forEach(s => {
                            const k = s.agent_id || s.call_id;
                            if (k) next.set(k, s);
                        });
                        return next;
                    });
                });
            }
        });
        return () => {
            unsubscribe();
            if (snapshotRafRef.current) cancelAnimationFrame(snapshotRafRef.current);
        };
    }, [subscribe]);

    // WS call:emotion 批处理 — 同上
    const emotionBufRef = useRef<EmotionSnapshot[]>([]);
    const emotionRafRef = useRef(0);
    useEffect(() => {
        const unsubscribe = subscribe('call:emotion', (message: any) => {
            const snapshot: EmotionSnapshot = message.data || message;
            const key = snapshot.call_id;
            if (!key) return;
            emotionBufRef.current.push(snapshot);
            if (!emotionRafRef.current) {
                emotionRafRef.current = requestAnimationFrame(() => {
                    const batch = emotionBufRef.current.splice(0);
                    emotionRafRef.current = 0;
                    if (batch.length === 0) return;
                    setEmotionMap(prev => {
                        const next = new Map(prev);
                        batch.forEach(s => { if (s.call_id) next.set(s.call_id, s); });
                        return next;
                    });
                });
            }
        });
        return () => {
            unsubscribe();
            if (emotionRafRef.current) cancelAnimationFrame(emotionRafRef.current);
        };
    }, [subscribe]);

    // 独立30s interval清理过期entries, 避免每条WS消息都O(n)扫描
    useEffect(() => {
        const id = setInterval(() => {
            const cutoff = Date.now() - 30_000;
            setStressMap(prev => {
                let changed = false;
                for (const [, v] of prev) {
                    const ts = typeof v.ts === 'number' ? v.ts : new Date(v.ts).getTime();
                    if (ts < cutoff) { changed = true; break; }
                }
                if (!changed) return prev; // 无过期 → 跳过克隆
                const next = new Map<string, BehaviorSnapshot>();
                for (const [k, v] of prev) {
                    const ts = typeof v.ts === 'number' ? v.ts : new Date(v.ts).getTime();
                    if (ts >= cutoff) next.set(k, v);
                }
                return next;
            });
            setEmotionMap(prev => {
                let changed = false;
                for (const [, v] of prev) {
                    if (v.ts < cutoff) { changed = true; break; }
                }
                if (!changed) return prev;
                const next = new Map<string, EmotionSnapshot>();
                for (const [k, v] of prev) {
                    if (v.ts >= cutoff) next.set(k, v);
                }
                return next;
            });
        }, 30_000);
        return () => clearInterval(id);
    }, []);

    // Subscribe to emotion:alert WS events
    useEffect(() => {
        const unsubscribe = subscribe('emotion:alert', (message: any) => {
            const alert: EmotionAlert = message.data || message;
            if (!alert.call_id) return;
            setEmotionAlerts(prev => [alert, ...prev].slice(0, 20));
        });
        return () => unsubscribe();
    }, [subscribe]);

    // Subscribe to burnout:alert WS events
    useEffect(() => {
        const unsubscribe = subscribe('burnout:alert', (message: any) => {
            const alert: BurnoutAlert = message.data || message;
            if (!alert.agent_id) return;
            setBurnoutAlerts(prev => [alert, ...prev].slice(0, 10));
        });
        return () => unsubscribe();
    }, [subscribe]);

    // Subscribe to system_alert WS events (toxic)
    useEffect(() => {
        const unsubscribe = subscribe('system_alert', (message: any) => {
            const data = message.data || message;
            if (!data.conversationId || !data.toxicScore) return;
            const alert: ToxicAlert = {
                conversationId: data.conversationId,
                messageId: data.messageId || '',
                text: data.text || '',
                senderId: data.senderId || '',
                senderRole: data.senderRole || '',
                toxicScore: data.toxicScore,
                severity: data.toxicScore >= 0.9 ? 'critical' : 'warning',
                detectedAt: data.detectedAt || new Date().toISOString(),
            };
            setToxicAlerts(prev => [alert, ...prev].slice(0, 15));
        });
        return () => unsubscribe();
    }, [subscribe]);

    // ──── Conditional Data Loading ────
    // Only fetch data groups that are needed by the active view.
    // Once loaded, data is cached — switching back doesn't re-fetch.

    const POLL_INTERVAL = demoMode ? 300000 : (connected ? 60000 : 30000);
    const LIVE_INTERVAL = demoMode ? 300000 : (connected ? 60000 : 15000);

    // Core: always loaded — 页面不可见时跳过
    useEffect(() => {
        fetchCore();
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') fetchCore();
        }, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [fetchCore, POLL_INTERVAL]);

    // Quality: only when quality group is needed
    useEffect(() => {
        if (!activeDataGroups.has('quality')) return;
        if (loadedGroupsRef.current.has('quality')) return; // already cached
        setQualityLoading(true);
        fetchQualityData();
    }, [activeDataGroups, fetchQualityData]);

    // Quality polling (only if active) — 页面不可见时跳过
    useEffect(() => {
        if (!activeDataGroups.has('quality')) return;
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') fetchQualityData();
        }, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [activeDataGroups, fetchQualityData, POLL_INTERVAL]);

    // Analytics: only when analytics group is needed
    useEffect(() => {
        if (!activeDataGroups.has('analytics')) return;
        if (loadedGroupsRef.current.has('analytics')) return; // already cached
        setOutcomeLoading(true);
        fetchAnalytics();
    }, [activeDataGroups, fetchAnalytics]);

    // Analytics polling (only if active) — 页面不可见时跳过
    useEffect(() => {
        if (!activeDataGroups.has('analytics')) return;
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') fetchAnalytics();
        }, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [activeDataGroups, fetchAnalytics, POLL_INTERVAL]);

    // Live polling (quality group) — 页面不可见时跳过
    useEffect(() => {
        if (!activeDataGroups.has('quality')) return;
        fetchLive();
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') fetchLive();
        }, LIVE_INTERVAL);
        return () => clearInterval(id);
    }, [activeDataGroups, fetchLive, LIVE_INTERVAL]);

    // now ticker已下沉到LiveCallsWidget内部, 不再在Context中维护
    // 避免每秒触发整棵消费者树的re-render

    // Geo set
    const geoCountSet = useMemo(() => {
        const set = new Set<string>();
        stats?.system?.geoStats?.forEach(g => {
            const iso = COUNTRY_NAME_TO_ISO[g.country];
            if (iso) set.add(iso);
        });
        return set;
    }, [stats?.system?.geoStats]);

    const refreshAll = useCallback(() => {
        fetchCore();
        if (loadedGroupsRef.current.has('quality')) fetchQualityData();
        if (loadedGroupsRef.current.has('analytics')) fetchAnalytics();
    }, [fetchCore, fetchQualityData, fetchAnalytics]);

    // ── 5-way split: 各group独立useMemo, 变化不传播到其他group的消费者 ──
    const coreValue: CoreSlice = useMemo(() => ({
        stats, chartData, overviewLoading, totalCalls24h, avgDuration, liveCount,
        geoCountSet, directionalStats,
        hours, setHours, groupIds, setGroupIds,
        demoMode, setDemoMode, refreshAll,
    }), [
        stats, chartData, overviewLoading, totalCalls24h, avgDuration, liveCount,
        geoCountSet, directionalStats,
        hours, setHours, groupIds, setGroupIds,
        demoMode, setDemoMode, refreshAll,
    ]);

    const qualityValue: QualitySlice = useMemo(() => ({
        mosDist, codecData, trends, geoMedia, worstCalls, qualityLoading,
    }), [mosDist, codecData, trends, geoMedia, worstCalls, qualityLoading]);

    const liveValue: LiveSlice = useMemo(() => ({
        liveCalls, opsAgentCounts,
    }), [liveCalls, opsAgentCounts]);

    const analyticsValue: AnalyticsSlice = useMemo(() => ({
        outcomeStats, outcomeLoading,
        outcomeTrends, outcomeByQuality, outcomeByDuration,
        outcomeBySentiment, outcomeByTalkPattern, topClosers, aiCostROI,
        roiSummary,
    }), [
        outcomeStats, outcomeLoading,
        outcomeTrends, outcomeByQuality, outcomeByDuration,
        outcomeBySentiment, outcomeByTalkPattern, topClosers, aiCostROI,
        roiSummary,
    ]);

    const realtimeValue: RealtimeSlice = useMemo(() => ({
        stressMap, emotionMap, emotionAlerts, burnoutAlerts, toxicAlerts,
    }), [stressMap, emotionMap, emotionAlerts, burnoutAlerts, toxicAlerts]);

    return (
        <CoreCtx.Provider value={coreValue}>
            <QualityCtx.Provider value={qualityValue}>
                <LiveCtx.Provider value={liveValue}>
                    <AnalyticsCtx.Provider value={analyticsValue}>
                        <RealtimeCtx.Provider value={realtimeValue}>
                            {children}
                        </RealtimeCtx.Provider>
                    </AnalyticsCtx.Provider>
                </LiveCtx.Provider>
            </QualityCtx.Provider>
        </CoreCtx.Provider>
    );
};
