import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, X, Sparkles, Loader2, Maximize2, Minimize2, Trash2, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { sanitizeHtml } from '../../utils/sanitize';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import './AIOverlay.css';

import { Button } from './button';

// Simple markdown-to-text renderer (no external dependency needed)
const SimpleMarkdown: React.FC<{ children: string }> = ({ children }) => {
    const rawHtml = children
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br/>');

    return <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(rawHtml) }} />;
};

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    toolCalls?: Array<{ name: string; args: any; result: any }>;
    timestamp: number;
}

// ── Tool Call Card (expandable) ──
const ToolCallCard: React.FC<{ tc: { name: string; args: any; result: any } }> = ({ tc }) => {
    const [expanded, setExpanded] = useState(false);
    const isSuccess = tc.result?.success !== false;
    return (
        <div className="ai-tool-card">
            <div className="ai-tool-card-header" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Wrench size={11} />
                <span className="ai-tool-card-name">{tc.name}</span>
                <span className={`ai-tool-card-status ${isSuccess ? 'success' : 'error'}`}>
                    {isSuccess ? '✓' : '✗'}
                </span>
            </div>
            {expanded && (
                <div className="ai-tool-card-body">
                    <pre>{JSON.stringify(tc.args, null, 2)}</pre>
                    <pre>{JSON.stringify(tc.result, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

// ── Quick action definition ──
interface QuickAction {
    labelKey: string;
    prompt: string;
}

// Page-context map for smart suggestions
const PAGE_CONTEXT: Record<string, { hintKey: string; tools: string[]; actions: QuickAction[] }> = {
    '/dashboard': {
        hintKey: 'aiOverlay.hint.dashboard',
        tools: ['analytics.query', 'system.info'],
        actions: [
            { labelKey: 'aiOverlay.quickAction.callVolume', prompt: "What is today's call volume by hour?" },
            { labelKey: 'aiOverlay.quickAction.qiSummary', prompt: 'Show quality inspection statistics for the last 7 days' },
        ],
    },
    '/monitoring': {
        hintKey: 'aiOverlay.hint.monitoring',
        tools: ['call.lookup', 'agent.search'],
        actions: [
            { labelKey: 'aiOverlay.quickAction.searchAgent', prompt: 'Search for available agents' },
            { labelKey: 'aiOverlay.quickAction.activeCalls', prompt: 'How many active calls right now?' },
        ],
    },
    '/analytics': {
        hintKey: 'aiOverlay.hint.analytics',
        tools: ['analytics.query', 'report.export'],
        actions: [
            { labelKey: 'aiOverlay.quickAction.callTrends', prompt: 'Show call volume trends for the last 7 days' },
            { labelKey: 'aiOverlay.quickAction.exportReport', prompt: 'Export the current analytics report' },
        ],
    },
    '/map': {
        hintKey: 'aiOverlay.hint.map',
        tools: ['agent.search', 'map.updateZone'],
        actions: [],
    },
    '/qi': {
        hintKey: 'aiOverlay.hint.qi',
        tools: ['qi.stats'],
        actions: [
            { labelKey: 'aiOverlay.quickAction.qiSummary', prompt: 'Show quality inspection statistics for the last 7 days' },
            { labelKey: 'aiOverlay.quickAction.qualityTrends', prompt: 'What are the quality score trends this week?' },
        ],
    },
    '/audit': {
        hintKey: 'aiOverlay.hint.audit',
        tools: ['audit.search'],
        actions: [],
    },
    '/calls': {
        hintKey: 'aiOverlay.hint.calls',
        tools: ['call.lookup'],
        actions: [
            { labelKey: 'aiOverlay.quickAction.searchCalls', prompt: 'Look up recent calls' },
            { labelKey: 'aiOverlay.quickAction.recentCalls', prompt: 'Show me calls from the last hour' },
        ],
    },
    '/contacts': {
        hintKey: 'aiOverlay.hint.contacts',
        tools: ['call.lookup', 'agent.search'],
        actions: [],
    },
};

// Common quick actions (shown on every page)
const COMMON_ACTIONS: QuickAction[] = [
    { labelKey: 'aiOverlay.quickAction.todaySLA', prompt: "What is today's SLA and abandon rate?" },
    { labelKey: 'aiOverlay.quickAction.agentPerformance', prompt: "Show me today's top performing agents" },
    { labelKey: 'aiOverlay.quickAction.systemStatus', prompt: 'What is the current system status?' },
];

const RATE_LIMIT = 5; // per minute

// ── Format timestamp ──
const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const AIOverlay: React.FC = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const { user } = useAuth();
    const storageKey = user?.id ? `CXMI_AI_MSG_${user.id}` : null;

    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [requestCount, setRequestCount] = useState(0);
    const [resetTime, setResetTime] = useState(0);
    const messagesEnd = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // History Loading
    useEffect(() => {
        if (storageKey) {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try {
                    setMessages(JSON.parse(saved));
                } catch (e) {
                    setMessages([]);
                }
            } else {
                setMessages([]);
            }
            setHistoryLoaded(true);
        } else {
            setHistoryLoaded(false);
            setMessages([]);
        }
    }, [storageKey]);

    // History Saving (max 50 items)
    useEffect(() => {
        if (storageKey && historyLoaded) {
            if (messages.length > 0) {
                localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
            } else {
                localStorage.removeItem(storageKey);
            }
        }
    }, [messages, storageKey, historyLoaded]);

    // Fetch Morning Brief on load (once per day per user)
    useEffect(() => {
        if (!storageKey || !historyLoaded) return;

        const checkMorningBrief = async () => {
            const today = new Date().toISOString().split('T')[0];
            const briefKey = `ai_morning_brief_date_${user?.id}`;
            const lastBriefDate = localStorage.getItem(briefKey);

            if (lastBriefDate !== today) {
                // Record that we tried today so we don't spam if they refresh
                localStorage.setItem(briefKey, today);

                try {
                    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
                    if (!token) {
                        showEnticingDummyBrief();
                        return;
                    }
                    const res = await fetch('/api/platform/morning-brief', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (res.ok) {
                        const brief = await res.json();
                        const markdownMsg = `**☀️ AI Morning Brief**\n\n${brief.summary}\n\n*Metrics: 📞 ${brief.metrics.totalCalls} Calls | 📈 ${brief.metrics.conversionRate}% Conversion | ⭐ ${brief.metrics.avgMOS} MOS*`;
                        setMessages(prev => [...prev, { role: 'assistant', content: markdownMsg, timestamp: Date.now() }]);
                        setOpen(true);
                    } else {
                        // Probably no LLM configured or error - Show Enticing Dummy
                        showEnticingDummyBrief();
                    }
                } catch (err) {
                    showEnticingDummyBrief();
                }
            }
        };

        checkMorningBrief();
    }, [storageKey, historyLoaded, user?.id]);

    const showEnticingDummyBrief = () => {
        const dummyMsg = `**🌟 昨夜星辰 🌟 AI 运营早报 (示例)**\n\n- 📞 **呼叫量**: 1,208通 (↑ 12%)\n- 🎯 **转化率**: 24.5% (↑ 3.2%)\n- 💡 **洞察**: “退款”提及率环比下降 15%，新推出的 X产品 咨询量激增，建议销售团队重点跟进！\n- 🏆 **今日之星**: Alice (成单 18 笔)\n\n---\n*💡 以上是 AI 能够为您提供的每日深度洞察。当前系统尚未配置大模型引擎，**只需前往设置中配置 LLM (如 OpenAI/通义千问)**，每天清晨我都会为您准备好专属的业务简报，让所有核心数据尽在掌握！*`;
        setMessages(prev => [...prev, { role: 'assistant', content: dummyMsg, timestamp: Date.now() }]);
        setOpen(true);
    };

    // Keyboard shortcut: Cmd+J
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
                e.preventDefault();
                setOpen(prev => !prev);
            }
            if (e.key === 'Escape' && open) {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open]);

    // Auto-focus input when opened
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open]);

    // Auto-scroll
    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Rate limit reset
    useEffect(() => {
        if (requestCount >= RATE_LIMIT && resetTime === 0) {
            setResetTime(Date.now() + 60000);
            const timer = setTimeout(() => {
                setRequestCount(0);
                setResetTime(0);
            }, 60000);
            return () => clearTimeout(timer);
        }
    }, [requestCount]);

    const pageCtx = PAGE_CONTEXT[location.pathname] || { hintKey: 'aiOverlay.hint.default', tools: [], actions: [] };
    const allActions = [...COMMON_ACTIONS, ...pageCtx.actions];

    const sendMessage = async (text?: string) => {
        const msg = text || input.trim();
        if (!msg || loading) return;
        if (requestCount >= RATE_LIMIT) return;

        const userMsg: ChatMessage = { role: 'user', content: msg, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        setRequestCount(c => c + 1);

        try {
            const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
            if (!token) {
                setMessages(prev => [...prev, {
                    role: 'assistant', content: t('aiOverlay.requestFailed'), timestamp: Date.now(),
                }]);
                return;
            }
            const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

            const res = await fetch('/api/assistant/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    message: msg,
                    history,
                    pageContext: { route: location.pathname },
                }),
            });

            if (res.ok) {
                const data = await res.json();
                const assistantMsg: ChatMessage = {
                    role: 'assistant',
                    content: data.reply,
                    toolCalls: data.toolCalls,
                    timestamp: Date.now(),
                };
                setMessages(prev => [...prev, assistantMsg]);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant', content: t('aiOverlay.requestFailed'), timestamp: Date.now(),
                }]);
            }
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant', content: t('aiOverlay.networkError'), timestamp: Date.now(),
            }]);
        } finally {
            setLoading(false);
        }
    };

    const clearChat = () => {
        setMessages([]);
    };

    if (!open) {
        return (
            <button className="ai-overlay-fab" onClick={() => setOpen(true)}
                title={`AI Quick Chat (⌘J)`}>
                <Bot size={20} />
            </button>
        );
    }

    const panelClass = `ai-overlay-panel${expanded ? ' ai-overlay-expanded' : ''}`;

    return (
        <div className={panelClass}>
            {/* Header */}
            <div className="ai-overlay-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>CXMI AI</span>
                    <span className="kbd-shortcut" style={{ fontSize: '0.65rem' }}>⌘J</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {messages.length > 0 && (
                        <Button onClick={clearChat} className="ai-header-"
                            title={t('aiOverlay.clearChat')}>
                            <Trash2 size={14} />
                        </Button>
                    )}
                    <button onClick={() => setExpanded(e => !e)} className="ai-header-btn"
                        title={expanded ? t('aiOverlay.collapse') : t('aiOverlay.expand')}>
                        {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                    <button onClick={() => { setOpen(false); setExpanded(false); }} className="ai-header-btn">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="ai-overlay-messages">
                {messages.length === 0 && (
                    <div className="ai-overlay-empty">
                        <Bot size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '0.75rem' }}>
                            {t(pageCtx.hintKey)}
                        </p>
                        {/* Quick Actions */}
                        <div className="ai-quick-actions">
                            {allActions.map((qa, i) => (
                                <Button key={i} className="ai-quick-" onClick={() => sendMessage(qa.prompt)}>
                                    {t(qa.labelKey)}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`ai-msg ai-msg-${msg.role}`}>
                        {msg.role === 'assistant' ? (
                            <div className="ai-msg-content">
                                <SimpleMarkdown>{msg.content}</SimpleMarkdown>
                                {msg.toolCalls && msg.toolCalls.length > 0 && (
                                    <div className="ai-tool-calls">
                                        {msg.toolCalls.map((tc, j) => (
                                            <ToolCallCard key={j} tc={tc} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="ai-msg-content">{msg.content}</div>
                        )}
                        <div className="ai-msg-time">{formatTime(msg.timestamp)}</div>
                    </div>
                ))}

                {loading && (
                    <div className="ai-msg ai-msg-assistant">
                        <div className="ai-msg-content">
                            <Loader2 size={16} className="spin" style={{ color: 'var(--accent)' }} />
                        </div>
                    </div>
                )}
                <div ref={messagesEnd} />
            </div>

            {/* Input */}
            <div className="ai-overlay-input">
                {requestCount >= RATE_LIMIT ? (
                    <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.8rem', color: 'var(--warning)' }}>
                        ⏳ {t('aiOverlay.rateLimit')}
                    </div>
                ) : (
                    <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                        style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={t('aiOverlay.placeholder')}
                            style={{
                                flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px',
                                background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
                            }}
                        />
                        <button type="submit" disabled={!input.trim() || loading}
                            style={{
                                padding: '0.5rem', borderRadius: '8px',
                                background: input.trim() ? 'var(--accent)' : 'var(--bg-card)',
                                color: input.trim() ? '#fff' : 'var(--text-muted)',
                                border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                                transition: 'all 0.2s',
                            }}>
                            <Send size={16} />
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default AIOverlay;
