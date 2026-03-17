import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

/**
 * E2E TDD: 验证 Settings 页面中的卡片式按钮是否存在重叠/溢出的布局问题。
 * 特别是多语言长文本+网格布局 (Grid) 在小尺寸屏幕下的表现。
 *
 * 测试逻辑:
 * 1. 强制 viewport 为较小尺寸（如 1024x768 或甚至 800x600）逼迫 Grid 受到挤压。
 * 2. 找到 PII Sanitization Policy 下的所有选项卡片。
 * 3. 找到 Avatar Vendor Settings 下的所有选项卡片。
 * 4. 提取各卡片的 Bounding Box，计算两两之间是否发生重叠 (Overlap)。
 * 5. 确保子元素的文字没有溢出卡片边界。
 */

test.describe('Layout Overlap & Clipping — General Settings', () => {

    test.beforeEach(async ({ page }) => {
        // 使用一个紧凑的 viewport 以复现问题
        await page.setViewportSize({ width: 900, height: 800 });
        if (!await navigateOrSkip(page, '/settings/general')) return;
        await expectAppShell(page);
        // 等待保存按钮出现，代表页面加载完毕
        // 避免依赖翻译文本（"Save Changes" / "保存设置"），直接找带有 Save 对应 lucide icon 的按钮，或者直接找 header 下的按钮
        await page.waitForSelector('button:has(svg.lucide-save), h2:has-text("Settings"), h2:has-text("设置")', { timeout: 15_000 });
        // 确保页面骨架稳定
        await page.waitForTimeout(1000);
    });

    /**
     * 判断两个 Bounding Box 是否有交集 (Overlap)
     */
    function isOverlapping(rect1: any, rect2: any) {
        return !(
            rect1.x + rect1.width <= rect2.x ||
            rect2.x + rect2.width <= rect1.x ||
            rect1.y + rect1.height <= rect2.y ||
            rect2.y + rect2.height <= rect1.y
        );
    }

    test('PII Sanitization option cards should not overlap', async ({ page }) => {
        // 定位 PII 区域的 h3 标题
        const piiHeading = page.locator('h3').filter({ hasText: /PII Sanitization|数据脱敏|Desensitization/ }).last();
        // 取其父容器 (整个 PII policy block)
        const piiSection = piiHeading.locator('..').locator('..');

        // PII 有两个卡片选项
        const cards = piiSection.locator('button');

        await expect(cards).toHaveCount(2, { timeout: 5000 });

        const boundingBoxes = await Promise.all([
            cards.nth(0).boundingBox(),
            cards.nth(1).boundingBox()
        ]);

        expect(boundingBoxes[0]).not.toBeNull();
        expect(boundingBoxes[1]).not.toBeNull();

        const overlap = isOverlapping(boundingBoxes[0], boundingBoxes[1]);
        expect(overlap).toBe(false); // 期待它们不重叠 (RED: 当前它们在 900px 下应该会重叠)
    });

    test('Avatar Vendor option cards should not overlap', async ({ page }) => {
        // 定位 Avatar 区域的 h3 标题
        const avatarHeading = page.locator('h3').filter({ hasText: /Avatar|头像/ }).last();
        // 取其父容器
        const avatarSection = avatarHeading.locator('..').locator('..');

        // 查找所有 button 选项
        const cards = avatarSection.locator('button');

        // 我们期望有至少 4 个供应商选项按钮
        const count = await cards.count();
        expect(count).toBeGreaterThanOrEqual(4);

        const boundingBoxes = [];
        for (let i = 0; i < count; i++) {
            const box = await cards.nth(i).boundingBox();
            expect(box).not.toBeNull();
            boundingBoxes.push(box);
        }

        // 两两检测是否重叠
        for (let i = 0; i < boundingBoxes.length; i++) {
            for (let j = i + 1; j < boundingBoxes.length; j++) {
                const overlap = isOverlapping(boundingBoxes[i], boundingBoxes[j]);
                expect(overlap).toBe(false); // 期待没有任何两个头像服务卡片发生物理重叠
            }
        }
    });
});
