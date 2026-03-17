import { Checkbox } from '../../components/ui/Checkbox';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { OrganicCard } from '../../components/ui/OrganicCard';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { Shield, Lock, Plus, Edit2, Trash2, X, Save } from 'lucide-react';

import { Button } from '../../components/ui/button';

interface Role {
    _id: string;
    slug: string;
    name: string;
    description: string;
    permissions: string[];
    isSystem: boolean;
    clientId?: string;
}

interface Permission {
    _id: string;
    slug: string;
    name: string;
    description: string;
    module: string;
}

const RoleManagement: React.FC = () => {
    const { t } = useTranslation();
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Role>>({});
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean, id: string | null, name: string | null }>({ isOpen: false, id: null, name: null });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [rolesRes, permsRes] = await Promise.all([
                api.get('/rbac/roles'),
                api.get('/rbac/permissions')
            ]);
            const rolesData = Array.isArray(rolesRes.data) ? rolesRes.data : (rolesRes.data?.data || []);
            const permsData = Array.isArray(permsRes.data) ? permsRes.data : (permsRes.data?.data || []);
            console.log("RBAC Fetch:", { rolesRaw: rolesRes.data, permsRaw: permsRes.data, parsedPerms: permsData });
            setRoles(rolesData);
            setPermissions(permsData);
        } catch (error: any) {
            console.error('Failed to fetch RBAC data', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Group permissions by module for the matrix
    const groupedPermissions = permissions.reduce((acc, perm) => {
        if (!acc[perm.module]) acc[perm.module] = [];
        acc[perm.module].push(perm);
        return acc;
    }, {} as Record<string, Permission[]>);

    const handleEdit = (role: Role) => {
        setIsEditing(role._id);
        setEditForm({ name: role.name, description: role.description, permissions: [...role.permissions] });
    };

    const handleCreateNew = () => {
        setIsEditing('new');
        setEditForm({ name: '', description: '', permissions: [] });
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/rbac/roles/${id}`);
            setRoles(roles.filter(r => r._id !== id));
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to delete role');
        } finally {
            setDeleteConfirm({ isOpen: false, id: null, name: null });
        }
    };

    const handleSave = async () => {
        try {
            if (isEditing === 'new') {
                const res = await api.post('/rbac/roles', editForm);
                setRoles([...roles, res.data]);
            } else {
                const res = await api.put(`/rbac/roles/${isEditing}`, editForm);
                setRoles(roles.map(r => r._id === isEditing ? res.data : r));
            }
            setIsEditing(null);
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to save role');
        }
    };

    const togglePermission = (slug: string) => {
        if (!editForm.permissions) return;
        const newPerms = editForm.permissions.includes(slug)
            ? editForm.permissions.filter(p => p !== slug)
            : [...editForm.permissions, slug];
        setEditForm({ ...editForm, permissions: newPerms });
    };

    if (isLoading) {
        return <div className="p-8 text-center text-muted">{t('common.loading', 'Loading...')}</div>;
    }

    return (
        <div style={{ width: '100%' }}>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="flex items-center gap-sm" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                        <Shield style={{ color: 'var(--primary)' }} />
                        {t('settings.roles.title', 'Roles & Permissions')}
                    </h2>
                    <p className="text-muted" style={{ marginTop: '0.25rem' }}>
                        {t('settings.roles.subtitle', 'Manage access control and define custom roles.')}
                    </p>
                </div>
                {!isEditing && (
                    <Button
                        onClick={handleCreateNew}
                    >
                        <Plus size={16} />
                        {t('settings.roles.create', 'Create Custom Role')}
                    </Button>
                )}
            </div>

            {isEditing ? (
                <OrganicCard className="p-6">
                    <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                            {isEditing === 'new' ? t('settings.roles.newRole', 'New Custom Role') : t('settings.roles.editRole', 'Edit Role')}
                        </h3>
                        <div className="flex gap-sm">
                            <Button variant="secondary" onClick={() => setIsEditing(null)} style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
                                <X size={14} /> {t('common.cancel', 'Cancel')}
                            </Button>
                            <Button onClick={handleSave} style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
                                <Save size={14} /> {t('common.save', 'Save')}
                            </Button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>{t('settings.roles.name', 'Role Name')}</label>
                            <input
                                type="text"
                                value={editForm.name || ''}
                                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                style={{
                                    width: '100%', padding: '0.5rem', border: '1px solid var(--input-border)',
                                    borderRadius: 'var(--radius-sm)', background: 'var(--input-bg)', color: 'var(--text-primary)',
                                    outline: 'none'
                                }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 2px var(--input-focus-ring)' }}
                                onBlur={(e) => { e.target.style.borderColor = 'var(--input-border)'; e.target.style.boxShadow = 'none' }}
                                placeholder="e.g. Sales Tier 2"
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>{t('settings.roles.desc', 'Description')}</label>
                            <input
                                type="text"
                                value={editForm.description || ''}
                                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                                style={{
                                    width: '100%', padding: '0.5rem', border: '1px solid var(--input-border)',
                                    borderRadius: 'var(--radius-sm)', background: 'var(--input-bg)', color: 'var(--text-primary)',
                                    outline: 'none'
                                }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 2px var(--input-focus-ring)' }}
                                onBlur={(e) => { e.target.style.borderColor = 'var(--input-border)'; e.target.style.boxShadow = 'none' }}
                            />
                        </div>
                    </div>

                    <h4 style={{ fontWeight: 600, marginBottom: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.875rem', letterSpacing: '0.05em' }}>{t('settings.roles.matrix', 'Permissions Matrix')}</h4>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                        {Object.entries(groupedPermissions).map(([module, perms]) => (
                            <div key={module} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 3fr', alignItems: 'stretch' }}>
                                    <div className="p-4" style={{ background: 'rgba(0,0,0,0.03)', borderRight: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', fontWeight: 500, textTransform: 'capitalize' }}>
                                        {t(`settings.roles.modules.${module}`, module.replace('_', ' '))}
                                    </div>
                                    <div className="p-4" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                                        {perms.map(p => {
                                            const isChecked = editForm.permissions?.includes(p.slug) || editForm.permissions?.includes('*');
                                            const disabled = editForm.permissions?.includes('*') && p.slug !== '*';
                                            return (
                                                <label key={p.slug} style={{
                                                    display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.5rem',
                                                    borderRadius: 'var(--radius-sm)', border: '1px solid',
                                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s',
                                                    background: isChecked ? 'var(--primary-glow)' : 'var(--bg-card)',
                                                    borderColor: isChecked ? 'var(--primary)' : 'var(--glass-border)',
                                                    opacity: disabled ? 0.5 : 1
                                                }}>
                                                    <Checkbox
                                                        checked={isChecked}
                                                        disabled={disabled}
                                                        onChange={() => togglePermission(p.slug)}
                                                        style={{ marginTop: '0.25rem' }}
                                                    />
                                                    <div>
                                                        <div style={{ fontSize: '0.875rem', fontWeight: 500, lineHeight: 1, marginBottom: '0.25rem' }}>{t(`settings.roles.permissions.${p.slug}.name`, p.name)}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t(`settings.roles.permissions.${p.slug}.description`, p.description)}</div>
                                                    </div>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </OrganicCard>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                    {roles.map(role => (
                        <OrganicCard key={role._id} className="p-6" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {t(`settings.roles.list.${role.slug}.name`, role.name)}
                                        {role.isSystem && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em', padding: '0.125rem 0.5rem', borderRadius: '9999px', background: 'var(--bg-light)', color: 'var(--text-secondary)' }}>
                                                <Lock size={10} /> {t('settings.roles.systemBadge', 'System')}
                                            </span>
                                        )}
                                        {role.slug === 'platform_admin' && (
                                            <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em', padding: '0.125rem 0.5rem', borderRadius: '9999px', background: 'var(--danger)', color: '#fff' }}>
                                                {t('settings.roles.superuserBadge', 'Superuser')}
                                            </span>
                                        )}
                                    </h3>
                                    {!role.isSystem && (
                                        <div className="flex gap-sm text-muted">
                                            <Button variant="ghost" size="icon" onClick={() => handleEdit(role)} title={t('common.edit', 'Edit')}>
                                                <Edit2 size={16} />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm({ isOpen: true, id: role._id, name: t(`settings.roles.list.${role.slug}.name`, role.name) })} style={{ color: 'var(--danger)' }} title={t('common.delete', 'Delete')}>
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem', minHeight: '40px' }}>{t(`settings.roles.list.${role.slug}.description`, role.description)}</p>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)', marginTop: 'auto' }}>
                                {role.permissions.includes('*') ? (
                                    <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', background: 'rgba(0,0,0,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <Shield size={12} /> {t('settings.roles.rootAccess', 'Root Access (All Permissions)')}
                                    </span>
                                ) : (
                                    <>
                                        {role.permissions.slice(0, 5).map(p => {
                                            const permDetail = permissions.find(pd => pd.slug === p);
                                            return (
                                                <span key={p} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', background: 'var(--bg-light)', color: 'var(--text-secondary)', border: '1px solid transparent' }} title={permDetail ? t(`settings.roles.permissions.${permDetail.slug}.name`, permDetail.name) : undefined}>
                                                    {t(`settings.roles.actions.${p.split(':')[1] || p}`, p.split(':')[1] || p)}
                                                </span>
                                            );
                                        })}
                                        {role.permissions.length > 5 && (
                                            <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', background: 'var(--bg-light)', color: 'var(--text-muted)' }}>
                                                {t('settings.roles.morePermissions', '+{{count}} more', { count: role.permissions.length - 5 })}
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        </OrganicCard>
                    ))}
                </div>
            )}

            <ConfirmModal
                open={deleteConfirm.isOpen}
                title={t('common.delete', 'Delete')}
                description={t('settings.roles.deleteConfirm', { name: deleteConfirm.name, defaultValue: `Delete role ${deleteConfirm.name}?` })}
                onConfirm={() => deleteConfirm.id && handleDelete(deleteConfirm.id)}
                onClose={() => setDeleteConfirm({ isOpen: false, id: null, name: null })}
            />
        </div>
    );
};

export default RoleManagement;
