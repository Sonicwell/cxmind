import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../../components/ui/table';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Eye, Trash2, Calendar } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ConfirmModal } from '../../../components/ui/ConfirmModal';
import { GlassModal } from '../../../components/ui/GlassModal';
import { Select } from '../../../components/ui/Select';
import api from '../../../services/api';



interface DistillationLog {
    timestamp: string;
    call_id: string;
    service_type: string;
    model: string;
    prompt: string;
    response: string;
    tokens: number;
    is_valid: number;
}

export const DistillationLogs: React.FC = () => {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<DistillationLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);

    // Filters
    const [page, setPage] = useState(1);
    const pageSize = 50;
    const [serviceType, setServiceType] = useState<string>('all');
    const [isValidFilter, setIsValidFilter] = useState<string>('1');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // Modals
    const [viewData, setViewData] = useState<{ title: string; content: string } | null>(null);
    const [invalidateTarget, setInvalidateTarget] = useState<DistillationLog | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                limit: pageSize.toString(),
                offset: ((page - 1) * pageSize).toString(),
            });

            if (serviceType !== 'all') queryParams.append('service_type', serviceType);
            if (isValidFilter !== 'all') queryParams.append('is_valid', isValidFilter);
            if (dateRange.start) queryParams.append('start_date', new Date(dateRange.start).toISOString());
            if (dateRange.end) {
                const end = new Date(dateRange.end);
                end.setHours(23, 59, 59, 999);
                queryParams.append('end_date', end.toISOString());
            }

            const response = await api.get('/platform/llm-logs', { params: queryParams });

            const result = response.data;
            setLogs(result.data);
            setTotal(result.pagination.total);
        } catch (error) {
            console.error(error);
            toast.error(t('distillationLogs.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [page, serviceType, isValidFilter, dateRange]);

    const handleInvalidate = async () => {
        if (!invalidateTarget) return;

        try {
            await api.post('/platform/llm-logs/invalidate', {
                timestamp: invalidateTarget.timestamp,
                call_id: invalidateTarget.call_id
            });

            toast.success(t('distillationLogs.invalidateSuccess'));
            fetchLogs();
        } catch (error) {
            console.error(error);
            toast.error(t('distillationLogs.invalidateFailed'));
        } finally {
            setInvalidateTarget(null);
        }
    };

    const formatJSON = (jsonString: string) => {
        try {
            const parsed = JSON.parse(jsonString);
            return JSON.stringify(parsed, null, 2);
        } catch {
            return jsonString;
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold tracking-tight">{t('distillationLogs.title')}</h2>
                    <p className="text-muted-foreground text-sm">
                        {t('distillationLogs.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => fetchLogs()} disabled={loading}>
                        {t('distillationLogs.refresh')}
                    </Button>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '0.5rem', background: 'var(--muted)', overflowX: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('distillationLogs.filterService')}</span>
                    <Select 
                        className="h-9"
                        style={{ width: '150px' }}
                        value={serviceType} 
                        onChange={(e) => { setServiceType(e.target.value); setPage(1); }}
                    >
                        <option value="all">{t('distillationLogs.allServices')}</option>
                        <option value="quality">{t('distillationLogs.quality')}</option>
                        <option value="summary">{t('distillationLogs.summary')}</option>
                        <option value="sentiment">{t('distillationLogs.sentiment')}</option>
                        <option value="outcome">{t('distillationLogs.outcome')}</option>
                        <option value="assistant">{t('distillationLogs.assistant')}</option>
                        <option value="chat">{t('distillationLogs.chat')}</option>
                        <option value="sop">SOP</option>
                    </Select>
                </div>

                <div style={{ width: '1px', height: '1.25rem', background: 'var(--border)', flexShrink: 0 }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('distillationLogs.filterValidity')}</span>
                    <Select 
                        className="h-9"
                        style={{ width: '110px' }}
                        value={isValidFilter} 
                        onChange={(e) => { setIsValidFilter(e.target.value); setPage(1); }}
                    >
                        <option value="1">{t('distillationLogs.valid')}</option>
                        <option value="0">{t('distillationLogs.invalid')}</option>
                        <option value="all">{t('distillationLogs.all')}</option>
                    </Select>
                </div>

                <div style={{ width: '1px', height: '1.25rem', background: 'var(--border)', flexShrink: 0 }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <Input 
                        type="date" 
                        className="h-9"
                        style={{ width: '140px' }}
                        value={dateRange.start}
                        onChange={(e) => { setDateRange(prev => ({ ...prev, start: e.target.value })); setPage(1); }}
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>—</span>
                    <Input 
                        type="date" 
                        className="h-9"
                        style={{ width: '140px' }}
                        value={dateRange.end}
                        onChange={(e) => { setDateRange(prev => ({ ...prev, end: e.target.value })); setPage(1); }}
                    />
                </div>
            </div>

            <div className="border rounded-md" style={{ overflowX: 'auto' }}>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('distillationLogs.colTime')}</TableHead>
                            <TableHead>{t('distillationLogs.colService')}</TableHead>
                            <TableHead>{t('distillationLogs.colCallId')}</TableHead>
                            <TableHead>{t('distillationLogs.colModel')}</TableHead>
                            <TableHead>{t('distillationLogs.colTokens')}</TableHead>
                            <TableHead>{t('distillationLogs.colStatus')}</TableHead>
                            <TableHead className="text-right">{t('distillationLogs.colActions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && logs.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-10">{t('distillationLogs.loading')}</TableCell></TableRow>
                        ) : logs.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t('distillationLogs.noLogs')}</TableCell></TableRow>
                        ) : (
                            logs.map((log, idx) => (
                                <TableRow key={`${log.call_id}-${log.timestamp}-${idx}`}>
                                    <TableCell className="whitespace-nowrap text-sm">{new Date(log.timestamp.endsWith('Z') ? log.timestamp : log.timestamp + 'Z').toLocaleString()}</TableCell>
                                    <TableCell><Badge variant="default">{log.service_type}</Badge></TableCell>
                                    <TableCell className="font-mono text-xs" style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.call_id}>{log.call_id}</TableCell>
                                    <TableCell className="text-sm">{log.model}</TableCell>
                                    <TableCell>{log.tokens}</TableCell>
                                    <TableCell>
                                        {log.is_valid === 1 ? (
                                            <Badge variant="default">{t('distillationLogs.valid')}</Badge>
                                        ) : (
                                            <Badge variant="danger">{t('distillationLogs.invalid')}</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <Button 
                                            variant="ghost" 
                                            size="sm"
                                            onClick={() => setViewData({ title: t('distillationLogs.promptJson'), content: log.prompt })}
                                        >
                                            <Eye className="w-4 h-4 mr-1"/> {t('distillationLogs.viewPrompt')}
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="sm"
                                            onClick={() => setViewData({ title: t('distillationLogs.responseTitle'), content: log.response })}
                                        >
                                            <Eye className="w-4 h-4 mr-1"/> {t('distillationLogs.viewResponse')}
                                        </Button>
                                        {log.is_valid === 1 && (
                                            <Button 
                                                variant="ghost" 
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => setInvalidateTarget(log)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {t('distillationLogs.showingEntries', {
                        from: logs.length > 0 ? ((page - 1) * pageSize) + 1 : 0,
                        to: Math.min(page * pageSize, total),
                        total
                    })}
                </p>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>
                        {t('distillationLogs.previous')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * pageSize >= total || loading}>
                        {t('distillationLogs.next')}
                    </Button>
                </div>
            </div>

            {/* View JSON Modal */}
            <GlassModal
                open={!!viewData}
                onOpenChange={(open) => { if (!open) setViewData(null); }}
                title={viewData?.title || ''}
                style={{ maxWidth: '42rem', width: '90vw' }}
            >
                <div className="glass-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', background: 'var(--muted)', padding: '1rem', borderRadius: '0.375rem' }}>
                    <pre style={{ fontSize: '0.75rem', fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                        {viewData ? formatJSON(viewData.content) : ''}
                    </pre>
                </div>
            </GlassModal>

            {/* Confirm Invalidate Modal */}
            <ConfirmModal
                open={!!invalidateTarget}
                onClose={() => setInvalidateTarget(null)}
                title={t('distillationLogs.invalidateTitle')}
                description={t('distillationLogs.invalidateDesc')}
                onConfirm={handleInvalidate}
                confirmText={t('distillationLogs.invalidateBtn')}
                isDanger={true}
            />
        </div>
    );
};
