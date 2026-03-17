import type { AuditLog, AuditStats, TimelineData, LeaderboardData } from '../types/audit';

// --- Interfaces (matching those used in pages) ---

export interface MockUser {
    _id: string;
    email: string;
    displayName: string;
    role: string;
    status: 'active' | 'inactive';
    clientId?: { _id: string; name: string };
    lastLogin?: string;
    createdAt: string;
}

export interface MockAgent {
    _id: string;
    sipNumber: string;
    displayName: string;
    email: string;
    status: 'active' | 'inactive';
    clientId?: { _id: string, name: string } | string;
    pcapPolicy?: 'disabled' | 'optional' | 'enforced';
    asrPolicy?: 'disabled' | 'optional' | 'enforced';
    summaryPolicy?: 'disabled' | 'optional' | 'enforced';
    assistantPolicy?: 'disabled' | 'optional' | 'enforced';
    createdAt: string;
}

export interface MockCall {
    call_id: string;
    timestamp: string;
    caller: string;
    callee: string;
    from_domain: string;
    to_domain: string;
    last_method: string;
    last_status: number;
    client_id: string;
    duration: number;
    direction?: 'inbound' | 'outbound';
    call_answered?: string;
    call_ended?: string;
    call_type?: string;
    hangup_by?: string;
    agent_number?: string;
    disconnect_reason?: string;
}

export interface MockCallEvent {
    timestamp: string;
    call_id: string;
    realm: string;
    event_type: string;
    caller_uri: string;
    callee_uri: string;
    src_ip: string;
    dst_ip: string;
    method: string;
    status_code: number;
    body: string;
    src_country?: string;
    src_city?: string;
    dst_country?: string;
    dst_city?: string;
    client_id?: string;
}

// --- Data Generators ---

// const NOW = new Date();
const ONE_DAY = 24 * 60 * 60 * 1000;

const CLIENT_A = { _id: 'c_001', name: 'TechCorp Inc.' };
const CLIENT_B = { _id: 'c_002', name: 'GlobalBank Financial' };
const CLIENT_C = { _id: 'c_003', name: 'HealthPlus HMO' };

const MOCK_USERS: MockUser[] = [
    { _id: 'u_admin_01', email: 'admin@example.com', displayName: 'System Admin', role: 'platform_admin', status: 'active', lastLogin: new Date().toISOString(), createdAt: new Date(Date.now() - 90 * ONE_DAY).toISOString() },
    { _id: 'u_sup_01', email: 'sarah.connor@techcorp.com', displayName: 'Sarah Connor', role: 'client_admin', clientId: CLIENT_A, status: 'active', lastLogin: new Date(Date.now() - 2 * 3600000).toISOString(), createdAt: new Date(Date.now() - 75 * ONE_DAY).toISOString() },
    { _id: 'u_sup_02', email: 'james.lee@globalbank.com', displayName: 'James Lee', role: 'client_admin', clientId: CLIENT_B, status: 'active', lastLogin: new Date(Date.now() - 1 * 3600000).toISOString(), createdAt: new Date(Date.now() - 60 * ONE_DAY).toISOString() },
    { _id: 'u_sup_03', email: 'maria.chen@healthplus.com', displayName: 'Maria Chen', role: 'supervisor', clientId: CLIENT_C, status: 'active', lastLogin: new Date(Date.now() - 4 * 3600000).toISOString(), createdAt: new Date(Date.now() - 55 * ONE_DAY).toISOString() },
    { _id: 'u_agent_01', email: 'agent.smith@techcorp.com', displayName: 'Agent Smith', role: 'agent', clientId: CLIENT_A, status: 'active', lastLogin: new Date(Date.now() - 5 * 60000).toISOString(), createdAt: new Date(Date.now() - 50 * ONE_DAY).toISOString() },
    { _id: 'u_agent_02', email: 'alice.w@techcorp.com', displayName: 'Alice Wonderland', role: 'agent', clientId: CLIENT_A, status: 'active', lastLogin: new Date(Date.now() - 10 * 60000).toISOString(), createdAt: new Date(Date.now() - 45 * ONE_DAY).toISOString() },
    { _id: 'u_agent_03', email: 'bob.builder@techcorp.com', displayName: 'Bob Builder', role: 'agent', clientId: CLIENT_A, status: 'active', lastLogin: new Date(Date.now() - 30 * 60000).toISOString(), createdAt: new Date(Date.now() - 40 * ONE_DAY).toISOString() },
    { _id: 'u_agent_04', email: 'diana.p@globalbank.com', displayName: 'Diana Prince', role: 'agent', clientId: CLIENT_B, status: 'active', lastLogin: new Date(Date.now() - 15 * 60000).toISOString(), createdAt: new Date(Date.now() - 38 * ONE_DAY).toISOString() },
    { _id: 'u_agent_05', email: 'ethan.h@globalbank.com', displayName: 'Ethan Hunt', role: 'agent', clientId: CLIENT_B, status: 'active', lastLogin: new Date(Date.now() - 45 * 60000).toISOString(), createdAt: new Date(Date.now() - 35 * ONE_DAY).toISOString() },
    { _id: 'u_agent_06', email: 'fiona.g@healthplus.com', displayName: 'Fiona Gallagher', role: 'agent', clientId: CLIENT_C, status: 'active', lastLogin: new Date(Date.now() - 3 * 60000).toISOString(), createdAt: new Date(Date.now() - 30 * ONE_DAY).toISOString() },
    { _id: 'u_agent_07', email: 'george.k@healthplus.com', displayName: 'George Kim', role: 'agent', clientId: CLIENT_C, status: 'inactive', lastLogin: new Date(Date.now() - 7 * ONE_DAY).toISOString(), createdAt: new Date(Date.now() - 25 * ONE_DAY).toISOString() },
    { _id: 'u_viewer_01', email: 'helen.t@techcorp.com', displayName: 'Helen Troy', role: 'viewer', clientId: CLIENT_A, status: 'active', lastLogin: new Date(Date.now() - 12 * 3600000).toISOString(), createdAt: new Date(Date.now() - 20 * ONE_DAY).toISOString() },
];

const AGENT_NAMES = [
    ['Alice Wonderland', 'alice.w'], ['Bob Builder', 'bob.b'], ['Charlie Puth', 'charlie.p'],
    ['Diana Prince', 'diana.p'], ['Ethan Hunt', 'ethan.h'], ['Fiona Gallagher', 'fiona.g'],
    ['George Kim', 'george.k'], ['Hannah Montana', 'hannah.m'], ['Ivan Drago', 'ivan.d'],
    ['Julia Roberts', 'julia.r'], ['Kevin Hart', 'kevin.h'], ['Luna Park', 'luna.p'],
    ['Max Power', 'max.p'], ['Nancy Drew', 'nancy.d'], ['Oscar Wilde', 'oscar.w'],
];
const POLICIES: ('disabled' | 'optional' | 'enforced')[] = ['disabled', 'optional', 'enforced'];
const AGENT_CLIENTS = [CLIENT_A, CLIENT_A, CLIENT_A, CLIENT_A, CLIENT_A, CLIENT_B, CLIENT_B, CLIENT_B, CLIENT_B, CLIENT_C, CLIENT_C, CLIENT_C, CLIENT_C, CLIENT_A, CLIENT_B];

const MOCK_AGENTS: MockAgent[] = AGENT_NAMES.map(([name, handle], i) => ({
    _id: `a_${1001 + i}`,
    sipNumber: `${1001 + i}`,
    displayName: name,
    email: `${handle}@example.com`,
    status: i === 8 || i === 13 ? 'inactive' as const : 'active' as const,
    clientId: AGENT_CLIENTS[i],
    pcapPolicy: POLICIES[i % 3],
    asrPolicy: POLICIES[(i + 1) % 3],
    summaryPolicy: POLICIES[(i + 2) % 3],
    assistantPolicy: i < 10 ? 'optional' as const : 'disabled' as const,
    createdAt: new Date(Date.now() - (90 - i * 5) * ONE_DAY).toISOString(),
    // boundUser provides displayName + avatar for Agent Map holographic screens
    boundUser: {
        displayName: name,
        avatar: `/avatars/agent_${(i % 6) + 1}.png`,
    },
}));

// Specific Call Scenarios
const CALL_SCENARIO_INBOUND = {
    id: 'call-demo-inbound-01',
    caller: '+15550101', // Customer
    callee: '1001',      // Agent Alice
    duration: 145,
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString()
};

const CALL_SCENARIO_OUTBOUND = {
    id: 'call-demo-outbound-01',
    caller: '1002',      // Agent Bob
    callee: '+15550199', // Lead
    duration: 210,
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString()
};

const MOCK_CALLS: MockCall[] = [
    {
        call_id: CALL_SCENARIO_INBOUND.id,
        timestamp: CALL_SCENARIO_INBOUND.timestamp,
        caller: CALL_SCENARIO_INBOUND.caller,
        callee: CALL_SCENARIO_INBOUND.callee,
        from_domain: 'sip.example.com',
        to_domain: 'sip.example.com',
        last_method: 'BYE',
        last_status: 200,
        client_id: 'c_001',
        duration: CALL_SCENARIO_INBOUND.duration,
        direction: 'inbound',
        call_answered: new Date(new Date(CALL_SCENARIO_INBOUND.timestamp).getTime() + 6000).toISOString(),
        call_ended: new Date(new Date(CALL_SCENARIO_INBOUND.timestamp).getTime() + CALL_SCENARIO_INBOUND.duration * 1000).toISOString(),
        call_type: 'agent_inbound',
        agent_number: '1001',
        hangup_by: 'customer',
    },
    {
        call_id: CALL_SCENARIO_OUTBOUND.id,
        timestamp: CALL_SCENARIO_OUTBOUND.timestamp,
        caller: CALL_SCENARIO_OUTBOUND.caller,
        callee: CALL_SCENARIO_OUTBOUND.callee,
        from_domain: 'sip.example.com',
        to_domain: 'pstn.provider.net',
        last_method: 'BYE',
        last_status: 200,
        client_id: 'c_001',
        duration: CALL_SCENARIO_OUTBOUND.duration,
        direction: 'outbound',
        call_answered: new Date(new Date(CALL_SCENARIO_OUTBOUND.timestamp).getTime() + 8000).toISOString(),
        call_ended: new Date(new Date(CALL_SCENARIO_OUTBOUND.timestamp).getTime() + CALL_SCENARIO_OUTBOUND.duration * 1000).toISOString(),
        call_type: 'agent_outbound',
        agent_number: '1002',
        hangup_by: 'agent',
    },
    // Generate diverse filler calls across 24h
    ...Array.from({ length: 55 }).map((_, i) => {
        const agentNum = 1001 + (i % 15);
        const isOutbound = i % 3 === 0;
        const failed = i % 11 === 0;
        const cancelled = i % 13 === 0;
        const domains = ['sip.example.com', 'pstn.provider.net', 'trunk.voip.co', 'sbc.enterprise.com'];
        const clientIds = ['c_001', 'c_001', 'c_002', 'c_002', 'c_003'];
        const ts = new Date(Date.now() - (i * 25 + Math.floor(Math.random() * 15)) * 60 * 1000);
        const dur = failed ? 0 : cancelled ? 0 : 30 + Math.floor(Math.random() * 420);
        const ringTimeSec = 5 + (i % 8); // 5-12s
        const answered = (!failed && !cancelled) ? new Date(ts.getTime() + ringTimeSec * 1000).toISOString() : undefined;
        const ended = dur > 0 ? new Date(ts.getTime() + dur * 1000).toISOString() : undefined;
        // call_type 分布: 大部分 agent 呼叫, 少量 system/internal
        const callType = (i % 17 === 0) ? 'system_inbound'
            : (i % 19 === 0) ? 'internal'
                : isOutbound ? 'agent_outbound' : 'agent_inbound';
        const hangupBy = failed ? 'system' : cancelled ? 'system'
            : (['customer', 'agent', 'customer', 'agent', 'customer'] as const)[i % 5];
        const disconnectReason = failed ? '503_SERVICE_UNAVAILABLE'
            : cancelled ? 'CANCEL' : undefined;

        return {
            call_id: `call-demo-${String(i).padStart(3, '0')}`,
            timestamp: ts.toISOString(),
            caller: isOutbound ? `${agentNum}` : `+1${String(5550100 + i).slice(0, 7)}`,
            callee: isOutbound ? `+1${String(5559900 + i).slice(0, 7)}` : `${agentNum}`,
            from_domain: domains[i % domains.length],
            to_domain: domains[(i + 1) % domains.length],
            last_method: cancelled ? 'CANCEL' : 'BYE',
            last_status: failed ? 503 : cancelled ? 487 : 200,
            client_id: clientIds[i % clientIds.length],
            duration: dur,
            direction: isOutbound ? 'outbound' as const : 'inbound' as const,
            call_answered: answered,
            call_ended: ended,
            call_type: callType,
            agent_number: `${agentNum}`,
            hangup_by: hangupBy,
            disconnect_reason: disconnectReason,
        };
    })
];

const GEO_DATA = [
    { c: 'US', city: 'New York' }, { c: 'US', city: 'Los Angeles' }, { c: 'GB', city: 'London' },
    { c: 'JP', city: 'Tokyo' }, { c: 'JP', city: 'Osaka' }, { c: 'CN', city: 'Shanghai' }, { c: 'SG', city: 'Singapore' },
    { c: 'AU', city: 'Sydney' }, { c: 'DE', city: 'Berlin' },
];

const MOCK_EVENTS: MockCallEvent[] = MOCK_CALLS.map((call, i) => ({
    timestamp: call.timestamp,
    call_id: call.call_id,
    realm: call.from_domain,
    event_type: call.last_status === 200 ? 'call_end' : 'call_failed',
    caller_uri: `sip:${call.caller}@${call.from_domain}`,
    callee_uri: `sip:${call.callee}@${call.to_domain}`,
    src_ip: `10.${Math.floor(i / 16)}.${i % 16}.${100 + (i % 50)}`,
    dst_ip: `10.${Math.floor(i / 16) + 1}.${(i + 3) % 16}.${50 + (i % 50)}`,
    method: call.last_method,
    status_code: call.last_status,
    body: '',
    src_country: GEO_DATA[i % GEO_DATA.length].c,
    src_city: GEO_DATA[i % GEO_DATA.length].city,
    dst_country: GEO_DATA[(i + 3) % GEO_DATA.length].c,
    dst_city: GEO_DATA[(i + 3) % GEO_DATA.length].city,
    client_id: call.client_id
}));

// --- Exported Functions ---

export const getMockUsers = () => Promise.resolve({ data: { data: MOCK_USERS } });
export const getMockAgents = () => Promise.resolve({ data: { data: MOCK_AGENTS } });
export const getMockCallEvents = () => Promise.resolve({ data: { data: MOCK_EVENTS } });

export const getMockSOPs = () => Promise.resolve([
    {
        _id: 'sop_demo_01',
        name: 'Standard Customer Greeting',
        description: 'Standard procedure for greeting new customers and establishing account status.',
        category: 'CUSTOMER_SERVICE',
        status: 'PUBLISHED',
        nodes: [
            { id: 'start', type: 'trigger', data: { label: 'Call Connected' }, position: { x: 250, y: 5 } },
            { id: '1', type: 'action', data: { label: 'Say Hello & Give Name' }, position: { x: 250, y: 100 } }
        ],
        edges: [{ id: 'e1', source: 'start', target: '1' }],
        updatedAt: new Date().toISOString()
    },
    {
        _id: 'sop_demo_02',
        name: 'Technical Support Escalation',
        description: 'Steps required before escalating a ticket to Tier 2 support.',
        category: 'TECH_SUPPORT',
        status: 'DRAFT',
        nodes: [],
        edges: [],
        updatedAt: new Date().toISOString()
    },
    {
        _id: 'sop_demo_03',
        name: 'Enterprise Sales Outbound',
        description: 'Qualification framework for enterprise software outbound calling.',
        category: 'SALES',
        status: 'ARCHIVED',
        nodes: [],
        edges: [],
        updatedAt: new Date(Date.now() - 30 * 86400000).toISOString()
    }
]);

// --- Locale-Aware Caller Names ---

const LOCALE_CALLERS: Record<string, string[]> = {
    zh: ['+8613800100001', '+8613912345678', '+8613698765432', '+8615012348765', '+8618612345678', '+8613500012345'],
    ja: ['+81901234567', '+81802345678', '+81703456789', '+81901122334', '+81705566778', '+81803344556'],
    ko: ['+821012345678', '+821023456789', '+821034567890', '+821098765432', '+821087654321', '+821076543210'],
    ar: ['+966501234567', '+966512345678', '+971501234567', '+971521234567', '+962791234567', '+201001234567'],
    es: ['+34612345678', '+34623456789', '+52155012345', '+5491123456789', '+573001234567', '+56912345678'],
    en: ['+15550100', '+15550201', '+15550302', '+15550403', '+447912345678', '+61412345678'],
};

const getLocaleCaller = (locale: string, index: number): string => {
    const pool = LOCALE_CALLERS[locale] || LOCALE_CALLERS['en'];
    return pool[index % pool.length];
};

export const getMockCalls = () => {
    // Read current i18next language at call time (reactive to language switch)
    let lang = 'en';
    try {
        // i18next stores language in localStorage under 'i18nextLng'
        lang = localStorage.getItem('i18nextLng')?.slice(0, 2) || 'en';
    } catch {
        // SSR or no localStorage
    }

    const localizedCalls: MockCall[] = [
        { ...MOCK_CALLS[0] },
        { ...MOCK_CALLS[1] },
        ...MOCK_CALLS.slice(2).map((call, i) => {
            const isOutbound = (i) % 3 === 0;
            return {
                ...call,
                caller: isOutbound ? call.caller : getLocaleCaller(lang, i),
                callee: isOutbound ? getLocaleCaller(lang, i + 5) : call.callee,
            };
        }),
    ];

    return Promise.resolve({ data: { calls: localizedCalls, total: localizedCalls.length } });
};


// Audit Mocks
export const getMockAuditLogs = (): { data: { logs: AuditLog[], total: number } } => {
    const logs: AuditLog[] = [
        {
            timestamp: new Date().toISOString(),
            category: 'auth',
            operator_id: 'u_admin_01',
            operator_name: 'System Admin',
            action: 'login',
            target_id: 'u_admin_01',
            target_name: 'System Admin',
            ip_address: '127.0.0.1',
            user_agent: 'Mozilla/5.0',
            success: 1,
            failure_reason: ''
        },
        {
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            category: 'agent_management',
            operator_id: 'u_sup_01',
            operator_name: 'Sarah Connor',
            action: 'update',
            target_id: 'a_1001',
            target_name: 'Alice Wonderland',
            ip_address: '10.0.0.2',
            user_agent: 'Chrome/90.0',
            success: 1,
            failure_reason: ''
        },
        {
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            category: 'ai_config',
            operator_id: 'u_admin_01',
            operator_name: 'System Admin',
            action: 'update',
            target_id: 'config_global',
            target_name: 'Global AI Config',
            ip_address: '127.0.0.1',
            user_agent: 'Mozilla/5.0',
            success: 0,
            failure_reason: 'Invalid threshold value'
        }
    ];
    return { data: { logs, total: 3 } };
};

export const getMockAuditStats = (): { data: { stats: AuditStats[] } } => ({
    data: {
        stats: [
            { category: 'auth', count: 145, unique_operators: 12 },
            { category: 'call_access', count: 89, unique_operators: 8 },
            { category: 'agent_management', count: 34, unique_operators: 3 },
            { category: 'ai_config', count: 12, unique_operators: 2 }
        ]
    }
});

export const getMockAuditTimeline = (): { data: TimelineData[] } => {
    const data: TimelineData[] = [];
    for (let i = 0; i < 24; i++) {
        data.push({ hour: i, count: Math.floor(Math.random() * 50) });
    }
    return { data };
};

export const getMockAuditLeaderboard = (): { data: LeaderboardData[] } => ({
    data: [
        { operator_id: 'u_sup_01', operator_name: 'Sarah Connor', total_actions: 156, percentage: 45, categories_count: 4 },
        { operator_id: 'u_admin_01', operator_name: 'System Admin', total_actions: 89, percentage: 25, categories_count: 6 },
        { operator_id: 'u_agent_01', operator_name: 'Agent Smith', total_actions: 45, percentage: 13, categories_count: 2 }
    ]
});

// --- Detailed Call Analysis Mocks ---

// Scenario 1: Customer Service Inbound (Billing Question)
// Alice (Agent) helps Customer with an invoice.
const TRANSCRIPT_INBOUND = [
    { timestamp: "00:02", text: "Thank you for calling TechCorp support, this is Alice. How can I help you?", speaker: "callee", emotion: "happy" },
    { timestamp: "00:06", text: "Hi Alice, I'm looking at my bill and there's a charge I don't understand.", speaker: "caller", emotion: "neutral" },
    { timestamp: "00:10", text: "I'd be happy to check that for you. Can you verify your account number?", speaker: "callee", emotion: "neutral" },
    { timestamp: "00:15", text: "Sure, it's 8842-1193.", speaker: "caller", emotion: "neutral" },
    { timestamp: "00:18", text: "Thank you. I see the charge for $49. This looks like the annual renewal fee.", speaker: "callee", emotion: "neutral" },
    { timestamp: "00:24", text: "Oh! I thought I cancelled that last month. I'm actually quite frustrated about this.", speaker: "caller", emotion: "frustrated" },
    { timestamp: "00:30", text: "I apologize for the confusion. Let me check the cancellation log. One moment.", speaker: "callee", emotion: "neutral" },
    { timestamp: "00:45", text: "Okay, I found your request. It was processed late. I'll waive this fee immediately.", speaker: "callee", emotion: "happy" },
    { timestamp: "00:52", text: "Really? That would be great. Thank you so much!", speaker: "caller", emotion: "happy" },
    { timestamp: "00:56", text: "You're very welcome. The refund will appear in 3-5 business days. Anything else?", speaker: "callee", emotion: "happy" },
    { timestamp: "01:02", text: "No, that's all. Thanks Alice.", speaker: "caller", emotion: "happy" },
    { timestamp: "01:05", text: "Have a wonderful day! Goodbye.", speaker: "callee", emotion: "happy" }
];

// Scenario 2: Outbound Sales (Cold Call)
// Bob (Agent) calls a Lead.
const TRANSCRIPT_OUTBOUND = [
    { timestamp: "00:03", text: "Hello?", speaker: "callee", emotion: "neutral" },
    { timestamp: "00:04", text: "Hi, is this Mike? This is Bob from CloudScale Solutions.", speaker: "caller", emotion: "happy" },
    { timestamp: "00:08", text: "Uhh, yes. I'm a bit busy right now.", speaker: "callee", emotion: "neutral" },
    { timestamp: "00:12", text: "I promise to be brief, Mike. I saw your company is expanding and wanted to share how we saved similar firms 30% on cloud costs.", speaker: "caller", emotion: "happy" },
    { timestamp: "00:20", text: "Thirty percent? That sounds like a stretch.", speaker: "callee", emotion: "neutral" },
    { timestamp: "00:24", text: "It does, doesn't it? But we realized most startups over-provision. We have an automated audit tool. Would you be open to a 5-minute demo?", speaker: "caller", emotion: "happy" },
    { timestamp: "00:35", text: "I guess 5 minutes wouldn't hurt. But not today.", speaker: "callee", emotion: "neutral" },
    { timestamp: "00:40", text: "Understood. How about next Tuesday at 10 AM?", speaker: "caller", emotion: "neutral" },
    { timestamp: "00:45", text: "Tuesday 10 AM works. Send me an invite.", speaker: "callee", emotion: "happy" },
    { timestamp: "00:49", text: "Will do. Thanks Mike, talk then!", speaker: "caller", emotion: "happy" }
];

export const getMockCallDetails = (callId: string) => {
    const isOutbound = callId === CALL_SCENARIO_OUTBOUND.id;
    const scenario = isOutbound ? CALL_SCENARIO_OUTBOUND : CALL_SCENARIO_INBOUND;
    const transcript = isOutbound ? TRANSCRIPT_OUTBOUND : TRANSCRIPT_INBOUND;

    const transcriptSegments = transcript.map(t => {
        // Mock NER tagging logic based on keywords
        let ner = [];
        if (t.text.includes('TechCorp') || t.text.includes('CloudScale Solutions')) {
            ner.push({ text: t.text.includes('TechCorp') ? 'TechCorp' : 'CloudScale Solutions', type: 'ORG', offsetIndex: t.text.indexOf('Tech') > -1 ? t.text.indexOf('Tech') : t.text.indexOf('Cloud') });
        }
        if (t.text.includes('$49') || t.text.includes('30%')) {
            ner.push({ text: t.text.includes('$49') ? '$49' : '30%', type: 'MONEY', offsetIndex: t.text.indexOf('$') > -1 ? t.text.indexOf('$') : t.text.indexOf('30') });
        }
        if (t.text.includes('Tuesday')) {
            ner.push({ text: 'Tuesday', type: 'DATE', offsetIndex: t.text.indexOf('Tuesday') });
        }
        if (t.text.includes('Alice') || t.text.includes('Mike') || t.text.includes('Bob')) {
            let name = t.text.includes('Alice') ? 'Alice' : t.text.includes('Mike') ? 'Mike' : 'Bob';
            ner.push({ text: name, type: 'PERSON', offsetIndex: t.text.indexOf(name) });
        }

        return {
            timestamp: t.timestamp,
            text: t.text,
            speaker: t.speaker,
            confidence: +(0.9 + (Math.random() * 0.1)).toFixed(2),
            asrSource: 'post-call',
            sentiment: t.emotion,
            ner: ner.length > 0 ? ner : undefined
        };
    });

    // Realtime has some errors (diff simulation)
    const realtimeSegments = transcriptSegments.map(t => ({
        ...t,
        text: Math.random() > 0.8 ? t.text.replace(/a|e|i|o|u/gi, (match) => Math.random() > 0.5 ? '*' : match) : t.text, // Simple error sim
        confidence: 0.85,
        asrSource: 'realtime'
    }));

    const emotionSegments = transcript.map((t, i) => ({
        startSec: i * 5,
        endSec: (i * 5) + 4,
        speaker: t.speaker,
        emotion: t.emotion,
        confidence: 0.85,
        source: 'text'
    }));

    const insights = {
        callId: callId,
        analyzedAt: new Date().toISOString(),
        callerTalkRatio: isOutbound ? 0.6 : 0.4,
        calleeTalkRatio: isOutbound ? 0.4 : 0.6,
        silenceRatio: 0.1,
        overlapRatio: 0.05,
        silenceEvents: [],
        longestSilenceSec: 3.2,
        interruptionCount: isOutbound ? 1 : 2,
        interruptions: [],
        callerWPM: 140,
        calleeWPM: 135,
        callerSentiment: isOutbound ? 'positive' : 'negative', // Customer starts frustrated or Sales is happy
        calleeSentiment: isOutbound ? 'neutral' : 'positive',  // Lead is neutral or Agent is helpful
        agentScore: isOutbound ? 85 : 92,
        scoreBreakdown: { talkBalance: 20, responsiveness: 22, noInterruption: 20, paceControl: 23 },
        emotionSegments,
        energyTimelineDurationSec: scenario.duration,
        // Detailed AI Tags for the Copilot Right Panel
        tags: isOutbound ? ['Cost Saving Pitch', 'Objection Handled', 'Meeting Scheduled'] : ['Billing Dispute', 'Waiver Applied', 'Success'],
        mainTopics: isOutbound ? ['Cloud Services', 'Cost Audit', 'Pricing'] : ['Invoice Question', 'Annual Fee', 'Refund'],
        actionItems: isOutbound ? ['Send calendar invite for Tuesday 10 AM to Mike'] : ['Process $49 fee waiver', 'Refund timeline: 3-5 days'],
    };

    return {
        callData: {
            call_id: callId,
            ...scenario,
            startTime: scenario.timestamp,
            endTime: new Date(new Date(scenario.timestamp).getTime() + scenario.duration * 1000).toISOString(),
            lastStatus: 200,
            quality: {
                mos: 4.2,
                jitter: 12.5,
                packetLoss: 0.001,
                codec: 'opus',
                pdd_ms: 120,
                quality_grade: 'A'
            },
            transcriptions: transcriptSegments,
            summary: isOutbound
                ? "Agent Bob initiated a cold call to Mike regarding CloudScale Solutions. Pitched a 30% cost savings using an automated audit tool. Mike was initially hesitant but agreed to a 5-minute follow-up demo scheduled for next Tuesday at 10 AM."
                : "Customer called regarding a $49 annual renewal fee on their 8842-1193 account. Agent Alice verified the late cancellation log and waived the fee immediately. Customer was satisfied with the resolution. Refund expected in 3-5 business days.",
            hasFullPcap: true,
            // Mock Audio endpoint (since it's demo Mode, the frontend player will use this or gracefully fail if missing)
            recordingUrl: isOutbound ? '/media/demo-outbound.mp3' : '/media/demo-inbound.mp3'
        },
        insights,
        transcript: transcriptSegments,
        realtimeTranscript: realtimeSegments
    };
};

// --- Quality Inspector (QI) Mocks ---

const SENTIMENTS = ['positive', 'neutral', 'negative', 'mixed'];
const AGENT_IDS = ['1001', '1002', '1003', '1004', '1005'];

export const getMockQIScores = (page = 1, limit = 20) => {
    const total = 47;
    const scores = Array.from({ length: Math.min(limit, total - (page - 1) * limit) }).map((_, i) => {
        const idx = (page - 1) * limit + i;
        const score = 55 + Math.floor(Math.random() * 45); // 55-99
        return {
            timestamp: new Date(Date.now() - idx * 1800 * 1000).toISOString(),
            call_id: `call-qi-${idx.toString().padStart(3, '0')}`,
            client_id: 'c_001',
            agent_id: AGENT_IDS[idx % AGENT_IDS.length],
            overall_score: score,
            sentiment: SENTIMENTS[Math.floor(Math.random() * SENTIMENTS.length)],
            summary: score >= 80
                ? 'Agent handled the call professionally with clear communication.'
                : score >= 60
                    ? 'Adequate handling but missed some service opportunities.'
                    : 'Multiple compliance issues detected, needs coaching.',
            duration_ms: 800 + Math.floor(Math.random() * 3000),
        };
    });
    return Promise.resolve({
        data: {
            scores,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        }
    });
};

export const getMockQIStats = () => Promise.resolve({
    data: {
        stats: {
            total_inspections: 47,
            avg_score: 76.3,
            min_score: 55,
            max_score: 98,
            excellent_count: 19,
            good_count: 18,
            poor_count: 10,
            avg_duration_ms: 2150,
        },
        trend: Array.from({ length: 7 }).map((_, i) => ({
            date: new Date(Date.now() - (6 - i) * ONE_DAY).toISOString().slice(0, 10),
            inspections: 4 + Math.floor(Math.random() * 8),
            avg_score: 70 + Math.floor(Math.random() * 20),
        })),
        agents: AGENT_IDS.map(id => ({
            agent_id: id,
            inspections: 5 + Math.floor(Math.random() * 15),
            avg_score: 65 + Math.floor(Math.random() * 30),
        })),
    }
});

export const getMockQIChecklists = () => Promise.resolve({
    data: [
        {
            _id: 'cl_demo_01',
            clientId: '000000000000000000000000',
            name: 'Customer Service Standard',
            isDefault: true,
            industry: 'General',
            rules: [
                { id: 'r1', name: 'Greeting & Self-Introduction', category: 'compliance', type: 'keyword', weight: 15, config: { keywords: ['hello', 'welcome', 'my name is'] }, enabled: true },
                { id: 'r2', name: 'Customer Identity Verification', category: 'compliance', type: 'semantic', weight: 15, config: { prompt: 'Did the agent verify customer identity?' }, enabled: true },
                { id: 'r3', name: 'Active Listening', category: 'skill', type: 'semantic', weight: 20, config: { prompt: 'Did the agent demonstrate active listening by paraphrasing or confirming?' }, enabled: true },
                { id: 'r4', name: 'No Forbidden Phrases', category: 'compliance', type: 'regex', weight: 10, config: { pattern: '(guaranteed|100%|promise you)' }, enabled: true },
                { id: 'r5', name: 'Resolution Offered', category: 'skill', type: 'semantic', weight: 20, config: { prompt: 'Did the agent offer a clear resolution or next steps?' }, enabled: true },
                { id: 'r6', name: 'Polite Closing', category: 'compliance', type: 'keyword', weight: 10, config: { keywords: ['thank you', 'anything else', 'goodbye'] }, enabled: true },
                { id: 'r7', name: 'Empathy Expression', category: 'skill', type: 'semantic', weight: 10, config: { prompt: 'Did the agent express empathy when the customer was frustrated?' }, enabled: true },
            ]
        }
    ]
});

export const getMockQITemplates = () => Promise.resolve({
    data: [
        { id: 'tpl_cs', name: 'Customer Service', nameZh: '客服质检', icon: '🎧', ruleCount: 8 },
        { id: 'tpl_sales', name: 'Sales Outbound', nameZh: '外呼销售', icon: '📞', ruleCount: 7 },
        { id: 'tpl_finance', name: 'Finance & Banking', nameZh: '金融合规', icon: '🏦', ruleCount: 10 },
        { id: 'tpl_healthcare', name: 'Healthcare', nameZh: '医疗健康', icon: '🏥', ruleCount: 9 },
    ]
});

export const getMockQITemplateRules = (templateId: string) => {
    const rulesMap: Record<string, any[]> = {
        tpl_cs: [
            { id: 't1', name: 'Proper Greeting', category: 'compliance', type: 'keyword', weight: 15, config: { keywords: ['hello', 'welcome'] }, enabled: true },
            { id: 't2', name: 'Problem Identification', category: 'skill', type: 'semantic', weight: 20, config: { prompt: 'Did agent identify the core issue?' }, enabled: true },
            { id: 't3', name: 'Solution Provided', category: 'skill', type: 'semantic', weight: 25, config: { prompt: 'Was a resolution offered?' }, enabled: true },
            { id: 't4', name: 'No Rude Language', category: 'compliance', type: 'regex', weight: 10, config: { pattern: '(shut up|stupid|idiot)' }, enabled: true },
        ],
        tpl_sales: [
            { id: 's1', name: 'Self Introduction', category: 'compliance', type: 'keyword', weight: 10, config: { keywords: ['my name is', 'calling from'] }, enabled: true },
            { id: 's2', name: 'Value Proposition', category: 'skill', type: 'semantic', weight: 25, config: { prompt: 'Did agent clearly state the product value?' }, enabled: true },
            { id: 's3', name: 'Objection Handling', category: 'skill', type: 'semantic', weight: 25, config: { prompt: 'How well were objections addressed?' }, enabled: true },
            { id: 's4', name: 'Call to Action', category: 'skill', type: 'semantic', weight: 20, config: { prompt: 'Did agent propose next steps?' }, enabled: true },
        ],
    };
    return Promise.resolve({
        data: { rules: rulesMap[templateId] || rulesMap['tpl_cs'] }
    });
};

export const getMockQIStatus = () => Promise.resolve({
    data: {
        enabled: true,
        maxConcurrent: 3,
        scheduleEnabled: false,
        scheduleStart: '09:00',
        scheduleEnd: '18:00',
        skipIfNoTranscript: true,
        queue: { pending: 2, processing: 1, completed: 44, failed: 0 }
    }
});

// --- Compliance Coaching (C3) Mocks ---

export interface MockComplianceChecklist {
    id: string;
    name: string;
    description: string;
    items: {
        id: string;
        text: string;
        pattern: string;
        type: 'regex' | 'llm';
        is_negative?: boolean;
    }[];
}

export const getMockComplianceChecklists = () => Promise.resolve({
    data: [
        {
            id: 'cc_sales_v1',
            name: 'Sales Outbound Standard',
            description: 'Standard compliance checklist for outbound sales calls.',
            items: [
                { id: 'c1', text: 'Greeting & Authorization', pattern: '(hello|hi|calling from)', type: 'regex' },
                { id: 'c2', text: 'State Reason for Call', pattern: '(reason|purpose|calling to)', type: 'regex' },
                { id: 'c3', text: 'No Guarantee Claims', pattern: '(guarantee|promise|sure thing)', type: 'regex', is_negative: true },
                { id: 'c4', text: 'Verify Decision Maker', pattern: '(manager|decision|charge)', type: 'regex' },
                { id: 'c5', text: 'Polite Closing', pattern: '(thank|bye|goodbye)', type: 'regex' }
            ]
        },
        {
            id: 'cc_support_v1',
            name: 'Customer Support Basic',
            description: 'Basic checklist for inbound support handling.',
            items: [
                { id: 'cs1', text: 'Empathy Statement', pattern: '(sorry|apologize|understand)', type: 'regex' },
                { id: 'cs2', text: 'Ask for Account Details', pattern: '(account|number|email)', type: 'regex' },
                { id: 'cs3', text: 'Offer Resolution', pattern: '(refund|credit|fix)', type: 'regex' },
                { id: 'cs4', text: 'Closing Confirmation', pattern: '(anything else|help you)', type: 'regex' }
            ]
        }
    ]
});

export const getMockComplianceStats = () => Promise.resolve({
    data: {
        stats: {
            total_checks: 128,
            avg_compliance_rate: 94.2,
            violations_detected: 7,
            top_agency_score: 98,
        },
        trend: Array.from({ length: 7 }).map((_, i) => ({
            date: new Date(Date.now() - (6 - i) * ONE_DAY).toISOString().slice(0, 10),
            checks: 15 + Math.floor(Math.random() * 10),
            rate: 90 + Math.floor(Math.random() * 10),
        })),
        violations_by_type: [
            { type: 'No Guarantee Claims', count: 4 },
            { type: 'Verify Decision Maker', count: 2 },
            { type: 'Empathy Statement', count: 1 }
        ]
    }
});

// --- Agent Map Layout Mocks ---

const MOCK_LAYOUTS = [
    {
        _id: 'layout_gf',
        floorId: 'GF',
        label: 'Ground Floor',
        width: 2000,
        height: 2000,
        zoneLayout: [
            { zone: 0, x: 50, y: 50, w: 200, h: 300, cols: 2, rows: 5 },
            { zone: 1, x: 290, y: 50, w: 200, h: 300, cols: 2, rows: 5 },
            { zone: 2, x: 530, y: 50, w: 200, h: 300, cols: 2, rows: 5 },
            { zone: 3, x: 50, y: 400, w: 200, h: 300, cols: 2, rows: 5 },
            { zone: 4, x: 290, y: 400, w: 440, h: 300, cols: 4, rows: 3 },
        ],
        zoneDefs: [
            { name: 'ZONE A // SALES', color: '#67e8f9', xMin: 50, xMax: 250, yMin: 50, yMax: 350 },
            { name: 'ZONE B // SUPPORT', color: '#c4b5fd', xMin: 290, xMax: 490, yMin: 50, yMax: 350 },
            { name: 'ZONE C // VIP', color: '#fbbf24', xMin: 530, xMax: 730, yMin: 50, yMax: 350 },
            { name: 'ZONE D // TECH', color: '#34d399', xMin: 50, xMax: 250, yMin: 400, yMax: 700 },
            { name: 'ZONE E // OPS', color: '#f472b6', xMin: 290, xMax: 730, yMin: 400, yMax: 700 },
        ],
        agentAssignments: {},
    },
    {
        _id: 'layout_1f',
        floorId: '1F',
        label: '1F',
        width: 2000,
        height: 2000,
        zoneLayout: [
            { zone: 0, x: 100, y: 100, w: 280, h: 300, cols: 3, rows: 4 },
            { zone: 1, x: 430, y: 100, w: 280, h: 300, cols: 3, rows: 4 },
        ],
        zoneDefs: [
            { name: 'ZONE F // TRAINING', color: '#fb923c', xMin: 100, xMax: 380, yMin: 100, yMax: 400 },
            { name: 'ZONE G // R&D', color: '#38bdf8', xMin: 430, xMax: 710, yMin: 100, yMax: 400 },
        ],
        agentAssignments: {},
    },
    {
        _id: 'layout_2f',
        floorId: '2F',
        label: '2F',
        width: 2000,
        height: 2000,
        zoneLayout: [
            { zone: 0, x: 100, y: 100, w: 280, h: 300, cols: 3, rows: 4 },
            { zone: 1, x: 430, y: 100, w: 280, h: 300, cols: 3, rows: 4 },
        ],
        zoneDefs: [
            { name: 'ZONE H // EXECUTIVE', color: '#a78bfa', xMin: 100, xMax: 380, yMin: 100, yMax: 400 },
            { name: 'ZONE I // LOUNGE', color: '#4ade80', xMin: 430, xMax: 710, yMin: 100, yMax: 400 },
        ],
        agentAssignments: {},
    }
];

const MOCK_LAYOUT_STATS: Record<string, any> = {
    'GF': {
        agentAssignments: {
            // Zone A // SALES (stations 0-9, 10 seats, 8 agents)
            0: { agentId: 'a_1001', status: 'on_call' },
            1: { agentId: 'a_1002', status: 'available' },
            2: { agentId: 'a_1003', status: 'on_call' },
            3: { agentId: 'a_1004', status: 'ringing' },
            4: { agentId: 'a_1005', status: 'available' },
            6: { agentId: 'a_1006', status: 'on_call' },
            7: { agentId: 'a_1007', status: 'wrap_up' },
            9: { agentId: 'a_1008', status: 'available' },
            // Zone B // SUPPORT (stations 10-19, 10 seats, 8 agents)
            10: { agentId: 'a_1011', status: 'ringing' },
            11: { agentId: 'a_1012', status: 'available' },
            12: { agentId: 'a_1013', status: 'on_call' },
            13: { agentId: 'a_1014', status: 'break' },
            15: { agentId: 'a_1016', status: 'available' },
            16: { agentId: 'a_1017', status: 'on_call' },
            17: { agentId: 'a_1018', status: 'available' },
            19: { agentId: 'a_1019', status: 'ringing' },
            // Zone C // VIP (stations 20-29, 10 seats, 7 agents)
            20: { agentId: 'a_1021', status: 'available' },
            21: { agentId: 'a_1022', status: 'wrap_up' },
            22: { agentId: 'a_1023', status: 'on_call' },
            23: { agentId: 'a_1024', status: 'available' },
            25: { agentId: 'a_1025', status: 'on_call' },
            27: { agentId: 'a_1026', status: 'available' },
            28: { agentId: 'a_1027', status: 'break' },
            // Zone D // TECH (stations 30-39, 10 seats, 7 agents)
            30: { agentId: 'a_1031', status: 'on_call' },
            31: { agentId: 'a_1032', status: 'available' },
            32: { agentId: 'a_1033', status: 'on_call' },
            34: { agentId: 'a_1035', status: 'available' },
            35: { agentId: 'a_1036', status: 'ringing' },
            37: { agentId: 'a_1037', status: 'available' },
            38: { agentId: 'a_1038', status: 'on_call' },
            // Zone E // OPS (stations 40-51, 12 seats, 8 agents)
            40: { agentId: 'a_1041', status: 'on_call' },
            41: { agentId: 'a_1042', status: 'available' },
            43: { agentId: 'a_1044', status: 'available' },
            44: { agentId: 'a_1045', status: 'on_call' },
            46: { agentId: 'a_1046', status: 'available' },
            47: { agentId: 'a_1047', status: 'break' },
            49: { agentId: 'a_1048', status: 'on_call' },
            51: { agentId: 'a_1049', status: 'available' },
        },
        zoneQueues: [
            { zoneIndex: 0, activeCallCount: 3, queueCount: 12, avgWaitTimeSec: 35 },
            { zoneIndex: 1, activeCallCount: 2, queueCount: 28, avgWaitTimeSec: 65 },
            { zoneIndex: 2, activeCallCount: 2, queueCount: 5, avgWaitTimeSec: 15 },
            { zoneIndex: 3, activeCallCount: 3, queueCount: 18, avgWaitTimeSec: 45 },
            { zoneIndex: 4, activeCallCount: 3, queueCount: 42, avgWaitTimeSec: 90 },
        ],
        zoneQuality: [
            { zoneIndex: 0, avgScore: 87, inspections: 42, excellentCount: 28, goodCount: 10, poorCount: 4, topAgent: 'a_1001', topAgentScore: 95, trend: 'up' as const },
            { zoneIndex: 1, avgScore: 78, inspections: 38, excellentCount: 18, goodCount: 14, poorCount: 6, topAgent: 'a_1012', topAgentScore: 92, trend: 'stable' as const },
            { zoneIndex: 2, avgScore: 93, inspections: 28, excellentCount: 24, goodCount: 3, poorCount: 1, topAgent: 'a_1023', topAgentScore: 98, trend: 'up' as const },
            { zoneIndex: 3, avgScore: 72, inspections: 31, excellentCount: 12, goodCount: 12, poorCount: 7, topAgent: 'a_1031', topAgentScore: 88, trend: 'down' as const },
            { zoneIndex: 4, avgScore: 65, inspections: 45, excellentCount: 14, goodCount: 16, poorCount: 15, topAgent: 'a_1041', topAgentScore: 82, trend: 'down' as const },
        ],
        callConnections: [
            { id: 'cc_1', type: 'agent-customer', agentStationIdx: 0, zoneIndex: 0 },
            { id: 'cc_2', type: 'agent-customer', agentStationIdx: 2, zoneIndex: 0 },
            { id: 'cc_3', type: 'agent-customer', agentStationIdx: 12, zoneIndex: 1 },
            { id: 'cc_4', type: 'agent-customer', agentStationIdx: 22, zoneIndex: 2 },
            { id: 'cc_5', type: 'agent-customer', agentStationIdx: 30, zoneIndex: 3 },
            { id: 'cc_6', type: 'agent-agent', agentStationIdx: 6, targetStationIdx: 16, zoneIndex: 0 },
            { id: 'cc_7', type: 'agent-customer', agentStationIdx: 40, zoneIndex: 4 },
            { id: 'cc_8', type: 'agent-customer', agentStationIdx: 44, zoneIndex: 4 },
        ],
    },
    '1F': {
        agentAssignments: {
            // Zone F // TRAINING (stations 0-11, 7 agents)
            0: { agentId: 'a_1009', status: 'on_call' },
            2: { agentId: 'a_1010', status: 'available' },
            4: { agentId: 'a_1020', status: 'on_call' },
            6: { agentId: 'a_1028', status: 'on_call' },
            // Zone G // R&D (stations 12-23)
            12: { agentId: 'a_1029', status: 'available' },
            14: { agentId: 'a_1030', status: 'ringing' },
            16: { agentId: 'a_1039', status: 'available' },
        },
        zoneQueues: [
            { zoneIndex: 0, activeCallCount: 2, queueCount: 6, avgWaitTimeSec: 25 },
            { zoneIndex: 1, activeCallCount: 0, queueCount: 2, avgWaitTimeSec: 10 },
        ],
        zoneQuality: [
            { zoneIndex: 0, avgScore: 82, inspections: 18, excellentCount: 10, goodCount: 6, poorCount: 2, topAgent: 'a_1009', topAgentScore: 91, trend: 'up' as const },
            { zoneIndex: 1, avgScore: 88, inspections: 12, excellentCount: 9, goodCount: 3, poorCount: 0, topAgent: 'a_1029', topAgentScore: 94, trend: 'stable' as const },
        ],
        callConnections: [
            { id: 'cc_1f_1', type: 'agent-customer', agentStationIdx: 0, zoneIndex: 0 },
            { id: 'cc_1f_2', type: 'agent-customer', agentStationIdx: 4, zoneIndex: 0 },
        ],
    },
    '2F': {
        agentAssignments: {
            // Zone H // EXECUTIVE (stations 0-11)
            0: { agentId: 'a_1015', status: 'available' },
            3: { agentId: 'a_1034', status: 'available' },
            6: { agentId: 'a_1040', status: 'wrap_up' },
            // Zone I // LOUNGE (stations 12-23)
            12: { agentId: 'a_1043', status: 'available' },
            15: { agentId: 'a_1050', status: 'available' },
        },
        zoneQueues: [
            { zoneIndex: 0, activeCallCount: 0, queueCount: 3, avgWaitTimeSec: 12 },
            { zoneIndex: 1, activeCallCount: 0, queueCount: 1, avgWaitTimeSec: 5 },
        ],
        zoneQuality: [
            { zoneIndex: 0, avgScore: 91, inspections: 8, excellentCount: 7, goodCount: 1, poorCount: 0, topAgent: 'a_1015', topAgentScore: 96, trend: 'up' as const },
            { zoneIndex: 1, avgScore: 85, inspections: 5, excellentCount: 4, goodCount: 1, poorCount: 0, topAgent: 'a_1043', topAgentScore: 90, trend: 'stable' as const },
        ],
        callConnections: [],
    }
};

export const getMockLayouts = () => Promise.resolve(MOCK_LAYOUTS);
export const getMockLayoutStats = (floorId: string) =>
    Promise.resolve(MOCK_LAYOUT_STATS[floorId] || { agentAssignments: {}, zoneQueues: [], callConnections: [], zoneQuality: [] });

// --- QI Analytics Mocks ---
export const getMockQIAnalytics = () => {
    const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    const scoreDistribution = [
        { bucket: '0-10', count: rnd(0, 2) },
        { bucket: '10-20', count: rnd(1, 3) },
        { bucket: '20-30', count: rnd(2, 5) },
        { bucket: '30-40', count: rnd(3, 6) },
        { bucket: '40-50', count: rnd(5, 10) },
        { bucket: '50-60', count: rnd(8, 15) },
        { bucket: '60-70', count: rnd(12, 22) },
        { bucket: '70-80', count: rnd(18, 30) },
        { bucket: '80-90', count: rnd(14, 25) },
        { bucket: '90-100', count: rnd(6, 14) },
    ];

    const sentimentBreakdown = [
        { sentiment: 'positive', count: rnd(30, 55), avg_score: +(0.72 + Math.random() * 0.16).toFixed(2) },
        { sentiment: 'neutral', count: rnd(40, 75), avg_score: +(0.45 + Math.random() * 0.2).toFixed(2) },
        { sentiment: 'negative', count: rnd(8, 25), avg_score: +(0.2 + Math.random() * 0.2).toFixed(2) },
    ];

    const ruleHits = [
        { name: 'Greeting & Self-Intro', category: 'compliance', passed: rnd(60, 90), failed: rnd(5, 20), total: 0, pass_rate: 0 },
        { name: 'Product Offer Mention', category: 'skill', passed: rnd(40, 70), failed: rnd(15, 35), total: 0, pass_rate: 0 },
        { name: 'Forbidden Phrases Check', category: 'compliance', passed: rnd(70, 95), failed: rnd(2, 10), total: 0, pass_rate: 0 },
        { name: 'Closing Statement', category: 'compliance', passed: rnd(50, 80), failed: rnd(10, 25), total: 0, pass_rate: 0 },
        { name: 'Empathy Expression', category: 'semantic', passed: rnd(30, 60), failed: rnd(20, 40), total: 0, pass_rate: 0 },
        { name: 'Solution Provided', category: 'skill', passed: rnd(45, 75), failed: rnd(10, 30), total: 0, pass_rate: 0 },
        { name: 'Hold Procedure', category: 'compliance', passed: rnd(55, 85), failed: rnd(8, 20), total: 0, pass_rate: 0 },
    ].map(r => ({ ...r, total: r.passed + r.failed, pass_rate: +((r.passed / (r.passed + r.failed))).toFixed(3) }));

    const agentComparison = AGENT_IDS.map(id => {
        const inspections = rnd(5, 35);
        const avgScore = +(55 + Math.random() * 40).toFixed(1);
        return {
            agent_id: id,
            inspections,
            avg_score: avgScore,
            avg_sentiment: +(0.3 + Math.random() * 0.6).toFixed(2),
            excellent: Math.round(inspections * (avgScore > 80 ? 0.6 : 0.2)),
            poor: Math.round(inspections * (avgScore < 65 ? 0.3 : 0.05)),
            avg_duration_ms: rnd(1500, 5500),
        };
    }).sort((a, b) => b.avg_score - a.avg_score);

    return Promise.resolve({ scoreDistribution, sentimentBreakdown, ruleHits, agentComparison });
};

// --- QI Score Detail Mock ---
export const getMockQIScoreDetail = (callId: string) => {
    const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const score = rnd(45, 98);
    const sentiments = ['positive', 'neutral', 'negative'];
    const ruleNames = [
        { name: 'Self Introduction', category: 'compliance' },
        { name: 'Product Mention', category: 'skill' },
        { name: 'Forbidden Phrases', category: 'compliance' },
        { name: 'Active Listening', category: 'skill' },
        { name: 'Closing Summary', category: 'semantic' },
    ];
    const ruleScores = ruleNames.map((r, i) => {
        const maxS = rnd(15, 25);
        const passed = Math.random() > 0.3;
        return {
            ruleId: `rule_${i + 1}`,
            ruleName: r.name,
            category: r.category,
            passed,
            score: passed ? maxS : rnd(0, Math.floor(maxS * 0.4)),
            maxScore: maxS,
            reason: passed ? undefined : ['Agent did not perform this step', 'Partial compliance detected', 'Missing key phrases'][rnd(0, 2)],
            evidence: passed ? undefined : 'Transcript segment not found or incomplete',
        };
    });
    return Promise.resolve({
        data: {
            timestamp: new Date(Date.now() - rnd(60000, 86400000)).toISOString(),
            call_id: callId,
            client_id: 'demo-client',
            agent_id: ['Alice', 'Bob', 'Charlie', 'Diana'][rnd(0, 3)],
            checklist_id: 'checklist_demo',
            overall_score: score,
            rule_scores: ruleScores,
            sentiment: sentiments[rnd(0, 2)],
            sentiment_score: +(0.2 + Math.random() * 0.7).toFixed(2),
            summary: 'Agent provided adequate service. Some areas need improvement in compliance and closing procedures.',
            llm_model: 'gpt-4o-mini',
            llm_tokens: rnd(800, 2500),
            duration_ms: rnd(1500, 5000),
        }
    });
};

// --- SLA / KPI Analytics Mocks ---
export const getMockSLAAnalytics = (days: number = 7) => {
    const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const rndF = (min: number, max: number) => +(min + Math.random() * (max - min)).toFixed(1);

    // Overview
    const total = rnd(800, 1500);
    const answered = Math.round(total * (0.82 + Math.random() * 0.11));
    const abandoned = total - answered;
    const overview = {
        total_calls: total,
        answered,
        abandoned,
        answer_rate: +((answered / total) * 100).toFixed(1),
        abandon_rate: +((abandoned / total) * 100).toFixed(1),
        avg_handle_time: rndF(120, 280),
        avg_wait_time: rndF(8, 35),
        service_level: rndF(72, 92),
        change: {
            total_calls: rndF(-15, 25),
            answered: rndF(-10, 20),
            abandoned: rndF(-5, 5),
            answer_rate: rndF(-2, 5),
            abandon_rate: rndF(-1, 2),
            avg_handle_time: rndF(-10, 15),
            avg_wait_time: rndF(-5, 8),
            service_level: rndF(-3, 6),
        }
    };

    // Hourly trend
    const hourWeight = [2, 1, 1, 1, 1, 3, 8, 15, 25, 35, 42, 40, 30, 35, 40, 38, 28, 18, 10, 6, 4, 3, 3, 2];
    const hourlyTrend = Array.from({ length: 24 }, (_, h) => {
        const base = hourWeight[h];
        const offered = Math.round(base * (0.8 + Math.random() * 0.4));
        const ans = Math.round(offered * (0.78 + Math.random() * 0.17));
        return { hour: h, offered, answered: ans, abandoned: offered - ans, sl_pct: rndF(65, 95) };
    });

    // Agent leaderboard
    const agentNames = ['Alice Wonderland', 'Bob Builder', 'Charlie Puth', 'Diana Prince', 'Ethan Hunt',
        'Fiona Gallagher', 'George Kim', 'Hannah Montana', 'Ivan Drago', 'Julia Roberts'];
    const agentLeaderboard = agentNames.map((name, i) => {
        const qiScore = rndF(52, 96);
        return {
            agent_id: `${1001 + i}`,
            agent_name: name,
            total_calls: rnd(15, 80),
            avg_handle_time: rndF(90, 320),
            avg_qi_score: qiScore,
            conversion_rate: rndF(15, 65),
            trend: Array.from({ length: 7 }, () => rndF(qiScore - 10, qiScore + 10)),
        };
    }).sort((a, b) => b.avg_qi_score - a.avg_qi_score);

    // Call volume
    const callVolume = Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.now() - (days - 1 - i) * 86400000);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const base = isWeekend ? rnd(80, 200) : rnd(250, 500);
        const ans = Math.round(base * (0.8 + Math.random() * 0.13));
        return { date: d.toISOString().slice(0, 10), total: base, answered: ans, abandoned: base - ans };
    });

    // Quality × Sentiment heatmap
    const sentiments = ['positive', 'neutral', 'negative'];
    const buckets = ['0-20', '20-40', '40-60', '60-80', '80-100'];
    const weights: Record<string, number[]> = {
        positive: [1, 2, 5, 15, 25], neutral: [2, 5, 12, 10, 5], negative: [8, 10, 6, 3, 1],
    };
    const qualitySentiment: Array<{ sentiment: string; score_bucket: string; count: number }> = [];
    for (const s of sentiments) {
        for (let i = 0; i < buckets.length; i++) {
            qualitySentiment.push({
                sentiment: s, score_bucket: buckets[i],
                count: Math.round(weights[s][i] * (0.6 + Math.random() * 0.8)),
            });
        }
    }

    return Promise.resolve({ overview, hourlyTrend, agentLeaderboard, callVolume, qualitySentiment });
};

// --- Summary Analytics Mocks ---
export const getMockSummaryAnalytics = (days: number = 7) => {
    const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    const intentDistribution = [
        'Product inquiry', 'Billing question', 'Technical support',
        'Account management', 'Subscription change', 'Complaint',
        'Refund request', 'General inquiry', 'Feature request', 'Cancellation',
    ].map(intent => ({ intent, count: rnd(5, 60) })).sort((a, b) => b.count - a.count);

    const sentimentTrend = Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.now() - (days - 1 - i) * 86400000);
        return {
            date: d.toISOString().slice(0, 10),
            positive: rnd(15, 45),
            neutral: rnd(20, 50),
            negative: rnd(3, 18),
        };
    });

    const models = [
        { model: 'gpt-4o-mini', count: rnd(200, 600) },
        { model: 'gpt-4o', count: rnd(30, 120) },
        { model: 'deepseek-chat', count: rnd(10, 60) },
    ];
    const summaryOverview = {
        total_summaries: models.reduce((s, m) => s + m.count, 0),
        avg_tokens: rnd(800, 2200),
        top_model: models[0].model,
        models,
    };

    return Promise.resolve({ intentDistribution, sentimentTrend, summaryOverview });
};

export const getMockSERAnalytics = (days: number = 7) => {
    // Acoustic Emotion Mock
    const emotions = ['happy', 'neutral', 'sad', 'angry', 'frustrated'];
    const distribution = emotions.map(e => ({
        emotion: e,
        count: Math.floor(Math.random() * 500) + 50
    })).sort((a, b) => b.count - a.count);

    const trend = Array.from({ length: days }).map((_, i) => {
        const date = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
        return {
            date,
            happy: Math.floor(Math.random() * 50) + 10,
            neutral: Math.floor(Math.random() * 80) + 20,
            sad: Math.floor(Math.random() * 20) + 5,
            angry: Math.floor(Math.random() * 10) + 2,
            frustrated: Math.floor(Math.random() * 15) + 5,
        };
    });

    return Promise.resolve({ distribution, trend });
};

// --- Call Quality Mocks ---
export const getMockCallQuality = (hours: number = 24) => {
    const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    const total = rnd(200, 600);
    const excellent = Math.round(total * 0.55);
    const good = Math.round(total * 0.25);
    const fair = Math.round(total * 0.12);
    const poor = total - excellent - good - fair;

    const overview = {
        mos_distribution: {
            excellent, good, fair, poor, total,
            avg_mos: +(3.8 + Math.random() * 0.6).toFixed(2),
            min_mos: +(1.5 + Math.random()).toFixed(2),
            max_mos: +(4.3 + Math.random() * 0.2).toFixed(2),
        },
        codec_breakdown: [
            { codec: 'opus', call_count: rnd(150, 300), avg_mos: +(4.0 + Math.random() * 0.3).toFixed(2), avg_loss: +(0.001 + Math.random() * 0.002).toFixed(4), avg_rtt: rnd(15, 45) },
            { codec: 'G.711', call_count: rnd(50, 120), avg_mos: +(3.6 + Math.random() * 0.3).toFixed(2), avg_loss: +(0.003 + Math.random() * 0.005).toFixed(4), avg_rtt: rnd(25, 80) },
            { codec: 'G.729', call_count: rnd(20, 60), avg_mos: +(3.2 + Math.random() * 0.4).toFixed(2), avg_loss: +(0.005 + Math.random() * 0.01).toFixed(4), avg_rtt: rnd(35, 100) },
        ],
    };

    const buckets = hours <= 6 ? 60 : hours <= 24 ? 48 : 168;
    const intervalMs = (hours * 3600000) / buckets;
    const trends = Array.from({ length: buckets }, (_, i) => ({
        bucket: new Date(Date.now() - (buckets - 1 - i) * intervalMs).toISOString(),
        avg_mos: +(3.5 + Math.random() * 0.8).toFixed(2),
        avg_loss: +(Math.random() * 0.02).toFixed(4),
        avg_jitter: +(5 + Math.random() * 25).toFixed(1),
        avg_rtt: +(15 + Math.random() * 60).toFixed(1),
        report_count: rnd(3, 20),
    }));

    const geoCountries = ['CN', 'US', 'JP', 'SG', 'AU', 'GB', 'DE'];
    const geo = {
        media: geoCountries.map(c => ({
            country: c,
            call_count: rnd(10, 80),
            avg_mos: +(3.4 + Math.random() * 0.8).toFixed(2),
            avg_loss: +(0.001 + Math.random() * 0.01).toFixed(4),
            avg_rtt: rnd(15, 200),
            avg_jitter: +(5 + Math.random() * 30).toFixed(1),
        })),
    };

    const worstCalls = Array.from({ length: 10 }, (_, i) => ({
        call_id: `call-q-${String(i).padStart(3, '0')}`,
        min_mos: +(1.0 + Math.random() * 1.5).toFixed(2),
        avg_mos: +(1.8 + Math.random() * 1.5).toFixed(2),
        codec: ['opus', 'G.711', 'G.729'][i % 3],
        quality_grade: ['D', 'E', 'F'][i % 3],
        pdd_ms: rnd(200, 2000),
        avg_loss: +(0.01 + Math.random() * 0.05).toFixed(4),
        avg_rtt: rnd(80, 350),
        avg_jitter: +(20 + Math.random() * 60).toFixed(1),
        src_country: geoCountries[i % geoCountries.length],
        dst_country: geoCountries[(i + 2) % geoCountries.length],
        timestamp: new Date(Date.now() - rnd(0, hours * 3600) * 1000).toISOString(),
        report_count: rnd(5, 50),
        duration: rnd(30, 600),
    }));

    return Promise.resolve({ overview, trends, geo, worstCalls });
};

// --- Audit Dashboard Demo Mocks ---
export const getMockAuditDashboard = () => {
    const stats = getMockAuditStats();
    const timeline = getMockAuditTimeline();
    const leaderboard = getMockAuditLeaderboard();
    const logs = getMockAuditLogs();

    return {
        summary: {
            total_events: 280,
            today_activity: 42,
            active_users: 8,
            failed_logins: 5,
        },
        stats: stats.data.stats,
        timeline: timeline.data,
        leaderboard: leaderboard.data,
        recent_logs: logs.data.logs,
    };
};

export const getMockAuditAnomalies = () => {
    return Promise.resolve([
        { operator_id: 'u_agent_01', operator_name: 'Agent Smith', category: 'auth', action_count: 847, unique_actions: 3, unique_ips: 5 },
        { operator_id: 'u_sup_01', operator_name: 'Sarah Connor', category: 'agent_management', action_count: 312, unique_actions: 8, unique_ips: 3 },
        { operator_id: 'u_agent_06', operator_name: 'Fiona Gallagher', category: 'call_access', action_count: 205, unique_actions: 2, unique_ips: 1 },
    ]);
};

export const getMockAuditRules = () => {
    return Promise.resolve([
        { id: 'rule_001', name: 'Brute Force Login Detection', description: 'Detect multiple failed login attempts from same IP within 5 minutes', category: 'Security', severity: 'critical' as const, enabled: true },
        { id: 'rule_002', name: 'Off-Hours Access Alert', description: 'Flag access attempts outside business hours (9AM-6PM)', category: 'Compliance', severity: 'high' as const, enabled: true },
        { id: 'rule_003', name: 'Bulk Data Export Detection', description: 'Alert when user exports more than 1000 records in a single session', category: 'Data Protection', severity: 'high' as const, enabled: false },
        { id: 'rule_004', name: 'Privilege Escalation Monitor', description: 'Detect unauthorized role changes or permission modifications', category: 'Security', severity: 'critical' as const, enabled: true },
        { id: 'rule_005', name: 'Geo-Anomaly Detection', description: 'Flag login from unusual geographic locations', category: 'Security', severity: 'medium' as const, enabled: true },
        { id: 'rule_006', name: 'Idle Session Timeout', description: 'Auto-terminate sessions inactive for more than 30 minutes', category: 'Compliance', severity: 'low' as const, enabled: true },
    ]);
};

// --- ROI Analytics Mocks (C10) ---

export const getMockROISummary = (days: number = 30) => {
    const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const rndF = (min: number, max: number) => +(min + Math.random() * (max - min)).toFixed(2);

    const metrics = [
        { key: 'call_duration_saved', label: 'Call Duration Saved', value: rndF(80, 320), unit: 'hours', improvement_pct: rnd(8, 25) },
        { key: 'asr_cost_saved', label: 'ASR Cost Saved', value: rndF(1200, 5800), unit: 'USD', improvement_pct: rnd(12, 35) },
        { key: 'revenue_attributed', label: 'Revenue Attributed', value: rndF(15000, 85000), unit: 'USD', improvement_pct: rnd(5, 18) },
        { key: 'compliance_risk_avoided', label: 'Compliance Risk Avoided', value: rndF(3000, 25000), unit: 'USD', improvement_pct: rnd(10, 30) },
        { key: 'acw_time_saved', label: 'ACW Time Saved', value: 0, unit: 'hours', improvement_pct: 0 },
        { key: 'fte_equivalent', label: 'FTE Equivalent', value: rndF(0.5, 4.2), unit: 'FTE', improvement_pct: rnd(5, 15) },
        { key: 'customer_ltv_rescued', label: 'Customer LTV Rescued', value: 0, unit: 'USD', improvement_pct: 0 },
    ];

    const total_value = metrics.reduce((s, m) => s + (m.unit === 'USD' ? m.value : 0), 0);

    return Promise.resolve({
        total_value: +total_value.toFixed(2),
        metrics,
        period_days: days,
    });
};

export const getMockROITrend = (days: number = 30) => {
    const trend = Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.now() - (days - 1 - i) * 86400000);
        return {
            date: d.toISOString().slice(0, 10),
            total_value: +(200 + Math.random() * 1800 + i * 20).toFixed(2),
        };
    });
    return Promise.resolve(trend);
};

export const getMockROIBreakdown = (days: number = 30) => {
    const metricTypes = ['call_duration_saved', 'asr_cost_saved', 'revenue_attributed', 'compliance_risk_avoided'];
    const rows: any[] = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
        for (const mt of metricTypes) {
            rows.push({
                date: d,
                metric_type: mt,
                value: +(50 + Math.random() * 500).toFixed(2),
            });
        }
    }
    return Promise.resolve(rows);
};

// --- Outcome Dashboard Mocks ---

export const getMockOutcomeDashboard = (days: number = 30) => {
    const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const rndF = (min: number, max: number) => +(min + Math.random() * (max - min)).toFixed(2);

    const distribution = {
        success: rnd(150, 300),
        failure: rnd(40, 80),
        follow_up: rnd(30, 60),
        unknown: rnd(10, 20)
    };

    const trends = Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
        return {
            date: d,
            success: rnd(5, 15),
            failure: rnd(1, 5),
            follow_up: rnd(0, 3)
        };
    });

    const by_quality = [
        { bucket: 'Excellent (4+)', total: rnd(100, 200), success: 0, rate: 0 },
        { bucket: 'Good (3-4)', total: rnd(80, 150), success: 0, rate: 0 },
        { bucket: 'Fair (2-3)', total: rnd(30, 60), success: 0, rate: 0 },
        { bucket: 'Poor (<2)', total: rnd(10, 30), success: 0, rate: 0 }
    ].map(b => {
        const s = Math.round(b.total * (b.bucket.includes('Excellent') ? 0.8 : b.bucket.includes('Good') ? 0.6 : 0.3));
        return { ...b, success: s, rate: +(s / b.total).toFixed(3) };
    });

    const by_duration = [
        { bucket: '0-30s', total: rnd(20, 50), success: rnd(2, 5), rate: 0 },
        { bucket: '30-60s', total: rnd(30, 60), success: rnd(10, 20), rate: 0 },
        { bucket: '1-3m', total: rnd(100, 200), success: rnd(60, 120), rate: 0 },
        { bucket: '3-5m', total: rnd(50, 100), success: rnd(30, 70), rate: 0 },
        { bucket: '5m+', total: rnd(20, 40), success: rnd(15, 30), rate: 0 }
    ].map(b => ({ ...b, rate: +(b.success / b.total).toFixed(3) }));

    const by_sentiment = [
        { bucket: 'positive', total: rnd(120, 180), success: rnd(100, 150), rate: 0 },
        { bucket: 'neutral', total: rnd(80, 120), success: rnd(40, 60), rate: 0 },
        { bucket: 'negative', total: rnd(30, 50), success: rnd(5, 10), rate: 0 }
    ].map(b => ({ ...b, rate: +(b.success / b.total).toFixed(3) }));

    const top_closers = AGENT_IDS.map(id => {
        const total = rnd(20, 50);
        const success = rnd(10, total);
        const agentNameRecord = MOCK_AGENTS.find(a => a._id === `a_${id}`) || MOCK_AGENTS[0];
        return {
            agent_id: id,
            agent_name: agentNameRecord.displayName,
            total,
            success,
            rate: +(success / total).toFixed(3)
        };
    }).sort((a, b) => b.rate - a.rate);

    const by_talk_pattern = [
        { bucket: 'Balanced (30-50%)', total: rnd(100, 150), success: rnd(80, 120), rate: 0 },
        { bucket: 'Listen-heavy (<30%)', total: rnd(50, 80), success: rnd(30, 50), rate: 0 },
        { bucket: 'Talk-dominant (50-70%)', total: rnd(40, 70), success: rnd(15, 30), rate: 0 },
        { bucket: 'Monologue (>70%)', total: rnd(10, 20), success: rnd(1, 5), rate: 0 }
    ].map(b => ({ ...b, rate: +(b.success / b.total).toFixed(3) }));

    const roi = {
        total_cost: rndF(5, 20),
        cost_per_success: rndF(0.05, 0.2),
        avg_tokens: rnd(1500, 3000),
        total_predictions: distribution.success + distribution.failure + distribution.follow_up
    };

    return Promise.resolve({
        data: {
            distribution,
            trends,
            by_quality,
            by_duration,
            by_sentiment,
            top_closers,
            by_talk_pattern,
            roi
        }
    });
};

// --- Behavior Analytics Mocks (P3) ---

export const getMockBehaviorAnalytics = (days: number = 30) => {
    const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const rndF = (min: number, max: number) => +(min + Math.random() * (max - min)).toFixed(2);

    const distribution = {
        agent_talk: rnd(400000, 600000),
        cust_talk: rnd(300000, 500000),
        silence: rnd(100000, 200000)
    };

    const trend = Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
        return {
            date: d,
            avg_stress: rndF(20, 60),
            avg_talk_ratio: rndF(0.4, 0.6)
        };
    });

    const emotion_dist = [
        { emotion: 'happy', count: rnd(300, 500) },
        { emotion: 'neutral', count: rnd(400, 600) },
        { emotion: 'sad', count: rnd(50, 100) },
        { emotion: 'angry', count: rnd(20, 50) },
        { emotion: 'frustrated', count: rnd(30, 80) }
    ];

    const emotion_trend = Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
        return {
            date: d,
            happy: rnd(10, 30),
            neutral: rnd(20, 40),
            sad: rnd(2, 8),
            angry: rnd(1, 4),
            frustrated: rnd(2, 6)
        };
    });

    return Promise.resolve({
        data: {
            distribution,
            trend,
            emotion_dist,
            emotion_trend
        }
    });
};

// --- Action Center (C5) Mocks ---

export interface MockActionRecord {
    actionId: string;
    callId: string;
    agentId: string;
    agentName: string;
    intentSlug: string;
    intentName: string;
    status: 'suggested' | 'edited' | 'confirmed' | 'rejected' | 'ignored';
    confidence: number;
    payload: Record<string, any>;
    createdAt: string;
}

export interface MockActionDiscovery {
    id: string;
    name: string;
    slug: string;
    confidence: number;
    occurrences: number;
    reason: string;
    samplePhrases: string[];
    category: string;
}

export interface MockActionIntent {
    _id: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    enabled: boolean;
    keywords: string[];
    webhookUrl?: string;
    usageCount: number;
    createdAt: string;
}

const ACTION_INTENTS_DATA: MockActionIntent[] = [
    { _id: 'ai_001', slug: 'create_ticket', name: 'Create Support Ticket', description: 'Automatically create a support ticket when customer reports an issue', category: 'support', enabled: true, keywords: ['ticket', 'issue', 'problem', 'bug', 'broken'], webhookUrl: 'https://hooks.example.com/ticket', usageCount: 342, createdAt: new Date(Date.now() - 60 * ONE_DAY).toISOString() },
    { _id: 'ai_002', slug: 'refund_order', name: 'Refund Order', description: 'Process a refund when customer requests return or money back', category: 'ecommerce', enabled: true, keywords: ['refund', 'return', 'money back', 'cancel order', 'charge back'], usageCount: 187, createdAt: new Date(Date.now() - 55 * ONE_DAY).toISOString() },
    { _id: 'ai_003', slug: 'book_demo', name: 'Book Product Demo', description: 'Schedule a product demonstration for interested leads', category: 'sales', enabled: true, keywords: ['demo', 'presentation', 'show me', 'walkthrough', 'trial'], webhookUrl: 'https://hooks.example.com/calendar', usageCount: 256, createdAt: new Date(Date.now() - 50 * ONE_DAY).toISOString() },
    { _id: 'ai_004', slug: 'email_followup', name: 'Send Follow-up Email', description: 'Draft and queue a follow-up email after the call ends', category: 'communication', enabled: true, keywords: ['email', 'send', 'follow up', 'write to', 'confirmation'], usageCount: 418, createdAt: new Date(Date.now() - 45 * ONE_DAY).toISOString() },
    { _id: 'ai_005', slug: 'escalate_supervisor', name: 'Escalate to Supervisor', description: 'Route the call or create escalation ticket for supervisor review', category: 'support', enabled: true, keywords: ['manager', 'supervisor', 'escalate', 'complaint', 'not resolved'], usageCount: 89, createdAt: new Date(Date.now() - 40 * ONE_DAY).toISOString() },
    { _id: 'ai_006', slug: 'update_crm', name: 'Update CRM Record', description: 'Push call notes and customer details to CRM system', category: 'integration', enabled: true, keywords: ['update', 'record', 'note', 'CRM', 'salesforce'], webhookUrl: 'https://hooks.example.com/crm', usageCount: 523, createdAt: new Date(Date.now() - 38 * ONE_DAY).toISOString() },
    { _id: 'ai_007', slug: 'schedule_callback', name: 'Schedule Callback', description: 'Book a callback appointment at the customer\'s preferred time', category: 'scheduling', enabled: true, keywords: ['call back', 'callback', 'schedule', 'later', 'tomorrow'], usageCount: 165, createdAt: new Date(Date.now() - 30 * ONE_DAY).toISOString() },
    { _id: 'ai_008', slug: 'send_pricing', name: 'Send Pricing Sheet', description: 'Email the latest pricing PDF to the prospect', category: 'sales', enabled: false, keywords: ['pricing', 'rates', 'cost', 'price list', 'quote'], usageCount: 92, createdAt: new Date(Date.now() - 25 * ONE_DAY).toISOString() },
    { _id: 'ai_009', slug: 'transfer_department', name: 'Transfer to Department', description: 'Warm transfer the caller to the appropriate department', category: 'routing', enabled: true, keywords: ['transfer', 'department', 'billing', 'technical', 'sales team'], usageCount: 201, createdAt: new Date(Date.now() - 20 * ONE_DAY).toISOString() },
    { _id: 'ai_010', slug: 'apply_discount', name: 'Apply Loyalty Discount', description: 'Apply a retention discount for loyal or churning customers', category: 'ecommerce', enabled: false, keywords: ['discount', 'loyalty', 'retain', 'offer', 'special price'], usageCount: 34, createdAt: new Date(Date.now() - 15 * ONE_DAY).toISOString() },
];

const HISTORY_STATUSES: MockActionRecord['status'][] = ['confirmed', 'rejected', 'edited', 'suggested', 'ignored'];

const MOCK_ACTION_HISTORY: MockActionRecord[] = Array.from({ length: 50 }).map((_, i) => {
    const agentIdx = i % 15;
    const intentIdx = i % ACTION_INTENTS_DATA.length;
    const intent = ACTION_INTENTS_DATA[intentIdx];
    const status = HISTORY_STATUSES[i % HISTORY_STATUSES.length];
    const agentName = AGENT_NAMES[agentIdx][0];
    const callNum = 100 + i;
    const minutesAgo = i * 12 + Math.floor(Math.random() * 10);

    return {
        actionId: `act_${String(i + 1).padStart(3, '0')}`,
        callId: `call-${String(callNum).padStart(3, '0')}`,
        agentId: `a_${1001 + agentIdx}`,
        agentName,
        intentSlug: intent.slug,
        intentName: intent.name,
        status,
        confidence: +(0.7 + Math.random() * 0.28).toFixed(2),
        payload: {
            summary: `Agent ${agentName} triggered "${intent.name}" during call-${callNum}`,
            extractedFields: {
                customer_name: ['John Smith', 'Maria Garcia', 'Wei Zhang', 'Sarah Johnson', 'Ahmed Hassan'][i % 5],
                issue_type: ['billing', 'technical', 'account', 'shipping', 'product'][i % 5],
            }
        },
        createdAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    };
});

const MOCK_ACTION_DISCOVERIES: MockActionDiscovery[] = [
    {
        id: 'disc-1', name: 'Reschedule Appointment', slug: 'reschedule_appointment',
        confidence: 0.92, occurrences: 145, category: 'scheduling',
        reason: 'Detected frequent manual calendar updates after phrase "let\'s move our meeting"',
        samplePhrases: ['can we reschedule', 'move our meeting', 'change the appointment', 'different time'],
    },
    {
        id: 'disc-2', name: 'Send Pricing PDF', slug: 'send_pricing_pdf',
        confidence: 0.88, occurrences: 89, category: 'sales',
        reason: 'Detected email composition with attachment after "send me the rates"',
        samplePhrases: ['send me the rates', 'pricing information', 'how much does it cost', 'price list'],
    },
    {
        id: 'disc-3', name: 'Cancel Subscription', slug: 'cancel_subscription',
        confidence: 0.85, occurrences: 67, category: 'ecommerce',
        reason: 'Agents frequently process manual cancellation forms after "I want to cancel"',
        samplePhrases: ['cancel my subscription', 'stop the service', 'end my plan', 'unsubscribe'],
    },
    {
        id: 'disc-4', name: 'Request Technical Support', slug: 'request_tech_support',
        confidence: 0.82, occurrences: 112, category: 'support',
        reason: 'Detected repeated transfers to technical team after "not working properly"',
        samplePhrases: ['not working', 'broken feature', 'technical issue', 'can\'t login', 'error message'],
    },
    {
        id: 'disc-5', name: 'Update Shipping Address', slug: 'update_shipping',
        confidence: 0.79, occurrences: 54, category: 'ecommerce',
        reason: 'Agents manually updating CRM address fields after "I moved to a new address"',
        samplePhrases: ['changed my address', 'new address', 'moved recently', 'update delivery'],
    },
    {
        id: 'disc-6', name: 'Request Invoice Copy', slug: 'request_invoice',
        confidence: 0.91, occurrences: 98, category: 'support',
        reason: 'Agents frequently email invoices manually after "can you send me the invoice"',
        samplePhrases: ['send invoice', 'need a receipt', 'copy of my bill', 'invoice for tax'],
    },
];

export const getMockActionHistory = () => Promise.resolve({ data: { data: MOCK_ACTION_HISTORY, total: MOCK_ACTION_HISTORY.length } });
export const getMockActionDiscoveries = () => Promise.resolve({ data: { data: MOCK_ACTION_DISCOVERIES } });
export const getMockActionIntents = () => Promise.resolve({ data: { data: ACTION_INTENTS_DATA } });

// --- Morning Brief Mocks (WOW #1) ---

export const getMockMorningBrief = () => ({
    summary: '昨日共处理 327 通电话，成交率 18.2%，较前日提升 2.1%。平均 MOS 3.74，通话质量稳定。客服 B 组情绪压力偏高（压力指数 0.72），建议调整排班或安排心理辅导。产品退货话题较前天增加 40%，请关注相关产品质量。🏆 最佳坐席: Alice Wonderland（12 笔成交）。整体运营平稳高效。',
    metrics: {
        totalCalls: 327,
        avgMOS: 3.74,
        conversionRate: 18.2,
        abandonRate: 4.5,
        avgDuration: 245,
        topAgentName: 'Alice Wonderland',
        topAgentConversions: 12,
        avgStress: 0.45,
        highStressAgents: 2,
    },
    generatedAt: new Date().toISOString(),
    model: 'gpt-4o',
    disclaimer: false,
});

// --- Leaderboard Mocks (WOW #5) ---

export const getMockLeaderboard = (period: string = 'today', metric: string = 'conversions') => {
    const names = [
        'Alice Wonderland', 'Bob Builder', 'Charlie Puth', 'Diana Prince',
        'Ethan Hunt', 'Fiona Gallagher', 'George Kim', 'Hannah Montana',
        'Ivan Drago', 'Julia Roberts',
    ];

    const leaderboard = names.map((name, i) => ({
        rank: i + 1,
        agentId: `a_${1001 + i}`,
        agentName: name,
        totalCalls: Math.floor(Math.random() * 30 + 15),
        conversions: Math.floor(Math.random() * 12 + 3) - i,
        avgDurationMin: +(2 + Math.random() * 4).toFixed(1),
        avgMOS: +(3.2 + Math.random() * 1.2).toFixed(2),
        streak: i < 3 ? Math.floor(Math.random() * 5) + 1 : 0,
    })).sort((a, b) => {
        if (metric === 'satisfaction') return b.avgMOS - a.avgMOS;
        if (metric === 'calls') return b.totalCalls - a.totalCalls;
        return b.conversions - a.conversions;
    }).map((entry, i) => ({ ...entry, rank: i + 1 }));

    return {
        period,
        metric,
        generatedAt: new Date().toISOString(),
        leaderboard,
    };
};

