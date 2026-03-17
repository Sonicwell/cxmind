import { Checkbox } from '../components/ui/Checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select } from '../components/ui/Select';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTabParam } from '../hooks/useTabParam';
import api from '../services/api';
import toast from 'react-hot-toast';
import { getMockAgents } from '../services/mock-data';
import { useDemoMode } from '../hooks/useDemoMode';
import { Search, Plus, Trash2, Shield, HardDrive, AudioWaveform, FileText, Bot, ChevronLeft, ChevronRight, Settings2, ShieldAlert, Phone, Users, Layers, MoreVertical, Eye, EyeOff, Lock, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GlassModal } from '../components/ui/GlassModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { MotionButton } from '../components/ui/MotionButton';
import { Input } from '../components/ui/input';
import AvatarInitials from '../components/ui/AvatarInitials';
import ExportButton from '../components/ExportButton';
import { exportToCSV, exportFilename } from '../utils/export-csv';
import GroupsPanel from '../components/organization/GroupsPanel';
import SupervisorsPanel from '../components/organization/SupervisorsPanel';
import { sanitizeHtml } from '../utils/sanitize';
import '../styles/agents.css';
import { useDirtyModal } from '../hooks/useDirtyModal';
import { Button } from '../components/ui/button';

type SettingPolicy = 'disabled' | 'optional' | 'enforced';

interface BoundUser {
    displayName: string;
    email: string;
    avatar?: string | null;
}

interface Agent {
    _id: string;
    sipNumber: string;
    sipPassword: string;
    status: 'active' | 'inactive';
    boundUser: BoundUser | null;
    groupId?: { _id: string; name: string; code: string } | null;
    pcapPolicy?: SettingPolicy;
    asrPolicy?: SettingPolicy;
    summaryPolicy?: SettingPolicy;
    assistantPolicy?: SettingPolicy;
    createdAt: string;
}

type BindFilter = 'all' | 'bound' | 'unbound';

const POLICY_KEYS = ['pcapPolicy', 'asrPolicy', 'summaryPolicy', 'assistantPolicy'] as const;
const POLICY_CYCLE: SettingPolicy[] = ['disabled', 'optional', 'enforced'];
const POLICY_LABELS: Record<string, string> = {
    pcapPolicy: 'PCAP',
    asrPolicy: 'ASR',
    summaryPolicy: 'Summary',
    assistantPolicy: 'Assistant',
};
const POLICY_ICONS: Record<string, React.ReactNode> = {
    pcapPolicy: <HardDrive size={15} />,
    asrPolicy: <AudioWaveform size={15} />,
    summaryPolicy: <FileText size={15} />,
    assistantPolicy: <Bot size={15} />,
};
const PAGE_SIZES = [20, 50, 100];

const Agents: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { demoMode } = useDemoMode();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [gracePeriodWarning, setGracePeriodWarning] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [bindFilter, setBindFilter] = useState<BindFilter>('all');
    const addModal = useDirtyModal();
    const editModal = useDirtyModal();
    const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
    const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);
    const [editSipNumber, setEditSipNumber] = useState('');
    const [editSipPassword, setEditSipPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [isBatchOpen, setIsBatchOpen] = useState(false);
    const [batchForm, setBatchForm] = useState({ startNumber: '', count: '' });
    const [batchResult, setBatchResult] = useState<{ created: number; skipped: number; skippedNumbers: string[] } | null>(null);
    const [batchLoading, setBatchLoading] = useState(false);
    const [activeTab, setActiveTab] = useTabParam<'agents' | 'groups' | 'supervisors'>('tab', 'agents');

    // Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBatchPolicyOpen, setIsBatchPolicyOpen] = useState(false);
    const [batchPolicies, setBatchPolicies] = useState<Record<string, SettingPolicy>>({
        pcapPolicy: 'disabled',
        asrPolicy: 'disabled',
        summaryPolicy: 'disabled',
        assistantPolicy: 'disabled',
    });

    // Global policy context
    const [globalPolicies, setGlobalPolicies] = useState<Record<string, SettingPolicy>>({
        pcapPolicy: 'optional', asrPolicy: 'optional',
        summaryPolicy: 'optional', assistantPolicy: 'optional',
    });

    // Pagination
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);

    // Form State
    const [newAgent, setNewAgent] = useState({
        sipNumber: '',
        sipPassword: '',
        pcapPolicy: 'disabled' as SettingPolicy,
        asrPolicy: 'disabled' as SettingPolicy,
        summaryPolicy: 'disabled' as SettingPolicy,
        assistantPolicy: 'disabled' as SettingPolicy
    });

    const fetchAgents = useCallback(async () => {
        try {
            setLoading(true);
            if (demoMode) {
                const res = await getMockAgents();
                const data = res.data.data as any;
                setAgents(data);
                setTotal(data.length);
            } else {
                const response = await api.get('/client/agents', {
                    params: { limit: pageSize, offset: page * pageSize }
                });
                setAgents(response.data.data);
                setTotal(response.data.pagination?.total ?? response.data.data.length);
            }
        } catch (error) {
            console.error('Failed to fetch agents', error);
        } finally {
            setLoading(false);
        }
    }, [demoMode, page, pageSize]);

    useEffect(() => {
        fetchAgents();
    }, [fetchAgents]);

    // Fetch global policies for context display
    useEffect(() => {
        if (demoMode) return;
        api.get('/platform/settings').then(res => {
            const d = res.data?.data;
            if (d) {
                setGlobalPolicies({
                    pcapPolicy: d.pcapPolicy || 'optional',
                    asrPolicy: d.asrPolicy || 'optional',
                    summaryPolicy: d.summaryPolicy || 'optional',
                    assistantPolicy: d.assistantPolicy || 'optional',
                });
            }
        }).catch(() => {});
    }, [demoMode]);

    // filter变了就回第一页
    useEffect(() => {
        setPage(0);
    }, [searchTerm, bindFilter]);

    // ── Handlers ──

    const handleCreateAgent = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await api.post('/client/agents', newAgent);
            addModal.forceClose();
            setNewAgent({
                sipNumber: '', sipPassword: '',
                pcapPolicy: 'disabled', asrPolicy: 'disabled',
                summaryPolicy: 'disabled', assistantPolicy: 'disabled'
            });
            if (res.data.warning === 'in_grace_period') {
                setGracePeriodWarning(true);
                toast.error('Agent created in Grace Period. You exceed your base plan limit.', { duration: 5000 });
            } else {
                toast.success(t('agentsPage.toast.created'));
            }
            fetchAgents();
        } catch (error: any) {
            console.error('Failed to create agent', error);
            const errorCode = error.response?.data?.errorCode;
            const detail = error.response?.data?.detail || '';
            const msg = errorCode
                ? t(`agentsPage.error.${errorCode}`, { sipNumber: detail })
                : error.response?.data?.error || t('agentsPage.error.createFailed', 'Failed to create agent');
            if (msg.includes('Seat limit reached') || msg.includes('seat')) {
                setGracePeriodWarning(true);
            }
            setErrorMsg(msg);
        }
    };

    const handleBatchCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setBatchLoading(true);
        setBatchResult(null);
        try {
            const res = await api.post('/client/agents/batch', {
                startNumber: batchForm.startNumber,
                count: Number(batchForm.count)
            });
            if (res.data.warning === 'in_grace_period_after_batch') {
                setGracePeriodWarning(true);
                toast.error(`Batch created, but some agents are in Grace Period. Please buy more seats.`, { duration: 6000 });
            } else {
                toast.success(t('agentsPage.toast.batchCreated', { count: res.data.created }));
            }
            fetchAgents();
        } catch (error: any) {
            console.error('Failed to batch create agents', error);
            const msg = error.response?.data?.error || 'Failed to batch create agents';
            if (msg.includes('Exceeds absolute max burst capacity') || msg.includes('Seat limit reached')) {
                setGracePeriodWarning(true);
            }
            setErrorMsg(msg);
        } finally {
            setBatchLoading(false);
        }
    };

    // Optimistic policy toggle
    const cyclePolicyValue = (current: SettingPolicy): SettingPolicy => {
        const idx = POLICY_CYCLE.indexOf(current);
        return POLICY_CYCLE[(idx + 1) % POLICY_CYCLE.length];
    };

    const updateAgentPolicy = async (
        agentId: string,
        policyType: typeof POLICY_KEYS[number],
        newValue: SettingPolicy,
        oldValue: SettingPolicy
    ) => {
        // Optimistic update
        setAgents(prev => prev.map(a =>
            a._id === agentId ? { ...a, [policyType]: newValue } : a
        ));
        try {
            await api.patch(`/client/agents/${agentId}`, { [policyType]: newValue });
        } catch (error) {
            console.error('Failed to update agent policy', error);
            // Rollback
            setAgents(prev => prev.map(a =>
                a._id === agentId ? { ...a, [policyType]: oldValue } : a
            ));
        }
    };

    const handleEditAgent = (agent: Agent) => {
        setErrorMsg('');
        setEditSipNumber(agent.sipNumber);
        setEditSipPassword(agent.sipPassword || '');
        setShowPassword(false);
        setEditingAgent(agent);
        editModal.open();
    };

    const handleSaveEdit = async () => {
        if (!editingAgent) return;
        try {
            const payload: any = { sipNumber: editSipNumber };
            if (editSipPassword && editSipPassword !== editingAgent.sipPassword) {
                payload.sipPassword = editSipPassword;
            }
            await api.patch(`/client/agents/${editingAgent._id}`, payload);
            editModal.forceClose();
            setEditingAgent(null);
            toast.success(t('agentsPage.toast.updated'));
            fetchAgents();
        } catch (error: any) {
            console.error('Failed to update agent', error);
            const errorCode = error.response?.data?.errorCode;
            const detail = error.response?.data?.detail || '';
            const msg = errorCode
                ? t(`agentsPage.error.${errorCode}`, { sipNumber: detail })
                : error.response?.data?.error || t('agentsPage.error.updateFailed', 'Failed to update agent');
            setErrorMsg(msg);
        }
    };

    const handleDeleteAgent = (agent: Agent) => {
        setDeletingAgent(agent);
    };

    const confirmDeleteAgent = async () => {
        if (!deletingAgent) return;
        try {
            await api.delete(`/client/agents/${deletingAgent._id}`);
            setDeletingAgent(null);
            selectedIds.delete(deletingAgent._id);
            setSelectedIds(new Set(selectedIds));
            toast.success(t('agentsPage.toast.deleted'));
            fetchAgents();
        } catch (error: any) {
            console.error('Failed to delete agent', error);
            setErrorMsg(error.response?.data?.error || 'Failed to delete agent');
            setDeletingAgent(null);
        }
    };

    const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
    const executeBatchDelete = async () => {
        if (selectedIds.size === 0) return;
        try {
            await api.post('/client/agents/batch-delete', { agentIds: Array.from(selectedIds) });
            toast.success(t('agentsPage.toast.deleted', { count: selectedIds.size }));
            setSelectedIds(new Set());
            setBatchDeleteConfirmOpen(false);
            fetchAgents();
        } catch (error: any) {
            console.error('Failed to batch delete agents', error);
            const msg = error.response?.data?.error || 'Failed to batch delete agents';
            toast.error(msg);
            setBatchDeleteConfirmOpen(false);
        }
    };

    // ── Selection ──

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredAgents.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredAgents.map(a => a._id)));
        }
    };

    const handleBatchPolicyApply = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;

        // Optimistic update
        setAgents(prev => prev.map(a =>
            selectedIds.has(a._id)
                ? { ...a, ...batchPolicies }
                : a
        ));
        setIsBatchPolicyOpen(false);
        setSelectedIds(new Set());

        try {
            await api.patch('/client/agents/batch-policy', {
                agentIds: ids,
                policies: batchPolicies,
            });
            toast.success(t('agentsPage.toast.batchPolicyUpdated'));
            fetchAgents(); // refresh to get server truth
        } catch (error) {
            console.error('Failed to batch update policies', error);
            fetchAgents(); // rollback via re-fetch
        }
    };

    // ── Derived data ──

    const filteredAgents = useMemo(() => {
        return agents.filter(agent => {
            // Search
            const s = searchTerm.toLowerCase();
            const matchSearch = !s ||
                agent.sipNumber.toLowerCase().includes(s) ||
                (agent.boundUser?.displayName || '').toLowerCase().includes(s) ||
                (agent.boundUser?.email || '').toLowerCase().includes(s);
            // Bind filter
            const matchBind =
                bindFilter === 'all' ||
                (bindFilter === 'bound' && agent.boundUser) ||
                (bindFilter === 'unbound' && !agent.boundUser);
            return matchSearch && matchBind;
        });
    }, [agents, searchTerm, bindFilter]);

    // Summary stats
    const stats = useMemo(() => {
        const bound = agents.filter(a => a.boundUser).length;
        const groups = new Set(agents.filter(a => a.groupId).map(a => a.groupId!._id)).size;
        return { total: total || agents.length, bound, unbound: agents.length - bound, groups };
    }, [agents, total]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil((total || agents.length) / pageSize));

    return (
        <div className="page-content">
            {/* Tab Navigation */}
            <div className="flex gap-sm" style={{ marginBottom: 'var(--spacing-lg)' }}>
                {[
                    { key: 'agents' as const, label: t('agentsPage.tabs.agents'), icon: <Phone size={16} /> },
                    { key: 'groups' as const, label: t('agentsPage.tabs.groups'), icon: <Users size={16} /> },
                    { key: 'supervisors' as const, label: t('agentsPage.tabs.supervisors'), icon: <Shield size={16} /> },
                ].map(tab => (
                    <Button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className="flex items-center gap-xs"
                        style={{
                            padding: '8px 20px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid ' + (activeTab === tab.key ? 'var(--primary)' : 'var(--glass-border)'),
                            background: activeTab === tab.key ? 'rgba(108,75,245,0.08)' : 'transparent',
                            color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
                            fontWeight: activeTab === tab.key ? 600 : 400,
                            cursor: 'pointer', fontSize: '0.88rem',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        {tab.icon} {tab.label}
                    </Button>
                ))}
            </div>

            {/* Groups Tab */}
            {activeTab === 'groups' && <GroupsPanel />}

            {/* Supervisors Tab */}
            {activeTab === 'supervisors' && <SupervisorsPanel />}

            {/* Agents Tab */}
            {activeTab === 'agents' && (<>
                {/* Summary Bar */}
                <div className="agents-summary" role="status" aria-label="Agent statistics">
                    <div className="agents-summary-item">
                        <Phone size={14} />
                        <span>{t('agentsPage.summary.total')}: <strong>{stats.total}</strong></span>
                    </div>
                    <div className="agents-summary-divider" />
                    <div className="agents-summary-item">
                        <span style={{ color: 'var(--success)' }}>●</span>
                        <span>{t('agentsPage.summary.bound')}: <strong>{stats.bound}</strong></span>
                    </div>
                    <div className="agents-summary-divider" />
                    <div className="agents-summary-item">
                        <span style={{ color: 'var(--text-muted)' }}>○</span>
                        <span>{t('agentsPage.summary.unbound')}: <strong>{stats.unbound}</strong></span>
                    </div>
                    <div className="agents-summary-divider" />
                    <div className="agents-summary-item">
                        <Users size={14} />
                        <span>{t('agentsPage.summary.groups')}: <strong>{stats.groups}</strong></span>
                    </div>
                </div>

                {/* Global Policy Banner */}
                <div className="agents-global-policy-banner">
                    <Globe size={14} style={{ flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, marginRight: '0.5rem' }}>{t('agentsPage.globalPolicy', 'Global Policy')}:</span>
                    {POLICY_KEYS.map(pk => {
                        const val = globalPolicies[pk] || 'optional';
                        const isLocked = val === 'enforced' || val === 'disabled';
                        return (
                            <span key={pk} className="agents-global-policy-chip" data-state={val}>
                                {POLICY_ICONS[pk]}
                                <span>{POLICY_LABELS[pk]}</span>
                                <span className="agents-global-policy-val">{val}</span>
                                {isLocked && <Lock size={10} />}
                            </span>
                        );
                    })}
                </div>

                {gracePeriodWarning && (
                    <div className="flex items-center justify-between p-3 mb-4 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm">
                        <div className="flex items-center gap-2">
                            <ShieldAlert size={16} />
                            <span><strong dangerouslySetInnerHTML={{ __html: sanitizeHtml(t('agentsPage.capacityWarningTitle', 'Capacity Warning:')) }} /> {t('agentsPage.capacityWarningDesc', 'You have reached or exceeded your core seat limit. Agents created during the 30-day grace period will be automatically disabled if capacity is not expanded.')}</span>
                        </div>
                        <MotionButton size="sm" variant="secondary" className="h-7 text-xs border border-amber-500/50 text-amber-500 hover:bg-amber-500/20" onClick={() => navigate('/settings/system/license')}>
                            {t('agentsPage.upgradeLicense', 'Upgrade License')}
                        </MotionButton>
                    </div>
                )}

                {/* Toolbar */}
                <div className="page-header flex justify-between items-center" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <div className="flex gap-md items-center">
                        <div className="search-bar input-with-icon" style={{ width: '260px' }}>
                            <Search size={18} />
                            <input
                                type="text"
                                placeholder={t('agentsPage.searchPlaceholder')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="filter-chips">
                            {([
                                { key: 'all' as const, label: t('agentsPage.filterAll') },
                                { key: 'bound' as const, label: t('agentsPage.filterBound') },
                                { key: 'unbound' as const, label: t('agentsPage.filterUnbound') },
                            ]).map(f => (
                                <Button
                                    key={f.key}
                                    className={`filter-chip ${bindFilter === f.key ? 'active' : ''}`}
                                    onClick={() => setBindFilter(f.key)}
                                >
                                    {f.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-sm">
                        <ExportButton
                            label={t('agentsPage.exportCSV', 'Export CSV')}
                            disabled={filteredAgents.length === 0}
                            onExport={() => {
                                exportToCSV(filteredAgents, [
                                    { key: 'sipNumber', label: t('agents.sipNumber', 'SIP Number') },
                                    { key: 'boundUser', label: t('agents.userName', 'User Name'), format: r => r.boundUser?.displayName || '' },
                                    { key: 'boundUser', label: t('agents.userEmail', 'User Email'), format: r => r.boundUser?.email || '' },
                                    { key: 'status', label: t('agents.status', 'Status') },
                                    { key: 'pcapPolicy', label: t('agents.pcapPolicy', 'PCAP Policy'), format: r => r.pcapPolicy || 'disabled' },
                                    { key: 'asrPolicy', label: t('agents.asrPolicy', 'ASR Policy'), format: r => r.asrPolicy || 'disabled' },
                                    { key: 'summaryPolicy', label: t('agents.summaryPolicy', 'Summary Policy'), format: r => r.summaryPolicy || 'disabled' },
                                    { key: 'assistantPolicy', label: t('agents.assistantPolicy', 'Assistant Policy'), format: r => r.assistantPolicy || 'disabled' },
                                    { key: 'createdAt', label: t('agents.created', 'Created'), format: r => new Date(r.createdAt).toLocaleDateString() },
                                ], exportFilename('agents'));
                            }}
                        />
                        <MotionButton onClick={() => { setIsBatchOpen(true); setBatchResult(null); setBatchForm({ startNumber: '', count: '' }); }}>
                            <Layers size={18} />
                            {t('agentsPage.batchAdd')}
                        </MotionButton>
                        <MotionButton onClick={() => { setNewAgent({ sipNumber: '', sipPassword: '', pcapPolicy: 'disabled', asrPolicy: 'disabled', summaryPolicy: 'disabled', assistantPolicy: 'disabled' }); addModal.open(); }}>
                            <Plus size={18} />
                            {t('agentsPage.addAgent')}
                        </MotionButton>
                    </div>
                </div>

                {/* Batch Action Bar */}
                {selectedIds.size > 0 && (
                    <div className="agents-batch-bar">
                        {t('agentsPage.selectedCount', { count: selectedIds.size })}
                        <MotionButton

                            style={{ padding: '4px 14px', fontSize: '0.82rem' }}
                            onClick={() => {
                                setBatchPolicies({
                                    pcapPolicy: 'disabled', asrPolicy: 'disabled',
                                    summaryPolicy: 'disabled', assistantPolicy: 'disabled'
                                });
                                setIsBatchPolicyOpen(true);
                            }}
                        >
                            <Settings2 size={14} />
                            {t('agentsPage.batchPolicy')}
                        </MotionButton>
                        <MotionButton
                            variant="destructive"
                            className="h-8 text-xs agents-batch-btn"
                            onClick={() => setBatchDeleteConfirmOpen(true)}
                        >
                            <Trash2 size={14} />
                            {t('common.delete', 'Delete')}
                        </MotionButton>
                        <Button
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
                            onClick={() => setSelectedIds(new Set())}
                        >
                            {t('agentsPage.clearSelection')}
                        </Button>
                    </div>
                )}

                {/* Table */}
                {loading ? (
                    <div className="glass-panel agents-table-wrap">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="agents-skeleton-row">
                                <div className="agents-skeleton-cell" style={{ width: 16 }} />
                                <div className="agents-skeleton-cell" style={{ width: '18%' }} />
                                <div className="agents-skeleton-cell" style={{ width: '10%' }} />
                                <div className="agents-skeleton-cell" style={{ width: '8%' }} />
                                <div className="agents-skeleton-cell" style={{ width: 32 }} />
                                <div className="agents-skeleton-cell" style={{ width: 32 }} />
                                <div className="agents-skeleton-cell" style={{ width: 32 }} />
                                <div className="agents-skeleton-cell" style={{ width: 32 }} />
                                <div className="agents-skeleton-cell" style={{ width: '8%' }} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="glass-panel agents-table-wrap">
                        <Table className="agents-table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead style={{ width: 40 }}>
                                        <Checkbox
                                            className="agents-checkbox"
                                            checked={filteredAgents.length > 0 && selectedIds.size === filteredAgents.length}
                                            onChange={toggleSelectAll}
                                            aria-label="Select all agents"
                                        />
                                    </TableHead>
                                    <TableHead>{t('agentsPage.col.boundUser')}</TableHead>
                                    <TableHead>{t('agentsPage.col.sipNumber')}</TableHead>
                                    <TableHead>{t('agentsPage.col.group')}</TableHead>
                                    <TableHead style={{ textAlign: 'center' }}>PCAP</TableHead>
                                    <TableHead style={{ textAlign: 'center' }}>ASR</TableHead>
                                    <TableHead style={{ textAlign: 'center' }}>{POLICY_LABELS['summaryPolicy']}</TableHead>
                                    <TableHead style={{ textAlign: 'center' }}>{POLICY_LABELS['assistantPolicy']}</TableHead>
                                    <TableHead>{t('agentsPage.col.actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAgents.map(agent => {
                                    const isUnbound = !agent.boundUser;
                                    const isSelected = selectedIds.has(agent._id);
                                    return (
                                        <TableRow
                                            key={agent._id}
                                            className={[
                                                isUnbound ? 'agent-row-unbound' : '',
                                                isSelected ? 'agent-row-selected' : '',
                                            ].join(' ')}
                                        >
                                            <TableCell>
                                                <Checkbox
                                                    className="agents-checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelect(agent._id)}
                                                    aria-label={`Select agent ${agent.sipNumber}`}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {agent.boundUser ? (
                                                    <div className="flex items-center gap-sm">
                                                        <AvatarInitials name={agent.boundUser.displayName} src={agent.boundUser.avatar} size={32} />
                                                        <div className="flex flex-col">
                                                            <span style={{ fontWeight: 500 }}>{agent.boundUser.displayName}</span>
                                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{agent.boundUser.email}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('agentsPage.unboundLabel')}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-sm" style={{ color: 'var(--text-secondary)' }}>
                                                    <Phone size={14} />
                                                    {agent.sipNumber}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {agent.groupId ? (
                                                    <span className="agent-group-badge">{agent.groupId.name}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.82rem' }}>—</span>
                                                )}
                                            </TableCell>
                                            {POLICY_KEYS.map(policyKey => {
                                                const val = agent[policyKey] || 'disabled';
                                                const globalVal = globalPolicies[policyKey] || 'optional';
                                                const globalLocked = globalVal === 'enforced' || globalVal === 'disabled';
                                                // Copilot 偏好指示: optional 模式下显示坐席在 Copilot 的设定
                                                const prefKey = policyKey === 'asrPolicy' ? 'asrEnabled'
                                                    : policyKey === 'summaryPolicy' ? 'summaryEnabled'
                                                        : policyKey === 'assistantPolicy' ? 'assistantEnabled' : null;
                                                const pref = prefKey && val === 'optional'
                                                    ? (agent as any)?.copilotPreferences?.[prefKey] : undefined;
                                                return (
                                                    <TableCell key={policyKey} style={{ textAlign: 'center' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                            <button
                                                                className={`policy-toggle ${globalLocked ? 'policy-toggle-locked' : ''}`}
                                                                data-state={val}
                                                                onClick={() => {
                                                                    const next = cyclePolicyValue(val);
                                                                    updateAgentPolicy(agent._id, policyKey, next, val);
                                                                }}
                                                                aria-label={`${POLICY_LABELS[policyKey]}: ${val}${globalLocked ? ` (Global: ${globalVal})` : ''}. Click to change.`}
                                                                title={globalLocked ? `Global: ${globalVal}` : undefined}
                                                            >
                                                                {POLICY_ICONS[policyKey]}
                                                                {globalLocked && <Lock size={8} style={{ position: 'absolute', top: 2, right: 2, opacity: 0.7 }} />}
                                                                <span className="policy-toggle-tooltip">
                                                                    {POLICY_LABELS[policyKey]}: {val}
                                                                    {globalLocked ? ` (🌐 ${globalVal})` : ''}
                                                                </span>
                                                            </button>
                                                            {pref !== undefined && (
                                                                <span
                                                                    title={`Copilot: ${pref === false ? 'OFF' : 'ON'}`}
                                                                    style={{
                                                                        width: 6, height: 6, borderRadius: '50%',
                                                                        background: pref === false ? '#f59e0b' : '#3b82f6',
                                                                        flexShrink: 0,
                                                                    }}
                                                                />
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                );
                                            })}
                                            <TableCell>
                                                <div className="flex items-center gap-sm">
                                                    <MotionButton variant="ghost" onClick={() => handleEditAgent(agent)}>
                                                        <MoreVertical size={18} />
                                                    </MotionButton>
                                                    <MotionButton
                                                        variant="ghost"

                                                        onClick={() => handleDeleteAgent(agent)}
                                                        style={{ color: 'var(--danger)' }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </MotionButton>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>

                        {/* Pagination */}
                        <div className="agents-pagination">
                            <div className="agents-pagination-info">
                                <span>
                                    {t('agentsPage.showing', { from: Math.min(page * pageSize + 1, filteredAgents.length), to: Math.min((page + 1) * pageSize, filteredAgents.length), total: filteredAgents.length })}
                                    {(searchTerm || bindFilter !== 'all') && <span style={{ color: 'var(--text-muted)' }}> ({t('agentsPage.filteredFrom', { total: stats.total })})</span>}
                                </span>
                                <div className="agents-page-size">
                                    <span>·</span>
                                    {PAGE_SIZES.map(s => (
                                        <Button
                                            key={s}
                                            className={pageSize === s ? 'active' : ''}
                                            onClick={() => { setPageSize(s); setPage(0); }}
                                        >
                                            {s}
                                        </Button>
                                    ))}
                                    <span>{t('agentsPage.perPage')}</span>
                                </div>
                            </div>
                            <div className="agents-pagination-controls">
                                <Button className="agents-page-"
                                    disabled={page === 0}
                                    onClick={() => setPage(p => Math.max(0, p - 1))}
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft size={16} />
                                </Button>
                                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                                    // Show pages around current page
                                    let pageNum: number;
                                    if (totalPages <= 5) {
                                        pageNum = i;
                                    } else if (page < 3) {
                                        pageNum = i;
                                    } else if (page > totalPages - 4) {
                                        pageNum = totalPages - 5 + i;
                                    } else {
                                        pageNum = page - 2 + i;
                                    }
                                    return (
                                        <Button
                                            key={pageNum}
                                            className={`agents-page-btn ${page === pageNum ? 'active' : ''}`}
                                            onClick={() => setPage(pageNum)}
                                        >
                                            {pageNum + 1}
                                        </Button>
                                    );
                                })}
                                <Button className="agents-page-"
                                    disabled={page >= totalPages - 1}
                                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                    aria-label="Next page"
                                >
                                    <ChevronRight size={16} />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add New Agent Modal */}
                <GlassModal
                    open={addModal.isOpen}
                    onOpenChange={(open) => { if (!open) { addModal.forceClose(); } setErrorMsg(''); }}
                    title={t('agentsPage.modal.addTitle')}
                    onCloseAttempt={addModal.attemptClose}
                    isDirty={addModal.isDirty}
                >
                    <form onSubmit={handleCreateAgent} className="flex flex-col gap-md" autoComplete="off">
                        <div className="form-group">
                            <label>{t('agentsPage.modal.sipNumber')}</label>
                            <Input
                                value={newAgent.sipNumber}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setNewAgent({ ...newAgent, sipNumber: e.target.value }); addModal.markDirty(); }}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('agentsPage.modal.sipPassword')}</label>
                            <Input
                                type="password"
                                value={newAgent.sipPassword}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setNewAgent({ ...newAgent, sipPassword: e.target.value }); addModal.markDirty(); }}
                                autoComplete="new-password"
                            />
                        </div>

                        {POLICY_KEYS.map(pk => (
                            <div className="form-group" key={pk}>
                                <label>{POLICY_LABELS[pk]} Policy</label>
                                <Select
                                    value={newAgent[pk]}
                                    onChange={e => { setNewAgent({ ...newAgent, [pk]: e.target.value as SettingPolicy }); addModal.markDirty(); }}
                                >
                                    <option value="disabled">{t('agentsPage.modal.disabled')}</option>
                                    <option value="optional">{t('agentsPage.modal.optional')}</option>
                                    <option value="enforced">{t('agentsPage.modal.enforced')}</option>
                                </Select>
                            </div>
                        ))}

                        {errorMsg && (
                            <div style={{
                                padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)',
                                background: 'hsla(0, 80%, 95%, 1)', border: '1px solid hsla(0, 60%, 80%, 1)',
                                color: 'hsla(0, 60%, 40%, 1)', fontSize: '0.85rem'
                            }}>{errorMsg}</div>
                        )}
                        <div className="flex gap-md" style={{ marginTop: '1rem' }}>
                            <MotionButton type="button" variant="secondary" className="w-full" onClick={addModal.attemptClose}>
                                {t('agentsPage.modal.cancel')}
                            </MotionButton>
                            <MotionButton type="submit" className="w-full">
                                {t('agentsPage.modal.create')}
                            </MotionButton>
                        </div>
                    </form>
                </GlassModal>
                <ConfirmModal
                    open={addModal.showConfirm}
                    onClose={addModal.cancelClose}
                    onConfirm={addModal.confirmClose}
                    title={t('common.discardChangesTitle', 'Discard unsaved changes?')}
                    description={t('common.discardChangesDesc', 'You have unsaved changes. Are you sure you want to discard them?')}
                    confirmText={t('common.discard', 'Discard')}
                    cancelText={t('common.cancel', 'Cancel')}
                />

                {/* Edit Agent Modal */}
                <GlassModal
                    open={editModal.isOpen}
                    onOpenChange={(open) => { if (!open) { editModal.forceClose(); setEditingAgent(null); } setErrorMsg(''); }}
                    title={t('agentsPage.modal.editTitle')}
                    onCloseAttempt={editModal.attemptClose}
                    isDirty={editModal.isDirty}
                >
                    {editingAgent && (
                        <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} className="flex flex-col gap-md">
                            <div className="form-group">
                                <label>{t('agentsPage.modal.sipNumber')}</label>
                                <Input
                                    value={editSipNumber}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEditSipNumber(e.target.value); editModal.markDirty(); }}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>{t('agentsPage.modal.sipPassword')}</label>
                                <div style={{ position: 'relative' }}>
                                    <Input
                                        type={showPassword ? 'text' : 'password'}
                                        value={editSipPassword}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEditSipPassword(e.target.value); editModal.markDirty(); }}
                                        style={{ paddingRight: '2.5rem' }}
                                        autoComplete="new-password"
                                    />
                                    <Button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={{
                                            position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: 'var(--text-muted)', padding: '4px',
                                            display: 'flex', alignItems: 'center'
                                        }}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </Button>
                                </div>
                            </div>

                            <div className="info-box" style={{
                                padding: '0.8rem',
                                borderRadius: 'var(--radius-sm)',
                                background: 'hsla(210, 100%, 95%, 1)',
                                border: '1px solid hsla(210, 100%, 85%, 1)',
                                fontSize: '0.85rem',
                                color: 'var(--text-secondary)'
                            }}>
                                <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(t('agentsPage.modal.editNote')) }} />
                            </div>

                            {errorMsg && (
                                <div style={{
                                    padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)',
                                    background: 'hsla(0, 80%, 95%, 1)', border: '1px solid hsla(0, 60%, 80%, 1)',
                                    color: 'hsla(0, 60%, 40%, 1)', fontSize: '0.85rem'
                                }}>{errorMsg}</div>
                            )}
                            <div className="flex gap-md" style={{ marginTop: '1rem' }}>
                                <MotionButton type="button" variant="secondary" className="w-full" onClick={editModal.attemptClose}>
                                    {t('agentsPage.modal.cancel')}
                                </MotionButton>
                                <MotionButton type="submit" className="w-full">
                                    {t('agentsPage.modal.save')}
                                </MotionButton>
                            </div>
                        </form>
                    )}
                </GlassModal>
                <ConfirmModal
                    open={editModal.showConfirm}
                    onClose={editModal.cancelClose}
                    onConfirm={() => { editModal.confirmClose(); setEditingAgent(null); }}
                    title={t('common.discardChangesTitle', 'Discard unsaved changes?')}
                    description={t('common.discardChangesDesc', 'You have unsaved changes. Are you sure you want to discard them?')}
                    confirmText={t('common.discard', 'Discard')}
                    cancelText={t('common.cancel', 'Cancel')}
                />

                {/* Delete Confirmation Modal */}
                <GlassModal
                    open={!!deletingAgent}
                    onOpenChange={(open) => !open && setDeletingAgent(null)}
                    title={t('agentsPage.modal.deleteTitle')}
                >
                    <div className="flex flex-col gap-md">
                        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(t('agentsPage.modal.deleteConfirm', { sipNumber: deletingAgent?.sipNumber })) }} />
                        </p>
                        <div className="flex gap-md" style={{ marginTop: '0.5rem' }}>
                            <MotionButton
                                variant="secondary"
                                className="w-full"
                                onClick={() => setDeletingAgent(null)}
                            >
                                {t('agentsPage.modal.cancel')}
                            </MotionButton>
                            <MotionButton
                                className="w-full"
                                style={{ background: 'var(--danger)', color: '#fff' }}
                                onClick={confirmDeleteAgent}
                            >
                                {t('agentsPage.modal.delete')}
                            </MotionButton>
                        </div>
                    </div>
                </GlassModal>

                {/* Batch Create Modal */}
                <GlassModal
                    open={isBatchOpen}
                    onOpenChange={(open) => { if (!open) { setIsBatchOpen(false); setBatchResult(null); } }}
                    title={t('agentsPage.modal.batchAddTitle')}
                >
                    {batchResult ? (
                        <div className="flex flex-col gap-md">
                            <div style={{
                                padding: '1rem', borderRadius: 'var(--radius-sm)',
                                background: 'hsla(150, 60%, 95%, 1)', border: '1px solid hsla(150, 60%, 80%, 1)',
                                color: 'hsla(150, 60%, 30%, 1)'
                            }}>
                                <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>
                                    {t('agentsPage.modal.batchCreated', { count: batchResult.created })}
                                </div>
                                {batchResult.skipped > 0 && (
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        {t('agentsPage.modal.batchSkipped', { count: batchResult.skipped, numbers: batchResult.skippedNumbers.join(', ') })}
                                    </div>
                                )}
                            </div>
                            <MotionButton className="w-full" onClick={() => { setIsBatchOpen(false); setBatchResult(null); }}>
                                {t('agentsPage.modal.done')}
                            </MotionButton>
                        </div>
                    ) : (
                        <form onSubmit={handleBatchCreate} className="flex flex-col gap-md">
                            <div className="form-group">
                                <label>{t('agentsPage.modal.startingSipNumber')}</label>
                                <Input
                                    placeholder="e.g. 8001"
                                    value={batchForm.startNumber}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBatchForm({ ...batchForm, startNumber: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('agentsPage.modal.numberOfAgents')}</label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 50"
                                    min={1}
                                    max={500}
                                    value={batchForm.count}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBatchForm({ ...batchForm, count: e.target.value })}
                                    required
                                />
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(t('agentsPage.modal.batchHint', { from: batchForm.startNumber || '?', to: batchForm.startNumber && batchForm.count ? String(Number(batchForm.startNumber) + Number(batchForm.count) - 1) : '?' })) }} />
                            </p>
                            <div className="flex gap-md" style={{ marginTop: '0.5rem' }}>
                                <MotionButton type="button" variant="secondary" className="w-full" onClick={() => setIsBatchOpen(false)}>
                                    {t('agentsPage.modal.cancel')}
                                </MotionButton>
                                <MotionButton type="submit" className="w-full" disabled={batchLoading}>
                                    {batchLoading ? t('agentsPage.modal.creating') : t('agentsPage.modal.create')}
                                </MotionButton>
                            </div>
                        </form>
                    )}
                </GlassModal>

                {/* Batch Policy Modal */}
                <GlassModal
                    open={isBatchPolicyOpen}
                    onOpenChange={(open) => { if (!open) setIsBatchPolicyOpen(false); }}
                    title={t('agentsPage.modal.batchPolicyTitle')}
                >
                    <div className="flex flex-col gap-md">
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(t('agentsPage.modal.batchPolicyHint', { count: selectedIds.size })) }} />
                        </p>
                        {POLICY_KEYS.map(pk => (
                            <div className="form-group" key={pk}>
                                <label className="flex items-center gap-sm">
                                    {POLICY_ICONS[pk]}
                                    {POLICY_LABELS[pk]} Policy
                                </label>
                                <Select
                                    value={batchPolicies[pk]}
                                    onChange={e => setBatchPolicies({ ...batchPolicies, [pk]: e.target.value as SettingPolicy })}
                                >
                                    <option value="disabled">{t('agentsPage.modal.disabled')}</option>
                                    <option value="optional">{t('agentsPage.modal.optional')}</option>
                                    <option value="enforced">{t('agentsPage.modal.enforced')}</option>
                                </Select>
                            </div>
                        ))}
                        <div className="flex gap-md" style={{ marginTop: '1rem' }}>
                            <MotionButton type="button" variant="secondary" className="w-full" onClick={() => setIsBatchPolicyOpen(false)}>
                                {t('agentsPage.modal.cancel')}
                            </MotionButton>
                            <MotionButton className="w-full" onClick={handleBatchPolicyApply}>
                                {t('agentsPage.modal.applyToAgents', { count: selectedIds.size })}
                            </MotionButton>
                        </div>
                    </div>
                </GlassModal>

                <ConfirmModal
                    open={!!deletingAgent}
                    onClose={() => setDeletingAgent(null)}
                    onConfirm={confirmDeleteAgent}
                    title={t('agentsPage.modal.deleteTitle')}
                    description={deletingAgent ? t('agentsPage.modal.deleteDesc', { sipNumber: deletingAgent.sipNumber }) : ''}
                    isDanger={true}
                />

                <ConfirmModal
                    open={batchDeleteConfirmOpen}
                    onClose={() => setBatchDeleteConfirmOpen(false)}
                    onConfirm={executeBatchDelete}
                    title={t('agentsPage.modal.deleteTitle', 'Delete Agents')}
                    description={t('common.discardChangesDesc', `Are you sure you want to delete ${selectedIds.size} selected agents? This action cannot be undone.`)}
                    confirmText={t('common.delete', 'Delete')}
                    isDanger={true}
                />
            </>)}
        </div >
    );
};

export default Agents;
