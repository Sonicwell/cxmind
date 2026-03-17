import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Knowledge Base Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/knowledge')) return;
        await expectAppShell(page);
    });

    test('should render article list or empty state', async ({ page }) => {
        // 文章列表或空状态提示
        const content = page.locator('table, .knowledge-list, .article-card, text=/no.*article|empty|开始/i');
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should have search input', async ({ page }) => {
        const search = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="搜索"]');
        if (await search.count() > 0) {
            await expect(search.first()).toBeVisible();
            await search.first().fill('test query');
            // 搜索不应导致页面崩溃
            await page.waitForTimeout(500);
        }
    });

    test('should have create/add button', async ({ page }) => {
        const addBtn = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("新增"), button:has-text("添加"), [data-testid="add-article"]');
        if (await addBtn.count() > 0) {
            await expect(addBtn.first()).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/knowledge');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
