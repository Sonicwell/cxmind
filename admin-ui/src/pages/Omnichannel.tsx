import { Input } from '../components/ui/input';
import { Select } from '../components/ui/Select';
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useVisibilityAwareInterval } from '../hooks/useVisibilityAwareInterval';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useWebSocket } from '../context/WebSocketContext';
import CustomerSimulator from '../components/CustomerSimulator';
import { useDemoMode } from '../hooks/useDemoMode';
import '../styles/omnichannel.css';

import { Button } from '../components/ui/button';

// ── Types ──
interface Conversation {
    _id: string;
    channel: string;
    status: string;
    priority?: string;
    metadata: { visitorId?: string; visitorName?: string; visitorEmail?: string; visitorPhone?: string; pageUrl?: string; userAgent?: string; ip?: string; browser?: string; os?: string; referrer?: string; intent?: string; sentiment?: string };
    contactId?: { displayName?: string; identifiers?: any };
    assignedAgentId?: string | { _id: string; displayName?: string; sipNumber?: string };
    subject?: string;
    messageCount: number;
    unreadCount: number;
    lastMessageAt: string;
    createdAt: string;
    firstResponseAt?: string;
    resolvedAt?: string;
    resolveReason?: string;
    satisfaction?: number;
    tags: string[];
}
interface CopilotSignal {
    id: string;
    type: 'suggestion' | 'action_draft' | 'summary' | 'crm_lookup';
    data: any;
    timestamp: Date;
}

interface DashboardKPI {
    queued: number;
    botActive: number;
    active: number;
    resolvedToday: number;
    botDeflectionRate: number;
    avgWaitTimeSec: number;
}

const CHANNEL_ICONS: Record<string, { icon: string; color: string }> = {
    webchat: { icon: '💬', color: 'var(--primary)' },
    whatsapp: { icon: '📱', color: '#25D366' },
    line: { icon: '🟢', color: '#00B900' },
    email: { icon: '📧', color: '#EA4335' },
    voice: { icon: '📞', color: '#3B82F6' },
};

const STATUS_COLORS: Record<string, string> = {
    queued: 'hsl(35, 95%, 55%)',
    assigned: '#8b5cf6',
    bot_active: '#06b6d4',
    active: 'hsl(150, 70%, 40%)',
    wrap_up: '#8b5cf6',
    resolved: 'var(--text-muted)',
    archived: 'var(--text-muted)',
};

const REASON_ICONS: Record<string, { icon: string; color: string }> = {
    agent_closed: { icon: '✅', color: 'hsl(150, 70%, 40%)' },
    visitor_left: { icon: '👋', color: 'hsl(35, 90%, 55%)' },
    customer_inactive: { icon: '⏰', color: 'var(--text-muted)' },
    agent_unresponsive: { icon: '🚨', color: '#ef4444' },
    bot_resolved: { icon: '🤖', color: '#06b6d4' },
    bot_handoff_timeout: { icon: '🤖⏰', color: '#f59e0b' },
    stale_cleanup: { icon: '🧹', color: 'var(--text-muted)' },
    admin_bulk: { icon: '🔧', color: '#8b5cf6' },
};



const Omnichannel: React.FC = () => {
    // ── Global State ──
    const { t } = useTranslation();
    const { demoMode: isDemoMode } = useDemoMode();
    const [activeTab, setActiveTab] = useState<'live' | 'archive'>('live');
    const [kpi, setKpi] = useState<DashboardKPI>({ queued: 0, botActive: 0, active: 0, resolvedToday: 0, botDeflectionRate: 0, avgWaitTimeSec: 0 });

    // i18n-aware config maps
    const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
        queued: { label: t('omnichannel.statusQueued'), color: STATUS_COLORS.queued },
        assigned: { label: t('omnichannel.statusAssigned'), color: STATUS_COLORS.assigned },
        bot_active: { label: t('omnichannel.statusBotActive'), color: STATUS_COLORS.bot_active },
        active: { label: t('omnichannel.statusActive'), color: STATUS_COLORS.active },
        wrap_up: { label: t('omnichannel.statusWrapUp'), color: STATUS_COLORS.wrap_up },
        resolved: { label: t('omnichannel.statusResolved'), color: STATUS_COLORS.resolved },
        archived: { label: t('omnichannel.statusArchived'), color: STATUS_COLORS.archived },
    };
    const CHANNEL_CONFIG: Record<string, { icon: string; label: string; color: string }> = Object.fromEntries(
        Object.entries(CHANNEL_ICONS).map(([k, v]) => [k, { ...v, label: t(`omnichannel.channel_${k}`, { defaultValue: k }) }])
    ) as any;
    const REASON_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
        agent_closed: { ...REASON_ICONS.agent_closed, label: t('omnichannel.reasonAgentClosed') },
        visitor_left: { ...REASON_ICONS.visitor_left, label: t('omnichannel.reasonVisitorLeft') },
        customer_inactive: { ...REASON_ICONS.customer_inactive, label: t('omnichannel.reasonCustomerInactive') },
        agent_unresponsive: { ...REASON_ICONS.agent_unresponsive, label: t('omnichannel.reasonAgentUnresponsive') },
        bot_resolved: { ...REASON_ICONS.bot_resolved, label: t('omnichannel.reasonBotResolved') },
        bot_handoff_timeout: { ...REASON_ICONS.bot_handoff_timeout, label: t('omnichannel.reasonBotHandoffTimeout') },
        stale_cleanup: { ...REASON_ICONS.stale_cleanup, label: t('omnichannel.reasonStaleCleanup') },
        admin_bulk: { ...REASON_ICONS.admin_bulk, label: t('omnichannel.reasonAdminBulk') },
    };

    // ── Live Monitoring State ──
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [availableAgents, setAvailableAgents] = useState(0);
    const [botEnabled, setBotEnabled] = useState(true);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set([]));
    const [groupLimits, setGroupLimits] = useState<Record<string, number>>({});
    const [selectedTagFilter, setSelectedTagFilter] = useState('');
    const [selectedIntentFilter, setSelectedIntentFilter] = useState('');

    // ── Archive State ──
    const [resolvedConvs, setResolvedConvs] = useState<Conversation[]>([]);
    const [resolvedTotal, setResolvedTotal] = useState(0);
    const [resolvedLoaded, setResolvedLoaded] = useState(false);
    const [resolvedReasonFilter, setResolvedReasonFilter] = useState('');
    const [resolvedSearch, setResolvedSearch] = useState('');

    // ── Details View State ──
    const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [copilotSignals, setCopilotSignals] = useState<Record<string, CopilotSignal[]>>({});
    const msgEndRef = useRef<HTMLDivElement>(null);
    const signalsEndRef = useRef<HTMLDivElement>(null);
    const selectedConvRef = useRef<string | null>(null);

    // ── Tools State ──
    const [showSim, setShowSim] = useState(false);
    const { subscribe, send } = useWebSocket();

    const STATUS_ORDER = ['queued', 'bot_active', 'active', 'wrap_up'];

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        conversations.forEach(c => c.tags?.forEach(t => tags.add(t)));
        return Array.from(tags).sort();
    }, [conversations]);

    const allIntents = useMemo(() => {
        const intents = new Set<string>();
        conversations.forEach(c => {
            if (c.metadata?.intent) intents.add(c.metadata.intent);
        });
        return Array.from(intents).sort();
    }, [conversations]);

    const groupedConversations = useMemo(() => {
        const groups: Record<string, Conversation[]> = {};
        for (const status of STATUS_ORDER) groups[status] = [];

        for (const conv of conversations) {
            // Tag过滤
            if (selectedTagFilter) {
                if (selectedTagFilter === '__new__') {
                    if (conv.tags && conv.tags.length > 0) continue;
                } else {
                    if (!conv.tags || !conv.tags.includes(selectedTagFilter)) continue;
                }
            }

            // Intent/Issue过滤
            if (selectedIntentFilter) {
                if (conv.metadata?.intent !== selectedIntentFilter) continue;
            }

            const s = conv.status === 'assigned' ? 'active' : conv.status;
            if (!groups[s]) groups[s] = [];
            groups[s].push(conv);
        }
        return STATUS_ORDER.filter(s => groups[s] && groups[s].length > 0).map(s => ({
            status: s,
            label: STATUS_CONFIG[s]?.label || s,
            color: STATUS_CONFIG[s]?.color || 'var(--text-muted)',
            icon: s === 'queued' ? '⏳' : s === 'bot_active' ? '🤖' : s === 'active' ? '🟢' : s === 'wrap_up' ? '🔄' : '✅',
            conversations: groups[s],
        }));
    }, [conversations, selectedTagFilter]);

    const toggleGroup = (status: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(status)) next.delete(status);
            else next.add(status);
            return next;
        });
    };

    // ── Data Fetching ──
    const loadDashboardKPI = useCallback(async () => {
        try {
            const res = await api.get('/omnichannel-analytics/dashboard', { params: { mock: isDemoMode } });
            setKpi(res.data?.data || res.data);
        } catch (err) {
            console.error('Failed to load dashboard KPI:', err);
        }
    }, [isDemoMode]);

    const loadLiveConversations = useCallback(async () => {
        try {
            let liveList: Conversation[] = [];
            let mockList: Conversation[] = [];

            // Always fetch real conversations so Simulator works
            const params = { limit: '200', offset: '0', status: 'queued,assigned,bot_active,active,wrap_up' };
            try {
                const res = await api.get('/conversations', { params });
                liveList = res.data?.data || [];
            } catch (err) { console.error('Failed to load real convs:', err); }

            if (isDemoMode) {
                try {
                    const res = await api.get('/omnichannel-analytics/demo-list');
                    const raw = res.data;
                    const data = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw?.data?.data) ? raw.data.data : []));
                    mockList = data;
                } catch (err) { console.error('Failed to load mock convs:', err); }
            }

            // Merge and deduplicate by ID
            const combined = [...liveList, ...mockList.filter(c => c.status !== 'resolved')];
            const unique = Array.from(new Map(combined.map(c => [c._id, c])).values());
            setConversations(unique);

        } catch (err) {
            console.error('Failed to load live conversations:', err);
        }

        // Fetch tools state (only in real mode)
        if (!isDemoMode) {
            api.get('/conversations/im-agents').then(res => setAvailableAgents(res.data?.available || 0)).catch(() => { });
            api.get('/conversations/bot-config').then(res => setBotEnabled(res.data?.data?.enabled !== false)).catch(() => { });
        } else {
            setAvailableAgents(12);
            setBotEnabled(true);
        }
        setLoading(false);
    }, [isDemoMode]);

    const loadResolved = async (append = false) => {
        try {
            if (isDemoMode) {
                const res = await api.get('/omnichannel-analytics/demo-list');
                const raw = res.data;
                const data = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw?.data?.data) ? raw.data.data : []));
                const mocks: Conversation[] = data;
                setResolvedConvs(mocks.filter(c => c.status === 'resolved'));
                setResolvedTotal(mocks.filter(c => c.status === 'resolved').length);
                setResolvedLoaded(true);
                return;
            }

            const params: Record<string, string> = {
                status: 'resolved',
                limit: '50',
                offset: append ? resolvedConvs.length.toString() : '0',
            };
            if (resolvedReasonFilter) params.resolveReason = resolvedReasonFilter;
            if (resolvedSearch) params.search = resolvedSearch;

            const res = await api.get('/conversations', { params });
            const data: Conversation[] = res.data?.data || [];
            if (append) {
                // Deduplicate before append
                setResolvedConvs(prev => {
                    const ids = new Set(prev.map(c => c._id));
                    return [...prev, ...data.filter(c => !ids.has(c._id))];
                });
            } else {
                setResolvedConvs(data);
            }
            setResolvedTotal(res.data?.total || 0);
            setResolvedLoaded(true);
        } catch (err) {
            console.error('Failed to load resolved:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchAllData = useCallback(() => {
        loadDashboardKPI();
        if (activeTab === 'live') {
            loadLiveConversations();
        } else if (activeTab === 'archive') {
            loadResolved();
        }
    }, [loadDashboardKPI, loadLiveConversations, activeTab, isDemoMode]);

    useEffect(() => {
        setLoading(true);
        fetchAllData();
    }, [fetchAllData]);

    // 后台标签页不轮询
    useVisibilityAwareInterval(fetchAllData, isDemoMode ? 60000 : 15000);

    // 切mode时清空选中
    useEffect(() => {
        setSelectedConv(null);
    }, [isDemoMode, activeTab]);

    // ── WebSocket Subscriptions ──
    const handleOmniMessage = useCallback((msg: any) => {
        const payload = msg.payload || msg.data || msg;
        const msgConversationId = payload.conversationId || payload.data?.conversationId || msg.data?.conversationId;
        const messageObj = payload.message || payload.data || msg.data;

        if (selectedConvRef.current === msgConversationId && messageObj) {
            setMessages(prev => {
                const msgId = messageObj._id || messageObj.messageId;
                const exists = prev.some(m => (m._id === msgId) || (m.messageId === msgId));
                if (exists) return prev;
                return [...prev, messageObj];
            });
            setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    }, []);

    const handleCopilotSignal = useCallback((msg: any) => {
        const payload = msg.payload || msg.data || msg;
        const targetId = payload.conversationId || msg.data?.conversationId || msg.data?.data?.conversationId;
        if (!targetId) return;

        const signalType = (msg.type || '').replace('omni:', '');

        setCopilotSignals(prev => {
            const current = prev[targetId] || [];
            // Deduplicate: replace existing signal of the same type
            const filtered = current.filter(s => s.type !== signalType);
            return {
                ...prev,
                [targetId]: [...filtered, {
                    id: Date.now().toString(),
                    type: signalType,
                    data: msg.data || payload,
                    timestamp: new Date()
                }]
            };
        });
        setTimeout(() => signalsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
    }, []);

    useEffect(() => {
        const unsubSugg = subscribe('omni:suggestion', handleCopilotSignal);
        const unsubDraft = subscribe('omni:action_draft', handleCopilotSignal);
        const unsubSum = subscribe('omni:summary', handleCopilotSignal);
        const unsubCrm = subscribe('omni:crm_lookup', handleCopilotSignal);

        // Always subscribe to live messages so Simulator works in Demo Mode
        const unsubMsgAgent = subscribe('omni:agent_message', handleOmniMessage);
        const unsubMsgCust = subscribe('omni:customer_message', handleOmniMessage);
        const unsubMsg = subscribe('omni_message', handleOmniMessage);
        const unsubTyping = subscribe('omni_typing', handleOmniMessage);

        return () => {
            unsubSugg(); unsubDraft(); unsubSum(); unsubCrm();
            unsubMsgAgent(); unsubMsgCust(); unsubMsg(); unsubTyping();
        };
    }, [subscribe, handleOmniMessage, handleCopilotSignal]);

    // ── Interaction Handlers ──
    const openConversation = async (conv: Conversation) => {
        // 退订上一个会话context
        if (selectedConv) {
            send({ type: 'ctx:unsubscribe', conversationId: selectedConv._id });
        }

        setSelectedConv(conv);
        selectedConvRef.current = conv._id;
        setMessages([]);

        // 订阅当前会话的streaming context更新
        send({ type: 'ctx:subscribe', conversationId: conv._id });

        try {
            // Pull cached copilot context from server
            try {
                const ctxRes = await api.get(`/conversations/${conv._id}/context`);
                const ctx = ctxRes.data;
                // Inject ready signals as copilot cards
                for (const [signal, data] of Object.entries(ctx)) {
                    if (data && (data as any).status === 'ready') {
                        const typeMap: Record<string, string> = { crm: 'crm_lookup', suggestion: 'suggestion', summary: 'summary' };
                        handleCopilotSignal({
                            type: `omni:${typeMap[signal] || signal}`,
                            data: { conversationId: conv._id, ...(data as any) },
                        });
                    }
                }
            } catch { /* context not available yet, will arrive via WS */ }

            if (isDemoMode) {
                const res = await api.get(`/omnichannel-analytics/demo-messages/${conv._id}`);
                setMessages(res.data?.data?.messages || res.data?.data || []);
            } else {
                const res = await api.get(`/conversations/${conv._id}`);
                setMessages(res.data?.data?.messages || []);
                // 更新本地计数
                if (conv.status !== 'resolved') {
                    setConversations(prev => prev.map(c => c._id === conv._id ? { ...c, unreadCount: 0 } : c));
                }
            }
            setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
        } catch (e) {
            console.error('Failed to load messages:', e);
        }
    };

    const timeAgo = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
        const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
        if (diffSecs < 60) return `${diffSecs}s ago`;
        const diffMins = Math.floor(diffSecs / 60);
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    };



    return (
        <div style={{ padding: 'var(--spacing-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
                <div>
                    <h2 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '1.4rem' }}>🎧</span> {t('omnichannel.title')}
                        {isDemoMode && <span className="demo-mode-badge" style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, background: '#8b5cf6', color: '#fff' }}>{t('omnichannel.demoMode')}</span>}
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        {t('omnichannel.agentsAvailable', { count: availableAgents })}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                    {!isDemoMode && (
                        <Button
                            onClick={async () => {
                                try {
                                    const next = !botEnabled;
                                    await api.put('/conversations/bot-config', { enabled: next });
                                    setBotEnabled(next);
                                } catch (err) { alert('Failed to toggle bot'); }
                            }}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', color: botEnabled ? '#06b6d4' : '#ef4444', borderColor: botEnabled ? '#06b6d4' : '#ef4444' }}
                        >
                            {botEnabled ? `🤖 ${t('omnichannel.botOn')}` : `🚫 ${t('omnichannel.botOff')}`}
                        </Button>
                    )}
                    <Button onClick={() => setShowSim(!showSim)} className={`btn ${showSim ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                        🧑‍💻 {showSim ? t('omnichannel.hideSimulator') : t('omnichannel.showSimulator')}
                    </Button>
                </div>
            </div>

            {/* ── KPI Dashboard Scorecard ── */}
            <div className="omni-kpi-grid">
                <div className="omni-kpi-card" style={{ borderLeft: '3px solid hsl(35, 95%, 55%)' }}>
                    <div className="omni-kpi-icon" style={{ background: 'hsla(35, 95%, 55%, 0.15)', color: 'hsl(35, 95%, 55%)' }}>⏳</div>
                    <div className="omni-kpi-content">
                        <span className="omni-kpi-label">{t('omnichannel.queued')}</span>
                        <span className="omni-kpi-value">{kpi.queued}</span>
                    </div>
                </div>
                <div className="omni-kpi-card" style={{ borderLeft: '3px solid #06b6d4' }}>
                    <div className="omni-kpi-icon" style={{ background: 'hsla(188, 93%, 36%, 0.15)', color: '#06b6d4' }}>🤖</div>
                    <div className="omni-kpi-content">
                        <span className="omni-kpi-label">{t('omnichannel.botHandling')}</span>
                        <span className="omni-kpi-value">{kpi.botActive}</span>
                    </div>
                </div>
                <div className="omni-kpi-card" style={{ borderLeft: '3px solid hsl(150, 70%, 40%)' }}>
                    <div className="omni-kpi-icon" style={{ background: 'hsla(150, 70%, 40%, 0.15)', color: 'hsl(150, 70%, 40%)' }}>🟢</div>
                    <div className="omni-kpi-content">
                        <span className="omni-kpi-label">{t('omnichannel.agentsActive')}</span>
                        <span className="omni-kpi-value">{kpi.active}</span>
                    </div>
                </div>
                <div className="omni-kpi-card" style={{ borderLeft: '3px solid #8b5cf6' }}>
                    <div className="omni-kpi-icon" style={{ background: 'hsla(258, 90%, 66%, 0.15)', color: '#8b5cf6' }}>✅</div>
                    <div className="omni-kpi-content">
                        <span className="omni-kpi-label">{t('omnichannel.resolvedToday')}</span>
                        <span className="omni-kpi-value">{kpi.resolvedToday}</span>
                    </div>
                </div>
            </div>

            {/* ── Tabs Selector ── */}
            <div className="omni-tabs">
                <div className={`omni-tab ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
                    🚀 {t('omnichannel.liveTab')}
                </div>
                <div className={`omni-tab ${activeTab === 'archive' ? 'active' : ''}`} onClick={() => { setActiveTab('archive'); if (!resolvedLoaded) loadResolved(); }}>
                    🗄️ {t('omnichannel.archiveTab')}
                </div>
            </div>

            {/* ── Content Area ── */}
            <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                {/* LIST PANEL */}
                <div style={{ flex: 1, maxHeight: 650, overflowY: 'auto', paddingRight: 4 }}>
                    {loading ? (
                        <div className="glass-card" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-muted)' }}>{t('omnichannel.loading', { tab: activeTab })}</div>
                    ) : activeTab === 'live' ? (
                        // LIVE VIEW
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                            {/* Live Filter Bar */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                <Select
                                    value={selectedTagFilter}
                                    onChange={e => setSelectedTagFilter(e.target.value)}
                                    style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-primary)', outline: 'none' }}
                                >
                                    <option value="">🏷️ {t('omnichannel.allTags')}</option>
                                    <option value="__new__">✨ {t('omnichannel.newNoTags')}</option>
                                    {allTags.map(tag => (
                                        <option key={tag} value={tag}>#{tag}</option>
                                    ))}
                                </Select>
                                <Select
                                    value={selectedIntentFilter}
                                    onChange={e => setSelectedIntentFilter(e.target.value)}
                                    style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-primary)', outline: 'none', textTransform: 'capitalize' }}
                                >
                                    <option value="">🎯 {t('omnichannel.allIntents')}</option>
                                    {allIntents.map(intent => (
                                        <option key={intent} value={intent}>{intent.replace(/_/g, ' ')}</option>
                                    ))}
                                </Select>
                            </div>

                            {groupedConversations.length === 0 ? (
                                <div className="glass-card" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-muted)' }}>{t('omnichannel.noLive')}</div>
                            ) : (
                                groupedConversations.map((group, gi) => {
                                    const isCollapsed = collapsedGroups.has(group.status);
                                    return (
                                        <React.Fragment key={group.status}>
                                            {gi > 0 && <div className="conv-group-divider" />}
                                            <div className="conv-group-header" onClick={() => toggleGroup(group.status)}>
                                                <span className={`conv-group-chevron ${isCollapsed ? '' : 'expanded'}`}>▶</span>
                                                <span>{group.icon}</span>
                                                <span className="conv-group-label" style={{ color: group.color }}>{group.label}</span>
                                                <span className="conv-group-count" style={{ background: group.color }}>{group.conversations.length}</span>
                                            </div>
                                            <div className={`conv-group-content ${isCollapsed ? 'collapsed' : ''}`}>
                                                <div className="conv-group-content-inner">
                                                    {(() => {
                                                        const limit = groupLimits[group.status] || 10;
                                                        const visibleConvs = group.conversations.slice(0, limit);
                                                        const hasMore = group.conversations.length > limit;

                                                        return (
                                                            <>
                                                                {visibleConvs.map(conv => {
                                                                    const ch = CHANNEL_CONFIG[conv.channel] || CHANNEL_CONFIG.webchat;
                                                                    const st = STATUS_CONFIG[conv.status] || STATUS_CONFIG.queued;
                                                                    const name = conv.metadata?.visitorName || conv.contactId?.displayName || `Visitor-${(conv.metadata?.visitorId || '').slice(0, 6)}`;
                                                                    const isSelected = selectedConv?._id === conv._id;

                                                                    return (
                                                                        <div key={conv._id} onClick={() => openConversation(conv)} className="glass-card" style={{
                                                                            padding: '0.75rem 1rem', cursor: 'pointer',
                                                                            borderLeft: `3px solid ${st.color}`,
                                                                            borderColor: isSelected ? 'var(--primary)' : undefined,
                                                                            background: isSelected ? 'hsla(var(--primary-hue), var(--primary-sat), 60%, 0.08)' : undefined,
                                                                        }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                    <span>{ch.icon}</span>
                                                                                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{name}</span>
                                                                                    {conv.metadata?.sentiment === 'angry' && <span title="Angry/Frustrated" style={{ fontSize: 10 }}>😡</span>}
                                                                                    {conv.unreadCount > 0 && <span style={{ background: 'var(--primary)', color: 'white', fontSize: '0.625rem', padding: '1px 6px', borderRadius: 12, fontWeight: 700 }}>{conv.unreadCount}</span>}
                                                                                </div>
                                                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{timeAgo(conv.lastMessageAt || conv.createdAt)}</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                    {conv.subject || '—'}
                                                                                </span>
                                                                                <span style={{ fontSize: '0.625rem', padding: '2px 8px', borderRadius: 4, background: `color-mix(in srgb, ${st.color} 12%, transparent)`, color: st.color, fontWeight: 600 }}>{st.label}</span>
                                                                            </div>
                                                                            {conv.status === 'active' ? (
                                                                                <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg-light)', borderRadius: 8, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                                                        <span>👤 {t('omnichannel.agentLabel')}: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{(conv.assignedAgentId as any)?.displayName || 'Unknown'}</span></span>
                                                                                        <span>⏳ {t('omnichannel.queueWait')}: <span style={{ color: 'var(--text-primary)' }}>{Math.floor((new Date(conv.firstResponseAt || conv.createdAt).getTime() - new Date(conv.createdAt).getTime()) / 60000)}m</span></span>
                                                                                    </div>
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                        <span>💬 {t('omnichannel.lastMsg')} (<span style={{ color: conv.unreadCount > 0 ? 'var(--danger)' : 'var(--text-primary)', fontWeight: conv.unreadCount > 0 ? 600 : 'normal' }}>{conv.unreadCount > 0 ? t('omnichannel.customer') : t('omnichannel.agentLabel')}</span>)</span>
                                                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                            <span>{timeAgo(conv.lastMessageAt || conv.createdAt)}</span>
                                                                                            {conv.unreadCount > 0 && new Date().getTime() - new Date(conv.lastMessageAt || conv.createdAt).getTime() > 5 * 60000 && (
                                                                                                <span className="sla-risk-badge" style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.65rem', border: '1px solid var(--danger)', padding: '2px 6px', borderRadius: 4 }}>{t('omnichannel.slaRisk')}</span>
                                                                                            )}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                                                                    <span>💬 {conv.messageCount}</span>
                                                                                    {conv.assignedAgentId && typeof conv.assignedAgentId === 'object' && (conv.assignedAgentId as any).displayName && (
                                                                                        <span>🎧 {(conv.assignedAgentId as any).displayName}</span>
                                                                                    )}
                                                                                    {conv.tags?.map((t: string) => <span key={t} style={{ background: 'var(--glass-border)', padding: '1px 6px', borderRadius: 4 }}>{t}</span>)}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                                {hasMore && (
                                                                    <Button onClick={(e) => { e.stopPropagation(); setGroupLimits(prev => ({ ...prev, [group.status]: limit + 20 })); }} style={{ width: '100%', padding: '10px', fontSize: '0.75rem', marginTop: 4, background: 'var(--glass-bg)', border: '1px dashed var(--glass-border)', color: 'var(--text-muted)' }}>
                                                                        {t('omnichannel.loadMore', { count: Math.min(20, group.conversations.length - limit), remaining: group.conversations.length - limit })}
                                                                    </Button>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        // ARCHIVE VIEW
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                <Select value={resolvedReasonFilter} onChange={e => { setResolvedReasonFilter(e.target.value); setTimeout(() => loadResolved(), 0); }} style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-primary)' }}>
                                    <option value="">{t('omnichannel.allReasons')}</option>
                                    {Object.entries(REASON_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.icon} {cfg.label}</option>)}
                                </Select>
                                <Input value={resolvedSearch} onChange={e => setResolvedSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadResolved(); }} placeholder={`🔍 ${t('omnichannel.searchNameEmail')}`} style={{ flex: 1, fontSize: '0.8rem', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', color: 'var(--text-primary)' }} />
                            </div>

                            {resolvedConvs.map(conv => {
                                const ch = CHANNEL_CONFIG[conv.channel] || CHANNEL_CONFIG.webchat;
                                const name = conv.metadata?.visitorName || conv.contactId?.displayName || `Visitor-${(conv.metadata?.visitorId || '').slice(0, 6)}`;
                                const reason = REASON_CONFIG[conv.resolveReason || ''] || { icon: '❓', label: conv.resolveReason || 'Unknown', color: 'var(--text-muted)' };
                                const isSelected = selectedConv?._id === conv._id;

                                return (
                                    <div key={conv._id} onClick={() => openConversation(conv)} className="glass-card conv-item-resolved" style={{
                                        padding: '0.75rem 1rem', cursor: 'pointer',
                                        borderLeft: `3px solid ${reason.color}`,
                                        borderColor: isSelected ? 'var(--primary)' : undefined,
                                        background: isSelected ? 'hsla(var(--primary-hue), var(--primary-sat), 60%, 0.08)' : undefined,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span>{ch.icon}</span>
                                                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{name}</span>
                                            </div>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{timeAgo(conv.lastMessageAt || conv.resolvedAt || conv.createdAt)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{conv.subject || '—'}</span>
                                            <span style={{ fontSize: '0.625rem', padding: '2px 8px', borderRadius: 4, background: `color-mix(in srgb, ${reason.color} 12%, transparent)`, color: reason.color, fontWeight: 600 }}>{reason.icon} {reason.label}</span>
                                        </div>
                                    </div>
                                );
                            })}

                            {resolvedConvs.length < resolvedTotal && (
                                <Button onClick={() => loadResolved(true)} className="btn" style={{ width: '100%', padding: '10px', fontSize: '0.8rem', background: 'var(--glass-bg)', border: '1px dashed var(--primary)', color: 'var(--primary)', cursor: 'pointer' }}>
                                    {t('omnichannel.loadMoreArchive', { loaded: resolvedConvs.length, total: resolvedTotal })}
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* DETAILS PANEL (Side drawer) */}
                {selectedConv && (
                    <div className="glass-card" style={{ width: 440, display: 'flex', flexDirection: 'column', maxHeight: 720 }}>
                        {/* Header */}
                        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {selectedConv.metadata?.visitorName || selectedConv.contactId?.displayName || t('omnichannel.visitor')}
                                        {selectedConv.metadata?.sentiment === 'angry' && <span title={t('omnichannel.frustrated')} style={{ fontSize: 13, background: 'rgba(239, 68, 68, 0.15)', padding: '2px 6px', borderRadius: 4 }}>😡 {t('omnichannel.frustrated')}</span>}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                        {selectedConv.channel} · <span style={{ color: STATUS_CONFIG[selectedConv.status]?.color || 'var(--text-muted)', fontWeight: 600 }}>{(STATUS_CONFIG[selectedConv.status]?.label || selectedConv.status).toUpperCase()}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {selectedConv.status !== 'resolved' && (
                                        <Button onClick={async () => {
                                            if (isDemoMode) { alert('Mock action: Resolving'); fetchAllData(); return; }
                                            try { await api.post(`/conversations/${selectedConv._id}/resolve`, { reason: 'admin_closed' }); fetchAllData(); } catch (e) { }
                                        }} style={{ background: '#f0fdf4', border: '1px solid #22c55e', color: '#16a34a', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6 }}>✅ {t('omnichannel.resolve')}</Button>
                                    )}
                                    <Button onClick={() => { send({ type: 'ctx:unsubscribe', conversationId: selectedConv._id }); setSelectedConv(null); selectedConvRef.current = null; }} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>✕</Button>
                                </div>
                            </div>

                            {/* Visitor Details */}
                            <div style={{ marginTop: 12, padding: '8px 10px', background: 'hsla(var(--primary-hue), var(--primary-sat), 80%, 0.1)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                                {selectedConv.metadata?.visitorEmail && <span>📧 {selectedConv.metadata.visitorEmail}</span>}
                                {selectedConv.metadata?.ip && <span>🔗 {selectedConv.metadata.ip}</span>}
                                {selectedConv.metadata?.pageUrl && <span style={{ width: '100%', wordBreak: 'break-all' }}>📄 {t('omnichannel.intentEntry')}: {selectedConv.metadata.pageUrl}</span>}
                            </div>
                        </div>

                        {/* Messages & Signals */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-light)', borderRadius: 'var(--radius-md)', margin: '0 8px', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.02)' }}>
                            {messages.length === 0 && (!copilotSignals[selectedConv._id] || copilotSignals[selectedConv._id].length === 0) ?
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>{t('omnichannel.noMessages')}</div>
                                : (
                                    [...messages, ...(copilotSignals[selectedConv._id] || [])]
                                        .sort((a, b) => {
                                            const timeA = new Date(a.createdAt || a.timestamp).getTime();
                                            const timeB = new Date(b.createdAt || b.timestamp).getTime();
                                            return timeA - timeB;
                                        })
                                        .map((m, i) => {
                                            // Copilot信号
                                            if (m.type && ['suggestion', 'action_draft', 'summary', 'crm_lookup'].includes(m.type)) {
                                                if (m.type === 'suggestion') {
                                                    return (
                                                        <div key={m.id || i} style={{ background: 'rgba(168, 85, 247, 0.1)', border: '1px solid var(--primary)', padding: 12, borderRadius: 8, margin: '4px 0', alignSelf: 'stretch', animation: 'slideIn 0.3s ease-out' }}>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} /> {t('omnichannel.copilotSuggestion')}</div>
                                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{m.data.text}</div>
                                                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                                                <Button style={{ fontSize: '0.75rem', padding: '4px 12px' }}>{t('omnichannel.copyToChat')}</Button>
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>{t('omnichannel.copilotSource')}: {m.data.source}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (m.type === 'action_draft') {
                                                    return (
                                                        <div key={m.id || i} style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: 12, borderRadius: 8, margin: '4px 0', alignSelf: 'stretch', animation: 'slideIn 0.3s ease-out' }}>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>⚡ {t('omnichannel.autoDraftAction')}: {m.data.intentName}</div>
                                                            <pre style={{ margin: '8px 0', fontSize: '0.75rem', background: 'var(--bg-card)', padding: 8, borderRadius: 6, color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>{JSON.stringify(m.data.draft, null, 2)}</pre>
                                                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                                                <Button style={{ fontSize: '0.75rem', padding: '4px 12px' }} variant="destructive">{t('omnichannel.approveExecute')}</Button>
                                                                <Button style={{ fontSize: '0.75rem', padding: '4px 12px' }} variant="secondary">{t('omnichannel.dismiss')}</Button>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (m.type === 'summary') {
                                                    return (
                                                        <div key={m.id || i} style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: 12, borderRadius: 8, margin: '4px 0', alignSelf: 'stretch', animation: 'slideIn 0.3s ease-out' }}>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>📝 {t('omnichannel.aiSummary')}</div>
                                                            <div style={{ fontSize: '0.85rem', marginBottom: 8, color: 'var(--text-primary)', lineHeight: 1.5 }}>{m.data.ai_summary.raw_summary}</div>
                                                            <div style={{ display: 'flex', gap: 6 }}>
                                                                {m.data.ai_summary.topics?.map((topic: string) => <span key={topic} style={{ fontSize: '0.65rem', background: 'var(--bg-card)', color: 'var(--success)', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(16, 185, 129, 0.2)' }}>#{topic}</span>)}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (m.type === 'crm_lookup') {
                                                    return (
                                                        <div key={m.id || i} style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.3)', padding: 12, borderRadius: 8, margin: '4px 0', alignSelf: 'stretch', animation: 'slideIn 0.3s ease-out' }}>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>🔍 {t('omnichannel.crmLookup')} ({m.data.provider})</div>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.8rem' }}>
                                                                <div><span style={{ color: 'var(--text-muted)' }}>{t('omnichannel.crmName')}:</span> <span style={{ color: 'var(--text-primary)' }}>{m.data.data.name}</span></div>
                                                                <div><span style={{ color: 'var(--text-muted)' }}>{t('omnichannel.crmHealth')}:</span> <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{m.data.data.healthScore}</span></div>
                                                                <div><span style={{ color: 'var(--text-muted)' }}>{t('omnichannel.crmLtv')}:</span> <span style={{ color: 'var(--success)' }}>{m.data.data.lifetimeValue}</span></div>
                                                                <div><span style={{ color: 'var(--text-muted)' }}>{t('omnichannel.crmOpenTickets')}:</span> <span style={{ color: 'var(--text-primary)' }}>{m.data.data.recentTickets}</span></div>
                                                            </div>
                                                            <div style={{ marginTop: 12, borderTop: '1px solid var(--glass-border)', paddingTop: 8 }}>
                                                                <Button style={{ fontSize: '0.7rem', padding: '4px 8px', background: 'var(--bg-card)' }} variant="secondary">{t('omnichannel.openInProvider', { provider: m.data.provider })}</Button>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }

                                            // Normal Message Handling
                                            const role = m.senderRole || m.sender_role || 'system';
                                            const bgMap: Record<string, string> = { customer: 'var(--bg-card)', agent: 'var(--primary)', bot: 'var(--brand-cyan)', system: 'transparent' };
                                            const isSelf = role === 'agent' || role === 'bot';
                                            const text = m.text || m.content_text || '';

                                            return (
                                                <div key={m.messageId || m._id || i} style={{
                                                    alignSelf: role === 'system' ? 'center' : isSelf ? 'flex-end' : 'flex-start',
                                                    background: bgMap[role],
                                                    color: isSelf ? '#fff' : 'var(--text-primary)',
                                                    padding: role === 'system' ? '4px 8px' : '8px 12px',
                                                    borderRadius: 8, maxWidth: '85%', fontSize: '0.85rem',
                                                    border: !isSelf && role !== 'system' ? '1px solid var(--glass-border)' : 'none',
                                                    boxShadow: isSelf ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
                                                }}>
                                                    {role !== 'agent' && role !== 'system' && <div style={{ fontSize: '0.65rem', opacity: 0.7, marginBottom: 2 }}>{m.senderName || m.sender_name}</div>}
                                                    <div>{text}</div>
                                                </div>
                                            );
                                        })
                                )}
                            <div ref={signalsEndRef} />
                            <div ref={msgEndRef} />
                        </div>

                        {/* Intervene Operations Footer */}
                        {selectedConv.status !== 'resolved' && (
                            <div style={{ padding: '0.75rem 1rem', background: 'var(--glass-bg)', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: 10, marginTop: 8, borderRadius: '0 0 var(--radius-md) var(--radius-md)' }}>
                                <Input placeholder={t('omnichannel.typeNote')} style={{ flex: 1, padding: '8px 16px', borderRadius: 9999, border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none' }} />
                                <Button style={{ padding: '6px 16px', fontSize: '0.875rem', borderRadius: 9999 }} onClick={async () => {
                                    try {
                                        await api.post('/conversations/pickup-next', { agentId: selectedConv.assignedAgentId || 'auto' });
                                        fetchAllData();
                                    } catch (e) { console.error('Assign failed:', e); }
                                }}>{t('omnichannel.assign')}</Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Customer Simulator */}
            {showSim && <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}><CustomerSimulator onClose={() => setShowSim(false)} /></div>}
        </div>
    );
};

export default Omnichannel;
