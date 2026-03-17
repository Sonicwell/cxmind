import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { copyToClipboard } from '../utils/clipboard';
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { getMockCallEvents } from '../services/mock-data';
import { useDemoMode } from '../hooks/useDemoMode';
import { RefreshCw, Search, X, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';
import { formatToLocalTime } from '../utils/date';
import { MotionButton } from '../components/ui/MotionButton';
import { Button } from '../components/ui/button';


interface CallEvent {
    timestamp: string;
    call_id: string;
    realm: string;
    event_type: string;
    caller_uri: string;
    callee_uri: string;
    src_ip: string;
    dst_ip: string;
    method: string;
    status_code: number;
    body: string;
    src_country?: string;
    src_city?: string;
    dst_country?: string;
    dst_city?: string;
    client_id?: string;
}

const PAGE_SIZE = 50;

const CallEvents: React.FC = () => {
    const { demoMode } = useDemoMode();
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();

    const [events, setEvents] = useState<CallEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
    const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('q') || '');
    const [page, setPage] = useState(parseInt(searchParams.get('page') || '0', 10));
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Debounce search → 300ms
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // 搜索词变了就回第一页
    useEffect(() => { setPage(0); }, [debouncedSearch]);

    // URL sync: page + q → URL (replace 模式避免 history 膨胀)
    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        const syncParam = (key: string, value: string) => {
            if (value) next.set(key, value); else next.delete(key);
        };
        syncParam('page', page > 0 ? String(page) : '');
        syncParam('q', debouncedSearch);
        if (next.toString() !== searchParams.toString()) {
            setSearchParams(next, { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, debouncedSearch]);


    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            if (demoMode) {
                const res = await getMockCallEvents();
                setEvents(res.data.data as any);
            } else {
                const params = new URLSearchParams();
                params.set('limit', String(PAGE_SIZE));
                params.set('offset', String(page * PAGE_SIZE));
                if (debouncedSearch) params.set('search', debouncedSearch);
                const response = await api.get(`/platform/events?${params.toString()}`);
                setEvents(response.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch call events:', error);
        } finally {
            setLoading(false);
        }
    }, [demoMode, page, debouncedSearch]);

    useEffect(() => { fetchEvents(); }, [fetchEvents]);

    // 后端不返回 total，用返回数量判断是否有下一页
    const hasNextPage = events.length >= PAGE_SIZE;

    return (
        <div className="page-content">
            <div className="page-header flex justify-between items-center" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div className="search-bar input-with-icon" style={{ width: '400px', position: 'relative' }}>
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder={t('callEventsPage.searchPlaceholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ paddingRight: searchTerm ? '30px' : undefined }}
                        />
                        {searchTerm && (
                            <span
                                title={t('common.clear', 'Clear')}
                                style={{
                                    position: 'absolute',
                                    right: '10px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    zIndex: 10
                                }}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSearchTerm('');
                                }}
                            >
                                <X size={14} />
                            </span>
                        )}
                    </div>

                </div>

                <MotionButton onClick={fetchEvents} disabled={loading}>
                    <RefreshCw size={18} className={loading ? 'spin' : ''} style={{ marginRight: '0.5rem' }} />
                    {t('callEventsPage.refresh')}
                </MotionButton>
            </div>

            <div className="glass-panel" style={{ overflow: 'hidden', borderRadius: 'var(--radius-md)' }}>
                <Table className="w-full" style={{ borderCollapse: 'collapse' }}>
                    <TableHeader>
                        <TableRow style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                            <TableHead style={{ padding: '1rem' }}>{t('callEventsPage.timestamp')}</TableHead>
                            <TableHead style={{ padding: '1rem' }}>{t('callEventsPage.callId')}</TableHead>
                            <TableHead style={{ padding: '1rem' }}>{t('callEventsPage.type')}</TableHead>
                            <TableHead style={{ padding: '1rem' }}>{t('callEventsPage.source')}</TableHead>
                            <TableHead style={{ padding: '1rem' }}>{t('callEventsPage.dest')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && events.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{t('callEventsPage.loading')}</TableCell>
                            </TableRow>
                        ) : events.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{t('callEventsPage.noEvents')}</TableCell>
                            </TableRow>
                        ) : (
                            events.map((event, index) => (
                                <TableRow key={`${event.call_id}-${index}`} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                    <TableCell style={{ padding: '1rem', whiteSpace: 'nowrap', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                        {formatToLocalTime(event.timestamp)}
                                    </TableCell>
                                    <TableCell style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <Button
                                                onClick={() => { copyToClipboard(event.call_id); setCopiedId(event.call_id); setTimeout(() => setCopiedId(null), 1500); }}
                                                title={t('common.copy', 'Copy')}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center', color: copiedId === event.call_id ? 'var(--success)' : 'var(--text-muted)' }}
                                            >
                                                {copiedId === event.call_id ? <Check size={12} /> : <Copy size={12} />}
                                            </Button>
                                            <span title={event.call_id}>{event.call_id.slice(0, 8)}…</span>
                                        </div>
                                    </TableCell>
                                    <TableCell style={{ padding: '1rem' }}>{event.event_type}</TableCell>
                                    <TableCell style={{ padding: '1rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span>{event.caller_uri}</span>
                                            <small style={{ color: 'var(--text-muted)' }}>
                                                {event.src_ip} {event.src_country && `(${event.src_country})`}
                                            </small>
                                        </div>
                                    </TableCell>
                                    <TableCell style={{ padding: '1rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span>{event.callee_uri}</span>
                                            <small style={{ color: 'var(--text-muted)' }}>
                                                {event.dst_ip} {event.dst_country && `(${event.dst_country})`}
                                            </small>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>

                {/* Pagination — 与 SipCalls 一致的样式和位置 */}
                {(page > 0 || hasNextPage) && (
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.75rem 1rem', paddingRight: '4rem', borderTop: '1px solid var(--glass-border)'
                    }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {t('callEventsPage.page', { page: page + 1 })}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <MotionButton
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                            >
                                <ChevronLeft size={14} />
                            </MotionButton>
                            <span style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                {page + 1}
                            </span>
                            <MotionButton
                                onClick={() => setPage(p => p + 1)}
                                disabled={!hasNextPage}
                            >
                                <ChevronRight size={14} />
                            </MotionButton>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CallEvents;
