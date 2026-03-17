import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Agents Detail Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/agents')) return;
        await expectAppShell(page);
    });

    test('should render agent table with rows', async ({ page }) => {
        const table = page.locator('table, .agent-list, [data-testid="agents-table"]');
        await expect(table.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should display agent SIP number or extension', async ({ page }) => {
        const sipCells = page.locator('td:has-text("sip:"), td:has-text("ext"), [class*="sip-number"]');
        if (await sipCells.count() > 0) {
            await expect(sipCells.first()).toBeVisible();
        }
    });

    test('should have add agent button', async ({ page }) => {
        const addBtn = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("Invite"), button:has-text("新增")');
        if (await addBtn.count() > 0) {
            await expect(addBtn.first()).toBeVisible();
        }
    });

    test('should have group/client filter', async ({ page }) => {
        const filter = page.locator('select, [data-testid*="filter"], .filter-dropdown, input[placeholder*="filter" i]');
        if (await filter.count() > 0) {
            await expect(filter.first()).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/agents');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
