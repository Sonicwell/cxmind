import { test, expect } from '@playwright/test';
import { Buffer } from 'buffer';
import { navigateOrSkip, expectAppShell } from './helpers';

test.describe('RAG Engine End-to-End Test', () => {

    test('should upload, vectorise, and search successfully across different RAG engine modes', async ({ page, request }) => {
        const UNIQUE_KEYWORD = `Playwright_RAG_Test_${Date.now()}`;
        const TEST_FILE_NAME = `rag_e2e_target_${Date.now()}.txt`;
        const TEST_CONTENT = `This is a highly specific document designed for testing the Retrieval-Augmented Generation engine. The secret keyword is: ${UNIQUE_KEYWORD}. It discusses the migration of penguins to the Sahara desert.`;

        test.setTimeout(120_000); // RAG index queue + queries might take a while

        // 0. Ensure user is logged in and extract auth token for backend API setup
        if (!await navigateOrSkip(page, '/knowledge')) {
            throw new Error('Skipping test, URL is: ' + page.url());
        }
        await expectAppShell(page);

        const token = await page.evaluate(() => window.localStorage.getItem('cxmind:auth:token'));
        if (!token) throw new Error('No auth token found in localStorage!');
        const reqContext = { headers: { Authorization: `Bearer ${token}` } };

        // Ensure Knowledge module is enabled and RAG mode is ready
        const settingsRes = await request.get('/api/platform/settings', reqContext);
        const settings = await settingsRes.json();
        const existingRagEngine = settings.data?.ragEngine || {};
        const modules = settings.data?.enabledModules || [];
        if (!modules.some((m: any) => m.slug === 'knowledge' && m.enabled)) {
            const kbModule = modules.find((m: any) => m.slug === 'knowledge');
            if (kbModule) kbModule.enabled = true;
            else modules.push({ slug: 'knowledge', tier: 'optional', enabled: true });

            const patchRes = await request.patch('/api/platform/settings', { ...reqContext, data: { enabledModules: modules } });
            expect(patchRes.status()).toBe(200);

            // wait a tick for backend to apply and reload page
            await page.waitForTimeout(500);
        }

        // Force reset RAG engine mode to llamaindex for the start of the test
        // Otherwise, previous test runs ending in 'llm' mode will cause the upload/re-index to use wrong embeddings
        const patchInitRes = await request.patch('/api/platform/settings', {
            ...reqContext,
            data: { ragEngine: { ...existingRagEngine, vectorizeMode: 'llamaindex' } }
        });
        expect(patchInitRes.status()).toBe(200);
        await page.waitForTimeout(500);

        await page.reload();
        await expectAppShell(page);

        // ensure we really landed on knowledge page
        await expect(page).toHaveURL(/.*\/knowledge/);

        // --- Phase 1: Upload File ---

        // 1. Create an in-memory file for upload using Playwright DataTransfer technique
        const dataTransfer = await page.evaluateHandle((data) => {
            const dt = new DataTransfer();
            const file = new File([data.content], data.name, { type: 'text/plain' });
            dt.items.add(file);
            return dt;
        }, { name: TEST_FILE_NAME, content: TEST_CONTENT });

        // 2. Force the file payload directly into the input via DOM evaluate
        // Wait for React to render the component containing the file input
        await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 10000 });

        await page.evaluate(({ name, content }) => {
            const input = document.querySelector('input[type="file"]') as HTMLInputElement;
            if (!input) throw new Error('File input not found');

            const file = new File([content], name, { type: 'text/plain' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            input.files = dataTransfer.files;

            // Dispatch change event to trigger React's onChange handler
            const event = new Event('change', { bubbles: true });
            input.dispatchEvent(event);
        }, { name: TEST_FILE_NAME, content: TEST_CONTENT });

        // 3. Wait for the upload success message toast
        // Depending on translation, it contains "upload", "Success" or specific success toast formatting
        const successToast = page.locator('.glass-panel').getByText(/success|上传|upload/i, { exact: false }).last();
        // Wait up to 10 seconds for the backend to chunk and upload
        await expect(successToast).toBeVisible({ timeout: 10_000 });

        // --- Phase 2: Verify LlamaIndex Search Mode ---

        // 6. Explicitly set Mode to LlamaIndex via API
        const patchLlamaRes = await request.patch('/api/platform/settings', {
            ...reqContext,
            data: { ragEngine: { ...existingRagEngine, vectorizeMode: 'llamaindex' } }
        });
        expect(patchLlamaRes.status()).toBe(200);

        // 7. Perform Search with LlamaIndex
        const searchInput = page.locator('input[placeholder*="knowledge" i], input[placeholder*="知识库"]').first();
        await searchInput.fill(UNIQUE_KEYWORD);

        const searchBtn = searchInput.locator('..').locator('button:has-text("Search"), button:has-text("搜")').first();

        // Polling search until BullMQ finishes embedding the chunks into Qdrant (might take up to 30s)
        await expect(async () => {
            await searchBtn.click();
            const searchResultsArea = page.locator('h4', { hasText: /RAG/i }).first().locator('..');
            await expect(searchResultsArea).toBeVisible({ timeout: 3000 });
            // Assert that the content snippet (unique keyword) is returned inside the polling block
            await expect(searchResultsArea).toContainText(UNIQUE_KEYWORD, { ignoreCase: true, timeout: 3000 });
            // Assert that the actual article meta (filename/title) is rendered, not just the chunk text
            await expect(searchResultsArea).toContainText(TEST_FILE_NAME, { ignoreCase: true, timeout: 3000 });
        }).toPass({ timeout: 60_000, intervals: [3000, 5000] });

        // Wait for results box to render safely outside
        const searchResultsArea = page.locator('h4', { hasText: /RAG/i }).first().locator('..');

        // Check that at least one score chip is visible (green or orange)
        await expect(searchResultsArea.locator('span', { hasText: '%' }).first()).toBeVisible();


        // --- Phase 4: Verify LLM Fallback Search Mode ---

        // 8. Explicitly set Mode to LLM via API
        const patchLlmRes = await request.patch('/api/platform/settings', {
            ...reqContext,
            data: { ragEngine: { ...existingRagEngine, vectorizeMode: 'llm' } }
        });
        expect(patchLlmRes.status()).toBe(200);

        // Wait a second for background service dynamic re-configuration to pick up
        await page.waitForTimeout(1000);

        // 9. Clear and search again
        // Click the 'Clear Search' button
        const clearBtn = page.locator('button:has-text("Clear"), button:has-text("清")').first();
        if (await clearBtn.isVisible()) {
            await clearBtn.click();
        }

        await searchInput.fill(UNIQUE_KEYWORD);
        await searchBtn.click();

        // Wait for results box (fallback should still succeed and find the document)
        const fallbackResultsArea = page.locator('h4', { hasText: /RAG/i }).first().locator('..');
        await expect(fallbackResultsArea).toBeVisible({ timeout: 10_000 });

        // Assert that it still finds our file via fallback (which uses vector distance in app-node)
        await expect(fallbackResultsArea).toContainText(UNIQUE_KEYWORD, { ignoreCase: true });
        // Assert that the actual article meta (filename/title) is rendered, to prevent chunk-only rendering bugs
        await expect(fallbackResultsArea).toContainText(TEST_FILE_NAME, { ignoreCase: true });

        // --- Phase 5: Cleanup ---

        // 10. Archive the test article to avoid polluting the DB
        // Just clear the search to see the full list
        if (await clearBtn.isVisible()) {
            await clearBtn.click();
        }

        // Find the specific article and click its archive (trash/archive) button
        // Locate the article row by its title
        const articleRow = page.locator('div').filter({ hasText: TEST_FILE_NAME }).first();
        // Click the Archive icon button (it has text 'edit' and 'archive' inside lucide-react SVGs usually by matching class/title or nth-child)
        // KnowledgeBase lists buttons as: Edit, Archive. Let's find the Archive button inside that row.
        const archiveBtn = articleRow.locator('button').nth(1);
        await archiveBtn.click();

        // Click confirm on the modal
        const confirmBtn = page.locator('.btn-danger, button:has-text("Archive"), button:has-text("归档")').last();
        await expect(confirmBtn).toBeVisible();
        await confirmBtn.click();

        // Verify it's removed
        await expect(articleRow).toHaveCount(0);
    });
});
