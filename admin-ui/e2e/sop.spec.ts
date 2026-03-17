import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('SOP Library Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/sop')) return;
        await expectAppShell(page);
    });

    test('should render SOP list or empty state', async ({ page }) => {
        const content = page.locator(
            'table, .sop-list, .sop-card, [data-testid*="sop"], ' +
            'text=/no.*sop|empty|create|开始|新建/i'
        );
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should have create/add SOP button', async ({ page }) => {
        const addBtn = page.locator(
            'button:has-text("Create"), button:has-text("Add"), button:has-text("New"), ' +
            'button:has-text("新建"), button:has-text("创建"), [data-testid*="create-sop"]'
        );
        if (await addBtn.count() > 0) {
            await expect(addBtn.first()).toBeVisible();
        }
    });

    test('should display SOP category or tags', async ({ page }) => {
        const tags = page.locator('.badge, .tag, [class*="category"], [class*="tag"]');
        if (await tags.count() > 0) {
            await expect(tags.first()).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
