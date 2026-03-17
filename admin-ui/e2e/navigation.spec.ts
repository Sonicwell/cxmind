import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Navigation & Dashboard', () => {
    test('sidebar is visible after login', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);
    });

    test('dashboard renders content', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;
        // 侧栏 + 下方至少有一个子元素
        await expectAppShell(page);
        expect(await page.locator('#root > *').count()).toBeGreaterThan(0);
    });
});
