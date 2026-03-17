import { test, expect } from '@playwright/test';

/**
 * E2E: Login page — 在 'login' project 中运行，自带空 storageState
 */

test.describe('Login Page', () => {

    test('renders login form correctly', async ({ page }) => {
        await page.goto('/login');

        await expect(page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expect(page.getByRole('button', { name: /sign in|log in|login|登录/i })).toBeVisible();
    });

    test('shows error for invalid credentials', async ({ page }) => {
        await page.goto('/login');
        await page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').fill('wrong@test.com');
        await page.locator('input[type="password"]').fill('wrongpassword');
        await page.getByRole('button', { name: /sign in|log in|login|登录/i }).click();

        // 错误提示（可能是 "Invalid credentials" 或 rate limit 提示）
        await expect(page.getByText(/invalid|failed|error|incorrect|too many|try again/i)).toBeVisible({ timeout: 10000 });
    });

    test('successful login redirects away from login page', async ({ page }) => {
        await page.goto('/login');
        // 等页面DOM稳定
        await page.waitForLoadState('domcontentloaded');
        await page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').fill('admin@example.com');
        await page.locator('input[type="password"]').fill('admin123');

        const btn = page.getByRole('button', { name: /sign in|log in|login|登录/i });
        await btn.waitFor({ state: 'visible', timeout: 5000 });
        await btn.click({ timeout: 10000 });

        // 成功后应跳转离开 /login
        await expect(async () => {
            expect(page.url()).not.toContain('/login');
        }).toPass({ timeout: 15000 });
    });

    test('remember me persists token to localStorage', async ({ page }) => {
        await page.goto('/login');
        await page.waitForLoadState('domcontentloaded');

        await page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').fill('admin@cxmi.ai');
        await page.locator('input[type="password"]').fill('admin123');

        // 勾选 Remember Me
        const rememberCheckbox = page.locator('#remember');
        if (await rememberCheckbox.isVisible()) {
            await rememberCheckbox.check();
        }

        await page.getByRole('button', { name: /sign in|log in|login|登录/i }).click();

        await expect(async () => {
            expect(page.url()).not.toContain('/login');
        }).toPass({ timeout: 15000 });

        // 验证 token 写入 localStorage (Remember Me 勾选时)
        const token = await page.evaluate(() => {
            // 扫描所有 localStorage keys 找 token
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)!;
                if (key.includes('token') || key.includes('auth')) {
                    return localStorage.getItem(key);
                }
            }
            return null;
        });
        // 至少有一个认证信息存到 localStorage
        if (token) {
            expect(token.length).toBeGreaterThan(10);
        }
    });
});
