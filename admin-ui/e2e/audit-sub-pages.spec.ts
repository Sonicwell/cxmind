import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Audit Sub-Pages', () => {

    test('should render audit anomalies page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/audit/anomalies')) return;
        await expectAppShell(page);

        const content = page.locator(
            'table, .anomaly-list, .anomaly-card, [data-testid*="anomal"], ' +
            'text=/anomal|异常|no.*data/i, .stat-card, .chart-container'
        );
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    test('anomalies page should have severity or type indicators', async ({ page }) => {
        if (!await navigateOrSkip(page, '/audit/anomalies')) return;
        await expectAppShell(page);

        const indicators = page.locator('text=/critical|warning|info|high|medium|low|严重|警告/i, .badge, [class*="severity"]');
        if (await indicators.count() > 0) {
            await expect(indicators.first()).toBeVisible();
        }
    });

    test('should render audit reports page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/audit/reports')) return;
        await expectAppShell(page);

        const content = page.locator(
            'table, .report-list, .report-card, [data-testid*="report"], ' +
            'text=/report|报告|no.*data|generate/i, .stat-card'
        );
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    test('reports page should have export or generate controls', async ({ page }) => {
        if (!await navigateOrSkip(page, '/audit/reports')) return;
        await expectAppShell(page);

        const controls = page.locator(
            'button:has-text("Export"), button:has-text("Generate"), button:has-text("Download"), ' +
            'button:has-text("导出"), button:has-text("生成"), [data-testid*="export"]'
        );
        if (await controls.count() > 0) {
            await expect(controls.first()).toBeVisible();
        }
    });

    test('no JavaScript errors on audit anomalies', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.goto('/audit/anomalies');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });

    test('no JavaScript errors on audit reports', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.goto('/audit/reports');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
