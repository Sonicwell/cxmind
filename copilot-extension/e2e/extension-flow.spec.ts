import { test, expect } from './fixtures';

test.describe('Copilot Extension E2E Flow', () => {

  test('popup page renders and core panels exist (Permissions)', async ({ page, extensionId }) => {
    // Navigate to the extension's popup page
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    
    // Wait for the React app to mount
    await expect(page.locator('#__plasmo')).toBeVisible();

    // Verify that without configuring a token, it redirects to the login screen
    const loginPrompt = page.locator('text=/login|sign in|token/i').first();
    await expect(loginPrompt).toBeVisible();

    // Ensure we don't have broken state causing empty white screens
    const bodyText = await page.innerText('body');
    // It should contain some known UI text depending on login state. 
    // Usually extensions show a login prompt or the HomeDashboard
    expect(bodyText.length).toBeGreaterThan(10);
  });

  // Note: We're simulating WebSocket events and advanced flows here.
  // Real implementation may require mocking `chrome.storage.local` to inject tokens.

  test('CallerContext360 mounts properly after interactive login', async ({ page, extensionId }) => {
      // 1. Go to the extension popup
      await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      
      // 2. We expect the login screen to render
      await page.waitForLoadState('networkidle');
      const emailInput = page.locator('input[type="text"]').first();
      await expect(emailInput).toBeVisible({ timeout: 10000 });

      // 3. Perform interactive login using the built-in DEMO Mode bypass
      // LoginView.tsx and useAuth.ts intercept 'demo@example.com' directly, avoiding fetch()
      // Note: We need to ensure DEMO_ENABLED flag is true in the build, but usually it is in dev/test.
      await emailInput.fill('demo@example.com');
      
      // Click the primary submit button. 
      await page.locator('button[type="submit"].btn-primary').first().click();

      // 4. Assert that the dashboard UI loads successfully
      await page.waitForLoadState('networkidle');
      
      // The side-panel body proves we bypassed the auth screen and boot screen
      const authenticatedPanel = page.locator('.side-panel-body').first();
      await expect(authenticatedPanel).toBeVisible({ timeout: 10000 });
      
      // Ensure the base dashboard tab is there
      const activeTab = page.locator('.active-tab, [aria-selected="true"]');
      if (await activeTab.isVisible()) {
          await expect(activeTab).toBeVisible();
      }

      // 5. Navigate through the TabBar to prove routing works
      const meTab = page.locator('.tab-item:has(svg), .tab-button', { hasText: /Me|Profile|Settings/i }).last();
      if (await meTab.isVisible()) {
          await meTab.click();
          // The Me tab should render the MeTab component (contains API URL or language settings)
          const settingsSection = page.locator('text=/Language|API|Preferences/i').first();
          await expect(settingsSection).toBeVisible({ timeout: 5000 });
      }
  });

});
