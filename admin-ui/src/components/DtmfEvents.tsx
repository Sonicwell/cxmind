import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface DtmfEvent {
    timestamp: string;
    digit: string;
    duration_ms: number;
}

interface DtmfEventsProps {
    callId: string;
    hasFullPcap: boolean;
}

export const DtmfEvents: React.FC<DtmfEventsProps> = ({ callId, hasFullPcap }) => {
    const { t } = useTranslation();
    const [events, setEvents] = useState<DtmfEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);

    useEffect(() => {
        if (!hasFullPcap || !callId) return;

        const loadEvents = async () => {
            setLoading(true);
            try {
                const response = await api.get(`/platform/calls/${callId}/dtmf-events`);
                setEvents(response.data.data || []);
                setHasLoaded(true);
            } catch (err: any) {
                console.error('Failed to load DTMF events:', err);
                setError(err.response?.data?.error || 'Failed to extract DTMF');
            } finally {
                setLoading(false);
            }
        };

        loadEvents();
    }, [callId, hasFullPcap]);

    if (!hasFullPcap) {
        return (
            <div className="card" style={{ padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <KeyRound size={16} /> {t('callDetailsPage.dtmfDetection', 'DTMF Detection')}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {t('callDetailsPage.dtmfRequiresPcap', 'Full PCAP recording is required for DTMF analysis.')}
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="card" style={{ padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <KeyRound size={16} /> {t('callDetailsPage.dtmfDetection', 'DTMF Detection')}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <Loader2 size={14} className="animate-spin" /> {t('callDetailsPage.dtmfScanning', 'Scanning PCAP for RFC 2833 events...')}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card" style={{ padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <KeyRound size={16} /> {t('callDetailsPage.dtmfDetection', 'DTMF Detection')}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }}>
                    <AlertCircle size={14} /> {error}
                </div>
            </div>
        );
    }

    if (hasLoaded && events.length === 0) {
        return (
            <div className="card" style={{ padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <KeyRound size={16} /> {t('callDetailsPage.dtmfDetection', 'DTMF Detection')}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {t('callDetailsPage.dtmfNoEvents', 'No DTMF events found in this call.')}
                </div>
            </div>
        );
    }

    return (
        <div className="card" style={{ padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <KeyRound size={16} /> {t('callDetailsPage.dtmfDetection', 'DTMF Detection')}
                <span className="badge" style={{ background: 'var(--primary-glow)', color: 'var(--primary)', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '1rem' }}>
                    {events.length} {t('callDetailsPage.dtmfEventsCount', 'events')}
                </span>
            </h3>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {events.map((ev, idx) => (
                    <div key={idx} style={{
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '6px',
                        padding: '0.3rem 0.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.2rem',
                        minWidth: '50px'
                    }}>
                        <div style={{
                            fontSize: '1.2rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            fontFamily: 'monospace'
                        }}>
                            {ev.digit}
                        </div>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            fontSize: '0.65rem',
                            color: 'var(--text-muted)'
                        }}>
                            <span>{new Date(ev.timestamp).toISOString().split('T')[1].slice(0, 12)}</span>
                            <span style={{ fontSize: '0.6rem' }}>{ev.duration_ms}ms</span>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {t('callDetailsPage.dtmfParsedFrom', 'Parsed offline from full PCAP (RFC 2833 / PT 101)')}
            </div>
        </div>
    );
};
