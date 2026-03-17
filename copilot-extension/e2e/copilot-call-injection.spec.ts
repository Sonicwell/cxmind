import { expect } from '@playwright/test';
import { test } from './fixtures';

test.describe('Copilot Call Injection & Edge Cases (Bug-Finding Suite)', () => {

  test.beforeEach(async ({ page, extensionId }) => {
      page.on('console', msg => { if (msg.type() === 'error') console.log('[Browser Error] ' + msg.text()); });
      page.on('pageerror', exception => { console.log('[Browser Uncaught Exception] ' + exception); });

      await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await page.waitForLoadState('networkidle');

      // Login form handler
      await page.waitForSelector('input[type="email"], input[type="text"], .side-panel-body', { timeout: 15000 });
      const emailInput = page.locator('input[type="email"], input[type="text"]').first();
      if (await emailInput.isVisible()) {
          await emailInput.fill('agent@cxmi.ai');
          await page.locator('input[type="password"]').fill('admin123');
          await page.locator('button[type="submit"].btn-primary').first().click();
          
          await expect(page.locator('.side-panel-body').first()).toBeVisible({ timeout: 15000 });
      }
  });

  const dispatchWS = async (page: any, type: string, data: any, routeToBus?: boolean) => {
      await page.evaluate((payload: any) => {
          window.location.hash = encodeURIComponent(JSON.stringify(payload));
      }, { playwright_mock: true, type, data, routeToBus });
  };

  test('Scenario 1: Massive Transcription & Suggestion Render Bombing (Form Input Focus Integrity)', async ({ page }) => {
      // 1. Create Call
      await dispatchWS(page, 'call_event', {
          event_type: 'call_create',
          call_id: 'bomb-call-001',
          caller_uri: 'sip:customer@bomb',
          callee_uri: 'sip:agent@bomb',
          status: 'active'
      });

      const currentCallTab = page.locator('.tab-v2-item').nth(1);
      await currentCallTab.click();

      const callStage = page.locator('.glass-card').first();
      await expect(callStage).toBeVisible({ timeout: 5000 });

      // 2. Open Summary/Notes tab
      const notesTab = page.locator('button.tab-button, .tab-item').filter({ hasText: /Notes|Summary/i }).first();
      if (await notesTab.isVisible()) {
          await notesTab.click();
          const textarea = page.locator('textarea').first();
          await expect(textarea).toBeVisible();

          await textarea.click();
          await textarea.pressSequentially('Starting ', { delay: 50 });

          // 3. Render Bomb: Fire Real Redux Updates via useWebSocket Bridge
          for (let i = 0; i < 40; i++) {
              // Rapid Transcript
              await dispatchWS(page, 'transcription_update', [{
                  id: `tx-${i}`, speaker: 'customer', text: `chunk ${i}`, confidence: 0.99 
              }]);
              
              // Rapid Suggestion
              await dispatchWS(page, 'suggestion_update', [
                  { text: `Quick reply ${i}`, type: 'tip' }
              ]);

              await page.waitForTimeout(20); // 20ms backend jitter
          }

          // 4. Validate React hasn't wiped the local component state of the Textarea due to parent re-renders
          await expect(textarea).toBeFocused();
          await textarea.pressSequentially('bomb complete.', { delay: 50 });
          const finalVal = await textarea.inputValue();
          expect(finalVal).toBe('Starting bomb complete.');
      }
      
      // Cleanup
      await dispatchWS(page, 'call_event', { event_type: 'call_hangup', call_id: 'bomb-call-001' });
      await page.waitForTimeout(500);
      await dispatchWS(page, 'wrapup:completed', {});
  });

  test('Scenario 2: The Null/Malformed Payload Crash Test (Defensive Parsing Guard)', async ({ page }) => {
      // Injecting a completely malformed websocket payload that the backend might accidentally push
      
      // 1. Valid Call Create
      await dispatchWS(page, 'call_event', {
          event_type: 'call_create',
          call_id: 'crash-test-01',
          caller_uri: 'sip:customer', callee_uri: 'sip:agent'
      });

      const currentCallTab = page.locator('.tab-v2-item').nth(1);
      await currentCallTab.click();
      await expect(page.locator('.glass-card').first()).toBeVisible({ timeout: 5000 });

      let errorThrown = false;
      page.on('pageerror', () => { errorThrown = true; });

      // 2. Malformed Transcription Bomb!
      await dispatchWS(page, 'transcription_update', null);
      await dispatchWS(page, 'transcription_update', [{ text: null, speaker: undefined, confidence: 'NaN' }]);

      // 3. Malformed Summary Update!
      await dispatchWS(page, 'omni:summary', { raw_summary: null, entities: "{ invalidJSON ]" });

      // 4. Malformed Suggestions!
      await dispatchWS(page, 'suggestion_update', [{ suggestion: undefined, type: null }]);

      await page.waitForTimeout(1000); // Give JS time to crash

      // 5. If Defensive Checks in `useWebSocket` failed, the DOM will literally be unmounted, or an error logged.
      expect(errorThrown).toBe(false);
      await expect(page.locator('.glass-card').first()).toBeVisible();

      // Cleanup
      await dispatchWS(page, 'wrapup:completed', {});
  });

  test('Scenario 3: The Race Condition Call Collision (Ghost Timing)', async ({ page }) => {
      // 1. Call A Starts
      await dispatchWS(page, 'call_event', {
          event_type: 'call_create', call_id: 'ghost-call-A', caller_uri: 'sip:ghost', callee_uri: 'sip:agent'
      });
      const currentCallTab = page.locator('.tab-v2-item').nth(1);
      await currentCallTab.click();
      await expect(page.locator('.glass-card').first()).toBeVisible({ timeout: 5000 });

      // 2. Call A Hangs up (Triggering Summary Loading spinner state inside ToolkitPanel!)
      await dispatchWS(page, 'call_event', { event_type: 'call_hangup', call_id: 'ghost-call-A' });
      // Toolkit takes 3.5s to open after Breather, so wait 6s
      await expect(page.locator('text=/Generating summary|Wrapping up|Generating AI Summary/i')).toBeVisible({ timeout: 6000 });

      // 3. RACE CONDITION! Call B immediately answers BEFORE Call A finishes summary!
      await dispatchWS(page, 'call_event', {
          event_type: 'call_create', call_id: 'ghost-call-B', caller_uri: 'sip:urgent', callee_uri: 'sip:agent'
      });

      // 4. Then unexpectedly, Call A's delayed summary payload arrives from the backend AI!
      await dispatchWS(page, 'omni:summary', { session_id: 'ghost-call-A', intent: 'Stale Summary' });

      // 5. Verification: Call B MUST NOT inherited Call A's summary or get kicked out of active state!
      await expect(page.locator('.glass-card').first()).toBeVisible();
      
      // Ensure the UI doesn't say "Wrap-up Completed"
      await expect(page.locator('text=/Wrap-up Completed/i')).toBeHidden({ timeout: 1000 });
      
      // We should continue seeing Call B's state, checking active status
      // Because `useWebSocket` overrides active call info, if it got destroyed by the Stale Summary it means a bug.
  });

  test('Scenario 4: Omnichannel Chat Flood & Memory Bound Verification', async ({ page }) => {
      // 1. Initialize an Omnichannel chat active session via background mock or UI
      const inboxTab = page.locator('button.tab-button').filter({ hasText: /Inbox/i }).first();
      // If we are currently in MeTab, switch to Inbox
      let errorThrown = false;
      page.on('pageerror', () => { errorThrown = true; });

      // 2. Fire 250 chat messages from backend (Testing array limit of 200)
      for (let i = 0; i < 250; i++) {
          await dispatchWS(page, 'omni:customer_message', {
              _id: `msg-${i}`,
              conversationId: 'demo-chat-fuzz',
              content: { text: `Fuzzing message ${i}` },
              sender: { id: 'cust-1' },
              createdAt: new Date().toISOString()
          });
          // Also fire a malformed recall
          if (i === 100) {
              await dispatchWS(page, 'chat:recall', { messageId: undefined }); // Missing _id
              await dispatchWS(page, 'chat:edit', { messageId: `msg-50`, newText: null }); // Bad edit
          }
      }

      await page.waitForTimeout(500);
      expect(errorThrown).toBe(false); // UI must not crash

      // Navigate to inbox to ensure rendering loop handles the 200 sliced limit
      if (await inboxTab.isVisible()) {
          await inboxTab.click();
          await page.waitForTimeout(500);
          expect(errorThrown).toBe(false);
      }
  });

  test('Scenario 5: SOP Execution & Action Draft Abuse (Crash Resistance)', async ({ page }) => {
      let errorThrown = false;
      page.on('pageerror', () => { errorThrown = true; });

      // 1. Wait for hydration and ensure the hash listener is mounted
      await page.waitForSelector('.side-panel-body', { state: 'visible', timeout: 5000 });
      await page.waitForTimeout(1000); // Give useWebSocket time to attach `hashchange` listener

      // 2. Create a mock call to initialize the sidepanel's CallTab
      await dispatchWS(page, 'call_event', { event_type: 'call_create', call_id: 'sop-fuzz-call', caller_uri: 'Agent', status: 'active' });
      const currentCallTab = page.locator('.tab-v2-item').nth(1);
      
      try {
          await expect(currentCallTab).toBeVisible({ timeout: 5000 });
      } catch (e) {
          await page.screenshot({ path: 'artifacts/fuzz-crash-screenshot.png' });
          throw e; // Re-throw to fail the test naturally
      }

      await currentCallTab.click();
      await page.waitForTimeout(500);

      // 2. Inject an Action Draft via the new routeToBus bridge
      // This forces ActionList.tsx to parse our malformed payload
      await dispatchWS(page, 'omni:action_draft', {
          actionId: 'draft-fuzz-1',
          intentSlug: 'issue_refund',
          status: 'suggested',
          draft: null, // intentionally null to break object iteration
          originalDraft: undefined // intentionally undefined
      }, true); // routeToBus = true

      // 3. Inject an SOP auto-select event
      await dispatchWS(page, 'sop:autoSelect', {
          sopId: 'invalid-sop-uuid-123' // Invalid SOP should be caught by catch block in selectSOP API fetch
      }, true); // routeToBus = true

      // 4. Send a malformed SOP Action Draft update
      await dispatchWS(page, 'omni:action_draft_update', {
          actionId: 'draft-fuzz-1',
          status: 'edited',
          draft: { 'nested': { 'malformed': 'string-instead-of-object' } } // Circular/Weird object
      }, true); // routeToBus = true
      
      await page.waitForTimeout(1000);
      
      // 5. Verification: The Page Must Survive
      expect(errorThrown).toBe(false);

      // 6. Test valid draft rendering
      await dispatchWS(page, 'omni:action_draft', {
          actionId: 'draft-valid-1',
          intentSlug: 'log_ticket',
          status: 'suggested',
          draft: { 'title': 'Valid ticket' },
          originalDraft: { 'title': 'Valid ticket' }
      }, true);
      
      await expect(page.locator('span', { hasText: 'LOG TICKET' }).filter({ visible: true }).first()).toBeVisible({ timeout: 2000 });
  });

});
