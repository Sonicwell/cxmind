import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import '../styles/configurable-dashboard.css';

import { WIDGET_MAP, getDefaultViewsState, generateDefaultLayout, findBestPosition, autoArrangeLayout, createEmptyView, PRESET_VIEWS_DEF } from './widget-registry';
import WidgetWrapper from './WidgetWrapper';
import DashboardToolbar from './DashboardToolbar';
import { DashboardProvider } from './DashboardContext';
import { usePreference } from '../hooks/usePreference';
import { useModules } from '../context/ModuleContext';
import { useAuth } from '../context/AuthContext';
import type { WidgetProps, DashboardViewsState } from './types';

const ROW_HEIGHT = 60;
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768 };
const COLS: Record<string, number> = { lg: 12, md: 12, sm: 6 };

/**
 * Validate and repair a DashboardViewsState.
 * Detects corrupt layouts (items with w <= 1, missing items) and regenerates them.
 */
export function validateViewsState(state: any, fallback: DashboardViewsState): DashboardViewsState {
    // Basic structure validation
    if (!state || !Array.isArray(state.views) || state.views.length === 0) {
        return fallback;
    }

    const validViews = state.views.map((view: any) => {
        if (!view || !Array.isArray(view.widgetIds)) return null;

        // Check if layouts are valid: lg breakpoint should exist and have items
        const lgItems = view.layouts?.lg;
        let hasValidLayout = false;

        const isLayoutCorrupted = (items: any[]) => {
            if (!Array.isArray(items) || items.length === 0) return true;
            // 宽度或高度低于注册表 min 值 → 判定为损坏
            return items.some((item: any) => {
                if (item.w <= 2) return true;
                const def = WIDGET_MAP.get(item.i);
                if (def && (item.h < (def.minH || 1) || item.w < (def.minW || 1))) return true;
                return false;
            });
        };

        if (Array.isArray(lgItems) && !isLayoutCorrupted(lgItems)) {
            hasValidLayout = true;

            // Enforce minimum dimensions from registry to fix squished widgets
            const repairLayoutList = (items: any[]) => {
                if (!Array.isArray(items) || isLayoutCorrupted(items)) return [];
                return items.map((item: any) => {
                    const def = WIDGET_MAP.get(item.i);
                    if (def) {
                        return {
                            ...item,
                            w: Math.max(item.w || 1, def.minW || 1),
                            h: Math.max(item.h || 1, def.minH || 1),
                            minW: def.minW,
                            minH: def.minH
                        };
                    }
                    return item;
                });
            };

            // Apply repairs across all breakpoints;
            // CRITICAL FIX: To prevent squishing in sm/md screens due to empty arrays,
            // fallback to the repaired lg array if md/sm is missing or empty.
            if (view.layouts) {
                const safeLg = repairLayoutList(view.layouts.lg);
                view.layouts = {
                    lg: safeLg,
                    md: Array.isArray(view.layouts.md) && !isLayoutCorrupted(view.layouts.md)
                        ? repairLayoutList(view.layouts.md)
                        : JSON.parse(JSON.stringify(safeLg)),
                    sm: Array.isArray(view.layouts.sm) && !isLayoutCorrupted(view.layouts.sm)
                        ? repairLayoutList(view.layouts.sm)
                        : JSON.parse(JSON.stringify(safeLg)),
                };
            }
        }

        if (!hasValidLayout && view.widgetIds.length > 0) {
            // Regenerate layouts from widget defaults completely if current memory is corrupt
            return {
                ...view,
                layouts: generateDefaultLayout(view.widgetIds),
            };
        }
        return view;
    }).filter(Boolean);

    return {
        activeViewId: state.activeViewId || fallback.activeViewId,
        views: validViews.length > 0 ? validViews : fallback.views,
    };
}


const DashboardGrid: React.FC = () => {
    const defaultState = useMemo(() => getDefaultViewsState(), []);

    const { data: savedState, save: persistState } = usePreference<DashboardViewsState>('dashboard_views', defaultState);

    const { containerRef, width } = useContainerWidth();

    const [viewsState, setViewsState] = useState<DashboardViewsState>(() => validateViewsState(savedState, defaultState));
    const [editMode, setEditMode] = useState(false);

    const { isModuleEnabled } = useModules();
    const { permissions } = useAuth();

    // Sync from server when preference loads (server data takes priority, but validate)
    const prevSavedRef = useRef(savedState);
    useEffect(() => {
        if (prevSavedRef.current !== savedState) {
            prevSavedRef.current = savedState;
            setViewsState(validateViewsState(savedState, defaultState));
        }
    }, [savedState, defaultState]);

    // ─── Derived state ───

    const activeView = useMemo(() => {
        return viewsState.views.find(v => v.id === viewsState.activeViewId)
            || viewsState.views[0];
    }, [viewsState]);

    // Derived: actively visible widgets (filtered by module enablement and RBAC permissions)
    const activeWidgetIds = useMemo(() => {
        return activeView.widgetIds.filter(id => {
            const def = WIDGET_MAP.get(id);
            if (!def) return false;
            // 1. Module guard: if module disabled, hide widget
            if (def.module && !isModuleEnabled(def.module)) return false;
            // 2. RBAC Guard: if widget requires a permission the user doesn't have, hide it
            if (def.requiredPermission && !permissions.includes('*') && !permissions.includes(def.requiredPermission)) {
                return false;
            }
            return true;
        });
    }, [activeView.widgetIds, isModuleEnabled, permissions]);

    // Derived: layout items for only the visible widgets
    const activeLayouts = useMemo(() => {
        const next: any = {};
        for (const [bp, items] of Object.entries(activeView.layouts)) {
            next[bp] = (items as any[]).filter(item => activeWidgetIds.includes(item.i));
        }
        return next;
    }, [activeView.layouts, activeWidgetIds]);

    // ─── Persistence Guard ───
    const canPersist = useRef(false);
    useEffect(() => {
        const id = setTimeout(() => { canPersist.current = true; }, 800);
        return () => clearTimeout(id);
    }, []);

    // Latest refs
    const viewsStateRef = useRef(viewsState);
    viewsStateRef.current = viewsState;

    // ─── Helper: update views state and optionally persist ───
    const updateAndPersist = useCallback((updater: (prev: DashboardViewsState) => DashboardViewsState) => {
        setViewsState(prev => {
            const next = updater(prev);
            persistState(next);
            return next;
        });
    }, [persistState]);

    // ─── Grid Callbacks ───

    const handleLayoutChange = useCallback((_layout: any, allLayouts: any) => {
        // Guard: onLayoutChange fires on mount with computed layouts
        // that may not have correct w/h — skip until post-mount
        if (!canPersist.current) return;

        // 强制 minW/minH，防止 compactor 覆盖修复后的值
        const enforced: any = {};
        for (const [bp, items] of Object.entries(allLayouts)) {
            enforced[bp] = (items as any[]).map((item: any) => {
                const def = WIDGET_MAP.get(item.i);
                if (!def) return item;
                return {
                    ...item,
                    w: Math.max(item.w, def.minW || 1),
                    h: Math.max(item.h, def.minH || 1),
                    minW: def.minW,
                    minH: def.minH,
                };
            });
        }

        setViewsState(prev => {
            const next: DashboardViewsState = {
                ...prev,
                views: prev.views.map(v =>
                    v.id === prev.activeViewId ? { ...v, layouts: enforced } : v
                ),
            };
            persistState(next);
            return next;
        });
    }, [persistState]);

    // ─── Widget Management ───

    const handleRemove = useCallback((id: string) => {
        updateAndPersist(prev => ({
            ...prev,
            views: prev.views.map(v => {
                if (v.id !== prev.activeViewId) return v;
                const nextIds = v.widgetIds.filter(wid => wid !== id);
                const nextLayouts: any = {};
                for (const [bp, items] of Object.entries(v.layouts)) {
                    nextLayouts[bp] = (items as any[]).filter((item: any) => item.i !== id);
                }
                return { ...v, widgetIds: nextIds, layouts: nextLayouts };
            }),
        }));
    }, [updateAndPersist]);

    const handleAddWidget = useCallback((id: string) => {
        const def = WIDGET_MAP.get(id);
        if (!def) return;
        updateAndPersist(prev => ({
            ...prev,
            views: prev.views.map(v => {
                if (v.id !== prev.activeViewId) return v;
                const nextIds = [...v.widgetIds, id];
                const nextLayouts: any = {};
                for (const [bp, items] of Object.entries(v.layouts)) {
                    const bpCols = COLS[bp] ?? 12;
                    const w = Math.min(def.defaultW, bpCols);
                    const pos = findBestPosition(items as any[], w, def.defaultH, bpCols);
                    const newItem = { i: id, x: pos.x, y: pos.y, w, h: def.defaultH, minW: def.minW, minH: def.minH };
                    nextLayouts[bp] = [...(items as any[]), newItem];
                }
                return { ...v, widgetIds: nextIds, layouts: nextLayouts };
            }),
        }));
    }, [updateAndPersist]);

    const handleAutoArrange = useCallback(() => {
        updateAndPersist(prev => ({
            ...prev,
            views: prev.views.map(v => {
                if (v.id !== prev.activeViewId) return v;
                const arranged = autoArrangeLayout(v.widgetIds, v.layouts, COLS);
                return { ...v, layouts: arranged };
            }),
        }));
    }, [updateAndPersist]);

    const handleReset = useCallback(() => {
        updateAndPersist(prev => ({
            ...prev,
            views: prev.views.map(v => {
                if (v.id !== prev.activeViewId) return v;
                if (v.builtIn) {
                    // Restore preset to its default widget set + layout
                    const presetDef = PRESET_VIEWS_DEF.find(p => p.id === v.id);
                    if (presetDef) {
                        const defaultIds = [...presetDef.widgetIds];
                        return { ...v, widgetIds: defaultIds, layouts: generateDefaultLayout(defaultIds) };
                    }
                }
                // Custom view: clear all widgets
                return { ...v, widgetIds: [], layouts: { lg: [], md: [], sm: [] } };
            }),
        }));
    }, [updateAndPersist]);

    // ─── View Management ───

    const handleSwitchView = useCallback((viewId: string) => {
        updateAndPersist(prev => ({ ...prev, activeViewId: viewId }));
    }, [updateAndPersist]);

    const handleCreateView = useCallback((name: string) => {
        const newView = createEmptyView(name);
        updateAndPersist(prev => ({
            ...prev,
            activeViewId: newView.id,
            views: [...prev.views, newView],
        }));
    }, [updateAndPersist]);

    const handleDeleteView = useCallback((viewId: string) => {
        updateAndPersist(prev => {
            const filtered = prev.views.filter(v => v.id !== viewId || v.builtIn);
            const newActiveId = prev.activeViewId === viewId
                ? (filtered[0]?.id || 'overview')
                : prev.activeViewId;
            return { activeViewId: newActiveId, views: filtered };
        });
    }, [updateAndPersist]);

    const handleRenameView = useCallback((viewId: string, name: string) => {
        updateAndPersist(prev => ({
            ...prev,
            views: prev.views.map(v =>
                v.id === viewId && !v.builtIn ? { ...v, name } : v
            ),
        }));
    }, [updateAndPersist]);

    const handleSendToView = useCallback((widgetId: string, targetViewId: string) => {
        const def = WIDGET_MAP.get(widgetId);
        if (!def) return;
        updateAndPersist(prev => ({
            ...prev,
            views: prev.views.map(v => {
                if (v.id !== targetViewId) return v;
                if (v.widgetIds.includes(widgetId)) return v; // already there
                const nextIds = [...v.widgetIds, widgetId];
                const nextLayouts: any = {};
                for (const [bp, items] of Object.entries(v.layouts)) {
                    const bpCols = COLS[bp] ?? 12;
                    const w = Math.min(def.defaultW, bpCols);
                    const pos = findBestPosition(items as any[], w, def.defaultH, bpCols);
                    const newItem = { i: widgetId, x: pos.x, y: pos.y, w, h: def.defaultH, minW: def.minW, minH: def.minH };
                    nextLayouts[bp] = [...(items as any[]), newItem];
                }
                return { ...v, widgetIds: nextIds, layouts: nextLayouts };
            }),
        }));
    }, [updateAndPersist]);

    return (
        <DashboardProvider activeWidgetIds={activeWidgetIds}>
            <div className="configurable-dashboard" ref={containerRef}>
                <DashboardToolbar
                    editMode={editMode}
                    onToggleEdit={() => setEditMode(prev => !prev)}
                    onReset={handleReset}
                    onAutoArrange={handleAutoArrange}
                    activeWidgetIds={activeView.widgetIds}
                    onAddWidget={handleAddWidget}
                    views={viewsState.views}
                    activeViewId={viewsState.activeViewId}
                    onSwitchView={handleSwitchView}
                    onCreateView={handleCreateView}
                    onDeleteView={handleDeleteView}
                    onRenameView={handleRenameView}
                />

                {width > 0 && (
                    <ResponsiveGridLayout
                        className={`dashboard-grid ${editMode ? 'editing' : ''}`}
                        width={width}
                        layouts={activeLayouts}
                        breakpoints={BREAKPOINTS}
                        cols={COLS}
                        rowHeight={ROW_HEIGHT}
                        onLayoutChange={handleLayoutChange}
                        dragConfig={{
                            enabled: editMode,
                        }}
                        resizeConfig={{
                            enabled: editMode,
                        }}
                        compactor={verticalCompactor}
                        margin={[12, 12] as [number, number]}
                        containerPadding={[0, 0] as [number, number]}
                    >
                        {activeWidgetIds.map(id => {
                            const def = WIDGET_MAP.get(id);
                            if (!def) return null;
                            const Component = def.component as React.ComponentType<WidgetProps>;
                            return (
                                <div key={id}>
                                    <WidgetWrapper
                                        def={def}
                                        editMode={editMode}
                                        onRemove={handleRemove}
                                        views={viewsState.views}
                                        currentViewId={viewsState.activeViewId}
                                        onSendToView={handleSendToView}
                                    >
                                        <Component editMode={editMode} />
                                    </WidgetWrapper>
                                </div>
                            );
                        })}
                    </ResponsiveGridLayout>
                )}
            </div>
        </DashboardProvider>
    );
};

export default React.memo(DashboardGrid);
