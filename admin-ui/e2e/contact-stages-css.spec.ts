import { test, expect } from '@playwright/test';

test.describe('Contact Stages Modal UI', () => {
    test('modal should have a solid background and not be transparent due to invalid CSS rules', async ({ page }) => {
        await page.goto('/settings/business/stages');
        const addStageBtn = page.getByRole('button', { name: /Add Stage/i });
        await expect(addStageBtn).toBeVisible();
        await addStageBtn.click();
        const modal = page.locator('.glass-modal-card').first();
        await expect(modal.getByRole('heading', { name: /Create Contact Stage/i })).toBeVisible();
        const modalCard = page.locator('.glass-modal-card').first();
        await expect(modalCard).toBeVisible();
        const bgColor = await modalCard.evaluate((el) => window.getComputedStyle(el).backgroundColor);
        expect(bgColor, 'Modal background should not be transparent. It indicates broken/missing CSS classes.').not.toBe('rgba(0, 0, 0, 0)');
    });

    test('modal color buttons should not be vertically squashed by broken flex layout', async ({ page }) => {
        await page.goto('/settings/business/stages');
        const addStageBtn = page.getByRole('button', { name: /Add Stage/i });
        await expect(addStageBtn).toBeVisible();
        await addStageBtn.click();

        const modal = page.locator('.glass-modal-card').first();
        await expect(modal.getByRole('heading', { name: /Create Contact Stage/i })).toBeVisible();

        const badgeColorLabel = modal.getByText('Badge Color');
        await expect(badgeColorLabel).toBeVisible();

        const badgeColorDiv = badgeColorLabel.locator('..');
        const colorButtons = badgeColorDiv.locator('button[type="button"]');

        await expect(colorButtons).toHaveCount(22);

        // 1) Assert size: buttons must be at least 36px tall/wide (Tailwind w-10 h-10 = 40px)
        const buttonBox = await colorButtons.first().boundingBox();
        expect(buttonBox).not.toBeNull();

        expect(
            buttonBox!.height,
            `Button height collapsed to ${buttonBox!.height}px, should be ~40px.`
        ).toBeGreaterThanOrEqual(36);

        expect(
            buttonBox!.width,
            `Button width collapsed to ${buttonBox!.width}px, should be ~40px.`
        ).toBeGreaterThanOrEqual(36);

        // 2) Assert aspect ratio: must be a perfect circle
        const aspectDiff = Math.abs(buttonBox!.height - buttonBox!.width);
        expect(
            aspectDiff,
            `Button should be round (diff=${aspectDiff}), flex box collision detected.`
        ).toBeLessThanOrEqual(2);
    });

    test('color buttons should display actual colors, not fallback gray', async ({ page }) => {
        await page.goto('/settings/business/stages');
        const addStageBtn = page.getByRole('button', { name: /Add Stage/i });
        await expect(addStageBtn).toBeVisible();
        await addStageBtn.click();

        const modal = page.locator('.glass-modal-card').first();
        await expect(modal.getByRole('heading', { name: /Create Contact Stage/i })).toBeVisible();

        const badgeColorLabel = modal.getByText('Badge Color');
        const badgeColorDiv = badgeColorLabel.locator('..');
        const colorButtons = badgeColorDiv.locator('button[type="button"]');
        await expect(colorButtons).toHaveCount(22);

        // The gray fallback color #94a3b8 = rgb(148, 163, 184).
        // If ALL buttons degrade to this exact same gray, it proves CSS vars are missing.
        // We sample the first 5 buttons (slate/gray/zinc/neutral/stone are gray-ish but have DIFFERENT hex values,
        // and button 6+ like red/orange are obviously different).
        // The key assertion: not all buttons should have the SAME computed backgroundColor.
        const colors: string[] = [];
        for (let i = 0; i < Math.min(await colorButtons.count(), 8); i++) {
            const innerDiv = colorButtons.nth(i).locator('div').first();
            const bgColor = await innerDiv.evaluate(el => window.getComputedStyle(el).backgroundColor);
            colors.push(bgColor);
        }

        // All 8 buttons should NOT have the same color (which would mean fallback gray everywhere)
        const uniqueColors = new Set(colors);
        expect(
            uniqueColors.size,
            `Expected multiple distinct colors among the first 8 buttons, but found only ${uniqueColors.size}: [${[...uniqueColors].join(', ')}]. This indicates CSS color variables are missing and all buttons fell back to the same gray.`
        ).toBeGreaterThan(1);

        // Specifically, button index 5 (Red, #ef4444) should NOT be the fallback gray
        const redButtonInnerDiv = colorButtons.nth(5).locator('div').first();
        const redBgColor = await redButtonInnerDiv.evaluate(el => window.getComputedStyle(el).backgroundColor);
        expect(
            redBgColor,
            `The "Red" color button (index 5) rendered as fallback gray instead of red.`
        ).not.toBe('rgb(148, 163, 184)');
    });
});
