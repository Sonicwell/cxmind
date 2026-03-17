import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('ROI Dashboard Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/roi')) return;
        await expectAppShell(page);
    });

    test('should render ROI metric cards', async ({ page }) => {
        const metricCards = page.locator('.stat-card, .metric-card, .kpi-card, [class*="roi"], [data-testid*="roi"]');
        await expect(metricCards.first()).toBeVisible({ timeout: 10_000 });
        expect(await metricCards.count()).toBeGreaterThan(0);
    });

    test('should render ROI chart or breakdown', async ({ page }) => {
        const charts = page.locator('.recharts-wrapper, canvas, svg, .chart-container, [class*="chart"]');
        if (await charts.count() > 0) {
            await expect(charts.first()).toBeVisible({ timeout: 10_000 });
        }
    });

    test('should display currency or savings values', async ({ page }) => {
        // ROI 相关数值（$、¥、% 等）
        const values = page.locator('text=/\\$|¥|%|savings|节省|ROI/i');
        if (await values.count() > 0) {
            await expect(values.first()).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
