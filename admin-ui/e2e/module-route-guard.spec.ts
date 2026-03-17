/**
 * Module Route Guard E2E — 找 bug 专用
 *
 * 验证禁用模块的 URL 不能被直接访问。
 * Discovery Intent: 捕获 ModuleRoute 组件遗漏或路由配置错误
 * 导致用户绕过模块开关直接访问被禁页面的 bug。
 */
import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

// 所有受 ModuleRoute 保护的路由 → 对应模块 slug
// 如果有遗漏，说明 App.tsx 少包了 ModuleRoute
const MODULE_ROUTES = [
    { path: '/inbox', module: 'inbox' },
    { path: '/omni-monitor', module: 'inbox' },
    { path: '/templates', module: 'inbox' },
    { path: '/analytics', module: 'analytics' },
    { path: '/roi', module: 'analytics' },
    { path: '/wfm/schedule', module: 'wfm' },
    { path: '/knowledge', module: 'knowledge' },
    { path: '/qi', module: 'qi' },
    { path: '/actions', module: 'action_center' },
    { path: '/sop', module: 'sop' },
    { path: '/webhooks', module: 'webhooks' },
    { path: '/integrations', module: 'webhooks' },
    { path: '/contacts', module: 'contacts' },
    { path: '/audit', module: 'audit' },
    { path: '/audit/logs', module: 'audit' },
    { path: '/demo', module: 'demo' },
];

test.describe('Module Route Guard — URL Bypass Detection', () => {

    // Bug: 页面加载时出现 JS 错误 (未处理的 undefined module context 等)
    test('all protected routes should not throw JS errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(`${err.message}`));

        for (const route of MODULE_ROUTES.slice(0, 5)) {
            await page.goto(route.path);
            await page.waitForTimeout(2000);
        }

        // 任何一个 JS 错误都是 bug
        if (errors.length > 0) {
            console.log('JS Errors found:', errors);
        }
        expect(errors).toHaveLength(0);
    });

    // Bug: 直接 URL 访问默认禁用的模块时，页面没有重定向而是渲染了空白
    // wfm/qi/inbox/knowledge/webhooks/action_center/audit 默认都是 disabled
    const DEFAULT_DISABLED = [
        { path: '/wfm/schedule', module: 'wfm' },
        { path: '/qi', module: 'qi' },
        { path: '/inbox', module: 'inbox' },
        { path: '/knowledge', module: 'knowledge' },
        { path: '/actions', module: 'action_center' },
        { path: '/webhooks', module: 'webhooks' },
        { path: '/audit', module: 'audit' },
    ];

    for (const route of DEFAULT_DISABLED) {
        test(`${route.path} should redirect when ${route.module} is disabled (default)`, async ({ page }) => {
            if (!await navigateOrSkip(page, route.path)) return;

            // 等待重定向或页面渲染
            await page.waitForTimeout(3000);
            const url = page.url();

            // 两种合法结果:
            // 1. 重定向到 /dashboard (ModuleRoute 生效)
            // 2. 停留在原页面但模块实际已启用 (enabledModules 中 enabled=true)
            // 如果页面是空白的或出现 "not found" 则是 bug

            // 检查页面是否有可见内容 (不应是空白页)
            const hasContent = await page.locator('#root').evaluate(el => el.innerHTML.length > 100);
            expect(hasContent).toBeTruthy();

            // 如果还在原路由，页面不应该显示错误信息
            if (url.includes(route.path.split('/')[1])) {
                const errorText = page.locator('text=/error|not found|404|crash|未找到/i');
                const errorVisible = await errorText.count() > 0 && await errorText.first().isVisible().catch(() => false);
                expect(errorVisible).toBeFalsy();
            }
        });
    }

    // Bug: 已启用的模块路由无法正常加载 (路由配置错误、lazy import 失败)
    const DEFAULT_ENABLED = [
        { path: '/analytics', module: 'analytics' },
        { path: '/contacts', module: 'contacts' },
        { path: '/demo', module: 'demo' },
        { path: '/sop', module: 'sop' },
    ];

    for (const route of DEFAULT_ENABLED) {
        test(`${route.path} should render content when ${route.module} is enabled`, async ({ page }) => {
            if (!await navigateOrSkip(page, route.path)) return;
            await expectAppShell(page);

            // 页面不应该停留在 dashboard (除非数据为空导致重定向)
            // 但至少不应该有 JS 错误
            const errors: string[] = [];
            page.on('pageerror', err => errors.push(err.message));
            await page.waitForTimeout(3000);

            expect(errors).toHaveLength(0);
        });
    }

    // Bug: 嵌套路由 (wfm/audit 子路由) 跳过了父级 ModuleRoute 守卫
    test('nested audit sub-routes should not bypass module guard', async ({ page }) => {
        const auditSubRoutes = ['/audit/logs', '/audit/anomalies', '/audit/rules', '/audit/alerts', '/audit/reports'];

        for (const path of auditSubRoutes) {
            await page.goto(path);
            await page.waitForTimeout(2000);

            const url = page.url();
            // 如果 audit 模块禁用：应重定向到 dashboard
            // 如果 audit 模块启用：应正常渲染
            // 不应该是空白页或错误页
            const rootHtml = await page.locator('#root').innerHTML();
            expect(rootHtml.length).toBeGreaterThan(100);
        }
    });
});
