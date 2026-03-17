import { test as setup, expect } from '@playwright/test';

/**
 * Agent role auth setup — agent@cxmi.ai
 * Saves auth state to e2e/.auth/agent.json
 */
setup('authenticate as agent', async ({ page }) => {
    await page.goto('/login');

    await page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').fill('agent@cxmi.ai');
    await page.locator('input[type="password"]').fill('admin123');

    if (await page.locator('#remember').isVisible()) {
        await page.locator('#remember').check();
    }

    await page.getByRole('button', { name: /sign in|log in|login|登录/i }).click();

    await page.waitForURL(/\/(dashboard|setup|calls|settings|inbox|conversations|contacts|knowledge|alerts|omnichannel|wfm)/, { timeout: 15000 });

    if (page.url().includes('/setup')) {
        await page.waitForLoadState('networkidle');
    }

    await page.waitForTimeout(1500);
    await page.context().storageState({ path: 'e2e/.auth/agent.json' });
});
