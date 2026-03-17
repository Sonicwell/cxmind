/**
 * Error Boundary & Console Error E2E — 找 bug 专用
 *
 * Discovery Intent:
 * - 404 页面渲染异常或不存在
 * - 页面加载时 console.error 泄露 (API 连不上、组件 crash)
 * - React Error Boundary 未捕获异常导致白屏
 * - 未处理的 Promise rejection 在生产构建中暴露
 */
import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

// 所有有意义的路由 — 遍历检查 JS 错误和 console.error
const ALL_ROUTES = [
    '/dashboard', '/calls', '/events', '/monitoring', '/alerts',
    '/users', '/agents', '/map', '/analytics', '/roi',
    '/contacts', '/sop', '/demo', '/assistant',
    '/settings/general', '/settings/ai/vendors', '/settings/ai/ser',
    '/settings/system/modules', '/settings/system/license',
];

test.describe('Error Boundary & Console Error Sweep', () => {

    // Bug: 访问不存在的路由时白屏 (无 404 fallback)
    test('unknown route should show 404 or redirect, not blank page', async ({ page }) => {
        await page.goto('/this-route-does-not-exist-12345');
        await page.waitForTimeout(3000);

        const rootHtml = await page.locator('#root').innerHTML();
        // 不应该是空白
        expect(rootHtml.length).toBeGreaterThan(50);

        // 应该要么重定向到已知页面，要么显示 404 信息
        const url = page.url();
        const has404 = await page.locator('text=/404|not found|page not found|未找到/i').count() > 0;
        const redirected = !url.includes('this-route-does-not-exist');

        expect(has404 || redirected).toBeTruthy();
    });

    // Bug: 深层嵌套未知路由白屏
    test('unknown nested route should not crash', async ({ page }) => {
        await page.goto('/settings/this/does/not/exist');
        await page.waitForTimeout(3000);

        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.waitForTimeout(1000);

        expect(errors).toHaveLength(0);
    });

    // Bug: 某些页面在无 API 数据时 crash (unhandled null/undefined)
    // 全路由扫描 — pageerror 即 uncaught exception
    for (const path of ALL_ROUTES) {
        test(`no uncaught JS errors on ${path}`, async ({ page }) => {
            const errors: string[] = [];
            page.on('pageerror', err => {
                if (!err.message.includes('WebGL')) {
                    errors.push(err.message);
                }
            });

            if (!await navigateOrSkip(page, path)) return;
            await page.waitForTimeout(4000); // 等 lazy load + API 调用完成

            if (errors.length > 0) {
                console.log(`❌ Uncaught errors on ${path}:`, errors);
            }
            expect(errors).toHaveLength(0);
        });
    }

    // Bug: console.error 泄露 (React 废弃 API、prop type 警告、未处理 promise)
    // 这不应该阻断 CI，但记录发现
    test('scan console.error across critical pages', async ({ page }) => {
        const consoleErrors: { page: string; message: string }[] = [];

        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                // 过滤掉已知的无害错误
                if (text.includes('favicon') || text.includes('net::ERR') || text.includes('404 (Not Found)') || text.includes('403') || text.includes('WebGL')) {
                    return;
                }
                consoleErrors.push({ page: page.url(), message: text.substring(0, 200) });
            }
        });

        for (const path of ALL_ROUTES.slice(0, 10)) {
            await page.goto(path);
            await page.waitForTimeout(2000);
        }

        // 报告但不 hard fail (有些 console.error 是 API 连不上的预期行为)
        if (consoleErrors.length > 0) {
            console.log(`⚠️ Found ${consoleErrors.length} console.error(s):`);
            consoleErrors.forEach(e => console.log(`  [${e.page}] ${e.message}`));
        }

        // 只在超过 20 条时 fail (说明有系统性问题)
        expect(consoleErrors.length).toBeLessThan(20);
    });

    // Bug: 快速连续导航导致 race condition crash
    test('rapid navigation should not cause JS errors', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;

        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        // 快速切换页面 — 模拟用户快速点击
        for (const path of ['/calls', '/monitoring', '/dashboard', '/alerts', '/contacts', '/analytics']) {
            await page.goto(path);
            await page.waitForTimeout(300); // 故意不等加载完就切走
        }

        // 最后等一下让所有 pending 操作完成
        await page.waitForTimeout(3000);

        if (errors.length > 0) {
            console.log('Rapid navigation errors:', errors);
        }
        expect(errors).toHaveLength(0);
    });
});
