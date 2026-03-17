import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Plus, Save, RotateCcw, Trash2, Edit2, AlertCircle, Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { GlassModal } from '../../components/ui/GlassModal';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { useAuth } from '../../context/AuthContext';

export interface AgentStatus {
    id: string;
    label: string;
    color: string;
    type: 'available' | 'away' | 'dnd' | 'offline';
    isSystem: boolean;
}

const STATUS_TYPES = [
    { value: 'available', labelKey: 'settings.agentStatus.typeAvailable' },
    { value: 'away', labelKey: 'settings.agentStatus.typeAway' },
    { value: 'dnd', labelKey: 'settings.agentStatus.typeDnd' },
    { value: 'offline', labelKey: 'settings.agentStatus.typeOffline' },
] as const;

const AVAILABLE_COLORS = [
    { value: 'green', hex: '#22c55e' },
    { value: 'emerald', hex: '#10b981' },
    { value: 'teal', hex: '#14b8a6' },
    { value: 'cyan', hex: '#06b6d4' },
    { value: 'sky', hex: '#0ea5e9' },
    { value: 'blue', hex: '#3b82f6' },
    { value: 'indigo', hex: '#6366f1' },
    { value: 'violet', hex: '#8b5cf6' },
    { value: 'purple', hex: '#a855f7' },
    { value: 'fuchsia', hex: '#d946ef' },
    { value: 'pink', hex: '#ec4899' },
    { value: 'rose', hex: '#f43f5e' },
    { value: 'red', hex: '#ef4444' },
    { value: 'orange', hex: '#f97316' },
    { value: 'amber', hex: '#f59e0b' },
    { value: 'yellow', hex: '#eab308' },
    { value: 'lime', hex: '#84cc16' },
    { value: 'slate', hex: '#64748b' },
    { value: 'gray', hex: '#6b7280' },
];

const resolveHex = (color: string) => AVAILABLE_COLORS.find(c => c.value === color)?.hex || color;

export const AgentStatusConfig: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const isAdmin = user?.role === 'platform_admin';
    const [statuses, setStatuses] = useState<AgentStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    const [showEditModal, setShowEditModal] = useState(false);
    const [editingStatus, setEditingStatus] = useState<AgentStatus | null>(null);

    useEffect(() => { fetchStatuses(); }, []);

    const fetchStatuses = async () => {
        try {
            setLoading(true);
            const res = await api.get('/platform/settings');
            setStatuses(res.data.data?.agentStatuses || []);
        } catch {
            toast.error(t('settings.agentStatus.fetchFailed', 'Failed to load agent statuses'));
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (updated: AgentStatus[]) => {
        if (!isAdmin) return;
        try {
            setSaving(true);
            await api.put('/platform/settings', { agentStatuses: updated });
            setStatuses(updated);
            toast.success(t('settings.agentStatus.saved', 'Agent statuses saved'));
        } catch (err: any) {
            toast.error(err.response?.data?.error || t('settings.agentStatus.saveFailed', 'Failed to save'));
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        try {
            setSaving(true);
            // 重置为 Mongoose schema 的 default 值
            const defaults: AgentStatus[] = [
                { id: 'available', label: 'Available', color: 'green', type: 'available', isSystem: true },
                { id: 'away', label: 'Away', color: 'orange', type: 'away', isSystem: true },
                { id: 'break', label: 'Break', color: 'purple', type: 'away', isSystem: true },
                { id: 'wrapup', label: 'Wrapup', color: 'cyan', type: 'away', isSystem: true },
                { id: 'dnd', label: 'Do Not Disturb', color: 'red', type: 'dnd', isSystem: true },
                { id: 'ring', label: 'Ringing', color: 'yellow', type: 'away', isSystem: true },
                { id: 'oncall', label: 'On Call', color: 'red', type: 'away', isSystem: true },
                { id: 'onhold', label: 'On Hold', color: 'orange', type: 'away', isSystem: true },
                { id: 'busy', label: 'Busy', color: 'red', type: 'away', isSystem: true },
                { id: 'offline', label: 'Offline', color: 'gray', type: 'offline', isSystem: true },
            ];
            await api.put('/platform/settings', { agentStatuses: defaults });
            setStatuses(defaults);
            toast.success(t('settings.agentStatus.resetSuccess', 'Reset to defaults'));
        } catch {
            toast.error(t('settings.agentStatus.resetFailed', 'Reset failed'));
        } finally {
            setSaving(false);
            setShowResetConfirm(false);
        }
    };

    const deleteStatus = (id: string) => {
        const newStatuses = statuses.filter(s => s.id !== id);
        setStatuses(newStatuses);
        handleSave(newStatuses);
        setShowDeleteConfirm(null);
    };

    const openCreateModal = () => {
        setEditingStatus({
            id: '',
            label: '',
            color: 'slate',
            type: 'away',
            isSystem: false,
        });
        setShowEditModal(true);
    };

    const openEditModal = (status: AgentStatus) => {
        setEditingStatus({ ...status });
        setShowEditModal(true);
    };

    const saveEditStatus = () => {
        if (!editingStatus || !editingStatus.label || !editingStatus.id) {
            toast.error(t('common.errors.fillRequired', 'Please fill in all required fields'));
            return;
        }

        const isNew = !statuses.find(s => s.id === editingStatus.id);
        if (isNew && statuses.some(s => s.id.toLowerCase() === editingStatus.id.toLowerCase())) {
            toast.error(t('settings.agentStatus.duplicateId', 'A status with this ID already exists.'));
            return;
        }

        const newStatuses = isNew
            ? [...statuses, editingStatus]
            : statuses.map(s => s.id === editingStatus.id ? editingStatus : s);

        setShowEditModal(false);
        setStatuses(newStatuses);
        handleSave(newStatuses);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold flex items-center text-text-primary">
                        <Settings className="mr-2 text-text-secondary" />
                        {t('settings.agentStatus.title', 'Agent Statuses')}
                    </h2>
                    <p className="text-text-secondary mt-1">
                        {t('settings.agentStatus.description', 'Manage custom agent statuses displayed in Agent Map and Operations Overview.')}
                    </p>
                </div>
                {isAdmin && (
                    <div className="flex gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => setShowResetConfirm(true)}
                            disabled={saving}
                            className="flex items-center gap-2"
                        >
                            <RotateCcw size={16} />
                            {t('settings.agentStatus.resetBtn', 'Reset Defaults')}
                        </Button>
                        <Button
                            variant="default"
                            onClick={openCreateModal}
                            disabled={saving}
                            className="flex items-center gap-2"
                        >
                            <Plus size={16} />
                            {t('settings.agentStatus.addBtn', 'Add Status')}
                        </Button>
                    </div>
                )}
            </div>

            <Card className="p-0 overflow-hidden bg-bg-primary">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('settings.agentStatus.colId', 'ID')}</TableHead>
                                <TableHead>{t('settings.agentStatus.colLabel', 'Label')}</TableHead>
                                <TableHead>{t('settings.agentStatus.colColor', 'Color')}</TableHead>
                                <TableHead>{t('settings.agentStatus.colType', 'Type')}</TableHead>
                                <TableHead>{t('settings.agentStatus.colSystem', 'System')}</TableHead>
                                {isAdmin && <TableHead className="text-right">{t('common.actions', 'Actions')}</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {statuses.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-text-secondary">
                                        <AlertCircle className="mx-auto mb-2 text-text-tertiary" size={24} />
                                        {t('settings.agentStatus.empty', 'No agent statuses configured.')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                statuses.map(status => (
                                    <TableRow key={status.id} className="group hover:bg-bg-secondary/50">
                                        <TableCell>
                                            <span className="font-mono text-xs bg-bg-tertiary px-2 py-1 rounded text-text-primary border border-border-divider">
                                                {status.id}
                                            </span>
                                        </TableCell>
                                        <TableCell className="font-medium text-text-primary">
                                            {status.label}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10 dark:border-white/10"
                                                    style={{ backgroundColor: resolveHex(status.color) }}
                                                />
                                                <span className="text-xs text-text-secondary">{status.color}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs px-2 py-0.5 rounded bg-bg-tertiary text-text-secondary border border-border-divider">
                                                {status.type}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {status.isSystem && (
                                                <Shield size={14} className="text-amber-500" />
                                            )}
                                        </TableCell>
                                        {isAdmin && (
                                            <TableCell className="text-right py-2">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => openEditModal(status)}
                                                        className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                        title={t('common.action.edit', 'Edit')}
                                                    >
                                                        <Edit2 size={16} />
                                                    </Button>
                                                    {!status.isSystem && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => setShowDeleteConfirm(status.id)}
                                                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                            title={t('common.action.delete', 'Delete')}
                                                        >
                                                            <Trash2 size={16} />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            {/* Reset Confirmation */}
            <ConfirmModal
                open={showResetConfirm}
                onClose={() => setShowResetConfirm(false)}
                onConfirm={handleReset}
                title={t('settings.agentStatus.resetTitle', 'Reset Agent Statuses')}
                description={t('settings.agentStatus.resetMsg', 'This will replace all custom statuses with the default system configuration. Custom statuses will be lost.')}
                confirmText={t('common.action.confirm', 'Yes, reset to defaults')}
                cancelText={t('common.action.cancel', 'Cancel')}
            />

            {/* Delete Confirmation */}
            <ConfirmModal
                open={!!showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(null)}
                onConfirm={() => showDeleteConfirm && deleteStatus(showDeleteConfirm)}
                title={t('settings.agentStatus.deleteTitle', 'Delete Status')}
                description={t('settings.agentStatus.deleteMsg', 'Delete this custom agent status? Agents currently using it will revert to Available.')}
                confirmText={t('common.action.delete', 'Delete')}
                cancelText={t('common.action.cancel', 'Cancel')}
            />

            {/* Edit / Create Modal */}
            {editingStatus && (
                <GlassModal
                    open={showEditModal}
                    onOpenChange={(v) => { if (!v) setShowEditModal(false); }}
                    title={statuses.find(s => s.id === editingStatus.id)
                        ? t('settings.agentStatus.editTitle', 'Edit Agent Status')
                        : t('settings.agentStatus.createTitle', 'Create Agent Status')}
                >
                    <div className="flex flex-col gap-4">
                        {/* ID */}
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">
                                {t('settings.agentStatus.colId', 'Status ID')} <span className="text-red-500">*</span>
                            </label>
                            <Input
                                value={editingStatus.id}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingStatus({ ...editingStatus, id: e.target.value.replace(/\s/g, '_').toLowerCase() })}
                                placeholder="e.g., lunch"
                                disabled={!!statuses.find(s => s.id === editingStatus.id)}
                                className="font-mono"
                            />
                            {!statuses.find(s => s.id === editingStatus.id) && (
                                <p className="text-xs text-text-tertiary mt-1">
                                    {t('settings.agentStatus.idHelp', 'Must be unique, lowercase, no spaces. Cannot be changed later.')}
                                </p>
                            )}
                        </div>

                        {/* Label */}
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">
                                {t('settings.agentStatus.colLabel', 'Display Label')} <span className="text-red-500">*</span>
                            </label>
                            <Input
                                value={editingStatus.label}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingStatus({ ...editingStatus, label: e.target.value })}
                                placeholder="e.g., Lunch Break"
                                autoFocus
                            />
                        </div>

                        {/* Type */}
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">
                                {t('settings.agentStatus.colType', 'Category')}
                            </label>
                            <select
                                value={editingStatus.type}
                                onChange={(e) => setEditingStatus({ ...editingStatus, type: e.target.value as AgentStatus['type'] })}
                                className="w-full rounded-md border border-border-divider bg-bg-primary text-text-primary px-3 py-2 text-sm"
                            >
                                {STATUS_TYPES.map(st => (
                                    <option key={st.value} value={st.value}>
                                        {t(st.labelKey, st.value)}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-text-tertiary mt-1">
                                {t('settings.agentStatus.typeHelp', 'Determines how this status is grouped in reports and whether the agent receives calls/chats.')}
                            </p>
                        </div>

                        {/* Color */}
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">
                                {t('settings.agentStatus.colColor', 'Color')}
                            </label>
                            <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
                                {AVAILABLE_COLORS.map((c) => {
                                    const isSelected = editingStatus.color === c.value;
                                    return (
                                        <button
                                            key={c.value}
                                            type="button"
                                            onClick={() => setEditingStatus({ ...editingStatus, color: c.value })}
                                            className={`rounded-full flex items-center justify-center transition-all ${isSelected
                                                ? 'scale-110 shadow-sm'
                                                : 'hover:scale-105 opacity-80 hover:opacity-100'
                                                }`}
                                            style={{ width: '32px', height: '32px', flexShrink: 0, ...(isSelected ? { boxShadow: `0 0 0 2px var(--bg-primary), 0 0 0 4px ${c.hex}` } : {}) }}
                                            title={c.value}
                                        >
                                            <div
                                                className="w-full h-full rounded-full border border-black/10 dark:border-white/10"
                                                style={{ backgroundColor: c.hex }}
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                            {/* Preview */}
                            <div className="flex items-center gap-2 border border-border-divider p-3 rounded-lg bg-bg-secondary mt-3">
                                <span className="text-sm text-text-secondary">{t('settings.agentStatus.preview', 'Preview')}:</span>
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-2.5 h-2.5 rounded-full"
                                        style={{ backgroundColor: resolveHex(editingStatus.color) }}
                                    />
                                    <span className="text-sm font-medium text-text-primary">
                                        {editingStatus.label || 'Status'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="secondary" onClick={() => setShowEditModal(false)}>
                            {t('common.action.cancel', 'Cancel')}
                        </Button>
                        <Button variant="default" onClick={saveEditStatus} className="flex items-center gap-2">
                            <Save size={16} />
                            {t('common.action.save', 'Save')}
                        </Button>
                    </div>
                </GlassModal>
            )}
        </div>
    );
};
