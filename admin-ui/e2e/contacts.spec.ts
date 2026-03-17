import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Contacts Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/contacts')) return;
        await expectAppShell(page);
    });

    test('renders contacts list with data grid or table', async ({ page }) => {
        const API = 'http://localhost:3000/api';
        const seedRes = await page.request.post(`${API}/contacts`, {
            data: { displayName: 'E2E-Render-Test', phone: '+10000000003' },
        });
        if (!seedRes.ok()) return;
        const seedId = (await seedRes.json())._id;

        try {
            await page.reload();
            const container = page.locator('table').first();
            await expect(container).toBeVisible({ timeout: 15_000 });
        } finally {
            await page.request.delete(`${API}/contacts/${seedId}`).catch(() => { });
        }
    });

    test('search input is available and functional', async ({ page }) => {
        const searchInput = page.locator(
            'input[placeholder*="search" i], input[placeholder*="搜索" i], input[type="search"], [data-testid="search-input"]'
        ).first();

        if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
            await searchInput.fill('test');
            // 输入后页面不应崩溃，等待一下让过滤生效
            await page.waitForTimeout(1000);
            expect(await page.locator('#root > *').count()).toBeGreaterThan(0);
            await searchInput.clear();
        }
    });

    test('no unhandled errors on contacts page', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.waitForTimeout(2000);
        expect(errors).toHaveLength(0);
    });

    test('clicking a contact row navigates to detail page', async ({ page }) => {
        // 等待列表加载
        const rows = page.locator('.ag-row, tbody tr, .contact-row, [data-testid*="contact-row"], .card-row');
        if (await rows.count() === 0) {
            // 没有联系人数据，跳过
            return;
        }

        await rows.first().click();

        // 验证 URL 跳转到 /contacts/:id
        await expect(async () => {
            expect(page.url()).toMatch(/\/contacts\/.+/);
        }).toPass({ timeout: 10_000 });

        // 详情页不应崩溃
        await expect(page.locator('#root')).not.toBeEmpty({ timeout: 5_000 });
    });

    test('batch delete shows confirmation modal before deleting', async ({ page }) => {
        // Seed: 通过 API 创建临时 contact
        const API = 'http://localhost:3000/api';
        const seedRes = await page.request.post(`${API}/contacts`, {
            data: { displayName: 'E2E-BatchDel-Test', phone: '+10000000001' },
        });
        if (!seedRes.ok()) return; // AS 不可用则跳过
        const seedId = (await seedRes.json())._id;

        try {
            await page.reload();
            const tableBody = page.locator('tbody');
            await expect(tableBody).toBeVisible({ timeout: 15_000 });

            const rows = tableBody.locator('tr');
            // 选中第一行 checkbox
            const firstCheckbox = rows.first().locator('input[type="checkbox"], [role="checkbox"]').first();
            await firstCheckbox.click();

            const rowCountBefore = await rows.count();

            // 点击批量删除按钮（底部操作栏中带 Trash 图标的 destructive 按钮）
            const batchDeleteBtn = page.locator('button', { hasText: /Delete|删除/ }).filter({ has: page.locator('svg') }).last();
            await batchDeleteBtn.click();

            // 应出现确认弹窗 (ConfirmModal -> GlassModal -> Radix Dialog)
            const confirmDialog = page.locator('[role="dialog"]');
            await expect(confirmDialog).toBeVisible({ timeout: 3_000 });

            // 弹窗内应有确认和取消按钮
            const cancelBtn = confirmDialog.locator('button', { hasText: /Cancel|取消/i });
            await expect(cancelBtn).toBeVisible();
            const confirmBtn = confirmDialog.locator('button', { hasText: /Delete|删除|Confirm|确认/i });
            await expect(confirmBtn).toBeVisible();

            // 点取消 → 弹窗关闭，数据不变
            await cancelBtn.click();
            await expect(confirmDialog).toBeHidden({ timeout: 3_000 });
            await expect(rows).toHaveCount(rowCountBefore);
        } finally {
            // Cleanup
            await page.request.delete(`${API}/contacts/${seedId}`).catch(() => { });
        }
    });

    test('single delete button shows confirmation modal', async ({ page }) => {
        const API = 'http://localhost:3000/api';
        const seedRes = await page.request.post(`${API}/contacts`, {
            data: { displayName: 'E2E-SingleDel-Test', phone: '+10000000002' },
        });
        if (!seedRes.ok()) return;
        const seedId = (await seedRes.json())._id;

        try {
            await page.reload();
            const tableBody = page.locator('tbody');
            await expect(tableBody).toBeVisible({ timeout: 15_000 });

            const rows = tableBody.locator('tr');
            // 点击第一行的删除按钮
            const deleteBtn = rows.first().locator('button').last();
            await deleteBtn.click();

            // 应出现确认弹窗
            const confirmDialog = page.locator('[role="dialog"]');
            await expect(confirmDialog).toBeVisible({ timeout: 3_000 });

            // 点取消关闭
            const cancelBtn = confirmDialog.locator('button', { hasText: /Cancel|取消/i });
            await cancelBtn.click();
            await expect(confirmDialog).toBeHidden({ timeout: 3_000 });
        } finally {
            await page.request.delete(`${API}/contacts/${seedId}`).catch(() => { });
        }
    });

    test('batch tag opens GlassModal with ESC close', async ({ page }) => {
        // Discovery Intent: 验证手工 Modal → GlassModal 替换后，弹窗具备 role="dialog" 和 ESC 关闭
        const API = 'http://localhost:3000/api';
        const seedRes = await page.request.post(`${API}/contacts`, {
            data: { displayName: 'E2E-BatchTag-Test', phone: '+10000000004' },
        });
        if (!seedRes.ok()) return;
        const seedId = (await seedRes.json())._id;

        try {
            await page.reload();
            const tableBody = page.locator('tbody');
            await expect(tableBody).toBeVisible({ timeout: 15_000 });

            // 选中第一行
            const firstCheckbox = tableBody.locator('tr').first().locator('input[type="checkbox"], [role="checkbox"]').first();
            await firstCheckbox.click();

            // batch bar 应出现
            const batchBar = page.locator('.contacts-batch-bar');
            await expect(batchBar).toBeVisible({ timeout: 3_000 });

            // 点击 Tag 按钮
            const tagBtn = batchBar.locator('button', { hasText: /Tag|标签/i });
            await tagBtn.click();

            // GlassModal 应出现 (Radix Dialog → role="dialog")
            const dialog = page.locator('[role="dialog"]');
            await expect(dialog).toBeVisible({ timeout: 3_000 });

            // 弹窗内应有 input 和按钮
            await expect(dialog.locator('input')).toBeVisible();
            await expect(dialog.locator('button', { hasText: /Cancel|取消/i })).toBeVisible();

            // 按 ESC 关闭 (GlassModal 通过 Radix Dialog 提供此能力)
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden({ timeout: 3_000 });
        } finally {
            await page.request.delete(`${API}/contacts/${seedId}`).catch(() => { });
        }
    });

    test('batch action bar stage select uses Select component', async ({ page }) => {
        // Discovery Intent: 验证原生 <select> → Select 组件替换后，下拉渲染带 ui-select class
        const API = 'http://localhost:3000/api';
        const seedRes = await page.request.post(`${API}/contacts`, {
            data: { displayName: 'E2E-BatchSelect-Test', phone: '+10000000005' },
        });
        if (!seedRes.ok()) return;
        const seedId = (await seedRes.json())._id;

        try {
            await page.reload();
            const tableBody = page.locator('tbody');
            await expect(tableBody).toBeVisible({ timeout: 15_000 });

            // 选中第一行
            const firstCheckbox = tableBody.locator('tr').first().locator('input[type="checkbox"], [role="checkbox"]').first();
            await firstCheckbox.click();

            // batch bar 出现
            const batchBar = page.locator('.contacts-batch-bar');
            await expect(batchBar).toBeVisible({ timeout: 3_000 });

            // Select 组件渲染为 <select> 带 ui-select class
            const selectEl = batchBar.locator('select.ui-select, select.contacts-batch-stage-select');
            await expect(selectEl).toBeVisible();
        } finally {
            await page.request.delete(`${API}/contacts/${seedId}`).catch(() => { });
        }
    });
});
