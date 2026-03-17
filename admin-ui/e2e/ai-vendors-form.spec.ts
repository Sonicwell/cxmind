import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { navigateOrSkip, expectAppShell } from './helpers';

/**
 * E2E: AI Vendors 编辑/新增表单的按钮可见性
 * Discovery Intent: 捕捉按钮因样式(对比度/透明度)或条件渲染导致用户不可见的 bug
 */

const ADD_VENDOR_BTN = 'button:has-text("添加供应商"), button:has-text("Add Vendor"), button:has-text("添加"), button:has(.lucide-plus)';

test.describe('AI Vendors — Form Button Visibility', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/ai/vendors')) return;
        await expectAppShell(page);
        // 等待 ASR 供应商列表加载完成
        await page.waitForTimeout(2000);
    });

    test('新增表单展开后，取消/测试/保存按钮均可见', async ({ page }) => {
        // 点击 "添加供应商" 按钮展开新增表单
        const addBtn = page.locator(ADD_VENDOR_BTN).first();
        await expect(addBtn).toBeVisible({ timeout: 10_000 });
        await addBtn.click();

        // 等待表单渲染
        await page.waitForTimeout(500);

        // --- 核心断言: 三个操作按钮必须同时可见 ---

        // 取消按钮
        const cancelBtn = page.locator('button').filter({ hasText: /cancel|取消/i });
        await expect(cancelBtn.first()).toBeVisible({ timeout: 5_000 });

        // 测试按钮
        const testBtn = page.locator('button').filter({ hasText: /test|测试/i });
        await expect(testBtn.first()).toBeVisible({ timeout: 5_000 });

        // 保存/添加按钮
        const saveBtn = page.locator('button').filter({ hasText: /save|保存|add|添加/i });
        await expect(saveBtn.first()).toBeVisible({ timeout: 5_000 });
    });

    test('编辑已有供应商时，取消/测试/保存按钮均可见', async ({ page }) => {
        // 查找非 Built-in 供应商的编辑(铅笔)按钮
        const editBtn = page.locator('.lucide-pencil').first();
        const hasEditableVendor = await editBtn.isVisible({ timeout: 5_000 }).catch(() => false);

        if (!hasEditableVendor) {
            // 没有可编辑供应商，跳过此测试（不失败）
            test.skip();
            return;
        }

        await editBtn.click();
        await page.waitForTimeout(500);

        // --- 核心断言: 编辑模式下三个按钮必须可见 ---
        const cancelBtn = page.locator('button').filter({ hasText: /cancel|取消/i });
        await expect(cancelBtn.first()).toBeVisible({ timeout: 5_000 });

        const testBtn = page.locator('button').filter({ hasText: /test|测试/i });
        await expect(testBtn.first()).toBeVisible({ timeout: 5_000 });

        const saveBtn = page.locator('button').filter({ hasText: /save|保存/i });
        await expect(saveBtn.first()).toBeVisible({ timeout: 5_000 });
    });

    test('取消按钮点击后关闭表单', async ({ page }) => {
        // 打开新增表单
        const addBtn = page.locator(ADD_VENDOR_BTN).first();
        await expect(addBtn).toBeVisible({ timeout: 10_000 });
        await addBtn.click();
        await page.waitForTimeout(500);

        // 确认表单已展开 — 查找表单内的 input
        const formInput = page.locator('input[placeholder*="DashScope"], input[placeholder*="Production"]');
        await expect(formInput.first()).toBeVisible({ timeout: 5_000 });

        // 点击取消
        const cancelBtn = page.locator('button').filter({ hasText: /cancel|取消/i }).first();
        await cancelBtn.click();

        // 表单应关闭 — input 不再可见
        await expect(formInput.first()).not.toBeVisible({ timeout: 3_000 });
    });
});

// ── Visual Regression: 截图像素级对比 ──────────────────────────
test.describe('AI Vendors — Visual Regression', () => {

    test('编辑表单按钮区域截图对比', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/ai/vendors')) return;
        await expectAppShell(page);
        await page.waitForTimeout(2000);

        // 打开新增表单
        const addBtn = page.locator(ADD_VENDOR_BTN).first();
        await expect(addBtn).toBeVisible({ timeout: 10_000 });
        await addBtn.click();
        await page.waitForTimeout(800);

        // 定位按钮行容器 — 取消/测试/保存所在的 flex 容器
        const buttonRow = page.locator('button').filter({ hasText: /cancel|取消/i }).first().locator('..');
        await expect(buttonRow).toBeVisible();

        // 截图对比: 首次运行自动生成 baseline
        // 后续运行如果按钮消失/颜色变化/布局偏移 → diff 失败
        await expect(buttonRow).toHaveScreenshot('asr-form-buttons.png', {
            maxDiffPixelRatio: 0.05, // 允许 5% 像素差异（抗锯齿）
        });
    });
});

// ── Accessibility: axe-core WCAG 色彩对比度审计 ────────────────
test.describe('AI Vendors — Accessibility Audit', () => {

    test('表单按钮满足 WCAG AA 色彩对比度', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/ai/vendors')) return;
        await expectAppShell(page);
        await page.waitForTimeout(2000);

        // 打开新增表单
        const addBtn = page.locator(ADD_VENDOR_BTN).first();
        await expect(addBtn).toBeVisible({ timeout: 10_000 });
        await addBtn.click();
        await page.waitForTimeout(800);

        // 运行 axe 无障碍扫描 — 仅检测 color-contrast 规则
        const results = await new AxeBuilder({ page })
            .include('.settings-page')     // 限定扫描范围
            .withRules(['color-contrast'])  // 仅检测对比度
            .analyze();

        // 输出违规详情便于调试
        if (results.violations.length > 0) {
            console.log('⚠️ Color contrast violations:');
            for (const v of results.violations) {
                for (const node of v.nodes) {
                    console.log(`  - ${node.html}`);
                    console.log(`    ${node.failureSummary}`);
                }
            }
        }

        // 断言: 不应有对比度违规
        expect(results.violations).toHaveLength(0);
    });
});
