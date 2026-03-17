import React, { useState } from 'react';
import { createLayout, updateLayout, deleteLayout, reorderLayouts } from '../../services/api';
import { ChevronUp, ChevronDown, Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { GlassModal } from '../ui/GlassModal';
import { Button } from '../ui/button';



interface FloorManagerProps {
    floors: any[]; // Using any to match API response flexible structure temporarily
    onUpdate: (silent?: boolean) => void;
    onClose: () => void;
}

export const FloorManager: React.FC<FloorManagerProps> = ({ floors, onUpdate, onClose }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // New Floor Form State
    const [newFloor, setNewFloor] = useState({
        floorId: '',
        label: '',
        width: 2000,
        height: 2000
    });

    // Edit Floor Form State
    const [editForm, setEditForm] = useState({
        label: '',
        width: 2000,
        height: 2000
    });

    const handleCreate = async () => {
        try {
            setError(null);
            await createLayout({
                ...newFloor,
                zoneLayout: [],
                zoneDefs: [],
                walls: []
            });
            setIsAdding(false);
            setNewFloor({ floorId: '', label: '', width: 2000, height: 2000 });
            onUpdate();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to create floor');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            setError(null);
            setConfirmDeleteId(null);
            await deleteLayout(id);
            onUpdate();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to delete floor');
        }
    };

    const startEdit = (floor: any) => {
        setEditingId(floor._id || floor.floorId);
        setEditForm({
            label: floor.label,
            width: floor.width,
            height: floor.height
        });
    };

    const saveEdit = async (id: string) => {
        try {
            setError(null);
            await updateLayout(id, editForm);
            setEditingId(null);
            onUpdate();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update floor');
        }
    };

    const moveFloor = async (index: number, direction: 'up' | 'down') => {
        const newFloors = [...floors];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex < 0 || targetIndex >= newFloors.length) return;

        // Swap
        [newFloors[index], newFloors[targetIndex]] = [newFloors[targetIndex], newFloors[index]];

        // Optimistic update locally not needed as we refresh, but serves as visual check
        const orderedIds = newFloors.map(f => f.id || f.floorId);

        try {
            await reorderLayouts(orderedIds);
            onUpdate(true);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to reorder floors');
        }
    };

    const buttonStyle = {
        padding: '6px 10px',
        color: 'var(--text-secondary)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    };

    const inputStyle = {
        background: 'rgba(30, 35, 50, 0.8)',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        borderRadius: '4px',
        padding: '6px 10px',
        color: '#e2e8f0',
        fontSize: '14px',
        width: '100%'
    };

    return (
        <GlassModal
            open={true}
            onOpenChange={(v) => { if (!v) onClose(); }}
            title="🏢 Floor Management"
            className="agent-map-modal"
            style={{ maxWidth: '600px' }}
            preventClose
        >
            {/* Content */}
            <div style={{ color: 'var(--text-primary)' }}>
                {error && (
                    <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'hsla(0, 60%, 50%, 0.12)', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: '4px' }}>
                        {error}
                    </div>
                )}

                {/* Floor List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                    {floors.map((floor, index) => (
                        <div key={floor._id || floor.floorId || index} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px',
                            backgroundColor: 'rgba(20, 24, 35, 0.9)',
                            borderRadius: '4px',
                            border: '1px solid rgba(99, 102, 241, 0.15)'
                        }}>
                            {/* Reorder Controls */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <Button
                                    onClick={() => moveFloor(index, 'up')}
                                    disabled={index === 0}
                                    style={{ ...buttonStyle, padding: '2px', opacity: index === 0 ? 0.3 : 1 }}
                                >
                                    <ChevronUp size={16} />
                                </Button>
                                <Button
                                    onClick={() => moveFloor(index, 'down')}
                                    disabled={index === floors.length - 1}
                                    style={{ ...buttonStyle, padding: '2px', opacity: index === floors.length - 1 ? 0.3 : 1 }}
                                >
                                    <ChevronDown size={16} />
                                </Button>
                            </div>

                            {/* Floor Info / Edit Mode */}
                            {editingId === (floor._id || floor.floorId) ? (
                                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px' }}>
                                    <input
                                        value={editForm.label}
                                        onChange={e => setEditForm({ ...editForm, label: e.target.value })}
                                        style={inputStyle}
                                        placeholder="Label"
                                    />
                                    <input
                                        type="number"
                                        value={editForm.width}
                                        onChange={e => setEditForm({ ...editForm, width: Number(e.target.value) })}
                                        style={inputStyle}
                                        placeholder="Width"
                                    />
                                    <input
                                        type="number"
                                        value={editForm.height}
                                        onChange={e => setEditForm({ ...editForm, height: Number(e.target.value) })}
                                        style={inputStyle}
                                        placeholder="Height"
                                    />
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <Button variant="none" onClick={() => saveEdit(floor._id || floor.floorId)} style={{ ...buttonStyle, color: '#4ade80' }}>
                                            <Save size={18} />
                                        </Button>
                                        <Button variant="none" onClick={() => setEditingId(null)} style={buttonStyle}>
                                            <X size={18} />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 'bold', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {floor.label}
                                            <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace', backgroundColor: 'rgba(30, 35, 50, 0.8)', padding: '2px 6px', borderRadius: '4px' }}>
                                                {floor.floorId}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                                            Size: {floor.width} x {floor.height}
                                        </div>
                                    </div>

                                    {/* Inline confirm delete */}
                                    {confirmDeleteId === floor.floorId ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '12px', color: 'var(--warning)', whiteSpace: 'nowrap' }}>Delete?</span>
                                            <Button
                                                onClick={() => handleDelete(floor.floorId)}
                                                style={{ ...buttonStyle, backgroundColor: 'var(--danger)', color: 'white', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
                                            >
                                                Confirm
                                            </Button>
                                            <Button
                                                onClick={() => setConfirmDeleteId(null)}
                                                style={{ ...buttonStyle, backgroundColor: 'rgba(30, 35, 50, 0.8)', padding: '4px 12px', borderRadius: '4px', fontSize: '12px' }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <Button variant="none" onClick={() => startEdit(floor)} style={{ ...buttonStyle, backgroundColor: 'rgba(30, 35, 50, 0.8)', padding: '8px', borderRadius: '4px' }}>
                                                <Edit2 size={16} />
                                            </Button>
                                            <Button variant="none" onClick={() => setConfirmDeleteId(floor.floorId)} style={{ ...buttonStyle, backgroundColor: 'rgba(30, 35, 50, 0.8)', padding: '8px', borderRadius: '4px', color: 'var(--danger)' }}>
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </div>

                {/* Add New Floor */}
                {isAdding ? (
                    <div style={{ backgroundColor: 'rgba(20, 24, 35, 0.9)', padding: '16px', borderRadius: '4px', border: '1px dashed rgba(99, 102, 241, 0.2)' }}>
                        <h3 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>Add New Floor</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>ID (Unique)</label>
                                <input
                                    value={newFloor.floorId}
                                    onChange={e => setNewFloor({ ...newFloor, floorId: e.target.value })}
                                    style={inputStyle}
                                    placeholder="e.g. 3F"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Label</label>
                                <input
                                    value={newFloor.label}
                                    onChange={e => setNewFloor({ ...newFloor, label: e.target.value })}
                                    style={inputStyle}
                                    placeholder="e.g. 3rd Floor"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Width</label>
                                <input
                                    type="number"
                                    value={newFloor.width}
                                    onChange={e => setNewFloor({ ...newFloor, width: Number(e.target.value) })}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Height</label>
                                <input
                                    type="number"
                                    value={newFloor.height}
                                    onChange={e => setNewFloor({ ...newFloor, height: Number(e.target.value) })}
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <Button
                                onClick={() => setIsAdding(false)}
                                style={{ ...buttonStyle, color: 'var(--text-muted)' }}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreate}
                                style={{ ...buttonStyle, backgroundColor: 'var(--primary)', color: 'white', fontWeight: 500, borderRadius: '4px' }}
                            >
                                Create Floor
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        onClick={() => setIsAdding(true)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px dashed rgba(99, 102, 241, 0.25)',
                            borderRadius: '4px',
                            color: '#94a3b8',
                            background: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        <Plus size={16} /> Add New Floor
                    </Button>
                )}
            </div>
        </GlassModal>
    );
};
