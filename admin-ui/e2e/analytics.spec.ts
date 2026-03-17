import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Analytics Page Checks', () => {

    test.beforeEach(async ({ page }) => {
        if (!await navigateOrSkip(page, '/analytics')) return;
        await expectAppShell(page);
    });

    test('should render chart containers properly (Recharts / Visualization)', async ({ page }) => {
        // Assert the presence of some charts, graphs and analytic cards
        const charts = page.locator('.recharts-wrapper, canvas, svg.d3-chart, .chart-container');

        // Wait up to 10 seconds for charts to aggregate and paint
        await expect(charts.first()).toBeVisible({ timeout: 10_000 });

        // Assert there is more than 0 data visualization nodes
        const chartCount = await charts.count();
        expect(chartCount).toBeGreaterThan(0);

        // Look for basic header elements in analytics
        await expect(page.locator('text=/Total Volume|SLA|Sentiment Trend|Intent Distribution/i').first()).toBeVisible();
    });
});
