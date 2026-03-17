import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Agent Map Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/agent-map')) return;
        await expectAppShell(page);
    });

    test('should render map container', async ({ page }) => {
        const mapContainer = page.locator('.agent-map, .map-container, .floor-plan, [data-testid="agent-map"], .map-wrapper');
        await expect(mapContainer.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should display agent seat cards', async ({ page }) => {
        const seats = page.locator('.seat-card, .agent-seat, .agent-card, [class*="seat"], [data-testid*="seat"]');
        if (await seats.count() > 0) {
            await expect(seats.first()).toBeVisible();
        }
    });

    test('should have zoom controls', async ({ page }) => {
        const zoom = page.locator('button:has-text("+"), button:has-text("-"), .zoom-controls, [data-testid*="zoom"]');
        if (await zoom.count() > 0) {
            await expect(zoom.first()).toBeVisible();
        }
    });

    test('should show real-time status legend', async ({ page }) => {
        const legend = page.locator('.legend, .status-legend, text=/available|busy|offline|wrap/i');
        if (await legend.count() > 0) {
            await expect(legend.first()).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/agent-map');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });

    // ─── Regression tests for bugs fixed 2026-03-10 ───

    /**
     * Discovery Intent: 检测 Button variant="none" 缺失导致 btn/btn-primary class
     * 和 toggle-btn CSS 冲突，使按钮文字颜色与背景色相同而不可见。
     * 先例: contact-stages-css.spec.ts 中的 computedStyle 检测模式
     */
    test('toolbar toggle buttons should have visible text content', async ({ page }) => {
        const toggleBtns = page.locator('.toggle-btn');
        const count = await toggleBtns.count();
        // toolbar 至少有 Monitor + Edit Layout 两个 toggle
        expect(count, 'Expected at least 2 toggle buttons in toolbar').toBeGreaterThanOrEqual(2);

        for (let i = 0; i < count; i++) {
            const btn = toggleBtns.nth(i);
            const text = await btn.textContent();
            expect(
                text?.trim().length,
                `Toggle button ${i} has empty text — possible className collision hiding content`
            ).toBeGreaterThan(0);

            // 文字颜色不应该等于背景色（否则不可见）
            const colors = await btn.evaluate(el => {
                const s = getComputedStyle(el);
                return { color: s.color, bg: s.backgroundColor };
            });
            expect(
                colors.color,
                `Toggle button ${i} text color matches background — text is invisible`
            ).not.toBe(colors.bg);
        }
    });

    /**
     * Discovery Intent: 检测 CameraController useFrame 中的 isStable 标记
     * 在 panOffset 变化后未重置，导致后续 useFrame 直接 return 跳过相机位置更新。
     * 键盘方向键调用 setMapPanOffset 但相机不移动 → 地图看起来 "拖不动"。
     *
     * 限制: Three.js canvas 内部 camera position 无法通过 DOM API 直接读取。
     * 我们通过验证 canvas 渲染正常 + 按键无 JS 报错 来间接防护。
     */
    test('arrow keys should not cause JS errors (keyboard pan regression)', async ({ page }) => {
        const canvas = page.locator('canvas[data-engine]');
        await expect(canvas).toBeVisible({ timeout: 10_000 });

        // PanHandler 设置 cursor: grab → 证明组件正常挂载
        const cursor = await canvas.evaluate(el => getComputedStyle(el).cursor);
        expect(cursor, 'Canvas cursor should be "grab" (PanHandler mounted)').toBe('grab');

        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        // 连续按方向键 — 如果 isStable bug 存在, 键盘操作无效果但不会报错
        // 至少确保不崩溃
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(300);
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(300);
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(300);
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);
        // Space = 重置视图
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);

        expect(errors, 'Keyboard shortcuts should not cause JS errors').toHaveLength(0);
    });

    /**
     * Discovery Intent: 检测 OutcomeCard/QualityStatsCard 使用 map-card glass-card
     * 类名导致白色/玻璃背景，在 Agent Map 暗色上下文中不协调。
     * 正确的类名应为 slot-card，对应暗色半透明背景。
     */
    test('widget cards should use dark theme background', async ({ page }) => {
        const slotCards = page.locator('.slot-card');
        if (await slotCards.count() === 0) {
            // demo/新环境可能没有 widget，跳过
            test.skip();
            return;
        }

        const bg = await slotCards.first().evaluate(
            el => getComputedStyle(el).backgroundColor
        );
        const match = bg.match(/\d+/g);
        if (match) {
            const [r, g, b] = match.map(Number);
            // 暗色背景 RGB 各通道应 < 100 (白色是 255,255,255)
            expect(
                r,
                `slot-card background too bright (${bg}), likely using glass-card instead of slot-card`
            ).toBeLessThan(100);
        }
    });

    /**
     * Discovery Intent: 检测 FloorManager 弹窗使用 GlassModal 默认浅色主题
     * 而非 agent-map-modal 暗色覆盖，导致白色弹窗在暗色 Agent Map 上不协调。
     */
    test('floor management modal should have dark background', async ({ page }) => {
        // 需要编辑权限的齿轮按钮 — 可能不存在（RBAC 限制）
        const settingsBtn = page.locator('.map-icon-btn, button[title*="Manage"], button[title*="manage"]');
        if (await settingsBtn.count() === 0) {
            test.skip();
            return;
        }

        await settingsBtn.first().click();
        const modal = page.locator('.agent-map-modal');
        await expect(modal).toBeVisible({ timeout: 5000 });

        const bg = await modal.evaluate(el => getComputedStyle(el).backgroundColor);
        const match = bg.match(/\d+/g);
        if (match) {
            const [r, g, b] = match.map(Number);
            expect(
                r,
                `Floor Management modal background too bright (${bg}), agent-map-modal CSS override missing`
            ).toBeLessThan(50);
        }
    });
});
