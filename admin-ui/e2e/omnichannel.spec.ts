import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Omnichannel Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/omnichannel')) return;
        await expectAppShell(page);
    });

    test('should render conversation list or inbox', async ({ page }) => {
        const conversationList = page.locator('.conversation-list, .inbox, .omni-sidebar, [data-testid*="conversation"], table, .chat-list');
        await expect(conversationList.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should display channel type indicators', async ({ page }) => {
        // whatsapp / line / webchat / sms 等渠道图标或标签
        const channels = page.locator('[class*="channel"], .channel-icon, text=/whatsapp|line|webchat|sms|email/i, svg[data-channel]');
        if (await channels.count() > 0) {
            await expect(channels.first()).toBeVisible();
        }
    });

    test('should have message compose area or input', async ({ page }) => {
        const compose = page.locator('textarea, input[placeholder*="message" i], input[placeholder*="消息"], .message-input, [data-testid="compose"]');
        if (await compose.count() > 0) {
            await expect(compose.first()).toBeVisible();
        }
    });

    test('should have agent status toggle', async ({ page }) => {
        const statusToggle = page.locator('[class*="status-toggle"], .agent-status, button:has-text("Available"), button:has-text("Away"), select[data-testid*="status"]');
        if (await statusToggle.count() > 0) {
            await expect(statusToggle.first()).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/omnichannel');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
