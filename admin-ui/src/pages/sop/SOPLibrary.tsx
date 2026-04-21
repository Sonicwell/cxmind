import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Workflow, Sparkles, Copy, Search, ArrowRight, PlayCircle, Bot, Plus, Pencil, Trash2, Send, Archive, MoreHorizontal, RotateCcw } from 'lucide-react';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { DropdownMenu } from '../../components/ui/DropdownMenu';
import api from '../../services/api';
import { Button } from '../../components/ui/button';
import { useDemoMode } from '../../hooks/useDemoMode';
import { getMockSOPs } from '../../services/mock-data';

interface SOPBlueprint {
    _id: string;
    name: string;
    description: string;
    category: string;
    status: string;
    nodes: any[];
    edges: any[];
    updatedAt: string;
}

const SOPLibrary: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const [sops, setSops] = useState<SOPBlueprint[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean, id: string | null }>({ isOpen: false, id: null });

    const fetchSOPs = async () => {
        try {
            if (demoMode) {
                const data = await getMockSOPs();
                setSops(data as any);
            } else {
                const res = await api.get('/sops');
                const data = res.data;
                const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.data?.data) ? data.data.data : []));
                setSops(arr);
            }
        } catch (err) {
            console.error('Failed to fetch SOPs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchSOPs(); }, []);

    const handleClone = async (sop: SOPBlueprint) => {
        try {
            const clonePayload = {
                name: `${sop.name} ${t('sopLibrary.copySuffix', '(Copy)')}`,
                description: sop.description,
                category: sop.category,
                status: 'DRAFT',
                nodes: sop.nodes,
                edges: sop.edges,
                startNodeId: sop.nodes.length > 0 ? sop.nodes[0].id : 'node_start',
            };
            const res = await api.post('/sops', clonePayload);
            const obj = res.data?.data || res.data;
            const newId = obj?._id;
            setSops(prev => [obj, ...prev]);
            navigate(`/sop/builder?id=${newId}`);
        } catch (err) {
            console.error('Failed to clone SOP', err);
        }
    };

    const handleDelete = async (sopId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        try {
            await api.delete(`/sops/${sopId}`);
            setSops(prev => prev.filter(s => s._id !== sopId));
        } catch (err) {
            console.error('Failed to delete SOP', err);
        } finally {
            setDeleteConfirm({ isOpen: false, id: null });
        }
    };

    const handleStatusChange = async (sopId: string, newStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED', e?: React.MouseEvent) => {
        e?.stopPropagation();
        try {
            await api.put(`/sops/${sopId}`, { status: newStatus });
            setSops(prev => prev.map(s => s._id === sopId ? { ...s, status: newStatus } : s));
        } catch (err) {
            console.error('Failed to update SOP status', err);
        }
    };

    const getCategoryBadge = (category: string) => {
        switch (category) {
            case 'CUSTOMER_SERVICE': return <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '4px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>{t('sopLibrary.category.customerService')}</span>;
            case 'SALES': return <span style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', padding: '4px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>{t('sopLibrary.category.sales')}</span>;
            case 'TECH_SUPPORT': return <span style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', padding: '4px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>{t('sopLibrary.category.techSupport')}</span>;
            default: return <span style={{ background: 'rgba(156, 163, 175, 0.15)', color: '#9ca3af', padding: '4px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>{category}</span>;
        }
    };

    const filteredSOPs = sops.filter(s => {
        const searchLow = searchQuery.toLowerCase();
        const nameMatch = (s.name || '').toLowerCase().includes(searchLow);
        const descMatch = (s.description || '').toLowerCase().includes(searchLow);
        const matchesSearch = nameMatch || descMatch;
        const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const getStatusBadge = (status: string) => {
        const styles: Record<string, { bg: string; color: string }> = {
            PUBLISHED: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981' },
            DRAFT: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' },
            ARCHIVED: { bg: 'rgba(100, 116, 139, 0.12)', color: '#64748b' },
        };
        const s = styles[status] || styles.ARCHIVED;
        return <span style={{ background: s.bg, color: s.color, padding: '3px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' as const }}>{status}</span>;
    };

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>{t('sopLibrary.loading')}</div>;
    }

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Workflow size={28} className="text-primary" />
                        {t('sopLibrary.title')}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                        {t('sopLibrary.subtitle')}
                    </p>
                </div>
                <Button
                    onClick={() => navigate('/sop/builder')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: 'var(--primary)', color: 'white',
                        border: 'none', padding: '0.65rem 1.25rem', borderRadius: '8px',
                        fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
                    }}
                >
                    <Plus size={18} /> {t('sopLibrary.createNew')}
                </Button>
            </div>

            <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder={t('sopLibrary.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem',
                            background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)',
                            borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                            fontSize: '0.9rem', outline: 'none'
                        }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'].map(st => (
                        <Button
                            key={st}
                            onClick={() => setStatusFilter(st)}
                            style={{
                                background: statusFilter === st ? 'var(--bg-sidebar)' : 'transparent',
                                border: statusFilter === st ? '1px solid var(--primary)' : '1px solid var(--border-light)',
                                color: statusFilter === st ? 'var(--primary)' : 'var(--text-secondary)',
                                padding: '0.5rem 1rem', borderRadius: '100px', fontSize: '0.8rem',
                                fontWeight: statusFilter === st ? 600 : 500, cursor: 'pointer'
                            }}
                        >
                            {t(`sopLibrary.filter${st.charAt(0) + st.slice(1).toLowerCase()}`, st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase())}
                        </Button>
                    ))}
                </div>
            </div>

            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: '1.5rem', overflowY: 'auto', paddingBottom: '2rem'
            }}>
                {filteredSOPs.map(sop => (
                    <div key={sop._id} style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        display: 'flex', flexDirection: 'column',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        cursor: 'pointer'
                    }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.15)';
                            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.borderColor = 'var(--glass-border)';
                        }}
                    >
                        <div style={{
                            height: '140px',
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(236,72,153,0.05) 100%)',
                            position: 'relative',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <div style={{
                                width: '80%', height: '80%',
                                background: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%236366f1\' fill-opacity=\'0.1\' fill-rule=\'evenodd\'%3E%3Ccircle cx=\'3\' cy=\'3\' r=\'3\'/%3E%3Ccircle cx=\'13\' cy=\'13\' r=\'3\'/%3E%3C/g%3E%3C/svg%3E")',
                                opacity: 0.5, position: 'absolute'
                            }} />

                            {/* Visual representation of an SOP flow */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1 }}>
                                <div style={{ background: 'var(--bg-card)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                    <Bot size={20} color="var(--primary)" />
                                </div>
                                <ArrowRight size={16} color="var(--text-muted)" />
                                <div style={{ background: 'var(--bg-card)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                    <Sparkles size={20} color="#ec4899" />
                                </div>
                                <ArrowRight size={16} color="var(--text-muted)" />
                                <div style={{ background: 'var(--bg-card)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                    <PlayCircle size={20} color="#10b981" />
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    {getCategoryBadge(sop.category)}
                                    {getStatusBadge(sop.status)}
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {(sop.nodes || []).length} {t('sopLibrary.nodes')}
                                </span>
                            </div>

                            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                {sop.name || t('sopLibrary.untitled')}
                            </h3>

                            <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, flex: 1 }}>
                                {sop.description || ''}
                            </p>

                            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                    <Workflow size={14} /> {t('sopLibrary.createdBy')}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {sop.status === 'DRAFT' && (
                                        <Button
                                            onClick={(e) => handleStatusChange(sop._id, 'PUBLISHED', e)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                background: '#10b981', color: 'white',
                                                border: 'none', padding: '6px 14px', borderRadius: '6px',
                                                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#059669'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#10b981'}
                                        >
                                            <Send size={14} /> {t('sopLibrary.publish', '发布')}
                                        </Button>
                                    )}
                                    {sop.status === 'PUBLISHED' && (
                                        <Button
                                            onClick={(e) => handleStatusChange(sop._id, 'ARCHIVED', e)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                background: 'var(--bg-subtle)', color: 'var(--text-secondary)',
                                                border: '1px solid var(--border-light)', padding: '6px 14px', borderRadius: '6px',
                                                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                        >
                                            <Archive size={14} /> {t('sopLibrary.archive', '归档')}
                                        </Button>
                                    )}
                                    {sop.status === 'ARCHIVED' && (
                                        <Button
                                            onClick={(e) => handleStatusChange(sop._id, 'DRAFT', e)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                background: 'var(--bg-subtle)', color: 'var(--text-secondary)',
                                                border: '1px solid var(--border-light)', padding: '6px 14px', borderRadius: '6px',
                                                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                        >
                                            <RotateCcw size={14} /> {t('sopLibrary.restoreToDraft', '恢复为草稿')}
                                        </Button>
                                    )}
                                    <DropdownMenu
                                        trigger={
                                            <button
                                                data-testid="sop-actions-trigger"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: 'var(--bg-subtle)', color: 'var(--text-secondary)',
                                                    border: '1px solid var(--border-light)', padding: '6px',
                                                    borderRadius: '6px', cursor: 'pointer', width: '32px', height: '32px',
                                                    transition: 'background 0.2s'
                                                }}
                                            >
                                                <MoreHorizontal size={16} />
                                            </button>
                                        }
                                        items={[
                                            {
                                                label: t('sopLibrary.edit'),
                                                icon: <Pencil size={14} />,
                                                onClick: () => navigate(`/sop/builder?id=${sop._id}`),
                                            },
                                            {
                                                label: t('sopLibrary.clone'),
                                                icon: <Copy size={14} />,
                                                onClick: () => handleClone(sop),
                                            },
                                            ...(sop.status === 'DRAFT' ? [{
                                                label: t('common.delete'),
                                                icon: <Trash2 size={14} style={{ color: 'var(--danger, #ef4444)' }} />,
                                                onClick: () => setDeleteConfirm({ isOpen: true, id: sop._id }),
                                            }] : []),
                                        ]}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filteredSOPs.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
                    <p>{t('sopLibrary.noResults')}</p>
                </div>
            )}

            <ConfirmModal
                open={deleteConfirm.isOpen}
                title={t('common.delete')}
                description={t('sopLibrary.confirmDelete')}
                onConfirm={() => deleteConfirm.id && handleDelete(deleteConfirm.id)}
                onClose={() => setDeleteConfirm({ isOpen: false, id: null })}
            />
        </div>
    );
};

export default SOPLibrary;
