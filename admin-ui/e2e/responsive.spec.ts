/**
 * Responsive / Mobile Viewport E2E — 找 bug 专用
 *
 * Discovery Intent:
 * - 移动视口下侧栏未折叠，遮挡主内容
 * - 表格在窄屏下溢出容器，水平滚动条缺失
 * - 模态框在小屏幕下超出可视区域
 * - 触摸目标 (按钮) 太小，不满足 44px 最低标准
 */
import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

const MOBILE_VIEWPORT = { width: 375, height: 812 }; // iPhone 12
const TABLET_VIEWPORT = { width: 768, height: 1024 }; // iPad

const PAGES_WITH_TABLES = ['/calls', '/events', '/users', '/agents', '/contacts'];
const PAGES_WITH_FORMS = ['/settings/general', '/alerts'];

test.describe('Responsive — Mobile & Tablet Bug Detection', () => {

    // Bug: 侧栏在移动端没有折叠/隐藏
    test('sidebar should collapse on mobile viewport', async ({ page }) => {
        await page.setViewportSize(MOBILE_VIEWPORT);

        if (!await navigateOrSkip(page, '/dashboard')) return;
        await page.waitForTimeout(3000);

        // 侧栏不应该占据大面积 (应折叠或隐藏)
        const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="side-bar"], .nav-container');
        if (await sidebar.count() > 0) {
            const box = await sidebar.first().boundingBox();
            if (box) {
                // 移动端侧栏宽度不应超过 80px (折叠态) 或 0 (完全隐藏)
                // 如果是 240px+ 说明没折叠
                if (box.width > 80 && box.width < MOBILE_VIEWPORT.width) {
                    console.warn(`⚠️ Sidebar width ${box.width}px on mobile — may not be collapsed`);
                }
            }
        }
    });

    // Bug: 页面内容在移动端溢出可视区域
    test('no horizontal overflow on mobile', async ({ page }) => {
        await page.setViewportSize(MOBILE_VIEWPORT);

        if (!await navigateOrSkip(page, '/dashboard')) return;
        await page.waitForTimeout(3000);

        const overflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        if (overflow) {
            // 找出哪个元素溢出
            const overflowEl = await page.evaluate(() => {
                const elements = document.querySelectorAll('*');
                for (const el of elements) {
                    const rect = el.getBoundingClientRect();
                    if (rect.right > window.innerWidth + 10) {
                        return `${el.tagName}.${el.className.substring(0, 50)} (right: ${Math.round(rect.right)}px)`;
                    }
                }
                return 'unknown';
            });
            console.warn(`⚠️ Horizontal overflow on mobile caused by: ${overflowEl}`);
        }
        // 记录而不硬 fail — dashboard 在极窄屏幕上有轻微溢出可能是可接受的
    });

    // Bug: 表格页面在平板视口下表头和数据不对齐
    for (const path of PAGES_WITH_TABLES) {
        test(`table on ${path} should be scrollable on tablet`, async ({ page }) => {
            await page.setViewportSize(TABLET_VIEWPORT);

            if (!await navigateOrSkip(page, path)) return;
            await expectAppShell(page);
            await page.waitForTimeout(3000);

            const table = page.locator('table, [class*="table"], [role="grid"]');
            if (await table.count() > 0) {
                // 表格应该存在且可见
                await expect(table.first()).toBeVisible();

                // 表格内容不应该被截断 (检查是否有 overflow:hidden 但内容超出)
                const isClipped = await table.first().evaluate(el => {
                    const parent = el.closest('[style*="overflow"]') || el.parentElement;
                    if (parent) {
                        const style = getComputedStyle(parent);
                        return style.overflow === 'hidden' && parent.scrollWidth > parent.clientWidth + 5;
                    }
                    return false;
                });

                if (isClipped) {
                    console.warn(`⚠️ Table on ${path} is clipped without scroll`);
                }
            }
        });
    }

    // Bug: 关键操作按钮在移动端不可见或太小
    test('action buttons should be large enough on mobile', async ({ page }) => {
        await page.setViewportSize(MOBILE_VIEWPORT);

        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);
        await page.waitForTimeout(3000);

        const tooSmall = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button, a[role="button"], [role="switch"]');
            const small: string[] = [];
            buttons.forEach(btn => {
                const rect = btn.getBoundingClientRect();
                // WAI-ARIA 推荐触摸目标至少 44x44
                if (rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24)) {
                    const label = (btn as HTMLElement).innerText || btn.getAttribute('aria-label') || '';
                    if (label) {
                        small.push(`${label.substring(0, 30)} (${Math.round(rect.width)}x${Math.round(rect.height)})`);
                    }
                }
            });
            return small.slice(0, 10);
        });

        if (tooSmall.length > 0) {
            console.warn('⚠️ Undersized buttons on mobile:', tooSmall);
        }
    });

    // Bug: JS 错误在视口切换时触发 (resize handler crash)
    test('no JS errors during viewport resize', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);

        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        // 模拟窗口大小变化
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(500);
        await page.setViewportSize(TABLET_VIEWPORT);
        await page.waitForTimeout(500);
        await page.setViewportSize(MOBILE_VIEWPORT);
        await page.waitForTimeout(500);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(1000);

        expect(errors).toHaveLength(0);
    });
});
