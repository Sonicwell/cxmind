export const projectPoint = (x: number, y: number, width: number, height: number, viewMode: '2d' | '3d') => {
    if (viewMode === '2d') return { x, y };

    // Match MapCanvas isometricProps:
    // rotation: 45
    // scaleX: 0.8
    // scaleY: 0.6
    // offset: { x: width/2, y: height/2 } -> This means the group's origin (0,0) is at width/2, height/2 visually? 
    // No, Konva offset shifts the origin *before* rotation/scale.
    // Group x,y is width/2, height/2.
    // So visual point P_v = (P_local - offset) * matrix + (x,y)

    const ox = x - width / 2; // Offset
    const oy = y - height / 2;

    // Rotation 45deg
    // Konva rotation is clockwise.
    const angle = 45;
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Rotate
    const rx = ox * cos - oy * sin;
    const ry = ox * sin + oy * cos;

    // Scale
    const sx = rx * 0.8;
    const sy = ry * 0.6;

    // Translate to Group Position (width/2, height/2)
    return {
        x: sx + width / 2,
        y: sy + height / 2
    };
};

/* ═══════════ Unified Agent Status Map (Single Source of Truth) ═══════════ */

export interface StatusDef {
    color: string;
    glow: string;
    label: string;
}

export const AGENT_STATUS_MAP: Record<string, StatusDef> = {
    available: { color: '#22c55e', glow: '#4ade80', label: 'Available' },
    oncall: { color: '#ef4444', glow: '#f87171', label: 'On Call' },
    ring: { color: '#eab308', glow: '#facc15', label: 'Ringing' },
    wrapup: { color: '#06b6d4', glow: '#22d3ee', label: 'Wrap-up' },
    break: { color: '#a855f7', glow: '#c084fc', label: 'Break' },
    away: { color: '#f59e0b', glow: '#fbbf24', label: 'Away' },
    dnd: { color: '#ef4444', glow: '#f87171', label: 'Do Not Disturb' },
    busy: { color: '#ef4444', glow: '#f87171', label: 'Busy' },
    onhold: { color: '#f59e0b', glow: '#fbbf24', label: 'On Hold' },
    online: { color: '#3b82f6', glow: '#60a5fa', label: 'Online' },
    working: { color: '#3b82f6', glow: '#60a5fa', label: 'Working' },
    meeting: { color: '#8b5cf6', glow: '#a78bfa', label: 'Meeting' },
    offline: { color: '#4b5563', glow: 'transparent', label: 'Offline' },
};

export const DEFAULT_STATUS: StatusDef = AGENT_STATUS_MAP.offline;

export const getStatusColor = (status?: string): string =>
    (status && AGENT_STATUS_MAP[status]?.color) || DEFAULT_STATUS.color;

export const getGlowColor = (status?: string): string =>
    (status && AGENT_STATUS_MAP[status]?.glow) || DEFAULT_STATUS.glow;

export const getStatusLabel = (status?: string): string =>
    (status && AGENT_STATUS_MAP[status]?.label) || status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Offline';

/* ═══════════ Database-Configured Status Support ═══════════ */

export interface ConfiguredStatus {
    id: string;
    label: string;
    color: string;    // Named color (e.g. 'green') or hex
    type: 'available' | 'away' | 'dnd';
    isSystem?: boolean;
}

/** Resolve named colors from Agent Status Config to hex */
const COLOR_NAME_MAP: Record<string, string> = {
    green: '#22c55e',
    orange: '#f59e0b',
    yellow: '#eab308',
    red: '#ef4444',
    gray: '#6b7280',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    cyan: '#06b6d4',
};

export const resolveStatusColor = (color: string): string =>
    COLOR_NAME_MAP[color] || color;


