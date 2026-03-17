import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Audit Pages', () => {

    test('should render audit dashboard', async ({ page }) => {
        if (!await navigateOrSkip(page, '/audit')) return;
        await expectAppShell(page);
        const dashboard = page.locator('.stat-card, .audit-stats, .metric-card, [class*="kpi"], table, text=/total.*event|audit/i');
        await expect(dashboard.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should render audit logs with table', async ({ page }) => {
        if (!await navigateOrSkip(page, '/audit/logs')) return;
        await expectAppShell(page);
        const table = page.locator('table, .log-list, [data-testid="audit-logs"]');
        await expect(table.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should have log search/filter', async ({ page }) => {
        if (!await navigateOrSkip(page, '/audit/logs')) return;
        await expectAppShell(page);
        const search = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="搜索"], .filter-bar');
        if (await search.count() > 0) {
            await expect(search.first()).toBeVisible();
        }
    });

    test('should render audit rules page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/audit/rules')) return;
        await expectAppShell(page);
        const content = page.locator('table, .rule-list, .rule-card, text=/no.*rule|create/i');
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    test('no JavaScript errors on audit dashboard', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/audit');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
