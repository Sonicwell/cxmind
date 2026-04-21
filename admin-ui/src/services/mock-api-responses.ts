/**
 * Mock API GET responses for VITE_MOCK_MODE.
 *
 * 当 demo 站点以纯静态方式部署(无后端)时, 所有 GET 请求都会被路由到这里.
 * 数据使用 hard-coded 合理值, 模拟一个繁忙的呼叫中心场景.
 */

import type { InternalAxiosRequestConfig } from 'axios';

// ── 工具函数 ──

// 返回 ISO strings, 让 DashboardContext 的 formatUTCToLocal() 正常解析
const hoursISO = (h: number) => Array.from({ length: h }, (_, i) => {
    const d = new Date(Date.now() - (h - 1 - i) * 3600_000);
    return d.toISOString();
});

const pastDays = (n: number) => Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() - (n - 1 - i) * 86400_000);
    return d.toISOString().slice(0, 10);
});

const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const rndF = (min: number, max: number, decimals = 2) =>
    parseFloat((min + Math.random() * (max - min)).toFixed(decimals));

// ── Mock 数据 ──

// /platform/stats
const MOCK_STATS = {
    users: { total: 12, active: 10 },
    agents: { total: 53, online: 14 },
    system: {
        activeCalls: 8,
        totalCalls24h: 1306,
        avgMOS: 4.21,
        // OperationsWidget fallback: stats.system.agentStatusCounts
        agentStatusCounts: {
            online: 14,
            available: 5,
            on_call: 4,
            ringing: 3,
            wrap_up: 1,
            break: 1,
            away: 0,
            working: 0,
            busy: 0,
            onhold: 0,
            occupancy: 57,
        },
        geoStats: [
            { country: 'United States', count: 542 },
            { country: 'United Kingdom', count: 198 },
            { country: 'Japan', count: 156 },
            { country: 'China', count: 134 },
            { country: 'Germany', count: 89 },
            { country: 'Singapore', count: 67 },
            { country: 'Australia', count: 55 },
            { country: 'India', count: 45 },
            { country: 'Canada', count: 20 },
        ],
    },
    accuracy: { accuracy_rate: 94.2, total_inspections: 847 },
};

// /platform/dashboard-stats
const buildDashboardStats = () => {
    const times = hoursISO(6);
    return {
        quality: times.map((time) => ({
            time,
            acd: rndF(120, 280, 1),
            asr: rndF(82, 98, 1),
            calls: rnd(30, 80),
        })),
        sipResponses: times.flatMap((time) => [
            { time, status_code: '408', count: String(rnd(0, 3)) },
            { time, status_code: '503', count: String(rnd(0, 2)) },
        ]),
    };
};

// /analytics/sla/directional — 字段需匹配 DirectionalSide 接口
const MOCK_DIRECTIONAL = {
    data: {
        inbound: { total: 812, answered: 748, answer_rate: 92.1, avg_wait_time: 22 },
        outbound: { total: 494, answered: 387, answer_rate: 78.3, avg_ring_time: 8 },
    },
};

// /platform/quality/overview  (24h & configurable)
const buildQualityOverview = () => ({
    data: {
        mos_distribution: {
            total: 1306,
            excellent: 687,
            good: 412,
            fair: 142,
            poor: 52,
            bad: 13,
        },
        codec_breakdown: [
            { codec: 'opus', call_count: 534, avg_mos: 4.35, avg_loss: 0.003, avg_rtt: 32 },
            { codec: 'g711a', call_count: 412, avg_mos: 4.12, avg_loss: 0.008, avg_rtt: 48 },
            { codec: 'g711u', call_count: 198, avg_mos: 4.08, avg_loss: 0.012, avg_rtt: 55 },
            { codec: 'g729', call_count: 162, avg_mos: 3.85, avg_loss: 0.018, avg_rtt: 72 },
        ],
        avg_mos: 4.21,
        avg_jitter: 12.5,
        avg_loss: 0.008,
        avg_rtt: 45.3,
    },
});

// /platform/quality/trends
const buildQualityTrends = () => {
    const buckets = hoursISO(12);
    return {
        data: buckets.map((bucket) => ({
            bucket,
            avg_mos: rndF(3.8, 4.5),
            avg_loss: rndF(0.001, 0.02),
            avg_jitter: rndF(8, 20, 1),
            avg_rtt: rndF(30, 80, 1),
            calls: rnd(50, 150),
        })),
    };
};

// /platform/quality/geo
const MOCK_GEO = {
    data: {
        media: [
            { country: 'US', city: 'New York', calls: 210, avg_mos: 4.3, avg_rtt: 35, avg_loss: 0.005, report_count: 210 },
            { country: 'US', city: 'Los Angeles', calls: 145, avg_mos: 4.1, avg_rtt: 42, avg_loss: 0.008, report_count: 145 },
            { country: 'GB', city: 'London', calls: 128, avg_mos: 4.2, avg_rtt: 85, avg_loss: 0.006, report_count: 128 },
            { country: 'JP', city: 'Tokyo', calls: 98, avg_mos: 4.4, avg_rtt: 120, avg_loss: 0.003, report_count: 98 },
            { country: 'CN', city: 'Shanghai', calls: 87, avg_mos: 4.0, avg_rtt: 135, avg_loss: 0.012, report_count: 87 },
            { country: 'SG', city: 'Singapore', calls: 67, avg_mos: 4.5, avg_rtt: 110, avg_loss: 0.002, report_count: 67 },
            { country: 'DE', city: 'Berlin', calls: 56, avg_mos: 4.1, avg_rtt: 95, avg_loss: 0.009, report_count: 56 },
            { country: 'AU', city: 'Sydney', calls: 45, avg_mos: 4.3, avg_rtt: 145, avg_loss: 0.007, report_count: 45 },
        ],
        signaling: [],
    },
};

// /platform/quality/worst-calls
const MOCK_WORST_CALLS = {
    data: Array.from({ length: 8 }, (_, i) => ({
        call_id: `worst-call-${i + 1}-${rnd(10000, 99999)}`,
        timestamp: new Date(Date.now() - rnd(600, 7200) * 1000).toISOString(),
        caller: `+1555010${i}`,
        callee: `${1001 + i}`,
        avg_mos: rndF(1.5, 2.8),
        min_mos: rndF(0.8, 1.8),
        avg_loss: rndF(0.03, 0.15),
        avg_jitter: rndF(40, 120, 1),
        avg_rtt: rndF(80, 250, 0),
        codec: ['g729', 'g711a', 'opus'][i % 3],
        duration: rnd(90, 300),
    })),
};

// /platform/quality/live-calls
const MOCK_LIVE_CALLS = {
    active_count: 8,
    data: [
        { call_id: 'live-001', caller: '+1(555) 100-8998', callee: '1001', start_time: new Date(Date.now() - 245000).toISOString(), mos: 4.3, jitter: 8.2, loss: 0.002, rtt: 32, quality: 'excellent', status: 'answered', has_quality_data: true, codec: 'opus', direction: 'IN' },
        { call_id: 'live-002', caller: '1005', callee: '+1(555) 714-0072', start_time: new Date(Date.now() - 122000).toISOString(), mos: 4.1, jitter: 12.5, loss: 0.005, rtt: 48, quality: 'good', status: 'answered', has_quality_data: true, codec: 'g711a', direction: 'OUT' },
        { call_id: 'live-003', caller: '+44 7911 234567', callee: '1003', start_time: new Date(Date.now() - 187000).toISOString(), mos: 3.9, jitter: 18.0, loss: 0.008, rtt: 85, quality: 'good', status: 'answered', has_quality_data: true, codec: 'g711u', direction: 'IN' },
        { call_id: 'live-004', caller: '1008', callee: '+81 90-1234-5678', start_time: new Date(Date.now() - 12000).toISOString(), mos: null, jitter: null, loss: null, rtt: null, quality: null, status: 'ringing', has_quality_data: false, codec: 'opus', direction: 'OUT' },
        { call_id: 'live-005', caller: '+86 138 0010 0001', callee: '1002', start_time: new Date(Date.now() - 311000).toISOString(), mos: 4.0, jitter: 15.3, loss: 0.010, rtt: 135, quality: 'good', status: 'answered', has_quality_data: true, codec: 'g729', direction: 'IN' },
        { call_id: 'live-006', caller: '1012', callee: '+65 8123 4567', start_time: new Date(Date.now() - 91000).toISOString(), mos: 4.4, jitter: 6.8, loss: 0.002, rtt: 110, quality: 'excellent', status: 'answered', has_quality_data: true, codec: 'opus', direction: 'OUT' },
        { call_id: 'live-007', caller: '+1(555) 200-3344', callee: '1006', start_time: new Date(Date.now() - 420000).toISOString(), mos: 3.2, jitter: 35.5, loss: 0.025, rtt: 165, quality: 'fair', status: 'answered', has_quality_data: true, codec: 'g711a', direction: 'IN' },
        { call_id: 'live-008', caller: '1011', callee: '+49 171 234 5678', start_time: new Date(Date.now() - 15000).toISOString(), mos: null, jitter: null, loss: null, rtt: null, quality: null, status: 'ringing', has_quality_data: false, codec: 'opus', direction: 'OUT' },
    ],
};

// /conversations/monitor/overview
const buildOmniMonitor = () => {
    const MY_AGENT_NAMES = [
        'Alice Wonderland', 'Bob Builder', 'Charlie Puth', 'Diana Prince',
        'Ethan Hunt', 'Fiona Gallagher', 'George Kim', 'Hannah Montana',
    ];

    return {
        data: {
            timestamp: new Date().toISOString(),
            metrics: {
                queuedCount: rnd(0, 5),
                activeCount: rnd(8, 25),
                slaBreachedCount: rnd(0, 2),
                resolvedToday: rnd(150, 300),
            },
            agents: Array.from({ length: 8 }, (_, i) => {
                const isBusy = i % 2 === 0; // Make more agents busy so we can monitor them
                return {
                    agentId: `a_${1001 + i}`,
                    displayName: MY_AGENT_NAMES[i],
                    status: isBusy ? 'im_busy' : 'im_available',
                    activeCount: isBusy ? rnd(1, 4) : 0,
                    capacity: 4,
                    activeCalls: isBusy ? 1 : 0,
                };
            }),
            streams: Array.from({ length: 8 }, (_, i) => {
                const isQueued = i < 2;
                // For active streams, randomly assign them to agents 0 through 7 (which matches MY_AGENT_NAMES)
                const assignedIndex = i % 8;
                return {
                    id: `stream_${i + 100}`,
                    channel: ['whatsapp', 'webchat', 'sms'][i % 3],
                    status: isQueued ? 'queued' : 'active',
                    assignedAgentId: isQueued ? undefined : `a_${1001 + assignedIndex}`,
                    assignedAgentName: isQueued ? undefined : MY_AGENT_NAMES[assignedIndex],
                    visitorName: `Visitor ${rnd(100, 999)}`,
                    queueTimeSeconds: isQueued ? rnd(10, 120) : rnd(5, 30),
                    activeTimeSeconds: isQueued ? 0 : rnd(30, 300),
                    isSlaBreached: isQueued && rnd(0, 2) === 0,
                    intent: ['Support', 'Sales', 'Billing', 'General'][i % 4],
                };
            })
        }
    };
};

// /platform/calls/analytics/outcome-stats
const MOCK_OUTCOME_STATS = {
    data: {
        total_calls: 1306,
        conversion_rate: 0.342,
        avg_talk_time: 185,
        resolution_rate: 0.961,
        callback_rate: 0.048,
        positive_sentiment: 67.3,
        neutral_sentiment: 24.1,
        negative_sentiment: 8.6,
        distribution: {
            success: 447,
            failure: 196,
            follow_up: 412,
            unknown: 251,
        },
    },
};

// /platform/calls/analytics/outcome-trends
const buildOutcomeTrends = () => ({
    data: pastDays(14).map(date => {
        const total = rnd(80, 120);
        const converted = rnd(25, 45);
        return {
            date,
            total,
            success: converted,
            failure: rnd(10, 25),
            follow_up: total - converted - rnd(10, 25),
            converted,
            rate: rndF(28, 42),
        };
    }),
});

// /platform/calls/analytics/outcome-by-quality
const MOCK_OUTCOME_BY_QUALITY = {
    data: [
        { bucket: 'Excellent (4.0+)', total: 687, converted: 285, rate: 41.5 },
        { bucket: 'Good (3.5-4.0)', total: 412, converted: 142, rate: 34.5 },
        { bucket: 'Fair (3.0-3.5)', total: 142, converted: 32, rate: 22.5 },
        { bucket: 'Poor (<3.0)', total: 65, converted: 8, rate: 12.3 },
    ],
};

// /platform/calls/analytics/outcome-by-duration
const MOCK_OUTCOME_BY_DURATION = {
    data: [
        { bucket: '< 1 min', total: 134, converted: 12, rate: 9.0 },
        { bucket: '1-3 min', total: 389, converted: 98, rate: 25.2 },
        { bucket: '3-5 min', total: 412, converted: 178, rate: 43.2 },
        { bucket: '5-10 min', total: 267, converted: 132, rate: 49.4 },
        { bucket: '> 10 min', total: 104, converted: 47, rate: 45.2 },
    ],
};

// /platform/calls/analytics/outcome-by-sentiment
const MOCK_OUTCOME_BY_SENTIMENT = {
    data: [
        { bucket: 'Positive', total: 879, converted: 387, rate: 44.0 },
        { bucket: 'Neutral', total: 315, converted: 62, rate: 19.7 },
        { bucket: 'Negative', total: 112, converted: 18, rate: 16.1 },
    ],
};

// /platform/calls/analytics/outcome-by-talk-pattern
const MOCK_OUTCOME_BY_TALK_PATTERN = {
    data: [
        { bucket: 'Agent Dominant', total: 378, converted: 98, rate: 25.9 },
        { bucket: 'Balanced', total: 612, converted: 278, rate: 45.4 },
        { bucket: 'Customer Dominant', total: 316, converted: 91, rate: 28.8 },
    ],
};

// /platform/calls/analytics/top-closers
const MOCK_TOP_CLOSERS = {
    data: [
        { agent_id: 'a_1001', name: 'Alice Wonderland', total: 89, converted: 42, rate: 47.2 },
        { agent_id: 'a_1005', name: 'Ethan Hunt', total: 72, converted: 33, rate: 45.8 },
        { agent_id: 'a_1003', name: 'Charlie Puth', total: 81, converted: 35, rate: 43.2 },
        { agent_id: 'a_1010', name: 'Julia Roberts', total: 68, converted: 28, rate: 41.2 },
        { agent_id: 'a_1006', name: 'Fiona Gallagher', total: 76, converted: 29, rate: 38.2 },
    ],
};

// /platform/calls/analytics/ai-cost-roi
const MOCK_AI_COST_ROI = {
    data: {
        // AICostROIWidget 读的字段
        total_cost: 2847.50,
        cost_per_success: 0.0073,
        avg_tokens: 1842,
        total_predictions: 38542,
        // 额外信息 (其他组件可能用)
        total_revenue_attributed: 156320.00,
        roi_multiplier: 54.9,
        ai_features: [
            { name: 'Real-time ASR', cost: 1234.00, calls_processed: 1306 },
            { name: 'Sentiment Analysis', cost: 567.50, calls_processed: 1306 },
            { name: 'Quality Inspection', cost: 423.00, inspections: 847 },
            { name: 'AI Summary', cost: 623.00, summaries: 1180 },
        ],
    },
};

// /analytics/roi/summary — ROISummaryWidget 需要 metrics[] 和 total_value
const MOCK_ROI_SUMMARY = {
    data: {
        period_days: 30,
        total_value: 45670,
        metrics: [
            { key: 'asr_cost_saved', label: 'ASR Cost Saved', value: 12450, unit: 'USD', improvement_pct: 23 },
            { key: 'call_duration_saved', label: 'Call Duration Saved', value: 842, unit: 'hours', improvement_pct: 15 },
            { key: 'revenue_attributed', label: 'Revenue Attributed', value: 28300, unit: 'USD', improvement_pct: 31 },
            { key: 'compliance_risk_avoided', label: 'Compliance Risk Avoided', value: 3200, unit: 'USD', improvement_pct: 8 },
            { key: 'acw_time_saved', label: 'After-Call Work Saved', value: 156, unit: 'hours', improvement_pct: 19 },
            { key: 'fte_equivalent', label: 'FTE Equivalent', value: 2.4, unit: 'FTE', improvement_pct: 12 },
        ],
    },
};

// /preferences/* — 返回空值让组件使用默认值
const MOCK_PREFERENCES = (key: string) => ({
    key,
    value: null, // 让调用方 fallback 到 defaultValue
});

// /platform/settings
const MOCK_SETTINGS = {
    data: {
        companyName: 'CXMI Demo Corp',
        timezone: 'America/New_York',
        language: 'en',
        agentStatuses: [
            { id: 'available', label: 'Available', color: 'green', icon: 'circle' },
            { id: 'oncall', label: 'On Call', color: 'red', icon: 'phone' },
            { id: 'ring', label: 'Ringing', color: 'yellow', icon: 'bell' },
            { id: 'wrapup', label: 'Wrap Up', color: 'cyan', icon: 'clock' },
            { id: 'break', label: 'Break', color: 'purple', icon: 'coffee' },
            { id: 'away', label: 'Away', color: 'orange', icon: 'moon' },
            { id: 'offline', label: 'Offline', color: 'gray', icon: 'x-circle' },
        ],
        notifications: { email: true, browser: true },
        features: {
            qualityInspection: true,
            sentimentAnalysis: true,
            realtimeASR: true,
            aiSummary: true,
            copilot: true,
        },
    },
};

// /client/agents — 50 坐席呼叫中心
const AGENT_NAMES = [
    'Alice Wonderland', 'Bob Builder', 'Charlie Puth', 'Diana Prince', 'Ethan Hunt',
    'Fiona Gallagher', 'George Kim', 'Hannah Montana', 'Ivan Drago', 'Julia Roberts',
    'Kevin Hart', 'Luna Park', 'Max Power', 'Nancy Drew', 'Oscar Wilde',
    'Penny Lane', 'Quincy Adams', 'Rachel Green', 'Steve Rogers', 'Tina Turner',
    'Uma Thurman', 'Vince Vaughn', 'Wendy Wu', 'Xavier Cruz', 'Yuki Tanaka',
    'Zara Khan', 'Alex Morgan', 'Blake Shelton', 'Clara Oswald', 'Derek Hale',
    'Elena Fisher', 'Frank Castle', 'Grace Hopper', 'Hugo Strange', 'Iris West',
    'Jake Peralta', 'Kara Danvers', 'Leo Messi', 'Maya Patel', 'Nora Allen',
    'Owen Wilson', 'Priya Sharma', 'Quinn Hughes', 'Rosa Diaz', 'Sam Wilson',
    'Tara Strong', 'Uri Geller', 'Vera Wang', 'Will Smith', 'Xena Warrior',
];

const AGENT_STATUSES = [
    'on_call', 'available', 'on_call', 'ringing', 'available',
    'on_call', 'wrap_up', 'available', 'on_call', 'available',
    'ringing', 'available', 'on_call', 'break', 'offline',
    'available', 'on_call', 'available', 'ringing', 'on_call',
    'available', 'wrap_up', 'on_call', 'available', 'on_call',
    'available', 'break', 'on_call', 'available', 'ringing',
    'on_call', 'available', 'on_call', 'offline', 'available',
    'ringing', 'available', 'on_call', 'available', 'wrap_up',
    'on_call', 'available', 'offline', 'available', 'on_call',
    'available', 'break', 'on_call', 'available', 'offline',
];

const MOCK_AGENT_LIST = {
    data: Array.from({ length: 50 }, (_, i) => ({
        _id: `a_${1001 + i}`,
        id: `a_${1001 + i}`,
        sipNumber: `${1001 + i}`,
        displayName: AGENT_NAMES[i],
        status: 'active',
        availabilityStatus: AGENT_STATUSES[i],
        boundUser: { displayName: AGENT_NAMES[i], avatar: `/avatars/agent_${(i % 6) + 1}.png` },
        groupId: i < 10 ? 'g_sales' : i < 20 ? 'g_support' : i < 30 ? 'g_vip' : i < 40 ? 'g_tech' : 'g_ops',
    })),
};

// /client/agents/sip-online — 38/50 agents online
const MOCK_SIP_ONLINE = {
    data: Array.from({ length: 50 }, (_, i) => `${1001 + i}`).filter((_, i) => AGENT_STATUSES[i] !== 'offline'),
    copilotOnline: ['1001', '1003', '1005', '1008', '1010', '1012', '1016', '1018', '1020', '1023', '1025', '1028', '1031', '1033', '1036', '1038', '1041', '1045'],
};

// /groups — 5 个坐席组
const MOCK_GROUPS = {
    data: [
        { _id: 'g_sales', name: 'Sales', code: 'SALES' },
        { _id: 'g_support', name: 'Support', code: 'SUPPORT' },
        { _id: 'g_vip', name: 'VIP', code: 'VIP' },
        { _id: 'g_tech', name: 'Tech Support', code: 'TECH' },
        { _id: 'g_ops', name: 'Operations', code: 'OPS' },
    ],
};

// /search
const MOCK_SEARCH = { agents: [], calls: [] };

// /alerts
const MOCK_ALERTS = {
    data: [
        { _id: 'alert_1', type: 'quality', severity: 'warning', message: 'MOS dropped below 3.0 for 3 consecutive calls on Agent 1006', timestamp: new Date(Date.now() - 1800000).toISOString(), acknowledged: false },
        { _id: 'alert_2', type: 'system', severity: 'info', message: 'Daily QI inspection completed: 47 calls inspected, avg score 76.3', timestamp: new Date(Date.now() - 3600000).toISOString(), acknowledged: true },
        { _id: 'alert_3', type: 'behavior', severity: 'warning', message: 'High stress detected for Agent Alice Wonderland (score: 0.82)', timestamp: new Date(Date.now() - 5400000).toISOString(), acknowledged: false },
    ],
    total: 3,
};

// ── 路由匹配 ──

type MockRoute = {
    match: (url: string) => boolean;
    response: (url: string) => any;
};

const MOCK_ROUTES: MockRoute[] = [
    // Dashboard Core
    { match: (u) => u.includes('/platform/stats'), response: () => MOCK_STATS },
    { match: (u) => u.includes('/platform/dashboard-stats'), response: () => buildDashboardStats() },
    { match: (u) => u.includes('/analytics/sla/directional'), response: () => MOCK_DIRECTIONAL },

    // Dashboard Widgets (DID/CID, Hourly Volume, Duration Distribution)
    {
        match: (u) => u.includes('/platform/did-cid-stats'),
        response: () => ({
            did: [
                { number: '+18005551001', cnt: String(rnd(25, 120)) },
                { number: '+18005551002', cnt: String(rnd(18, 85)) },
                { number: '+18005551003', cnt: String(rnd(12, 65)) },
                { number: '+18005551004', cnt: String(rnd(8, 45)) },
                { number: '+18005551005', cnt: String(rnd(5, 30)) },
            ],
            cid: [
                { number: '+14155559001', cnt: String(rnd(20, 80)) },
                { number: '+14155559002', cnt: String(rnd(15, 60)) },
                { number: '+14155559003', cnt: String(rnd(10, 50)) },
                { number: '+14155559004', cnt: String(rnd(5, 35)) },
            ],
            period: 'today',
        }),
    },
    {
        match: (u) => u.includes('/platform/hourly-volume'),
        response: () => {
            // 模拟呼叫中心流量: 夜间低, 10-12 & 14-16 高峰
            const w = [2, 1, 1, 1, 1, 3, 8, 15, 25, 35, 42, 40, 30, 35, 40, 38, 28, 18, 10, 6, 4, 3, 3, 2];
            const h = new Date().getHours();
            return {
                data: Array.from({ length: 24 }, (_, i) => ({
                    hour: i,
                    cnt: String(i <= h ? Math.round(w[i] * (0.8 + Math.random() * 0.5)) : 0),
                })).filter(d => Number(d.cnt) > 0),
            };
        },
    },
    {
        match: (u) => u.includes('/platform/duration-distribution'),
        response: () => ({
            under_30s: rnd(80, 200),
            s30_to_2m: rnd(150, 350),
            m2_to_5m: rnd(200, 500),
            over_5m: rnd(50, 150),
        }),
    },

    // Quality
    { match: (u) => u.includes('/platform/quality/live-calls'), response: () => MOCK_LIVE_CALLS },
    { match: (u) => u.includes('/platform/quality/worst-calls'), response: () => MOCK_WORST_CALLS },
    { match: (u) => u.includes('/platform/quality/trends'), response: () => buildQualityTrends() },
    { match: (u) => u.includes('/platform/quality/geo'), response: () => MOCK_GEO },
    { match: (u) => u.includes('/platform/quality/overview'), response: () => buildQualityOverview() },

    // Analytics
    { match: (u) => u.includes('/analytics/outcome-stats'), response: () => MOCK_OUTCOME_STATS },
    { match: (u) => u.includes('/analytics/outcome-trends'), response: () => buildOutcomeTrends() },
    { match: (u) => u.includes('/analytics/outcome-by-quality'), response: () => MOCK_OUTCOME_BY_QUALITY },
    { match: (u) => u.includes('/analytics/outcome-by-duration'), response: () => MOCK_OUTCOME_BY_DURATION },
    { match: (u) => u.includes('/analytics/outcome-by-sentiment'), response: () => MOCK_OUTCOME_BY_SENTIMENT },
    { match: (u) => u.includes('/analytics/outcome-by-talk-pattern'), response: () => MOCK_OUTCOME_BY_TALK_PATTERN },
    { match: (u) => u.includes('/analytics/top-closers'), response: () => MOCK_TOP_CLOSERS },
    { match: (u) => u.includes('/analytics/ai-cost-roi'), response: () => MOCK_AI_COST_ROI },
    { match: (u) => u.includes('/analytics/roi/summary'), response: () => MOCK_ROI_SUMMARY },

    // Agents & Layouts
    { match: (u) => u.includes('/client/agents/sip-online'), response: () => MOCK_SIP_ONLINE },
    { match: (u) => u.includes('/client/agents'), response: () => MOCK_AGENT_LIST },
    { match: (u) => u.includes('/groups'), response: () => MOCK_GROUPS },

    // Settings
    { match: (u) => u.includes('/platform/settings'), response: () => MOCK_SETTINGS },

    // Omni Monitor
    { match: (u) => u.includes('/conversations/monitor/overview'), response: () => buildOmniMonitor() },

    // Users (supervisors, admins)
    {
        match: (u) => u.includes('/platform/users'),
        response: (url) => {
            const allUsers = [
                { _id: 'u_admin_01', email: 'admin@example.com', displayName: 'Demo Admin', role: 'platform_admin', status: 'active', lastLogin: new Date(Date.now() - 3600_000).toISOString(), createdAt: '2024-12-01T10:00:00Z' },
                { _id: 'u_sup_01', email: 'sarah.ops@example.com', displayName: 'Sarah Ops', role: 'supervisor', status: 'active', managedGroups: ['g_sales', 'g_support'], lastLogin: new Date(Date.now() - 7200_000).toISOString(), createdAt: '2025-01-10T10:00:00Z' },
                { _id: 'u_sup_02', email: 'mike.lead@example.com', displayName: 'Mike Lead', role: 'supervisor', status: 'active', managedGroups: ['g_ops'], lastLogin: new Date(Date.now() - 14400_000).toISOString(), createdAt: '2025-02-15T10:00:00Z' },
                { _id: 'u_agent_01', email: 'alice@example.com', displayName: 'Alice Wonderland', role: 'agent', status: 'active', lastLogin: new Date(Date.now() - 1800_000).toISOString(), createdAt: '2025-03-01T10:00:00Z' },
            ];
            // 支持 ?role= 过滤
            if (url.includes('role=supervisor')) return { data: allUsers.filter(u => u.role === 'supervisor') };
            if (url.includes('role=agent')) return { data: allUsers.filter(u => u.role === 'agent') };
            return { data: allUsers };
        },
    },

    // SIP Calls (呼叫记录页 — 避免和 /platform/calls/analytics 冲突)
    {
        match: (u) => (u.includes('/sip-calls') || u.includes('/platform/calls')) && !u.includes('/analytics'),
        response: () => ({
            data: Array.from({ length: 10 }, (_, i) => {
                const isOutbound = i % 2 !== 0;
                const agentNum = `${1001 + (i % 15)}`;
                const isFailed = i === 9;
                const callType = (i === 7) ? 'system_inbound'
                    : (i === 6) ? 'internal'
                        : isOutbound ? 'agent_outbound' : 'agent_inbound';
                return {
                    _id: `call_${1000 + i}`,
                    call_id: `sip-${Date.now()}-${i}`,
                    timestamp: new Date(Date.now() - rnd(300, 86400) * 1000).toISOString(),
                    caller: isOutbound ? agentNum : `+1555${String(100 + i).padStart(4, '0')}`,
                    callee: isOutbound ? `+1555${String(900 + i).padStart(4, '0')}` : agentNum,
                    from_domain: 'sip.example.com',
                    to_domain: isOutbound ? 'pstn.provider.net' : 'sip.example.com',
                    last_method: isFailed ? 'CANCEL' : 'BYE',
                    last_status: isFailed ? 487 : 200,
                    call_type: callType,
                    agent_number: agentNum,
                    hangup_by: isFailed ? 'system' : (['customer', 'agent', 'customer', 'agent', 'customer'] as const)[i % 5],
                    disconnect_reason: isFailed ? 'CANCEL' : undefined,
                    direction: isOutbound ? 'outbound' : 'inbound',
                    duration: isFailed ? 0 : rnd(30, 600),
                    call_answered: isFailed ? undefined : new Date(Date.now() - rnd(300, 86400) * 1000).toISOString(),
                    call_ended: isFailed ? undefined : new Date(Date.now() - rnd(60, 300) * 1000).toISOString(),
                };
            }),
            total: 1306,
            page: 1,
            limit: 10,
        }),
    },

    // WFM (排班 / 预测)
    {
        match: (u) => u.includes('/platform/wfm/templates'),
        response: () => ({
            data: [
                { _id: 'tpl_morning', name: 'Morning Shift', startTime: '08:00', endTime: '16:00', color: '#3b82f6', breakMinutes: 60, status: 'active', isNextDay: false },
                { _id: 'tpl_afternoon', name: 'Afternoon Shift', startTime: '14:00', endTime: '22:00', color: '#f59e0b', breakMinutes: 45, status: 'active', isNextDay: false },
                { _id: 'tpl_night', name: 'Night Shift', startTime: '22:00', endTime: '06:00', color: '#8b5cf6', breakMinutes: 60, status: 'active', isNextDay: true },
                { _id: 'tpl_split', name: 'Split Shift', startTime: '10:00', endTime: '14:00', color: '#10b981', breakMinutes: 0, status: 'active', isNextDay: false },
            ],
        }),
    },
    {
        match: (u) => u.includes('/platform/wfm/forecast'),
        response: (url) => {
            const isWeekOrMonth = url.includes('startDate') && url.includes('endDate') && !url.includes('date=');
            if (isWeekOrMonth) {
                const sm = url.match(/startDate=(\d{4}-\d{2}-\d{2})/);
                const em = url.match(/endDate=(\d{4}-\d{2}-\d{2})/);
                const start = sm ? new Date(sm[1]) : new Date();
                const end = em ? new Date(em[1]) : new Date(start.getTime() + 6 * 86400000);
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

                return {
                    data: Array.from({ length: diffDays }, (_, i) => {
                        const d = new Date(start);
                        d.setDate(d.getDate() + i);
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        return {
                            time: d.toISOString().slice(0, 10),
                            label: d.toISOString().slice(0, 10),
                            predictedVolume: isWeekend ? rnd(120, 300) : rnd(400, 900),
                            requiredAgents: isWeekend ? rnd(3, 8) : rnd(8, 16),
                        };
                    }),
                };
            }
            return {
                data: Array.from({ length: 24 }, (_, h) => ({
                    time: `${String(h).padStart(2, '0')}:00`,
                    label: `${String(h).padStart(2, '0')}:00`,
                    predictedVolume: h >= 8 && h <= 18 ? rnd(40, 120) : rnd(5, 25),
                    requiredAgents: h >= 8 && h <= 18 ? rnd(4, 12) : rnd(1, 3),
                })),
            };
        },
    },
    {
        match: (u) => u.includes('/platform/wfm/shifts'),
        response: (url) => {
            const sm = url.match(/startDate=(\d{4}-\d{2}-\d{2})/);
            const em = url.match(/endDate=(\d{4}-\d{2}-\d{2})/);

            let start = new Date();
            let diffDays = 7;

            if (sm && em) {
                start = new Date(sm[1]);
                const end = new Date(em[1]);
                diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            } else {
                const dayOfWeek = start.getDay();
                start.setDate(start.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
            }

            const agents = [
                { _id: 'u_1001', displayName: 'Alice Wonderland', sipNumber: '1001' },
                { _id: 'u_1002', displayName: 'Bob Builder', sipNumber: '1002' },
                { _id: 'u_1003', displayName: 'Charlie Puth', sipNumber: '1003' },
                { _id: 'u_1004', displayName: 'Diana Prince', sipNumber: '1004' },
                { _id: 'u_1005', displayName: 'Ethan Hunt', sipNumber: '1005' },
                { _id: 'u_1006', displayName: 'Fiona Gallagher', sipNumber: '1006' },
                { _id: 'u_1007', displayName: 'George Kim', sipNumber: '1007' },
                { _id: 'u_1008', displayName: 'Hannah Montana', sipNumber: '1008' },
            ];
            const shiftTypes = [
                { template: 'Morning Shift', start: '08:00', end: '16:00' },
                { template: 'Afternoon Shift', start: '14:00', end: '22:00' },
                { template: 'Night Shift', start: '22:00', end: '06:00' },
                { template: 'Split Shift', start: '10:00', end: '14:00' },
            ];

            const result: any[] = [];
            let sid = 0;

            for (let d = 0; d < diffDays; d++) {
                const date = new Date(start);
                date.setDate(start.getDate() + d);
                const dateStr = date.toISOString().slice(0, 10);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const agentsToday = isWeekend ? agents.slice(0, 3) : agents;

                agentsToday.forEach((agent, ai) => {
                    const st = shiftTypes[ai % shiftTypes.length];
                    result.push({
                        _id: `shift_${sid++}`,
                        agentId: agent,
                        date: dateStr,
                        templateName: st.template,
                        startTime: st.start,
                        endTime: st.end,
                        status: d < Math.floor(diffDays * 0.7) ? 'confirmed' : 'pending',
                        type: 'working',
                    });
                });
            }
            return { data: result };
        },
    },
    {
        match: (u) => u.includes('/platform/wfm/requests'),
        response: () => ({
            data: [
                { _id: 'req_1', agentName: 'Sarah Jenkins', type: 'Time Off', details: 'Medical Appointment on Oct 14, 09:00 - 12:00', status: 'pending', createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
                { _id: 'req_2', agentName: 'David Chen', type: 'Shift Swap', details: 'Swap Friday Evening (18:00 - 22:00) with Agent 8', status: 'pending', createdAt: new Date(Date.now() - 4 * 3600000).toISOString() },
                { _id: 'req_3', agentName: 'Marcus Wright', type: 'Overtime', details: 'Willing to take 2 extra hours on Saturday Peak', status: 'pending', createdAt: new Date(Date.now() - 24 * 3600000).toISOString() },
            ]
        })
    },

    // Layouts (AgentMap 楼层布局 — 通过 api.get 路径)
    {
        match: (u) => /\/layouts\/[^/]+\/stats/.test(u),
        response: () => ({ data: null }), // AgentMap 使用 getMockLayoutStats() 函数
    },
    {
        match: (u) => u.includes('/layouts'),
        response: () => ({ data: [] }), // AgentMap 使用 getMockLayouts() 函数
    },

    // Preferences
    {
        match: (u) => u.includes('/preferences/'),
        response: (url) => {
            const key = url.split('/preferences/').pop()?.split('?')[0] || '';
            return MOCK_PREFERENCES(key);
        },
    },

    // Search
    { match: (u) => u.includes('/search'), response: () => MOCK_SEARCH },

    // Alert rules 子路由 (必须在通用 /alerts 前匹配)
    {
        match: (u) => u.includes('/alerts/rules/templates'),
        response: () => ([
            {
                id: 'tpl_mos_drop', name: 'MOS Quality Drop', description: 'Alert when average MOS drops below threshold',
                icon: 'activity',
                metrics: [{ name: 'MOS', condition: '< 3.5 for 5 min', severity: 'warning' }],
                rulesToInject: [{ name: 'MOS < 3.5', severity: 'warning', metricExpressions: [{ metric: 'MOS', operator: 'LT', threshold: 3.5 }], durationWindowSec: 300 }],
            },
            {
                id: 'tpl_sip_err', name: 'SIP Error Spike', description: 'Alert on elevated SIP error rates',
                icon: 'alert-triangle',
                metrics: [{ name: 'SIP_ERROR_RATE', condition: '> 5% for 3 min', severity: 'critical' }],
                rulesToInject: [{ name: 'SIP Errors > 5%', severity: 'critical', metricExpressions: [{ metric: 'SIP_ERROR_RATE', operator: 'GT', threshold: 5 }], durationWindowSec: 180 }],
            },
        ]),
    },
    {
        match: (u) => u.includes('/alerts/rules/history'),
        response: () => ({
            data: [
                { _id: 'ah_1', ruleName: 'MOS < 3.5', triggerValue: 3.2, threshold: 3.5, metric: 'MOS', severity: 'warning', eventTrigger: 'metric_breach', timestamp: new Date(Date.now() - 3600_000).toISOString(), resolved: true, resolvedAt: new Date(Date.now() - 1800_000).toISOString() },
                { _id: 'ah_2', ruleName: 'SIP Errors > 5%', triggerValue: 7.1, threshold: 5, metric: 'SIP_ERROR_RATE', severity: 'critical', eventTrigger: 'metric_breach', timestamp: new Date(Date.now() - 7200_000).toISOString(), resolved: true, resolvedAt: new Date(Date.now() - 5400_000).toISOString() },
                { _id: 'ah_3', ruleName: 'Queue Wait > 60s', triggerValue: 82, threshold: 60, metric: 'QUEUE_WAIT_TIME', severity: 'warning', eventTrigger: 'metric_breach', timestamp: new Date(Date.now() - 86400_000).toISOString(), resolved: false },
            ],
            pagination: { page: 1, limit: 50, total: 3 },
        }),
    },
    {
        match: (u) => u.includes('/alerts/rules'),
        response: () => ([
            { _id: 'rule_1', name: 'MOS < 3.5', description: 'Alert when MOS drops below 3.5', smartBaseline: false, metricExpressions: [{ metric: 'MOS', operator: 'LT', threshold: 3.5 }], durationWindowSec: 300, eventTrigger: 'metric_breach', severity: 'warning', enabled: true, isSystemDefault: true, createdAt: '2025-01-15T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z' },
            { _id: 'rule_2', name: 'SIP Errors > 5%', description: 'Alert when SIP error rate exceeds 5%', smartBaseline: false, metricExpressions: [{ metric: 'SIP_ERROR_RATE', operator: 'GT', threshold: 5 }], durationWindowSec: 180, eventTrigger: 'metric_breach', severity: 'critical', enabled: true, isSystemDefault: true, createdAt: '2025-01-15T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z' },
            { _id: 'rule_3', name: 'Queue Wait > 60s', description: 'Alert when queue wait time exceeds 60 seconds', smartBaseline: true, metricExpressions: [{ metric: 'QUEUE_WAIT_TIME', operator: 'GT', threshold: 60 }], durationWindowSec: 120, eventTrigger: 'metric_breach', severity: 'warning', enabled: false, isSystemDefault: false, createdAt: '2025-03-10T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z' },
        ]),
    },

    // Alert channels & routes
    {
        match: (u) => u.includes('/alerts/routes'), response: () => ([
            { _id: 'rt_1', name: 'Critical → Ops Team', events: ['QUAL_VIOLATION', 'SYSTEM_DEGRADATION'], severity: 'critical' as const, channelIds: [{ _id: 'ch_email', name: 'Email Alerts' }, { _id: 'ch_feishu', name: 'Feishu Bot' }], enabled: true, cooldownSec: 300, createdAt: '2025-06-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z' },
            { _id: 'rt_2', name: 'Warning → Slack', events: ['EMOTION_BURNOUT'], severity: 'warning' as const, channelIds: [{ _id: 'ch_slack', name: 'Slack #ops-alerts' }], enabled: true, cooldownSec: 600, createdAt: '2025-06-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z' },
            { _id: 'rt_3', name: 'All Events → SMS On-call', events: [], severity: 'all' as const, channelIds: [{ _id: 'ch_email', name: 'Email Alerts' }], enabled: false, cooldownSec: 900, createdAt: '2025-06-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z' },
        ])
    },
    {
        match: (u) => u.includes('/alerts/channels'), response: () => ([
            { _id: 'ch_email', type: 'email', name: 'Email Alerts', config: { recipients: 'ops@example.com' }, enabled: true, createdAt: '2025-06-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z' },
            { _id: 'ch_slack', type: 'slack', name: 'Slack #ops-alerts', config: { webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx' }, enabled: true, createdAt: '2025-06-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z' },
            { _id: 'ch_feishu', type: 'feishu', name: 'Feishu Bot', config: { webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx' }, enabled: true, createdAt: '2025-06-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z' },
        ])
    },

    // Alerts — dashboard widget 用的 (通用告警列表 + history)
    { match: (u) => u.includes('/alerts'), response: () => MOCK_ALERTS },

    // Platform modules (feature flags) are passed through to backend via api.ts interceptor exception

    // Contacts — timeline 必须在 detail 前面匹配 (更长的路径优先)
    {
        match: (u) => /\/contacts\/[^/]+\/timeline/.test(u),
        response: () => ({
            data: [
                {
                    type: 'sip_call',
                    timestamp: new Date(Date.now() - 3600_000 * 2).toISOString(),
                    data: {
                        duration: '4:32',
                        agent_name: 'Alice Wonderland',
                        direction: 'inbound',
                        disposition: 'resolved',
                        mos: 4.2,
                        ai_summary: {
                            raw_summary: 'Customer called regarding SLA breach on their enterprise contract. Agent acknowledged the issue, offered a $50 credit, and escalated to the retention team for a follow-up review within 48 hours.',
                            topics: ['SLA', 'Credit', 'Retention'],
                        },
                    },
                },
                {
                    type: 'omni_message',
                    timestamp: new Date(Date.now() - 3600_000 * 26).toISOString(),
                    data: { sender: 'customer', text: 'I\'ve been experiencing repeated disconnections during peak hours. This is the third time this week.' },
                },
                {
                    type: 'omni_message',
                    timestamp: new Date(Date.now() - 3600_000 * 25.5).toISOString(),
                    data: { sender: 'bot', text: 'I\'m sorry to hear that. I\'ve flagged this to our network team. A technician will contact you within 2 hours.' },
                },
                {
                    type: 'sip_call',
                    timestamp: new Date(Date.now() - 3600_000 * 72).toISOString(),
                    data: {
                        duration: '6:15',
                        agent_name: 'Bob Builder',
                        direction: 'outbound',
                        disposition: 'follow_up',
                        mos: 3.8,
                        ai_summary: {
                            raw_summary: 'Proactive outreach about upcoming contract renewal. Customer expressed concerns about pricing and mentioned evaluating competitor offerings. Agent scheduled a demo of new premium features.',
                            topics: ['Renewal', 'Pricing', 'Competition'],
                        },
                    },
                },
                {
                    type: 'action_draft',
                    timestamp: new Date(Date.now() - 3600_000 * 1).toISOString(),
                    data: {
                        intentName: 'SLA Credit Issuance',
                        draft: { action: 'issue_credit', amount: 50, currency: 'USD', channel: 'WhatsApp', reason: 'SLA breach - 3x routing loops in 48h' },
                    },
                },
            ],
        }),
    },
    {
        match: (u) => /\/contacts\/[^/?]+/.test(u) && !u.includes('/timeline'),
        response: () => ({
            data: {
                _id: 'mock_contact_001',
                displayName: 'Marcus Johnson',
                company: 'Acme Corp',
                tags: ['VIP', 'Enterprise'],
                identifiers: {
                    phone: ['+1 (555) 234-5678', '+1 (555) 876-5432'],
                    email: ['marcus.johnson@acmecorp.com'],
                },
                createdAt: '2025-06-15T10:00:00Z',
                totalCalls: 12,
                avgSentiment: -0.3,
                churnRisk: 0.72,
                stage: 'Customer',
                lastContactChannel: 'voice',
                lastContactedAt: new Date(Date.now() - 3600_000 * 2).toISOString(),
                mergedFrom: [],
                aiProfile: {
                    persona: 'High-Touch Enterprise Decision Maker',
                    coreFrustration: 'Recurring billing discrepancies and slow support response times',
                    currentIntent: 'Seeking resolution for latest invoice dispute and potential plan upgrade',
                    nextBestAction: 'Schedule a dedicated account review call and offer a prorated credit for the billing error.',
                    sentimentTrend: 'Deteriorating',
                    keyTopics: ['Billing', 'SLA', 'Plan Upgrade', 'Support Response', 'Invoice'],
                    lastGeneratedAt: new Date(Date.now() - 86400_000).toISOString(),
                    generatedBy: 'gpt-4o',
                },
            },
        }),
    },

    // Contacts list
    {
        match: (u) => u.includes('/contacts') && !u.includes('/contacts/'),
        response: () => ({
            data: {
                data: [
                    { _id: 'mock_contact_001', displayName: 'Marcus Johnson', company: 'Acme Corp', lastContactAt: new Date(Date.now() - 3600_000 * 2).toISOString(), totalCalls: 12 },
                    { _id: 'mock_contact_002', displayName: 'Sarah Chen', company: 'TechFlow Inc', lastContactAt: new Date(Date.now() - 3600_000 * 8).toISOString(), totalCalls: 7 },
                    { _id: 'mock_contact_003', displayName: 'David Miller', company: 'CloudBase', lastContactAt: new Date(Date.now() - 3600_000 * 24).toISOString(), totalCalls: 3 },
                ],
                pagination: { total: 3 }
            }
        }),
    },

    // ──────────── 以下为系统页面批量 mock ────────────

    // Omnichannel Templates
    {
        match: (u) => u.includes('/templates') && !u.includes('/alerts') && !u.includes('/wfm') && !u.includes('/qi'),
        response: () => ({
            data: {
                data: [
                    { _id: 'tpl_welcome', name: 'Welcome Message', channel: 'WhatsApp', category: 'greeting', content: 'Hello {{name}}, thank you for contacting us! How can I help you today?', status: 'active', createdAt: '2025-02-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z', translations: [{ language: 'en_US' }] },
                    {
                        _id: 'tpl_followup', name: 'Follow-up Survey', channel: 'Email', category: 'survey', content: 'Hi {{name}}, we\'d love your feedback on your recent interaction.', status: 'active', createdAt: '2025-03-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z', translations: [{ language: 'en_US' }]
                    },
                    { _id: 'tpl_sla_apology', name: 'SLA Breach Apology', channel: 'SMS', category: 'apology', content: 'We apologize for the delay, {{name}}. Your case {{ticket_id}} has been escalated.', status: 'active', createdAt: '2025-04-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z', translations: [{ language: 'en_US' }] },
                    { _id: 'tpl_promo', name: 'Upgrade Offer', channel: 'WhatsApp', category: 'promotion', content: '🎉 Special offer just for you, {{name}}! Upgrade to Pro and get 30% off.', status: 'draft', createdAt: '2025-05-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z', translations: [{ language: 'en_US' }] },
                ],
                pagination: { total: 4 }
            }
        }),
    },

    // Knowledge Base
    { match: (u) => u.includes('/knowledge/health'), response: () => ({ status: 'healthy', totalDocs: 128, lastSync: new Date(Date.now() - 3600_000).toISOString() }) },
    { match: (u) => u.includes('/knowledge/search'), response: () => ({ data: [], total: 0 }) },
    {
        match: (u) => u.includes('/knowledge') && !u.includes('/health') && !u.includes('/search'),
        response: () => ({
            data: {
                data: [
                    { _id: 'kb_1', title: 'Product FAQ', content: 'Answers to common questions about our platform, including features, integrations, and supported channels.', category: 'faq', tags: ['product', 'pricing', 'tiers'], chunks: 45, status: 'indexed', createdAt: '2025-01-15T10:00:00Z', updatedAt: '2025-01-15T10:00:00Z' },
                    { _id: 'kb_2', title: 'Troubleshooting Guide', content: 'Step-by-step instructions for resolving common connectivity issues and error codes in the widget.', category: 'product', tags: ['tech', 'errors', 'debug'], chunks: 82, status: 'indexed', createdAt: '2025-02-01T10:00:00Z', updatedAt: '2025-02-03T14:20:00Z' },
                    { _id: 'kb_3', title: 'Pricing & Billing', content: 'Details on our subscription models, usage-based fees, and enterprise SLA commitments.', category: 'policy', tags: ['billing', 'invoice', 'sales'], chunks: 23, status: 'indexed', createdAt: '2025-03-01T10:00:00Z', updatedAt: '2025-03-01T11:05:00Z' },
                    { _id: 'kb_4', title: 'Return Policy', content: 'Customer refund and return procedures including standardized forms and approval chains.', category: 'policy', tags: ['refund', 'support', 'cs'], chunks: 12, status: 'indexed', createdAt: '2025-04-01T10:00:00Z', updatedAt: '2025-04-02T09:15:00Z' },
                ],
                pagination: { total: 4, limit: 100, offset: 0 }
            }
        }),
    },

    // SOP Library
    {
        match: (u) => /\/sops\/[^/?]+/.test(u),
        response: () => ({
            data: {
                _id: 'sop_1', name: 'Angry Customer De-escalation', description: 'Handles frustrated customers immediately', category: 'Support',
                nodes: [
                    { id: 'n1', type: 'HUMAN_HANDOFF', label: 'Escalate to L2', metadata: { x: 50, y: 50 } },
                    { id: 'n2', type: 'VOICE_PROMPT', label: 'Apology Script', voicePrompt: 'I am so sorry about that issue...', metadata: { x: 250, y: 150 } }
                ],
                edges: [
                    { id: 'e1', source: 'n1', target: 'n2', conditionType: 'DEFAULT' }
                ],
                createdAt: '2025-01-10T10:00:00Z',
            },
        }),
    },
    {
        match: (u) => u.includes('/sops'),
        response: () => ({
            data: {
                data: [
                    { _id: 'sop_1', name: 'Angry Customer De-escalation', description: 'Handles frustrated customers immediately', category: 'Support', status: 'PUBLISHED', nodes: [1, 2, 3, 4], createdAt: '2025-01-10T10:00:00Z' },
                    { _id: 'sop_2', name: 'New Customer Onboarding', description: 'Standard onboarding flow for paid users', category: 'Sales', status: 'PUBLISHED', nodes: [1, 2, 3], createdAt: '2025-02-15T10:00:00Z' },
                    { _id: 'sop_3', name: 'SLA Breach Handling', description: 'Escalation flow when reply SLA breaches', category: 'Operations', status: 'PUBLISHED', nodes: [1, 2, 3, 4, 5], createdAt: '2025-03-01T10:00:00Z' },
                    { _id: 'sop_4', name: 'Technical Escalation Flow', description: 'Escalate to L2 tech support', category: 'Technical', status: 'DRAFT', nodes: [1, 2], createdAt: '2025-04-01T10:00:00Z' },
                ],
                pagination: { total: 4 }
            }
        }),
    },

    // Analytics Topics
    {
        match: (u) => u.includes('/analytics/summary/topics'),
        response: () => ({
            data: {
                data: [
                    { text: "Billing Support", value: 120 },
                    { text: "Password Reset", value: 85 },
                    { text: "Product Inquiry", value: 65 },
                    { text: "Cancel Subscription", value: 45 },
                    { text: "Technical Issue", value: 150 },
                    { text: "Account Setup", value: 95 },
                    { text: "Refund Request", value: 40 },
                    { text: "Upgrade Plan", value: 70 },
                    { text: "API Integration", value: 55 },
                    { text: "Login Failure", value: 110 }
                ]
            }
        }),
    },

    // Omnichannel analytics
    {
        match: (u) => u.includes('/omnichannel-analytics/demo-messages'),
        response: () => ({
            data: [
                { _id: 'm1', sender: 'customer', text: 'Hi, I need help with my order #1234', timestamp: new Date(Date.now() - 300_000).toISOString() },
                { _id: 'm2', sender: 'bot', text: 'I\'d be happy to help! Let me look up order #1234 for you.', timestamp: new Date(Date.now() - 280_000).toISOString() },
                { _id: 'm3', sender: 'bot', text: 'I found your order. It\'s currently in transit and expected to arrive by tomorrow.', timestamp: new Date(Date.now() - 260_000).toISOString() },
                { _id: 'm4', sender: 'customer', text: 'Great, thanks!', timestamp: new Date(Date.now() - 240_000).toISOString() },
            ],
        }),
    },
    {
        match: (u) => u.includes('/omnichannel-analytics/demo-list'),
        response: () => ({
            data: {
                data: [
                    { _id: 'conv_1', metadata: { visitorName: 'Marcus Johnson', intent: 'support' }, channel: 'whatsapp', subject: 'Thanks for the update!', status: 'resolved', createdAt: new Date(Date.now() - 3600_000).toISOString(), lastMessageAt: new Date(Date.now() - 1800_000).toISOString(), unreadCount: 0, tags: ['billing'] },
                    { _id: 'conv_2', metadata: { visitorName: 'Sarah Chen', intent: 'sales' }, channel: 'webchat', subject: 'Can I upgrade my plan?', status: 'active', createdAt: new Date(Date.now() - 1200_000).toISOString(), lastMessageAt: new Date(Date.now() - 600_000).toISOString(), unreadCount: 1, tags: ['vip'] },
                    { _id: 'conv_3', metadata: { visitorName: 'David Miller', intent: 'support' }, channel: 'email', subject: 'Please see attached invoice', status: 'queued', createdAt: new Date(Date.now() - 7400_000).toISOString(), lastMessageAt: new Date(Date.now() - 7200_000).toISOString(), unreadCount: 1, tags: [] },
                ]
            }
        }),
    },
    {
        match: (u) => u.includes('/omnichannel-analytics/dashboard'),
        response: () => ({
            data: {
                queued: 3, botHandling: 5, agentsActive: 12, resolvedToday: 87,
                avgFirstResponse: 45, avgResolutionTime: 320, csat: 4.2,
            },
        }),
    },

    // Conversations (inbox)
    { match: (u) => u.includes('/conversations/bot-config'), response: () => ({ data: { enabled: true, model: 'gpt-4o-mini', maxTokens: 1024, temperature: 0.7 } }) },
    { match: (u) => u.includes('/conversations/im-agents'), response: () => ({ data: ['a_1001', 'a_1003', 'a_1005', 'a_1010'] }) },
    {
        match: (u) => /\/api\/conversations\/[^\/]+\/messages/.test(u),
        response: () => {
            const isTypingRandom = Math.random() > 0.5;
            const messages = [
                { id: `m1_${Date.now()}`, role: 'user', content: 'Hello, I have an issue with my recent order.', timestamp: new Date(Date.now() - 60000).toISOString() },
                { id: `m2_${Date.now()}`, role: 'agent', content: 'Hi there! Im sorry to hear that. Could you please provide your order ID?', timestamp: new Date(Date.now() - 45000).toISOString() },
                { id: `m3_${Date.now()}`, role: 'user', content: 'Yes, it is #ORD-12345678.', timestamp: new Date(Date.now() - 30000).toISOString() },
                { id: `m4_${Date.now()}`, role: 'agent', content: 'Thank you. Let me pull up your order details right now.', timestamp: new Date(Date.now() - 15000).toISOString() }
            ];

            // Randomly append a "typing" or "speaking" state for realistic live monitoring
            if (isTypingRandom) {
                // Determine channel type roughly from the URL or just random if unknown in this mock context
                const isVoice = Math.random() > 0.7; // 30% chance it's a voice call
                messages.push({
                    id: `m_live_${Date.now()}`,
                    role: 'agent',
                    content: '',
                    timestamp: new Date().toISOString(),
                    // Include the magic flags for the UI
                    // @ts-ignore - appending dynamic metadata
                    isTyping: !isVoice,
                    // @ts-ignore
                    audioLevel: isVoice ? Math.random() * 100 : 0
                });
            }

            return { data: messages };
        }
    },
    {
        match: (u) => /\/conversations\/[^/?]+\/context/.test(u),
        response: () => ({ data: { contactId: 'mock_contact_001', displayName: 'Marcus Johnson', sentiment: -0.3, persona: 'VIP' } }),
    },
    {
        match: (u) => /\/conversations\/[^/?]+$/.test(u.split('?')[0]) && !u.includes('/context') && !u.includes('/messages'),
        response: () => ({ data: { _id: 'conv_1', channel: 'WhatsApp', status: 'active', messages: [] } }),
    },
    {
        match: (u) => u.includes('/conversations') && !u.includes('/conversations/'),
        response: () => ({ data: [], total: 0 }),
    },

    // QI (Quality Inspection)
    {
        match: (u) => u.includes('/qi/wizard/templates'), response: () => ({
            data: [
                { _id: 'qi_tpl_1', name: 'Standard Service Checklist', category: 'service', items: 10 },
                { _id: 'qi_tpl_2', name: 'Sales Compliance', category: 'compliance', items: 8 },
            ]
        })
    },
    { match: (u) => u.includes('/qi/status'), response: () => ({ enabled: true, rulesCount: 12, lastRun: new Date(Date.now() - 1800_000).toISOString() }) },
    { match: (u) => u.includes('/qi/stats'), response: () => ({ data: { totalInspections: 847, avgScore: 76.3, passRate: 82.1, trend: 'up' } }) },
    {
        match: (u) => u.includes('/qi/checklists'), response: () => ({
            data: [
                { _id: 'cl_1', name: 'Default Checklist', itemsCount: 10, enabled: true },
                { _id: 'cl_2', name: 'Sales Compliance', itemsCount: 8, enabled: true },
            ]
        })
    },
    { match: (u) => u.includes('/qi/scores'), response: () => ({ data: [], total: 0, page: 1, limit: 20 }) },
    { match: (u) => u.includes('/qi/analytics'), response: () => ({ data: [] }) },

    // Platform calls detail
    { match: (u) => /\/platform\/calls\/active/.test(u), response: () => ({ data: MOCK_LIVE_CALLS.data }) },
    {
        match: (u) => /\/platform\/calls\/[^/?]+/.test(u), response: () => ({
            data: {
                call_id: 'demo_call_001', caller: '+1(555) 100-8998', callee: '1001', direction: 'inbound',
                start_time: new Date(Date.now() - 245_000).toISOString(), duration: 245, status: 'completed',
                mos: 4.3, codec: 'opus', agent_name: 'Alice Wonderland',
            }
        })
    },
    { match: (u) => u.includes('/platform/events'), response: () => ({ data: [], total: 0 }) },
    { match: (u) => u.includes('/platform/active-calls'), response: () => ({ data: MOCK_LIVE_CALLS.data }) },
    { match: (u) => u.includes('/platform/agents/available'), response: () => ({ data: ['1001', '1003', '1005', '1010', '1013'] }) },

    // Webhooks & Integrations
    {
        match: (u) => u.includes('/platform/webhooks'),
        response: () => ({
            data: [
                { _id: 'wh_1', name: 'CRM Sync', url: 'https://crm.acmecorp.com/sip-webhook', events: ['call.completed', 'call.started'], enabled: true, status: 'healthy', lastDelivery: new Date(Date.now() - 900_000).toISOString(), createdAt: '2025-01-15T10:00:00Z' },
                { _id: 'wh_2', name: 'Slack Notifications', url: 'https://hooks.slack.com/services/T00/B00/xxx', events: ['alert.fired'], enabled: true, status: 'healthy', lastDelivery: new Date(Date.now() - 3600_000).toISOString(), createdAt: '2025-02-01T10:00:00Z' },
            ],
        }),
    },
    { match: (u) => u.includes('/integrations'), response: () => ({ data: [] }) },

    // Audit Logs
    {
        match: (u) => u.includes('/audit'),
        response: () => ({
            data: [
                { _id: 'al_1', action: 'user.login', user: 'admin@example.com', ip: '192.168.1.100', timestamp: new Date(Date.now() - 1800_000).toISOString(), details: { method: 'password' } },
                { _id: 'al_2', action: 'rule.created', user: 'sarah.ops@example.com', ip: '10.0.0.52', timestamp: new Date(Date.now() - 3600_000).toISOString(), details: { ruleName: 'MOS < 3.5' } },
                { _id: 'al_3', action: 'agent.status_changed', user: 'system', ip: '-', timestamp: new Date(Date.now() - 5400_000).toISOString(), details: { agentId: 'a_1001', from: 'available', to: 'on_call' } },
            ],
            total: 3,
        }),
    },

    // Action Center
    {
        match: (u) => u.includes('/platform/actions/intents'), response: () => ({
            data: [
                { _id: 'ai_001', slug: 'issue_credit', name: 'Issue Credit', category: 'billing', enabled: true },
                { _id: 'ai_002', slug: 'schedule_callback', name: 'Schedule Callback', category: 'support', enabled: true },
                { _id: 'ai_003', slug: 'escalate_supervisor', name: 'Escalate to Supervisor', category: 'support', enabled: true },
            ]
        })
    },
    { match: (u) => u.includes('/platform/actions/history'), response: () => ({ data: [], total: 0 }) },
    { match: (u) => u.includes('/intents'), response: () => ({ data: [] }) },

    // RBAC & Auth
    {
        match: (u) => u.includes('/rbac/roles'), response: () => ([
            { _id: 'role_admin', slug: 'platform_admin', name: 'Platform Admin', description: 'Full platform access with all permissions', permissions: ['*'], isSystem: true },
            { _id: 'role_sup', slug: 'supervisor', name: 'Supervisor', description: 'Manage agents and view reports', permissions: ['agents.read', 'agents.write', 'calls.read', 'reports.read', 'qi.read'], isSystem: true },
            { _id: 'role_agent', slug: 'agent', name: 'Agent', description: 'Handle calls and view own performance', permissions: ['calls.read', 'calls.handle'], isSystem: true },
            { _id: 'role_analyst', slug: 'analyst', name: 'Analyst', description: 'View reports and analytics data', permissions: ['reports.read', 'analytics.read', 'qi.read'], isSystem: false },
        ])
    },
    {
        match: (u) => u.includes('/rbac/permissions'), response: () => ([
            { _id: 'p_all', slug: '*', name: 'Root Access', description: 'Grants all permissions', module: 'system' },
            { _id: 'p_ag_r', slug: 'agents.read', name: 'View Agents', description: 'View agent list and profiles', module: 'agents' },
            { _id: 'p_ag_w', slug: 'agents.write', name: 'Manage Agents', description: 'Create, edit, and delete agents', module: 'agents' },
            { _id: 'p_call_r', slug: 'calls.read', name: 'View Calls', description: 'View call history and recordings', module: 'calls' },
            { _id: 'p_call_h', slug: 'calls.handle', name: 'Handle Calls', description: 'Accept and transfer calls', module: 'calls' },
            { _id: 'p_rpt', slug: 'reports.read', name: 'View Reports', description: 'Access dashboards and reports', module: 'reports' },
            { _id: 'p_set', slug: 'settings.write', name: 'Manage Settings', description: 'Change system configuration', module: 'settings' },
            { _id: 'p_qi', slug: 'qi.read', name: 'View QI', description: 'View quality inspection results', module: 'quality' },
            { _id: 'p_an', slug: 'analytics.read', name: 'View Analytics', description: 'Access analytics and BI dashboards', module: 'reports' },
        ])
    },
    {
        match: (u) => u.includes('/auth/sessions'), response: () => ([
            { id: 'sess_1', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', ipAddress: '192.168.1.100', lastActive: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400_000 * 7).toISOString() },
            { id: 'sess_2', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', ipAddress: '10.0.2.55', lastActive: new Date(Date.now() - 3600_000 * 4).toISOString(), expiresAt: new Date(Date.now() + 86400_000 * 3).toISOString() },
            { id: 'sess_3', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', ipAddress: '172.16.0.88', lastActive: new Date(Date.now() - 86400_000).toISOString(), expiresAt: new Date(Date.now() + 86400_000 * 2).toISOString() },
        ])
    },
    { match: (u) => u.includes('/setup/status'), response: () => ({ completed: true, step: 'done' }) },

    // Speech Emotion Recognition
    { match: (u) => u.includes('/speech-emotion/config'), response: () => ({ data: { enabled: true, realtimeEnabled: true, postCallEnabled: true, vendor: 'onnx', model: 'ser-v2' } }) },
    { match: (u) => u.includes('/speech-emotion/analytics'), response: () => ({ data: [] }) },
    { match: (u) => u.includes('/speech-emotion/results'), response: () => ({ data: null }) },
    // Emotion Anchors (管理页 + 预设加载)
    {
        match: (u) => u.includes('/speech-emotion/anchors') && !u.includes('anchor-presets'),
        response: () => ({
            data: {
                happy: ['thank you', 'great', 'wonderful', 'appreciate it', 'love it', 'perfect', 'awesome'],
                angry: ['unacceptable', 'terrible', 'worst ever', 'furious', 'outrageous', 'disgusting', 'ridiculous'],
                sad: ['disappointed', 'unfortunately', 'heartbroken', 'let down', 'regret', 'sorry to hear'],
                frustrated: ['waited too long', 'keeps happening', 'not working', 'waste of time', 'impossible', 'fed up'],
                neutral: ['okay', 'sure', 'I see', 'alright', 'fine', 'understood', 'got it'],
                fear: ['worried', 'scared', 'concerned', 'afraid', 'nervous', 'anxious'],
                surprise: ['wow', 'really', 'no way', 'unexpected', 'incredible', 'amazing'],
            },
        }),
    },
    {
        match: (u) => u.includes('/speech-emotion/anchor-presets/locales'),
        response: () => ({
            data: [
                { code: 'en', label: 'English' }, { code: 'zh', label: '中文' },
                { code: 'ja', label: '日本語' }, { code: 'ko', label: '한국어' },
                { code: 'es', label: 'Español' }, { code: 'ar', label: 'العربية' },
            ],
        }),
    },
    {
        match: (u) => u.includes('/speech-emotion/anchor-presets/'),
        response: () => ({
            data: {
                happy: ['thank you so much', 'this is great', 'I really appreciate it', 'wonderful service', 'you made my day'],
                angry: ['this is unacceptable', 'I want to speak to a manager', 'terrible experience', 'worst service ever'],
                sad: ['I feel let down', 'this is disappointing', 'unfortunately', 'I regret this'],
                frustrated: ['I have been waiting forever', 'this keeps happening', 'nothing is working'],
                neutral: ['okay', 'I understand', 'sure', 'alright', 'fine'],
                fear: ['I am worried', 'this is concerning', 'I am afraid', 'what if it fails'],
                surprise: ['wow really', 'I did not expect that', 'no way', 'that is incredible'],
            },
        }),
    },

    // Platform health & vendors
    { match: (u) => u.includes('/platform/health'), response: () => ({ data: { status: 'healthy', uptime: 864000, version: '0.0.5' } }) },
    { match: (u) => u.includes('/platform/asr-vendors'), response: () => ({ data: [{ id: 'google', name: 'Google STT', status: 'active' }, { id: 'whisper', name: 'Whisper', status: 'active' }] }) },
    { match: (u) => u.includes('/platform/llm-vendors'), response: () => ({ data: [{ id: 'openai', name: 'OpenAI', model: 'gpt-4o-mini', status: 'active' }] }) },
    { match: (u) => u.includes('/platform/storage-vendors'), response: () => ({ data: [{ id: 's3', name: 'AWS S3', status: 'active' }] }) },
    { match: (u) => u.includes('/platform/summary-schemas'), response: () => ({ data: [] }) },
    { match: (u) => u.includes('/platform/post-call-asr'), response: () => ({ data: { enabled: false } }) },
    {
        match: (u) => u.includes('/platform/recording-uploads'), response: () => ({
            data: {
                enabled: true,
                queueLength: 2,
                stats: { uploaded: 1283, failed: 3, queued: 2, uploading: 1 },
                recent: [
                    { callId: 'call-2026-0301-00a1', localPath: '/recordings/2026/03/01/00a1.wav', cloudUri: 's3://cxmi-recordings/00a1.wav', status: 'uploaded', attempts: 1, fileSize: 4_800_000, realm: 'production', uploadedAt: new Date(Date.now() - 600_000).toISOString(), updatedAt: new Date(Date.now() - 600_000).toISOString() },
                    { callId: 'call-2026-0301-00b2', localPath: '/recordings/2026/03/01/00b2.wav', cloudUri: 's3://cxmi-recordings/00b2.wav', status: 'uploading', attempts: 1, fileSize: 3_200_000, realm: 'production', updatedAt: new Date(Date.now() - 120_000).toISOString() },
                    { callId: 'call-2026-0228-ff03', localPath: '/recordings/2026/02/28/ff03.wav', cloudUri: '', status: 'failed', attempts: 3, lastError: 'S3 PutObject timeout after 30s', fileSize: 8_100_000, realm: 'production', updatedAt: new Date(Date.now() - 3600_000).toISOString() },
                    { callId: 'call-2026-0301-00c4', localPath: '/recordings/2026/03/01/00c4.wav', cloudUri: '', status: 'queued', attempts: 0, fileSize: 5_500_000, realm: 'production', updatedAt: new Date(Date.now() - 30_000).toISOString() },
                    { callId: 'call-2026-0301-00d5', localPath: '/recordings/2026/03/01/00d5.wav', cloudUri: 's3://cxmi-recordings/00d5.wav', status: 'uploaded', attempts: 1, fileSize: 2_900_000, realm: 'production', uploadedAt: new Date(Date.now() - 1800_000).toISOString(), updatedAt: new Date(Date.now() - 1800_000).toISOString() },
                ],
            },
        }),
    },
    { match: (u) => u.includes('/platform/groups'), response: () => MOCK_GROUPS },

    // Analytics (broader catch for remaining analytics endpoints)
    { match: (u) => u.includes('/analytics/') && !u.includes('/sla/') && !u.includes('/outcome') && !u.includes('/roi') && !u.includes('/ai-cost'), response: () => ({ data: [] }) },
    // WFM extras
    { match: (u) => u.includes('/platform/wfm/holidays'), response: () => ({ data: [] }) },
    { match: (u) => u.includes('/platform/wfm/requests'), response: () => ({ data: [] }) },
];


/**
 * 在 demo 模式下处理 GET 请求。
 * 返回匹配的 mock 数据或 null(表示不拦截,放行到网络)。
 */
export function handleMockGet(config: InternalAxiosRequestConfig): any | null {
    const url = config.url || '';

    for (const route of MOCK_ROUTES) {
        if (route.match(url)) {
            console.log(`[Mock API] ✅ ${url}`);
            return {
                data: route.response(url),
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
                request: {},
            };
        }
    }

    // 未匹配到的 GET 请求, 返回通用空成功
    console.warn(`[Mock API] ⚠️ Unmatched GET: ${url}`);
    return {
        data: { data: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: {},
    };
}
