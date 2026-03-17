import { Checkbox } from '../ui/Checkbox';
import { Select } from '../ui/Select';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { Plus, Search, Users, Trash2, UserPlus, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
import { GlassModal } from '../ui/GlassModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { MotionButton } from '../ui/MotionButton';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

interface Group {
    _id: string;
    name: string;
    code: string;
    type: 'inbound' | 'outbound' | 'blended' | 'backoffice';
    skillTags: string[];
    slaTarget?: { maxWaitSec: number; maxHandleSec: number };
    maxAgents?: number;
    status: 'active' | 'inactive';
    agentCount: number;
    supervisors: { _id: string; displayName: string; email: string }[];
}

interface AgentOption {
    _id: string;
    sipNumber: string;
    displayName?: string;
    groupId?: string;
}

interface SupervisorOption {
    _id: string;
    displayName: string;
    email: string;
    groupIds: string[];
}

const TYPE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
    inbound: { label: 'Inbound', emoji: '📞', color: '#22c55e' },
    outbound: { label: 'Outbound', emoji: '📤', color: '#3b82f6' },
    blended: { label: 'Blended', emoji: '🔄', color: '#8b5cf6' },
    backoffice: { label: 'Back Office', emoji: '🏢', color: '#f59e0b' },
};

const emptyForm = { name: '', code: '', type: 'blended', skillTags: '', maxWaitSec: '', maxHandleSec: '', maxAgents: '' };

const GroupsPanel: React.FC = () => {
    const { t } = useTranslation();
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);
    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [assignGroupId, setAssignGroupId] = useState('');
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);
    const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
    const [availableSupervisors, setAvailableSupervisors] = useState<SupervisorOption[]>([]);
    const [selectedSupIds, setSelectedSupIds] = useState<string[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState('');
    const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
    const [formDirty, setFormDirty] = useState(false);
    const [showFormDiscard, setShowFormDiscard] = useState(false);

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const res = await api.get('/groups');
            setGroups(res.data.data || []);
        } catch (err) {
            console.error('Failed to load groups', err);
        }
        setLoading(false);
    };

    useEffect(() => { fetchGroups(); }, []);

    // Open form for create or edit
    const openCreate = () => {
        setEditingGroup(null);
        setForm(emptyForm);
        setError('');
        setFormDirty(false);
        setShowFormDiscard(false);
        setIsFormOpen(true);
    };

    const openEdit = (g: Group) => {
        setEditingGroup(g);
        setForm({
            name: g.name,
            code: g.code,
            type: g.type,
            skillTags: g.skillTags?.join(', ') || '',
            maxWaitSec: g.slaTarget?.maxWaitSec?.toString() || '',
            maxHandleSec: g.slaTarget?.maxHandleSec?.toString() || '',
            maxAgents: g.maxAgents?.toString() || '',
        });
        setError('');
        setFormDirty(false);
        setShowFormDiscard(false);
        setIsFormOpen(true);
    };

    const buildPayload = () => ({
        name: form.name,
        code: form.code,
        type: form.type,
        skillTags: form.skillTags ? form.skillTags.split(',').map(s => s.trim()).filter(Boolean) : [],
        slaTarget: form.maxWaitSec ? {
            maxWaitSec: Number(form.maxWaitSec),
            maxHandleSec: Number(form.maxHandleSec) || undefined,
        } : undefined,
        maxAgents: form.maxAgents ? Number(form.maxAgents) : undefined,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            if (editingGroup) {
                await api.put(`/groups/${editingGroup._id}`, buildPayload());
            } else {
                await api.post('/groups', buildPayload());
            }
            setIsFormOpen(false);
            setForm(emptyForm);
            setEditingGroup(null);
            fetchGroups();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to save group');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/groups/${id}`);
            fetchGroups();
        } catch (err) {
            console.error('Failed to delete group', err);
        }
        setDeleteGroupId(null);
    };

    const openAssign = async (groupId: string) => {
        setAssignGroupId(groupId);
        try {
            const res = await api.get('/client/agents');
            const all: AgentOption[] = (res.data.data || []).map((a: any) => ({
                _id: a._id,
                sipNumber: a.sipNumber,
                displayName: a.boundUser?.displayName,
                groupId: typeof a.groupId === 'object' ? a.groupId?._id : a.groupId,
            }));
            setAvailableAgents(all);
            setSelectedAgentIds(all.filter(a => a.groupId === groupId).map(a => a._id));
        } catch { setAvailableAgents([]); }
        // Fetch supervisor users
        try {
            const supRes = await api.get('/platform/users');
            const supUsers: SupervisorOption[] = (supRes.data.data || supRes.data || []).filter((u: any) => u.role === 'supervisor').map((u: any) => ({
                _id: u._id,
                displayName: u.displayName || u.email,
                email: u.email,
                groupIds: u.groupIds || [],
            }));
            setAvailableSupervisors(supUsers);
            setSelectedSupIds(supUsers.filter(s => (s.groupIds || []).includes(groupId)).map(s => s._id));
        } catch { setAvailableSupervisors([]); }
        setIsAssignOpen(true);
    };

    const handleAssign = async () => {
        try {
            // Assign agents
            await api.post(`/groups/${assignGroupId}/assign-agents`, { agentIds: selectedAgentIds });
            // Assign supervisors — update each supervisor's groupIds
            for (const sup of availableSupervisors) {
                const shouldManage = selectedSupIds.includes(sup._id);
                const currentlyManages = (sup.groupIds || []).includes(assignGroupId);
                if (shouldManage && !currentlyManages) {
                    const newGroupIds = [...(sup.groupIds || []), assignGroupId];
                    await api.patch(`/platform/users/${sup._id}`, { groupIds: newGroupIds });
                } else if (!shouldManage && currentlyManages) {
                    const newGroupIds = (sup.groupIds || []).filter((g: string) => g !== assignGroupId);
                    await api.patch(`/platform/users/${sup._id}`, { groupIds: newGroupIds });
                }
            }
            setIsAssignOpen(false);
            fetchGroups();
        } catch (err) {
            console.error('Assign failed', err);
        }
    };

    const toggleAgent = (id: string) => {
        setSelectedAgentIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleSupervisor = (id: string) => {
        setSelectedSupIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleStatus = async (g: Group) => {
        try {
            await api.put(`/groups/${g._id}`, { status: g.status === 'active' ? 'inactive' : 'active' });
            fetchGroups();
        } catch (err) { console.error('Toggle status failed', err); }
    };

    const filtered = groups.filter(g =>
        g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        g.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            {/* Header */}
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--spacing-md)' }}>
                <div className="search-bar input-with-icon" style={{ width: '300px' }}>
                    <Search size={18} />
                    <Input style={{ border: "none", boxShadow: "none", background: "transparent", padding: 0 }} placeholder={t('org.groups.searchPlaceholder', 'Search groups...')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <MotionButton onClick={openCreate}>
                    <Plus size={18} /> {t('org.groups.newGroup', 'New Group')}
                </MotionButton>
            </div>

            {/* Group Cards */}
            {loading ? <div>{t('common.loading', 'Loading...')}</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                    {filtered.map(g => {
                        const typeConfig = TYPE_LABELS[g.type] || TYPE_LABELS.blended;
                        const expanded = expandedGroup === g._id;
                        return (
                            <div key={g._id} className="glass-panel" style={{ padding: 20, opacity: g.status === 'inactive' ? 0.5 : 1 }}>
                                <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '1rem' }}>{g.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>#{g.code}</div>
                                    </div>
                                    <div className="flex items-center gap-xs">
                                        <span style={{
                                            fontSize: '0.7rem', padding: '3px 10px', borderRadius: 12,
                                            background: `${typeConfig.color}15`, color: typeConfig.color, fontWeight: 600,
                                        }}>
                                            {typeConfig.emoji} {typeConfig.label}
                                        </span>
                                        {g.status === 'inactive' && (
                                            <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                                                {t('org.groups.statusInactive', 'Inactive')}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Stats row */}
                                <div className="flex gap-md" style={{ marginBottom: 12, fontSize: '0.82rem' }}>
                                    <div>
                                        <Users size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                        <strong>{g.agentCount}</strong> {t('org.groups.agentsLabel', 'agents')}
                                        {g.maxAgents ? <span style={{ color: 'var(--text-muted)' }}> / {g.maxAgents}</span> : null}
                                    </div>
                                    {g.slaTarget && (
                                        <div style={{ color: 'var(--text-muted)' }}>
                                            {t('org.groups.slaWait', 'SLA: {{sec}}s wait', { sec: g.slaTarget.maxWaitSec })}
                                        </div>
                                    )}
                                </div>

                                {/* Skill tags */}
                                {g.skillTags?.length > 0 && (
                                    <div className="flex gap-xs" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                                        {g.skillTags.map(tag => (
                                            <span key={tag} style={{
                                                fontSize: '0.65rem', padding: '2px 8px', borderRadius: 8,
                                                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                            }}>{tag}</span>
                                        ))}
                                    </div>
                                )}

                                {/* Supervisors */}
                                {g.supervisors?.length > 0 && (
                                    <div style={{ marginBottom: 12 }}>
                                        <Button
                                            style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            onClick={() => setExpandedGroup(expanded ? null : g._id)}
                                        >
                                            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                            {' '}{t('org.groups.supervisorsCount', '{{count}} supervisor(s)', { count: g.supervisors.length })}
                                        </Button>
                                        {expanded && (
                                            <div style={{ marginTop: 6, fontSize: '0.78rem' }}>
                                                {g.supervisors.map(s => (
                                                    <div key={s._id} style={{ padding: '2px 0', color: 'var(--text-secondary)' }}>
                                                        {s.displayName} <span style={{ color: 'var(--text-muted)' }}>({s.email})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-sm">
                                    <MotionButton variant="ghost" onClick={() => openAssign(g._id)}>
                                        <UserPlus size={14} /> {t('org.groups.assignBtn', 'Assign')}
                                    </MotionButton>
                                    <MotionButton variant="ghost" onClick={() => openEdit(g)} title={t('org.groups.editGroup', 'Edit Group')}>
                                        <Edit2 size={14} />
                                    </MotionButton>
                                    <MotionButton variant="ghost" style={{ color: 'var(--danger)' }} onClick={() => setDeleteGroupId(g._id)} title={t('org.groups.deleteGroup', 'Delete Group')}>
                                        <Trash2 size={14} />
                                    </MotionButton>
                                </div>
                            </div>
                        );
                    })}

                    {filtered.length === 0 && !loading && (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <Users size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                            <div>{t('org.groups.noGroups', 'No groups yet. Create your first group to organize agents.')}</div>
                        </div>
                    )}
                </div>
            )}

            {/* Create / Edit Group Modal */}
            <GlassModal
                open={isFormOpen}
                onOpenChange={o => { if (!o) { setIsFormOpen(false); setEditingGroup(null); } setError(''); }}
                title={editingGroup ? t('org.groups.editGroup', 'Edit Group') : t('org.groups.newGroup', 'New Group')}
                isDirty={formDirty}
                onCloseAttempt={() => { if (formDirty) setShowFormDiscard(true); else { setIsFormOpen(false); setEditingGroup(null); } }}
            >
                <form onSubmit={handleSubmit} className="flex flex-col gap-md">
                    <div className="form-group">
                        <label>{t('org.groups.formName', 'Group Name')}</label>
                        <Input placeholder={t('org.groups.formNamePlaceholder', 'e.g. CS Team 1')} value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, name: e.target.value }); setFormDirty(true); }} required />
                    </div>
                    <div className="form-group">
                        <label>{t('org.groups.formCode', 'Code')}</label>
                        <Input
                            placeholder={t('org.groups.formCodePlaceholder', 'e.g. cs-team-1')}
                            value={form.code}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }); setFormDirty(true); }}
                            required
                            disabled={!!editingGroup}
                            style={editingGroup ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                        />
                        {editingGroup && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('org.groups.formCodeNote', 'Code cannot be changed after creation')}</span>}
                    </div>
                    <div className="form-group">
                        <label>{t('org.groups.formType', 'Type')}</label>
                        <Select value={form.type} onChange={e => { setForm({ ...form, type: e.target.value }); setFormDirty(true); }}>
                            {Object.entries(TYPE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v.emoji} {v.label}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="form-group">
                        <label>{t('org.groups.formSkillTags', 'Skill Tags (comma separated)')}</label>
                        <Input placeholder={t('org.groups.formSkillTagsPlaceholder', 'billing, tech-support')} value={form.skillTags} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, skillTags: e.target.value }); setFormDirty(true); }} />
                    </div>
                    <div className="flex gap-md">
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>{t('org.groups.formMaxWait', 'Max Wait (sec)')}</label>
                            <Input type="number" value={form.maxWaitSec} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, maxWaitSec: e.target.value }); setFormDirty(true); }} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>{t('org.groups.formMaxAgents', 'Max Agents')}</label>
                            <Input type="number" value={form.maxAgents} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, maxAgents: e.target.value }); setFormDirty(true); }} />
                        </div>
                    </div>
                    {/* Status toggle for edit mode */}
                    {editingGroup && (
                        <div className="form-group">
                            <label className="flex items-center gap-sm" style={{ cursor: 'pointer' }}>
                                <Checkbox
                                    checked={editingGroup.status === 'active'}
                                    onChange={() => toggleStatus(editingGroup)}
                                />
                                {t('org.groups.formActive', 'Active')}
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    {t('org.groups.formActiveNote', '(Inactive groups are hidden from filters)')}
                                </span>
                            </label>
                        </div>
                    )}
                    {error && <div style={{ padding: '0.5rem', borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}
                    <div className="flex gap-md" style={{ marginTop: 8 }}>
                        <MotionButton type="button" variant="secondary" className="w-full" onClick={() => { if (formDirty) setShowFormDiscard(true); else { setIsFormOpen(false); setEditingGroup(null); } }}>{t('common.cancel', 'Cancel')}</MotionButton>
                        <MotionButton type="submit" className="w-full">{editingGroup ? t('org.groups.saveChanges', 'Save Changes') : t('org.groups.create', 'Create')}</MotionButton>
                    </div>
                </form>
            </GlassModal>

            <ConfirmModal
                open={showFormDiscard}
                onClose={() => setShowFormDiscard(false)}
                onConfirm={() => { setShowFormDiscard(false); setIsFormOpen(false); setEditingGroup(null); setFormDirty(false); }}
                title={t('common.discardChangesTitle', 'Discard unsaved changes?')}
                description={t('common.discardChangesDesc', 'You have unsaved changes. Are you sure you want to discard them?')}
                confirmText={t('common.discard', 'Discard')}
                cancelText={t('common.cancel', 'Cancel')}
            />

            <GlassModal open={isAssignOpen} onOpenChange={o => !o && setIsAssignOpen(false)} title={t('org.groups.assignTitle', 'Assign to Group')}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {/* Left: Agents */}
                    <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('agentsPage.tabs.agents', 'Agents')}</div>
                        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {availableAgents.map(a => {
                                const inOtherGroup = a.groupId && a.groupId !== assignGroupId;
                                return (
                                    <label key={a._id} className="flex items-center gap-sm" style={{
                                        padding: '6px 10px', cursor: inOtherGroup ? 'not-allowed' : 'pointer', borderRadius: 6,
                                        background: selectedAgentIds.includes(a._id) ? 'rgba(108,75,245,0.08)' : 'transparent',
                                        opacity: inOtherGroup ? 0.4 : 1,
                                    }}>
                                        <Checkbox checked={selectedAgentIds.includes(a._id)} disabled={!!inOtherGroup} onChange={() => toggleAgent(a._id)} />
                                        <span style={{ fontWeight: 500, fontSize: '0.82rem' }}>{a.sipNumber}</span>
                                        {a.displayName && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>— {a.displayName}</span>}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                    {/* Right: Supervisors */}
                    <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('agentsPage.tabs.supervisors', 'Supervisors')}</div>
                        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {availableSupervisors.length === 0 ? (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: 12, textAlign: 'center' }}>
                                    {t('org.groups.noSupervisorsFound', 'No supervisors found')}
                                </div>
                            ) : availableSupervisors.map(s => (
                                <label key={s._id} className="flex items-center gap-sm" style={{
                                    padding: '6px 10px', cursor: 'pointer', borderRadius: 6,
                                    background: selectedSupIds.includes(s._id) ? 'rgba(108,75,245,0.08)' : 'transparent',
                                }}>
                                    <Checkbox checked={selectedSupIds.includes(s._id)} onChange={() => toggleSupervisor(s._id)} />
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: '0.82rem' }}>{s.displayName}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{s.email}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex gap-md" style={{ marginTop: 16 }}>
                    <MotionButton variant="secondary" className="w-full" onClick={() => setIsAssignOpen(false)}>{t('common.cancel', 'Cancel')}</MotionButton>
                    <MotionButton className="w-full" onClick={handleAssign}>
                        {t('org.groups.assignConfirm', 'Assign {{agents}} Agents · {{sups}} Supervisors', { agents: selectedAgentIds.length, sups: selectedSupIds.length })}
                    </MotionButton>
                </div>
            </GlassModal>

            <ConfirmModal
                open={!!deleteGroupId}
                onClose={() => setDeleteGroupId(null)}
                onConfirm={() => { if (deleteGroupId) handleDelete(deleteGroupId); }}
                title={t('org.groups.deleteGroup', 'Delete Group')}
                description={t('org.groups.deleteGroupDesc', 'Delete this group? Agents will be unassigned.')}
            />
        </div>
    );
};

export default GroupsPanel;
