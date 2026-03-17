import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Omnichannel Templates Page', () => {

    test('should render template list with mock data', async ({ page }) => {
        // OmnichannelTemplates fetches GET /api/templates
        await page.route('**/api/templates*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: [
                            {
                                _id: 'tpl-001',
                                name: 'Welcome Message',
                                category: 'greeting',
                                translations: [{ lang: 'en_US' }, { lang: 'zh_CN' }],
                                updatedAt: '2026-03-07T12:00:00.000Z'
                            },
                            {
                                _id: 'tpl-002',
                                name: 'Booking Confirmation',
                                category: 'transactional',
                                translations: [{ lang: 'en_US' }],
                                updatedAt: '2026-03-06T08:00:00.000Z'
                            }
                        ]
                    })
                });
            } else {
                await route.continue();
            }
        });

        if (!await navigateOrSkip(page, '/templates')) return;
        await expectAppShell(page);

        // Page title
        const title = page.locator('h1', { hasText: /Template/i }).first();
        await expect(title).toBeVisible({ timeout: 10000 });

        // Template cards should render
        const welcomeCard = page.locator('text=Welcome Message').first();
        await expect(welcomeCard).toBeVisible({ timeout: 5000 });

        const bookingCard = page.locator('text=Booking Confirmation').first();
        await expect(bookingCard).toBeVisible();

        // Category badge
        const greetingBadge = page.locator('text=greeting').first();
        await expect(greetingBadge).toBeVisible();

        // Create Template button
        const createBtn = page.locator('button', { hasText: /Create Template/i }).first();
        await expect(createBtn).toBeVisible();
    });

    test('should render empty state when no templates exist', async ({ page }) => {
        await page.route('**/api/templates*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: [] })
            });
        });

        if (!await navigateOrSkip(page, '/templates')) return;
        await expectAppShell(page);

        // Empty state message
        const emptyMsg = page.locator('text=No Templates Found').first();
        await expect(emptyMsg).toBeVisible({ timeout: 10000 });

        // CTA button in empty state
        const ctaBtn = page.locator('button', { hasText: /Create Your First Template/i }).first();
        await expect(ctaBtn).toBeVisible();
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.route('**/api/templates*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: [] })
            });
        });

        if (!await navigateOrSkip(page, '/templates')) return;
        await expectAppShell(page);
        await page.waitForTimeout(2000);
        expect(errors).toEqual([]);
    });
});
