import { Input } from "../components/ui/input";
import { copyToClipboard } from '../utils/clipboard';
import { DatePicker } from '../components/ui/DatePicker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select } from '../components/ui/Select';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useVisibilityAwareInterval } from '../hooks/useVisibilityAwareInterval';
import { useTranslation } from 'react-i18next';
import { useDemoMode } from '../hooks/useDemoMode';
import api from '../services/api';
import { getMockCalls } from '../services/mock-data';
import { Search, PhoneIncoming, PhoneOutgoing, BarChart3, Info, Settings, Check, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Calendar, Clock, X, SlidersHorizontal, Copy } from 'lucide-react';
import { formatToLocalTime } from '../utils/date';
import { useSearchParams } from 'react-router-dom';

import CallDetails from '../components/CallDetails';

import { CallAnalysisModal } from '../components/analysis/CallAnalysisModal';
import { GlassModal } from '../components/ui/GlassModal';
import { Badge } from '../components/ui/badge';
import { MotionButton } from '../components/ui/MotionButton';
import ExportButton from '../components/ExportButton';
import { exportToCSV, exportFilename } from '../utils/export-csv';
import type { ExportColumn } from '../utils/export-csv';
import { Button } from '../components/ui/button';

interface Call {
    call_id: string;
    timestamp: string;
    caller: string;
    callee: string;
    from_domain: string;
    to_domain: string;
    last_method: string;
    last_status: number;
    client_id: string;
    duration: number;
    emotion?: string;
    direction?: string;
    call_answered?: string;
    call_ended?: string;
    hangup_by?: string;
    agent_number?: string;
    call_type?: string;
    disconnect_reason?: string;
}

interface Group {
    _id: string;
    name: string;
    code: string;
}


// 格式化时长
const formatDuration = (seconds: number) => {
    if (seconds == null) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// 接听后实际通话时长 = call_ended - call_answered
const getTalkTimeSec = (call: Call): number | null => {
    if (!call.call_answered || !call.call_ended) return null;
    const answered = new Date(call.call_answered).getTime();
    const ended = new Date(call.call_ended).getTime();
    if (isNaN(answered) || isNaN(ended) || answered <= 0) return null;
    return Math.max(0, Math.floor((ended - answered) / 1000));
};

// 多条件搜索：空格分割 token，关键词映射为 filter，剩余为文本搜索
const SEARCH_KEYWORD_MAP: Record<string, { field: 'direction' | 'callType' | 'hangupBy' | 'status'; value: string }> = {
    'in': { field: 'direction', value: 'inbound' },
    'inbound': { field: 'direction', value: 'inbound' },
    'out': { field: 'direction', value: 'outbound' },
    'outbound': { field: 'direction', value: 'outbound' },
    'agent': { field: 'callType', value: 'agent' },
    'system': { field: 'callType', value: 'system' },
    'ext': { field: 'callType', value: 'system' },
    'external': { field: 'callType', value: 'system' },
    'int': { field: 'callType', value: 'internal' },
    'internal': { field: 'callType', value: 'internal' },
    'hangbyagent': { field: 'hangupBy', value: 'agent' },
    'hba': { field: 'hangupBy', value: 'agent' },
    'hangbycustomer': { field: 'hangupBy', value: 'customer' },
    'hbc': { field: 'hangupBy', value: 'customer' },
    'hangbysystem': { field: 'hangupBy', value: 'system' },
    'hbs': { field: 'hangupBy', value: 'system' },
    // Status 快捷关键词
    'answered': { field: 'status', value: 'answered' },
    'noanswer': { field: 'status', value: 'no_answer' },
    'no_answer': { field: 'status', value: 'no_answer' },
    'cancel': { field: 'status', value: 'cancel' },
    'cancelled': { field: 'status', value: 'cancel' },
    'busy': { field: 'status', value: 'busy' },
    'failed': { field: 'status', value: 'failed' },

    // 自定义异常过滤
    'error': { field: 'status', value: 'error' },
    'unauthorized': { field: 'status', value: 'unauthorized' },
    'auth': { field: 'status', value: 'unauthorized' },
    'timeout': { field: 'status', value: 'timeout' },
};
// trunk/did 是 UI 展示标签，跨多种 callType，识别但不映射 filter
const SEARCH_LABEL_KEYWORDS = new Set(['trunk', 'did']);

interface ParsedSearch {
    textSearch: string;
    kwDirection?: string;
    kwCallType?: string;
    kwHangupBy?: string;
    kwStatus?: string;
}

const parseSearchTokens = (input: string): ParsedSearch => {
    const tokens = input.trim().split(/\s+/).filter(Boolean);
    const result: ParsedSearch = { textSearch: '' };
    const textParts: string[] = [];
    for (const token of tokens) {
        const mapping = SEARCH_KEYWORD_MAP[token.toLowerCase()];
        if (mapping) {
            if (mapping.field === 'direction') result.kwDirection = mapping.value;
            else if (mapping.field === 'callType') result.kwCallType = mapping.value;
            else if (mapping.field === 'hangupBy') result.kwHangupBy = mapping.value;
            else if (mapping.field === 'status') result.kwStatus = mapping.value;
        } else if (SEARCH_LABEL_KEYWORDS.has(token.toLowerCase())) {
            // UI-only labels 跨多种 callType，不映射也不作为文本搜索
        } else {
            textParts.push(token);
        }
    }
    result.textSearch = textParts.join(' ');
    return result;
};

const SipCalls: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { demoMode } = useDemoMode();
    const [searchParams, setSearchParams] = useSearchParams();
    const [calls, setCalls] = useState<Call[]>([]);
    const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const [selectedAnalysisCallId, setSelectedAnalysisCallId] = useState<string | null>(searchParams.get('analysisCallId') || null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
    const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('q') || '');

    // Server-side filters — 从 URL 恢复
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string>(searchParams.get('groupId') || '');
    const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('fStatus') || '');
    const [selectedDirection, setSelectedDirection] = useState<string>(searchParams.get('direction') || '');
    const [selectedCallType, setSelectedCallType] = useState<string>(searchParams.get('callType') || '');
    const [selectedHangupBy, setSelectedHangupBy] = useState<string>(searchParams.get('hangupBy') || '');

    // Date range
    const [startDate, setStartDate] = useState<string>(searchParams.get('startDate') || '');
    const [endDate, setEndDate] = useState<string>(searchParams.get('endDate') || '');
    // Duration range (seconds)
    const [minDuration, setMinDuration] = useState<string>(searchParams.get('minDur') || '');
    const [maxDuration, setMaxDuration] = useState<string>(searchParams.get('maxDur') || '');
    // Sort
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>((searchParams.get('sort') as 'desc' | 'asc') || 'desc');
    // Filter panel
    const [showFilterPanel, setShowFilterPanel] = useState(false);
    const filterPanelRef = useRef<HTMLDivElement>(null);

    // Pagination
    const PAGE_SIZE = 50;
    const [page, setPage] = useState(parseInt(searchParams.get('page') || '0', 10));
    const [total, setTotal] = useState(0);

    // Drill-down filters from URL
    const filterEmotion = searchParams.get('emotion');
    const filterSentiment = searchParams.get('sentiment');
    // const filterIntent = searchParams.get('intent');
    const filterStatus = searchParams.get('status'); // e.g. 'abandoned'

    // Column Visibility State
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
        'time', 'duration', 'talk_time', 'caller', 'callee', 'status', 'call_id', 'direction', 'action'
    ]));
    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const columnMenuRef = useRef<HTMLDivElement>(null);

    // Initial load: if drill-down params exist, maybe auto-show relevant columns?
    useEffect(() => {
        if (filterEmotion || filterSentiment) {
            setVisibleColumns(prev => new Set([...prev, 'emotion']));
        }
    }, [filterEmotion, filterSentiment]);

    const toggleColumn = (column: string) => {
        const newColumns = new Set(visibleColumns);
        if (newColumns.has(column)) {
            newColumns.delete(column);
        } else {
            newColumns.add(column);
        }
        setVisibleColumns(newColumns);
    };

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (columnMenuRef.current && !columnMenuRef.current.contains(target)) {
                setShowColumnMenu(false);
            }
        };

        if (showColumnMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showColumnMenu]);


    // Fetch groups once on mount
    useEffect(() => {
        api.get('/groups').then(res => {
            setGroups(res.data.data || res.data || []);
        }).catch(() => { });
    }, []);

    const fetchCalls = useCallback(async () => {
        try {
            if (demoMode) {
                const res = await getMockCalls();
                setCalls(res.data.calls);
                setTotal(res.data.calls?.length || 0);
            } else {
                // 多条件搜索：解析关键词 → filter 参数
                const parsed = parseSearchTokens(debouncedSearch);
                const params = new URLSearchParams();
                params.set('limit', String(PAGE_SIZE));
                params.set('offset', String(page * PAGE_SIZE));
                if (selectedGroupId) params.set('groupIds', selectedGroupId);
                if (selectedStatus || parsed.kwStatus) params.set('status', selectedStatus || parsed.kwStatus || '');
                // UI filter 优先，搜索关键词次之
                params.set('direction', selectedDirection || parsed.kwDirection || '');
                params.set('callType', selectedCallType || parsed.kwCallType || '');
                params.set('hangupBy', selectedHangupBy || parsed.kwHangupBy || '');
                // 清理空参数
                ['direction', 'callType', 'hangupBy'].forEach(k => { if (!params.get(k)) params.delete(k); });
                if (parsed.textSearch) params.set('search', parsed.textSearch);
                if (startDate) params.set('startDate', startDate);
                if (endDate) params.set('endDate', endDate);
                if (minDuration) params.set('minDuration', minDuration);
                if (maxDuration) params.set('maxDuration', maxDuration);
                params.set('sortOrder', sortOrder);

                const [activeRes, historyRes] = await Promise.all([
                    api.get('/platform/calls/active').catch(() => ({ data: { data: [] } })),
                    api.get(`/platform/calls?${params.toString()}`)
                ]);

                const activeCalls: Call[] = activeRes.data.data || [];
                const historyCalls = historyRes.data.data || [];
                const serverTotal = historyRes.data.total ?? historyCalls.length;

                // active calls 也需遵守日期过滤
                const filteredActive = activeCalls.filter((c: Call) => {
                    if (startDate && c.timestamp < startDate) return false;
                    if (endDate && c.timestamp > endDate + 'T23:59:59') return false;
                    return true;
                });

                // Merge active and history, prioritizing active (for emotion data)
                const callMap = new Map<string, Call>();
                historyCalls.forEach((c: Call) => callMap.set(c.call_id, c));
                filteredActive.forEach((c: Call) => callMap.set(c.call_id, c));

                const merged = Array.from(callMap.values())
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                setCalls(merged);
                setTotal(serverTotal);
            }
        } catch (error) {
            console.error('Failed to fetch calls', error);
        } finally {
            setLoading(false);
        }
    }, [demoMode, page, selectedGroupId, selectedStatus, selectedDirection, selectedCallType, selectedHangupBy, debouncedSearch, startDate, endDate, minDuration, maxDuration, sortOrder]);

    useEffect(() => { fetchCalls(); }, [fetchCalls]);
    useVisibilityAwareInterval(fetchCalls, 10000);

    // filter变了就回第一页
    useEffect(() => { setPage(0); }, [selectedGroupId, selectedStatus, selectedDirection, selectedCallType, debouncedSearch, startDate, endDate, minDuration, maxDuration]);

    // Close filter panel on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) setShowFilterPanel(false);
        };
        if (showFilterPanel) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showFilterPanel]);

    // Count active filters (excluding search and sort)
    const activeFilterCount = [selectedGroupId, selectedStatus, selectedDirection, selectedCallType, selectedHangupBy, startDate, endDate, minDuration, maxDuration].filter(Boolean).length;

    const clearAllFilters = () => {
        setSelectedGroupId(''); setSelectedStatus(''); setSelectedDirection('');
        setSelectedCallType(''); setSelectedHangupBy('');
        setStartDate(''); setEndDate(''); setMinDuration(''); setMaxDuration('');
    };

    // Debounce search input → 300ms delay before triggering server request
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // 将筛选条件 / 页码同步到 URL，replace 模式避免产生大量历史记录
    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        const syncParam = (key: string, value: string) => {
            if (value) next.set(key, value); else next.delete(key);
        };
        syncParam('page', page > 0 ? String(page) : '');
        syncParam('q', debouncedSearch);
        syncParam('groupId', selectedGroupId);
        syncParam('fStatus', selectedStatus);
        syncParam('direction', selectedDirection);
        syncParam('callType', selectedCallType);
        syncParam('hangupBy', selectedHangupBy);
        syncParam('startDate', startDate);
        syncParam('endDate', endDate);
        syncParam('minDur', minDuration);
        syncParam('maxDur', maxDuration);
        syncParam('sort', sortOrder !== 'desc' ? sortOrder : '');
        syncParam('analysisCallId', selectedAnalysisCallId || '');
        if (next.toString() !== searchParams.toString()) {
            setSearchParams(next, { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, debouncedSearch, selectedGroupId, selectedStatus, selectedDirection, selectedCallType, selectedHangupBy, startDate, endDate, minDuration, maxDuration, sortOrder, selectedAnalysisCallId]);




    const filteredCalls = calls.filter(call => {
        // Drill-down Filters (URL params, not server-side)
        if (filterEmotion && call.emotion !== filterEmotion) return false;

        // Note: 'status', 'sentiment', 'intent' might need backend support or richer Call object
        // For now, we support 'emotion' directly as it's on the Call object.
        // 'status' mapping:
        if (filterStatus === 'abandoned' && ![487, 603].includes(call.last_status)) return false;
        if (filterStatus === 'answered' && call.last_status !== 200) return false;

        return true;
    });



    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="page-content">
            <div className="page-header" style={{ marginBottom: 'var(--spacing-md)' }}>
                {/* Row 1: Search + Date + Filter Button + Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                        <div className="search-bar input-with-icon" style={{ width: '320px', position: 'relative' }}>
                            <Search size={16} />
                            <Input
                                type="text"
                                placeholder={t('sipCallsPage.searchPlaceholder')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ paddingRight: searchTerm ? '30px' : undefined }}
                            />
                            {searchTerm && (
                                <span
                                    title={t('common.clearSearch', 'Clear search')}
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

                        {/* Date range */}
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                            <Calendar size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <DatePicker

                                value={startDate}
                                lang={i18n.language}
                                onChange={e => setStartDate(e.target.value)}
                                style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', width: '130px' }}
                            />
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>~</span>
                            <DatePicker

                                value={endDate}
                                lang={i18n.language}
                                onChange={e => setEndDate(e.target.value)}
                                style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', width: '130px' }}
                            />
                        </div>

                        {/* Quick date presets */}
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                            {[{ label: t('common.today', 'Today'), days: 0 }, { label: '7d', days: 7 }, { label: '30d', days: 30 }].map(preset => {
                                const today = new Date().toISOString().split('T')[0];
                                const from = preset.days === 0 ? today : new Date(Date.now() - preset.days * 86400000).toISOString().split('T')[0];
                                const isActive = startDate === from && endDate === today;
                                return (
                                    <Button
                                        key={preset.days}
                                        onClick={() => { setStartDate(from); setEndDate(today); }}
                                        style={{
                                            padding: '0.3rem 0.5rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)',
                                            border: '1px solid var(--glass-border)', cursor: 'pointer',
                                            background: isActive ? 'var(--primary)' : 'var(--bg-card)',
                                            color: isActive ? '#fff' : 'var(--text-secondary)',
                                        }}
                                    >
                                        {preset.label}
                                    </Button>
                                );
                            })}
                        </div>

                        {/* Filter panel toggle */}
                        <div ref={filterPanelRef} style={{ position: 'relative' }}>
                            <MotionButton
                                className={`btn btn-sm ${activeFilterCount > 0 ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setShowFilterPanel(!showFilterPanel)}
                            >
                                <SlidersHorizontal size={14} />
                                <span style={{ marginLeft: '4px' }}>{t('common.filters', 'Filters')}</span>
                                {activeFilterCount > 0 && (
                                    <span style={{ marginLeft: '4px', background: '#fff', color: 'var(--primary)', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>
                                        {activeFilterCount}
                                    </span>
                                )}
                            </MotionButton>

                            {showFilterPanel && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, marginTop: '0.5rem',
                                    background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                                    borderRadius: 'var(--radius-md)', padding: '1rem',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100,
                                    minWidth: '320px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem',
                                }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {t('sipCallsPage.filterGroups', 'Groups')}
                                        <Select value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}
                                            style={{ width: '100%', padding: '0.35rem', fontSize: '0.8rem', marginTop: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                            <option value="">{t('common.all', 'All')}</option>
                                            {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
                                        </Select>
                                    </label>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {t('sipCallsPage.filterStatus', 'Status')}
                                        <Select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
                                            style={{ width: '100%', padding: '0.35rem', fontSize: '0.8rem', marginTop: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                            <option value="">{t('common.all', 'All')}</option>
                                            <option value="answered">{t('sipCallsPage.filterAnswered', 'Answered')}</option>
                                            <option value="no_answer">{t('sipCallsPage.filterNoAnswer', 'No Answer')}</option>
                                            <option value="busy">{t('sipCallsPage.filterBusy', 'Busy')}</option>
                                            <option value="failed">{t('sipCallsPage.filterFailed', 'Failed')}</option>
                                        </Select>
                                    </label>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {t('sipCallsPage.filterDirection', 'Direction')}
                                        <Select value={selectedDirection} onChange={e => setSelectedDirection(e.target.value)}
                                            style={{ width: '100%', padding: '0.35rem', fontSize: '0.8rem', marginTop: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                            <option value="">{t('common.all', 'All')}</option>
                                            <option value="inbound">{t('sipCallsPage.filterInbound', 'Inbound')}</option>
                                            <option value="outbound">{t('sipCallsPage.filterOutbound', 'Outbound')}</option>
                                        </Select>
                                    </label>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {t('sipCallsPage.filterCallType', 'Call Type')}
                                        <Select value={selectedCallType} onChange={e => setSelectedCallType(e.target.value)}
                                            style={{ width: '100%', padding: '0.35rem', fontSize: '0.8rem', marginTop: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                            <option value="">{t('common.all', 'All')}</option>
                                            <option value="agent">{t('sipCallsPage.filterAgent', 'Agent')}</option>
                                            <option value="system">{t('sipCallsPage.filterExternal', 'External')}</option>
                                            <option value="internal">{t('sipCallsPage.filterInternal', 'Internal')}</option>
                                        </Select>
                                    </label>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {t('sipCallsPage.filterHangupBy', 'Hangup By')}
                                        <Select value={selectedHangupBy} onChange={e => setSelectedHangupBy(e.target.value)}
                                            style={{ width: '100%', padding: '0.35rem', fontSize: '0.8rem', marginTop: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                            <option value="">{t('common.all', 'All')}</option>
                                            <option value="customer">👤 {t('sipCallsPage.hangupCustomer', 'Customer')}</option>
                                            <option value="agent">🎧 {t('sipCallsPage.hangupAgent', 'Agent')}</option>
                                            <option value="system">⚙️ {t('sipCallsPage.hangupSystem', 'System')}</option>
                                        </Select>
                                    </label>
                                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--glass-border)', paddingTop: '0.5rem' }}>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                            <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />{t('sipCallsPage.duration', 'Duration')} (s)
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <Input type="number" placeholder="Min" value={minDuration} onChange={e => setMinDuration(e.target.value)}
                                                min="0" style={{ width: '80px', padding: '0.35rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                                            <span style={{ color: 'var(--text-muted)' }}>~</span>
                                            <Input type="number" placeholder="Max" value={maxDuration} onChange={e => setMaxDuration(e.target.value)}
                                                min="0" style={{ width: '80px', padding: '0.35rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                                        </div>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--glass-border)', paddingTop: '0.5rem' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                                            {t('sipCallsPage.searchKeywords', 'Search Keywords')}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.7rem' }}>
                                            {[
                                                { kw: 'in / out', desc: t('sipCallsPage.filterDirection', 'Direction') },
                                                { kw: 'agent / ext / int', desc: t('sipCallsPage.filterCallType', 'Call Type') },
                                                { kw: 'hba / hbc / hbs', desc: t('sipCallsPage.filterHangupBy', 'Hangup By') },
                                                { kw: 'cancel / busy / error / auth / timeout', desc: t('sipCallsPage.filterStatus', 'Status') },
                                            ].map(item => (
                                                <span key={item.kw} style={{
                                                    padding: '2px 6px', borderRadius: '4px',
                                                    background: 'rgba(99,102,241,0.08)', color: 'var(--text-secondary)',
                                                    display: 'inline-flex', gap: '3px', alignItems: 'center',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    <code style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.7rem' }}>{item.kw}</code>
                                                    <span style={{ opacity: 0.7 }}>→ {item.desc}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.5rem' }}>
                                        <Button onClick={clearAllFilters}
                                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                            {t('common.reset', 'Reset')}
                                        </Button>
                                        <Button onClick={() => setShowFilterPanel(false)}
                                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>
                                            {t('common.apply', 'Apply')}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Total count */}
                    <span className="text-secondary" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {t('sipCallsPage.totalCalls', { count: total })}
                    </span>

                    {/* Right side: column toggle, export, refresh */}
                    <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }} ref={columnMenuRef}>
                        <MotionButton
                            className={`btn btn-sm ${showColumnMenu ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setShowColumnMenu(!showColumnMenu)}
                            title="Columns"
                        >
                            <Settings size={16} />
                        </MotionButton>

                        {showColumnMenu && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem',
                                background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                                borderRadius: 'var(--radius-md)', padding: '0.5rem',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50,
                                minWidth: '200px'
                            }}>
                                <div style={{ padding: '0.5rem', fontWeight: 600, borderBottom: '1px solid var(--glass-border)', marginBottom: '0.5rem' }}>
                                    {t('sipCallsPage.toggleColumns')}
                                </div>
                                {['talk_time', 'from_domain', 'to_domain', 'direction'].map(col => (
                                    <div key={col} className="dropdown-item" onClick={() => toggleColumn(col)}
                                        style={{ padding: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderRadius: '4px', background: visibleColumns.has(col) ? 'rgba(0,0,0,0.03)' : 'transparent' }}>
                                        {t(`sipCallsPage.${col === 'talk_time' ? 'talkTime' : col === 'from_domain' ? 'fromDomain' : col === 'to_domain' ? 'toDomain' : 'direction'}`, col)}
                                        {visibleColumns.has(col) && <Check size={16} color="var(--primary)" />}
                                    </div>
                                ))}
                            </div>
                        )}

                        <ExportButton
                            label={t('common.exportCSV', 'Export CSV')}
                            disabled={filteredCalls.length === 0}
                            onExport={async () => {
                                try {
                                    // 按当前条件向后端请求全量数据
                                    const parsed = parseSearchTokens(debouncedSearch);
                                    const exportParams = new URLSearchParams();
                                    exportParams.set('limit', '10000');
                                    exportParams.set('offset', '0');
                                    if (selectedGroupId) exportParams.set('groupIds', selectedGroupId);
                                    if (selectedStatus || parsed.kwStatus) exportParams.set('status', selectedStatus || parsed.kwStatus || '');
                                    if (selectedDirection || parsed.kwDirection) exportParams.set('direction', selectedDirection || parsed.kwDirection || '');
                                    if (selectedCallType || parsed.kwCallType) exportParams.set('callType', selectedCallType || parsed.kwCallType || '');
                                    if (selectedHangupBy || parsed.kwHangupBy) exportParams.set('hangupBy', selectedHangupBy || parsed.kwHangupBy || '');
                                    if (parsed.textSearch) exportParams.set('search', parsed.textSearch);
                                    if (startDate) exportParams.set('startDate', startDate);
                                    if (endDate) exportParams.set('endDate', endDate);
                                    if (minDuration) exportParams.set('minDuration', minDuration);
                                    if (maxDuration) exportParams.set('maxDuration', maxDuration);
                                    exportParams.set('sortOrder', sortOrder);

                                    const res = await api.get(`/platform/calls?${exportParams.toString()}`);
                                    const allData: Call[] = res.data?.data || [];

                                    const cols: ExportColumn<Call>[] = [
                                        { key: 'timestamp', label: t('calls.time', 'Time'), format: r => formatToLocalTime(r.timestamp) },
                                        { key: 'duration', label: t('calls.duration', 'Duration'), format: r => formatDuration(r.duration) },
                                        { key: 'duration', label: t('sipCallsPage.talkTime', 'Talk Time'), format: r => { const s = getTalkTimeSec(r); return s !== null ? formatDuration(s) : '-'; } },
                                        { key: 'caller', label: t('calls.from', 'From') },
                                        { key: 'callee', label: t('calls.to', 'To') },
                                        { key: 'from_domain', label: t('calls.fromDomain', 'From Domain') },
                                        { key: 'to_domain', label: t('calls.toDomain', 'To Domain') },
                                        { key: 'direction', label: t('calls.direction', 'Direction'), format: r => r.call_type || r.direction || '' },
                                        { key: 'last_status', label: t('calls.status', 'Status'), format: r => `${r.last_status} ${r.last_method}` },
                                        { key: 'call_id', label: t('calls.callId', 'Call-ID') },
                                        { key: 'hangup_by', label: t('sipCallsPage.hangupBy', 'Hangup By'), format: r => r.hangup_by || '' },
                                        { key: 'disconnect_reason', label: t('sipCallsPage.disconnectReason', 'Disconnect Reason'), format: r => r.disconnect_reason || '' },

                                    ];
                                    exportToCSV(allData, cols, exportFilename('calls'));
                                } catch (err) {
                                    console.error('Failed to export calls:', err);
                                }
                            }}
                        />

                        <MotionButton onClick={fetchCalls}>
                            {t('sipCallsPage.refresh')}
                        </MotionButton>
                    </div>
                </div>

                {/* Row 2: Active Filter Chips */}
                {activeFilterCount > 0 && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem', alignItems: 'center' }}>
                        {selectedGroupId && <Badge style={{ cursor: 'pointer', gap: '4px' }} onClick={() => setSelectedGroupId('')}>{t('sipCallsPage.filterGroupShort', 'Group')}: {groups.find(g => g._id === selectedGroupId)?.name} <X size={12} /></Badge>}
                        {selectedStatus && <Badge style={{ cursor: 'pointer', gap: '4px' }} onClick={() => setSelectedStatus('')}>{t('sipCallsPage.filterStatus', 'Status')}: {selectedStatus} <X size={12} /></Badge>}
                        {selectedDirection && <Badge style={{ cursor: 'pointer', gap: '4px' }} onClick={() => setSelectedDirection('')}>{t('sipCallsPage.filterDirShort', 'Dir')}: {selectedDirection} <X size={12} /></Badge>}
                        {selectedCallType && <Badge style={{ cursor: 'pointer', gap: '4px' }} onClick={() => setSelectedCallType('')}>{t('sipCallsPage.filterCallType', 'Type')}: {selectedCallType} <X size={12} /></Badge>}
                        {selectedHangupBy && <Badge style={{ cursor: 'pointer', gap: '4px' }} onClick={() => setSelectedHangupBy('')}>{t('sipCallsPage.hangupPrefix', 'Hangup')}: {selectedHangupBy} <X size={12} /></Badge>}
                        {startDate && <Badge style={{ cursor: 'pointer', gap: '4px' }} onClick={() => setStartDate('')}>{t('common.from', 'From')}: {startDate} <X size={12} /></Badge>}
                        {endDate && <Badge style={{ cursor: 'pointer', gap: '4px' }} onClick={() => setEndDate('')}>{t('common.to', 'To')}: {endDate} <X size={12} /></Badge>}
                        {minDuration && <Badge style={{ cursor: 'pointer', gap: '4px' }} onClick={() => setMinDuration('')}>≥{minDuration}s <X size={12} /></Badge>}
                        {maxDuration && <Badge style={{ cursor: 'pointer', gap: '4px' }} onClick={() => setMaxDuration('')}>≤{maxDuration}s <X size={12} /></Badge>}
                        <span style={{ fontSize: '0.75rem', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }} onClick={clearAllFilters}>{t('common.clearAll', 'Clear all')}</span>
                    </div>
                )}

                {/* URL drill-down indicators */}
                {(filterEmotion || filterStatus) && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                        {filterEmotion && <Badge>{t('sipCallsPage.emotionFilter', { emotion: filterEmotion })}</Badge>}
                        {filterStatus && <Badge>{t('sipCallsPage.statusFilter', { status: filterStatus })}</Badge>}
                    </div>
                )}
            </div>

            {loading ? (
                <div>{t('sipCallsPage.loading')}</div>
            ) : (
                <div className="glass-panel" style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)' }}>
                    <Table className="data-table">
                        <TableHeader>
                            <TableRow>
                                <TableHead style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        {t('sipCallsPage.time')}
                                        {sortOrder === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                                    </div>
                                </TableHead>
                                <TableHead>{t('sipCallsPage.duration')}</TableHead>
                                {visibleColumns.has('talk_time') && <TableHead>{t('sipCallsPage.talkTime', 'Talk Time')}</TableHead>}
                                {visibleColumns.has('from_domain') && <TableHead>{t('sipCallsPage.fromDomain')}</TableHead>}
                                {visibleColumns.has('to_domain') && <TableHead>{t('sipCallsPage.toDomain')}</TableHead>}
                                <TableHead>{t('sipCallsPage.from')}</TableHead>
                                <TableHead>{t('sipCallsPage.to')}</TableHead>
                                {visibleColumns.has('direction') && <TableHead>{t('sipCallsPage.direction', 'Direction')}</TableHead>}
                                <TableHead>{t('sipCallsPage.status')}</TableHead>
                                <TableHead>{t('sipCallsPage.hangupBy', 'Hangup By')}</TableHead>
                                <TableHead>{t('sipCallsPage.callId')}</TableHead>

                                <TableHead>{t('sipCallsPage.action')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredCalls.map(call => {
                                return (
                                    <TableRow key={call.call_id}>
                                        <TableCell>
                                            {formatToLocalTime(call.timestamp)}
                                        </TableCell>
                                        <TableCell className="text-mono">
                                            {formatDuration(call.duration)}
                                        </TableCell>
                                        {visibleColumns.has('talk_time') && (
                                            <TableCell className="text-mono">
                                                {(() => { const s = getTalkTimeSec(call); return s !== null ? formatDuration(s) : '-'; })()}
                                            </TableCell>
                                        )}
                                        {visibleColumns.has('from_domain') && (
                                            <TableCell>
                                                <Badge>{call.from_domain || '-'}</Badge>
                                            </TableCell>
                                        )}
                                        {visibleColumns.has('to_domain') && (
                                            <TableCell>
                                                <Badge>{call.to_domain || '-'}</Badge>
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            <div className="flex items-center gap-sm">
                                                <PhoneOutgoing size={14} color="var(--primary)" />
                                                {call.caller}
                                                {call.call_type === 'system_inbound' && (
                                                    <span title={t('sipCallsPage.labelTrunk', 'Trunk')} style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>📞 {t('sipCallsPage.labelTrunk', 'Trunk')}</span>
                                                )}
                                                {call.call_type === 'system_outbound' && (
                                                    <span title={t('sipCallsPage.labelSystem', 'System')} style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(107,114,128,0.1)', color: '#6B7280' }}>🏢 {t('sipCallsPage.labelSystem', 'System')}</span>
                                                )}
                                                {call.call_type === 'internal' && (
                                                    <span title={t('sipCallsPage.labelAgent', 'Agent')} style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>🎧 {t('sipCallsPage.labelAgent', 'Agent')}</span>
                                                )}
                                                {call.call_type?.startsWith('agent') && call.agent_number === call.caller && (
                                                    <span title={t('sipCallsPage.labelAgent', 'Agent')} style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>🎧 {t('sipCallsPage.labelAgent', 'Agent')}</span>
                                                )}
                                                {call.call_type?.startsWith('agent') && call.agent_number !== call.caller && (
                                                    <span title={t('sipCallsPage.labelTrunk', 'Trunk')} style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>📞 {t('sipCallsPage.labelTrunk', 'Trunk')}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-sm">
                                                <PhoneIncoming size={14} color="var(--success)" />
                                                {call.callee}
                                                {call.call_type === 'system_inbound' && (
                                                    <span title={t('sipCallsPage.labelDID', 'DID')} style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>📥 {t('sipCallsPage.labelDID', 'DID')}</span>
                                                )}
                                                {call.call_type === 'system_outbound' && (
                                                    <span title={t('sipCallsPage.labelTrunk', 'Trunk')} style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>📞 {t('sipCallsPage.labelTrunk', 'Trunk')}</span>
                                                )}
                                                {call.call_type === 'internal' && (
                                                    <span title={t('sipCallsPage.labelAgent', 'Agent')} style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>🎧 {t('sipCallsPage.labelAgent', 'Agent')}</span>
                                                )}
                                                {call.call_type?.startsWith('agent') && call.agent_number === call.callee && (
                                                    <span title={t('sipCallsPage.labelAgent', 'Agent')} style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>🎧 {t('sipCallsPage.labelAgent', 'Agent')}</span>
                                                )}
                                                {call.call_type?.startsWith('agent') && call.agent_number !== call.callee && (
                                                    <span title={t('sipCallsPage.labelTrunk', 'Trunk')} style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>📞 {t('sipCallsPage.labelTrunk', 'Trunk')}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        {visibleColumns.has('direction') && (
                                            <TableCell>
                                                {call.call_type?.includes('inbound') ? (
                                                    <Badge variant="success" style={{ gap: '4px' }}>
                                                        <PhoneIncoming size={12} /> IN
                                                    </Badge>
                                                ) : call.call_type?.includes('outbound') ? (
                                                    <Badge style={{ gap: '4px', background: 'var(--primary-light, rgba(99,102,241,0.1))', color: 'var(--primary)', borderColor: 'rgba(99,102,241,0.2)' }}>
                                                        <PhoneOutgoing size={12} /> OUT
                                                    </Badge>
                                                ) : call.call_type === 'internal' ? (
                                                    <Badge style={{ gap: '4px' }}>
                                                        <PhoneIncoming size={12} /> INT
                                                    </Badge>
                                                ) : (
                                                    <Badge>-</Badge>
                                                )}
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            {(() => {
                                                // High-level Semantic Grouping to prevent redundancy with Hangup By column
                                                let displayString = '-';
                                                let badgeVariant: 'default' | 'success' | 'warning' | 'danger' | 'info' = 'default';

                                                if (call.last_method === 'completed') {
                                                    const reason = call.disconnect_reason || '';

                                                    if (reason === 'CANCEL') {
                                                        displayString = t('sipCallsPage.statusCancelled', 'Cancelled');
                                                        badgeVariant = 'warning';
                                                    } else if (reason.includes('486') || reason.includes('603') || reason.includes('Busy')) {
                                                        // 486 Busy / 603 Declined (防骚扰挂断/占线/拒接均属于触达未果)
                                                        displayString = t('sipCallsPage.statusBusy', 'Busy');
                                                        badgeVariant = 'warning';
                                                    } else if (reason.match(/[456]\d{2}/) || reason === 'TIMEOUT') {
                                                        // 包含 4xx(除去486), 5xx, 6xx(除去603) 视为系统或技术级别事故
                                                        displayString = t('sipCallsPage.statusCallError', 'Call Error');
                                                        badgeVariant = 'danger';
                                                    } else if (!call.call_answered) {
                                                        // 既没异常错误码，且完全没接通过，纯响铃超时
                                                        displayString = t('sipCallsPage.statusNoAnswer', 'No Answer');
                                                        badgeVariant = 'warning';
                                                    } else {
                                                        displayString = t('sipCallsPage.statusCompleted', 'Completed');
                                                        badgeVariant = 'success';
                                                    }
                                                } else {
                                                    displayString = call.last_method || '-';
                                                    badgeVariant = 'info';
                                                    if (displayString === 'active') badgeVariant = 'success';
                                                }

                                                return (
                                                    <Badge variant={badgeVariant as 'default' | 'success' | 'warning' | 'danger' | 'info'} style={{ fontWeight: 600 }}>
                                                        {displayString}
                                                    </Badge>
                                                );
                                            })()}
                                        </TableCell>
                                        <TableCell>
                                            {call.hangup_by === 'customer' ? (
                                                <Badge style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6', borderColor: 'rgba(59,130,246,0.2)', gap: '4px' }}>
                                                    👤 {t('sipCallsPage.hangupCustomer', 'Customer')}
                                                    <code style={{ fontSize: '0.6rem', opacity: 0.7, fontWeight: 600 }}>HBC</code>
                                                </Badge>
                                            ) : call.hangup_by === 'agent' ? (
                                                <Badge variant="success" style={{ gap: '4px' }}>
                                                    🎧 {t('sipCallsPage.hangupAgent', 'Agent')}
                                                    <code style={{ fontSize: '0.6rem', opacity: 0.7, fontWeight: 600 }}>HBA</code>
                                                </Badge>
                                            ) : call.hangup_by === 'system' ? (
                                                <Badge variant="warning" style={{ gap: '4px' }}>
                                                    ⚙️ {t('sipCallsPage.hangupSystem', 'System')}
                                                    <code style={{ fontSize: '0.6rem', opacity: 0.7, fontWeight: 600 }}>HBS</code>
                                                </Badge>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                                            )}
                                            {call.disconnect_reason && (
                                                <span style={{
                                                    fontSize: '0.6rem', padding: '1px 5px',
                                                    borderRadius: '3px', marginLeft: '4px',
                                                    background: call.disconnect_reason === 'CANCEL'
                                                        ? 'rgba(239,68,68,0.1)' : 'rgba(107,114,128,0.08)',
                                                    color: call.disconnect_reason === 'CANCEL'
                                                        ? '#EF4444' : 'var(--text-muted)',
                                                    fontWeight: 600, letterSpacing: '0.02em',
                                                }}>
                                                    {call.disconnect_reason.includes('timeout')
                                                        ? 'TIMEOUT' : call.disconnect_reason}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Button
                                                    onClick={() => { copyToClipboard(call.call_id); setCopiedId(call.call_id); setTimeout(() => setCopiedId(null), 1500); }}
                                                    title={t('sipCallsPage.copied', 'Copy')}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center', color: copiedId === call.call_id ? 'var(--success)' : 'var(--text-muted)' }}
                                                >
                                                    {copiedId === call.call_id ? <Check size={12} /> : <Copy size={12} />}
                                                </Button>
                                                <span title={call.call_id}>{call.call_id.slice(0, 8)}…</span>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex gap-sm">
                                                <MotionButton
                                                    variant="ghost"
                                                    size="icon"

                                                    onClick={() => setSelectedCallId(call.call_id)}
                                                    title={t('sipCallsPage.callDetails')}
                                                >
                                                    <Info size={14} />
                                                </MotionButton>

                                                <MotionButton
                                                    variant="ghost"
                                                    size="icon"

                                                    onClick={() => setSelectedAnalysisCallId(call.call_id)}
                                                    title={t('sipCallsPage.callAnalysis')}
                                                >
                                                    <BarChart3 size={14} className="text-primary" />
                                                </MotionButton>

                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    {filteredCalls.length === 0 && (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {t('sipCallsPage.noCalls')}
                        </div>
                    )}

                    {/* Pagination */}
                    {total > PAGE_SIZE && (
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.75rem 1rem', paddingRight: '4rem', borderTop: '1px solid var(--glass-border)'
                        }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                {t('common.showing', 'Showing')} {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} {t('common.of', 'of')} {total}
                            </span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <MotionButton

                                    onClick={() => setPage(p => Math.max(0, p - 1))}
                                    disabled={page === 0}
                                >
                                    <ChevronLeft size={14} />
                                </MotionButton>
                                <span style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                    {page + 1} / {totalPages}
                                </span>
                                <MotionButton

                                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                    disabled={page >= totalPages - 1}
                                >
                                    <ChevronRight size={14} />
                                </MotionButton>
                            </div>
                        </div>
                    )}
                </div>
            )
            }

            <GlassModal
                open={!!selectedCallId}
                onOpenChange={(open) => !open && setSelectedCallId(null)}
                title={t('sipCallsPage.callDetails')}
                style={{ maxWidth: '800px' }}
            >
                {selectedCallId && (
                    <CallDetails
                        callId={selectedCallId}
                        onOpenSipDialog={() => window.open(`/sip-diagram/${selectedCallId}`, '_blank', 'width=1200,height=800')}
                        demo={demoMode}
                    />
                )}
            </GlassModal>



            <GlassModal
                open={!!selectedAnalysisCallId}
                onOpenChange={(open) => { if (!open) setSelectedAnalysisCallId(null); }}
                title={t('sipCallsPage.callAnalysis')}
                className="w-full"
                style={{ maxWidth: '1060px' }}
            >
                {selectedAnalysisCallId && (
                    <CallAnalysisModal
                        callId={selectedAnalysisCallId}
                        demo={demoMode}
                    />
                )}
            </GlassModal>
        </div >
    );
};

export default SipCalls;
