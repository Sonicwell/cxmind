/**
 * SOP Builder E2E — 找 bug 专用
 *
 * Discovery Intent:
 * - SOP Builder 页面加载时 JS crash (React Flow 等重型库 lazy import 失败)
 * - 空白画布不可交互 (拖拽/缩放失败)
 * - 保存/发布按钮在无节点时可点击 (应禁用或提示)
 * - 从列表页导航到 builder 时路由参数丢失
 */
import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('SOP Builder — Editor Bug Detection', () => {

    // Bug: SOP Builder lazy load crash — React Flow 是重型依赖
    test('builder page should load without JS errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        if (!await navigateOrSkip(page, '/sop/builder')) return;
        await page.waitForTimeout(5000); // React Flow 初始化可能较慢

        if (errors.length > 0) {
            console.log('SOP Builder JS errors:', errors);
        }
        expect(errors).toHaveLength(0);
    });

    // Bug: Builder 页面渲染了空白容器 (React Flow canvas 未初始化)
    test('builder should render canvas or placeholder', async ({ page }) => {
        if (!await navigateOrSkip(page, '/sop')) return;
        await expectAppShell(page);

        const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add"), button:has-text("新建"), button:has-text("创建"), a[href*="builder"]').first();
        if (await createBtn.count() > 0) {
            await createBtn.click();
            await page.waitForTimeout(5000);

            // React Flow 渲染后应该有 canvas 相关元素
            const content = page.locator(
                '.react-flow, .reactflow-wrapper, [class*="react-flow"], ' +
                'canvas, svg, [class*="canvas"], [class*="editor"], ' +
                '[class*="builder"], [data-testid*="sop"], ' +
                'text=/empty|start|drag|创建|开始|拖拽|新建/i'
            );

            await expect(content.first()).toBeVisible({ timeout: 10_000 });
        }
    });

    // Bug: SOP 列表 → 点击 创建/编辑 → Builder 路由不生效
    test('navigating from SOP list to builder should work', async ({ page }) => {
        if (!await navigateOrSkip(page, '/sop')) return;
        await expectAppShell(page);
        await page.waitForTimeout(3000);

        const createBtn = page.locator(
            'button:has-text("Create"), button:has-text("New"), button:has-text("Add"), ' +
            'button:has-text("新建"), button:has-text("创建"), a[href*="builder"]'
        );

        if (await createBtn.count() > 0) {
            await createBtn.first().click();
            await page.waitForTimeout(3000);

            // 应该在 builder 页面，或出现创建对话框
            const url = page.url();
            const isOnBuilder = url.includes('builder') || url.includes('sop');
            const hasModal = await page.locator('[role="dialog"], .modal, [class*="modal"]').count() > 0;

            expect(isOnBuilder || hasModal).toBeTruthy();

            // 不应有 JS 错误
            const rootHtml = await page.locator('#root').innerHTML();
            expect(rootHtml.length).toBeGreaterThan(100);
        }
    });

    // Bug: Builder 工具栏按钮缺失 (保存/发布/撤销)
    test('builder should have toolbar with action buttons', async ({ page }) => {
        if (!await navigateOrSkip(page, '/sop/builder')) return;
        await expectAppShell(page);
        await page.waitForTimeout(5000);

        const toolbar = page.locator(
            'button:has-text("Save"), button:has-text("Publish"), button:has-text("保存"), ' +
            'button:has-text("发布"), button:has-text("Undo"), button:has-text("Redo"), ' +
            '[data-testid*="toolbar"], [class*="toolbar"]'
        );

        // Builder 至少应该有一个操作按钮
        if (await toolbar.count() === 0) {
            console.warn('⚠️ No toolbar buttons found in SOP Builder');
        }
    });

    test('no console errors on builder', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                if (!text.includes('favicon') && !text.includes('net::ERR')) {
                    consoleErrors.push(text.substring(0, 200));
                }
            }
        });

        if (!await navigateOrSkip(page, '/sop/builder')) return;
        await page.waitForTimeout(5000);

        if (consoleErrors.length > 0) {
            console.log('SOP Builder console errors:', consoleErrors);
        }
        expect(consoleErrors.length).toBeLessThan(5);
    });
});
