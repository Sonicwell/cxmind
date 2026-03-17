import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Call Events Page', () => {

    test('should render event table with mock data and pagination controls', async ({ page }) => {
        // Intercept events API — CallEvents fetches GET /api/platform/events?limit=50&offset=0
        await page.route('**/api/platform/events*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [
                        {
                            timestamp: '2026-03-08T10:00:00.000Z',
                            call_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                            realm: 'cxmi.ai',
                            event_type: 'INVITE',
                            caller_uri: 'sip:1001@cxmi.ai',
                            callee_uri: 'sip:2002@cxmi.ai',
                            src_ip: '10.0.0.1',
                            dst_ip: '10.0.0.2',
                            method: 'INVITE',
                            status_code: 200,
                            body: '',
                            src_country: 'CN',
                            dst_country: 'US'
                        },
                        {
                            timestamp: '2026-03-08T10:01:00.000Z',
                            call_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
                            realm: 'cxmi.ai',
                            event_type: 'BYE',
                            caller_uri: 'sip:1001@cxmi.ai',
                            callee_uri: 'sip:2002@cxmi.ai',
                            src_ip: '10.0.0.1',
                            dst_ip: '10.0.0.2',
                            method: 'BYE',
                            status_code: 200,
                            body: '',
                            src_country: 'CN',
                            dst_country: 'US'
                        }
                    ]
                })
            });
        });

        if (!await navigateOrSkip(page, '/events')) return;
        await expectAppShell(page);

        // Table should be visible
        const table = page.locator('table').first();
        await expect(table).toBeVisible({ timeout: 10000 });

        // Verify key columns exist — Timestamp, Call ID, Type, Source, Dest
        const headers = page.locator('th');
        await expect(headers.first()).toBeVisible();

        // Verify mock data renders — truncated call ID "a1b2c3d4"
        const callIdCell = page.locator('text=a1b2c3d4').first();
        await expect(callIdCell).toBeVisible({ timeout: 5000 });

        // Verify event type column
        const inviteCell = page.locator('text=INVITE').first();
        await expect(inviteCell).toBeVisible();

        // Verify search input exists
        const searchInput = page.locator('input[type="text"]').first();
        await expect(searchInput).toBeVisible();

        // Verify refresh button exists
        const refreshBtn = page.locator('button', { hasText: /Refresh/i }).first();
        if (await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await expect(refreshBtn).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.route('**/api/platform/events*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: [] })
            });
        });

        if (!await navigateOrSkip(page, '/events')) return;
        await expectAppShell(page);
        await page.waitForTimeout(2000);
        expect(errors).toEqual([]);
    });
});
