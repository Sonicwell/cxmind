/**
 * WorstCallsWidget — Shows calls with lowest quality scores
 *
 * Uses Perspective WASM datagrid for virtualized rendering when row count
 * exceeds threshold, with fallback to DOM table for small datasets.
 */
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import React, { useMemo, lazy, Suspense, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUTCToLocal } from '../../utils/date';
import { TrendingDown, Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';
import { useDashboardQuality } from '../../dashboard/DashboardContext';
import { mosGradeClass, fmtDuration } from '../../dashboard/helpers';

const PerspectiveGrid = lazy(() => import('../PerspectiveGrid'));

const PERSPECTIVE_THRESHOLD = 30;

const WorstCallsWidget: React.FC = () => {
    const { t } = useTranslation();
    const { worstCalls } = useDashboardQuality();
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const tableData = useMemo(() =>
        worstCalls.map(call => ({
            call_id: call.call_id,
            full_call_id: call.call_id,
            time: call.first_report ? formatUTCToLocal(call.first_report, 'MM/dd HH:mm') : '—',
            avg_mos: parseFloat((call.avg_mos || 0).toFixed(2)),
            min_mos: parseFloat((call.min_mos || 0).toFixed(2)),
            loss_pct: parseFloat(((call.avg_loss || 0) * 100).toFixed(1)),
            jitter_ms: parseFloat((call.avg_jitter || 0).toFixed(1)),
            rtt_ms: parseFloat((call.avg_rtt || 0).toFixed(0)),
            duration_sec: call.duration || 0,
        })),
        [worstCalls]);

    const usePerspective = tableData.length > PERSPECTIVE_THRESHOLD;

    const handleRowClick = useCallback((row: Record<string, unknown>) => {
        const callId = row.full_call_id as string;
        if (callId) console.log('[WorstCalls] Row clicked:', callId);
    }, []);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 className="widget-title">
                <TrendingDown size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                {t('worstCalls.title', 'Worst Calls')}
            </h3>
            <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: usePerspective ? 'hidden' : 'auto' }}>
                {tableData.length > 0 ? (
                    usePerspective ? (
                        <Suspense fallback={<div style={{ padding: '1rem', color: 'var(--text-muted)' }}>{t('common.loading', 'Loading...')}</div>}>
                            <PerspectiveGrid
                                data={tableData}
                                columns={['call_id', 'avg_mos', 'min_mos', 'loss_pct', 'jitter_ms', 'rtt_ms', 'duration_sec']}
                                sort={[['avg_mos', 'asc']]}
                                onRowClick={handleRowClick}
                            />
                        </Suspense>
                    ) : (
                        <Table className="cq-worst-table">
                            <TableHeader><TableRow><TableHead>{t('liveCalls.col.callId', 'Call ID')}</TableHead><TableHead>{t('common.time', 'Time')}</TableHead><TableHead>Avg MOS</TableHead><TableHead>Min MOS</TableHead><TableHead>{t('liveCalls.col.loss', 'Loss')}</TableHead><TableHead>{t('liveCalls.col.jitter', 'Jitter')}</TableHead><TableHead>RTT</TableHead><TableHead>{t('liveCalls.col.duration', 'Duration')}</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {tableData.map((call, i) => (
                                    <TableRow key={i}>
                                        <TableCell>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <button
                                                    onClick={() => { copyToClipboard(call.full_call_id); setCopiedId(call.full_call_id); setTimeout(() => setCopiedId(null), 1500); }}
                                                    title="Copy"
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center', color: copiedId === call.full_call_id ? 'var(--success)' : 'var(--text-muted)' }}
                                                >
                                                    {copiedId === call.full_call_id ? <Check size={12} /> : <Copy size={12} />}
                                                </button>
                                                <span className="call-id-link" title={call.full_call_id}>{call.full_call_id.slice(0, 8)}…</span>
                                            </div>
                                        </TableCell>
                                        <TableCell style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{call.time}</TableCell>
                                        <TableCell><span className={`mos-badge ${mosGradeClass(call.avg_mos)}`}>{call.avg_mos.toFixed(2)}</span></TableCell>
                                        <TableCell><span className={`mos-badge ${mosGradeClass(call.min_mos)}`}>{call.min_mos.toFixed(2)}</span></TableCell>
                                        <TableCell>{call.loss_pct}%</TableCell>
                                        <TableCell>{call.jitter_ms}ms</TableCell>
                                        <TableCell>{call.rtt_ms}ms</TableCell>
                                        <TableCell>{call.duration_sec ? fmtDuration(call.duration_sec) : '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )
                ) : (<div className="cq-empty">{t('worstCalls.noData', 'No data')}</div>)}
            </div>
        </div>
    );
};

export default WorstCallsWidget;
