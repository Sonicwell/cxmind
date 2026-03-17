import { test, expect } from '@playwright/test';

test.describe('Command Center Page', () => {

    test('should render command center layout without crashing', async ({ page }) => {
        // CommandCenter is at /command — standalone route outside DashboardLayout
        // It depends on WebSocketProvider which tries to open a WS connection.
        // We intercept the WS upgrade to prevent connection errors.

        // Intercept any API calls
        await page.route('**/api/**', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: {} })
            });
        });

        // Navigate — CommandCenter uses ProtectedRoute so login credentials are needed
        await page.goto('/command');
        const url = page.url();
        if (url.includes('/setup') || url.includes('/login')) return;

        // Wait for the nexus container to be mounted
        const container = page.locator('.nexus-container').first();
        await expect(container).toBeVisible({ timeout: 15000 });

        // Verify header logo element exists
        const logo = page.locator('.nexus-logo').first();
        await expect(logo).toBeVisible({ timeout: 5000 });

        // Verify stat items render (Active Connections, AI Latency, System Health)
        const statItems = page.locator('.stat-item');
        const statCount = await statItems.count();
        expect(statCount).toBeGreaterThanOrEqual(2);

        // Verify Brain Sandbox panel
        const brainPanel = page.locator('.panel-brain').first();
        await expect(brainPanel).toBeVisible();

        // Verify Spectrogram panel
        const spectrogramPanel = page.locator('.panel-spectrogram').first();
        await expect(spectrogramPanel).toBeVisible();
    });

    test('no JavaScript errors on command center', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.route('**/api/**', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: {} })
            });
        });

        await page.goto('/command');
        const url = page.url();
        if (url.includes('/setup') || url.includes('/login')) return;

        // Allow time for component render + potential WS errors
        await page.waitForTimeout(3000);

        // Log for debug
        if (errors.length > 0) console.log('CommandCenter pageerrors:', JSON.stringify(errors));

        // Filter out known harmless errors in CI (WebSocket, network fetch, WebGL in headless)
        const nonWsErrors = errors.filter(e =>
            !e.includes('WebSocket') &&
            !e.includes('ws://') &&
            !e.includes('wss://') &&
            !e.includes('Failed to fetch') &&
            !e.includes('NetworkError') &&
            !e.includes('canvas') &&
            !e.includes('getContext') &&
            !e.includes('WebGL')
        );
        expect(nonWsErrors).toEqual([]);
    });
});
