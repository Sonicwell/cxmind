import { Input } from "./ui/input";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { STORAGE_KEYS } from '../constants/storage-keys';

import { Button } from './ui/button';

/**
 * CustomerSimulator — embedded WebChat client inside Admin UI.
 * Connects directly to the WebChat Gateway (/ws/webchat) as an anonymous visitor.
 */

interface Message {
    id: string;
    role: 'customer' | 'agent' | 'bot' | 'system';
    text: string;
    senderName: string;
    time: string;
    avatar?: string;
    failed?: boolean;
}

const CustomerSimulator: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
    const { user } = useAuth();
    const [connected, setConnected] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [visitorName, setVisitorName] = useState('Test Customer');
    const [visitorEmail, setVisitorEmail] = useState('test@example.com');
    const [welcomeMsg, setWelcomeMsg] = useState('Hello! How can we help you today?');
    const [chatStarted, setChatStarted] = useState(false);
    const [status, setStatus] = useState('');
    const [showCsat, setShowCsat] = useState(false);
    const [csatRating, setCsatRating] = useState(0);
    const [activeConvs, setActiveConvs] = useState<any[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const msgEndRef = useRef<HTMLDivElement>(null);
    const visitorId = useRef(localStorage.getItem('sim_visitorId') || `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttempts = useRef(0);
    const MAX_RECONNECT = 5;

    // Persist visitorId on first render
    useEffect(() => {
        localStorage.setItem('sim_visitorId', visitorId.current);
    }, []);

    const scrollToBottom = () => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
    useEffect(scrollToBottom, [messages]);

    const getWsUrl = useCallback(() => {
        const clientId = user?.clientId || '000000000000000000000000'; // fallback ObjectId
        const vid = visitorId.current;
        if (import.meta.env.VITE_API_URL) {
            const base = import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '').replace(/^http/, 'ws');
            return `${base}/ws/webchat?client_id=${clientId}&visitor_id=${vid}`;
        }
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/ws/webchat?client_id=${clientId}&visitor_id=${vid}`;
    }, [user?.clientId]);

    const connect = useCallback(() => {
        // Close old connection WITHOUT triggering onclose reconnect
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
        }
        if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
        const ws = new WebSocket(getWsUrl());
        ws.onopen = () => {
            setConnected(true);
            setStatus('Connected ✓');
            reconnectAttempts.current = 0;
        };
        ws.onmessage = (e) => { try { handleMessage(JSON.parse(e.data)); } catch { /* */ } };
        ws.onclose = () => {
            setConnected(false);
            // Auto-reconnect with exponential backoff
            if (reconnectAttempts.current < MAX_RECONNECT) {
                const delay = Math.min(2000 * Math.pow(2, reconnectAttempts.current), 32000);
                reconnectAttempts.current++;
                setStatus(`Disconnected — reconnecting in ${delay / 1000}s (${reconnectAttempts.current}/${MAX_RECONNECT})`);
                reconnectTimer.current = setTimeout(connect, delay);
            } else {
                setStatus('Disconnected — click Reset to retry');
            }
        };
        ws.onerror = () => { setStatus('Connection error'); };
        wsRef.current = ws;
    }, [getWsUrl]);

    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                wsRef.current.onclose = null; // prevent reconnect on cleanup
                wsRef.current.close();
            }
        };
    }, [connect]);

    // Fetch active conversations for "Continue" feature
    useEffect(() => {
        if (chatStarted) return;
        const fetchActive = async () => {
            try {
                const baseUrl = import.meta.env.VITE_API_URL || '/api';
                const res = await fetch(`${baseUrl}/conversations?status=active,bot_active,queued&limit=10`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || ''}` },
                });
                const json = await res.json();
                setActiveConvs(json.data || []);
            } catch { /* silent */ }
        };
        fetchActive();
    }, [chatStarted]);

    const wsSend = (data: any): boolean => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
            return true;
        }
        return false;
    };

    const handleMessage = (msg: any) => {
        switch (msg.type) {
            case 'connected': setStatus('Connected ✓'); break;
            case 'chat:started':
                setStatus(`Conv: ${msg.data?.conversationId?.slice(0, 8)}...`);
                // Show welcome message if configured
                if (welcomeMsg) {
                    addMessage({ id: `welcome-${Date.now()}`, role: 'system', text: welcomeMsg, senderName: 'System', time: new Date().toLocaleTimeString() });
                }
                if (msg.data?.profile?.name) {
                    addMessage({ id: `profile-${Date.now()}`, role: 'system', text: `Welcome, ${msg.data.profile.name}${msg.data.profile.email ? ` (${msg.data.profile.email})` : ''}`, senderName: 'System', time: new Date().toLocaleTimeString() });
                }
                break;
            case 'chat:delivered': break;
            case 'chat:message': {
                const d = msg.data;
                addMessage({
                    id: d.messageId || Date.now().toString(),
                    role: (d.sender?.role || 'system') as Message['role'],
                    text: d.text || d.content_text || '',
                    senderName: d.sender?.name || d.sender?.role || 'system',
                    avatar: d.sender?.avatar || '',
                    time: new Date(d.createdAt || Date.now()).toLocaleTimeString(),
                });
                break;
            }
            case 'chat:agent_joined': {
                const agentN = msg.data?.agentName || 'Agent';
                setStatus(`🎧 ${agentN} connected`);
                addMessage({ id: `joined-${Date.now()}`, role: 'system', text: `🎧 ${agentN} has joined the chat`, senderName: 'System', time: new Date().toLocaleTimeString() });
                break;
            }
            case 'chat:queue_position': setStatus(`Queue: #${msg.data?.position}`); break;
            case 'chat:bot_active': setStatus('🤖 Bot responding'); break;
            case 'chat:bot_handoff': setStatus('🔄 Transferring...'); break;
            case 'chat:system_message':
                addMessage({ id: Date.now().toString(), role: 'system', text: msg.data?.message || '', senderName: 'System', time: new Date().toLocaleTimeString() });
                break;
            case 'chat:timeout':
                setStatus('⏰ Timed out');
                addMessage({ id: Date.now().toString(), role: 'system', text: 'Session ended — inactivity', senderName: 'System', time: new Date().toLocaleTimeString() });
                break;
            case 'omni:typing':
                setStatus(msg.data?.isTyping ? 'Agent is typing...' : '');
                break;
            case 'error': setStatus(`⚠️ ${msg.data?.message || 'Error'}`); break;
            case 'chat:resume': {
                // Server detected active conversation for this visitor — auto-reconnect
                const convId = msg.data?.conversationId;
                if (convId && !chatStarted) {
                    setStatus(`Resuming conversation ${convId.slice(0, 8)}...`);
                    wsSend({ type: 'chat:reconnect', conversationId: convId, lastSequence: 0 });
                    setChatStarted(true);
                }
                break;
            }
            case 'chat:reconnected': {
                setStatus(`Reconnected ✓ (${msg.data?.messages?.length || 0} msgs)`);
                const history = (msg.data?.messages || []).map((m: any) => ({
                    id: m.message_id || Date.now().toString(),
                    role: (m.sender_role || 'system') as Message['role'],
                    text: m.content_text || '',
                    senderName: m.sender_name || m.sender_role || 'system',
                    time: new Date(m.created_at || Date.now()).toLocaleTimeString(),
                }));
                setMessages(history);
                break;
            }
            case 'pong': break;
            case 'chat:resolved': {
                const reasonLabels: Record<string, string> = {
                    agent_closed: 'Issue resolved',
                    agent_follow_up: 'Follow-up scheduled',
                    agent_closed_unresolved: 'Conversation closed',
                    visitor_left: 'Session ended',
                    customer_inactive: 'Inactive timeout',
                };
                const label = reasonLabels[msg.data?.reason] || 'Conversation ended';
                setStatus(`✅ ${label}`);
                addMessage({
                    id: `resolved-${Date.now()}`,
                    role: 'system',
                    text: `${label}. You can start a new chat below.`,
                    senderName: 'System',
                    time: new Date().toLocaleTimeString(),
                });
                setChatStarted(false);
                break;
            }
            case 'chat:satisfaction_request': {
                setShowCsat(true);
                setCsatRating(0);
                break;
            }
        }
    };

    const addMessage = (m: Message) => setMessages(prev => [...prev, m]);

    const startChat = () => {
        const text = input.trim() || 'Hello, I need help!';
        wsSend({ type: 'chat:start', name: visitorName, email: visitorEmail, message: text, pageUrl: window.location.href, userAgent: navigator.userAgent, referrer: document.referrer || '' });
        addMessage({ id: Date.now().toString(), role: 'customer', text, senderName: visitorName, time: new Date().toLocaleTimeString() });
        setChatStarted(true);
        setInput('');
    };

    const continueConversation = (conv: any) => {
        // Override visitorId to match the original conversation
        const originalVisitorId = conv.metadata?.visitorId;
        if (originalVisitorId) {
            visitorId.current = originalVisitorId;
            // Reconnect WebSocket with the original visitorId
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
            const ws = new WebSocket(getWsUrl());
            ws.onopen = () => {
                setConnected(true);
                setStatus(`Resuming conv ${conv._id.slice(0, 8)}...`);
                // Send reconnect after connection established
                ws.send(JSON.stringify({
                    type: 'chat:reconnect',
                    conversationId: conv._id,
                    lastSequence: 0,
                }));
            };
            ws.onmessage = (e) => { try { handleMessage(JSON.parse(e.data)); } catch { /* */ } };
            ws.onclose = () => { setConnected(false); setStatus('Disconnected'); };
            ws.onerror = () => { setStatus('Connection error'); };
            wsRef.current = ws;
            setChatStarted(true);
            setVisitorName(conv.metadata?.visitorName || 'Customer');
        }
    };

    const sendMessage = () => {
        const text = input.trim();
        if (!text) return;
        const sent = wsSend({ type: 'chat:message', text, contentType: 'text', senderName: visitorName });
        addMessage({
            id: Date.now().toString(), role: 'customer', text,
            senderName: visitorName, time: new Date().toLocaleTimeString(),
            ...(sent ? {} : { failed: true }),
        });
        if (!sent) setStatus('⚠️ Message not sent — disconnected');
        setInput('');
    };

    const resetChat = () => {
        wsRef.current?.close();
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectAttempts.current = 0;
        setMessages([]);
        setChatStarted(false);
        setStatus('');
        // Generate new identity
        visitorId.current = `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('sim_visitorId', visitorId.current);
        setTimeout(connect, 300);
    };

    // ── Inline styles using CSS variables ──
    const inputStyle: React.CSSProperties = {
        flex: 1, padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--glass-border)', background: 'var(--glass-bg)',
        color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
    };

    return (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: 560, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                padding: '0.75rem 1rem',
                background: 'var(--primary)',
                color: 'white',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            }}>
                <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                        🧑‍💻 Customer Simulator
                        <span style={{
                            background: connected ? 'hsla(150, 70%, 50%, 0.3)' : 'hsla(0, 70%, 50%, 0.3)',
                            color: connected ? '#bbf7d0' : '#fecaca',
                            fontSize: '0.6rem', padding: '2px 8px', borderRadius: 'var(--radius-full)',
                        }}>
                            {connected ? '● Online' : '○ Offline'}
                        </span>
                    </div>
                    <div style={{ fontSize: '0.65rem', opacity: 0.75, marginTop: 2 }}>
                        {visitorId.current.slice(0, 16)}... | {user?.clientId || 'default'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <Button onClick={resetChat} style={{ background: 'hsla(0,0%,100%,0.15)', color: 'white', padding: '4px 10px', fontSize: '0.75rem' }}>
                        🔄 Reset
                    </Button>
                    {onClose && (
                        <Button onClick={onClose} style={{ background: 'hsla(0,0%,100%,0.15)', color: 'white', padding: '4px 10px', fontSize: '0.75rem' }}>
                            ✕
                        </Button>
                    )}
                </div>
            </div>

            {/* Status bar */}
            {status && (
                <div style={{
                    padding: '4px 1rem', fontSize: '0.7rem', color: 'var(--text-muted)',
                    background: 'hsla(var(--surface-hue), var(--surface-sat), 50%, 0.03)',
                    borderBottom: '1px solid var(--glass-border)', textAlign: 'center',
                }}>
                    {status}
                </div>
            )}

            {/* Messages */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: 'var(--spacing-sm)',
                display: 'flex', flexDirection: 'column', gap: 8,
            }}>
                {!chatStarted && messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--spacing-xl)', fontSize: '0.8rem' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 8 }}>💬</div>
                        <div style={{ fontWeight: 500 }}>Start a simulated customer chat</div>
                        <div style={{ fontSize: '0.7rem', marginTop: 4, opacity: 0.7 }}>
                            Routed through WebChat Gateway → Bot / Copilot
                        </div>
                    </div>
                )}

                {messages.map(m => {
                    const bgMap: Record<string, string> = {
                        customer: 'var(--primary)',
                        bot: 'hsla(180, 60%, 50%, 0.1)',
                        agent: 'hsla(var(--surface-hue), 10%, 50%, 0.08)',
                        system: 'transparent',
                    };
                    const isCustomer = m.role === 'customer';
                    return (
                        <div
                            key={m.id}
                            style={{
                                alignSelf: isCustomer ? 'flex-end' : (m.role === 'system' ? 'center' : 'flex-start'),
                                maxWidth: m.role === 'system' ? '100%' : '80%',
                                padding: m.role === 'system' ? '4px 8px' : '8px 12px',
                                borderRadius: 'var(--radius-sm)',
                                borderBottomRightRadius: isCustomer ? '4px' : 'var(--radius-sm)',
                                borderBottomLeftRadius: !isCustomer && m.role !== 'system' ? '4px' : 'var(--radius-sm)',
                                fontSize: '0.8rem', lineHeight: 1.45,
                                background: bgMap[m.role] || 'hsla(0,0%,0%,0.03)',
                                color: isCustomer ? 'white' : (m.role === 'system' ? 'var(--text-muted)' : 'var(--text-primary)'),
                                wordBreak: 'break-word',
                            }}
                        >
                            {!isCustomer && m.role !== 'system' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                    {m.avatar ? (
                                        <img src={m.avatar} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    ) : (
                                        <span style={{ fontSize: '0.7rem' }}>{m.role === 'bot' ? '🤖' : '👤'}</span>
                                    )}
                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{m.senderName}</span>
                                </div>
                            )}
                            <div>{m.text}</div>
                            <div style={{
                                fontSize: '0.6rem', textAlign: 'right', marginTop: 2,
                                color: isCustomer ? 'hsla(0,0%,100%,0.6)' : 'var(--text-muted)',
                            }}>
                                {m.time}
                            </div>
                            {m.failed && (
                                <div style={{ fontSize: '0.6rem', color: '#ef4444', textAlign: 'right', marginTop: 2 }}>
                                    ⚠ Failed to send
                                </div>
                            )}
                        </div>
                    );
                })}
                <div ref={msgEndRef} />
            </div>

            {/* CSAT Rating */}
            {showCsat && (
                <div style={{
                    padding: '12px', borderTop: '1px solid var(--glass-border)',
                    textAlign: 'center', background: 'rgba(139,92,246,0.05)',
                }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 6 }}>How was your experience?</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                        {[1, 2, 3, 4, 5].map(star => (
                            <Button key={star} onClick={() => {
                                setCsatRating(star);
                                if (wsRef.current?.readyState === WebSocket.OPEN) {
                                    wsRef.current.send(JSON.stringify({
                                        type: 'chat:satisfaction_response',
                                        data: { rating: star },
                                    }));
                                }
                                addMessage({
                                    id: `csat-${Date.now()}`, role: 'system',
                                    text: `Thank you for your feedback! (${star}/5 ⭐)`,
                                    senderName: 'System', time: new Date().toLocaleTimeString(),
                                });
                                setShowCsat(false);
                            }} style={{
                                fontSize: 24, background: 'none', border: 'none', cursor: 'pointer',
                                transform: csatRating >= star ? 'scale(1.2)' : 'scale(1)',
                                filter: csatRating >= star ? 'none' : 'grayscale(0.8)',
                                transition: 'all 0.2s',
                            }}>⭐</Button>
                        ))}
                    </div>
                </div>
            )}

            {/* Pre-chat form OR Reply input */}
            {!chatStarted ? (
                <div style={{
                    padding: '0.75rem', borderTop: '1px solid var(--glass-border)',
                    display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Input value={visitorName} onChange={e => setVisitorName(e.target.value)} placeholder="Visitor name" style={inputStyle} />
                        <Input value={visitorEmail} onChange={e => setVisitorEmail(e.target.value)} placeholder="Email" style={inputStyle} />
                    </div>
                    <Input value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value)} placeholder="Welcome message (SDK config)" style={{ ...inputStyle, fontSize: '0.75rem', color: 'var(--text-muted)' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Input
                            value={input} onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') startChat(); }}
                            placeholder="Type a first message..."
                            style={{ ...inputStyle, fontSize: '0.85rem' }}
                        />
                        <Button
                            onClick={startChat} disabled={!connected}
                            style={{ fontSize: '0.8rem', padding: '0.5rem 1rem', opacity: connected ? 1 : 0.4 }}
                        >
                            Start Chat
                        </Button>
                    </div>
                    {activeConvs.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 8 }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>Or continue an active conversation:</div>
                            {activeConvs.map(conv => (
                                <Button
                                    key={conv._id}
                                    onClick={() => continueConversation(conv)}
                                    className="btn"
                                    style={{
                                        width: '100%', textAlign: 'left', padding: '6px 10px', marginBottom: 4,
                                        fontSize: '0.75rem', background: 'hsla(var(--surface-hue), 10%, 50%, 0.06)',
                                        border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    }}
                                >
                                    <span>💬 {conv.metadata?.visitorName || 'Visitor'} — {conv.messageCount || 0} msgs</span>
                                    <span style={{ color: 'var(--primary)', fontSize: '0.7rem' }}>Continue →</span>
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div style={{
                    padding: '0.75rem', borderTop: '1px solid var(--glass-border)',
                    display: 'flex', gap: 8,
                }}>
                    <Input
                        value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
                        placeholder="Type as customer..."
                        autoFocus
                        style={{ ...inputStyle, fontSize: '0.85rem' }}
                    />
                    <Button
                        onClick={sendMessage}
                        disabled={!input.trim() || !connected}
                        style={{ fontSize: '0.8rem', padding: '0.5rem 1rem', opacity: input.trim() && connected ? 1 : 0.4 }}
                    >
                        Send
                    </Button>
                </div>
            )}
        </div>
    );
};

export default CustomerSimulator;
