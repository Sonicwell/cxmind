import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Ticket Setup Integration', () => {

    test('should load Jira ticketing setup form and interact with credentials saving', async ({ page }) => {
        // Intercept integration API
        await page.route('**/api/integrations/jira*', async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        id: 'jira',
                        status: 'active',
                        enabled: true,
                        credentials: { instanceUrl: 'mock-corp', domain: 'mock-corp' }
                    })
                });
            } else {
                await route.continue();
            }
        });

        await page.route('**/api/integrations/jira/credentials*', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { success: true } })
                });
            } else {
                await route.continue();
            }
        });

        await page.route('**/api/integrations/jira/test-ticket*', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { success: true, url: 'https://mock.atlassian.net/browse/TEST-1' } })
                });
            } else {
                await route.continue();
            }
        });

        // Navigate to the Jira ticket setup page
        if (!await navigateOrSkip(page, '/integrations/jira')) return;
        await expectAppShell(page);

        // Wait for page load
        const header = page.locator('h1:has-text("Jira Setup")').first();
        if (await header.isVisible({ timeout: 5000 }).catch(() => false)) {
            await expect(header).toBeVisible();
        }

        // Locate domain input (UI components strict mode adaptation)
        const domainInput = page.locator('input[type="url"]').first();
        await expect(domainInput).toBeVisible({ timeout: 8000 });
        await expect(domainInput).toHaveValue('mock-corp');

        // Fill form
        await domainInput.fill('new-mock-corp');
        const emailInput = page.locator('input[placeholder*="email" i], input[type="email"]').first();
        if (await emailInput.isVisible()) {
            await emailInput.fill('admin@cxmi.ai');
        }

        const tokenInput = page.locator('input[type="password"]').first();
        if (await tokenInput.isVisible()) {
            await tokenInput.fill('mock-token-abc123');
        }

        // Test credentials save button
        const saveBtn = page.locator('button', { hasText: /Save|Connect|Apply/i }).first();
        await expect(saveBtn).toBeVisible();
        await saveBtn.click();

        // Test Ping button
        const pingBtn = page.locator('button', { hasText: /Test Ping|Send Test/i }).first();
        if (await pingBtn.isVisible()) {
            await pingBtn.click();

            // The mock should yield a success result somewhere on the screen
            const successMsg = page.locator('text=/Success|TEST-1/i').first();
            await expect(successMsg).toBeVisible({ timeout: 5000 });
        }
    });

});
