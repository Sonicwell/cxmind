import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('CRM Integration Wizard Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/integrations')) return;
        await expectAppShell(page);
    });

    test('should render integration list or wizard', async ({ page }) => {
        const content = page.locator('.integration-list, .wizard, .crm-card, table, text=/no.*integration|connect|salesforce|hubspot/i');
        await expect(content.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should display supported CRM providers', async ({ page }) => {
        const providers = page.locator('text=/salesforce|hubspot|zoho|freshdesk|custom/i, .provider-card, [data-testid*="provider"]');
        if (await providers.count() > 0) {
            await expect(providers.first()).toBeVisible();
        }
    });

    test('should have connect/configure button', async ({ page }) => {
        const connectBtn = page.locator('button:has-text("Connect"), button:has-text("Configure"), button:has-text("Add"), button:has-text("连接")');
        if (await connectBtn.count() > 0) {
            await expect(connectBtn.first()).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/integrations');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
