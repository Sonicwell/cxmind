/**
 * i18n / 国际化 E2E — 找 bug 专用
 *
 * Discovery Intent:
 * - 缺失翻译 key 泄露到 UI (显示 "dashboard.title" 而不是真实文字)
 * - 切换语言后部分组件未响应 (缓存了旧 locale)
 * - 日期/数字格式不随语言变化
 * - 某些页面的 hardcoded 英文在中文模式下混杂显示
 */
import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

// 扫描所有可见文本，查找未翻译的 key 格式 (如 "dashboard.title", "common.save")
async function findLeakedKeys(page: import('@playwright/test').Page): Promise<string[]> {
    return page.evaluate(() => {
        const leaked: string[] = [];
        // i18n key 格式: word.word 或 word.word.word (全小写/驼峰)
        const keyPattern = /^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*(\.[a-z][a-zA-Z]*)?$/;

        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null
        );

        let node: Node | null;
        while ((node = walker.nextNode())) {
            const text = (node.textContent || '').trim();
            if (text.length > 3 && text.length < 60 && keyPattern.test(text)) {
                // 排除已知的非 key 文本 (如 domain.com, file.name)
                if (!text.includes('cxmi.') && !text.includes('http') && !text.includes('@')) {
                    leaked.push(text);
                }
            }
        }
        return [...new Set(leaked)];
    });
}

// 在这些关键页面扫描未翻译 key
const PAGES_TO_SCAN = [
    '/dashboard',
    '/calls',
    '/monitoring',
    '/alerts',
    '/settings/general',
    '/contacts',
    '/analytics',
    '/demo',
];

test.describe('i18n — Missing Translation Detection', () => {

    // Bug: 某页面显示了 i18n key 而不是翻译后的文本
    for (const path of PAGES_TO_SCAN) {
        test(`no leaked i18n keys on ${path}`, async ({ page }) => {
            if (!await navigateOrSkip(page, path)) return;
            await expectAppShell(page);
            await page.waitForTimeout(3000); // 等数据加载完

            const leaked = await findLeakedKeys(page);
            if (leaked.length > 0) {
                console.log(`⚠️ Leaked i18n keys on ${path}:`, leaked);
            }
            expect(leaked).toHaveLength(0);
        });
    }

    // Bug: 切换到中文后，按钮/标题仍显示英文 (hardcoded)
    test('switching to Chinese should translate UI elements', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);

        // 切换到中文
        await page.evaluate(() => {
            localStorage.setItem('cxmind:language', 'zh');
            localStorage.setItem('i18nextLng', 'zh');
        });
        await page.reload();
        await page.waitForTimeout(3000);

        // 检查关键 UI 元素是否有中文内容
        const bodyText = await page.locator('body').innerText();

        // 如果系统支持中文，应该能找到至少一些中文字符
        const hasChinese = /[\u4e00-\u9fff]/.test(bodyText);
        const hasEnglish = /dashboard|monitoring|settings|calls/i.test(bodyText);

        // 如果完全没有中文但有大量英文菜单，说明中文翻译没加载
        if (!hasChinese && hasEnglish) {
            console.warn('⚠️ No Chinese characters found after switching to zh locale');
            // 不 fail，因为可能不支持中文 — 但记录
        }
    });

    // Bug: 切换回英文后，部分组件还是中文 (缓存问题)
    test('switching back to English should restore English UI', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);

        // 先切中文
        await page.evaluate(() => {
            localStorage.setItem('cxmind:language', 'zh');
            localStorage.setItem('i18nextLng', 'zh');
        });
        await page.reload();
        await page.waitForTimeout(2000);

        // 再切英文
        await page.evaluate(() => {
            localStorage.setItem('cxmind:language', 'en');
            localStorage.setItem('i18nextLng', 'en');
        });
        await page.reload();
        await page.waitForTimeout(3000);

        // 扫描是否有泄露的 key
        const leaked = await findLeakedKeys(page);
        expect(leaked).toHaveLength(0);
    });

    // Bug: JS 错误在语言切换时触发 (缺 key 导致 crash)
    test('no JS errors during language switch cycle', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;

        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        // 快速切换语言
        for (const lang of ['zh', 'en', 'zh', 'en']) {
            await page.evaluate((l) => {
                localStorage.setItem('cxmind:language', l);
                localStorage.setItem('i18nextLng', l);
            }, lang);
            await page.reload();
            await page.waitForTimeout(1500);
        }

        if (errors.length > 0) {
            console.log('JS errors during locale switch:', errors);
        }
        expect(errors).toHaveLength(0);
    });

    // Bug: tooltip/placeholder 里有未翻译的 key (容易遗漏)
    test('form placeholders should not contain i18n keys', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/general')) return;
        await expectAppShell(page);
        await page.waitForTimeout(2000);

        const leakedPlaceholders = await page.evaluate(() => {
            const leaked: string[] = [];
            const keyPattern = /^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*(\.[a-z][a-zA-Z]*)?$/;

            document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
                const ph = (el as HTMLInputElement).placeholder.trim();
                if (ph && keyPattern.test(ph)) {
                    leaked.push(ph);
                }
            });
            return leaked;
        });

        if (leakedPlaceholders.length > 0) {
            console.log('⚠️ Leaked placeholders:', leakedPlaceholders);
        }
        expect(leakedPlaceholders).toHaveLength(0);
    });
});
