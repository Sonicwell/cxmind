
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select } from '../ui/Select';
import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, Eye } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../services/api';
import { getMockActionHistory } from '../../services/mock-data';
import { useDemoMode } from '../../hooks/useDemoMode';
import { GlassModal } from '../ui/GlassModal';
import { MotionButton } from '../ui/MotionButton';
import { useTranslation } from 'react-i18next';

interface ActionRecord {
    actionId?: string;
    _id?: string;
    callId: string;
    agentId: string;
    agentName?: string;
    intentSlug: string;
    intentName?: string;
    status: 'suggested' | 'edited' | 'confirmed' | 'rejected' | 'ignored';
    deliveryStatus?: 'pending' | 'enqueued' | 'failed' | 'no_webhook' | 'webhook_disabled' | 'not_found' | 'circuit_open';
    confidence?: number;
    payload?: Record<string, any>;
    createdAt: string;
}

const deliveryLabels: Record<string, { text: string; color: string }> = {
    enqueued: { text: '✓ Sent', color: 'hsl(150, 70%, 45%)' },
    no_webhook: { text: '— No webhook', color: 'var(--text-muted)' },
    webhook_disabled: { text: '⚠ Disabled', color: 'hsl(35, 95%, 55%)' },
    not_found: { text: '✕ Deleted', color: 'hsl(0, 75%, 55%)' },
    circuit_open: { text: '⚠ Circuit open', color: 'hsl(35, 95%, 55%)' },
    pending: { text: '⏳ Pending', color: 'hsl(35, 95%, 55%)' },
    failed: { text: '✕ Failed', color: 'hsl(0, 75%, 55%)' },
};

const statusStyles: Record<string, React.CSSProperties> = {
    confirmed: { background: 'hsla(150, 70%, 40%, 0.15)', color: 'hsl(150, 70%, 45%)', border: '1px solid hsla(150, 70%, 40%, 0.3)' },
    rejected: { background: 'hsla(0, 75%, 55%, 0.15)', color: 'hsl(0, 75%, 55%)', border: '1px solid hsla(0, 75%, 55%, 0.3)' },
    edited: { background: 'hsla(35, 95%, 55%, 0.15)', color: 'hsl(35, 95%, 55%)', border: '1px solid hsla(35, 95%, 55%, 0.3)' },
    suggested: { background: 'hsla(210, 90%, 55%, 0.15)', color: 'hsl(210, 90%, 55%)', border: '1px solid hsla(210, 90%, 55%, 0.3)' },
    ignored: { background: 'hsla(0, 0%, 50%, 0.1)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' },
};

const STATUS_OPTIONS = ['all', 'confirmed', 'rejected', 'edited', 'suggested', 'ignored'] as const;

const selectStyle: React.CSSProperties = {
    padding: '0.55rem 0.8rem',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--glass-border)',
    background: 'transparent',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    textTransform: 'capitalize',
};

const ActionHistoryTable: React.FC = () => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const [history, setHistory] = useState<ActionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecord, setSelectedRecord] = useState<ActionRecord | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    const fetchHistory = async () => {
        setLoading(true);
        try {
            if (demoMode) {
                const res = await getMockActionHistory();
                setHistory(res.data.data);
            } else {
                const res = await api.get('/platform/actions/history');
                setHistory(res.data);
            }
        } catch (error) {
            console.error("Failed to load history", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [demoMode]);

    const filtered = history.filter(r => {
        // Status filter
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        // Text search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (
                (r.agentName || r.agentId || '').toLowerCase().includes(term) ||
                (r.intentName || r.intentSlug || '').toLowerCase().includes(term) ||
                r.callId.toLowerCase().includes(term) ||
                r.status.toLowerCase().includes(term)
            );
        }
        return true;
    });

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
        </div>
    );

    return (
        <div>
            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
                <div className="input-with-icon" style={{ flex: 1, maxWidth: '320px' }}>
                    <input
                        type="text"
                        placeholder={t('actions.searchPlaceholder')}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <Select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={selectStyle}
                >
                    {STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{s === 'all' ? t('actions.allStatus') : s}</option>
                    ))}
                </Select>
                {(searchTerm || statusFilter !== 'all') && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {filtered.length} of {history.length}
                    </span>
                )}
            </div>

            <Table className="data-table">
                <TableHeader>
                    <TableRow>
                        <TableHead>{t('actions.time')}</TableHead>
                        <TableHead>{t('actions.action')}</TableHead>
                        <TableHead>{t('actions.agent')}</TableHead>
                        <TableHead>{t('actions.callId')}</TableHead>
                        <TableHead>{t('actions.confidence')}</TableHead>
                        <TableHead>{t('actions.statusCol')}</TableHead>
                        <TableHead>{t('actions.delivery')}</TableHead>
                        <TableHead style={{ textAlign: 'right' }}>{t('actions.details')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filtered.map((record, idx) => (
                        <TableRow key={record.actionId || record._id || idx}>
                            <TableCell style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {format(new Date(record.createdAt), 'MMM d, HH:mm')}
                            </TableCell>
                            <TableCell style={{ fontWeight: 600 }}>{record.intentName || record.intentSlug}</TableCell>
                            <TableCell style={{ color: 'var(--text-secondary)' }}>{record.agentName || record.agentId}</TableCell>
                            <TableCell style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{record.callId}</TableCell>
                            <TableCell>
                                {record.confidence != null ? (
                                    <span style={{
                                        fontFamily: 'monospace',
                                        fontSize: '0.8rem',
                                        color: record.confidence >= 0.9 ? 'var(--success)' : record.confidence >= 0.8 ? 'var(--warning)' : 'var(--text-muted)',
                                    }}>
                                        {Math.round(record.confidence * 100)}%
                                    </span>
                                ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                                )}
                            </TableCell>
                            <TableCell>
                                <span style={{
                                    display: 'inline-block',
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: 'var(--radius-full)',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    textTransform: 'capitalize',
                                    ...statusStyles[record.status],
                                }}>
                                    {record.status}
                                </span>
                            </TableCell>
                            <TableCell>
                                {record.status === 'confirmed' && record.deliveryStatus ? (
                                    <span style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        color: deliveryLabels[record.deliveryStatus]?.color || 'var(--text-muted)',
                                    }}>
                                        {deliveryLabels[record.deliveryStatus]?.text || record.deliveryStatus}
                                    </span>
                                ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                                )}
                            </TableCell>
                            <TableCell style={{ textAlign: 'right' }}>
                                <MotionButton variant="ghost"  onClick={() => setSelectedRecord(record)} title="View Payload">
                                    <Eye size={16} />
                                </MotionButton>
                            </TableCell>
                        </TableRow>
                    ))}
                    {history.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                {t('actions.noRecords')}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <AlertCircle size={16} />
                <span>{t('actions.showingRecords', { filtered: filtered.length, total: history.length })}</span>
            </div>

            {/* Payload Detail Modal */}
            <GlassModal
                open={!!selectedRecord}
                onOpenChange={(open) => { if (!open) setSelectedRecord(null); }}
                title={`Action Payload — ${selectedRecord?.intentName || selectedRecord?.intentSlug || ''}`}
                description={`Action ${selectedRecord?.actionId || selectedRecord?._id || ''} • Call ${selectedRecord?.callId || ''}`}
            >
                {selectedRecord && (
                    <div className="flex flex-col gap-md">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('actions.agent')}</label>
                                <div style={{ fontWeight: 500 }}>{selectedRecord.agentName || selectedRecord.agentId}</div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('actions.statusCol')}</label>
                                <div>
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '0.15rem 0.5rem',
                                        borderRadius: 'var(--radius-full)',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        textTransform: 'capitalize',
                                        ...statusStyles[selectedRecord.status],
                                    }}>
                                        {selectedRecord.status}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('actions.confidence')}</label>
                                <div style={{ fontWeight: 500 }}>
                                    {selectedRecord.confidence != null ? `${Math.round(selectedRecord.confidence * 100)}%` : '—'}
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('actions.time')}</label>
                                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                    {format(new Date(selectedRecord.createdAt), 'MMM d, HH:mm:ss')}
                                </div>
                            </div>
                        </div>
                        {selectedRecord.payload && (
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', display: 'block' }}>{t('actions.payloadJson')}</label>
                                <pre style={{
                                    padding: '1rem',
                                    borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(0,0,0,0.03)',
                                    border: '1px solid var(--glass-border)',
                                    fontSize: '0.8rem',
                                    overflow: 'auto',
                                    maxHeight: '200px',
                                    fontFamily: 'monospace',
                                    whiteSpace: 'pre-wrap',
                                }}>
                                    {JSON.stringify(selectedRecord.payload, null, 2)}
                                </pre>
                            </div>
                        )}
                        {selectedRecord.status === 'confirmed' && (
                            <div style={{
                                padding: '0.6rem 0.8rem',
                                borderRadius: 'var(--radius-sm)',
                                background: 'rgba(0,0,0,0.02)',
                                border: '1px solid var(--glass-border)',
                                fontSize: '0.8rem',
                                color: 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}>
                                <span>
                                    📡 Delivery: {deliveryLabels[selectedRecord.deliveryStatus || '']?.text || 'Unknown'}
                                </span>
                                <a href="/webhooks" style={{ color: 'var(--primary)', fontSize: '0.75rem', textDecoration: 'none' }}>
                                    {t('actions.viewDeliveryLogs')} →
                                </a>
                            </div>
                        )}
                        <MotionButton className="w-full" onClick={() => setSelectedRecord(null)}>
                            {t('actions.close')}
                        </MotionButton>
                    </div>
                )}
            </GlassModal>
        </div>
    );
};

export default ActionHistoryTable;
