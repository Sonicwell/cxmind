import type { LucideIcon } from 'lucide-react';

// ──────────── Data Interfaces ────────────

export interface AgentStatusCounts {
    registered: number;
    online: number;
    on_call: number;
    available: number;
    away: number;
    ringing: number;
    wrap_up: number;
    break: number;
    dnd: number;
    onhold: number;
    offline: number;
    occupancy: number;
}

export interface Stats {
    clients: { total: number; active: number };
    users: { total: number };
    agents: { total: number };
    system?: {
        activeCalls: number;
        sipErrorRate: number;
        geoStats?: { country: string; count: number }[];
        agentStatusCounts?: AgentStatusCounts;
    };
}

export interface ChartData {
    sipErrors: SipErrorPoint[];
    quality: QualityPoint[];
    topErrorIps: TopErrorIp[];
}

export interface SipErrorPoint {
    time: string;
    '4xx': number;
    '5xx': number;
    RTP_Timeout: number;
    SIP_Timeout: number;
}

export interface QualityPoint {
    time: string;
    acd: number;
    asr: number;
}

export interface TopErrorIp {
    ip: string;
    cnt: number;
}

export interface MOSDistribution {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
    total: number;
    avg_mos: number;
    min_mos: number;
    max_mos: number;
}

export interface CodecInfo {
    codec: string;
    call_count: number;
    avg_mos: number;
    avg_loss: number;
    avg_rtt: number;
}

export interface TrendPoint {
    bucket: string;
    time?: string;
    avg_mos: number;
    avg_loss: number;
    avg_jitter: number;
    avg_rtt: number;
    report_count: number;
}

export interface GeoItem {
    country: string;
    report_count?: number;
    call_count?: number;
    avg_mos?: number;
    avg_loss?: number;
    avg_rtt?: number;
}

export interface WorstCall {
    call_id: string;
    min_mos: number;
    avg_mos: number;
    avg_loss: number;
    avg_rtt: number;
    avg_jitter: number;
    report_count: number;
    duration: number;
    first_report?: string;
}

export interface LiveCall {
    call_id: string;
    caller: string;
    callee: string;
    duration: number;
    start_time: string;
    status: string;
    mos: number;
    r_factor: number;
    jitter: number;
    loss: number;
    rtt: number;
    report_count: number;
    has_quality_data: boolean;
    direction?: string;
}

// ──────────── Outcome Stats (C1) ────────────

export interface OutcomeDistribution {
    success: number;
    failure: number;
    follow_up: number;
    unknown: number;
}

export interface OutcomeAccuracyStats {
    total_calls: number;
    ai_predictions: number;
    manual_overrides: number;
    match_count: number;
    accuracy_rate: number;
}

export interface OutcomeStats {
    distribution: OutcomeDistribution;
    conversion_rate: number;
    total_calls: number;
    accuracy: OutcomeAccuracyStats;
}

export interface OutcomeTrendPoint {
    date: string;
    success: number;
    failure: number;
    follow_up: number;
}

export interface OutcomeByBucket {
    bucket: string;
    total: number;
    success: number;
    rate: number;
}

export interface TopCloserEntry {
    agent_id: string;
    agent_name?: string;
    total: number;
    success: number;
    rate: number;
}

export interface AICostROI {
    total_cost: number;
    cost_per_success: number;
    avg_tokens: number;
    total_predictions: number;
}

// ──────────── ROI Summary (C10) ────────────

export interface ROIMetric {
    key: string;
    label: string;
    value: number;
    unit: string;           // 'USD' | 'hours' | 'FTE' | 'pct'
    improvement_pct: number;
}

export interface ROISummary {
    total_value: number;
    metrics: ROIMetric[];
    period_days: number;
}

// ──────────── Behavior Snapshot (C2-P1/P2) ────────────

export interface BehaviorSnapshot {
    call_id: string;
    agent_id?: string;
    agent_talk_ms: number;
    agent_silence_ms: number;
    agent_energy: number;
    cust_talk_ms: number;
    cust_silence_ms: number;
    cust_energy: number;
    talk_ratio: number;
    stress_score: number;
    ts: string;
}

// ──────────── Emotion Snapshot (C2-P3 SER) ────────────

export interface EmotionSnapshot {
    call_id: string;
    src_ip?: string;
    emotion: string;        // e.g. "angry", "happy", "neutral"
    confidence: number;     // 0.0 – 1.0
    valence: number;        // 0.0 (very negative) – 1.0 (very positive)
    scores: Record<string, number>;  // all class scores
    latency_ms?: number;
    ts: number;             // Unix ms
}

export interface EmotionAlert {
    call_id: string;
    emotion: string;
    confidence: number;
    valence: number;
    severity: 'warning' | 'critical';
    streak: number;
    message: string;
    ts: number;
}

export interface BurnoutAlert {
    agent_id: string;
    stress_score: number;
    consecutive_high_stress: number;
    severity: 'warning' | 'critical';
    message: string;
    ts: string;
}

export interface ToxicAlert {
    conversationId: string;
    messageId: string;
    text: string;
    senderId: string;
    senderRole: string;
    toxicScore: number;
    severity: 'warning' | 'critical';
    detectedAt: string;
}

// ──────────── Directional Stats (Inbound / Outbound) ────────────

export interface DirectionalSide {
    total: number;
    answered: number;
    abandoned: number;
    answer_rate: number;
    agent_reach_rate?: number; // inbound only: agent_answered / system_inbound_total
    avg_wait_time?: number;   // inbound only
    avg_ring_time?: number;   // outbound only
    avg_talk_time: number;
}

export interface DirectionalStats {
    inbound: DirectionalSide;
    outbound: DirectionalSide;
}

// ──────────── Dashboard Context ────────────

export interface DashboardData {
    // Overview
    stats: Stats | null;
    chartData: ChartData | null;
    overviewLoading: boolean;
    totalCalls24h: number;
    avgDuration: number | null;
    liveCount: number;

    // Quality
    mosDist: MOSDistribution | null;
    codecData: CodecInfo[];
    trends: TrendPoint[];
    geoMedia: GeoItem[];
    worstCalls: WorstCall[];
    qualityLoading: boolean;
    hours: number;
    setHours: (h: number) => void;
    groupIds: string[];
    setGroupIds: (ids: string[]) => void;

    // Live
    liveCalls: LiveCall[];
    now: number;

    // Geo helper
    geoCountSet: Set<string>;

    // Demo mode
    demoMode: boolean;
    setDemoMode: (on: boolean) => void;
    refreshAll?: () => void;

    // Ops agent status counts (direct-push from WS)
    opsAgentCounts?: AgentStatusCounts;

    // Outcome stats (C1)
    outcomeStats: OutcomeStats | null;
    outcomeLoading: boolean;
    outcomeTrends: OutcomeTrendPoint[];
    outcomeByQuality: OutcomeByBucket[];
    outcomeByDuration: OutcomeByBucket[];
    outcomeBySentiment: OutcomeByBucket[];
    outcomeByTalkPattern: OutcomeByBucket[];
    topClosers: TopCloserEntry[];
    aiCostROI: AICostROI | null;

    // ROI summary (C10)
    roiSummary: ROISummary | null;

    // Behavior stress map (C2-P2) — call_id → latest snapshot
    stressMap: Map<string, BehaviorSnapshot>;

    // Emotion map (C2-P3 SER) — call_id → latest emotion
    emotionMap: Map<string, EmotionSnapshot>;

    // Emotion alerts (C2-P3 SER) — recent alerts for supervisors
    emotionAlerts: EmotionAlert[];

    // Burnout alerts — per-agent sustained high stress
    burnoutAlerts: BurnoutAlert[];

    // Toxic content alerts — omnichannel moderation
    toxicAlerts: ToxicAlert[];

    // Directional stats (inbound/outbound)
    directionalStats: DirectionalStats | null;
}


export interface WidgetProps {
    /** 编辑模式 (显示拖拽手柄等) */
    editMode: boolean;
}

export type WidgetCategory = 'stat' | 'chart' | 'table' | 'map' | 'card';

export type UserRole = 'admin' | 'supervisor' | 'agent' | 'viewer';

/** 按需加载API的data分组 */
export type DataGroup = 'core' | 'quality' | 'analytics';

export interface WidgetDef {
    id: string;
    name: string;
    /** i18n key for widget name, fallback to name */
    nameKey?: string;
    /** ℹ️ hover时显示的tooltip */
    info?: {
        descriptionKey: string;   // i18n key or raw string
        sourceKey: string;        // i18n key or raw string
        calculationKey: string;   // i18n key or raw string
    };
    icon: LucideIcon;
    category: WidgetCategory;
    defaultW: number;
    defaultH: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    /** 可见角色, 空/undefined=所有 */
    requiredRoles?: UserRole[];
    /** 必需的后端权限标识, 例如 'quality:read' */
    requiredPermission?: string;
    /** 所属模块slug, undefined=始终可见(core) */
    module?: string;
    /** 依赖的data group, undefined=core */
    dataGroup?: DataGroup;
    component: React.ComponentType<WidgetProps>;
}

// ──────────── Dashboard Views ────────────

export interface DashboardView {
    /** 唯一id: 自定义view用uuid, 内置用preset slug */
    id: string;
    /** 显示名 */
    name: string;
    /** i18n key for view name */
    nameKey?: string;
    /** lucide icon名 (可选) */
    icon?: string;
    /** 内置view不可删 */
    builtIn: boolean;
    /** 包含的widget ID列表 */
    widgetIds: string[];
    /** 按断点分的grid layout */
    layouts: Record<string, LayoutItem[]>;
}

export interface DashboardViewsState {
    activeViewId: string;
    views: DashboardView[];
}

export interface LayoutItem {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
}
