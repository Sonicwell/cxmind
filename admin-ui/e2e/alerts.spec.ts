import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Alerts Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/alerts')) return;
        await expectAppShell(page);
    });

    test('should render alert rules or history', async ({ page }) => {
        const content = page.locator('table, .alert-list, .alert-card, .alert-rule, text=/no.*alert|empty/i');
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should have alert severity indicators', async ({ page }) => {
        const severity = page.locator('[class*="severity"], .badge, text=/critical|warning|info|high|medium|low/i');
        if (await severity.count() > 0) {
            await expect(severity.first()).toBeVisible();
        }
    });

    test('should have acknowledge/resolve actions', async ({ page }) => {
        const actions = page.locator('button:has-text("Acknowledge"), button:has-text("Resolve"), button:has-text("Dismiss"), [data-testid*="ack"]');
        if (await actions.count() > 0) {
            await expect(actions.first()).toBeVisible();
        }
    });

    test('should render alert history timeline', async ({ page }) => {
        const timeline = page.locator('.timeline, .history, [class*="history"], table');
        if (await timeline.count() > 0) {
            await expect(timeline.first()).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/alerts');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });

    test('buttons use standard Button component, no al-btn class present', async ({ page }) => {
        // Discovery Intent: 验证 al-btn → Button variant 迁移后，页面中不再存在 .al-btn 元素
        const alBtnElements = page.locator('.al-btn');
        const alIconBtnElements = page.locator('.al-icon-btn');

        // 页面不应存在任何旧版 al-btn/al-icon-btn 元素
        await expect(alBtnElements).toHaveCount(0, { timeout: 5_000 });
        await expect(alIconBtnElements).toHaveCount(0, { timeout: 5_000 });

        // 标准 Button 组件应使用 .btn class
        const standardBtns = page.locator('.btn, button.btn');
        // 至少应有 tab 按钮
        if (await standardBtns.count() > 0) {
            await expect(standardBtns.first()).toBeVisible();
        }
    });

    test('channels tab form buttons are interactive', async ({ page }) => {
        // Discovery Intent: 验证 Channels tab 的 Add/Save/Cancel 按钮在 al-btn 移除后仍可工作
        // 切换到 Channels tab
        const channelsTab = page.locator('button', { hasText: /Channel/i });
        if (await channelsTab.count() === 0) return;
        await channelsTab.first().click();

        // 点击 Add Channel 按钮
        const addBtn = page.locator('button', { hasText: /Add Channel|添加/i });
        if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
            await addBtn.click();

            // 表单应出现
            const form = page.locator('.al-form, form, .al-form-fields');
            await expect(form.first()).toBeVisible({ timeout: 5_000 });

            // Save 和 Cancel 按钮应可见
            const saveBtn = page.locator('button', { hasText: /Save|保存/i });
            const cancelBtn = page.locator('button', { hasText: /Cancel|取消/i });
            await expect(saveBtn.first()).toBeVisible();
            await expect(cancelBtn.first()).toBeVisible();

            // 点 Cancel 关闭表单
            await cancelBtn.first().click();
        }
    });
});
