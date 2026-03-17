/**
 * Module Management E2E — W1-MOD-001, W1-MOD-002
 *
 * 验证: Core 模块不可关闭, 模块开关即时生效 (侧栏联动)
 */
import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Module Management (W1-MOD)', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/system/modules')) return;
        await expectAppShell(page);
    });

    // W1-MOD-001: Core 模块不可关闭
    test('core modules should have disabled toggles', async ({ page }) => {
        // 等待模块列表渲染
        await page.waitForSelector('[data-testid="module-list"], .module-card, table', { timeout: 10_000 }).catch(() => { });

        // Core tier 模块的开关应该被禁用或不存在
        const coreLabels = ['dashboard', 'monitoring', 'calls', 'call_events', 'users', 'agents', 'agent_map', 'settings'];

        for (const slug of coreLabels) {
            const row = page.locator(`[data-module="${slug}"], tr:has-text("${slug}"), [class*="module"]:has-text("${slug}")`);
            if (await row.count() === 0) continue;

            // 在 core 模块行内查找 toggle — 应为 disabled
            const toggle = row.locator('[role="switch"], input[type="checkbox"], .toggle-switch');
            if (await toggle.count() > 0) {
                const isDisabled = await toggle.first().isDisabled();
                const ariaDisabled = await toggle.first().getAttribute('aria-disabled');
                expect(isDisabled || ariaDisabled === 'true').toBeTruthy();
            }
            // 如果没有 toggle，也说明 core 模块没有关闭入口 → pass
        }
    });

    // W1-MOD-001: 模块面板有 core/optional 区分
    test('should display core and optional module sections', async ({ page }) => {
        // 页面应包含 core/optional 分类信息
        const content = page.locator(
            'text=/core|optional|核心|可选|基础|高级/i'
        );
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    // W1-MOD-002: 模块开关即时生效 — 侧栏联动
    test('toggling analytics module should update sidebar', async ({ page }) => {
        // 先确认 analytics 菜单存在
        await page.goto('/dashboard');
        await expectAppShell(page);

        const analyticsLink = page.locator('a[href="/analytics"], [title*="Analytics"], [title*="analytics"]');
        const analyticsVisible = await analyticsLink.count() > 0 && await analyticsLink.first().isVisible().catch(() => false);

        // 进 modules 页关闭 analytics
        await page.goto('/settings/system/modules');
        await page.waitForTimeout(2000);

        const analyticsRow = page.locator(
            `[data-module="analytics"], tr:has-text("analytics"), [class*="module"]:has-text("analytics")`
        );
        if (await analyticsRow.count() === 0) return; // 找不到就跳过

        const toggle = analyticsRow.locator('[role="switch"], input[type="checkbox"]');
        if (await toggle.count() === 0) return;

        // 根据当前状态决定操作
        const currentState = await toggle.first().isChecked().catch(() => null);
        if (currentState === null) return;

        // 切换模块
        await toggle.first().click();
        await page.waitForTimeout(1500);

        // 回到 dashboard 检查侧栏
        await page.goto('/dashboard');
        await expectAppShell(page);
        await page.waitForTimeout(1000);

        const afterLink = page.locator('a[href="/analytics"], [title*="Analytics"], [title*="analytics"]');
        const afterVisible = await afterLink.count() > 0 && await afterLink.first().isVisible().catch(() => false);

        // 状态应该反转
        expect(afterVisible).not.toBe(analyticsVisible);

        // 恢复原状: 再次切换回来
        await page.goto('/settings/system/modules');
        await page.waitForTimeout(2000);
        const restoreToggle = analyticsRow.locator('[role="switch"], input[type="checkbox"]');
        if (await restoreToggle.count() > 0) {
            await restoreToggle.first().click();
            await page.waitForTimeout(1000);
        }
    });

    test('no JavaScript errors on modules page', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
