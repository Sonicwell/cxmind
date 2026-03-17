import { Checkbox } from '../ui/Checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { Search, Shield, Link2 } from 'lucide-react';
import { GlassModal } from '../ui/GlassModal';
import { MotionButton } from '../ui/MotionButton';
import AvatarInitials from '../ui/AvatarInitials';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface Supervisor {
    _id: string;
    displayName: string;
    email: string;
    avatar?: string;
    groupIds?: string[];
    status: string;
}

interface GroupOption {
    _id: string;
    name: string;
    code: string;
}

const SupervisorsPanel: React.FC = () => {
    const { t } = useTranslation();
    const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
    const [groups, setGroups] = useState<GroupOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [assignSupervisor, setAssignSupervisor] = useState<Supervisor | null>(null);
    const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, groupsRes] = await Promise.all([
                api.get('/platform/users?role=supervisor'),
                api.get('/groups'),
            ]);
            setSupervisors(usersRes.data.data || []);
            setGroups(groupsRes.data.data || []);
        } catch (err) {
            console.error('Failed to load supervisors', err);
        }
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    const openAssign = (sup: Supervisor) => {
        setAssignSupervisor(sup);
        setSelectedGroupIds(sup.groupIds || []);
        setIsAssignOpen(true);
    };

    const handleSave = async () => {
        if (!assignSupervisor) return;
        try {
            // Use PATCH on the user to update groupIds directly
            await api.patch(`/platform/users/${assignSupervisor._id}`, {
                groupIds: selectedGroupIds,
            });
            setIsAssignOpen(false);
            fetchData();
        } catch (err) {
            console.error('Save failed', err);
        }
    };

    const toggleGroup = (id: string) => {
        setSelectedGroupIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const removeGroup = async (supId: string, gid: string) => {
        try {
            const sup = supervisors.find(s => s._id === supId);
            if (!sup) return;
            const newGroupIds = (sup.groupIds || []).filter(id => id !== gid);
            await api.patch(`/platform/users/${supId}`, { groupIds: newGroupIds });
            fetchData();
        } catch (err) {
            console.error('Remove group failed', err);
        }
    };

    const groupNameMap = new Map(groups.map(g => [g._id, g]));

    const filtered = supervisors.filter(s =>
        s.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--spacing-md)' }}>
                <div className="search-bar input-with-icon" style={{ width: '300px' }}>
                    <Search size={18} />
                    <Input style={{ border: "none", boxShadow: "none", background: "transparent", padding: 0 }} placeholder={t('org.supervisors.searchPlaceholder', 'Search supervisors...')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {t('org.supervisors.summary', '{{sups}} supervisor(s) • {{groups}} group(s)', { sups: supervisors.length, groups: groups.length })}
                </div>
            </div>

            {loading ? <div>{t('common.loading', 'Loading...')}</div> : (
                <div className="glass-panel" style={{ overflow: 'hidden', borderRadius: 'var(--radius-md)' }}>
                    <Table className="w-full" style={{ borderCollapse: 'collapse' }}>
                        <TableHeader>
                            <TableRow style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                                <TableHead style={{ padding: '1rem' }}>{t('org.supervisors.colSupervisor', 'Supervisor')}</TableHead>
                                <TableHead style={{ padding: '1rem' }}>{t('org.supervisors.colGroups', 'Managed Groups')}</TableHead>
                                <TableHead style={{ padding: '1rem' }}>{t('org.supervisors.colActions', 'Actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.map(sup => (
                                <TableRow key={sup._id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                    <TableCell style={{ padding: '1rem' }}>
                                        <div className="flex items-center gap-sm">
                                            <AvatarInitials name={sup.displayName} src={sup.avatar} size={32} />
                                            <div className="flex flex-col">
                                                <span style={{ fontWeight: 500 }}>{sup.displayName}</span>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{sup.email}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell style={{ padding: '1rem' }}>
                                        {sup.groupIds?.length ? (
                                            <div className="flex gap-xs" style={{ flexWrap: 'wrap' }}>
                                                {sup.groupIds.map(gid => {
                                                    const g = groupNameMap.get(gid);
                                                    return (
                                                        <span key={gid} className="flex items-center gap-xs" style={{
                                                            fontSize: '0.72rem', padding: '2px 10px', borderRadius: 12,
                                                            background: 'rgba(108,75,245,0.08)', border: '1px solid rgba(108,75,245,0.2)',
                                                            color: 'var(--primary)',
                                                        }}>
                                                            {g?.name || gid}
                                                            <Button
                                                                onClick={() => removeGroup(sup._id, gid)}
                                                                style={{
                                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                                    color: 'var(--text-muted)', padding: 0, fontSize: '0.8rem', lineHeight: 1,
                                                                }}
                                                                title={t('org.supervisors.removeGroup', 'Remove from this group')}
                                                            >
                                                                ×
                                                            </Button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                                {t('org.supervisors.noGroups', 'No groups assigned')}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell style={{ padding: '1rem' }}>
                                        <MotionButton variant="ghost" onClick={() => openAssign(sup)}>
                                            <Link2 size={14} /> {t('org.supervisors.manageGroups', 'Manage Groups')}
                                        </MotionButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filtered.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <Shield size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                                        <div>{t('org.supervisors.noSupervisors', 'No supervisors found. Create supervisor accounts from the Users page.')}</div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Manage Groups Modal */}
            <GlassModal open={isAssignOpen} onOpenChange={o => !o && setIsAssignOpen(false)} title={`${t('org.supervisors.manageGroups', 'Manage Groups')} — ${assignSupervisor?.displayName || ''}`}>
                <div style={{ maxHeight: 350, overflowY: 'auto' }}>
                    {groups.map(g => (
                        <label key={g._id} className="flex items-center gap-sm" style={{
                            padding: '10px 12px', cursor: 'pointer', borderRadius: 6,
                            background: selectedGroupIds.includes(g._id) ? 'rgba(108,75,245,0.08)' : 'transparent',
                        }}>
                            <Checkbox checked={selectedGroupIds.includes(g._id)} onChange={() => toggleGroup(g._id)} />
                            <span style={{ fontWeight: 500 }}>{g.name}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>#{g.code}</span>
                        </label>
                    ))}
                    {groups.length === 0 && (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                            {t('org.supervisors.noGroupsAvailable', 'No groups available. Create groups first.')}
                        </div>
                    )}
                </div>
                <div className="flex gap-md" style={{ marginTop: 16 }}>
                    <MotionButton variant="secondary" className="w-full" onClick={() => setIsAssignOpen(false)}>{t('common.cancel', 'Cancel')}</MotionButton>
                    <MotionButton className="w-full" onClick={handleSave}>
                        {t('common.saveCount', 'Save ({{count}})', { count: selectedGroupIds.length })}
                    </MotionButton>
                </div>
            </GlassModal>
        </div>
    );
};

export default SupervisorsPanel;
