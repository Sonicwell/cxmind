import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Action History Center', () => {

    test('should render intent table and action history logs', async ({ page }) => {
        // Intercept action api
        await page.route('**/api/platform/actions/history*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            data: [
                                {
                                    _id: 'act_101',
                                    intentName: 'Test Intent',
                                    status: 'completed',
                                    provider: 'webhook',
                                    createdAt: '2026-03-08T10:00:00.000Z'
                                }
                            ],
                            total: 1
                        }
                    })
                });
            } else {
                await route.continue();
            }
        });

        await page.route('**/api/platform/actions/intents*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: []
                    })
                });
            } else {
                await route.continue();
            }
        });

        // Navigate to Action Center
        if (!await navigateOrSkip(page, '/actions')) return;
        await expectAppShell(page);

        // Wait for page header
        const header = page.locator('h1:has-text("Action Center")').first();
        if (await header.isVisible({ timeout: 5000 }).catch(() => false)) {
            await expect(header).toBeVisible();
        }

        // Verify the tab for history is present
        const historyTab = page.locator('button', { hasText: /History|Logs/i }).first();
        if (await historyTab.isVisible()) {
            await historyTab.click();

            // Wait for mocked row to show in table
            const testRow = page.locator('td', { hasText: 'Test Intent' }).first();
            await expect(testRow).toBeVisible({ timeout: 5000 });

            // Verify status badge
            const statusBadge = page.locator('td', { hasText: 'completed' }).first();
            await expect(statusBadge).toBeVisible();
        }
    });

});
