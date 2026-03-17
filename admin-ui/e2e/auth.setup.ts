import { test as setup, expect } from '@playwright/test';

/**
 * Global auth setup — runs once before all specs.
 * Saves authenticated browser state to .auth/user.json
 * so other specs don't need to login individually.
 */
setup('authenticate', async ({ page }) => {
    await page.goto('/login');

    await page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').fill('admin@cxmi.ai');
    await page.locator('input[type="password"]').fill('admin123');

    // Check "Remember me" so the token is written to localStorage, otherwise it goes to sessionStorage
    // and Playwright's storageState doesn't persist sessionStorage.
    if (await page.locator('#remember').isVisible()) {
        await page.locator('#remember').check();
    }

    await page.getByRole('button', { name: /sign in|log in|login|登录/i }).click();

    // 等待登录成功，跳到 dashboard 或 setup wizard 等
    await page.waitForURL(/\/(dashboard|setup|calls|settings|inbox|conversations|contacts|knowledge|alerts|omnichannel|wfm)/, { timeout: 15000 });

    // 如果进入了 setup wizard，先完成它或至少等页面加载完
    if (page.url().includes('/setup')) {
        // setup wizard 可能有多步，这里等页面稳定即可
        await page.waitForLoadState('networkidle');
    }

    // 保存认证状态
    // 让出一点时间让系统把 token 之类的写进 localStorage
    await page.waitForTimeout(1500);
    await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
