import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('CRM Webhooks Management', () => {

    test('renders webhook list and add webhook modal', async ({ page }) => {
        // Intercept API calls to prevent DB pollution
        await page.route('**/api/platform/webhooks*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: [
                            {
                                id: 'wh-123',
                                name: 'Test Salesforce CRM',
                                url: 'https://test.salesforce.com/services/apexrest/cxmi',
                                type: 'salesforce',
                                enabled: true,
                                events: ['call_create', 'call_hangup']
                            }
                        ]
                    })
                });
            } else if (route.request().method() === 'POST') {
                // Mock create response
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { id: 'wh-new', success: true } })
                });
            } else {
                await route.continue();
            }
        });

        // Navigate to webhooks page
        if (!await navigateOrSkip(page, '/webhooks')) return;
        await expectAppShell(page);

        // Verify existing list (mocked above) is rendered
        // The webhook list might be rendered as cards or custom divs instead of a strict <table>.
        const webhookCard = page.locator('text=Test Salesforce CRM').first();
        await expect(webhookCard).toBeVisible({ timeout: 10_000 });

        // Find "Add Webhook" or "Create" button
        const addBtn = page.locator('button', { hasText: /Add Webhook|Create|New|添加/i }).first();
        if (await addBtn.isVisible()) {
            await addBtn.click();

            // Wait for Inline Form Instead of Modal
            const formContainer = page.locator('.wh-form, form').last();
            await expect(formContainer).toBeVisible({ timeout: 5000 });

            // Locate Form Elements
            const nameInput = formContainer.locator('input[placeholder*="Name" i], input').first();
            await expect(nameInput).toBeVisible();
            await nameInput.fill('E2E Test Endpoint');

            const urlInput = formContainer.locator('input[placeholder*="https://" i], input[type="url"]').first();
            await expect(urlInput).toBeVisible();
            await urlInput.fill('https://example.com/webhook');

            // Find save/submit
            const saveBtn = formContainer.locator('button', { hasText: /Save|Confirm|Submit|保存/i }).first();
            if (await saveBtn.isVisible()) {
                await saveBtn.click();
                await expect(formContainer).toBeHidden({ timeout: 5000 });
            }
        }
    });

});
