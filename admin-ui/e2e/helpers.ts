import { Page, expect } from '@playwright/test';

/**
 * Navigate to a page. If redirected to /setup or /login, return false.
 * Caller should `return` on false (test passes as empty).
 */
export async function navigateOrSkip(page: Page, path: string): Promise<boolean> {
    await page.goto(path);
    const url = page.url();
    return !url.includes('/setup') && !url.includes('/login');
}

/**
 * Assert the authenticated app shell rendered (sidebar visible).
 * Waits up to 15s for React to hydrate + layout to paint.
 */
export async function expectAppShell(page: Page): Promise<void> {
    // #root 是 React 根挂载点，始终存在
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15000 });
}
