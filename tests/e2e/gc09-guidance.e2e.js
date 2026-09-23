import { test, expect } from '@playwright/test';
import { enableE2EMockBackend } from './support/mockBackend.js';
import { buildAppUrl } from './support/rehearsalRuntime.js';

// Local synthetic browser evidence only. No operational approval or hosted RLS claim.
async function joinGreen(page, context, region) {
    await enableE2EMockBackend(context);
    await page.goto(buildAppUrl());
    await page.waitForFunction(() => Boolean(globalThis.__ESG_E2E_BACKEND__));
    await page.evaluate(() => {
        const state = globalThis.__ESG_E2E_BACKEND__.dump();
        const now = new Date().toISOString();
        state.tables.sessions.push({ id: 'gc09-session', name: 'GC09 synthetic guidance fixture', session_code: 'GC09TEST',
            status: 'active', session_classification: 'live_exercise', is_protected: false,
            session_topology_version: 2, green_seat_model: 'shared_facilitator_v1',
            green_roster_version: 'synthetic-browser-only', green_roster_snapshot: { fixture: true }, created_at: now });
        state.tables.game_state.push({ id: 'gc09-clock', session_id: 'gc09-session', move: 1, phase: 1,
            timer_seconds: 5400, timer_running: false });
        localStorage.setItem('esg_e2e_backend_state', JSON.stringify(state));
    });
    await page.locator('#sessionCode').fill('GC09TEST');
    await page.locator('#displayName').fill('Synthetic guidance participant');
    await page.locator('#checkSessionBtn').click();
    await expect(page.locator('#joinStatus')).toContainText('regional Green');
    await page.locator('[data-team="green"]').click();
    if (region) await page.locator(`[data-delegation="${region}"]`).click();
    await page.locator(`[data-role-surface="${region ? 'facilitator' : 'scribe'}"]`).click();
    await page.locator('#joinForm button[type="submit"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#sessionRoleLabel')).toContainText(region ? 'Scribe' : 'Shared Facilitator');
    await expect(page.locator('.follow-along')).toBeVisible();
}

for (const region of ['asian_pacific', 'europe', null]) {
    test(`GC09 ${region || 'shared Facilitator'}: current text, keyboard guide and reload`, async ({ page, context }) => {
        await joinGreen(page, context, region);
        const guide = page.locator('.follow-along');
        await expect(guide).toContainText('no replacement narration has been approved');
        const next = guide.locator('.follow-along-next');
        await next.focus(); await page.keyboard.press('Enter'); // role focus
        await expect(guide.locator('.follow-along-role-summary')).toContainText('one shared Green Facilitator');
        await expect(guide.locator('[aria-label="Play audio guide"]')).toBeDisabled();
        await guide.locator('.follow-along-audio-transcript summary').focus();
        await page.keyboard.press('Enter');
        await expect(guide.locator('.follow-along-audio-transcript')).toHaveAttribute('open', '');
        await expect(guide.locator('.follow-along-audio-transcript')).toContainText(region ? 'Author only' : 'submit each separately');
        await page.keyboard.press('Escape');
        await expect(guide).toHaveAttribute('data-minimized', 'true');

        if (!region) {
            await page.locator('#deckViewBtn').click();
            await expect(page.locator('#deckActionFrame')).toContainText('current text guide');
            await page.locator('#sharedGreenWorkingRegion').focus();
            await page.keyboard.press('End'); await page.keyboard.press('Enter');
            await expect(page.locator('#sharedGreenWorkingRegion')).toHaveValue('europe');
            await expect(page.locator('#scribeSectionList')).toContainText('Shared Green deck');
            await expect(page.locator('#deckActionFrame')).toContainText('current text guide');
        }
        await page.reload();
        await expect(page.locator('#sessionRoleLabel')).toContainText(region ? 'Scribe' : 'Shared Facilitator');
        if (!region) await expect(page.locator('#sharedGreenWorkingRegion')).toHaveValue('europe');
        await guide.locator('.follow-along-bar').focus(); await page.keyboard.press('Enter');
        await expect(guide).toHaveAttribute('data-minimized', 'false');
        await expect(guide).toContainText('no replacement narration has been approved');
    });
}

test('GC09 standalone runtime deck opens current text and exposes keyboard regional sections', async ({ page }) => {
    await page.goto(buildAppUrl('decks/green/fractured-order-facilitator-deck.html'));
    await expect(page.locator('#guidanceText')).toContainText('current text guide');
    await page.getByRole('button', { name: /Asia-Pacific regional reference section/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#guidanceText')).toContainText('South Korea (ROK), Japan, ASEAN');
    await page.getByRole('button', { name: /Europe regional reference section/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#guidanceText')).toContainText('UK, France, EU');
    await expect(page.locator('#slideImg')).toBeHidden();
});
