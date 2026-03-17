import { Button } from '../ui/button';
import React, { useEffect, useState } from 'react';
import { getPlatformSettings, updatePlatformSettings } from '../../services/api';
import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, Save, Activity, ArrowLeft } from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { GlassModal } from '../ui/GlassModal';

interface AgentStatus {
    id: string;
    label: string;
    color: string;
    type: 'available' | 'away' | 'dnd';
    isSystem: boolean;
}

const BASE_TYPES = [
    { value: 'available', label: 'Available' },
    { value: 'away', label: 'Away' },
    { value: 'dnd', label: 'Do Not Disturb' },
];

/** Color palette aligned with AgentMap status colors */
const COLOR_MAP: Record<string, string> = {
    green: '#22c55e',
    orange: '#f59e0b',
    yellow: '#eab308',
    red: '#ef4444',
    gray: '#6b7280',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    cyan: '#06b6d4',
};

const COLORS = Object.keys(COLOR_MAP);

/** Resolve a color name to hex, or pass through if already hex */
const resolveColor = (c: string): string => COLOR_MAP[c] || c;

interface AgentStatusModalProps {
    open: boolean;
    onClose: () => void;
}

export const AgentStatusModal: React.FC<AgentStatusModalProps> = ({ open, onClose }) => {
    const [statuses, setStatuses] = useState<AgentStatus[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingStatus, setEditingStatus] = useState<AgentStatus | null>(null);
    const [formData, setFormData] = useState<Partial<AgentStatus> | null>(null);
    const [statusToDelete, setStatusToDelete] = useState<string | null>(null);

    const fetchSettings = async () => {
        try {
            const settings = await getPlatformSettings();
            if (settings && settings.agentStatuses) {
                setStatuses(settings.agentStatuses);
            }
        } catch (error) {
            console.error('Failed to fetch settings', error);
            toast.error('Failed to load status settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchSettings();
            setFormData(null);
        }
    }, [open]);

    const handleOpenEdit = (status?: AgentStatus) => {
        if (status) {
            setEditingStatus(status);
            setFormData(status);
        } else {
            setEditingStatus(null);
            setFormData({
                label: '',
                color: 'green',
                type: 'available'
            });
        }
    };

    const handleCloseEdit = () => {
        setFormData(null);
        setEditingStatus(null);
    };

    const handleSave = async () => {
        if (!formData) return;
        try {
            let newStatuses = [...statuses];

            if (editingStatus) {
                newStatuses = newStatuses.map(s =>
                    s.id === editingStatus.id ? { ...s, ...formData } as AgentStatus : s
                );
            } else {
                const newId = formData.label?.toLowerCase().replace(/\s+/g, '_') || 'status_' + Date.now();
                const newStatus = {
                    ...formData,
                    id: newId,
                    isSystem: false
                } as AgentStatus;
                newStatuses.push(newStatus);
            }

            if ((formData.label?.length || 0) > 16) {
                toast.error('Label must be 16 characters or less');
                return;
            }
            await updatePlatformSettings({ agentStatuses: newStatuses });
            setStatuses(newStatuses);
            toast.success('Status updated successfully');
            handleCloseEdit();
        } catch (error) {
            console.error('Failed to save status', error);
            toast.error('Failed to save status');
        }
    };

    const handleDelete = async () => {
        if (!statusToDelete) return;

        try {
            const newStatuses = statuses.filter(s => s.id !== statusToDelete);
            await updatePlatformSettings({ agentStatuses: newStatuses });
            setStatuses(newStatuses);
            toast.success('Status deleted');
        } catch (error) {
            toast.error('Failed to delete status');
        } finally {
            setStatusToDelete(null);
        }
    };

    return (
        <GlassModal open={open} onOpenChange={(val) => !val && onClose()}>
            <div style={{ width: '480px', maxWidth: '100%', padding: '0.5rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {formData ? (
                            <Button
                                onClick={handleCloseEdit}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                                }}
                                title="Back to list"
                            >
                                <ArrowLeft size={18} />
                            </Button>
                        ) : (
                            <Activity size={20} color="var(--primary)" />
                        )}
                        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
                            {formData ? (editingStatus ? 'Edit Status' : 'Add Status') : 'Agent Status Config'}
                        </h2>
                    </div>
                    {!formData && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Button
                                size="sm"
                                onClick={() => handleOpenEdit()}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.8rem' }}
                            >
                                <Plus size={14} />
                                Add
                            </Button>
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="p-8 text-center text-muted">Loading...</div>
                ) : formData ? (
                    // Edit/Add Form View
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Label */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Label</label>
                            <input
                                type="text"
                                value={formData.label || ''}
                                onChange={(e) => setFormData({ ...formData, label: e.target.value.slice(0, 16) })}
                                maxLength={16}
                                placeholder="e.g. Meeting, Lunch"
                                style={{
                                    width: '100%', padding: '0.65rem', borderRadius: '0.5rem',
                                    border: '1px solid var(--glass-border)', background: 'var(--bg-card)',
                                    color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {/* Base Type */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Base Type</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                                {BASE_TYPES.map(opt => {
                                    const isSelected = formData.type === opt.value;
                                    return (
                                        <Button
                                            key={opt.value}
                                            onClick={() => setFormData({ ...formData, type: opt.value as any })}
                                            style={{
                                                padding: '0.55rem 0.75rem', borderRadius: '8px',
                                                border: isSelected ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                                                background: isSelected ? 'hsla(var(--primary-hue), var(--primary-sat), var(--primary-light), 0.12)' : 'var(--bg-card)',
                                                color: isSelected ? 'var(--primary)' : 'var(--text-muted)',
                                                cursor: 'pointer', fontWeight: isSelected ? 600 : 500,
                                                fontSize: '0.85rem', transition: 'all 0.15s',
                                                textAlign: 'center',
                                            }}
                                        >
                                            {opt.label}
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Color Picker */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Color</label>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {COLORS.map(c => {
                                    const hex = COLOR_MAP[c];
                                    const isSelected = formData.color === c;
                                    return (
                                        <Button
                                            key={c}
                                            onClick={() => setFormData({ ...formData, color: c })}
                                            title={c}
                                            style={{
                                                width: '32px', height: '32px', borderRadius: '8px',
                                                backgroundColor: hex,
                                                border: isSelected ? '2px solid #fff' : '2px solid transparent',
                                                boxShadow: isSelected ? `0 0 0 2px ${hex}, 0 0 8px ${hex}80` : 'none',
                                                cursor: 'pointer', transition: 'all 0.15s',
                                                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>

                        {/* Preview */}
                        <div style={{
                            padding: '0.75rem 1rem', borderRadius: '8px',
                            background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                        }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Preview</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: '12px', height: '12px', borderRadius: '50%',
                                    backgroundColor: resolveColor(formData.color || 'gray'),
                                    boxShadow: `0 0 6px ${resolveColor(formData.color || 'gray')}60`,
                                }} />
                                <span style={{
                                    fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)',
                                }}>
                                    {formData.label || 'Status Name'}
                                </span>
                                <span style={{
                                    fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize',
                                }}>
                                    ({formData.type})
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                            <Button onClick={handleCloseEdit} style={{
                                background: 'transparent', border: '1px solid var(--glass-border)',
                                color: 'var(--text-muted)', padding: '0.5rem 1rem',
                            }}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={!formData.label?.trim()} style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem',
                            }}>
                                <Save size={16} /> Save
                            </Button>
                        </div>
                    </div>
                ) : (
                    // List View
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
                        {statuses.map((status) => {
                            const hex = resolveColor(status.color);
                            return (
                                <div
                                    key={status.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        padding: '0.75rem 1rem',
                                        borderRadius: 'var(--radius-sm)',
                                        border: `1px solid ${hex}30`,
                                        background: `${hex}08`,
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    {/* Color dot */}
                                    <div style={{
                                        width: '12px', height: '12px', borderRadius: '50%',
                                        backgroundColor: hex,
                                        boxShadow: `0 0 8px ${hex}60`,
                                        flexShrink: 0,
                                    }} />

                                    {/* Label */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontWeight: 600, fontSize: '0.95rem',
                                            color: 'var(--text-primary)',
                                        }}>
                                            {status.label}
                                        </div>
                                        <div style={{
                                            fontSize: '0.75rem', color: 'var(--text-muted)',
                                            marginTop: '2px', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        }}>
                                            <span style={{
                                                textTransform: 'capitalize',
                                            }}>
                                                {status.type}
                                            </span>
                                            {status.isSystem && (
                                                <span style={{
                                                    padding: '1px 6px', borderRadius: '10px', fontSize: '0.65rem',
                                                    fontWeight: 600, background: 'rgba(99, 102, 241, 0.12)',
                                                    color: 'hsl(240, 60%, 55%)', border: '1px solid rgba(99, 102, 241, 0.3)',
                                                }}>
                                                    System
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                                        <Button
                                            onClick={() => handleOpenEdit(status)}
                                            disabled={status.isSystem}
                                            style={{
                                                background: 'none', border: 'none', cursor: status.isSystem ? 'not-allowed' : 'pointer',
                                                opacity: status.isSystem ? 0.3 : 0.7, color: 'var(--text-muted)',
                                                padding: '6px', borderRadius: '6px', display: 'flex',
                                                transition: 'all 0.15s',
                                            }}
                                            onMouseEnter={e => { if (!status.isSystem) (e.currentTarget.style.opacity = '1'); e.currentTarget.style.background = 'var(--bg-overlay)' }}
                                            onMouseLeave={e => { if (!status.isSystem) (e.currentTarget.style.opacity = '0.7'); e.currentTarget.style.background = 'none' }}
                                        >
                                            <Edit2 size={14} />
                                        </Button>
                                        <Button
                                            onClick={() => setStatusToDelete(status.id)}
                                            disabled={status.isSystem}
                                            style={{
                                                background: 'none', border: 'none', cursor: status.isSystem ? 'not-allowed' : 'pointer',
                                                opacity: status.isSystem ? 0.3 : 0.7, color: 'var(--danger)',
                                                padding: '6px', borderRadius: '6px', display: 'flex',
                                                transition: 'all 0.15s',
                                            }}
                                            onMouseEnter={e => { if (!status.isSystem) (e.currentTarget.style.opacity = '1'); e.currentTarget.style.background = 'var(--bg-overlay)' }}
                                            onMouseLeave={e => { if (!status.isSystem) (e.currentTarget.style.opacity = '0.7'); e.currentTarget.style.background = 'none' }}
                                        >
                                            <Trash2 size={14} />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}

                        {statuses.length === 0 && (
                            <div style={{
                                textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)',
                                fontSize: '0.9rem',
                            }}>
                                No statuses configured. Click "Add" to create one.
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ConfirmModal
                open={!!statusToDelete}
                onClose={() => setStatusToDelete(null)}
                onConfirm={handleDelete}
                title="Delete Status"
                description="Are you sure you want to delete this agent status? This action cannot be undone."
                confirmText="Delete Status"
            />
        </GlassModal>
    );
};
