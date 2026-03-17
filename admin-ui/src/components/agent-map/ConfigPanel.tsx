import { Select } from '../ui/Select';
import React, { useState, useCallback } from 'react';
import { Plus, Trash2, Save, ChevronRight, Layers, RefreshCw, Users } from 'lucide-react';
import { updateLayout } from '../../services/api';
import '../../styles/agent-map.css';

import { Button } from '../ui/button';

/* ═══════════ Types ═══════════ */

interface ZoneLayoutItem {
    zone: number;
    x: number;
    y: number;
    w: number;
    h: number;
    cols: number;
    rows: number;
}

interface ZoneDefItem {
    name: string;
    color: string;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

interface FloorDef {
    id: string;
    floorId: string;
    _id?: string;
    label: string;
    width: number;
    height: number;
    zoneLayout: ZoneLayoutItem[];
    zoneDefs: ZoneDefItem[];
    [key: string]: any;
}

interface ConfigPanelProps {
    floorDef: FloorDef | null;
    currentFloor: string;
    selectedZoneIndex: number | null;
    onSelectZone: (index: number | null) => void;
    onZoneLayoutChange: (zoneLayout: ZoneLayoutItem[], zoneDefs: ZoneDefItem[]) => void;
    onSaveComplete: () => void;
    // Station editing (legacy, still useful)
    selectedStation: any | null;
    onUpdateStation: (id: string, data: any) => void;
    onBulkUpdateStations?: (updates: Record<number, any>) => void;
    onAutoRelayout?: (zoneIndex: number) => void;
    agents?: Record<string, any>;
    groups?: { _id: string; name: string; code?: string }[];
}

/* ═══════════ Default Colors ═══════════ */
const DEFAULT_ZONE_COLORS = [
    '#6366f1', // indigo
    '#22d3ee', // cyan
    '#f59e0b', // amber
    '#10b981', // emerald
    '#f43f5e', // rose
    '#a855f7', // purple
    '#3b82f6', // blue
    '#ef4444', // red
    '#14b8a6', // teal
    '#eab308', // yellow
];

/* ═══════════ Component ═══════════ */

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
    floorDef,
    selectedZoneIndex,
    onSelectZone,
    onZoneLayoutChange,
    onSaveComplete,
    selectedStation,
    onUpdateStation,
    onBulkUpdateStations,
    onAutoRelayout,
    agents = {},
    groups = [],
}) => {
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);
    const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
    const [assignGroupFilter, setAssignGroupFilter] = useState<string>('all');

    const zones = floorDef?.zoneLayout || [];
    const defs = floorDef?.zoneDefs || [];

    /* ─── helpers ─── */

    const syncDefs = useCallback((layout: ZoneLayoutItem[], currentDefs: ZoneDefItem[]): ZoneDefItem[] => {
        return layout.map((zl, i) => ({
            name: currentDefs[i]?.name || `Zone ${zl.zone}`,
            color: currentDefs[i]?.color || DEFAULT_ZONE_COLORS[i % DEFAULT_ZONE_COLORS.length],
            xMin: zl.x,
            xMax: zl.x + zl.w,
            yMin: zl.y,
            yMax: zl.y + zl.h,
        }));
    }, []);

    /* ─── Add Zone ─── */
    const handleAddZone = useCallback(() => {
        if (!floorDef) return;

        const nextZoneNum = zones.length > 0
            ? Math.max(...zones.map(z => z.zone)) + 1
            : 0;

        // offset位置: 放在最后一个zone下面, 或origin
        let newX = 100;
        let newY = 100;
        if (zones.length > 0) {
            const last = zones[zones.length - 1];
            newX = last.x;
            newY = last.y + last.h + 40; // 40px gap below
            // If it'd go off-canvas, wrap to the right
            if (newY + 300 > floorDef.height) {
                newX = last.x + last.w + 40;
                newY = 100;
            }
        }

        const newZoneLayout: ZoneLayoutItem = {
            zone: nextZoneNum,
            x: newX,
            y: newY,
            w: 400,
            h: 300,
            cols: 3,
            rows: 2,
        };

        const newZoneDef: ZoneDefItem = {
            name: `Zone ${nextZoneNum}`,
            color: DEFAULT_ZONE_COLORS[zones.length % DEFAULT_ZONE_COLORS.length],
            xMin: newX,
            xMax: newX + 400,
            yMin: newY,
            yMax: newY + 300,
        };

        const newLayout = [...zones, newZoneLayout];
        const newDefs = [...defs, newZoneDef];
        onZoneLayoutChange(newLayout, newDefs);
        onSelectZone(newLayout.length - 1);
    }, [floorDef, zones, defs, onZoneLayoutChange, onSelectZone]);

    /* ─── Delete Zone ─── */
    const handleDeleteZone = useCallback((idx: number) => {
        const newLayout = zones.filter((_, i) => i !== idx);
        const newDefs = defs.filter((_, i) => i !== idx);

        // Re-number zone indices
        const renumbered = newLayout.map((zl, i) => ({ ...zl, zone: i }));

        onZoneLayoutChange(renumbered, newDefs);
        if (selectedZoneIndex === idx) onSelectZone(null);
        else if (selectedZoneIndex !== null && selectedZoneIndex > idx) {
            onSelectZone(selectedZoneIndex - 1);
        }
        setConfirmDeleteIdx(null);
    }, [zones, defs, selectedZoneIndex, onZoneLayoutChange, onSelectZone]);

    /* ─── Update Zone Property ─── */
    const updateZoneProp = useCallback((idx: number, key: keyof ZoneLayoutItem, value: number) => {
        const newLayout = zones.map((zl, i) =>
            i === idx ? { ...zl, [key]: value } : zl
        );
        const newDefs = syncDefs(newLayout, defs);
        onZoneLayoutChange(newLayout, newDefs);
    }, [zones, defs, syncDefs, onZoneLayoutChange]);

    /* ─── Auto-Relayout: redistribute workstations evenly within current zone size ─── */
    const handleAutoRelayout = useCallback((idx: number) => {
        onAutoRelayout?.(idx);
    }, [onAutoRelayout]);

    const updateZoneDefProp = useCallback((idx: number, key: 'name' | 'color', value: string) => {
        const newDefs = defs.map((d, i) =>
            i === idx ? { ...d, [key]: value } : d
        );
        onZoneLayoutChange(zones, newDefs);
    }, [zones, defs, onZoneLayoutChange]);

    /* ─── Save ─── */
    const handleSave = useCallback(async () => {
        if (!floorDef) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            const floorIdentifier = floorDef._id || floorDef.floorId;
            await updateLayout(floorIdentifier, {
                zoneLayout: zones,
                zoneDefs: syncDefs(zones, defs),
                agentAssignments: floorDef.agentAssignments, // Persist station overrides
            });
            setSaveMsg('✅ Saved');
            onSaveComplete();
            setTimeout(() => setSaveMsg(null), 2000);
        } catch (err: any) {
            setSaveMsg(`❌ ${err.message || 'Save failed'}`);
        } finally {
            setSaving(false);
        }
    }, [floorDef, zones, defs, syncDefs, onSaveComplete]);

    /* ─── Auto-Assign Agents ─── */
    const handleAutoAssign = useCallback(() => {
        if (!floorDef || selectedZoneIndex === null) return;
        const targetZone = zones[selectedZoneIndex];
        if (!targetZone) return;

        // 1. Calculate station indices in this zone
        let startIdx = 0;
        for (let i = 0; i < selectedZoneIndex; i++) {
            startIdx += zones[i].cols * zones[i].rows;
        }
        const count = targetZone.cols * targetZone.rows;
        const zoneStationIndices: number[] = [];
        for (let i = 0; i < count; i++) zoneStationIndices.push(startIdx + i);

        // 2. Identify available agents
        // 要不要看GLOBAL assignments排除其他zone/floor已分配的agent?
        // Ideally yes, but locally we only know current floor assignments fully.
        // Let's check current floor assignments.
        const currentAssignments = floorDef.agentAssignments || {};
        const assignedAgentIds = new Set<string>();
        Object.values(currentAssignments).forEach((a: any) => {
            if (a.agentId) assignedAgentIds.add(a.agentId);
        });

        // Agent list from props
        // Assuming agents prop is passed as Record<string, Agent>
        const allAgents = Object.values(agents || {}) as any[];
        let availableAgents = allAgents.filter(a => !assignedAgentIds.has(a._id || a.id));

        // Filter by selected group
        if (assignGroupFilter !== 'all') {
            availableAgents = availableAgents.filter(a => {
                const gid = a.groupId?._id || a.groupId;
                return gid === assignGroupFilter;
            });
        }

        console.log('[AutoAssign] Total agents:', allAgents.length, 'Available:', availableAgents.length);

        const updates: Record<number, any> = {};
        const stationsToFill: number[] = [];

        // Helper to find pending agent
        const findAgent = (predicate: (a: any) => boolean) => {
            const idx = availableAgents.findIndex(predicate);
            if (idx !== -1) {
                const agent = availableAgents[idx];
                availableAgents.splice(idx, 1);
                return agent;
            }
            return null;
        };

        zoneStationIndices.forEach(idx => {
            const assignment = currentAssignments[idx];
            if (assignment?.agentId) return; // Already bound

            const label = assignment?.label;
            let matchedAgent = null;

            if (label) {
                // Pass 1: Exact Match (Label == SIP) using String casting
                matchedAgent = findAgent(a => String(a.sipNumber || '') === label);

                // Pass 2: Suffix Match (Label "001" -> SIP "1001")
                // Only if label is specific enough (length >= 2) to avoid false positives with single digits
                if (!matchedAgent && label.length >= 2) {
                    matchedAgent = findAgent(a => String(a.sipNumber || '').endsWith(label));
                }
            }

            if (matchedAgent) {
                console.log('[AutoAssign] Matched station', idx, 'label', label, 'to agent', matchedAgent.sipNumber);
                updates[idx] = { agentId: matchedAgent._id || matchedAgent.id };
            } else {
                stationsToFill.push(idx);
            }
        });

        // Pass 3: Sequential Fill
        // Sort agents by SIP number for predictable filling
        availableAgents.sort((a, b) => (parseInt(a.sipNumber) || 0) - (parseInt(b.sipNumber) || 0));

        stationsToFill.forEach(idx => {
            if (availableAgents.length === 0) return;
            const agent = availableAgents.shift(); // Take first
            if (agent) {
                console.log('[AutoAssign] Sequential fill station', idx, 'to agent', agent.sipNumber);
                updates[idx] = { agentId: agent._id || agent.id };
            }
        });

        if (Object.keys(updates).length > 0) {
            onBulkUpdateStations?.(updates);
            setSaveMsg(`Auto-assigned ${Object.keys(updates).length} agents`);
            setTimeout(() => setSaveMsg(null), 2000);
        } else {
            console.log('[AutoAssign] No updates generated. stationsToFill:', stationsToFill.length, 'remaining agents:', availableAgents.length);
            setSaveMsg('No agents assigned');
            setTimeout(() => setSaveMsg(null), 2000);
        }

    }, [floorDef, selectedZoneIndex, zones, agents, onBulkUpdateStations]);

    /* ─── Unbind Zone ─── */
    const handleUnbindZone = useCallback(() => {
        if (!floorDef || selectedZoneIndex === null) return;
        const targetZone = zones[selectedZoneIndex];
        if (!targetZone) return;

        // 1. Calculate station indices
        let startIdx = 0;
        for (let i = 0; i < selectedZoneIndex; i++) {
            startIdx += zones[i].cols * zones[i].rows;
        }
        const count = targetZone.cols * targetZone.rows;

        const updates: Record<number, any> = {};
        let changeCount = 0;
        const currentAssignments = floorDef.agentAssignments || {};

        for (let i = 0; i < count; i++) {
            const idx = startIdx + i;
            if (currentAssignments[idx]?.agentId) {
                updates[idx] = { agentId: null, status: null }; // Request unbind
                changeCount++;
            }
        }

        if (changeCount > 0) {
            onBulkUpdateStations?.(updates);
            setSaveMsg(`Unbound ${changeCount} stations`);
            setTimeout(() => setSaveMsg(null), 2000);
        }
    }, [floorDef, selectedZoneIndex, zones, onBulkUpdateStations]);

    const selectedZone = selectedZoneIndex !== null ? zones[selectedZoneIndex] : null;
    const selectedDef = selectedZoneIndex !== null ? defs[selectedZoneIndex] : null;

    if (!floorDef) {
        return (
            <div className="config-panels">
                <h2 className="panel-title">Zone Editor</h2>
                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No floor selected</p>
            </div>
        );
    }

    return (
        <div className="config-panels">
            <h2 className="panel-title">
                <Layers size={18} style={{ marginRight: 6, opacity: 0.7 }} />
                Zone Editor
            </h2>

            {/* ─── Zone List ─── */}
            <div className="zone-editor-section">
                <div className="section-title">Zones ({zones.length})</div>
                <div className="zone-editor-list">
                    {zones.map((zl, idx) => {
                        const def = defs[idx];
                        const isSelected = selectedZoneIndex === idx;
                        return (
                            <div
                                key={`zone-${idx}`}
                                className={`zone-editor-item ${isSelected ? 'selected' : ''}`}
                                onClick={() => onSelectZone(isSelected ? null : idx)}
                            >
                                <span
                                    className="zone-color-dot"
                                    style={{ backgroundColor: def?.color || '#6366f1' }}
                                />
                                <span className="zone-item-name">
                                    {def?.name || `Zone ${zl.zone}`}
                                </span>
                                <span className="zone-item-count">
                                    {zl.cols * zl.rows} seats
                                </span>
                                <ChevronRight
                                    size={14}
                                    className="zone-item-chevron"
                                    style={{ transform: isSelected ? 'rotate(90deg)' : 'none' }}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Add Zone Button */}
                <Button variant="none" className="zone-add-btn" onClick={handleAddZone}>
                    <Plus size={14} />
                    Add Zone
                </Button>
            </div>

            {/* ─── Zone Property Editor ─── */}
            {selectedZone && selectedDef && selectedZoneIndex !== null && (
                <div className="zone-editor-section zone-editor-form">
                    <div className="section-title">
                        Zone Properties
                    </div>

                    {/* Name */}
                    <div className="form-group">
                        <label className="form-label">Name</label>
                        <input
                            type="text"
                            className="form-input"
                            value={selectedDef.name}
                            onChange={e => updateZoneDefProp(selectedZoneIndex, 'name', e.target.value)}
                        />
                    </div>

                    {/* Color */}
                    <div className="form-group">
                        <label className="form-label">Color</label>
                        <div className="zone-color-row">
                            <input
                                type="color"
                                className="zone-color-picker"
                                value={selectedDef.color}
                                onChange={e => updateZoneDefProp(selectedZoneIndex, 'color', e.target.value)}
                            />
                            <span className="zone-color-hex">{selectedDef.color}</span>
                        </div>
                    </div>

                    {/* Grid: Cols × Rows */}
                    <div className="form-group">
                        <label className="form-label">Workstations (cols × rows)</label>
                        <div className="zone-grid-inputs">
                            <input
                                type="number"
                                className="form-input"
                                min={1}
                                max={20}
                                value={selectedZone.cols}
                                onChange={e => updateZoneProp(selectedZoneIndex, 'cols', Math.max(1, parseInt(e.target.value) || 1))}
                            />
                            <span className="zone-grid-x">×</span>
                            <input
                                type="number"
                                className="form-input"
                                min={1}
                                max={20}
                                value={selectedZone.rows}
                                onChange={e => updateZoneProp(selectedZoneIndex, 'rows', Math.max(1, parseInt(e.target.value) || 1))}
                            />
                            <span className="zone-grid-total">
                                = {selectedZone.cols * selectedZone.rows}
                            </span>
                        </div>
                    </div>

                    {/* Position */}
                    <div className="form-group">
                        <label className="form-label">Position (x, y)</label>
                        <div className="zone-grid-inputs">
                            <input
                                type="number"
                                className="form-input"
                                value={selectedZone.x}
                                onChange={e => updateZoneProp(selectedZoneIndex, 'x', parseInt(e.target.value) || 0)}
                            />
                            <input
                                type="number"
                                className="form-input"
                                value={selectedZone.y}
                                onChange={e => updateZoneProp(selectedZoneIndex, 'y', parseInt(e.target.value) || 0)}
                            />
                        </div>
                    </div>

                    {/* Size */}
                    <div className="form-group">
                        <label className="form-label">Size (w × h)</label>
                        <div className="zone-grid-inputs">
                            <input
                                type="number"
                                className="form-input"
                                min={100}
                                value={selectedZone.w}
                                onChange={e => updateZoneProp(selectedZoneIndex, 'w', Math.max(100, parseInt(e.target.value) || 100))}
                            />
                            <span className="zone-grid-x">×</span>
                            <input
                                type="number"
                                className="form-input"
                                min={100}
                                value={selectedZone.h}
                                onChange={e => updateZoneProp(selectedZoneIndex, 'h', Math.max(100, parseInt(e.target.value) || 100))}
                            />
                        </div>
                    </div>

                    {/* Automation Tools */}
                    <div className="form-group-divider" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '12px 0' }} />

                    <div className="form-group">
                        <label className="form-label">Automation</label>

                        {/* Group Filter for Auto-Assign */}
                        {groups.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                                <label className="form-label" style={{ fontSize: '0.6875rem', color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Users size={12} />
                                    Assign from Group
                                </label>
                                <Select
                                    className="form-input"
                                    value={assignGroupFilter}
                                    onChange={e => setAssignGroupFilter(e.target.value)}
                                    style={{ fontSize: '0.8125rem' }}
                                >
                                    <option value="all">All Groups</option>
                                    {groups.map(g => (
                                        <option key={g._id} value={g._id}>{g.name}</option>
                                    ))}
                                </Select>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Button variant="none" className="zone-add-btn"
                                style={{ flex: 1, background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.4)' }}
                                onClick={handleAutoAssign}
                                title={assignGroupFilter !== 'all'
                                    ? `Assign agents from selected group`
                                    : 'Assign agents (Match Label=SIP, then Sequential)'}
                            >
                                <RefreshCw size={14} style={{ marginRight: 4 }} />
                                Auto-Assign
                            </Button>
                            <Button variant="none" className="zone-add-btn"
                                style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
                                onClick={handleUnbindZone}
                                title="Unbind all agents in this zone"
                            >
                                <Trash2 size={14} style={{ marginRight: 4 }} />
                                Unbind
                            </Button>
                        </div>
                        <Button variant="none" className="zone-add-btn"
                            style={{ marginTop: 8, width: '100%' }}
                            onClick={() => handleAutoRelayout(selectedZoneIndex)}
                        >
                            <RefreshCw size={14} />
                            Re-distribute Seats
                        </Button>
                    </div>

                    {/* Delete */}
                    {confirmDeleteIdx === selectedZoneIndex ? (
                        <div className="zone-delete-confirm">
                            <span>Delete this zone?</span>
                            <Button
                                className="zone-delete-yes"
                                onClick={() => handleDeleteZone(selectedZoneIndex)}
                            >
                                Confirm
                            </Button>
                            <Button
                                className="zone-delete-no"
                                onClick={() => setConfirmDeleteIdx(null)}
                            >
                                Cancel
                            </Button>
                        </div>
                    ) : (
                        <Button variant="none" className="delete-btn"
                            onClick={() => setConfirmDeleteIdx(selectedZoneIndex)}
                        >
                            <Trash2 size={14} style={{ marginRight: 4 }} />
                            Delete Zone
                        </Button>
                    )}
                </div>
            )}

            {/* ─── Station Editor (legacy, when station selected) ─── */}
            {selectedStation && (
                <div className="zone-editor-section">
                    <div className="section-title">Selected Station</div>
                    <div className="form-group">
                        <label className="form-label">Label / Name</label>
                        <input
                            type="text"
                            value={selectedStation.label || ''}
                            onChange={(e) => onUpdateStation(selectedStation.id, { label: e.target.value })}
                            className="form-input"
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Agent Binding</label>
                        {/* Agent Selector Combobox */}
                        <div className="agent-selector">
                            <Select
                                className="form-input"
                                value={selectedStation.agentId || ''}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    onUpdateStation(selectedStation.id, { agentId: val || null });
                                }}
                            >
                                <option value="">-- Unassigned --</option>
                                {Object.values(agents || {}).filter((a: any) => {
                                    if (!a.sipNumber) return false;
                                    const agentId = a._id || a.id;
                                    // Always show the currently bound agent
                                    if (agentId === selectedStation.agentId) return true;
                                    // Hide agents already assigned to other stations
                                    const assignments = floorDef?.agentAssignments || {};
                                    const isAssigned = Object.values(assignments).some(
                                        (assign: any) => assign?.agentId && assign.agentId === agentId
                                    );
                                    if (isAssigned) return false;
                                    // Filter by group if selected
                                    if (assignGroupFilter !== 'all') {
                                        const gid = a.groupId?._id || a.groupId;
                                        if (gid !== assignGroupFilter) return false;
                                    }
                                    return true;
                                }).map((agent: any) => (
                                    <option key={agent._id || agent.id} value={agent._id || agent.id}>
                                        {agent.displayName || agent.name} ({agent.sipNumber})
                                    </option>
                                ))}
                            </Select>
                            {/* Search helper could go here later */}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Save Button ─── */}
            <div className="zone-editor-save">
                <Button variant="none" className="save-btn"
                    onClick={handleSave}
                    disabled={saving}
                >
                    <Save size={14} style={{ marginRight: 6 }} />
                    {saving ? 'Saving...' : 'Save Layout'}
                </Button>
                {saveMsg && (
                    <div className="zone-save-msg">{saveMsg}</div>
                )}
            </div>
        </div>
    );
};
