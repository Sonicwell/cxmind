import React, { useEffect, useState } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import api from '../../services/api';
import { useDemoMode } from '../../hooks/useDemoMode';
import { Button } from '../ui/button';

interface ContextBrief {
    severity: 'red' | 'yellow' | 'green' | 'blue';
    actionable_opening: string;
    bullets: string[];
    raw_evidence?: {
        pending_actions?: any[];
        recent_messages?: any[];
        health_score_info?: string;
    };
}

interface ContextBriefCardProps {
    callId: string;
    callerPhone?: string;
}

const SEVERITY_CONFIG = {
    red: { icon: '🚨', bg: 'hsla(0, 80%, 40%, 0.1)', border: 'hsla(0, 80%, 50%, 0.5)', color: '#ef4444', label: 'CRITICAL' },
    yellow: { icon: '⚠️', bg: 'hsla(35, 90%, 40%, 0.1)', border: 'hsla(35, 100%, 50%, 0.5)', color: '#f59e0b', label: 'WARNING' },
    green: { icon: '✅', bg: 'hsla(150, 80%, 30%, 0.1)', border: 'hsla(150, 80%, 40%, 0.5)', color: '#22c55e', label: 'HEALTHY' },
    blue: { icon: 'ℹ️', bg: 'hsla(210, 80%, 40%, 0.1)', border: 'hsla(210, 80%, 50%, 0.5)', color: '#3b82f6', label: 'INFO' }
};

export const ContextBriefCard: React.FC<ContextBriefCardProps> = ({ callId, callerPhone }) => {
    const [brief, setBrief] = useState<ContextBrief | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<boolean>(false);

    const { demoMode } = useDemoMode();
    const { subscribe } = useWebSocket();

    const fetchBrief = async () => {
        try {
            setLoading(true);

            if (demoMode) {
                // Simulate LLM processing delay for demo
                await new Promise(resolve => setTimeout(resolve, 2500));
                setBrief({
                    severity: 'yellow',
                    actionable_opening: 'The client previously expressed frustration about unexpected billing charges. Lead with an apology and offer a prorated refund immediately.',
                    bullets: [
                        'Complained about a $15 overage fee 2 hours ago via Email.',
                        'Agent promised a supervisor callback 1 hour ago via Webchat.',
                        'High stress detected in previous interactions (Fusion Score: 0.82).'
                    ],
                    raw_evidence: {
                        health_score_info: 'fusion_score=0.82 (Acoustic: Angry, Semantic: Frustrated)',
                        pending_actions: [{ intentSlug: 'refund_processing', status: 'pending' }],
                        recent_messages: [
                            { channel: 'email', text: 'Why was I charged an extra $15 on my recent invoice?' },
                            { channel: 'webchat', text: 'I am still waiting for that supervisor callback you promised.' }
                        ]
                    }
                });
                return;
            }

            const phoneParam = callerPhone ? `?phone=${encodeURIComponent(callerPhone)}` : '';
            const res = await api.get(`/platform/calls/${callId}/context-brief${phoneParam}`);
            if (res.data?.contextBrief) {
                setBrief(res.data.contextBrief);
            }
        } catch (err: any) {
            // 404 is expected if not generated yet, don't show as error
            if (err.response?.status !== 404) {
                console.error('[C9] Failed to fetch context brief:', err);
                setError('Failed to load contextual intelligence.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Initial fetch in case it already exists
        fetchBrief();

        if (demoMode) return; // Don't subscribe to real-time events in demo mode

        // Listen for realtime push
        const unsubscribe = subscribe('omni:context_brief', (message: any) => {
            console.log('[ContextBriefCard] Received:', message);
            const data = message?.data;
            if (data?.callId === callId && data?.brief) {
                console.log('[C9] Received real-time context brief:', data.brief);
                setBrief(data.brief);
                setLoading(false);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [callId, subscribe]);

    if (loading && !brief) {
        return (
            <div style={{ padding: '1rem', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--primary)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Synthesizing Omnichannel Context...</span>
            </div>
        );
    }

    if (error && !brief) {
        return null; // Fail gracefully, don't block the UI
    }

    if (!brief) {
        return null; // Return nothing if no brief available
    }

    const config = SEVERITY_CONFIG[brief.severity] || SEVERITY_CONFIG.blue;

    return (
        <div style={{
            background: config.bg,
            border: `1px solid ${config.border}`,
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            marginBottom: '1rem',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            {/* Header: Color Coded */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0.75rem 1rem',
                borderBottom: `1px solid ${config.border}`,
                background: `color-mix(in srgb, ${config.bg} 50%, transparent)`
            }}>
                <span style={{ fontSize: '1.2rem' }}>{config.icon}</span>
                <span style={{ color: config.color, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>{config.label}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 'auto' }}>CXMind Contextual Intelligence</span>
            </div>

            <div style={{ padding: '1rem' }}>
                {/* Tactic: Actionable Opening */}
                <div style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '1rem',
                    lineHeight: 1.4
                }}>
                    {brief.actionable_opening}
                </div>

                {/* Main Bullets */}
                {brief.bullets && brief.bullets.length > 0 && (
                    <ul style={{
                        margin: 0,
                        paddingLeft: '1.2rem',
                        color: 'var(--text-secondary)',
                        fontSize: '0.85rem',
                        lineHeight: 1.6,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        {brief.bullets.map((b, i) => (
                            <li key={i}>{b}</li>
                        ))}
                    </ul>
                )}

                {/* Raw Evidence Accordion */}
                {(brief.raw_evidence?.pending_actions?.length || brief.raw_evidence?.recent_messages?.length) ? (
                    <div style={{ marginTop: '1rem' }}>
                        <Button
                            onClick={() => setExpanded(!expanded)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: 0
                            }}
                        >
                            {expanded ? '▼ Hide Data Sources' : '▶ View Data Sources'}
                        </Button>

                        {expanded && (
                            <div style={{
                                marginTop: '0.75rem',
                                padding: '0.75rem',
                                background: 'rgba(0,0,0,0.2)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1rem'
                            }}>
                                {brief.raw_evidence.health_score_info && (
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>C4 Health Status</div>
                                        <div>{brief.raw_evidence.health_score_info}</div>
                                    </div>
                                )}

                                {brief.raw_evidence.pending_actions && brief.raw_evidence.pending_actions.length > 0 && (
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Pending Actions</div>
                                        <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                                            {brief.raw_evidence.pending_actions.map((act, i) => (
                                                <li key={i}>{act.intentSlug || 'Action'} ({act.status})</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {brief.raw_evidence.recent_messages && brief.raw_evidence.recent_messages.length > 0 && (
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Recent Omnichannel Activity</div>
                                        <ul style={{ margin: 0, paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {brief.raw_evidence.recent_messages.map((msg, i) => (
                                                <li key={i}>
                                                    <span style={{ opacity: 0.7 }}>[{msg.channel}]</span> {msg.text}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
};
