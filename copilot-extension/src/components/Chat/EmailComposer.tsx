import React, { useState } from 'react';
import { Send, Sparkles, Paperclip, ChevronDown, CheckCircle, Clock } from 'lucide-react';
import { useApi } from '~/hooks/useApi';

interface EmailComposerProps {
    conversationId: string;
    agentId: string;
    agentName: string;
    agentAvatar: string | null;
    onSent: () => void;
}

export function EmailComposer({ conversationId, agentId, agentName, agentAvatar, onSent }: EmailComposerProps) {
    const { fetchApi } = useApi();
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const [generating, setGenerating] = useState(false);

    const handleSend = async () => {
        if (!body.trim()) return;
        setSending(true);
        try {
            await fetchApi(`/api/conversations/${conversationId}/reply`, {
                method: "POST",
                body: JSON.stringify({
                    senderId: agentId,
                    senderName: agentName,
                    senderAvatar: agentAvatar || '',
                    text: body.trim(),
                    // Optionally pass subject if the backend starts supporting it for fresh threads
                    // subject: subject.trim() 
                })
            });
            setBody('');
            setSubject('');
            onSent();
        } catch (e) {
            console.error("[EmailComposer] Failed to send email:", e);
        } finally {
            setSending(false);
        }
    };

    const handleAIGenerate = async () => {
        setGenerating(true);
        try {
            // Future implementation: fetch AI drafted response based on conversation context
            const res = await fetchApi<{ draft: string }>(`/api/conversations/${conversationId}/draft-email`, {
                method: 'POST'
            }).catch(() => null);

            if (res && res.draft) {
                setBody(res.draft);
            } else {
                setBody("Dear Customer,\n\nThank you for reaching out. We have received your email and are currently reviewing your request.\n\nBest regards,\n" + agentName);
            }
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            borderTop: '1px solid var(--glass-border)',
            background: 'var(--glass-bg)',
            padding: '12px',
            gap: '8px',
            flexShrink: 0
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    📧 Email Reply
                </div>
                <button
                    onClick={handleAIGenerate}
                    disabled={generating || sending}
                    style={{
                        background: 'linear-gradient(135deg, rgba(108,75,245,0.1), rgba(108,75,245,0.2))',
                        border: '1px solid rgba(108,75,245,0.3)',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '0.7rem',
                        color: '#6C4BF5',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        fontWeight: 600
                    }}
                >
                    <Sparkles size={12} />
                    {generating ? 'Drafting...' : 'AI Draft'}
                </button>
            </div>

            <input
                placeholder="Subject (Optional for replies)"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={{
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    outline: 'none',
                    width: '100%'
                }}
            />

            <textarea
                placeholder="Write your email response here..."
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={5}
                style={{
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    outline: 'none',
                    resize: 'none',
                    width: '100%',
                    fontFamily: 'inherit',
                    lineHeight: '1.4'
                }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button style={{
                        background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem'
                    }}>
                        <Paperclip size={14} /> Attach
                    </button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            color: 'var(--text-primary)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4
                        }}
                    >
                        <Clock size={12} /> Schedule
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={sending || !body.trim()}
                        style={{
                            background: 'var(--primary)',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 16px',
                            color: '#fff',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                            opacity: (!body.trim() || sending) ? 0.6 : 1
                        }}
                    >
                        {sending ? 'Sending...' : <><Send size={12} /> Send Email</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
