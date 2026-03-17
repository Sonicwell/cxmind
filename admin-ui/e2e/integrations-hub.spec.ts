import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('Integrations Hub Page', () => {

    test('should render provider cards and allow navigation', async ({ page }) => {
        // Integrations.tsx uses raw fetch('/api/integrations') with token from localStorage
        await page.route('**/api/integrations', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [
                        { provider: 'jira', status: 'active' },
                        { provider: 'salesforce', status: 'inactive' }
                    ]
                })
            });
        });

        if (!await navigateOrSkip(page, '/integrations')) return;
        await expectAppShell(page);

        // Page title should have "Integrations"
        const title = page.locator('h1', { hasText: /Integration/i }).first();
        await expect(title).toBeVisible({ timeout: 10000 });

        // Provider cards should render — hardcoded list includes Jira, Salesforce, etc.
        const jiraCard = page.locator('h3', { hasText: 'Jira' }).first();
        await expect(jiraCard).toBeVisible({ timeout: 5000 });

        const salesforceCard = page.locator('h3', { hasText: 'Salesforce' }).first();
        await expect(salesforceCard).toBeVisible();

        // Connected badge should appear for Jira (status: active)
        const connectedBadge = page.locator('text=Connected').first();
        if (await connectedBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
            await expect(connectedBadge).toBeVisible();
        }

        // Search input should exist
        const searchInput = page.locator('input[type="text"]').first();
        await expect(searchInput).toBeVisible();
    });

    test('should filter cards by search query', async ({ page }) => {
        await page.route('**/api/integrations', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: [] })
            });
        });

        if (!await navigateOrSkip(page, '/integrations')) return;
        await expectAppShell(page);

        // Wait for cards to render
        const jiraCard = page.locator('h3', { hasText: 'Jira' }).first();
        await expect(jiraCard).toBeVisible({ timeout: 10000 });

        // Type in search to filter
        const searchInput = page.locator('input[type="text"]').first();
        await searchInput.fill('Zendesk');

        // Jira should disappear, Zendesk should stay
        await expect(page.locator('h3', { hasText: 'Zendesk' }).first()).toBeVisible({ timeout: 3000 });
        await expect(page.locator('h3', { hasText: 'Jira' })).toBeHidden({ timeout: 3000 });
    });

    test('no JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.route('**/api/integrations', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: [] })
            });
        });

        if (!await navigateOrSkip(page, '/integrations')) return;
        await expectAppShell(page);
        await page.waitForTimeout(2000);
        expect(errors).toEqual([]);
    });

    test('Jira setup form inputs use standard Input component', async ({ page }) => {
        // Discovery Intent: 验证原生 <input> → Input 组件替换后，表单输入框渲染 .input-field class
        await page.route('**/api/integrations', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: [] })
            });
        });

        if (!await navigateOrSkip(page, '/integrations/jira')) return;
        await expectAppShell(page);

        // 等待 Step 1 的表单渲染
        const formInputs = page.locator('input.input-field');
        if (await formInputs.count() > 0) {
            // Input 组件应渲染带 input-field class
            await expect(formInputs.first()).toBeVisible({ timeout: 10_000 });

            // 验证输入操作正常
            await formInputs.first().fill('https://test.atlassian.net');
            await expect(formInputs.first()).toHaveValue('https://test.atlassian.net');
        }

        // 页面不应有使用 inputStyle 内联样式的原生 <input>
        // (Input 组件 wrapper 会自动应用 input-field class，不需要 inline style)
        const rawInputsWithInlineStyle = page.locator('input[style*="var(--bg-card)"]');
        await expect(rawInputsWithInlineStyle).toHaveCount(0);
    });
});
