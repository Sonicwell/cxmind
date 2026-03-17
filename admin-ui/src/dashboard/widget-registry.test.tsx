import { describe, it, expect } from 'vitest';
import { WIDGET_REGISTRY, WIDGET_MAP, createEmptyView, getDefaultViewsState, DEFAULT_WIDGET_IDS } from './widget-registry';

describe('widget-registry', () => {
    it('WIDGET_REGISTRY is a non-empty array', () => {
        expect(Array.isArray(WIDGET_REGISTRY)).toBe(true);
        expect(WIDGET_REGISTRY.length).toBeGreaterThan(10);
    });

    it('each widget has required fields', () => {
        for (const w of WIDGET_REGISTRY) {
            expect(w.id).toBeTruthy();
            expect(w.name).toBeTruthy();
            expect(w.component).toBeTruthy();
            expect(w.category).toBeTruthy();
            expect(typeof w.defaultW).toBe('number');
            expect(typeof w.defaultH).toBe('number');
        }
    });

    it('WIDGET_MAP contains all registry entries', () => {
        expect(WIDGET_MAP.size).toBe(WIDGET_REGISTRY.length);
        for (const w of WIDGET_REGISTRY) {
            expect(WIDGET_MAP.get(w.id)).toBe(w);
        }
    });

    it('widget IDs are unique', () => {
        const ids = WIDGET_REGISTRY.map(w => w.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    it('createEmptyView returns a view with given name', () => {
        const view = createEmptyView('Test View');
        expect(view.name).toBe('Test View');
        expect(view.id).toBeTruthy();
        expect(view.widgetIds).toEqual([]);
    });

    it('getDefaultViewsState has correct structure', () => {
        const state = getDefaultViewsState();
        expect(state.activeViewId).toBeTruthy();
        expect(Array.isArray(state.views)).toBe(true);
        expect(state.views.length).toBeGreaterThan(0);
    });

    it('DEFAULT_WIDGET_IDS is a non-empty array', () => {
        expect(Array.isArray(DEFAULT_WIDGET_IDS)).toBe(true);
        expect(DEFAULT_WIDGET_IDS.length).toBeGreaterThan(0);
    });
});
