import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ZoneOverlay — HTML overlay for drag-to-move and drag-to-resize zones in 2D edit mode.
 *
 * Renders translucent rectangles on top of the canvas. The coordinate mapping
 * uses the same formula as MapCanvas3D: world = (px - center) / 40, then
 * projected with orthographic zoom.
 *
 * This overlay does NOT render inside Three.js — it sits as a sibling div.
 */

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

interface ZoneOverlayProps {
    zoneLayout: ZoneLayoutItem[];
    zoneDefs: ZoneDefItem[];
    /** Canvas pixel dimensions */
    canvasWidth: number;
    canvasHeight: number;
    /** Current orthographic zoom value */
    zoom: number;
    /** Pan offset [x, z] in world units */
    panOffset: [number, number];
    /** Currently selected zone index */
    selectedZoneIndex: number | null;
    onSelectZone: (index: number | null) => void;
    onZoneMove: (zoneIndex: number, newX: number, newY: number) => void;
    onZoneResize: (zoneIndex: number, newW: number, newH: number, newX?: number, newY?: number) => void;
    /** Station data for showing online/total counts */
    stations?: any[];
    /** Agent data for resolving online status */
    agents?: Record<string, any>;
}

type DragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-s' | 'resize-e' | 'resize-w';

export const ZoneOverlay: React.FC<ZoneOverlayProps> = ({
    zoneLayout,
    zoneDefs,
    canvasWidth,
    canvasHeight,
    zoom,
    panOffset,
    selectedZoneIndex,
    onSelectZone,
    onZoneMove,
    onZoneResize,
    stations = [],
    agents = {},
}) => {
    const [dragMode, setDragMode] = useState<DragMode | null>(null);
    const [dragZoneIdx, setDragZoneIdx] = useState<number | null>(null);
    const dragStart = useRef({ mx: 0, my: 0, zx: 0, zy: 0, zw: 0, zh: 0 });

    // Compute layout center (same algorithm as MapCanvas3D)
    const layoutCenter = React.useMemo(() => {
        if (zoneDefs.length === 0) return { cx: 0, cy: 0 };
        const allX = zoneDefs.flatMap(z => [z.xMin, z.xMax]);
        const allY = zoneDefs.flatMap(z => [z.yMin, z.yMax]);
        return {
            cx: (Math.min(...allX) + Math.max(...allX)) / 2,
            cy: (Math.min(...allY) + Math.max(...allY)) / 2,
        };
    }, [zoneDefs]);

    /**
     * Convert floor-space px coords to screen pixel coords on the overlay.
     *
     * MapCanvas3D uses orthographic camera:
     *   worldX = (px - cx) / 40
     *   worldZ = (py - cy) / 40
     * 
     * In 2D top-down, the camera looks straight down so:
     *   screenX = canvasWidth/2  + (worldX - panOffset[0]) * zoom
     *   screenY = canvasHeight/2 + (worldZ - panOffset[1]) * zoom
     */
    const floorToScreen = useCallback((px: number, py: number): [number, number] => {
        const worldX = (px - layoutCenter.cx) / 40;
        const worldZ = (py - layoutCenter.cy) / 40;
        const sx = canvasWidth / 2 + (worldX - panOffset[0]) * zoom;
        const sy = canvasHeight / 2 + (worldZ - panOffset[1]) * zoom;
        return [sx, sy];
    }, [layoutCenter, canvasWidth, canvasHeight, zoom, panOffset]);

    /** Convert a screen-space delta (dx pixels) to floor-space delta. */
    const screenDeltaToFloor = useCallback((dsx: number, dsy: number): [number, number] => {
        return [dsx / zoom * 40, dsy / zoom * 40];
    }, [zoom]);

    const SNAP_THRESHOLD = 5;
    const GRID_SIZE = 20;

    /**
     * Helper to snap a value to nearby interesting values (adsorption) or grid.
     * @param val Current value (floor coords)
     * @param snapTargets List of values to snap to
     * @returns [snappedValue, isSnappingToTarget]
     */
    const getSnapValue = (val: number, snapTargets: number[]): [number, boolean] => {
        // 1. Try Adsorption (snap to other zones)
        let closestTarget: number | null = null;
        let minDiff = SNAP_THRESHOLD;

        for (const target of snapTargets) {
            const diff = Math.abs(val - target);
            if (diff < minDiff) {
                minDiff = diff;
                closestTarget = target;
            }
        }

        if (closestTarget !== null) {
            return [closestTarget, true];
        }

        // 2. Grid Snap
        const gridSnap = Math.round(val / GRID_SIZE) * GRID_SIZE;
        if (Math.abs(val - gridSnap) < SNAP_THRESHOLD) {
            return [gridSnap, false];
        }

        return [val, false];
    };

    /* ─── Mouse handlers ─── */
    const handlePointerDown = useCallback((e: React.PointerEvent, zoneIdx: number, mode: DragMode) => {
        e.stopPropagation();
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);

        const zl = zoneLayout[zoneIdx];
        setDragMode(mode);
        setDragZoneIdx(zoneIdx);
        dragStart.current = { mx: e.clientX, my: e.clientY, zx: zl.x, zy: zl.y, zw: zl.w, zh: zl.h };
        onSelectZone(zoneIdx);
    }, [zoneLayout, onSelectZone]);

    const handlePointerMoveRaw = useCallback((e: PointerEvent) => {
        if (dragMode === null || dragZoneIdx === null) return;
        e.stopPropagation();

        const isShiftDown = e.shiftKey; // Bypass snap

        const dx = e.clientX - dragStart.current.mx;
        const dy = e.clientY - dragStart.current.my;
        const [fdx, fdy] = screenDeltaToFloor(dx, dy);

        const { zx, zy, zw, zh } = dragStart.current;

        // Collect snap targets from OTHER zones
        const xTargets: number[] = [];
        const yTargets: number[] = [];

        if (!isShiftDown) {
            zoneLayout.forEach((z, idx) => {
                if (idx === dragZoneIdx) return;
                xTargets.push(z.x, z.x + z.w);
                yTargets.push(z.y, z.y + z.h);
            });
        }

        if (dragMode === 'move') {
            let newX = zx + fdx;
            let newY = zy + fdy;

            if (!isShiftDown) {
                const [snapX_L] = getSnapValue(newX, xTargets);
                const [snapX_R_val] = getSnapValue(newX + zw, xTargets);
                const snapX_R = snapX_R_val - zw;

                const diffL = Math.abs(snapX_L - newX);
                const diffR = Math.abs(snapX_R - newX);

                if (diffL < diffR && diffL < SNAP_THRESHOLD) newX = snapX_L;
                else if (diffR < SNAP_THRESHOLD) newX = snapX_R;

                const [snapY_T] = getSnapValue(newY, yTargets);
                const [snapY_B_val] = getSnapValue(newY + zh, yTargets);
                const snapY_B = snapY_B_val - zh;

                const diffT = Math.abs(snapY_T - newY);
                const diffB = Math.abs(snapY_B - newY);

                if (diffT < diffB && diffT < SNAP_THRESHOLD) newY = snapY_T;
                else if (diffB < SNAP_THRESHOLD) newY = snapY_B;
            }

            onZoneMove(dragZoneIdx, newX, newY);
        } else {
            // Resize logic
            let newX = zx, newY = zy, newW = zw, newH = zh;

            let rawX = zx, rawY = zy, rawW = zw, rawH = zh;
            if (dragMode.includes('e')) rawW = zw + fdx;
            if (dragMode.includes('w')) { rawX = zx + fdx; rawW = zw - fdx; }
            if (dragMode.includes('s')) rawH = zh + fdy;
            if (dragMode.includes('n')) { rawY = zy + fdy; rawH = zh - fdy; }

            if (!isShiftDown) {
                if (dragMode.includes('e')) {
                    const targetPos = zx + rawW;
                    const [snapped] = getSnapValue(targetPos, xTargets);
                    newW = snapped - zx;
                }
                if (dragMode.includes('w')) {
                    const [snapped] = getSnapValue(rawX, xTargets);
                    const diff = snapped - rawX;
                    newX = snapped;
                    newW = rawW - diff;
                }
                if (dragMode.includes('s')) {
                    const targetPos = zy + rawH;
                    const [snapped] = getSnapValue(targetPos, yTargets);
                    newH = snapped - zy;
                }
                if (dragMode.includes('n')) {
                    const [snapped] = getSnapValue(rawY, yTargets);
                    const diff = snapped - rawY;
                    newY = snapped;
                    newH = rawH - diff;
                }
            } else {
                newX = rawX; newY = rawY; newW = rawW; newH = rawH;
            }

            if (newW < 100) {
                newW = 100;
                if (dragMode.includes('w')) newX = zx + zw - 100;
            }
            if (newH < 100) {
                newH = 100;
                if (dragMode.includes('n')) newY = zy + zh - 100;
            }

            onZoneResize(dragZoneIdx, newW, newH, newX, newY);
        }
    }, [dragMode, dragZoneIdx, screenDeltaToFloor, onZoneMove, onZoneResize, zoneLayout]);

    const handlePointerUpRaw = useCallback(() => {
        setDragMode(null);
        setDragZoneIdx(null);
    }, []);

    // Use window-level listeners for drag to bypass CSS pointerEvents: none on container
    useEffect(() => {
        if (dragMode === null) return;
        window.addEventListener('pointermove', handlePointerMoveRaw);
        window.addEventListener('pointerup', handlePointerUpRaw);
        return () => {
            window.removeEventListener('pointermove', handlePointerMoveRaw);
            window.removeEventListener('pointerup', handlePointerUpRaw);
        };
    }, [dragMode, handlePointerMoveRaw, handlePointerUpRaw]);

    const getCursor = (mode: DragMode): string => {
        if (mode === 'move') return 'move';
        if (mode === 'resize-nw' || mode === 'resize-se') return 'nwse-resize';
        if (mode === 'resize-ne' || mode === 'resize-sw') return 'nesw-resize';
        if (mode === 'resize-n' || mode === 'resize-s') return 'ns-resize';
        return 'ew-resize';
    };

    return (
        <div
            className="zone-overlay-container"
            style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 10,
                cursor: dragMode ? getCursor(dragMode) : 'default',
            }}
        >
            {zoneLayout.map((zl, idx) => {
                const [sx, sy] = floorToScreen(zl.x, zl.y);
                const [ex, ey] = floorToScreen(zl.x + zl.w, zl.y + zl.h);
                const width = ex - sx;
                const height = ey - sy;
                const def = zoneDefs[idx];
                const isSelected = selectedZoneIndex === idx;

                return (
                    <div key={`zo-${idx}`} style={{
                        position: 'absolute',
                        left: sx,
                        top: sy,
                        width: Math.max(0, width),
                        height: Math.max(0, height),
                        pointerEvents: 'none', // Allow clicks to pass through main container
                    }}>
                        {/* Zone body — visual only, clicks pass through to workstations/canvas */}
                        <div
                            className={`zone-overlay-rect ${isSelected ? 'selected' : ''}`}
                            style={{
                                borderColor: def?.color || '#6366f1',
                                backgroundColor: isSelected
                                    ? `${def?.color || '#6366f1'}15`
                                    : 'transparent',
                                pointerEvents: 'none',
                            }}
                        >
                            {/* QI Card reserved area indicator */}
                            <div style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                bottom: 0,
                                height: Math.max(20, height * 0.12),
                                borderTop: `1px dashed ${def?.color || '#6366f1'}80`,
                                background: `repeating-linear-gradient(
                                    -45deg,
                                    transparent,
                                    transparent 3px,
                                    ${def?.color || '#6366f1'}10 3px,
                                    ${def?.color || '#6366f1'}10 6px
                                )`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <span style={{
                                    fontSize: '9px',
                                    color: `${def?.color || '#6366f1'}90`,
                                    letterSpacing: '0.05em',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    userSelect: 'none',
                                }}>
                                    QI Card Area
                                </span>
                            </div>
                        </div>

                        {/* Zone label with stats — positioned ABOVE zone box */}
                        <div
                            className="zone-overlay-label"
                            style={{
                                color: def?.color || '#6366f1',
                                pointerEvents: 'auto',
                                cursor: 'move',
                                position: 'absolute',
                                bottom: '100%',
                                left: 0,
                                marginBottom: 2,
                            }}
                            onPointerDown={e => handlePointerDown(e, idx, 'move')}
                        >
                            <span className="zone-overlay-name">{def?.name || `Zone ${zl.zone}`}</span>
                            {(() => {
                                // Compute station range for this zone
                                let startIdx = 0;
                                for (let z = 0; z < idx; z++) startIdx += zoneLayout[z].cols * zoneLayout[z].rows;
                                const count = zl.cols * zl.rows;
                                const zoneStations = stations.slice(startIdx, startIdx + count);
                                const onlineCount = zoneStations.filter((s: any) => {
                                    if (!s.agentId) return false;
                                    const a = agents[s.agentId];
                                    return a && a.status !== 'offline';
                                }).length;
                                const assignedCount = zoneStations.filter((s: any) => !!s.agentId).length;
                                return (
                                    <span className="zone-overlay-stats">
                                        {onlineCount} online · {assignedCount}/{count} assigned
                                    </span>
                                );
                            })()}
                        </div>

                        {/* Interactive border strips — click to select zone, drag to move */}
                        {/* Top */}
                        <div style={{ position: 'absolute', left: 0, top: -3, width: '100%', height: 6, pointerEvents: 'auto', cursor: 'move' }}
                            onPointerDown={e => handlePointerDown(e, idx, 'move')} />
                        {/* Bottom */}
                        <div style={{ position: 'absolute', left: 0, bottom: -3, width: '100%', height: 6, pointerEvents: 'auto', cursor: 'move' }}
                            onPointerDown={e => handlePointerDown(e, idx, 'move')} />
                        {/* Left */}
                        <div style={{ position: 'absolute', left: -3, top: 0, width: 6, height: '100%', pointerEvents: 'auto', cursor: 'move' }}
                            onPointerDown={e => handlePointerDown(e, idx, 'move')} />
                        {/* Right */}
                        <div style={{ position: 'absolute', right: -3, top: 0, width: 6, height: '100%', pointerEvents: 'auto', cursor: 'move' }}
                            onPointerDown={e => handlePointerDown(e, idx, 'move')} />

                        {/* Resize handles (only for selected zone) - Re-enable pointer events */}
                        {isSelected && (
                            <>
                                {/* Corners */}
                                <div className="zone-resize-handle nw" style={{ borderColor: def?.color, pointerEvents: 'auto' }} onPointerDown={e => handlePointerDown(e, idx, 'resize-nw')} />
                                <div className="zone-resize-handle ne" style={{ borderColor: def?.color, pointerEvents: 'auto' }} onPointerDown={e => handlePointerDown(e, idx, 'resize-ne')} />
                                <div className="zone-resize-handle sw" style={{ borderColor: def?.color, pointerEvents: 'auto' }} onPointerDown={e => handlePointerDown(e, idx, 'resize-sw')} />
                                <div className="zone-resize-handle se" style={{ borderColor: def?.color, pointerEvents: 'auto' }} onPointerDown={e => handlePointerDown(e, idx, 'resize-se')} />
                                {/* Edges */}
                                <div className="zone-resize-handle n" style={{ borderColor: def?.color, pointerEvents: 'auto' }} onPointerDown={e => handlePointerDown(e, idx, 'resize-n')} />
                                <div className="zone-resize-handle s" style={{ borderColor: def?.color, pointerEvents: 'auto' }} onPointerDown={e => handlePointerDown(e, idx, 'resize-s')} />
                                <div className="zone-resize-handle e" style={{ borderColor: def?.color, pointerEvents: 'auto' }} onPointerDown={e => handlePointerDown(e, idx, 'resize-e')} />
                                <div className="zone-resize-handle w" style={{ borderColor: def?.color, pointerEvents: 'auto' }} onPointerDown={e => handlePointerDown(e, idx, 'resize-w')} />
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
