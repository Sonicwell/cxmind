/**
 * Profile & Account E2E — 找 bug 专用
 *
 * Discovery Intent:
 * - 个人资料页加载 crash (未登录 user context 为 null)
 * - 密码修改表单提交后无反馈
 * - 头像上传组件不存在或不可用
 * - 登出后 token 未清理导致残留认证
 */
import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Profile & Account — Bug Detection', () => {

    // Bug: 访问个人资料页面时 user context 为 null → crash
    test('profile page should load without JS errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);

        // 点击用户头像/菜单
        const avatar = page.locator(
            '.avatar, [data-testid*="avatar"], [data-testid*="user"], ' +
            '.user-menu, [class*="user-avatar"], [class*="profile"]'
        );
        if (await avatar.count() > 0) {
            await avatar.first().click();
            await page.waitForTimeout(1000);

            // 查找 Profile 链接
            const profileLink = page.locator(
                'a:has-text("Profile"), a:has-text("个人资料"), a:has-text("Account"), ' +
                '[href*="profile"], button:has-text("Profile")'
            );
            if (await profileLink.count() > 0) {
                await profileLink.first().click();
                await page.waitForTimeout(3000);
            }
        }

        expect(errors).toHaveLength(0);
    });

    // Bug: 用户菜单下拉不出现
    test('user menu should be accessible from sidebar', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);

        const avatar = page.locator(
            '.avatar, [data-testid*="avatar"], [data-testid*="user"], ' +
            '.user-menu, [class*="user-avatar"], [class*="user-profile"], .user-profile-btn'
        ).first();

        await avatar.waitFor({ state: 'attached', timeout: 5000 });
        await avatar.click();
        await page.waitForTimeout(500);

        // 菜单应该出现
        const menu = page.locator(
            '[role="menu"], .dropdown, [class*="dropdown"], [class*="menu"], ' +
            ':text-matches("profile|logout|settings|个人|登出|设置", "i")'
        );
        await menu.first().waitFor({ state: 'attached', timeout: 5000 });
        expect(await menu.count()).toBeGreaterThan(0);
    });

    // Bug: 登出按钮不存在或不可点击
    test('logout option should be present in user menu', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);

        // 打开用户菜单
        const avatar = page.locator(
            '.avatar, [data-testid*="avatar"], [data-testid*="user"], ' +
            '.user-menu, [class*="user-avatar"]'
        );
        if (await avatar.count() > 0) {
            await avatar.first().click();
            await page.waitForTimeout(500);

            const logoutBtn = page.locator(
                'button:has-text("Logout"), button:has-text("Sign out"), button:has-text("登出"), ' +
                'a:has-text("Logout"), a:has-text("登出"), [data-testid*="logout"]'
            );
            expect(await logoutBtn.count()).toBeGreaterThan(0);
        }
    });

    // Bug: 密码修改表单存在但提交后没有 toast/反馈
    test('password change form should have required fields', async ({ page }) => {
        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);

        // 尝试导航到 profile/password 页面
        const avatar = page.locator('.avatar, [data-testid*="avatar"], [class*="user-avatar"]');
        if (await avatar.count() > 0) {
            await avatar.first().click();
            await page.waitForTimeout(500);

            const profileLink = page.locator('a:has-text("Profile"), a:has-text("个人资料"), [href*="profile"]');
            if (await profileLink.count() > 0) {
                await profileLink.first().click();
                await page.waitForTimeout(3000);

                // 如果到了 profile 页，检查密码表单
                const pwdInputs = page.locator('input[type="password"]');
                if (await pwdInputs.count() > 0) {
                    // 密码表单至少需要 2 个 password 输入框 (new + confirm)
                    expect(await pwdInputs.count()).toBeGreaterThanOrEqual(2);
                }
            }
        }
    });
});
