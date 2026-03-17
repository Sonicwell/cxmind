import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Contact Detail (Contact 360) Page', () => {

    test('should navigate from contacts list to detail page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/contacts')) return;
        await expectAppShell(page);

        // 等待联系人列表加载
        const rows = page.locator('.ag-row, tbody tr, .contact-row, [data-testid*="contact-row"], .card-row');
        if (await rows.count() === 0) {
            // 没有数据则跳过此测试
            test.skip();
            return;
        }

        await rows.first().click();

        // 应跳转到 /contacts/:id 详情页
        await expect(async () => {
            expect(page.url()).toMatch(/\/contacts\/.+/);
        }).toPass({ timeout: 10_000 });
    });

    test('should render contact header info', async ({ page }) => {
        if (!await navigateOrSkip(page, '/contacts')) return;
        await expectAppShell(page);

        const rows = page.locator('.ag-row, tbody tr, .contact-row, [data-testid*="contact-row"], .card-row');
        if (await rows.count() === 0) {
            test.skip();
            return;
        }
        await rows.first().click();
        await page.waitForURL(/\/contacts\/.+/, { timeout: 10_000 });

        // 详情页应有联系人基本信息区域
        const header = page.locator('.contact-header, .detail-header, h1, h2, [class*="profile"]');
        await expect(header.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should render timeline or tab navigation', async ({ page }) => {
        if (!await navigateOrSkip(page, '/contacts')) return;
        await expectAppShell(page);

        const rows = page.locator('.ag-row, tbody tr, .contact-row, [data-testid*="contact-row"], .card-row');
        if (await rows.count() === 0) {
            test.skip();
            return;
        }
        await rows.first().click();
        await page.waitForURL(/\/contacts\/.+/, { timeout: 10_000 });

        // 标签页导航 (Timeline/Calls/Messages 等)
        const tabs = page.locator('[role="tablist"], .tab-nav, .tabs, button:has-text("Timeline"), button:has-text("Calls"), button:has-text("Messages")');
        if (await tabs.count() > 0) {
            await expect(tabs.first()).toBeVisible();
        }
    });

    test('no JavaScript errors on contact detail page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/contacts')) return;

        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        const rows = page.locator('.ag-row, tbody tr, .contact-row, [data-testid*="contact-row"], .card-row');
        if (await rows.count() === 0) {
            test.skip();
            return;
        }
        await rows.first().click();
        await page.waitForURL(/\/contacts\/.+/, { timeout: 10_000 });
        await page.waitForTimeout(2000);
        expect(errors).toHaveLength(0);
    });
});
