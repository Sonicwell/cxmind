import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

/**
 * E2E TDD: 验证 dirty-tracking modal 行为
 * Discovery Intent: 捕捉 "表单有修改时关闭 modal 丢数据" 和 "ESC 无法关闭 clean modal" 的 bug
 *
 * 测试矩阵 (每个 modal 都需验证):
 *   clean form + ESC     → modal 直接关闭
 *   dirty form + ESC     → 弹出二次确认
 *   dirty form + confirm → 全部关闭
 *   dirty form + cancel  → 留在原表单
 *   dirty form + X btn   → 弹出二次确认
 *   clean form + X btn   → 直接关闭
 */

const MODAL_SELECTOR = '.glass-modal-card';

// ── Users 页面 ──
test.describe('Dirty Modal — Users Create', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/users')) return;
        await expectAppShell(page);
        await page.waitForSelector('table', { timeout: 15_000 });
    });

    async function openCreateUserModal(page: import('@playwright/test').Page) {
        const addBtn = page.locator('button:has-text("Add User"), button:has-text("添加用户")');
        await expect(addBtn.first()).toBeVisible({ timeout: 5_000 });
        await addBtn.first().click();
        await expect(page.locator(MODAL_SELECTOR)).toBeVisible({ timeout: 5_000 });
    }

    test('clean form — ESC closes modal directly', async ({ page }) => {
        await openCreateUserModal(page);
        await page.keyboard.press('Escape');
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });

    test('clean form — X button closes modal directly', async ({ page }) => {
        await openCreateUserModal(page);
        const closeBtn = page.locator(MODAL_SELECTOR).locator('.glass-modal-close').first();
        await closeBtn.click();
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });

    test('dirty form — ESC triggers discard confirm', async ({ page }) => {
        await openCreateUserModal(page);
        const emailInput = page.locator(MODAL_SELECTOR).locator('input[type="email"]').first();
        await emailInput.fill('test@example.com');
        await page.keyboard.press('Escape');
        // 原 modal 和确认弹窗均可见
        await expect(page.locator(MODAL_SELECTOR).first()).toBeVisible();
        await expect(page.getByText(/discard|unsaved|丢弃/i).first()).toBeVisible({ timeout: 3_000 });
    });

    test('dirty form — confirm discard closes everything', async ({ page }) => {
        await openCreateUserModal(page);
        const emailInput = page.locator(MODAL_SELECTOR).locator('input[type="email"]').first();
        await emailInput.fill('test@example.com');
        await page.keyboard.press('Escape');
        const discardBtn = page.locator('button:has-text("Discard"), button:has-text("放弃"), button:has-text("确认")');
        await discardBtn.first().click();
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });

    test('dirty form — cancel keeps form open with data', async ({ page }) => {
        await openCreateUserModal(page);
        const emailInput = page.locator(MODAL_SELECTOR).locator('input[type="email"]').first();
        await emailInput.fill('test@example.com');
        await page.keyboard.press('Escape');
        const cancelBtn = page.locator('button:has-text("Cancel"), button:has-text("取消")');
        await cancelBtn.first().click();
        await expect(page.locator(MODAL_SELECTOR).first()).toBeVisible();
        const val = await page.locator(MODAL_SELECTOR).locator('input[type="email"]').first().inputValue();
        expect(val).toBe('test@example.com');
    });
});

// ── Agents 编辑坐席 ──
test.describe('Dirty Modal — Agents Edit', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/agents')) return;
        await expectAppShell(page);
        await page.waitForSelector('table', { timeout: 15_000 });
    });

    async function openEditAgentModal(page: import('@playwright/test').Page) {
        const firstRow = page.locator('table tbody tr').first();
        const editBtn = firstRow.locator('td:last-child button').first();
        await expect(editBtn).toBeVisible({ timeout: 5_000 });
        await editBtn.click();
        await expect(page.locator(MODAL_SELECTOR)).toBeVisible({ timeout: 5_000 });
    }

    test('clean edit form — ESC closes modal directly', async ({ page }) => {
        await openEditAgentModal(page);
        // 不做修改，直接按 ESC
        await page.keyboard.press('Escape');
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });

    test('clean edit form — X button closes modal directly', async ({ page }) => {
        await openEditAgentModal(page);
        const closeBtn = page.locator(MODAL_SELECTOR).locator('.glass-modal-close').first();
        await closeBtn.click();
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });

    test('dirty edit form — ESC triggers discard confirm', async ({ page }) => {
        await openEditAgentModal(page);
        // 修改 SIP 号码制造脏数据
        const sipInput = page.locator(MODAL_SELECTOR).locator('input').first();
        await sipInput.fill('9999');
        await page.keyboard.press('Escape');
        await expect(page.locator(MODAL_SELECTOR).first()).toBeVisible();
        await expect(page.getByText(/discard|unsaved|丢弃/i).first()).toBeVisible({ timeout: 3_000 });
    });

    test('dirty edit form — confirm discard closes everything', async ({ page }) => {
        await openEditAgentModal(page);
        const sipInput = page.locator(MODAL_SELECTOR).locator('input').first();
        await sipInput.fill('9999');
        await page.keyboard.press('Escape');
        const discardBtn = page.locator('button:has-text("Discard"), button:has-text("放弃"), button:has-text("确认")');
        await discardBtn.first().click();
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });
});

// ── Contacts 新增联系人 ──
test.describe('Dirty Modal — Contacts Create', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/contacts')) return;
        await expectAppShell(page);
        await page.waitForTimeout(3_000);
    });

    async function openCreateContactModal(page: import('@playwright/test').Page) {
        const addBtn = page.locator('button:has-text("Add Contact"), button:has-text("添加联系人"), button:has-text("Add"), button:has-text("新增")');
        await expect(addBtn.first()).toBeVisible({ timeout: 5_000 });
        await addBtn.first().click();
        await expect(page.locator(MODAL_SELECTOR)).toBeVisible({ timeout: 5_000 });
    }

    test('clean form — ESC closes modal directly', async ({ page }) => {
        await openCreateContactModal(page);
        await page.keyboard.press('Escape');
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });

    test('clean form — X button closes modal directly', async ({ page }) => {
        await openCreateContactModal(page);
        const closeBtn = page.locator(MODAL_SELECTOR).locator('.glass-modal-close').first();
        await closeBtn.click();
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });

    test('dirty form — ESC triggers discard confirm', async ({ page }) => {
        await openCreateContactModal(page);
        const nameInput = page.locator(MODAL_SELECTOR).locator('input').first();
        await nameInput.fill('Dirty Test Contact');
        await page.keyboard.press('Escape');
        await expect(page.locator(MODAL_SELECTOR).first()).toBeVisible();
        await expect(page.getByText(/discard|unsaved|丢弃/i).first()).toBeVisible({ timeout: 3_000 });
    });

    test('dirty form — confirm discard closes everything', async ({ page }) => {
        await openCreateContactModal(page);
        const nameInput = page.locator(MODAL_SELECTOR).locator('input').first();
        await nameInput.fill('Dirty Test Contact');
        await page.keyboard.press('Escape');
        const discardBtn = page.locator('button:has-text("Discard"), button:has-text("放弃"), button:has-text("确认")');
        await discardBtn.first().click();
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });

    test('dirty form — cancel keeps form open with data', async ({ page }) => {
        await openCreateContactModal(page);
        const nameInput = page.locator(MODAL_SELECTOR).locator('input').first();
        await nameInput.fill('Dirty Test Contact');
        await page.keyboard.press('Escape');
        const cancelBtn = page.locator('button:has-text("Cancel"), button:has-text("取消")');
        await cancelBtn.first().click();
        await expect(page.locator(MODAL_SELECTOR).first()).toBeVisible();
        const val = await page.locator(MODAL_SELECTOR).locator('input').first().inputValue();
        expect(val).toBe('Dirty Test Contact');
    });
});

// ── Action 中心 — 创建意图 ──
test.describe('Dirty Modal — Action Create', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/actions?tab=configuration')) return;
        await expectAppShell(page);
        await page.waitForTimeout(3_000);
    });

    async function openCreateActionModal(page: import('@playwright/test').Page) {
        const addBtn = page.locator('button:has-text("创建意图"), button:has-text("Create Intent")');
        await expect(addBtn.first()).toBeVisible({ timeout: 5_000 });
        await addBtn.first().click();
        await expect(page.locator(MODAL_SELECTOR)).toBeVisible({ timeout: 5_000 });
    }

    test('clean form — ESC closes modal directly', async ({ page }) => {
        await openCreateActionModal(page);
        await page.keyboard.press('Escape');
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });

    test('clean form — X button closes modal directly', async ({ page }) => {
        await openCreateActionModal(page);
        const closeBtn = page.locator(MODAL_SELECTOR).locator('.glass-modal-close').first();
        await closeBtn.click();
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });

    test('dirty form — ESC triggers discard confirm', async ({ page }) => {
        await openCreateActionModal(page);
        const nameInput = page.locator(MODAL_SELECTOR).locator('input').first();
        await nameInput.fill('Dirty Test Action');
        await page.keyboard.press('Escape');
        await expect(page.locator(MODAL_SELECTOR).first()).toBeVisible();
        await expect(page.getByText(/discard|unsaved|丢弃/i).first()).toBeVisible({ timeout: 3_000 });
    });

    test('dirty form — confirm discard closes everything', async ({ page }) => {
        await openCreateActionModal(page);
        const nameInput = page.locator(MODAL_SELECTOR).locator('input').first();
        await nameInput.fill('Dirty Test Action');
        await page.keyboard.press('Escape');
        const discardBtn = page.locator('button:has-text("Discard"), button:has-text("放弃"), button:has-text("确认")');
        await discardBtn.first().click();
        await expect(page.locator(MODAL_SELECTOR)).not.toBeVisible({ timeout: 3_000 });
    });

    test('dirty form — cancel keeps form open with data', async ({ page }) => {
        await openCreateActionModal(page);
        const nameInput = page.locator(MODAL_SELECTOR).locator('input').first();
        await nameInput.fill('Dirty Test Action');
        await page.keyboard.press('Escape');
        const cancelBtn = page.locator('button:has-text("Cancel"), button:has-text("取消")');
        await cancelBtn.first().click();
        await expect(page.locator(MODAL_SELECTOR).first()).toBeVisible();
        const val = await page.locator(MODAL_SELECTOR).locator('input').first().inputValue();
        expect(val).toBe('Dirty Test Action');
    });
});


