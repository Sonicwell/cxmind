import { test, expect } from '@playwright/test';

/**
 * RBAC E2E: Agent 角色应看到受限视图
 * 使用 agent@cxmi.ai 登录态 (e2e/.auth/agent.json)
 */
test.describe('RBAC - Agent Role Restrictions', () => {

    test('agent should see the app shell after login', async ({ page }) => {
        await page.goto('/dashboard');
        // agent 可能被redirect到 dashboard 或其他首页
        await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15_000 });
    });

    test('agent should have limited sidebar items', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15_000 });

        // Admin-only 菜单项（如 Users / Settings / Audit）应该不可见或减少
        const adminOnlyItems = page.locator(
            'nav a[href="/users"], nav a[href="/settings"], ' +
            'a[href="/users"], a[href="/settings"]'
        );
        // 强制断言：对于 agent 角色，Admin-only 菜单项必须完全不可见
        await expect(adminOnlyItems).toHaveCount(0);
    });

    test('agent accessing /users should be restricted or redirected', async ({ page }) => {
        const response = await page.goto('/users');

        // 应被重定向到 dashboard 或显示 403 / 权限不足
        await page.waitForTimeout(2000);
        const url = page.url();
        const pageContent = await page.textContent('body');

        const isRestricted =
            !url.includes('/users') ||
            (pageContent && /forbidden|unauthorized|权限|access denied|403|insufficient permissions/i.test(pageContent));

        // 越权访问验证：由于 DashboardLayout 包含了重定向或 NotFound 逻辑，
        // 以及 API 的 403 拦截，这里应当严格断言
        // 1. URL 被强制重定向到了默认页 (e.g. /dashboard 或 /) 
        // 2. 页面中出现了明显的拒绝访问提示或 404 (由于 catch-all 路由)
        expect(isRestricted).toBe(true);

        // 如果 RBAC 工作正常，应用至少不会完全崩溃白屏
        await expect(page.locator('#root')).not.toBeEmpty({ timeout: 5000 });
    });

    test('agent accessing /settings should be restricted or redirected', async ({ page }) => {
        await page.goto('/settings');
        await page.waitForTimeout(2000);

        const url = page.url();
        const pageContent = await page.textContent('body');

        const isRestricted =
            !url.includes('/settings') ||
            (pageContent && /forbidden|unauthorized|权限|access denied|403|insufficient permissions/i.test(pageContent));

        // 验证确实被隔离
        expect(isRestricted).toBe(true);

        // 页面不应崩溃
        await expect(page.locator('#root')).not.toBeEmpty({ timeout: 5000 });
    });

    test('no JavaScript errors under agent role', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('/dashboard');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
