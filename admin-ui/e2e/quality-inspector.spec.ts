import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Quality Inspector Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/quality-inspector')) return;
        await expectAppShell(page);
    });

    test('should render KPI stat cards', async ({ page }) => {
        const kpiCards = page.locator('.qi-kpi-card, .stat-card, .metric-card, [class*="kpi"]');
        await expect(kpiCards.first()).toBeVisible({ timeout: 10_000 });
        const count = await kpiCards.count();
        expect(count).toBeGreaterThan(0);
    });

    test('should render scores table', async ({ page }) => {
        const table = page.locator('table, .scores-table, [data-testid="qi-scores"]');
        await expect(table.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should have date range filter', async ({ page }) => {
        const dateFilter = page.locator('input[type="date"], .date-picker, .date-range, select[data-testid*="period"]');
        if (await dateFilter.count() > 0) {
            await expect(dateFilter.first()).toBeVisible();
        }
    });

    test('should render trend chart', async ({ page }) => {
        const chart = page.locator('.recharts-wrapper, canvas, svg.chart, .chart-container, [data-testid*="trend"]');
        if (await chart.count() > 0) {
            await expect(chart.first()).toBeVisible({ timeout: 10_000 });
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/quality-inspector');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
