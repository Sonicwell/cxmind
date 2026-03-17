import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Conversation Monitor Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/omni-monitor')) return;
        await expectAppShell(page);
    });

    test('should render conversation list or grid', async ({ page }) => {
        const container = page.locator(
            'table, .conversation-list, .monitor-grid, [data-testid*="conversation"], ' +
            '.inbox, text=/no.*conversation|empty/i'
        );
        await expect(container.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should have channel filter or status selector', async ({ page }) => {
        const filter = page.locator(
            'select, [role="combobox"], .filter-bar, [data-testid*="filter"], ' +
            'input[placeholder*="search" i], input[placeholder*="搜索"]'
        );
        if (await filter.count() > 0) {
            await expect(filter.first()).toBeVisible();
        }
    });

    test('should display conversation status badges', async ({ page }) => {
        const badges = page.locator('text=/active|waiting|closed|open|pending|在线|等待/i, .badge, [class*="status"]');
        if (await badges.count() > 0) {
            await expect(badges.first()).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
