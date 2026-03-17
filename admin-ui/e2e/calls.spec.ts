import { test, expect } from '@playwright/test';

test.describe('Calls List & Detail Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Go to the calls page
        await page.goto('/calls');
    });

    test('should display recently generated synthetic calls', async ({ page }) => {
        // Wait for the grid or list container to load
        await expect(page.locator('.ag-theme-alpine, table, .grid')).toBeVisible({ timeout: 15_000 });
        
        // At least some rows should exist (since data-verifier just ran)
        const rowCount = await page.locator('.ag-row, tr, .card-row').count();
        expect(rowCount).toBeGreaterThan(0);
        
        // Ensure "Completed" tags or AI analysis badges are rendered
        const completedBadgeCount = await page.locator('text=/Completed|Analyzed/i').count();
        expect(completedBadgeCount).toBeGreaterThanOrEqual(1);
    });

    test('should render Call Detail View properly with AI and Audio components', async ({ page }) => {
        // Wait for list to load, then click the first row to enter details
        await page.locator('.ag-row, tr, .card-row').first().click();
        
        // Wait for detail view container
        await expect(page.locator('.call-detail-wrapper, .detail-container')).toBeVisible();

        // [Crucial UX Assertions]: Check for waveform container (wavesurfer.js)
        await expect(page.locator('#waveform, .waveform-container, canvas')).toBeVisible({ timeout: 10_000 });
        
        // [Crucial UX Assertions]: Check for AI glassmorphism emotion tags
        await expect(page.locator('.emotion-tag, .intent-card, .ai-summary')).toBeVisible();
    });
});
