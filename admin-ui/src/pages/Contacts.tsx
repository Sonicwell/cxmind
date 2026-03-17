import { Checkbox } from '../components/ui/Checkbox';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookUser, Search, AlertCircle, Phone, MessageSquare, Plus, Edit2, Trash2, Merge, ChevronUp, ChevronDown, Download, ChevronLeft, ChevronRight, Tag, X, User } from 'lucide-react';
import { useDemoMode } from '../hooks/useDemoMode';
import AvatarInitials from '../components/ui/AvatarInitials';
import api from '../services/api';
import ContactFormModal from '../components/contacts/ContactFormModal';
import MergeContactModal from '../components/contacts/MergeContactModal';
import type { ContactFormData } from '../components/contacts/ContactFormModal';
import { toast } from 'react-hot-toast';
import '../styles/dashboard.css';

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/Select';
import { GlassModal } from '../components/ui/GlassModal';
import { getPlatformSettings } from '../services/api';

type ContactStage = string;

interface Contact {
    _id: string;
    displayName?: string;
    identifiers: {
        phone?: string[];
        email?: string[];
    };
    company?: string;
    tags: string[];
    conversationCount: number;
    lastContactedAt?: string;
    stage?: ContactStage;
}

export interface IContactStageConfig {
    id: string;
    label: string;
    i18nKey?: string;
    color: string;
    order: number;
}

const resolveColor = (colorName: string): { bg: string; text: string } => {
    const colorMap: Record<string, { bg: string; text: string }> = {
        slate: { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' },
        indigo: { bg: 'rgba(99,102,241,0.12)', text: '#818cf8' },
        blue: { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa' },
        emerald: { bg: 'rgba(16,185,129,0.12)', text: '#34d399' },
        green: { bg: 'rgba(34,197,94,0.12)', text: '#4ade80' },
        red: { bg: 'rgba(239,68,68,0.12)', text: '#f87171' },
    };
    return colorMap[colorName] || { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' };
};

const StageBadge: React.FC<{ stage?: ContactStage; stages: IContactStageConfig[] }> = ({ stage, stages }) => {
    const s = stage || 'Visitor';
    const { t } = useTranslation();
    const config = stages.find(c => c.id === s);
    const color = resolveColor(config?.color || 'slate');
    const displayLabel = config ? (config.i18nKey ? t(config.i18nKey as any) : config.label) : s;

    return (
        <span style={{
            fontSize: '0.72rem', fontWeight: 600, padding: '2px 10px',
            borderRadius: 999, background: color.bg, color: color.text,
            whiteSpace: 'nowrap',
        }}>
            {displayLabel}
        </span>
    );
};

// Visitor 判定：纯号码或无名字
const isVisitorName = (name?: string): boolean => {
    if (!name) return true;
    return /^(\+?[\d\s()-]+|Visitor-.+|Unknown)$/i.test(name);
};

interface PaginationInfo {
    total: number;
    page: number;
    limit: number;
    pages: number;
}

const Contacts: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const editId = searchParams.get('edit');
    const { t } = useTranslation();
    const { demoMode: isDemo } = useDemoMode();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [pagination, setPagination] = useState<PaginationInfo>({ total: 0, page: 1, limit: 20, pages: 1 });
    const [contactStages, setContactStages] = useState<IContactStageConfig[]>([]);

    useEffect(() => {
        getPlatformSettings().then(settings => {
            if (settings?.contactStages) {
                setContactStages(settings.contactStages.sort((a: any, b: any) => a.order - b.order));
            }
        }).catch(err => console.error("Failed to load platform settings:", err));
    }, []);

    // 排序
    const [sortBy, setSortBy] = useState<string>('lastContactedAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // 视图过滤 Tab
    const [stageFilter, setStageFilter] = useState<string>('');

    // Form Modal states
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);

    // Merge Modal states
    const [isMergeOpen, setIsMergeOpen] = useState(false);
    const [mergeTargetContact, setMergeTargetContact] = useState<Contact | null>(null);

    // Delete confirm
    const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);

    // U4: batch selection
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [batchTagOpen, setBatchTagOpen] = useState(false);
    const [batchTagInput, setBatchTagInput] = useState('');

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };
    const toggleSelectAll = () => {
        if (selected.size === contacts.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(contacts.map(c => c._id)));
        }
    };
    // 批量删除需二次确认
    const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
    const executeBatchDelete = async () => {
        if (selected.size === 0) return;
        try {
            await Promise.all(Array.from(selected).map(id => api.delete(`/contacts/${id}`)));
            toast.success(t('contacts.batchDeleteSuccess', { count: selected.size }));
            setSelected(new Set());
            fetchContacts(pagination.page);
        } catch {
            toast.error(t('contacts.batchDeleteError'));
        }
    };
    const batchTag = async () => {
        if (!batchTagInput.trim() || selected.size === 0) return;
        const tags = batchTagInput.split(',').map(s => s.trim()).filter(Boolean);
        try {
            await api.post('/contacts/batch/tag', { contactIds: Array.from(selected), tags });
            toast.success(t('contacts.batchTagSuccess', { count: selected.size }));
            setSelected(new Set());
            setBatchTagOpen(false);
            setBatchTagInput('');
            fetchContacts(pagination.page);
        } catch {
            toast.error(t('contacts.batchTagError'));
        }
    };

    // Debounced server-side search
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchContacts = useCallback(async (page = 1) => {
        if (isDemo) {
            setContacts([
                { _id: 'mock_c_001', displayName: 'Sarah Jenkins', identifiers: { phone: ['+1 (555) 019-2834'], email: ['sarah.j@acme.corp'] }, company: 'Acme Corp', tags: ['VIP', 'Churn-Risk'], conversationCount: 14, lastContactedAt: new Date(Date.now() - 3600_000 * 2).toISOString(), stage: 'Customer' },
                { _id: 'mock_c_002', displayName: 'Marcus Johnson', identifiers: { phone: ['+1 (555) 234-5678'], email: ['marcus@techflow.io'] }, company: 'TechFlow Inc', tags: ['Enterprise'], conversationCount: 28, lastContactedAt: new Date(Date.now() - 3600_000 * 8).toISOString(), stage: 'Customer' },
                { _id: 'mock_c_003', displayName: 'Emily Chen', identifiers: { phone: ['+86 138 0010 0003'], email: ['emily.chen@cloudbase.cn'] }, company: 'CloudBase', tags: ['APAC', 'Trial'], conversationCount: 5, lastContactedAt: new Date(Date.now() - 3600_000 * 24).toISOString(), stage: 'Lead' },
                { _id: 'mock_c_004', displayName: 'David Miller', identifiers: { phone: ['+44 7911 234567'] }, company: 'FinServ UK', tags: ['Compliance'], conversationCount: 9, lastContactedAt: new Date(Date.now() - 3600_000 * 48).toISOString(), stage: 'Customer' },
                { _id: 'mock_c_005', displayName: 'Priya Sharma', identifiers: { phone: ['+91 98765 43210'], email: ['priya@globalretail.in'] }, company: 'Global Retail', tags: ['SMB'], conversationCount: 3, lastContactedAt: new Date(Date.now() - 3600_000 * 72).toISOString(), stage: 'Lead' },
                { _id: 'mock_c_006', displayName: 'Alex Rodriguez', identifiers: { phone: ['+1 (555) 876-0099'], email: ['alex.r@startup.co'] }, company: 'StartupCo', tags: ['Prospect'], conversationCount: 1, lastContactedAt: new Date(Date.now() - 3600_000 * 120).toISOString(), stage: 'Prospect' },
                { _id: 'mock_c_007', displayName: 'Yuki Tanaka', identifiers: { phone: ['+81 90-1234-5678'], email: ['yuki@nexgen.jp'] }, company: 'NexGen Japan', tags: ['Churned', 'Win-Back'], conversationCount: 18, lastContactedAt: new Date(Date.now() - 3600_000 * 720).toISOString(), stage: 'Churned' },
                { _id: 'mock_c_008', displayName: undefined, identifiers: { phone: ['+1 (555) 000-9999'] }, company: undefined, tags: [], conversationCount: 0, lastContactedAt: undefined, stage: undefined },
            ]);
            setPagination({ total: 8, page: 1, limit: 20, pages: 1 });
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(pagination.limit),
                sortBy,
                sortOrder,
            });
            if (debouncedSearch) params.set('search', debouncedSearch);
            if (stageFilter) params.set('stage', stageFilter);

            const res = await api.get(`/contacts?${params.toString()}`);
            setContacts(res.data?.data || []);
            if (res.data?.pagination) {
                setPagination(res.data.pagination);
            }
        } catch (error) {
            console.error('Failed to fetch contacts:', error);
            toast.error(t('contacts.fetchError'));
        } finally {
            setLoading(false);
        }
    }, [isDemo, debouncedSearch, sortBy, sortOrder, stageFilter, pagination.limit, t]);

    useEffect(() => {
        fetchContacts(1);
    }, [fetchContacts]);

    const handleCreateOrUpdate = async (data: ContactFormData) => {
        try {
            const payload = {
                displayName: data.displayName,
                company: data.company,
                phone: data.phone.split(',').map(s => s.trim()).filter(Boolean)[0] || undefined,
                email: data.email.split(',').map(s => s.trim()).filter(Boolean)[0] || undefined,
                tags: data.tags.split(',').map(s => s.trim()).filter(Boolean),
            };

            if (editingContact) {
                await api.put(`/contacts/${editingContact._id}`, { ...payload, stage: data.stage });
            } else {
                await api.post('/contacts', payload);
            }
            fetchContacts(pagination.page);
        } catch (error) {
            console.error('Failed to save contact:', error);
            toast.error(t('contacts.saveError'));
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await api.delete(`/contacts/${deleteTarget._id}`);
            toast.success(t('contacts.deleteSuccess'));
            setDeleteTarget(null);
            fetchContacts(pagination.page);
        } catch (error) {
            console.error('Failed to delete contact:', error);
            toast.error(t('contacts.deleteError'));
        }
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        if (searchParams.has('edit')) {
            setSearchParams(prev => { prev.delete('edit'); return prev; }, { replace: true });
        }
    };

    const openCreateForm = () => {
        setEditingContact(null);
        setIsFormOpen(true);
        if (searchParams.has('edit')) {
            setSearchParams(prev => { prev.delete('edit'); return prev; }, { replace: true });
        }
    };

    const openEditForm = (contact: Contact, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingContact(contact);
        setIsFormOpen(true);
        if (searchParams.get('edit') !== contact._id) {
            setSearchParams(prev => { prev.set('edit', contact._id); return prev; }, { replace: true });
        }
    };

    // Deep link effect for editing
    useEffect(() => {
        if (!editId) {
            if (isFormOpen && editingContact) {
                setIsFormOpen(false);
                setEditingContact(null);
            }
            return;
        }

        // Prevent re-trigger if already open for this editId
        if (editingContact?._id === editId && isFormOpen) return;

        let isMounted = true;
        api.get(`/contacts/${editId}`).then(res => {
            if (!isMounted) return;
            if (res.data?.data) {
                setEditingContact(res.data.data);
                setIsFormOpen(true);
            }
        }).catch(() => {
            if (!isMounted) return;
            toast.error(t('contacts.fetchError', 'Contact not found'));
            setSearchParams(prev => { prev.delete('edit'); return prev; }, { replace: true });
        });

        return () => { isMounted = false; };
    }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

    const openMergeForm = (contact: Contact, e: React.MouseEvent) => {
        e.stopPropagation();
        setMergeTargetContact(contact);
        setIsMergeOpen(true);
    };

    const handleMerge = async (sourceContactId: string) => {
        if (!mergeTargetContact) return;
        try {
            await api.post(`/contacts/${mergeTargetContact._id}/merge`, { sourceContactId });
            fetchContacts(pagination.page);
            toast.success(t('contacts.mergeSuccess'));
        } catch (error: any) {
            console.error('Failed to merge contacts:', error);
            toast.error(error.response?.data?.error || t('contacts.mergeError'));
            throw error;
        }
    };

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (sortBy !== field) return null;
        return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
    };

    // CSV 导出
    const exportCSV = async () => {
        try {
            const params = new URLSearchParams({ limit: '10000', sortBy, sortOrder });
            if (debouncedSearch) params.set('search', debouncedSearch);
            if (stageFilter) params.set('stage', stageFilter);
            const res = await api.get(`/contacts?${params.toString()}`);
            const data: Contact[] = res.data?.data || [];

            const { toCSV, downloadCSV } = await import('../utils/export-csv');
            const columns = [
                { key: 'displayName' as const, label: t('contacts.col.contact', 'Name'), format: (r: Contact) => r.displayName || '' },
                { key: 'identifiers' as const, label: t('contacts.phone', 'Phone'), format: (r: Contact) => (r.identifiers?.phone || []).join('; ') },
                { key: 'identifiers' as const, label: t('contacts.email', 'Email'), format: (r: Contact) => (r.identifiers?.email || []).join('; ') },
                { key: 'company' as const, label: t('contacts.col.company', 'Company'), format: (r: Contact) => r.company || '' },
                { key: 'tags' as const, label: t('contacts.col.tags', 'Tags'), format: (r: Contact) => (r.tags || []).join('; ') },
                { key: 'stage' as const, label: t('contacts.col.stage', 'Stage'), format: (r: Contact) => r.stage || 'Visitor' },
                { key: 'conversationCount' as const, label: t('contacts.col.interactions', 'Interactions'), format: (r: Contact) => String(r.conversationCount || 0) },
                { key: 'lastContactedAt' as const, label: t('contacts.col.lastActive', 'Last Active'), format: (r: Contact) => r.lastContactedAt ? new Date(r.lastContactedAt).toLocaleDateString() : '' },
            ];
            const csv = toCSV(data, columns);
            downloadCSV(csv, `contacts_${new Date().toISOString().split('T')[0]}.csv`);
            toast.success(t('contacts.exportSuccess'));
        } catch (error) {
            console.error('Failed to export contacts:', error);
            toast.error(t('contacts.exportError'));
        }
    };

    return (
        <div className="dashboard-content">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                        <BookUser className="text-primary" size={28} />
                        {t('contacts.title')}
                    </h1>
                    <p className="text-secondary" style={{ marginTop: 8 }}>{t('contacts.subtitle')}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {!isDemo && (
                        <>
                            <Button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6 }} variant="secondary">
                                <Download size={16} />
                                {t('contacts.exportCSV')}
                            </Button>
                            <Button onClick={openCreateForm} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Plus size={18} />
                                {t('contacts.addContact')}
                            </Button>
                        </>
                    )}
                </div>
            </header>

            <div className="glass-panel" style={{ padding: 24 }}>
                {/* 视图过滤 Tab */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                    {[{ id: '', label: t('contacts.filter.all'), i18nKey: undefined as string | undefined }, ...contactStages].map(tab => {
                        const displayLabel = tab.id === '' ? tab.label : (tab.i18nKey ? t(tab.i18nKey as unknown as Parameters<typeof t>[0]) : tab.label);
                        return (
                            <Button
                                key={tab.id}
                                onClick={() => setStageFilter(tab.id)}
                                style={{
                                    padding: '6px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                                    fontSize: '0.82rem', fontWeight: 500, transition: 'all 0.15s',
                                    background: stageFilter === tab.id ? 'var(--primary)' : 'var(--surface-hover)',
                                    color: stageFilter === tab.id ? '#fff' : 'var(--text-secondary)',
                                }}
                            >
                                {displayLabel}
                            </Button>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: 16, marginBottom: 16, justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="search-box" style={{ flex: 1, maxWidth: 480, display: 'flex', alignItems: 'center', background: 'var(--surface-hover)', borderRadius: 8, padding: '0 12px' }}>
                        <Search size={18} className="text-secondary" />
                        <input
                            type="text"
                            placeholder={t('contacts.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ flex: 1, border: 'none', background: 'transparent', padding: '12px', color: 'var(--text-primary)', outline: 'none' }}
                        />
                    </div>
                    <span className="text-secondary" style={{ fontSize: '0.85rem' }}>
                        {t('contacts.totalContacts', { count: pagination.total })}
                    </span>
                </div>

                {loading ? (
                    <div className="table-responsive">
                        <Table className="data-table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead style={{ width: 40 }}></TableHead>
                                    <TableHead>{t('contacts.col.contact')}</TableHead>
                                    <TableHead>{t('contacts.col.contactInfo')}</TableHead>
                                    <TableHead>{t('contacts.col.company')}</TableHead>
                                    <TableHead>{t('contacts.col.tags')}</TableHead>
                                    <TableHead>{t('contacts.col.stage')}</TableHead>
                                    <TableHead>{t('contacts.col.interactions')}</TableHead>
                                    <TableHead>{t('contacts.col.lastActive')}</TableHead>
                                    <TableHead>{t('contacts.col.action')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[1, 2, 3, 4, 5].map(i => (
                                    <TableRow key={i}>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(j => (
                                            <TableCell key={j}>
                                                <div style={{ height: 16, background: 'var(--surface-hover)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6, width: j === 1 ? 20 : j === 8 ? 60 : `${50 + Math.random() * 40}%` }} />
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : contacts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
                        <AlertCircle size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
                        <p>{t('contacts.noContacts')}</p>
                        {!isDemo && (
                            <Button onClick={openCreateForm} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Plus size={18} /> {t('contacts.addFirstContact')}
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="table-responsive">
                        <Table className="data-table">
                            <TableHeader style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' }}>
                                <TableRow>
                                    <TableHead style={{ width: 40, textAlign: 'center' }}>
                                        <Checkbox checked={selected.size === contacts.length && contacts.length > 0} onChange={toggleSelectAll} />
                                    </TableHead>
                                    <TableHead onClick={() => handleSort('displayName')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {t('contacts.col.contact')} <SortIcon field="displayName" />
                                        </div>
                                    </TableHead>
                                    <TableHead>{t('contacts.col.contactInfo')}</TableHead>
                                    <TableHead onClick={() => handleSort('company')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {t('contacts.col.company')} <SortIcon field="company" />
                                        </div>
                                    </TableHead>
                                    <TableHead>{t('contacts.col.tags')}</TableHead>
                                    <TableHead>{t('contacts.col.stage')}</TableHead>
                                    <TableHead onClick={() => handleSort('conversationCount')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {t('contacts.col.interactions')} <SortIcon field="conversationCount" />
                                        </div>
                                    </TableHead>
                                    <TableHead onClick={() => handleSort('lastContactedAt')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {t('contacts.col.lastActive')} <SortIcon field="lastContactedAt" />
                                        </div>
                                    </TableHead>
                                    <TableHead>{t('contacts.col.action')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {contacts.map(contact => (
                                    <TableRow key={contact._id} onClick={() => navigate(`/contacts/${contact._id}`)} style={{ cursor: 'pointer', background: selected.has(contact._id) ? 'rgba(99,102,241,0.06)' : undefined }}>
                                        <TableCell style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                            <Checkbox checked={selected.has(contact._id)} onChange={() => { }} onClick={(e) => toggleSelect(contact._id, e)} />
                                        </TableCell>
                                        <TableCell>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                {isVisitorName(contact.displayName) ? (
                                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <User size={18} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
                                                    </div>
                                                ) : (
                                                    <AvatarInitials name={contact.displayName || 'Unknown'} size={36} />
                                                )}
                                                <span style={{ fontWeight: 500, color: isVisitorName(contact.displayName) ? 'var(--text-secondary)' : undefined }}>{contact.displayName || 'Unknown'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                                                {contact.identifiers.phone?.map(p => (
                                                    <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}><Phone size={12} /> {p}</span>
                                                ))}
                                                {contact.identifiers.email?.map(e => (
                                                    <span key={e} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>✉️ {e}</span>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>{contact.company || '-'}</TableCell>
                                        <TableCell>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {contact.tags.map(tag => (
                                                    <span key={tag} className="badge bg-surface text-secondary" style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 12 }}>{tag}</span>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <StageBadge stage={contact.stage} stages={contactStages} />
                                        </TableCell>
                                        <TableCell>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <MessageSquare size={14} className="text-secondary" />
                                                {contact.conversationCount}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-secondary" style={{ fontSize: '0.85rem' }}>
                                            {contact.lastContactedAt ? new Date(contact.lastContactedAt).toLocaleDateString() : t('contacts.never')}
                                        </TableCell>
                                        <TableCell>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <Button variant="secondary" size="icon" title={t('contacts.editContact')} onClick={(e) => openEditForm(contact, e)}>
                                                    <Edit2 size={16} />
                                                </Button>
                                                <Button variant="secondary" size="icon" title={t('contacts.mergeContact')} onClick={(e) => openMergeForm(contact, e)}>
                                                    <Merge size={16} />
                                                </Button>
                                                <Button variant="destructive" size="icon" title={t('contacts.deleteContact')} onClick={(e) => { e.stopPropagation(); setDeleteTarget(contact); }}>
                                                    <Trash2 size={16} />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* 分页控件 */}
                {pagination.pages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 }}>
                        <Button variant="secondary" size="sm"
                            disabled={pagination.page <= 1}
                            onClick={() => fetchContacts(pagination.page - 1)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                            <ChevronLeft size={14} /> {t('contacts.prevPage')}
                        </Button>
                        <span className="text-secondary" style={{ fontSize: '0.85rem' }}>
                            {pagination.page} / {pagination.pages}
                        </span>
                        <Button
                            variant="secondary" size="sm"
                            disabled={pagination.page >= pagination.pages}
                            onClick={() => fetchContacts(pagination.page + 1)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                            {t('contacts.nextPage')} <ChevronRight size={14} />
                        </Button>
                    </div>
                )}
            </div>

            {/* 单个删除确认 */}
            <ConfirmModal
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title={t('contacts.deleteConfirmTitle')}
                description={t('contacts.deleteConfirmMessage', { name: deleteTarget?.displayName || 'Unknown' })}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                isDanger
            />

            {/* 批量删除确认 */}
            <ConfirmModal
                open={batchDeleteConfirmOpen}
                onClose={() => setBatchDeleteConfirmOpen(false)}
                onConfirm={executeBatchDelete}
                title={t('contacts.batchDeleteConfirmTitle')}
                description={t('contacts.batchDeleteConfirmMessage', { count: selected.size })}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                isDanger
            />

            {/* U4: Batch Tag Modal */}
            <GlassModal
                open={batchTagOpen}
                onOpenChange={(open) => { if (!open) { setBatchTagOpen(false); setBatchTagInput(''); } }}
                title={t('contacts.batchTagTitle')}
                description={t('contacts.batchTagMessage', { count: selected.size })}
                style={{ maxWidth: 420, width: '90%' }}
            >
                <Input
                    type="text"
                    value={batchTagInput}
                    onChange={(e) => setBatchTagInput(e.target.value)}
                    placeholder={t('contacts.batchTagPlaceholder')}
                    style={{ marginBottom: 16 }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button variant="secondary" onClick={() => { setBatchTagOpen(false); setBatchTagInput(''); }}>{t('common.cancel')}</Button>
                    <Button onClick={batchTag} disabled={!batchTagInput.trim()}>{t('contacts.applyTags')}</Button>
                </div>
            </GlassModal>

            {/* U4: Batch Action Bar */}
            {selected.size > 0 && (
                <div className="contacts-batch-bar">
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('contacts.selectedCount', { count: selected.size })}</span>
                    <Select
                        className="contacts-batch-stage-select"
                        defaultValue=""
                        onChange={async (e: React.ChangeEvent<HTMLSelectElement>) => {
                            const stage = e.target.value;
                            if (!stage) return;
                            try {
                                await api.patch('/contacts/batch/stage', { ids: Array.from(selected), stage });
                                toast.success(t('contacts.batchStageSuccess', { count: selected.size }));
                                setSelected(new Set());
                                fetchContacts(pagination.page);
                            } catch {
                                toast.error(t('contacts.batchStageError'));
                            }
                            e.target.value = '';
                        }}
                    >
                        <option value="" disabled>{t('contacts.batchSetStage')}</option>
                        {contactStages.map(s => (
                            <option key={s.id} value={s.id}>{s.i18nKey ? t(s.i18nKey as unknown as Parameters<typeof t>[0]) : s.label}</option>
                        ))}
                    </Select>
                    <Button variant="secondary" size="sm" onClick={() => setBatchTagOpen(true)}>
                        <Tag size={14} /> {t('contacts.batchTag')}
                    </Button>
                    <Button onClick={() => setBatchDeleteConfirmOpen(true)} variant="destructive" size="sm">
                        <Trash2 size={14} /> {t('contacts.batchDelete')}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setSelected(new Set())} title={t('contacts.clearSelection')}>
                        <X size={16} />
                    </Button>
                </div>
            )}
            <ContactFormModal
                isOpen={isFormOpen}
                onClose={handleCloseForm}
                onSubmit={handleCreateOrUpdate}
                title={editingContact ? t('contacts.editContact') : t('contacts.addContact')}
                contactStages={contactStages}
                initialData={editingContact ? {
                    displayName: editingContact.displayName || '',
                    company: editingContact.company || '',
                    phone: editingContact.identifiers?.phone?.join(', ') || '',
                    email: editingContact.identifiers?.email?.join(', ') || '',
                    tags: editingContact.tags?.join(', ') || '',
                    stage: editingContact.stage || 'Visitor',
                } : undefined}
            />

            <MergeContactModal
                isOpen={isMergeOpen}
                onClose={() => setIsMergeOpen(false)}
                targetContact={mergeTargetContact}
                availableContacts={contacts}
                onMerge={handleMerge}
            />
        </div>
    );
};

export default Contacts;
