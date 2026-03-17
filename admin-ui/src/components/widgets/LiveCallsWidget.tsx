/**
 * LiveCallsWidget — Real-time active call display
 *
 * Uses Perspective WASM datagrid for virtualized rendering when call count
 * is high, with fallback to the traditional DOM table for small counts.
 * Integrates with DashboardContext for live data and WebSocket updates.
 */
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import React, { useMemo, lazy, Suspense, useCallback, useState, useEffect } from 'react';
import { Phone, PhoneCall, Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';
import { useDashboardCore, useDashboardLive } from '../../dashboard/DashboardContext';
import { mosGradeClass, fmtDuration } from '../../dashboard/helpers';
import { useTranslation } from 'react-i18next';

// Lazy-load PerspectiveGrid so WASM is only fetched when needed
const PerspectiveGrid = lazy(() => import('../PerspectiveGrid'));

/** Threshold: switch to Perspective when call count exceeds this */
const PERSPECTIVE_THRESHOLD = 50;

// 局部1s ticker, 仅驱动本widget而非整棵Dashboard树
function useNow(active: boolean): number {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [active]);
    return now;
}

const LiveCallsWidget: React.FC = () => {
    const { t } = useTranslation();
    const { liveCount } = useDashboardCore();
    const { liveCalls } = useDashboardLive();
    const now = useNow(liveCalls.length > 0);

    // Enrich data: compute live duration for each call
    const enrichedCalls = useMemo(() =>
        liveCalls.map(call => ({
            call_id: call.call_id,
            caller: call.caller,
            callee: call.callee,
            duration_sec: call.start_time
                ? Math.max(0, Math.floor((now - new Date(call.start_time).getTime()) / 1000))
                : call.duration,
            status: call.status === 'answered' ? t('liveCalls.answered', 'Answered')
                : (call.status === 'ringing' || call.status === 'active') ? t('liveCalls.ringing', 'Ringing')
                    : call.status || '—',
            mos: call.has_quality_data ? parseFloat(call.mos.toFixed(2)) : null,
            jitter_ms: call.has_quality_data ? parseFloat(call.jitter.toFixed(1)) : null,
            loss_pct: call.has_quality_data ? parseFloat(call.loss.toFixed(2)) : null,
            rtt_ms: call.has_quality_data ? parseFloat(call.rtt.toFixed(0)) : null,
        })),
        [liveCalls, now, t]);

    const usePerspective = enrichedCalls.length > PERSPECTIVE_THRESHOLD;

    const handleRowClick = useCallback((row: Record<string, unknown>) => {
        const callId = row.call_id as string;
        if (callId) {
            console.log('[LiveCalls] Row clicked:', callId);
            // Future: open CallDetails panel
        }
    }, []);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="live-header" style={{ marginBottom: 8 }}>
                <h3 className="widget-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PhoneCall size={16} /> {t('liveCalls.title', 'Live Call Quality')}
                </h3>
                <span className="live-count">
                    {liveCount} {liveCount === 1 ? t('liveCalls.activeCall', 'active call') : t('liveCalls.activeCalls', 'active calls')}
                </span>
                <span className="live-pulse" />
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: usePerspective ? 'hidden' : 'auto' }}>
                {enrichedCalls.length > 0 ? (
                    usePerspective ? (
                        <Suspense fallback={<div style={{ padding: '1rem', color: 'var(--text-muted)' }}>{t('common.loading', 'Loading...')}</div>}>
                            <PerspectiveGrid
                                data={enrichedCalls}
                                columns={['call_id', 'caller', 'callee', 'duration_sec', 'status', 'mos', 'jitter_ms', 'loss_pct', 'rtt_ms']}
                                sort={[['mos', 'asc']]}
                                onRowClick={handleRowClick}
                            />
                        </Suspense>
                    ) : (
                        <DomTable calls={enrichedCalls} now={now} t={t} />
                    )
                ) : (
                    <div className="live-empty" style={{ padding: '2rem 1rem' }}>
                        <Phone size={36} strokeWidth={1} />
                        <p>{t('liveCalls.noActiveCalls', 'No active calls')}</p>
                        <span>{t('liveCalls.noActiveCallsHint', 'Active calls will appear here with real-time quality metrics')}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// ──── Original DOM Table (for low call counts) ────

interface DomTableProps {
    calls: {
        call_id: string;
        caller: string;
        callee: string;
        duration_sec: number;
        status: string;
        mos: number | null;
        jitter_ms: number | null;
        loss_pct: number | null;
        rtt_ms: number | null;
    }[];
    now: number;
    t: (key: string, fallback: string) => string;
}

const DomTable: React.FC<DomTableProps> = ({ calls, t }) => {
    const [copiedId, setCopiedId] = useState<string | null>(null);
    return (
        <Table className="live-calls-table">
            <TableHeader>
                <TableRow>
                    <TableHead>{t('liveCalls.col.callId', 'Call ID')}</TableHead>
                    <TableHead>{t('liveCalls.col.caller', 'Caller')}</TableHead>
                    <TableHead>{t('liveCalls.col.callee', 'Callee')}</TableHead>
                    <TableHead>{t('liveCalls.col.duration', 'Duration')}</TableHead>
                    <TableHead>{t('liveCalls.col.status', 'Status')}</TableHead>
                    <TableHead>MOS</TableHead>
                    <TableHead>{t('liveCalls.col.jitter', 'Jitter')}</TableHead>
                    <TableHead>{t('liveCalls.col.loss', 'Loss')}</TableHead>
                    <TableHead>RTT</TableHead>
                    <TableHead>{t('liveCalls.col.quality', 'Quality')}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {calls.map((call, i) => {
                    const hasData = call.mos !== null;
                    const statusClass = call.status === t('liveCalls.answered', 'Answered') ? 'answered'
                        : call.status === t('liveCalls.ringing', 'Ringing') ? 'ringing' : '';
                    return (
                        <TableRow key={i} className={!hasData ? 'no-data' : ''}>
                            <TableCell>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <button
                                        onClick={() => { copyToClipboard(call.call_id); setCopiedId(call.call_id); setTimeout(() => setCopiedId(null), 1500); }}
                                        title={t('common.copy', 'Copy')}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center', color: copiedId === call.call_id ? 'var(--success)' : 'var(--text-muted)' }}
                                    >
                                        {copiedId === call.call_id ? <Check size={12} /> : <Copy size={12} />}
                                    </button>
                                    <span className="call-id-link" title={call.call_id}>{call.call_id.slice(0, 8)}…</span>
                                </div>
                            </TableCell>
                            <TableCell>{call.caller}</TableCell>
                            <TableCell>{call.callee}</TableCell>
                            <TableCell style={{ fontFamily: 'monospace' }}>{fmtDuration(call.duration_sec)}</TableCell>
                            <TableCell>
                                <span className={`call-status-badge ${statusClass}`}>{call.status}</span>
                            </TableCell>
                            <TableCell>
                                {hasData ? (
                                    <span className={`mos-badge ${mosGradeClass(call.mos!)}`}>{call.mos!.toFixed(2)}</span>
                                ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </TableCell>
                            <TableCell>{hasData ? `${call.jitter_ms}ms` : '—'}</TableCell>
                            <TableCell>{hasData ? `${call.loss_pct}%` : '—'}</TableCell>
                            <TableCell>{hasData ? `${call.rtt_ms}ms` : '—'}</TableCell>
                            <TableCell>
                                {hasData ? (
                                    <span className={`status-dot ${call.mos! >= 3.0 ? 'ok' : call.mos! >= 2.0 ? 'warn' : 'bad'}`} />
                                ) : (
                                    <span className="status-dot pending" title="Waiting for RTCP data" />
                                )}
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};

export default LiveCallsWidget;
