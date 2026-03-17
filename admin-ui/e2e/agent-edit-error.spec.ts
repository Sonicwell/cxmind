import { test, expect } from '@playwright/test';

/**
 * TDD: Catch duplicate-SIP error display and stale error state bugs.
 */
test.describe('Agent Edit - Duplicate SIP Error', () => {

    test('should display the specific duplicate SIP number in the error message', async ({ page }) => {
        await page.goto('/agents');
        await page.waitForLoadState('networkidle');

        const agentRows = page.locator('tbody tr');
        await expect(agentRows.first()).toBeVisible({ timeout: 10000 });
        const rowCount = await agentRows.count();
        test.skip(rowCount < 3, 'Need at least 3 agents');

        let sourceRowIdx = -1;
        let targetSip = '';
        for (let i = 0; i < rowCount - 1; i++) {
            const sipA = (await agentRows.nth(i).locator('td').nth(2).innerText()).replace(/[^\w\-]/g, '').trim();
            const sipB = (await agentRows.nth(i + 1).locator('td').nth(2).innerText()).replace(/[^\w\-]/g, '').trim();
            if (sipA !== sipB) { sourceRowIdx = i; targetSip = sipB; break; }
        }
        test.skip(sourceRowIdx === -1, 'No adjacent agents with different SIPs');

        const editBtn = agentRows.nth(sourceRowIdx).locator('td').last().locator('button').first();
        await editBtn.click();

        const modal = page.locator('.glass-modal-card').first();
        await expect(modal).toBeVisible({ timeout: 5000 });

        const sipInput = modal.locator('input').first();
        await sipInput.clear();
        await sipInput.fill(targetSip);

        modal.locator('button').filter({ hasText: /Save|保存/ }).first().click();
        await page.waitForTimeout(3000);

        const modalText = await modal.innerText();
        expect(modalText).toContain(targetSip);
        expect(modalText).not.toContain('Failed to update agent');
    });

    test('error message should be cleared when reopening the modal', async ({ page }) => {
        await page.goto('/agents');
        await page.waitForLoadState('networkidle');

        const agentRows = page.locator('tbody tr');
        await expect(agentRows.first()).toBeVisible({ timeout: 10000 });
        const rowCount = await agentRows.count();
        test.skip(rowCount < 3, 'Need at least 3 agents');

        let sourceRowIdx = -1;
        let targetSip = '';
        for (let i = 0; i < rowCount - 1; i++) {
            const sipA = (await agentRows.nth(i).locator('td').nth(2).innerText()).replace(/[^\w\-]/g, '').trim();
            const sipB = (await agentRows.nth(i + 1).locator('td').nth(2).innerText()).replace(/[^\w\-]/g, '').trim();
            if (sipA !== sipB) { sourceRowIdx = i; targetSip = sipB; break; }
        }
        test.skip(sourceRowIdx === -1, 'No adjacent agents with different SIPs');

        // Step 1: Open edit modal and trigger duplicate error
        await agentRows.nth(sourceRowIdx).locator('td').last().locator('button').first().click();

        let modal = page.locator('.glass-modal-card').first();
        await expect(modal).toBeVisible({ timeout: 5000 });

        const sipInput = modal.locator('input').first();
        await sipInput.clear();
        await sipInput.fill(targetSip);

        modal.locator('button').filter({ hasText: /Save|保存/ }).first().click();
        await page.waitForTimeout(2000);

        // Confirm error is present
        expect(await modal.innerText()).toContain(targetSip);

        // Step 2: Close modal via the X button (top-right close button avoids DirtyModal confirm)
        const closeBtn = modal.locator('button[aria-label="Close"], button:has(svg.lucide-x)').first();
        await closeBtn.click();

        // If DirtyModal confirmation appears, click "Discard"
        const discardBtn = page.locator('button').filter({ hasText: /Discard|放弃|确认/ });
        if (await discardBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await discardBtn.first().click();
        }

        await page.waitForTimeout(500);

        // Step 3: Reopen the same edit modal
        await agentRows.nth(sourceRowIdx).locator('td').last().locator('button').first().click();

        modal = page.locator('.glass-modal-card').first();
        await expect(modal).toBeVisible({ timeout: 5000 });

        // KEY ASSERTION: The stale error message must NOT be visible
        const freshText = await modal.innerText();
        expect(
            freshText,
            `Stale error "${targetSip}" from previous session should have been cleared`
        ).not.toContain(targetSip);
    });
});
