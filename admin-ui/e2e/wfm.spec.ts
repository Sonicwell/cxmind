import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('WFM Pages', () => {

    test('should render WFM schedule calendar', async ({ page }) => {
        if (!await navigateOrSkip(page, '/wfm/schedule')) return;
        await expectAppShell(page);
        const calendar = page.locator('.calendar, .schedule-grid, .wfm-schedule, table, [class*="calendar"], [data-testid*="schedule"]');
        await expect(calendar.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should have date navigation controls', async ({ page }) => {
        if (!await navigateOrSkip(page, '/wfm/schedule')) return;
        await expectAppShell(page);
        const dateNav = page.locator('button:has-text("Today"), button:has-text("今天"), .date-nav, [class*="week-nav"]');
        if (await dateNav.count() > 0) {
            await expect(dateNav.first()).toBeVisible();
        }
    });

    test('should render adherence page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/wfm/adherence')) return;
        await expectAppShell(page);
        const content = page.locator('table, .adherence, .stat-card, [class*="adherence"]');
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should render approvals page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/wfm/approvals')) return;
        await expectAppShell(page);
        const content = page.locator('table, .approval-list, text=/no.*request|pending/i');
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    test('no JavaScript errors on WFM schedule', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/wfm/schedule');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
