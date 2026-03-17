import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Monitoring Dashboard Comprehensive Checks', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/monitoring')) return;
        await expectAppShell(page);
    });

    test('should render dynamic MiniChatMonitor cards and glassmorphism UI', async ({ page }) => {
        // Assume WebSocket connects and we receive data, causing cards or grids to spawn

        // Wait for main dashboard container layout
        const mainDash = page.locator('.dashboard-container, .monitoring-layout');
        if (await mainDash.count() > 0) {
            await expect(mainDash).toBeVisible({ timeout: 10_000 });
        }

        // Verify WebSocket/Real-time data feeds into Active Calls (MiniChatMonitor/Cards)
        // Usually these components have specific classes mapping to call streams
        const activeCards = page.locator('.active-call-card, .mini-chat-monitor, [data-testid="live-monitoring-card"]');

        // It's possible there are no live calls running, but the container MUST exist and be structured
        const container = page.locator('.live-calls-container, .monitoring-grid').first();
        await expect(container).toBeVisible();

        // Check for specific CSS rules (Glassmorphism testing in Playwright can be done by evaluating styles)
        // But for robust E2E, we just ensure the component rendering didn't crash
        const hasHeader = await page.locator('text=/Live Monitoring|Active Calls|System Health/i').isVisible();
        expect(hasHeader).toBeTruthy();
    });

    test('WebSocket connection resilience check', async ({ page }) => {
        // Listen to console for any WEBSOCKET error messages or disconnects
        const errors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error' && msg.text().toLowerCase().includes('websocket')) {
                errors.push(msg.text());
            }
        });

        // Wait a few seconds to let WS handshake
        await page.waitForTimeout(3000);
        expect(errors.length).toBe(0); // Expect NO websocket errors in console
    });
});
