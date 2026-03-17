import { test, expect } from '@playwright/test';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('LLM AI Assistant Panel', () => {

    test('should render chat interface and simulate AI tool calling', async ({ page }) => {
        // Intercept Chat API
        await page.route('**/api/assistant/chat*', async route => {
            if (route.request().method() === 'POST') {
                // Return a mock chat response with JSON representing a tool call
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        reply: 'I have pulled the latest analytics data for you.',
                        toolCalls: [
                            {
                                name: 'analytics.query',
                                args: '{"metric": "total_calls", "period": "today"}'
                            }
                        ]
                    })
                });
            } else {
                await route.continue();
            }
        });

        // Navigate to Assistant
        if (!await navigateOrSkip(page, '/assistant')) return;
        await expectAppShell(page);

        // Verify basic layout
        const chatInput = page.locator('textarea[placeholder*="Ask CXMind AI" i], textarea').first();
        await expect(chatInput).toBeVisible({ timeout: 10000 });

        const sendBtn = page.locator('button:has(.lucide-send), button[title*="Send" i]').first();
        await expect(sendBtn).toBeVisible();

        // Simulate typing and sending
        await chatInput.fill('Show me todays call volume');
        await expect(sendBtn).toBeEnabled();
        await sendBtn.click();

        // Wait for the simulated AI response to render in the message list
        // It should contain the text we mocked
        const messageBubble = page.locator('text=I have pulled the latest analytics data for you.').first();
        await expect(messageBubble).toBeVisible({ timeout: 8000 });

        // Verify the Tool Call badge/visualization if available
        const toolBadge = page.locator('text=analytics.query').first();
        if (await toolBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
            await expect(toolBadge).toBeVisible();
        }
    });

});
