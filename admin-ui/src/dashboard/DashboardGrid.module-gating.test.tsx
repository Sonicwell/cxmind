/**
 * DashboardGrid 模块门控测试
 * 验证 Widget 按模块启用状态过滤的逻辑（DashboardGrid L133-145）
 *
 * 策略: 直接测试 WIDGET_MAP + filter 逻辑，避免渲染 DashboardGrid 的重依赖
 */
import { describe, it, expect } from 'vitest';
import { WIDGET_MAP } from './widget-registry';

// 复刻 DashboardGrid 中的 activeWidgetIds 过滤逻辑
function filterWidgetsByModule(
    widgetIds: string[],
    isModuleEnabled: (slug: string) => boolean,
    permissions: string[] = ['*']
) {
    return widgetIds.filter(id => {
        const def = WIDGET_MAP.get(id);
        if (!def) return false;
        if (def.module && !isModuleEnabled(def.module)) return false;
        if (def.requiredPermission && !permissions.includes('*') && !permissions.includes(def.requiredPermission)) return false;
        return true;
    });
}

describe('DashboardGrid — widget module filtering', () => {

    const ALL_WIDGET_IDS = Array.from(WIDGET_MAP.keys());

    // ── 全部模块开启 ────────────────────────────────

    it('shows all widgets when all modules enabled', () => {
        const result = filterWidgetsByModule(ALL_WIDGET_IDS, () => true);
        expect(result.length).toBe(ALL_WIDGET_IDS.length);
    });

    // ── wfm 关闭 → dashboard-module widgets (including operations) 保留 ──

    it('keeps dashboard-module widgets (including operations) when wfm is off', () => {
        const result = filterWidgetsByModule(
            ALL_WIDGET_IDS,
            (slug) => slug !== 'wfm'
        );
        // operations belongs to 'dashboard' module, not 'wfm' — must survive
        expect(result).toContain('operations');
    });

    it('keeps other widgets when wfm module is off', () => {
        const result = filterWidgetsByModule(
            ALL_WIDGET_IDS,
            (slug) => slug !== 'wfm'
        );
        // core widgets (calls/monitoring) still present
        expect(result).toContain('active-calls');
        expect(result).toContain('total-calls');
        expect(result).toContain('sip-errors');
    });

    // ── qi 关闭 → total-analyzed / ai-accuracy 隐藏 ──

    it('hides qi-dependent widgets when qi module is off', () => {
        const result = filterWidgetsByModule(
            ALL_WIDGET_IDS,
            (slug) => slug !== 'qi'
        );
        expect(result).not.toContain('total-analyzed');
        expect(result).not.toContain('ai-accuracy');
    });

    // ── analytics 关闭 → 所有 analytics widget 隐藏 ──

    it('hides all analytics widgets when analytics module is off', () => {
        const analyticsWidgets = Array.from(WIDGET_MAP.entries())
            .filter(([, def]) => def.module === 'analytics')
            .map(([id]) => id);

        const result = filterWidgetsByModule(
            ALL_WIDGET_IDS,
            (slug) => slug !== 'analytics'
        );

        for (const wid of analyticsWidgets) {
            expect(result).not.toContain(wid);
        }
    });

    it('keeps core widgets when analytics is off', () => {
        const result = filterWidgetsByModule(
            ALL_WIDGET_IDS,
            (slug) => slug !== 'analytics'
        );
        expect(result).toContain('active-calls');
        expect(result).toContain('avg-mos');
    });

    // ── Wave 1 only 场景 ────────────────────────────

    it('Wave 1 config filters out wfm + qi widgets, keeps core + analytics', () => {
        const wave1Enabled = ['dashboard', 'monitoring', 'calls', 'call_events', 'users', 'agents', 'agent_map', 'settings', 'contacts', 'analytics', 'sop', 'demo'];

        const result = filterWidgetsByModule(
            ALL_WIDGET_IDS,
            (slug) => wave1Enabled.includes(slug)
        );

        // operations is dashboard-module, stays visible even without wfm
        expect(result).toContain('operations');
        // qi → hidden
        expect(result).not.toContain('total-analyzed');
        expect(result).not.toContain('ai-accuracy');
        // core → visible
        expect(result).toContain('active-calls');
        expect(result).toContain('total-calls');
        // analytics → visible
        expect(result).toContain('conversion-rate');
        expect(result).toContain('outcome-distribution');
    });

    // ── RBAC guard ──────────────────────────────────

    it('hides widgets requiring quality:read when user lacks permission', () => {
        const result = filterWidgetsByModule(
            ALL_WIDGET_IDS,
            () => true,
            ['reports:read'] // no quality:read
        );
        // sip-errors requires quality:read
        expect(result).not.toContain('sip-errors');
        // stat widgets without requiredPermission still visible
        expect(result).toContain('active-calls');
    });

    it('shows all widgets for admin with wildcard permission', () => {
        const result = filterWidgetsByModule(
            ALL_WIDGET_IDS,
            () => true,
            ['*']
        );
        expect(result.length).toBe(ALL_WIDGET_IDS.length);
    });

    // ── 全部关闭 ────────────────────────────────────

    it('hides all module-gated widgets when all optional modules off', () => {
        const result = filterWidgetsByModule(
            ALL_WIDGET_IDS,
            () => false
        );
        // 所有 widget 都有 module 字段，全关闭后应全部隐藏
        expect(result.length).toBe(0);
    });
});
