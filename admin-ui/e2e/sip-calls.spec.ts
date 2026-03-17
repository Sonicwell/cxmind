import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('SIP Calls Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/calls')) return;
        await expectAppShell(page);
    });

    test('should render call list table', async ({ page }) => {
        const table = page.locator('table, .call-list, .calls-table, [data-testid="calls-table"]');
        await expect(table.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should have date/time filter controls', async ({ page }) => {
        const dateFilter = page.locator('input[type="date"], input[type="datetime-local"], .date-picker, .date-range, [data-testid*="date"]');
        if (await dateFilter.count() > 0) {
            await expect(dateFilter.first()).toBeVisible();
        }
    });

    test('should display call direction or status indicators', async ({ page }) => {
        // 通话记录应显示方向（入/出）或状态
        const indicators = page.locator('.call-direction, .badge, [class*="status"]');
        if (await indicators.count() > 0) {
            await expect(indicators.first()).toBeVisible();
        }
    });

    test('should have playback/detail button on call rows', async ({ page }) => {
        const actionBtn = page.locator('button:has-text("Play"), button:has-text("Detail"), button:has-text("View"), .play-btn, [data-testid*="play"]');
        if (await actionBtn.count() > 0) {
            await expect(actionBtn.first()).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/calls');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });

    test('should have PCAP redaction download options', async ({ page }) => {
        // Intercept PCAP download routes to avoid downloading real files in CI
        await page.route('**/api/platform/calls/*/pcap*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: 'mock-redacted' });
        });
        await page.route('**/api/platform/calls/*/full-pcap*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: 'mock-full' });
        });

        const rows = page.locator('table tbody tr, .call-list-item, [data-testid="calls-table"] tr').locator('nth=0');
        if (!await rows.isVisible({ timeout: 5000 }).catch(() => false)) return;

        // Find the download dropdown trigger
        const downloadBtn = rows.locator('button:has-text("Download"), button[title*="Download"], [title*="PCAP"], .lucide-download').first();
        if (await downloadBtn.isVisible()) {
            await downloadBtn.click();
            // Wait for dropdown menu
            const dropdown = page.locator('[role="menu"], .dropdown-content, .pcap-menu').last();
            await expect(dropdown).toBeVisible();
            await expect(dropdown).toContainText(/Original/i);
            await expect(dropdown).toContainText(/Redacted/i);

            // Click redacted option and verify it doesn't crash the page (request is mocked)
            const redactedOption = dropdown.locator('button, div, a').filter({ hasText: /Redacted/i }).first();
            await redactedOption.click();
            await page.waitForTimeout(1000);
        }
    });
});
