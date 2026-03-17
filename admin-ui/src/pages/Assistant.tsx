import { Textarea } from '../components/ui/Textarea';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Send, ChevronDown, ChevronRight, Wrench, Sparkles } from 'lucide-react';
import { sanitizeHtml } from '../utils/sanitize';
import api from '../services/api';
import '../styles/assistant.css';

import { Button } from '../components/ui/button';

/* ═══════════ Types ═══════════ */
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    toolCalls?: ToolCall[];
    timestamp: Date;
}

interface ToolCall {
    name: string;
    args: any;
    result: any;
}

/* ═══════════ Quick Action Prompts ═══════════ */
const QUICK_ACTION_DEFS = [
    { labelKey: 'assistantPage.qa_todaySla', prompt: "What is today's SLA and abandon rate?" },
    { labelKey: 'assistantPage.qa_agentPerformance', prompt: "Show me today's top performing agents" },
    { labelKey: 'assistantPage.qa_callVolume', prompt: "What is today's call volume by hour?" },
    { labelKey: 'assistantPage.qa_searchAgent', prompt: "Search for available agents" },
    { labelKey: 'assistantPage.qa_qiSummary', prompt: "Show quality inspection statistics for the last 7 days" },
    { labelKey: 'assistantPage.qa_systemStatus', prompt: "What is the current system status?" },
    { labelKey: 'assistantPage.qa_searchCalls', prompt: "Look up recent calls" },
];

/* ═══════════ Tool Call Card ═══════════ */
const ToolCallCard: React.FC<{ tc: ToolCall }> = ({ tc }) => {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const isSuccess = tc.result?.success !== false;

    return (
        <div className="tool-call-card">
            <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Wrench size={12} className="tool-icon" />
                <span className="tool-name">{tc.name}</span>
                <span className={`tool-status ${isSuccess ? 'success' : 'error'}`}>
                    {isSuccess ? '✓' : '✗'}
                </span>
            </div>
            {expanded && (
                <div className="tool-call-body">
                    <div style={{ marginBottom: 6, color: '#94a3b8' }}>{t('assistantPage.args')}</div>
                    <pre>{JSON.stringify(tc.args, null, 2)}</pre>
                    <div style={{ marginTop: 8, marginBottom: 6, color: '#94a3b8' }}>{t('assistantPage.result')}</div>
                    <pre>{JSON.stringify(tc.result, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

/* ═══════════ Simple Markdown Renderer ═══════════ */
const renderMarkdown = (text: string): React.ReactNode => {
    // Split by code blocks first
    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts.map((part, i) => {
        if (part.startsWith('```')) {
            const code = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
            return <pre key={i}><code>{code}</code></pre>;
        }

        // 处理inline格式
        return part.split('\n').map((line, j) => {
            // Bold
            let processed = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            // Inline code
            processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
            // Bullet points
            if (processed.startsWith('- ') || processed.startsWith('• ')) {
                processed = '• ' + processed.slice(2);
            }

            return (
                <p key={`${i}-${j}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(processed) || '&nbsp;' }} />
            );
        });
    });
};

/* ═══════════ Main Component ═══════════ */
const Assistant: React.FC = () => {
    const { t } = useTranslation();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
        }
    }, [input]);

    const sendMessage = useCallback(async (text?: string) => {
        const msg = text || input.trim();
        if (!msg || loading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: msg,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            // Build history for context
            const history = messages.map(m => ({
                role: m.role,
                content: m.content,
            }));

            const res = await api.post('/assistant/chat', {
                message: msg,
                history,
            });

            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: res.data.reply,
                toolCalls: res.data.toolCalls?.length > 0 ? res.data.toolCalls : undefined,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMsg]);
        } catch (err: any) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `${t('assistantPage.errorPrefix')} ${err.response?.data?.error || err.message || 'Failed to get response'}`,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    }, [input, loading, messages]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="assistant-page">
            {/* Header */}
            <div className="assistant-header">
                <h1>
                    <Bot size={24} />
                    {t('assistantPage.title')}
                    <span className="ai-badge">{t('assistantPage.beta')}</span>
                </h1>
                <div className="assistant-tools-count">
                    <Sparkles size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    {t('assistantPage.toolsAvailable', { count: 9 })}
                </div>
            </div>

            {/* Messages or Welcome */}
            {messages.length === 0 ? (
                <div className="assistant-welcome">
                    <div className="welcome-icon">🤖</div>
                    <h2>{t('assistantPage.welcomeTitle')}</h2>
                    <p>
                        {t('assistantPage.welcomeDesc')}
                    </p>
                    <div className="quick-actions">
                        {QUICK_ACTION_DEFS.map((qa, i) => (
                            <Button
                                key={i} className="quick-"
                                onClick={() => sendMessage(qa.prompt)}
                            >
                                {t(qa.labelKey)}
                            </Button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="assistant-messages">
                    {messages.map(msg => (
                        <React.Fragment key={msg.id}>
                            {/* Tool calls (shown before assistant message) */}
                            {msg.toolCalls?.map((tc, i) => (
                                <ToolCallCard key={`${msg.id}-tool-${i}`} tc={tc} />
                            ))}
                            {/* Message bubble */}
                            <div className={`msg-bubble ${msg.role}`}>
                                {msg.role === 'assistant'
                                    ? renderMarkdown(msg.content)
                                    : msg.content
                                }
                            </div>
                        </React.Fragment>
                    ))}

                    {/* Typing indicator */}
                    {loading && (
                        <div className="typing-indicator">
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* Input */}
            <div className="assistant-input-area">
                <div className="assistant-input-wrapper">
                    <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('assistantPage.placeholder')}
                        rows={1}
                        disabled={loading}
                    />
                    <Button className="assistant-send-"
                        onClick={() => sendMessage()}
                        disabled={!input.trim() || loading}
                    >
                        <Send size={18} />
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default Assistant;
