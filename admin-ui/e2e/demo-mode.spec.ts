import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Global Demo Mode', () => {

    test('should prevent crash when toggling demo generation', async ({ page }) => {

        // Settings layout dependencies
        await page.route('**/api/platform/settings*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { uiTheme: 'light' } }) });
        });
        await page.route('**/api/platform/models*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { vendors: [] } }) });
        });

        // Intercept demo status
        await page.route('**/api/platform/demo/status', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: { enabled: false, lastGenerateTime: null } })
            });
        });

        await page.route('**/api/platform/stats*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: { totalCalls: 0 } })
            });
        });

        await page.route('**/api/users*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
        });

        await page.route('**/api/agents*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
        });

        // Mock generation API
        await page.route('**/api/platform/demo/generate', async route => {
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

        // Navigate to CXMind Demo
        await page.goto('/demo', { waitUntil: 'domcontentloaded' });

        // Wait for basic rendering of the Demo tab structure
        const headerText = page.locator('h1', { hasText: /Demo/i }).first();
        await expect(headerText).toBeVisible({ timeout: 15000 });

        // Check Demo layout components render
        const pageTitle = page.locator('h1', { hasText: /Demo/i }).first();
        if (await pageTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
            await expect(pageTitle).toBeVisible();
        }

        // Find generate button
        const generateBtn = page.locator('button', { hasText: /Populate|Generate|Mock/i }).first();
        if (await generateBtn.isVisible()) {
            await generateBtn.click();

            // Confirm Modal test (Strict component coverage)
            const confirmModal = page.locator('[role="dialog"], .dialog-content').first();
            if (await confirmModal.isVisible({ timeout: 3000 }).catch(() => false)) {
                // Click inner confirm
                const innerConfirm = confirmModal.locator('button', { hasText: /Confirm|Generate/i }).last();
                await expect(innerConfirm).toBeVisible();
                await innerConfirm.click();

                // Should disappear after mock returns
                await expect(confirmModal).toBeHidden({ timeout: 5000 });
            }
        }
    });

});
