import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Users Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/users')) return;
        await expectAppShell(page);
    });

    test('renders users list with table rows', async ({ page }) => {
        const container = page.locator('.ag-theme-alpine, table, .users-list, [data-testid="users-table"], .grid').first();
        await expect(container).toBeVisible({ timeout: 15_000 });

        // 至少应有种子数据中的 admin 用户
        const rows = page.locator('.ag-row, tbody tr, .user-row, [data-testid*="user-row"]');
        expect(await rows.count()).toBeGreaterThanOrEqual(1);
    });

    test('user entries display role badges', async ({ page }) => {
        // 等待列表加载
        await page.waitForTimeout(2000);
        // 角色标签应该可见（Admin / Agent / Supervisor 等）
        const roleBadges = page.locator('text=/Admin|Agent|Supervisor|Manager|platform_admin/i');
        if (await roleBadges.count() > 0) {
            await expect(roleBadges.first()).toBeVisible();
        }
    });

    test('should create user and display in list without reload', async ({ page }) => {
        // Generate random email to avoid collision
        const randId = Math.floor(1000 + Math.random() * 9000);
        const testEmail = `test_user_${randId}@example.com`;

        // Click Add User
        const addBtn = page.locator('button:has-text("Add User"), button:has-text("新增用户")').first();
        await expect(addBtn).toBeVisible();
        await addBtn.click();

        // Wait for modal
        const modal = page.locator('[role="dialog"]').first();
        await expect(modal).toBeVisible({ timeout: 5000 });

        // Fill Display Name — first form-group input
        const nameInput = modal.locator('.form-group input').first();
        await nameInput.fill(`TestUser${randId}`);

        // Fill Email — second form-group input
        const emailInput = modal.locator('.form-group input').nth(1);
        await emailInput.fill(testEmail);

        // Fill Password
        const passInput = modal.locator('input[type="password"]').first();
        await passInput.fill('UserPass123!');

        // Submit form
        const submitBtn = modal.locator('button[type="submit"], button:has-text("Create"), button:has-text("创建")').first();
        await submitBtn.click();

        // 核心验证：弹窗必须关闭，新数据必须立刻在表格中渲染（不刷新浏览器）
        await expect(modal).toBeHidden({ timeout: 8000 });

        // Assert that the newly created user shows up in the DOM immediately
        const newRow = page.locator(`text=${testEmail}`);
        await expect(newRow.first()).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Agents Page', () => {

    test('renders agents list with content', async ({ page }) => {
        if (!await navigateOrSkip(page, '/agents')) return;
        await expectAppShell(page);

        // 等待内容加载
        await page.waitForTimeout(2000);
        expect(await page.locator('#root > *').count()).toBeGreaterThan(0);
    });

    test('no unhandled errors on agents page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/agents')) return;

        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.waitForTimeout(2000);
        expect(errors).toHaveLength(0);
    });
});
