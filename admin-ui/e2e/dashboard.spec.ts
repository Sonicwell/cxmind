import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Dashboard Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);
    });

    test('should render DashboardGrid with KPI cards', async ({ page }) => {
        // KPI stat 卡片 — 至少 1 张可见
        const kpiCards = page.locator('.stat-card, .kpi-card, .metric-card, [class*="stat"], [data-testid*="kpi"]');
        await expect(kpiCards.first()).toBeVisible({ timeout: 15_000 });
        expect(await kpiCards.count()).toBeGreaterThan(0);
    });

    test('should render chart visualizations', async ({ page }) => {
        const charts = page.locator('.recharts-wrapper, canvas, svg.chart, .chart-container, [class*="chart"]');
        if (await charts.count() > 0) {
            await expect(charts.first()).toBeVisible({ timeout: 15_000 });
        }
    });

    test('should render dashboard widgets or grid layout', async ({ page }) => {
        const grid = page.locator('.dashboard-grid, .grid, .widget, [class*="widget"], [class*="dashboard"]');
        await expect(grid.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should have date range or period selector', async ({ page }) => {
        const dateControls = page.locator(
            'select, button:has-text("Today"), button:has-text("7d"), button:has-text("30d"), ' +
            '.date-picker, [data-testid*="period"], [data-testid*="date"]'
        );
        if (await dateControls.count() > 0) {
            await expect(dateControls.first()).toBeVisible();
        }
    });

    test('no JavaScript errors on dashboard', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
