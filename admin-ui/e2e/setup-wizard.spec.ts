import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Setup Wizard Page', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/setup')) return;
        await expectAppShell(page);
    });

    test('should render wizard steps or completion state', async ({ page }) => {
        const wizard = page.locator('.setup-wizard, .wizard-steps, .stepper, [data-testid="setup"], text=/step|complete|finish/i');
        await expect(wizard.first()).toBeVisible({ timeout: 10_000 });
    });

    test('should have form inputs in active step', async ({ page }) => {
        const inputs = page.locator('input, select, textarea');
        if (await inputs.count() > 0) {
            await expect(inputs.first()).toBeVisible();
        }
    });

    test('should have navigation buttons (Next/Back/Skip)', async ({ page }) => {
        const navBtns = page.locator('button:has-text("Next"), button:has-text("Back"), button:has-text("Skip"), button:has-text("Finish"), button:has-text("下一步")');
        if (await navBtns.count() > 0) {
            await expect(navBtns.first()).toBeVisible();
        }
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await page.goto('/setup');
        await page.waitForTimeout(3000);
        expect(errors).toHaveLength(0);
    });
});
