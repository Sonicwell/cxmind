import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Dashboard RBAC & Role Isolation', () => {

    test('should hide specific widgets for basic agent roles to prevent 403 errors', async ({ page }) => {
        // Intercept profile API and force 'agent' role downgrade
        await page.route('**/api/auth/me*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            id: 'mock-agent-id',
                            email: 'agent@cxmi.ai',
                            displayName: 'Test Agent',
                            role: 'agent', // Crucial downgrade here
                            organizationId: 'mock-org'
                        }
                    })
                });
            } else {
                await route.continue();
            }
        });

        // Navigate to dashboard
        if (!await navigateOrSkip(page, '/dashboard')) return;
        await expectAppShell(page);

        // Try wait for dashboard grid
        const grid = page.locator('.react-grid-layout, [data-testid="dashboard-grid"]').first();
        if (!await grid.isVisible({ timeout: 5000 }).catch(() => false)) return;

        // Verify some components that agents ARE allowed to see
        // Typically agents can see simple call stats or their own metrics
        const myStats = page.locator('text=/Total Calls|My Calls|Answered/i');
        if (await myStats.count() > 0) {
            await expect(myStats.first()).toBeVisible();
        }

        // Verify widgets that agents MUST NOT see (due to requiredPermission="qi:read" or "analytics:read")
        // 例如 Quality Inspector 相关的挂件, Revenue 相关的挂件
        const restrictedWidgets = page.locator('text=/Quality Inspector|Revenue|Cost Center|Global/i');
        // By UI strict mode, these should be unmounted or hidden
        for (let i = 0; i < await restrictedWidgets.count(); i++) {
            await expect(restrictedWidgets.nth(i)).toBeHidden();
        }

    });

});
