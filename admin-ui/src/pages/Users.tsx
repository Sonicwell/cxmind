import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select } from '../components/ui/Select';
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { getMockUsers } from '../services/mock-data';
import { useDemoMode } from '../hooks/useDemoMode';
import { Plus, Search, MoreVertical, Shield, Phone, Trash2, Camera, X, Key, Eye, EyeOff, Activity, Users as UsersIcon, Star, User as UserIcon, RefreshCw } from 'lucide-react';
import { GlassModal } from '../components/ui/GlassModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { MotionButton } from '../components/ui/MotionButton';
import { Input } from '../components/ui/input';
import { useAuth } from '../context/AuthContext';
import AvatarInitials from '../components/ui/AvatarInitials';
import { sanitizeHtml } from '../utils/sanitize';
import { Button } from '../components/ui/button';
import { Navigate } from 'react-router-dom';
import { useDirtyModal } from '../hooks/useDirtyModal';

interface User {
    _id: string;
    email: string;
    displayName: string;
    avatar?: string;
    role: string;
    status: 'active' | 'inactive';
    isSystem?: boolean;
    agentId?: { _id: string; sipNumber: string; displayName: string };
    lastLogin?: string;
    createdAt: string;
}

interface AvailableAgent {
    _id: string;
    sipNumber: string;
    displayName: string;
}

const SYSTEM_ROLES = [
    { slug: 'platform_admin', name: 'Platform Admin', desc: 'Full system access and configuration (Global Scope).', icon: Shield },
    { slug: 'ops_manager', name: 'Ops Manager', desc: 'Operational dashboards and team management (Global Scope).', icon: Activity },
    { slug: 'qa_manager', name: 'QA Manager', desc: 'Quality inspection and rules (Global Scope).', icon: Eye },
    { slug: 'supervisor', name: 'Supervisor', desc: 'Team oversight and basic reporting (Group Scope).', icon: UsersIcon },
    { slug: 'senior_agent', name: 'Senior Agent', desc: 'Advanced calling and KB access (Personal Scope).', icon: Star },
    { slug: 'agent', name: 'Agent', desc: 'Standard calling and copilot access (Personal Scope).', icon: UserIcon }
];

const Users: React.FC = () => {
    const { t } = useTranslation();
    const { demoMode } = useDemoMode();
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [availableAgents, setAvailableAgents] = useState<AvailableAgent[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const createModal = useDirtyModal();
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [deletingUser, setDeletingUser] = useState<User | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [avatarUploading, setAvatarUploading] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    // Password reset state
    const [passwordResetUser, setPasswordResetUser] = useState<User | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);
    const [showCreatePassword, setShowCreatePassword] = useState(false);

    // 16位: 大小写+数字+特殊字符各至少1个
    const generatePassword = () => {
        const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lower = 'abcdefghijklmnopqrstuvwxyz';
        const digits = '0123456789';
        const symbols = '!@#$%^&*_+-=';
        const all = upper + lower + digits + symbols;
        const arr = new Uint32Array(16);
        crypto.getRandomValues(arr);
        const mandatory = [
            upper[arr[0] % upper.length],
            lower[arr[1] % lower.length],
            digits[arr[2] % digits.length],
            symbols[arr[3] % symbols.length],
        ];
        const rest = Array.from({ length: 12 }, (_, i) => all[arr[i + 4] % all.length]);
        // Fisher-Yates shuffle
        const chars = [...mandatory, ...rest];
        for (let i = chars.length - 1; i > 0; i--) {
            const j = arr[i] % (i + 1);
            [chars[i], chars[j]] = [chars[j], chars[i]];
        }
        return chars.join('');
    };

    // Create Form State
    const [newUser, setNewUser] = useState({
        email: '',
        password: '',
        displayName: '',
        role: 'platform_admin',
        agentId: ''
    });

    // Edit Form State
    const [editForm, setEditForm] = useState({
        displayName: '',
        email: '',
        role: '',
        status: 'active' as string,
        agentId: ''
    });

    // Searchable agent picker state
    const [agentSearch, setAgentSearch] = useState('');
    const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
    const agentDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
                setAgentDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const fetchData = async () => {
        try {
            if (demoMode) {
                const res = await getMockUsers();
                setUsers(res.data.data as any);
            } else {
                const [usersRes, agentsRes] = await Promise.all([
                    api.get('/platform/users'),
                    api.get('/platform/agents/available')
                ]);
                setUsers(usersRes.data.data);
                setAvailableAgents(agentsRes.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch data', error);
        } finally {
            setLoading(false);
        }
    };

    if (currentUser && currentUser.role !== 'platform_admin' && currentUser.role !== 'ops_manager') {
        return <Navigate to="/dashboard" replace />;
    }

    useEffect(() => {
        fetchData();
    }, [demoMode]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload: any = { ...newUser };
            if (!payload.agentId) delete payload.agentId;

            await api.post('/platform/users', payload);
            createModal.forceClose();
            setNewUser({ email: '', password: '', displayName: '', role: 'platform_admin', agentId: '' });
            fetchData();
        } catch (error: any) {
            console.error('Failed to create user', error);
            setErrorMsg(error.response?.data?.error || 'Failed to create user');
        }
    };

    const handleEditUser = (user: User) => {
        setEditForm({
            displayName: user.displayName,
            email: user.email,
            role: user.role,
            status: user.status || 'active',
            agentId: user.agentId?._id || ''
        });
        setEditingUser(user);
        // Refresh available agents when opening edit modal
        api.get('/platform/agents/available').then(res => {
            setAvailableAgents(res.data.data);
        });
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;

        try {
            await api.patch(`/platform/users/${editingUser._id}`, {
                displayName: editForm.displayName,
                email: editForm.email,
                role: editForm.role,
                status: editForm.status,
                agentId: editForm.agentId || null
            });
            setEditingUser(null);
            fetchData();
        } catch (error: any) {
            console.error('Failed to update user', error);
            setErrorMsg(error.response?.data?.error || 'Failed to update user');
        }
    };

    const handleAvatarUpload = async (file: File) => {
        if (!editingUser) return;
        setAvatarUploading(true);
        try {
            const formData = new FormData();
            formData.append('avatar', file);
            const res = await api.post(`/platform/users/${editingUser._id}/avatar`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            // 更新本地state
            setEditingUser({ ...editingUser, avatar: res.data.avatarUrl });
            setUsers(prev => prev.map(u => u._id === editingUser._id ? { ...u, avatar: res.data.avatarUrl } : u));
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'Failed to upload avatar');
        } finally {
            setAvatarUploading(false);
        }
    };

    const handleAvatarDelete = async () => {
        if (!editingUser) return;
        setAvatarUploading(true);
        try {
            await api.delete(`/platform/users/${editingUser._id}/avatar`);
            setEditingUser({ ...editingUser, avatar: undefined });
            setUsers(prev => prev.map(u => u._id === editingUser._id ? { ...u, avatar: undefined } : u));
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'Failed to delete avatar');
        } finally {
            setAvatarUploading(false);
        }
    };

    const handleDeleteUser = async (user: User) => {
        if (user.isSystem) {
            return;
        }
        setDeletingUser(user);
    };

    const confirmDeleteUser = async () => {
        if (!deletingUser) return;
        try {
            await api.delete(`/platform/users/${deletingUser._id}`);
            setDeletingUser(null);
            fetchData();
        } catch (error: any) {
            console.error('Failed to delete user', error);
            setErrorMsg(error.response?.data?.error || 'Failed to delete user');
            setDeletingUser(null);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordResetUser) return;
        setErrorMsg('');
        try {
            await api.patch(`/platform/users/${passwordResetUser._id}/password`, { newPassword });
            setPasswordResetSuccess(true);
            setTimeout(() => {
                setPasswordResetUser(null);
                setNewPassword('');
                setShowNewPassword(false);
                setPasswordResetSuccess(false);
            }, 1500);
        } catch (error: any) {
            setErrorMsg(error.response?.data?.error || 'Failed to reset password');
        }
    };

    const filteredUsers = users.filter(user =>
        (user.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getRoleColor = (role: string) => {
        switch (role) {
            case 'platform_admin': return 'var(--primary)';
            case 'supervisor': return 'var(--success)';
            case 'agent': return 'var(--warning)';
            default: return 'var(--text-secondary)';
        }
    };

    // For create modal: show all available agents
    // For edit modal: show available agents + the currently bound agent (so it remains selectable)
    const getAgentOptions = (currentAgentId?: string) => {
        const options = [...availableAgents];
        // If editing and user has a bound agent that's not in the available list, add it
        if (currentAgentId && editingUser?.agentId && !options.find(a => a._id === currentAgentId)) {
            options.unshift(editingUser.agentId);
        }
        return options;
    };

    const renderAgentPicker = (
        value: string,
        onChange: (id: string) => void,
        agents: AvailableAgent[]
    ) => {
        const selectedAgent = agents.find(a => a._id === value);
        const filtered = agents.filter(a =>
            (a.sipNumber || '').toLowerCase().includes(agentSearch.toLowerCase())
        );

        return (
            <div ref={agentDropdownRef} style={{ position: 'relative' }}>
                {selectedAgent ? (
                    <div style={{
                        ...inputStyle,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer'
                    }}>
                        <span>{selectedAgent.sipNumber}</span>
                        <Button type="button" onClick={() => { onChange(''); setAgentSearch(''); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem' }}>
                            ✕
                        </Button>
                    </div>
                ) : (
                    <Input
                        placeholder={t('usersPage.modal.searchBySip')}
                        value={agentSearch}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAgentSearch(e.target.value); setAgentDropdownOpen(true); }}
                        onFocus={() => setAgentDropdownOpen(true)}
                        style={inputStyle}
                    />
                )}
                {agentDropdownOpen && !selectedAgent && (
                    <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                        maxHeight: '160px', overflowY: 'auto',
                        background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                        borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        marginTop: '2px'
                    }}>
                        <div
                            style={{ padding: '0.5rem 0.8rem', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem' }}
                            onMouseDown={() => { onChange(''); setAgentSearch(''); setAgentDropdownOpen(false); }}
                        >
                            {t('usersPage.modal.noneUnbound')}
                        </div>
                        {filtered.length === 0 && (
                            <div style={{ padding: '0.5rem 0.8rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                {t('usersPage.modal.noAgentsFound')}
                            </div>
                        )}
                        {filtered.map(agent => (
                            <div
                                key={agent._id}
                                style={{
                                    padding: '0.5rem 0.8rem', cursor: 'pointer',
                                    borderTop: '1px solid var(--glass-border)'
                                }}
                                onMouseDown={() => {
                                    onChange(agent._id);
                                    setAgentSearch('');
                                    setAgentDropdownOpen(false);
                                }}
                            >
                                <div style={{ fontWeight: 500 }}>{agent.sipNumber}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const selectStyle = {
        padding: '0.8rem', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--glass-border)', background: 'var(--bg-card)',
        color: 'var(--text-primary)', width: '100%'
    };

    const inputStyle = {
        padding: '0.8rem', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--glass-border)', background: 'var(--bg-card)',
        color: 'var(--text-primary)'
    };

    return (
        <div className="page-content">
            <div className="page-header flex justify-between items-center" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div className="search-bar input-with-icon" style={{ width: '300px' }}>
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder={t('usersPage.searchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <MotionButton onClick={() => {
                    api.get('/platform/agents/available').then(res => setAvailableAgents(res.data.data));
                    setNewUser({ email: '', password: '', displayName: '', role: 'platform_admin', agentId: '' });
                    createModal.open();
                }}>
                    <Plus size={18} />
                    {t('usersPage.addUser')}
                </MotionButton>
            </div>

            {loading ? (
                <div>{t('common.loading')}...</div>
            ) : (
                <div className="glass-panel" style={{ overflow: 'hidden', borderRadius: 'var(--radius-md)' }}>
                    <Table className="w-full" style={{ borderCollapse: 'collapse' }}>
                        <TableHeader>
                            <TableRow style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                                <TableHead style={{ padding: '1rem' }}>{t('usersPage.col.user')}</TableHead>
                                <TableHead style={{ padding: '1rem' }}>{t('usersPage.col.role')}</TableHead>
                                <TableHead style={{ padding: '1rem' }}>{t('usersPage.col.sipNumber')}</TableHead>
                                <TableHead style={{ padding: '1rem' }}>{t('usersPage.col.status')}</TableHead>
                                <TableHead style={{ padding: '1rem' }}>{t('usersPage.col.lastLogin')}</TableHead>
                                <TableHead style={{ padding: '1rem' }}>{t('usersPage.col.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredUsers.map(user => (
                                <TableRow key={user._id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                    <TableCell style={{ padding: '1rem' }}>
                                        <div className="flex items-center gap-sm">
                                            <AvatarInitials name={user.displayName} src={user.avatar} size={32} />
                                            <div className="flex flex-col">
                                                <span style={{ fontWeight: 500 }}>{user.displayName}</span>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user.email}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell style={{ padding: '1rem' }}>
                                        <div className="flex items-center gap-sm" style={{ color: getRoleColor(user.role) }}>
                                            <Shield size={14} />
                                            {user.role}
                                        </div>
                                    </TableCell>
                                    <TableCell style={{ padding: '1rem' }}>
                                        {user.agentId?.sipNumber ? (
                                            <div className="flex items-center gap-sm" style={{ color: 'var(--text-secondary)' }}>
                                                <Phone size={14} />
                                                {user.agentId.sipNumber}
                                            </div>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                                        )}
                                    </TableCell>
                                    <TableCell style={{ padding: '1rem' }}>
                                        <span style={{
                                            padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-full)',
                                            fontSize: '0.8rem', fontWeight: 600,
                                            background: user.status === 'active' ? 'hsla(150, 60%, 90%, 1)' : 'hsla(0, 0%, 90%, 1)',
                                            color: user.status === 'active' ? 'var(--success)' : 'var(--text-muted)'
                                        }}>
                                            {(user.status || 'inactive').toUpperCase()}
                                        </span>
                                    </TableCell>
                                    <TableCell style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                        {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : t('usersPage.never')}
                                    </TableCell>
                                    <TableCell style={{ padding: '1rem' }}>
                                        <div className="flex items-center gap-sm">
                                            <MotionButton variant="ghost" onClick={() => handleEditUser(user)}>
                                                <MoreVertical size={18} />
                                            </MotionButton>
                                            <MotionButton
                                                variant="ghost"

                                                onClick={() => { setPasswordResetUser(user); setNewPassword(''); setErrorMsg(''); setPasswordResetSuccess(false); setShowNewPassword(false); }}
                                                title={t('usersPage.modal.resetPasswordTitle')}
                                                style={{ color: 'var(--warning)' }}
                                            >
                                                <Key size={16} />
                                            </MotionButton>
                                            <MotionButton
                                                variant="ghost"

                                                onClick={() => handleDeleteUser(user)}
                                                disabled={user._id === currentUser?.id || user.isSystem}
                                                style={{
                                                    opacity: user._id === currentUser?.id || user.isSystem ? 0.3 : 1,
                                                    color: 'var(--danger)'
                                                }}
                                            >
                                                <Trash2 size={16} />
                                            </MotionButton>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Create User Modal */}
            <GlassModal
                open={createModal.isOpen}
                onOpenChange={(open) => { if (!open) { createModal.forceClose(); setShowCreatePassword(false); } setErrorMsg(''); }}
                title={t('usersPage.modal.addTitle')}
                onCloseAttempt={createModal.attemptClose}
                isDirty={createModal.isDirty}
            >
                <form onSubmit={handleCreateUser} className="flex flex-col gap-md" autoComplete="off">
                    <div className="form-group">
                        <label>{t('usersPage.modal.displayName')}</label>
                        <Input
                            value={newUser.displayName}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setNewUser({ ...newUser, displayName: e.target.value }); createModal.markDirty(); }}
                            required
                            style={inputStyle}
                        />
                    </div>
                    <div className="form-group">
                        <label>{t('usersPage.modal.email')}</label>
                        <Input
                            type="email"
                            value={newUser.email}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setNewUser({ ...newUser, email: e.target.value }); createModal.markDirty(); }}
                            required
                            autoComplete="off"
                            style={inputStyle}
                        />
                    </div>
                    <div className="form-group">
                        <label>{t('usersPage.modal.password')}</label>
                        <div style={{ position: 'relative' }}>
                            <Input
                                type={showCreatePassword ? 'text' : 'password'}
                                value={newUser.password}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setNewUser({ ...newUser, password: e.target.value }); createModal.markDirty(); }}
                                required
                                autoComplete="new-password"
                                style={{ ...inputStyle, paddingRight: '4.5rem' }}
                            />
                            <div style={{
                                position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)',
                                display: 'flex', alignItems: 'center', gap: '0.2rem'
                            }}>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        const pw = generatePassword();
                                        setNewUser({ ...newUser, password: pw });
                                        setShowCreatePassword(true);
                                    }}
                                    title={t('usersPage.modal.generatePassword')}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--primary)', display: 'flex', alignItems: 'center', padding: '2px'
                                    }}
                                >
                                    <RefreshCw size={15} />
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px'
                                    }}
                                >
                                    {showCreatePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className="form-group">
                        <label>{t('usersPage.modal.role')}</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '0.25rem' }}>
                            {SYSTEM_ROLES.map(role => {
                                const Icon = role.icon;
                                const isSelected = newUser.role === role.slug;
                                return (
                                    <div
                                        key={role.slug}
                                        onClick={() => { setNewUser({ ...newUser, role: role.slug }); createModal.markDirty(); }}
                                        style={{
                                            padding: '0.75rem',
                                            borderRadius: 'var(--radius-sm)',
                                            border: isSelected ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                                            background: isSelected ? 'hsla(150, 60%, 50%, 0.05)' : 'var(--bg-card)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            gap: '0.5rem',
                                            alignItems: 'flex-start',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>
                                            <Icon size={16} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: isSelected ? 'var(--primary)' : 'var(--text-primary)', marginBottom: '0.15rem' }}>
                                                {role.name}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.2 }}>
                                                {role.desc}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    <div className="form-group">
                        <label>{t('usersPage.modal.bindAgentOptional')}</label>
                        {renderAgentPicker(
                            newUser.agentId,
                            (id) => { setNewUser({ ...newUser, agentId: id }); createModal.markDirty(); },
                            availableAgents
                        )}
                    </div>

                    {errorMsg && (
                        <div style={{
                            padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)',
                            background: 'hsla(0, 80%, 95%, 1)', border: '1px solid hsla(0, 60%, 80%, 1)',
                            color: 'hsla(0, 60%, 40%, 1)', fontSize: '0.85rem'
                        }}>{errorMsg}</div>
                    )}
                    <div className="flex gap-md" style={{ marginTop: '1rem' }}>
                        <MotionButton type="button" variant="secondary" className="w-full" onClick={createModal.attemptClose}>
                            {t('usersPage.modal.cancel')}
                        </MotionButton>
                        <MotionButton type="submit" className="w-full">
                            {t('usersPage.modal.createUser')}
                        </MotionButton>
                    </div>
                </form>
            </GlassModal>

            {/* Discard unsaved changes confirm */}
            <ConfirmModal
                open={createModal.showConfirm}
                onClose={createModal.cancelClose}
                onConfirm={createModal.confirmClose}
                title={t('common.discardChangesTitle', 'Discard unsaved changes?')}
                description={t('common.discardChangesDesc', 'You have unsaved changes. Are you sure you want to discard them?')}
                confirmText={t('common.discard', 'Discard')}
                cancelText={t('common.cancel', 'Cancel')}
            />

            {/* Edit User Modal */}
            <GlassModal
                open={!!editingUser}
                onOpenChange={(open) => { if (!open) setEditingUser(null); setErrorMsg(''); }}
                title={t('usersPage.modal.editTitle')}
            >
                {editingUser && (
                    <form onSubmit={handleSaveEdit} className="flex flex-col gap-md">
                        {/* Avatar Upload Section */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <div
                                style={{ position: 'relative', cursor: 'pointer' }}
                                onClick={() => avatarInputRef.current?.click()}
                            >
                                <AvatarInitials name={editingUser.displayName} src={editingUser.avatar} size={72} />
                                <div style={{
                                    position: 'absolute', bottom: 0, right: 0,
                                    width: 24, height: 24, borderRadius: '50%',
                                    background: 'var(--primary)', color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                }}>
                                    <Camera size={13} />
                                </div>
                            </div>
                            {editingUser.avatar && (
                                <Button
                                    type="button"
                                    onClick={handleAvatarDelete}
                                    disabled={avatarUploading}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--danger)', fontSize: '0.8rem',
                                        display: 'flex', alignItems: 'center', gap: '0.25rem',
                                    }}
                                >
                                    <X size={12} /> {t('usersPage.modal.removeAvatar')}
                                </Button>
                            )}
                            <input
                                ref={avatarInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleAvatarUpload(file);
                                    e.target.value = '';
                                }}
                            />
                            {avatarUploading && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('usersPage.modal.uploading')}</span>}
                        </div>
                        <div className="form-group">
                            <label>{t('usersPage.modal.displayName')}</label>
                            <Input
                                value={editForm.displayName}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, displayName: e.target.value })}
                                required
                                style={inputStyle}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('usersPage.modal.email')}</label>
                            <Input
                                type="email"
                                value={editForm.email}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, email: e.target.value })}
                                required
                                style={inputStyle}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('usersPage.modal.role')}</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '0.25rem' }}>
                                {SYSTEM_ROLES.map(role => {
                                    const Icon = role.icon;
                                    const isSelected = editForm.role === role.slug;
                                    return (
                                        <div
                                            key={role.slug}
                                            onClick={() => setEditForm({ ...editForm, role: role.slug })}
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: 'var(--radius-sm)',
                                                border: isSelected ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                                                background: isSelected ? 'hsla(150, 60%, 50%, 0.05)' : 'var(--bg-card)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                gap: '0.5rem',
                                                alignItems: 'flex-start',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>
                                                <Icon size={16} />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: isSelected ? 'var(--primary)' : 'var(--text-primary)', marginBottom: '0.15rem' }}>
                                                    {role.name}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.2 }}>
                                                    {role.desc}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        <div className="form-group">
                            <label>{t('usersPage.modal.status')}</label>
                            <Select
                                value={editForm.status}
                                onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                style={selectStyle}
                            >
                                <option value="active">{t('usersPage.modal.active')}</option>
                                <option value="inactive">{t('usersPage.modal.inactive')}</option>
                            </Select>
                        </div>
                        <div className="form-group">
                            <label>{t('usersPage.modal.bindAgent')}</label>
                            {renderAgentPicker(
                                editForm.agentId,
                                (id) => setEditForm({ ...editForm, agentId: id }),
                                getAgentOptions(editForm.agentId)
                            )}
                        </div>

                        {errorMsg && (
                            <div style={{
                                padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)',
                                background: 'hsla(0, 80%, 95%, 1)', border: '1px solid hsla(0, 60%, 80%, 1)',
                                color: 'hsla(0, 60%, 40%, 1)', fontSize: '0.85rem'
                            }}>{errorMsg}</div>
                        )}
                        <div className="flex gap-md" style={{ marginTop: '1rem' }}>
                            <MotionButton type="button" variant="secondary" className="w-full" onClick={() => setEditingUser(null)}>
                                {t('usersPage.modal.cancel')}
                            </MotionButton>
                            <MotionButton type="submit" className="w-full">
                                {t('usersPage.modal.save')}
                            </MotionButton>
                        </div>
                    </form>
                )}
            </GlassModal>

            {/* Delete Confirmation Modal */}
            <GlassModal
                open={!!deletingUser}
                onOpenChange={(open) => !open && setDeletingUser(null)}
                title={t('usersPage.modal.deleteTitle')}
            >
                <div className="flex flex-col gap-md">
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(t('usersPage.modal.deleteConfirm', { name: deletingUser?.displayName })) }} />
                    </p>
                    <div className="flex gap-md" style={{ marginTop: '0.5rem' }}>
                        <MotionButton
                            variant="secondary"
                            className="w-full"
                            onClick={() => setDeletingUser(null)}
                        >
                            {t('usersPage.modal.cancel')}
                        </MotionButton>
                        <MotionButton
                            className="w-full"
                            style={{ background: 'var(--danger)', color: '#fff' }}
                            onClick={confirmDeleteUser}
                        >
                            {t('usersPage.modal.delete')}
                        </MotionButton>
                    </div>
                </div>
            </GlassModal>

            {/* Reset Password Modal */}
            <GlassModal
                open={!!passwordResetUser}
                onOpenChange={(open) => { if (!open) { setPasswordResetUser(null); setErrorMsg(''); setPasswordResetSuccess(false); } }}
                title={t('usersPage.modal.resetPasswordTitle')}
            >
                {passwordResetUser && (
                    <form onSubmit={handleResetPassword} className="flex flex-col gap-md">
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                            <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(t('usersPage.modal.resetPasswordFor', { name: passwordResetUser.displayName, email: passwordResetUser.email })) }} />
                        </p>
                        <div className="form-group">
                            <label>{t('usersPage.modal.newPassword')}</label>
                            <div style={{ position: 'relative' }}>
                                <Input
                                    type={showNewPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    autoComplete="new-password"
                                    placeholder={t('usersPage.modal.minChars')}
                                    style={{ ...inputStyle, paddingRight: '4.5rem' }}
                                />
                                <div style={{
                                    position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)',
                                    display: 'flex', alignItems: 'center', gap: '0.2rem'
                                }}>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            const pw = generatePassword();
                                            setNewPassword(pw);
                                            setShowNewPassword(true);
                                        }}
                                        title={t('usersPage.modal.generatePassword')}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: 'var(--primary)', display: 'flex', alignItems: 'center', padding: '2px'
                                        }}
                                    >
                                        <RefreshCw size={15} />
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px'
                                        }}
                                    >
                                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {passwordResetSuccess && (
                            <div style={{
                                padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)',
                                background: 'hsla(150, 80%, 95%, 1)', border: '1px solid hsla(150, 60%, 70%, 1)',
                                color: 'hsla(150, 60%, 30%, 1)', fontSize: '0.85rem'
                            }}>{t('usersPage.modal.passwordResetSuccess')}</div>
                        )}

                        {errorMsg && (
                            <div style={{
                                padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)',
                                background: 'hsla(0, 80%, 95%, 1)', border: '1px solid hsla(0, 60%, 80%, 1)',
                                color: 'hsla(0, 60%, 40%, 1)', fontSize: '0.85rem'
                            }}>{errorMsg}</div>
                        )}

                        <div className="flex gap-md" style={{ marginTop: '1rem' }}>
                            <MotionButton type="button" variant="secondary" className="w-full" onClick={() => setPasswordResetUser(null)}>
                                {t('usersPage.modal.cancel')}
                            </MotionButton>
                            <MotionButton type="submit" className="w-full" disabled={passwordResetSuccess}>
                                {t('usersPage.modal.resetPassword')}
                            </MotionButton>
                        </div>
                    </form>
                )}
            </GlassModal>
        </div>
    );
};

export default Users;
