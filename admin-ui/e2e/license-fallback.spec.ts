import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('License Fallback & Module Isolation', () => {

    test('should hide premium modules and show free tier limitations when license is basic/invalid', async ({ page }) => {
        // Intercept license check API and force Free Tier with limited modules
        await page.route('**/api/platform/license*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            valid: true, // App still runs
                            entitlements: {
                                maxAgents: 5,
                                tier: 'Free',
                                modules: [
                                    "core",
                                    "analytics",
                                    "knowledge",
                                    "monitoring",
                                    "llm_multi_vendor"
                                    // Missing: wfm, quality_inspector, action_center, etc.
                                ]
                            },
                            error: null
                        }
                    })
                });
            } else {
                await route.continue();
            }
        });

        // Navigate to dashboard
        if (!await navigateOrSkip(page, '/')) return;
        await expectAppShell(page);

        // Wait for potential sidebar load
        const sidebar = page.locator('aside, .sidebar, nav, [data-testid="sidebar"]');
        await expect(sidebar.first()).toBeVisible();

        // 验证前端根据 License 隐藏了 Wave 2 高级模块的路由入口
        const premiumLinks = sidebar.locator('a[href*="/wfm"], a[href*="/quality-inspector"], a[href*="/inbox"]');

        // 由于 License 里没有 wfm, quality_inspector，前端应当不渲染或者隐藏它们
        // We use toHaveCount(0) or ensure they are hidden
        for (let i = 0; i < await premiumLinks.count(); i++) {
            await expect(premiumLinks.nth(i)).toBeHidden();
        }

        // 基本模块应当可见
        const basicLinks = sidebar.locator('a[href*="/calls"], a[href*="/contacts"]');
        if (await basicLinks.count() > 0) {
            await expect(basicLinks.first()).toBeVisible();
        }
    });

});
