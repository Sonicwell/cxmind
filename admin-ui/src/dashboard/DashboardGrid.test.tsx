import { describe, it, expect } from 'vitest';
import { validateViewsState } from './DashboardGrid';
import { getDefaultViewsState } from './widget-registry';

describe('DashboardGrid utils', () => {
    it('validateViewsState returns fallback if state is null', () => {
        const fallback = getDefaultViewsState();
        const result = validateViewsState(null, fallback);
        expect(result).toEqual(fallback);
    });

    it('validateViewsState repairs corrupt layout items (w <= 1)', () => {
        const fallback = getDefaultViewsState();
        const corrupted = {
            ...fallback,
            views: [
                {
                    ...fallback.views[0],
                    widgetIds: ['w_stat_active_calls'],
                    layouts: { lg: [{ i: 'w_stat_active_calls', x: 0, y: 0, w: 1, h: 2 }] }, // corrupted w
                }
            ]
        };

        const result = validateViewsState(corrupted, fallback);
        // Should have reset the layout item to fallback (w: 3 for lg)
        const repairedItem = result.views[0].layouts.lg.find((l: any) => l.i === 'w_stat_active_calls');
        const fallbackItem = fallback.views[0].layouts.lg.find((l: any) => l.i === 'w_stat_active_calls');
        expect(repairedItem?.w).toBe(fallbackItem?.w);
    });

    it('validateViewsState preserves valid custom items', () => {
        const fallback = getDefaultViewsState();
        const validCustom = {
            ...fallback,
            views: [
                {
                    ...fallback.views[0],
                    widgetIds: ['custom_widget'],
                    layouts: { lg: [{ i: 'custom_widget', x: 2, y: 2, w: 4, h: 4 }] },
                }
            ]
        };

        const result = validateViewsState(validCustom, fallback);
        const customItem = result.views[0].layouts.lg.find((l: any) => l.i === 'custom_widget');
        expect(customItem?.w).toBe(4);
    });

    it('validateViewsState detects height corruption (h < minH)', () => {
        const fallback = getDefaultViewsState();
        // sip-errors: minH=3, minW=4, defaultW=6, defaultH=4
        const heightCorrupted = {
            ...fallback,
            views: [
                {
                    ...fallback.views[0],
                    widgetIds: ['sip-errors'],
                    layouts: { lg: [{ i: 'sip-errors', x: 0, y: 0, w: 6, h: 1 }] },
                }
            ]
        };

        const result = validateViewsState(heightCorrupted, fallback);
        // h=1 < minH=3 → corrupted → regenerated with defaultH=4
        const item = result.views[0].layouts.lg.find((l: any) => l.i === 'sip-errors');
        expect(item?.h).toBeGreaterThanOrEqual(3);
    });
});
