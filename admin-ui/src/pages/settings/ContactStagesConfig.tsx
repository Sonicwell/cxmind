import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Plus, Save, RotateCcw, ArrowUp, ArrowDown, Trash2, Edit2, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { GlassModal } from '../../components/ui/GlassModal';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { useAuth } from '../../context/AuthContext';

export interface ContactStage {
    id: string;
    label: string;
    i18nKey: string;
    color: string;
    order: number;
}

const AVAILABLE_COLORS = [
    { value: 'slate', label: 'Slate', hex: '#64748b' },
    { value: 'gray', label: 'Gray', hex: '#6b7280' },
    { value: 'zinc', label: 'Zinc', hex: '#71717a' },
    { value: 'neutral', label: 'Neutral', hex: '#737373' },
    { value: 'stone', label: 'Stone', hex: '#78716c' },
    { value: 'red', label: 'Red', hex: '#ef4444' },
    { value: 'orange', label: 'Orange', hex: '#f97316' },
    { value: 'amber', label: 'Amber', hex: '#f59e0b' },
    { value: 'yellow', label: 'Yellow', hex: '#eab308' },
    { value: 'lime', label: 'Lime', hex: '#84cc16' },
    { value: 'green', label: 'Green', hex: '#22c55e' },
    { value: 'emerald', label: 'Emerald', hex: '#10b981' },
    { value: 'teal', label: 'Teal', hex: '#14b8a6' },
    { value: 'cyan', label: 'Cyan', hex: '#06b6d4' },
    { value: 'sky', label: 'Sky', hex: '#0ea5e9' },
    { value: 'blue', label: 'Blue', hex: '#3b82f6' },
    { value: 'indigo', label: 'Indigo', hex: '#6366f1' },
    { value: 'violet', label: 'Violet', hex: '#8b5cf6' },
    { value: 'purple', label: 'Purple', hex: '#a855f7' },
    { value: 'fuchsia', label: 'Fuchsia', hex: '#d946ef' },
    { value: 'pink', label: 'Pink', hex: '#ec4899' },
    { value: 'rose', label: 'Rose', hex: '#f43f5e' },
];

export const ContactStagesConfig: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const isAdmin = user?.role === 'platform_admin';
    const [stages, setStages] = useState<ContactStage[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // Edit Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingStage, setEditingStage] = useState<ContactStage | null>(null);

    useEffect(() => {
        fetchStages();
    }, []);

    const fetchStages = async () => {
        try {
            setLoading(true);
            const res = await api.get('/platform/settings');
            const fetchedStages = res.data.data?.contactStages || [];
            // Sort by order 
            fetchedStages.sort((a: ContactStage, b: ContactStage) => a.order - b.order);
            setStages(fetchedStages);
        } catch (error: any) {
            console.error('Failed to fetch contact stages:', error);
            toast.error(t('settings.stages.error.fetchFailed', 'Failed to load contact stages'));
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (updatedStages: ContactStage[]) => {
        if (!isAdmin) return;

        try {
            setSaving(true);
            // Ensure order is sequential
            const normalizedStages = updatedStages.map((s, index) => ({
                ...s,
                order: index + 1
            }));

            await api.put('/platform/settings', {
                contactStages: normalizedStages
            });

            setStages(normalizedStages);
            toast.success(t('settings.stages.success.saved', 'Contact stages saved successfully'));
        } catch (error: any) {
            console.error('Failed to save contact stages:', error);
            const msg = error.response?.data?.error || t('settings.stages.error.saveFailed', 'Failed to save changes');
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        try {
            setSaving(true);
            const res = await api.post('/platform/settings/contact-stages/reset');
            const newStages = res.data.data;
            if (newStages && Array.isArray(newStages)) {
                newStages.sort((a: ContactStage, b: ContactStage) => a.order - b.order);
                setStages(newStages);
                toast.success(t('settings.stages.success.reset', 'Stages reset to default configuration'));
            }
        } catch (error: any) {
            console.error('Failed to reset contact stages:', error);
            toast.error(t('settings.stages.error.resetFailed', 'Failed to reset contact stages'));
        } finally {
            setSaving(false);
            setShowResetConfirm(false);
        }
    };

    const moveStage = (index: number, direction: 'up' | 'down') => {
        const newStages = [...stages];
        if (direction === 'up' && index > 0) {
            const temp = newStages[index];
            newStages[index] = newStages[index - 1];
            newStages[index - 1] = temp;
        } else if (direction === 'down' && index < newStages.length - 1) {
            const temp = newStages[index];
            newStages[index] = newStages[index + 1];
            newStages[index + 1] = temp;
        }
        setStages(newStages);
        handleSave(newStages); // Auto-save on order change
    };

    const deleteStage = (id: string) => {
        if (stages.length <= 1) {
            toast.error(t('settings.stages.error.minStages', 'At least one contact stage is required.'));
            return;
        }
        const newStages = stages.filter(s => s.id !== id);
        setStages(newStages);
        handleSave(newStages);
    };

    const openCreateModal = () => {
        setEditingStage({
            id: '',
            label: '',
            i18nKey: 'custom',
            color: 'slate',
            order: stages.length + 1
        });
        setShowEditModal(true);
    };

    const openEditModal = (stage: ContactStage) => {
        setEditingStage({ ...stage });
        setShowEditModal(true);
    };

    const saveEditStage = () => {
        if (!editingStage || !editingStage.label || !editingStage.id) {
            toast.error(t('common.errors.fillRequired', 'Please fill in all required fields'));
            return;
        }

        // Validate unique ID if new
        const isNew = !stages.find(s => s.id === editingStage.id);
        if (isNew) {
            const idExists = stages.some(s => s.id.toLowerCase() === editingStage.id.toLowerCase());
            if (idExists) {
                toast.error(t('settings.stages.error.duplicateId', 'A stage with this ID already exists.'));
                return;
            }
        }

        let newStages;
        if (isNew) {
            newStages = [...stages, editingStage];
        } else {
            newStages = stages.map(s => s.id === editingStage.id ? editingStage : s);
        }

        setShowEditModal(false);
        setStages(newStages);
        handleSave(newStages);
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
                        {t('settings.stages.title', 'Contact Stages')}
                    </h2>
                    <p className="text-text-secondary mt-1">
                        {t('settings.stages.description', 'Manage the lifecycle stages that contacts flow through.')}
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
                            {t('settings.stages.action.reset', 'Import Defaults')}
                        </Button>
                        <Button
                            variant="default"
                            onClick={openCreateModal}
                            disabled={saving}
                            className="flex items-center gap-2"
                        >
                            <Plus size={16} />
                            {t('settings.stages.action.add', 'Add Stage')}
                        </Button>
                    </div>
                )}
            </div>

            <Card className="p-0 overflow-hidden bg-bg-primary">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-16">#</TableHead>
                                <TableHead>{t('settings.stages.fields.id', 'ID (System Name)')}</TableHead>
                                <TableHead>{t('settings.stages.fields.label', 'Display Label')}</TableHead>
                                <TableHead>{t('settings.stages.fields.color', 'Badge Color')}</TableHead>
                                {isAdmin && <TableHead className="text-right">{t('common.actions', 'Actions')}</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stages.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-text-secondary">
                                        <AlertCircle className="mx-auto mb-2 text-text-tertiary" size={24} />
                                        {t('settings.stages.empty', 'No contact stages configured.')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                stages.map((stage, index) => (
                                    <TableRow key={stage.id} className="group hover:bg-bg-secondary/50">
                                        <TableCell className="w-12 text-text-tertiary whitespace-nowrap">
                                            {// Fallback for missing order
                                                stage.order || index + 1}
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-mono text-xs bg-bg-tertiary px-2 py-1 rounded text-text-primary border border-border-divider">
                                                {stage.id}
                                            </span>
                                        </TableCell>
                                        <TableCell className="font-medium text-text-primary">
                                            {stage.i18nKey ? t(stage.i18nKey, stage.label) : stage.label}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded-full bg-${stage.color}-500/20 border border-${stage.color}-500 flex-shrink-0`} />
                                                <span className={`text-xs text-${stage.color}-600 dark:text-${stage.color}-400`}>
                                                    {AVAILABLE_COLORS.find(c => c.value === stage.color)?.label || stage.color}
                                                </span>
                                            </div>
                                        </TableCell>
                                        {isAdmin && (
                                            <TableCell className="text-right py-2">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => moveStage(index, 'up')}
                                                        disabled={index === 0}
                                                        className="h-8 w-8 text-text-tertiary hover:text-text-primary"
                                                        title={t('common.action.moveUp', 'Move Up')}
                                                    >
                                                        <ArrowUp size={16} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => moveStage(index, 'down')}
                                                        disabled={index === stages.length - 1}
                                                        className="h-8 w-8 text-text-tertiary hover:text-text-primary"
                                                        title={t('common.action.moveDown', 'Move Down')}
                                                    >
                                                        <ArrowDown size={16} />
                                                    </Button>
                                                    <div className="w-px h-4 bg-border-divider mx-1"></div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => openEditModal(stage)}
                                                        className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                        title={t('common.action.edit', 'Edit')}
                                                    >
                                                        <Edit2 size={16} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => deleteStage(stage.id)}
                                                        disabled={stages.length <= 1}
                                                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:hover:bg-transparent"
                                                        title={t('common.action.delete', 'Delete')}
                                                    >
                                                        <Trash2 size={16} />
                                                    </Button>
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

            {/* Reset Confirmation Modal */}
            <ConfirmModal
                open={showResetConfirm}
                onClose={() => setShowResetConfirm(false)}
                onConfirm={handleReset}
                title={t('settings.stages.reset.title', 'Import Default Stages')}
                description={t('settings.stages.reset.message', 'This will replace all your current custom stages with the default system pipeline configuration. This action cannot be undone. Are you sure you want to proceed?')}
                confirmText={t('common.action.confirm', 'Yes, reset to defaults')}
                cancelText={t('common.action.cancel', 'Cancel')}
            />

            {/* Edit / Create Modal */}
            {editingStage && (
                <GlassModal
                    open={showEditModal}
                    onOpenChange={(v) => { if (!v) setShowEditModal(false); }}
                    title={stages.find(s => s.id === editingStage.id)
                        ? t('settings.stages.modal.edit', 'Edit Contact Stage')
                        : t('settings.stages.modal.create', 'Create Contact Stage')}
                >
                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">
                                {t('settings.stages.fields.id', 'Stage ID / System Name')} <span className="text-red-500">*</span>
                            </label>
                            <Input
                                value={editingStage.id}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingStage({ ...editingStage, id: e.target.value })}
                                placeholder="e.g., Qualified"
                                disabled={!!stages.find(s => s.id === editingStage.id)} // Disable edit if existing
                                className="font-mono"
                            />
                            {!stages.find(s => s.id === editingStage.id) && (
                                <p className="text-xs text-text-tertiary mt-1">
                                    ID {t('settings.stages.idHelp', 'must be unique and cannot be changed later.')}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">
                                {t('settings.stages.fields.label', 'Display Label')} <span className="text-red-500">*</span>
                            </label>
                            <Input
                                value={editingStage.label}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingStage({ ...editingStage, label: e.target.value })}
                                placeholder="e.g., Sales Qualified"
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">
                                {t('settings.stages.fields.color', 'Badge Color')}
                            </label>
                            {/* Bypass Tailwind JIT miss by forcing inline style for flex-wrap */}
                            <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
                                {AVAILABLE_COLORS.map((colorObj) => {
                                    const isSelected = editingStage.color === colorObj.value;
                                    return (
                                        <button
                                            key={colorObj.value}
                                            type="button"
                                            onClick={() => setEditingStage({ ...editingStage, color: colorObj.value })}
                                            style={{ width: '40px', height: '40px', flexShrink: 0 }}
                                            className={`rounded-full flex items-center justify-center transition-all ${isSelected
                                                ? `ring-2 ring-offset-2 ring-offset-bg-primary ring-${colorObj.value}-500 scale-110 shadow-sm`
                                                : 'hover:scale-105 opacity-80 hover:opacity-100'
                                                }`}
                                            title={colorObj.label}
                                        >
                                            <div
                                                className="w-full h-full rounded-full border border-black/10 dark:border-white/10"
                                                style={{ backgroundColor: colorObj.hex }}
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-2 border border-border-divider p-3 rounded-lg bg-bg-secondary">
                                <span className="text-sm text-text-secondary">{t('settings.stages.preview', 'Live Preview')}:</span>
                                {(() => {
                                    const selectedHex = AVAILABLE_COLORS.find(c => c.value === editingStage.color)?.hex || '#94a3b8';
                                    return (
                                        <div
                                            className="px-2.5 py-1 rounded text-xs border font-medium"
                                            style={{
                                                backgroundColor: `${selectedHex}20`,
                                                color: selectedHex,
                                                borderColor: selectedHex,
                                            }}
                                        >
                                            {editingStage.label || 'Preview'}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="secondary" onClick={() => setShowEditModal(false)}>
                            {t('common.action.cancel', 'Cancel')}
                        </Button>
                        <Button variant="default" onClick={saveEditStage} className="flex items-center gap-2">
                            <Save size={16} />
                            {t('common.action.save', 'Save Changes')}
                        </Button>
                    </div>
                </GlassModal>
            )}
        </div>
    );
};
