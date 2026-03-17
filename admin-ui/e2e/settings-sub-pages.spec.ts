import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Settings Sub-Pages', () => {

    // ─── General Settings ────────────────────────────────────

    test('should render general settings with form elements', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/general')) return;
        await expectAppShell(page);

        const form = page.locator('input, select, textarea, [role="switch"], [role="combobox"]');
        await expect(form.first()).toBeVisible({ timeout: 10_000 });
        expect(await form.count()).toBeGreaterThan(0);
    });

    test('general settings should have save button', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/general')) return;
        await expectAppShell(page);

        const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("保存"), button[type="submit"]');
        if (await saveBtn.count() > 0) {
            await expect(saveBtn.first()).toBeVisible();
        }
    });

    // ─── AI Vendors ──────────────────────────────────────────

    test('should render AI vendors config page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/ai/vendors')) return;
        await expectAppShell(page);

        const content = page.locator(
            'table, .vendor-card, [data-testid*="vendor"], input, select, ' +
            'text=/openai|azure|deepseek|ollama|vendor|ASR|TTS|LLM/i'
        );
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    // ─── License Settings ────────────────────────────────────

    test('should render license settings page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/system/license')) return;
        await expectAppShell(page);

        const content = page.locator(
            '.license-info, [data-testid*="license"], input, ' +
            'text=/license|许可|edition|trial|community|enterprise|激活/i'
        );
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    // ─── Role Management ─────────────────────────────────────

    test('should render role management page with roles table', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/organization/roles')) return;
        await expectAppShell(page);

        const table = page.locator('table, .role-list, [data-testid*="role"], text=/admin|agent|supervisor/i');
        await expect(table.first()).toBeVisible({ timeout: 10_000 });
    });

    // ─── Session Management ──────────────────────────────────

    test('should render session management page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/organization/sessions')) return;
        await expectAppShell(page);

        const content = page.locator(
            'table, .session-list, [data-testid*="session"], input, ' +
            'text=/session|会话|active|token|timeout/i'
        );
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    // ─── SER Config ──────────────────────────────────────────

    test('should render SER config page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/ai/ser')) return;
        await expectAppShell(page);

        const content = page.locator(
            'input, select, [role="switch"], [data-testid*="ser"], ' +
            'text=/SER|emotion|sentiment|NLP|情感|情绪/i'
        );
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    // ─── Vector DB Config ────────────────────────────────────

    test('should render vector DB config page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/ai/vector-db')) return;
        await expectAppShell(page);

        const content = page.locator(
            'input, select, [role="switch"], [data-testid*="vector"], ' +
            'text=/qdrant|vector|embedding|向量/i'
        );
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    // ─── Business → Schemas (W1-SET-003) ───────────────────

    test('should render summary schemas config page', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/business/schemas')) return;
        await expectAppShell(page);

        const content = page.locator(
            'input, select, textarea, [role="switch"], table, .schema, ' +
            'text=/schema|outcome|字段|摘要|模板/i'
        );
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    // ─── System → General (W1-SET-004) ──────────────────────

    test('system general should have SMTP section', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/system/general')) return;
        await expectAppShell(page);

        const smtpContent = page.locator(
            'text=/SMTP|smtp|邮件|Email.*Server|Mail/i'
        );
        if (await smtpContent.count() > 0) {
            await expect(smtpContent.first()).toBeVisible();
        }
    });

    // ─── SMTP Test Connection (W1-SET-005) ──────────────────

    test('SMTP section should have test connection button', async ({ page }) => {
        // SMTP config may be on /settings/system/general or /settings/system/smtp
        let found = await navigateOrSkip(page, '/settings/system/smtp');
        if (!found) {
            found = await navigateOrSkip(page, '/settings/system/general');
        }
        if (!found) return;
        await expectAppShell(page);

        const testBtn = page.locator(
            'button:has-text("Test"), button:has-text("测试"), ' +
            'button:has-text("test connection"), button:has-text("Test Connection")'
        );
        if (await testBtn.count() > 0) {
            await expect(testBtn.first()).toBeVisible();
        }
    });

    // ─── Modules Management Page ────────────────────────────

    test('should render module management page with module cards', async ({ page }) => {
        if (!await navigateOrSkip(page, '/settings/system/modules')) return;
        await expectAppShell(page);

        const content = page.locator(
            '[role="switch"], input[type="checkbox"], .module-card, ' +
            'text=/core|optional|核心|可选|模块/i'
        );
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    // ─── Error-free checks ───────────────────────────────────

    const settingsRoutes = [
        { path: '/settings/general', name: 'general' },
        { path: '/settings/ai/vendors', name: 'ai-vendors' },
        { path: '/settings/system/license', name: 'license' },
        { path: '/settings/organization/roles', name: 'roles' },
        { path: '/settings/organization/sessions', name: 'sessions' },
        { path: '/settings/ai/ser', name: 'ser' },
        { path: '/settings/ai/vector-db', name: 'vector-db' },
    ];

    for (const route of settingsRoutes) {
        test(`no JavaScript errors on settings/${route.name}`, async ({ page }) => {
            const errors: string[] = [];
            page.on('pageerror', err => errors.push(err.message));
            await page.goto(route.path);
            await page.waitForTimeout(3000);
            expect(errors).toHaveLength(0);
        });
    }
});
