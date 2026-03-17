import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { copyToClipboard } from '../utils/clipboard';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import {
    ClipboardCheck, List, Sparkles, Settings2, ChevronLeft, ChevronRight,
    Wand2, RotateCw, Loader2, BarChart3, TrendingUp, Users, ShieldCheck, MessageSquare,
    Copy, Check
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import '../styles/quality-inspector.css';
import { useDemoMode } from '../hooks/useDemoMode';
import toast from 'react-hot-toast';
import ExportButton from '../components/ExportButton';
import { exportToCSV, exportFilename } from '../utils/export-csv';
import QIScoreDrawer, { type ScoreDetail } from '../components/qi/QIScoreDrawer';
import QIConfirmDialog from '../components/qi/QIConfirmDialog';
import { Button } from '../components/ui/button';

import {
    getMockQIScores, getMockQIStats, getMockQIChecklists,
    getMockQITemplates, getMockQITemplateRules, getMockQIStatus,
    getMockQIAnalytics, getMockQIScoreDetail
} from '../services/mock-data';

// ── Types ──

interface QIScore {
    timestamp: string;
    call_id: string;
    client_id: string;
    agent_id: string;
    overall_score: number;
    sentiment: string;
    summary: string;
    duration_ms: number;
}

interface QIRule {
    id: string;
    name: string;
    category: string;
    type: string;
    weight: number;
    config: any;
    enabled: boolean;
}

interface QIChecklist {
    _id: string;
    clientId: string;
    name: string;
    rules: QIRule[];
    isDefault: boolean;
    industry?: string;
}

interface QITemplate {
    id: string;
    name: string;
    nameZh: string;
    icon: string;
    ruleCount: number;
}

interface QIStats {
    stats: {
        total_inspections: number;
        avg_score: number;
        min_score: number;
        max_score: number;
        excellent_count: number;
        good_count: number;
        poor_count: number;
        avg_duration_ms: number;
    };
    trend: Array<{ date: string; inspections: number; avg_score: number }>;
    agents: Array<{ agent_id: string; inspections: number; avg_score: number }>;
}

interface QIStatus {
    enabled: boolean;
    maxConcurrent: number;
    scheduleEnabled: boolean;
    scheduleStart: string;
    scheduleEnd: string;
    skipIfNoTranscript: boolean;
    queue: { pending: number; processing: number; completed: number; failed: number };
}

// ── Helpers ──

function scoreClass(s: number): string {
    if (s >= 80) return 'qi-score-excellent';
    if (s >= 60) return 'qi-score-good';
    return 'qi-score-poor';
}

function typeIcon(t: string): string {
    if (t === 'regex') return '⚙️';
    if (t === 'keyword') return '🔑';
    return '🤖';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function categoryLabel(c: string, t: any): string {
    if (c === 'compliance') return t('quality.rules.compliance', 'Compliance');
    if (c === 'skill') return t('quality.rules.skill', 'Skill');
    return t('quality.rules.semantic', 'Semantic');
}

function normalizeWeights(rules: QIRule[], editedIdx: number, newWeight: number): QIRule[] {
    const clamped = Math.max(0, Math.min(100, newWeight));
    const others = rules.filter((_, i) => i !== editedIdx && rules[i].enabled);
    const remaining = 100 - clamped;
    const currentOthersSum = others.reduce((s, r) => s + r.weight, 0);
    return rules.map((r, i) => {
        if (i === editedIdx) return { ...r, weight: clamped };
        if (!r.enabled) return r;
        return {
            ...r,
            weight: currentOthersSum > 0
                ? Math.round(remaining * r.weight / currentOthersSum)
                : Math.round(remaining / others.length)
        };
    });
}

// ── Component ──

const QualityInspector: React.FC = () => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const [searchParams, setSearchParams] = useSearchParams();
    const validTabs = ['scores', 'rules', 'analytics', 'config'] as const;
    type TabType = typeof validTabs[number];
    const rawTab = searchParams.get('tab');
    const tab: TabType = validTabs.includes(rawTab as TabType) ? (rawTab as TabType) : 'scores';

    const setTab = (newTab: TabType) => {
        setSearchParams({ tab: newTab }, { replace: true });
    };

    return (
        <div className="qi-page">
            <div className="qi-header">
                <h1><ClipboardCheck size={24} /> {t('quality.title', 'Quality Inspector')}</h1>
            </div>

            {/* Tabs */}
            <div className="qi-tabs" role="tablist">
                <Button className={`qi-tab ${tab === 'scores' ? 'active' : ''}`} onClick={() => setTab('scores')}
                    role="tab" aria-selected={tab === 'scores'}>
                    <List size={16} /> {t('quality.tabs.scores', 'Scores')}
                </Button>
                <Button className={`qi-tab ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')}
                    role="tab" aria-selected={tab === 'rules'}>
                    <Sparkles size={16} /> {t('quality.tabs.rules', 'Rules')}
                </Button>
                <Button className={`qi-tab ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}
                    role="tab" aria-selected={tab === 'analytics'}>
                    <BarChart3 size={16} /> {t('quality.tabs.analytics', 'Analytics')}
                </Button>
                <Button className={`qi-tab ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}
                    role="tab" aria-selected={tab === 'config'}>
                    <Settings2 size={16} /> {t('quality.tabs.config', 'Config')}
                </Button>
            </div>

            {tab === 'scores' && <ScoresTab demoMode={demoMode} />}
            {tab === 'rules' && <RulesTab demoMode={demoMode} />}
            {tab === 'analytics' && <AnalyticsTab demoMode={demoMode} />}
            {tab === 'config' && <ConfigTab demoMode={demoMode} />}
        </div>
    );
};

// ═══════════════════════════════════════
// Scores Tab
// ═══════════════════════════════════════

const ScoresTab: React.FC<{ demoMode: boolean }> = ({ demoMode }) => {
    const { t } = useTranslation();
    const [scores, setScores] = useState<QIScore[]>([]);
    const [stats, setStats] = useState<QIStats['stats'] | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [drawerDetail, setDrawerDetail] = useState<ScoreDetail | null>(null);
    // Phase 3: Filters
    const [filterAgent, setFilterAgent] = useState('');
    const [filterMinScore, setFilterMinScore] = useState('');
    const [filterMaxScore, setFilterMaxScore] = useState('');
    const [filterSentiment, setFilterSentiment] = useState('');
    // Phase 6: Sorting
    const [sortField, setSortField] = useState<'timestamp' | 'overall_score' | 'duration_ms'>('timestamp');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    // Phase 4D-1: Debounce
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [debouncedAgent, setDebouncedAgent] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (demoMode) {
                const [scoresRes, statsRes] = await Promise.all([
                    getMockQIScores(page, 20),
                    getMockQIStats(),
                ]);
                let data = scoresRes.data.scores || [];
                // Client-side filter for demo
                if (debouncedAgent) data = data.filter((s: any) => (s.agent_id || '').toLowerCase().includes(debouncedAgent.toLowerCase()));
                if (filterMinScore) data = data.filter((s: any) => Number(s.overall_score) >= Number(filterMinScore));
                if (filterMaxScore) data = data.filter((s: any) => Number(s.overall_score) <= Number(filterMaxScore));
                if (filterSentiment) data = data.filter((s: any) => s.sentiment === filterSentiment);
                setScores(data);
                setTotalPages(scoresRes.data.pagination?.totalPages || 1);
                setStats(statsRes.data.stats || null);
            } else {
                const params = new URLSearchParams({ page: String(page), limit: '20' });
                if (debouncedAgent) params.set('agentId', debouncedAgent);
                if (filterMinScore) params.set('minScore', filterMinScore);
                if (filterMaxScore) params.set('maxScore', filterMaxScore);
                if (filterSentiment) params.set('sentiment', filterSentiment);
                const [scoresRes, statsRes] = await Promise.all([
                    api.get(`/qi/scores?${params.toString()}`),
                    api.get('/qi/stats?days=7'),
                ]);
                setScores(scoresRes.data.scores || []);
                setTotalPages(scoresRes.data.pagination?.totalPages || 1);
                setStats(statsRes.data.stats || null);
            }
        } catch (err) {
            console.error('Failed to load QI data:', err);
        } finally {
            setLoading(false);
        }
    }, [page, demoMode, debouncedAgent, filterMinScore, filterMaxScore, filterSentiment]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleRowClick = async (callId: string) => {
        setDrawerOpen(true);
        setDrawerLoading(true);
        setDrawerDetail(null);
        try {
            if (demoMode) {
                const res = await getMockQIScoreDetail(callId);
                setDrawerDetail(res.data);
            } else {
                const res = await api.get(`/qi/scores/${callId}`);
                setDrawerDetail(res.data);
            }
        } catch (err) {
            console.error('Failed to load score detail:', err);
        } finally {
            setDrawerLoading(false);
        }
    };

    return (
        <>
            {/* KPI Cards */}
            {stats && (
                <div className="qi-kpi-grid">
                    <div className="qi-kpi-card glass-panel">
                        <span className="qi-kpi-label">{t('quality.scores.totalInspections')}</span>
                        <span className="qi-kpi-value">{stats.total_inspections?.toLocaleString() || 0}</span>
                        <span className="qi-kpi-sub">{t('quality.scores.last7days')}</span>
                    </div>
                    <div className="qi-kpi-card glass-panel">
                        <span className="qi-kpi-label">{t('quality.scores.avgScore')}</span>
                        <span className="qi-kpi-value">{stats.avg_score || 0}</span>
                        <span className="qi-kpi-sub">{t('quality.scores.minMax', { min: stats.min_score || 0, max: stats.max_score || 0 })}</span>
                    </div>
                    <div className="qi-kpi-card glass-panel">
                        <span className="qi-kpi-label">{t('quality.scores.excellenceRate')}</span>
                        <span className="qi-kpi-value">
                            {stats.total_inspections > 0
                                ? ((Number(stats.excellent_count) / Number(stats.total_inspections)) * 100).toFixed(1)
                                : '0.0'}%
                        </span>
                        <span className="qi-kpi-sub">{t('quality.scores.callsAbove80', { count: stats.excellent_count || 0 })}</span>
                    </div>
                    <div className="qi-kpi-card glass-panel">
                        <span className="qi-kpi-label">{t('quality.scores.avgDuration')}</span>
                        <span className="qi-kpi-value">{stats.avg_duration_ms ? `${(Number(stats.avg_duration_ms) / 1000).toFixed(1)}s` : '—'}</span>
                        <span className="qi-kpi-sub">{t('quality.scores.inclLlm')}</span>
                    </div>
                </div>
            )}

            {/* Scores Table */}
            <div className="qi-panel glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0 }}><List size={16} /> {t('quality.scores.recentInspections')}</h3>
                    <ExportButton
                        label={t('common.exportCSV', 'Export CSV')}
                        disabled={scores.length === 0}
                        onExport={() => {
                            exportToCSV(scores, [
                                { key: 'timestamp', label: t('quality.time', 'Time'), format: r => new Date(r.timestamp).toLocaleString() },
                                { key: 'call_id', label: t('quality.callId', 'Call ID') },
                                { key: 'agent_id', label: t('quality.agent', 'Agent'), format: r => r.agent_id || '' },
                                { key: 'overall_score', label: t('quality.score', 'Score'), format: r => Number(r.overall_score).toFixed(1) },
                                { key: 'sentiment', label: t('quality.sentiment', 'Sentiment'), format: r => r.sentiment || '' },
                                { key: 'duration_ms', label: t('quality.durationMs', 'Duration (s)'), format: r => r.duration_ms ? (r.duration_ms / 1000).toFixed(1) : '' },
                                { key: 'summary', label: t('quality.summary', 'Summary'), format: r => r.summary || '' },
                            ], exportFilename('qi_scores'));
                        }}
                    />
                </div>
                {loading ? (
                    <div className="qi-loading">{t('quality.scores.loading')}</div>
                ) : scores.length === 0 ? (
                    <div className="qi-empty">
                        <div className="qi-empty-icon">📋</div>
                        <div>{t('quality.scores.noInspections')}</div>
                    </div>
                ) : (
                    <>
                        {/* Phase 3: Filter Bar */}
                        <div className="qi-filter-bar">
                            <input
                                className="qi-filter-input"
                                type="text"
                                placeholder={t('quality.agent')}
                                value={filterAgent}
                                onChange={e => {
                                    setFilterAgent(e.target.value);
                                    clearTimeout(debounceRef.current!);
                                    debounceRef.current = setTimeout(() => { setDebouncedAgent(e.target.value); setPage(1); }, 300);
                                }}
                            />
                            <input
                                className="qi-filter-input qi-filter-input-sm"
                                type="number"
                                placeholder="Min"
                                value={filterMinScore}
                                onChange={e => { setFilterMinScore(e.target.value); setPage(1); }}
                            />
                            <input
                                className="qi-filter-input qi-filter-input-sm"
                                type="number"
                                placeholder="Max"
                                value={filterMaxScore}
                                onChange={e => { setFilterMaxScore(e.target.value); setPage(1); }}
                            />
                            <Select
                                className="qi-filter-input"
                                value={filterSentiment}
                                onChange={e => { setFilterSentiment(e.target.value); setPage(1); }}
                            >
                                <option value="">{t('quality.sentiment')}</option>
                                <option value="positive">{t('quality.analytics.positive')}</option>
                                <option value="neutral">{t('quality.analytics.neutral')}</option>
                                <option value="negative">{t('quality.analytics.negative')}</option>
                            </Select>
                        </div>
                        <Table className="qi-table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="qi-th-sort" onClick={() => { setSortField('timestamp'); setSortOrder(o => sortField === 'timestamp' ? (o === 'asc' ? 'desc' : 'asc') : 'desc'); }}>
                                        {t('quality.time')} {sortField === 'timestamp' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                                    </TableHead>
                                    <TableHead>{t('quality.callId')}</TableHead>
                                    <TableHead>{t('quality.agent')}</TableHead>
                                    <TableHead className="qi-th-sort" onClick={() => { setSortField('overall_score'); setSortOrder(o => sortField === 'overall_score' ? (o === 'asc' ? 'desc' : 'asc') : 'desc'); }}>
                                        {t('quality.score')} {sortField === 'overall_score' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                                    </TableHead>
                                    <TableHead>{t('quality.sentiment')}</TableHead>
                                    <TableHead className="qi-th-sort" onClick={() => { setSortField('duration_ms'); setSortOrder(o => sortField === 'duration_ms' ? (o === 'asc' ? 'desc' : 'asc') : 'desc'); }}>
                                        {t('quality.durationMs')} {sortField === 'duration_ms' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[...scores].sort((a: any, b: any) => {
                                    const va = sortField === 'timestamp' ? new Date(a.timestamp).getTime() : Number(a[sortField]);
                                    const vb = sortField === 'timestamp' ? new Date(b.timestamp).getTime() : Number(b[sortField]);
                                    return sortOrder === 'asc' ? va - vb : vb - va;
                                }).map((s, i) => (
                                    <TableRow key={i} onClick={() => handleRowClick(s.call_id)} className="qi-row-clickable">
                                        <TableCell>{new Date(s.timestamp).toLocaleString()}</TableCell>
                                        <TableCell style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Button
                                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(s.call_id); setCopiedId(s.call_id); setTimeout(() => setCopiedId(null), 1500); }}
                                                    title={t('common.copy', 'Copy')}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center', color: copiedId === s.call_id ? 'var(--success)' : 'var(--text-muted)' }}
                                                >
                                                    {copiedId === s.call_id ? <Check size={12} /> : <Copy size={12} />}
                                                </Button>
                                                <span title={s.call_id}>{s.call_id?.slice(0, 8)}…</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{s.agent_id || '—'}</TableCell>
                                        <TableCell>
                                            <span className={`qi-score-badge ${scoreClass(s.overall_score)}`}
                                                aria-label={`${t('quality.score')}: ${Number(s.overall_score).toFixed(1)}`}>
                                                {Number(s.overall_score).toFixed(1)}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {s.summary && s.summary.includes('[Acoustic:') && (
                                                <span
                                                    style={{ color: '#ef4444', marginRight: '6px', cursor: 'help' }}
                                                    title={s.summary.slice(s.summary.indexOf('[Acoustic:'), s.summary.indexOf(']') + 1)}
                                                >
                                                    ⚠️
                                                </span>
                                            )}
                                            {s.sentiment || '—'}
                                        </TableCell>
                                        <TableCell>{s.duration_ms ? `${(s.duration_ms / 1000).toFixed(1)}s` : '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <div className="qi-pagination">
                            <Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                                <ChevronLeft size={14} />
                            </Button>
                            <span>{page} / {totalPages}</span>
                            <Button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                                <ChevronRight size={14} />
                            </Button>
                        </div>
                    </>
                )}
            </div>

            <QIScoreDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                detail={drawerDetail}
                loading={drawerLoading}
            />
        </>
    );
};

// ═══════════════════════════════════════
// Rules Tab
// ═══════════════════════════════════════

const RulesTab: React.FC<{ demoMode: boolean }> = ({ demoMode }) => {
    const { t } = useTranslation();
    const [checklists, setChecklists] = useState<QIChecklist[]>([]);
    const [templates, setTemplates] = useState<QITemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [genPrompt, setGenPrompt] = useState('');
    const [genResult, setGenResult] = useState<QIRule[] | null>(null);
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [templateRules, setTemplateRules] = useState<QIRule[] | null>(null);
    // Phase 4A: Editing state
    const [editingChecklist, setEditingChecklist] = useState<string | null>(null);
    const [editingRules, setEditingRules] = useState<QIRule[]>([]);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (demoMode) {
                const [clRes, tplRes] = await Promise.all([
                    getMockQIChecklists(),
                    getMockQITemplates(),
                ]);
                setChecklists(clRes.data || []);
                setTemplates(tplRes.data || []);
            } else {
                const [clRes, tplRes] = await Promise.all([
                    api.get('/qi/checklists'),
                    api.get('/qi/wizard/templates'),
                ]);
                setChecklists(clRes.data || []);
                setTemplates(tplRes.data || []);
            }
        } catch (err) {
            console.error('Failed to load QI rules:', err);
        } finally {
            setLoading(false);
        }
    }, [demoMode]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleGenerate = async () => {
        if (!genPrompt.trim()) return;
        setGenerating(true);
        try {
            const res = await api.post('/qi/checklists/generate', { description: genPrompt });
            setGenResult(res.data.rules || []);
            toast.success(t('quality.toast.generateSuccess'));
        } catch (err) {
            console.error('Failed to generate:', err);
            toast.error(t('quality.toast.generateFailed'));
        } finally {
            setGenerating(false);
        }
    };

    const handleSelectTemplate = async (id: string) => {
        setSelectedTemplate(id);
        try {
            if (demoMode) {
                const res = await getMockQITemplateRules(id);
                setTemplateRules(res.data.rules || []);
            } else {
                const res = await api.get(`/qi/wizard/templates/${id}`);
                setTemplateRules(res.data.rules || []);
            }
        } catch (err) {
            console.error('Failed to load template:', err);
        }
    };

    const handleSaveChecklist = async (rules: QIRule[], name: string) => {
        try {
            await api.post('/qi/checklists', {
                clientId: '000000000000000000000000', // Platform-level default
                name,
                rules,
                isDefault: true,
            });
            setGenResult(null);
            setTemplateRules(null);
            setSelectedTemplate(null);
            fetchData();
            toast.success(t('quality.toast.saveSuccess'));
        } catch (err) {
            console.error('Save failed:', err);
            toast.error(t('quality.toast.saveFailed'));
        }
    };

    const handleStartEdit = (cl: QIChecklist) => {
        setEditingChecklist(cl._id);
        setEditingRules(cl.rules.map(r => ({ ...r })));
    };

    const handleEditRuleField = (ruleIdx: number, field: keyof QIRule, value: any) => {
        setEditingRules(prev => {
            if (field === 'weight') {
                return normalizeWeights(prev, ruleIdx, Number(value));
            }
            return prev.map((r, i) => i === ruleIdx ? { ...r, [field]: value } : r);
        });
    };

    const handleSaveEdit = async (checklistId: string) => {
        setSaving(true);
        try {
            await api.put(`/qi/checklists/${checklistId}`, { rules: editingRules });
            setEditingChecklist(null);
            fetchData();
            toast.success(t('quality.toast.editSuccess'));
        } catch (err) {
            console.error('Edit failed:', err);
            toast.error(t('quality.toast.editFailed'));
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteChecklist = async (checklistId: string) => {
        try {
            await api.delete(`/qi/checklists/${checklistId}`);
            setDeleteConfirmId(null);
            fetchData();
            toast.success(t('quality.toast.deleteSuccess'));
        } catch (err) {
            console.error('Delete failed:', err);
            toast.error(t('quality.toast.deleteFailed'));
        }
    };

    const handleImportTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const content = event.target?.result as string;
                const templateData = JSON.parse(content);

                // Use a default clientId if none provided
                const clientId = '000000000000000000000000';

                await api.post('/qi/checklists/import', {
                    clientId,
                    template: templateData
                });

                toast.success(t('quality.toast.importSuccess', 'Template imported successfully!'));
                fetchData(); // Refresh checklist
            } catch (err: any) {
                console.error('Import failed:', err);
                toast.error(err.response?.data?.error || t('quality.toast.importFailed', 'Failed to import template. Ensure it is a valid JSON.'));
            } finally {
                // 重置file input
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };
        reader.readAsText(file);
    };

    if (loading) return <div className="qi-loading">{t('quality.scores.loading')}</div>;

    return (
        <>
            {/* Existing Checklists */}
            {checklists.length > 0 && (
                <div className="qi-panel glass-panel">
                    <h3><List size={16} /> {t('quality.rules.existingChecklists')}</h3>
                    {checklists.map(cl => (
                        <div key={cl._id} style={{ marginBottom: '1.5rem' }}>
                            <div className="qi-row" style={{ justifyContent: 'space-between' }}>
                                <div>
                                    <strong>{cl.name}</strong>
                                    {cl.isDefault && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--primary)' }}>{t('quality.rules.default')}</span>}
                                    {cl.industry && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>({cl.industry})</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('quality.rules.nRules', { count: cl.rules.length })}</span>
                                    {editingChecklist !== cl._id ? (
                                        <>
                                            <Button size="sm" className="qi- qi--sm" onClick={() => handleStartEdit(cl)}>{t('quality.rules.edit')}</Button>
                                            <Button variant="destructive" size="sm" className="qi- qi--sm qi---outline" onClick={() => setDeleteConfirmId(cl._id)}>{t('quality.rules.delete')}</Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button size="sm" className="qi- qi--sm qi--" onClick={() => handleSaveEdit(cl._id)} disabled={saving}>
                                                {saving ? '...' : t('quality.rules.confirm')}
                                            </Button>
                                            <Button size="sm" className="qi- qi--sm" onClick={() => setEditingChecklist(null)}>{t('quality.rules.cancel')}</Button>
                                        </>
                                    )}
                                </div>
                            </div>
                            {(editingChecklist === cl._id ? editingRules : cl.rules).map((rule, ruleIdx) => (
                                <div key={rule.id} className="qi-rule-card">
                                    <div className={`qi-rule-icon ${rule.type}`}>
                                        {typeIcon(rule.type)}
                                    </div>
                                    <div className="qi-rule-body">
                                        {editingChecklist === cl._id ? (
                                            <>
                                                <input
                                                    className="qi-edit-input"
                                                    value={rule.name}
                                                    onChange={e => handleEditRuleField(ruleIdx, 'name', e.target.value)}
                                                />
                                                <div className="qi-rule-meta">
                                                    <span>{categoryLabel(rule.category, t)}</span>
                                                    <span>{rule.type.toUpperCase()}</span>
                                                    <label className="qi-edit-weight">
                                                        {t('quality.rules.weightLabel')}:
                                                        <input
                                                            type="number"
                                                            className="qi-edit-input qi-edit-input-sm"
                                                            min={0} max={100}
                                                            value={rule.weight}
                                                            onChange={e => handleEditRuleField(ruleIdx, 'weight', e.target.value)}
                                                        />%
                                                    </label>
                                                    <Button
                                                        className={`qi-btn qi-btn-xs ${rule.enabled ? 'qi-btn-enabled' : 'qi-btn-disabled-toggle'}`}
                                                        onClick={() => handleEditRuleField(ruleIdx, 'enabled', !rule.enabled)}
                                                    >
                                                        {rule.enabled ? t('quality.rules.enabled') : t('quality.rules.disabled')}
                                                    </Button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="qi-rule-name">{rule.name}</div>
                                                <div className="qi-rule-meta">
                                                    <span>{categoryLabel(rule.category, t)}</span>
                                                    <span>{rule.type.toUpperCase()}</span>
                                                    <span className="qi-rule-weight">{t('quality.rules.weight', { value: rule.weight })}</span>
                                                    <span style={{ color: rule.enabled ? '#10b981' : '#ef4444' }}>
                                                        {rule.enabled ? t('quality.rules.enabled') : t('quality.rules.disabled')}
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {/* Wizard: Industry Templates */}
            <div className="qi-panel glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                        <h3 style={{ margin: 0 }}><Sparkles size={16} /> {t('quality.rules.industryTemplates')}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {t('quality.rules.templateHint')}
                        </p>
                    </div>
                    <div>
                        <input
                            type="file"
                            accept=".json"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleImportTemplate}
                        />
                        <Button className="qi- qi--"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                            {t('quality.rules.importJson', 'Import JSON')}
                        </Button>
                    </div>
                </div>
                <div className="qi-templates-grid">
                    {templates.map(tpl => (
                        <div
                            key={tpl.id}
                            className={`qi-template-card ${selectedTemplate === tpl.id ? 'selected' : ''}`}
                            onClick={() => handleSelectTemplate(tpl.id)}
                        >
                            <div className="qi-template-icon">{tpl.icon}</div>
                            <div className="qi-template-name">{tpl.nameZh}</div>
                            <div className="qi-template-sub">{tpl.name} · {t('quality.rules.nRules', { count: tpl.ruleCount })}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Template Rules Preview */}
            {templateRules && (
                <div className="qi-panel glass-panel">
                    <h3>
                        {templates.find(tpl => tpl.id === selectedTemplate)?.icon}{' '}
                        {templates.find(tpl => tpl.id === selectedTemplate)?.name} — {t('quality.rules.rulePreview')}
                    </h3>
                    {templateRules.map(rule => (
                        <div key={rule.id} className="qi-rule-card">
                            <div className={`qi-rule-icon ${rule.type}`}>{typeIcon(rule.type)}</div>
                            <div className="qi-rule-body">
                                <div className="qi-rule-name">{rule.name}</div>
                                <div className="qi-rule-meta">
                                    <span>{categoryLabel(rule.category, t)}</span>
                                    <span>{rule.type.toUpperCase()}</span>
                                    <span className="qi-rule-weight">{t('quality.rules.weight', { value: rule.weight })}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    <div className="qi-row" style={{ marginTop: '1rem', gap: '0.75rem' }}>
                        <Button className="qi- qi--" onClick={() => handleSaveChecklist(templateRules, templates.find(tpl => tpl.id === selectedTemplate)?.name || 'Checklist')}>
                            {t('quality.rules.saveAsDefault')}
                        </Button>
                        <Button className="qi-" onClick={() => { setTemplateRules(null); setSelectedTemplate(null); }}>
                            {t('quality.rules.cancel')}
                        </Button>
                    </div>
                </div>
            )}

            {/* AI Generate */}
            <div className="qi-panel glass-panel">
                <h3><Wand2 size={16} /> {t('quality.rules.aiGenerate')}</h3>
                <div className="qi-generate-area">
                    <Textarea
                        value={genPrompt}
                        onChange={e => setGenPrompt(e.target.value)}
                        placeholder={t('quality.rules.generatePlaceholder')}
                    />
                </div>
                <Button className="qi- qi--"
                    disabled={generating || !genPrompt.trim()}
                    onClick={handleGenerate}
                >
                    {generating ? <><Loader2 size={16} className="spinning" /> {t('quality.rules.generating')}</> : <><Wand2 size={16} /> {t('quality.rules.generateRules')}</>}
                </Button>
            </div>

            {/* AI Generated Result */}
            {genResult && (
                <div className="qi-panel glass-panel">
                    <h3><Sparkles size={16} /> {t('quality.rules.aiResultCount', { count: genResult.length })}</h3>
                    {genResult.map(rule => (
                        <div key={rule.id} className="qi-rule-card">
                            <div className={`qi-rule-icon ${rule.type}`}>{typeIcon(rule.type)}</div>
                            <div className="qi-rule-body">
                                <div className="qi-rule-name">{rule.name}</div>
                                <div className="qi-rule-meta">
                                    <span>{categoryLabel(rule.category, t)}</span>
                                    <span>{rule.type.toUpperCase()}</span>
                                    <span className="qi-rule-weight">{t('quality.rules.weight', { value: rule.weight })}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    <div className="qi-row" style={{ marginTop: '1rem', gap: '0.75rem' }}>
                        <Button className="qi- qi--" onClick={() => handleSaveChecklist(genResult, 'AI Generated Checklist')}>
                            {t('quality.rules.saveAsDefault')}
                        </Button>
                        <Button className="qi-" onClick={() => setGenResult(null)}>{t('quality.rules.cancel')}</Button>
                    </div>
                </div>
            )}

            <QIConfirmDialog
                open={!!deleteConfirmId}
                title={t('quality.rules.confirmDelete')}
                message={t('quality.rules.confirmDeleteMsg')}
                variant="danger"
                confirmLabel={t('quality.rules.delete')}
                onConfirm={() => deleteConfirmId && handleDeleteChecklist(deleteConfirmId)}
                onCancel={() => setDeleteConfirmId(null)}
            />
        </>
    );
};

// ═══════════════════════════════════════
// Config Tab
// ═══════════════════════════════════════

const ConfigTab: React.FC<{ demoMode: boolean }> = ({ demoMode }) => {
    const { t } = useTranslation();
    const [status, setStatus] = useState<QIStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            if (demoMode) {
                const res = await getMockQIStatus();
                setStatus(res.data);
            } else {
                const res = await api.get('/qi/status');
                setStatus(res.data);
            }
        } catch (err) {
            console.error('Failed to load QI status:', err);
        } finally {
            setLoading(false);
        }
    }, [demoMode]);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    const updateConfig = async (updates: Partial<QIStatus>) => {
        if (!status) return;
        setSaving(true);
        try {
            const res = await api.put('/qi/config', updates);
            setStatus(s => s ? { ...s, ...res.data } : s);
            toast.success(t('quality.toast.configSuccess'));
        } catch (err) {
            console.error('Config update failed:', err);
            toast.error(t('quality.toast.configFailed'));
        } finally {
            setSaving(false);
        }
    };

    if (loading || !status) return <div className="qi-loading">{t('quality.scores.loading')}</div>;

    return (
        <>
            {/* Queue Status */}
            <div className="qi-status-grid">
                <div className="qi-status-item">
                    <div className="qi-status-label">{t('quality.config.pending')}</div>
                    <div className="qi-status-value" style={{ color: '#f59e0b' }}>{status.queue.pending}</div>
                </div>
                <div className="qi-status-item">
                    <div className="qi-status-label">{t('quality.config.processing')}</div>
                    <div className="qi-status-value" style={{ color: '#3b82f6' }}>{status.queue.processing}</div>
                </div>
                <div className="qi-status-item">
                    <div className="qi-status-label">{t('quality.config.completed')}</div>
                    <div className="qi-status-value" style={{ color: '#10b981' }}>{status.queue.completed}</div>
                </div>
                <div className="qi-status-item">
                    <div className="qi-status-label">{t('quality.config.failed')}</div>
                    <div className="qi-status-value" style={{ color: '#ef4444' }}>{status.queue.failed}</div>
                </div>
            </div>

            {/* Main Config */}
            <div className="qi-panel glass-panel">
                <h3><Settings2 size={16} /> {t('quality.config.configuration')}</h3>

                <div className="qi-config-grid">
                    {/* Enable Inspector */}
                    <div className="qi-config-item">
                        <label>{t('quality.config.enableInspector')}</label>
                        <div className="qi-switcher">
                            <Button
                                className={`qi-switcher-opt ${!status.enabled ? 'active' : ''}`}
                                onClick={() => updateConfig({ enabled: false })}
                            >
                                ⏸ {t('quality.config.disabledLabel')}
                            </Button>
                            <Button
                                className={`qi-switcher-opt ${status.enabled ? 'active' : ''}`}
                                onClick={() => updateConfig({ enabled: true })}
                            >
                                ▶ {t('quality.config.enabledLabel')} {status.enabled && <span className="qi-radar" />}
                            </Button>
                        </div>
                    </div>

                    {/* Max Concurrent */}
                    <div className="qi-config-item">
                        <label>{t('quality.config.maxConcurrent')}</label>
                        <input
                            type="number"
                            min={1}
                            max={10}
                            value={status.maxConcurrent}
                            onChange={e => updateConfig({ maxConcurrent: parseInt(e.target.value) })}
                        />
                    </div>

                    {/* Schedule Window */}
                    <div className="qi-config-item">
                        <label>{t('quality.config.scheduleWindow')}</label>
                        <div className="qi-switcher">
                            <Button
                                className={`qi-switcher-opt ${!status.scheduleEnabled ? 'active' : ''}`}
                                onClick={() => updateConfig({ scheduleEnabled: false })}
                            >
                                🟢 {t('quality.config.alwaysOn')}
                            </Button>
                            <Button
                                className={`qi-switcher-opt ${status.scheduleEnabled ? 'active' : ''}`}
                                onClick={() => updateConfig({ scheduleEnabled: true })}
                            >
                                🕐 {t('quality.config.scheduled')}
                            </Button>
                        </div>
                        {status.scheduleEnabled && (
                            <div className="qi-schedule-times">
                                <div className="qi-schedule-time-field">
                                    <span className="qi-schedule-time-label">{t('quality.config.from')}</span>
                                    <input
                                        type="time"
                                        value={status.scheduleStart}
                                        onChange={e => updateConfig({ scheduleStart: e.target.value })}
                                    />
                                </div>
                                <span className="qi-schedule-separator">→</span>
                                <div className="qi-schedule-time-field">
                                    <span className="qi-schedule-time-label">{t('quality.config.to')}</span>
                                    <input
                                        type="time"
                                        value={status.scheduleEnd}
                                        onChange={e => updateConfig({ scheduleEnd: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Skip if no transcript */}
                    <div className="qi-config-item">
                        <label>{t('quality.config.skipIfNoTranscript')}</label>
                        <div className="qi-switcher">
                            <Button
                                className={`qi-switcher-opt ${!status.skipIfNoTranscript ? 'active' : ''}`}
                                onClick={() => updateConfig({ skipIfNoTranscript: false })}
                            >
                                📝 {t('quality.config.stillRun')}
                            </Button>
                            <Button
                                className={`qi-switcher-opt ${status.skipIfNoTranscript ? 'active' : ''}`}
                                onClick={() => updateConfig({ skipIfNoTranscript: true })}
                            >
                                ⏭ {t('quality.config.skip')}
                            </Button>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                    <Button className="qi-" onClick={fetchStatus} disabled={saving}>
                        <RotateCw size={14} /> {t('quality.config.refreshStatus')}
                    </Button>
                </div>
            </div>
        </>
    );
};

// ═══════════════════════════════════════
// Analytics Tab
// ═══════════════════════════════════════

interface ScoreDistItem { bucket: string; count: number }
interface SentimentItem { sentiment: string; count: number; avg_score: number }
interface RuleHitItem { name: string; category: string; passed: number; failed: number; total: number; pass_rate: number }
interface AgentCompItem { agent_id: string; inspections: number; avg_score: number; avg_sentiment: number; excellent: number; poor: number; avg_duration_ms: number }

const SENTIMENT_COLORS: Record<string, string> = { positive: '#10b981', neutral: '#6366f1', negative: '#ef4444' };
const SCORE_GRADIENT = ['#ef4444', '#ef4444', '#f97316', '#f97316', '#eab308', '#eab308', '#84cc16', '#22c55e', '#10b981', '#059669'];

const AnalyticsTab: React.FC<{ demoMode: boolean }> = ({ demoMode }) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<QIStats | null>(null);
    const [scoreDist, setScoreDist] = useState<ScoreDistItem[]>([]);
    const [sentimentData, setSentimentData] = useState<SentimentItem[]>([]);
    const [ruleHits, setRuleHits] = useState<RuleHitItem[]>([]);
    const [agentComp, setAgentComp] = useState<AgentCompItem[]>([]);
    const [days, setDays] = useState(30);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (demoMode) {
                const [statsRes, analytics] = await Promise.all([
                    getMockQIStats(),
                    getMockQIAnalytics(),
                ]);
                setStats(statsRes.data);
                setScoreDist(analytics.scoreDistribution);
                setSentimentData(analytics.sentimentBreakdown);
                setRuleHits(analytics.ruleHits);
                setAgentComp(analytics.agentComparison);
            } else {
                const demoParam = '';
                const [statsRes, distRes, sentRes, ruleRes, agentRes] = await Promise.all([
                    api.get(`/qi/stats?days=${days}`),
                    api.get(`/qi/analytics/score-distribution?days=${days}${demoParam}`),
                    api.get(`/qi/analytics/sentiment-breakdown?days=${days}${demoParam}`),
                    api.get(`/qi/analytics/rule-hits?days=${days}${demoParam}`),
                    api.get(`/qi/analytics/agent-comparison?days=${days}${demoParam}`),
                ]);
                setStats(statsRes.data);
                setScoreDist(distRes.data.data || []);
                setSentimentData(sentRes.data.data || []);
                setRuleHits(ruleRes.data.data || []);
                setAgentComp(agentRes.data.data || []);
            }
        } catch (err) {
            console.error('Failed to load QI analytics:', err);
        } finally {
            setLoading(false);
        }
    }, [demoMode, days]);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) return <div className="qi-loading">{t('quality.scores.loadingAnalytics')}</div>;

    const s = stats?.stats;
    const totalSentiment = sentimentData.reduce((a, b) => a + b.count, 0);

    return (
        <>
            {/* Period Selector */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {[7, 14, 30].map(d => (
                    <Button key={d} className={`qi-btn ${days === d ? 'qi-btn-primary' : ''}`}
                        onClick={() => setDays(d)} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                        {d}d
                    </Button>
                ))}
            </div>

            {/* KPI Cards */}
            {s && (
                <div className="qi-kpi-grid">
                    <div className="qi-kpi-card glass-panel">
                        <span className="qi-kpi-label">{t('quality.scores.totalInspections')}</span>
                        <span className="qi-kpi-value">{Number(s.total_inspections).toLocaleString()}</span>
                        <span className="qi-kpi-sub">{t('quality.scores.lastNdays', { days })}</span>
                    </div>
                    <div className="qi-kpi-card glass-panel">
                        <span className="qi-kpi-label">{t('quality.scores.avgScore')}</span>
                        <span className="qi-kpi-value" style={{ color: Number(s.avg_score) >= 80 ? '#10b981' : Number(s.avg_score) >= 60 ? '#eab308' : '#ef4444' }}>
                            {s.avg_score}
                        </span>
                        <span className="qi-kpi-sub">{t('quality.scores.minMax', { min: s.min_score, max: s.max_score })}</span>
                    </div>
                    <div className="qi-kpi-card glass-panel">
                        <span className="qi-kpi-label">{t('quality.scores.excellenceRate')}</span>
                        <span className="qi-kpi-value" style={{ color: '#10b981' }}>
                            {Number(s.total_inspections) > 0 ? ((Number(s.excellent_count) / Number(s.total_inspections)) * 100).toFixed(1) : '0.0'}%
                        </span>
                        <span className="qi-kpi-sub">{t('quality.scores.callsAbove80', { count: s.excellent_count })}</span>
                    </div>
                    <div className="qi-kpi-card glass-panel">
                        <span className="qi-kpi-label">{t('quality.analytics.positivePercent')}</span>
                        <span className="qi-kpi-value" style={{ color: '#10b981' }}>
                            {totalSentiment > 0 ? ((sentimentData.find(sd => sd.sentiment === 'positive')?.count || 0) / totalSentiment * 100).toFixed(1) : '0.0'}%
                        </span>
                        <span className="qi-kpi-sub">{sentimentData.find(sd => sd.sentiment === 'positive')?.count || 0} / {totalSentiment} calls</span>
                    </div>
                </div>
            )}

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                {/* Score Trend */}
                <div className="qi-panel glass-panel">
                    <h3><TrendingUp size={16} /> {t('quality.analytics.scoreTrend')}</h3>
                    {stats?.trend && stats.trend.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={stats.trend}>
                                <defs>
                                    <linearGradient id="qiScoreGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0' }} />
                                <Area type="monotone" dataKey="avg_score" stroke="#6366f1" fill="url(#qiScoreGrad)" strokeWidth={2} name={t('quality.analytics.avgScore')} />
                                <Area type="monotone" dataKey="inspections" stroke="#22d3ee" fill="none" strokeWidth={1.5} strokeDasharray="4 4" name={t('quality.analytics.inspections')} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : <div className="qi-empty">{t('quality.analytics.noTrendData')}</div>}
                </div>

                {/* Score Distribution */}
                <div className="qi-panel glass-panel">
                    <h3><BarChart3 size={16} /> {t('quality.analytics.scoreDistribution')}</h3>
                    {scoreDist.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={scoreDist}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="bucket" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0' }} />
                                <Bar dataKey="count" name="Calls" radius={[4, 4, 0, 0]}>
                                    {scoreDist.map((_, i) => <Cell key={i} fill={SCORE_GRADIENT[i] || '#6366f1'} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <div className="qi-empty">{t('quality.analytics.noDistData')}</div>}
                </div>

                {/* Sentiment Breakdown */}
                <div className="qi-panel glass-panel">
                    <h3><MessageSquare size={16} /> {t('quality.analytics.sentimentBreakdown')}</h3>
                    {sentimentData.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <ResponsiveContainer width="55%" height={200}>
                                <PieChart>
                                    <Pie data={sentimentData} dataKey="count" nameKey="sentiment" cx="50%" cy="50%"
                                        innerRadius={45} outerRadius={75} paddingAngle={3} strokeWidth={0}>
                                        {sentimentData.map(d => <Cell key={d.sentiment} fill={SENTIMENT_COLORS[d.sentiment] || '#6366f1'} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0' }} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div style={{ flex: 1, fontSize: '0.82rem' }}>
                                {sentimentData.map(d => (
                                    <div key={d.sentiment} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: SENTIMENT_COLORS[d.sentiment] }} />
                                        <span style={{ textTransform: 'capitalize', color: '#e2e8f0', minWidth: 65 }}>{d.sentiment}</span>
                                        <span style={{ color: '#94a3b8' }}>{d.count} ({totalSentiment > 0 ? (d.count / totalSentiment * 100).toFixed(0) : 0}%)</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : <div className="qi-empty">{t('quality.analytics.noSentimentData')}</div>}
                </div>

                {/* Rule Hit Rate */}
                <div className="qi-panel glass-panel">
                    <h3><ShieldCheck size={16} /> {t('quality.analytics.ruleHitRate')}</h3>
                    {ruleHits.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={ruleHits} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0' }} />
                                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                                <Bar dataKey="passed" stackId="a" fill="#10b981" name={t('quality.analytics.passed')} radius={[0, 0, 0, 0]} />
                                <Bar dataKey="failed" stackId="a" fill="#ef4444" name={t('quality.analytics.failed')} radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <div className="qi-empty">{t('quality.analytics.noRuleData')}</div>}
                </div>
            </div>

            {/* Agent Comparison — Full Width */}
            <div className="qi-panel glass-panel" style={{ marginTop: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3><Users size={16} /> {t('quality.analytics.agentPerformance')}</h3>
                    {agentComp.length > 0 && (
                        <ExportButton onExport={() => exportToCSV(
                            agentComp,
                            [
                                { key: 'agent_id', label: 'Agent' },
                                { key: 'inspections', label: 'Inspections' },
                                { key: 'avg_score', label: 'Avg Score' },
                                { key: 'avg_sentiment', label: 'Avg Sentiment' },
                                { key: 'excellent', label: 'Excellent' },
                                { key: 'poor', label: 'Poor' },
                            ],
                            exportFilename('qi-agents')
                        )} />
                    )}
                </div>
                {agentComp.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                        <Table className="qi-table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('quality.agent')}</TableHead>
                                    <TableHead>{t('quality.analytics.inspections')}</TableHead>
                                    <TableHead>{t('quality.analytics.avgScore')}</TableHead>
                                    <TableHead>{t('quality.analytics.scoreBar')}</TableHead>
                                    <TableHead>{t('quality.sentiment')}</TableHead>
                                    <TableHead>{t('quality.analytics.excellent')}</TableHead>
                                    <TableHead>{t('quality.analytics.poor')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {agentComp.map(a => (
                                    <TableRow key={a.agent_id}>
                                        <TableCell style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{a.agent_id}</TableCell>
                                        <TableCell>{a.inspections}</TableCell>
                                        <TableCell>
                                            <span className={`qi-score-badge ${scoreClass(a.avg_score)}`}>
                                                {a.avg_score}
                                            </span>
                                        </TableCell>
                                        <TableCell style={{ minWidth: 120 }}>
                                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${a.avg_score}%`,
                                                    height: '100%',
                                                    borderRadius: 4,
                                                    background: a.avg_score >= 80 ? '#10b981' : a.avg_score >= 60 ? '#eab308' : '#ef4444',
                                                    transition: 'width 0.5s ease',
                                                }} />
                                            </div>
                                        </TableCell>
                                        <TableCell style={{ color: a.avg_sentiment >= 0.6 ? '#10b981' : a.avg_sentiment >= 0.4 ? '#eab308' : '#ef4444' }}>
                                            {a.avg_sentiment.toFixed(2)}
                                        </TableCell>
                                        <TableCell style={{ color: '#10b981' }}>{a.excellent}</TableCell>
                                        <TableCell style={{ color: '#ef4444' }}>{a.poor}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : <div className="qi-empty">{t('quality.analytics.noAgentData')}</div>}
            </div>
        </>
    );
};

export default QualityInspector;
