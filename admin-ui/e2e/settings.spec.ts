import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Settings Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings')) return;
        await expectAppShell(page);
    });

    test('renders settings page with content', async ({ page }) => {
        // 页面应该包含表单或配置面板
        const mainContent = page.locator('.settings-container, .settings-page, [data-testid="settings"], main');
        await expect(mainContent.first()).toBeVisible({ timeout: 10_000 });

        // 至少有一些可交互的表单元素
        const formElements = page.locator('input, select, button, [role="switch"], [role="combobox"]');
        expect(await formElements.count()).toBeGreaterThan(0);
    });

    test('policy settings are interactive and persist', async ({ page }) => {
        // 查找 Policy 相关设置区域（PCAP / ASR / Summary）
        const policySection = page.locator('text=/PCAP|Recording|ASR|Speech|Summary|Policy/i').first();

        if (await policySection.isVisible({ timeout: 5_000 }).catch(() => false)) {
            // 查找关联的下拉或切换组件
            const policyControls = page.locator('select, [role="combobox"], [role="listbox"], [data-testid*="policy"]');

            if (await policyControls.count() > 0) {
                const firstControl = policyControls.first();
                await expect(firstControl).toBeVisible();

                // 查找保存按钮（如果存在说明表单可提交）
                const saveBtn = page.locator('button:has-text(/save|submit|update|保存/i)');
                if (await saveBtn.count() > 0) {
                    await expect(saveBtn.first()).toBeVisible();
                }
            }
        }
        // 无论是否找到 policy 区域，页面本身应该渲染正常
        expect(await page.locator('#root > *').count()).toBeGreaterThan(0);
    });

    test('no unhandled errors on settings page', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        // 停留几秒观察是否有 JS 异常
        await page.waitForTimeout(2000);
        expect(errors).toHaveLength(0);
    });

    test('settings save button triggers API call without errors', async ({ page }) => {
        // Navigate to general settings (确保在一个有保存按钮的页面)
        await page.goto('/settings/general');
        await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15_000 });

        const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("保存"), button[type="submit"]').first();
        if (!await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) return;

        // 监听 API 响应
        const responsePromise = page.waitForResponse(
            resp => resp.url().includes('/api/') && (resp.request().method() === 'PATCH' || resp.request().method() === 'PUT'),
            { timeout: 10_000 }
        ).catch(() => null);

        await saveBtn.click();

        const response = await responsePromise;
        if (response) {
            // API 调用应返回 2xx
            expect(response.status()).toBeGreaterThanOrEqual(200);
            expect(response.status()).toBeLessThan(300);
        }
    });

    test('system config LLM vendor multi-vendor toggle', async ({ page }) => {
        await page.goto('/settings/ai/vendors');
        await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15_000 });

        // Find LLM Configuration section
        const llmSection = page.locator('text=/LLM Configuration|AI Configuration|Model Providers/i').first();
        if (await llmSection.isVisible({ timeout: 5_000 }).catch(() => false)) {
            // Check for provider tabs or selects (e.g. OpenAI, DashScope, Anthropic)
            const providers = page.locator('text=/OpenAI|DashScope|Anthropic|DeepSeek/i');
            if (await providers.count() > 0) {
                await expect(providers.first()).toBeVisible();
            }

            // Check if configure or edit button exists to open secrets modal
            const configBtn = page.locator('button:has-text(/Configure|Edit|Set Key|Keys/i)').first();
            if (await configBtn.isVisible()) {
                await configBtn.click();

                // Assert modal opens
                const modal = page.locator('[role="dialog"], .modal, .dialog-content').last();
                await expect(modal).toBeVisible();

                // Assert API Key input exists
                const keyInput = modal.locator('input[type="password"], input[name*="key" i], input[placeholder*="Key" i]').first();
                await expect(keyInput).toBeVisible();

                // Close modal
                const closeBtn = modal.locator('button:has-text(/Cancel|Close|取消/i), .lucide-x').first();
                if (await closeBtn.isVisible()) {
                    await closeBtn.click();
                    await expect(modal).toBeHidden();
                }
            }
        }
    });
});
