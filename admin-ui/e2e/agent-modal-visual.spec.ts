import { test, expect, Page } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

/**
 * 视觉回归测试: 验证 GlassModal 中的按钮行不会因 flex-shrink:0 溢出被裁切
 * Discovery Intent: 捕捉 .btn { flex-shrink: 0 } + .w-full 导致的按钮溢出 bug
 * 覆盖页面: /agents, /users, /wfm/schedule
 */

// 通用断言: modal 内的按钮不溢出
async function assertModalButtonsContained(page: Page) {
    const modal = page.locator('.glass-modal-card');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const modalBox = await modal.boundingBox();
    expect(modalBox).toBeTruthy();

    // 只检查 modal-body 区域的按钮，排除 header 中的 close(X) 图标按钮
    const buttons = modal.locator('.glass-modal-body button');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        const box = await btn.boundingBox();
        if (!box || !modalBox) continue;

        const modalRight = modalBox.x + modalBox.width;
        const btnRight = box.x + box.width;

        // 按钮右边缘不得超出 modal（容差 2px）
        expect(btnRight, `Button ${i} right edge overflows modal`).toBeLessThanOrEqual(modalRight + 2);

        // 跳过 icon 按钮（密码显隐切换等）— 尺寸很小的就是 icon
        const isSmallIconBtn = box.width < 40 && box.height < 40;
        if (isSmallIconBtn) continue;

        // 非 icon 按钮不应被压缩到不可读（至少 60px 宽）
        expect(box.width, `Button ${i} width too narrow`).toBeGreaterThan(60);
    }
}

// ── Agents 页面 ──
test.describe('Modal Button Clipping — Agents', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/agents')) return;
        await expectAppShell(page);
    });

    test('edit agent modal buttons within bounds', async ({ page }) => {
        const table = page.locator('table').first();
        await expect(table).toBeVisible({ timeout: 10_000 });

        // ACTIONS 列 MoreVertical 编辑按钮
        const firstRow = page.locator('table tbody tr').first();
        const editBtn = firstRow.locator('td:last-child button').first();
        await expect(editBtn).toBeVisible({ timeout: 5_000 });
        await editBtn.click();

        await assertModalButtonsContained(page);
    });

    test('add agent modal buttons within bounds', async ({ page }) => {
        // 点击 "Add Agent" / "新增坐席" 按钮
        const addBtn = page.locator('button:has-text("Add Agent"), button:has-text("新增坐席")');
        await expect(addBtn.first()).toBeVisible({ timeout: 5_000 });
        await addBtn.first().click();

        await assertModalButtonsContained(page);
    });
});

// ── Users 页面 ──
test.describe('Modal Button Clipping — Users', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/users')) return;
        await expectAppShell(page);
    });

    test('create user modal buttons within bounds', async ({ page }) => {
        // 等待页面表格加载
        const table = page.locator('table').first();
        await expect(table).toBeVisible({ timeout: 10_000 });

        // 点击 "添加用户" / "Add User" 按钮
        const createBtn = page.locator('button:has-text("添加用户"), button:has-text("Add User")');
        await expect(createBtn.first()).toBeVisible({ timeout: 5_000 });
        await createBtn.first().click();

        await assertModalButtonsContained(page);
    });

    test('edit user modal buttons within bounds', async ({ page }) => {
        const table = page.locator('table').first();
        await expect(table).toBeVisible({ timeout: 10_000 });

        // Users 表的编辑按钮在 actions 列
        const firstRow = page.locator('table tbody tr').first();
        const editBtn = firstRow.locator('td:last-child button').first();
        if (!await editBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
            test.skip(true, 'Edit button not found in users table');
            return;
        }
        await editBtn.click();

        await assertModalButtonsContained(page);
    });
});

// ── WFM Schedule 页面 ──
test.describe('Modal Button Clipping — WFM Schedule', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/wfm/schedule')) return;
        await expectAppShell(page);
    });

    test('schedule edit modal buttons within bounds', async ({ page }) => {
        // WFM 排班页面的编辑弹窗触发方式：点击排班格子
        // 寻找可点击的排班单元格
        const cell = page.locator('.schedule-cell, td[class*="shift"], [data-testid*="schedule-cell"], .wfm-cell');
        if (!await cell.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
            test.skip(true, 'No schedule cells found');
            return;
        }
        await cell.first().click();

        // 如果弹窗出现，检查按钮
        const modal = page.locator('.glass-modal-card');
        if (await modal.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await assertModalButtonsContained(page);
        } else {
            // 排班页可能用其他方式打开编辑，跳过
            test.skip(true, 'Schedule cell click did not open a modal');
        }
    });
});
