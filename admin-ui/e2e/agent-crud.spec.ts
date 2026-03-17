import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Agent CRUD Operations', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/agents')) return;
        await expectAppShell(page);

        // Ensure table is visible and loaded
        const table = page.locator('table, .agent-list, [data-testid="agents-table"]');
        await expect(table.first()).toBeVisible({ timeout: 15_000 });
    });

    test('should create agent and display in list without page reload', async ({ page }) => {
        // Generate a random extension number to avoid collision
        const randExt = `8${Math.floor(100 + Math.random() * 900)}`;

        // Click "Add Agent" / "添加坐席"
        const addBtn = page.locator('button:has-text("Add Agent"), button:has-text("添加坐席")').first();
        await expect(addBtn).toBeVisible();
        await addBtn.click();

        // Wait for modal to appear
        const modal = page.locator('[role="dialog"]').first();
        await expect(modal).toBeVisible({ timeout: 5000 });

        // Fill SIP Number — the first input inside the modal's first form-group
        const sipNumberInput = modal.locator('.form-group input').first();
        await sipNumberInput.fill(randExt);

        // Fill SIP Password — the second input (type=password) in the modal
        const sipPasswordInput = modal.locator('input[type="password"]').first();
        await sipPasswordInput.fill('password123');

        // Click "Create Agent" / "创建"
        const submitBtn = modal.locator('button[type="submit"], button:has-text("Create Agent"), button:has-text("创建")').first();
        await submitBtn.click();

        // 核心验证：弹窗必须关闭，新数据必须立刻在表格中渲染（不刷新浏览器）
        await expect(modal).toBeHidden({ timeout: 8000 });

        // Assert that the newly created sipNumber shows up in the table
        const newRow = page.locator(`td:has-text("${randExt}")`);
        await expect(newRow.first()).toBeVisible({ timeout: 10000 });
    });
});
