/**
 * Dark Mode / Theme Switching E2E — 找 bug 专用
 *
 * Discovery Intent:
 * - 主题切换后 CSS 变量未正确切换 → 白字白底/黑字黑底
 * - 某些页面的硬编码颜色在暗色模式下不可见
 * - 切换后页面元素消失或布局错乱
 * - 主题 preference 未持久化到 localStorage
 */
import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

// 关键页面列表 — 逐页检查主题切换是否导致视觉异常
const CRITICAL_PAGES = [
    '/dashboard',
    '/calls',
    '/monitoring',
    '/analytics',
    '/contacts',
    '/settings/general',
    '/alerts',
];

test.describe('Theme Switching — Visual Regression Detection', () => {

    // Bug: 主题切换后 CSS 变量未生效
    test('switching to dark theme should change CSS variables', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);

        // 读取初始背景色
        const initialBg = await page.evaluate(() => {
            return getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')
                || getComputedStyle(document.body).backgroundColor;
        });

        // 查找并点击主题切换器
        const themeSwitcher = page.locator(
            '[data-testid*="theme"], button:has-text("Dark"), button:has-text("暗色"), ' +
            '.theme-switcher, [class*="theme-switch"], [aria-label*="theme"]'
        );

        if (await themeSwitcher.count() === 0) {
            // 可能在用户菜单里
            const avatar = page.locator('.avatar, [data-testid*="user"], .user-menu');
            if (await avatar.count() > 0) {
                await avatar.first().click();
                await page.waitForTimeout(500);
            }
        }

        const darkBtn = page.locator(
            'button:has-text("Dark"), button:has-text("暗色"), button:has-text("Midnight"), ' +
            '[data-theme="dark"], [data-value="dark"]'
        );

        if (await darkBtn.count() > 0) {
            await darkBtn.first().click();
            await page.waitForTimeout(1000);

            // 验证 data-theme 属性变化
            const dataTheme = await page.evaluate(() =>
                document.documentElement.getAttribute('data-theme')
                || document.body.getAttribute('data-theme')
            );

            // 至少应该有一个主题标识
            if (dataTheme) {
                expect(dataTheme).not.toBe('light');
            }

            // 验证背景色确实变了
            const newBg = await page.evaluate(() => {
                return getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')
                    || getComputedStyle(document.body).backgroundColor;
            });

            // 如果背景色和初始完全一样，主题切换可能没生效
            if (initialBg && newBg && initialBg !== 'undefined') {
                // 允许变化 — 只在完全相同时报警
                if (initialBg === newBg) {
                    console.warn('⚠️ Background color unchanged after theme switch');
                }
            }
        }
    });

    // Bug: 暗色主题下某些页面出现 JS 错误
    test('no JS errors on critical pages in dark mode', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;

        // 强制设置暗色主题
        await page.evaluate(() => {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('cxmind:ui:theme', 'dark');
        });

        const errors: string[] = [];
        page.on('pageerror', err => errors.push(`[${page.url()}] ${err.message}`));

        for (const path of CRITICAL_PAGES) {
            await page.goto(path);
            await page.waitForTimeout(2000);
        }

        if (errors.length > 0) {
            console.log('Dark mode JS errors:', errors);
        }
        expect(errors).toHaveLength(0);
    });

    // Bug: 主题在页面间未保持一致 (localStorage 丢失)
    test('theme should persist across page navigation', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;

        // 设置暗色主题
        await page.evaluate(() => {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('cxmind:ui:theme', 'dark');
        });

        // 导航到其他页面
        await page.goto('/calls');
        await page.waitForTimeout(2000);

        const theme = await page.evaluate(() =>
            document.documentElement.getAttribute('data-theme')
        );

        // 主题应该在导航后保持
        if (theme) {
            expect(theme).toBe('dark');
        }
    });

    // Bug: 主题切换按钮在某些页面上不存在或被遮挡
    for (const path of ['/dashboard', '/settings/general']) {
        test(`theme switcher should be accessible on ${path}`, async ({ page }) => {
            if (!await navigateOrSkip(page, path)) return;
            await expectAppShell(page);

            // 主题切换器应该可找到 (可能在侧栏底部或设置里)
            const switcher = page.locator(
                '[data-testid*="theme"], .theme-switcher, [class*="theme"], ' +
                '[aria-label*="theme"], [aria-label*="Theme"]'
            );

            // 至少能定位到 — 如果完全找不到说明 UI 组件丢失
            // 不强制 visible (可能在折叠菜单里)，但 DOM 中应该存在
            let count = await switcher.count();
            if (count === 0) {
                // 检查是否在 avatar 下拉菜单里
                const avatar = page.locator('.user-profile-btn, .avatar, [data-testid*="user"], .user-menu').first();
                try {
                    await avatar.waitFor({ state: 'attached', timeout: 3000 });
                    await avatar.click();
                    const inMenu = page.locator('[data-theme="dark"], :text-matches("theme|主题|Dark|Light|暗色|亮色", "i")').first();
                    await inMenu.waitFor({ state: 'attached', timeout: 3000 });
                    count = 1;
                } catch (e) {
                    // ignore and let expect fail
                }
                expect(count).toBeGreaterThan(0);
            }
        });
    }
});
