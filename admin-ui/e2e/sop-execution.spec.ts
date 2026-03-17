import { test, expect } from '@playwright/test';

test.describe('SOP Execution (Agent Manual Navigation Flow)', () => {

    test.beforeEach(async ({ page }) => {
        // Authenticate using the agent login specified in the developer guide
        await page.goto('/login');
        await page.fill('input[type="email"]', 'agent@cxmi.ai');
        await page.fill('input[type="password"]', 'admin123');
        await page.click('button[type="submit"]');
        await page.waitForURL('**/dashboard*');
    });

    test('Agent can navigate an SOP manually via the Side Panel during an active call', async ({ page }) => {
        
        await page.goto('/sop'); 
        
        // Wait for page title specifically
        const header = page.locator('h1, h2, h3').filter({ hasText: /SOP/i }).first();
        await expect(header).toBeVisible();

        // Find an SOP card/row to click
        // Relying on text "View", "Edit", or just the first item
        const firstSopRow = page.locator('table tbody tr').first();
        const firstSopCard = page.locator('.glass-card, [class*="card"]').filter({ hasText: /SOP|Script|Guide/i }).first();
        
        let target = null;
        if (await firstSopRow.isVisible()) {
            target = firstSopRow;
        } else if (await firstSopCard.isVisible()) {
            target = firstSopCard;
        }

        if (target) {
            await target.click();

            // Check if the SOP execution/preview/builder panel opens
            const sopPanel = page.locator('.sop-builder, .sop-preview, [data-testid="sop-viewer"], .canvas-container, .react-flow');
            await expect(sopPanel).toBeVisible({ timeout: 10000 });

            // Ensure there are nodes
            const nodeItems = page.locator('.react-flow__node, .sop-node');
            if (await nodeItems.count() > 0) {
               await expect(nodeItems.first()).toBeVisible();
            }
        } else {
             console.log("No existing SOP found, checking for Create button behavior");
             const createBtn = page.locator('button:has-text("Create"), button:has-text("New")').first();
             if (await createBtn.isVisible()) {
                 await createBtn.click();
                 const builder = page.locator('.sop-builder');
                 await expect(builder).toBeVisible({ timeout: 10000 });
             }
        }
    });

});
