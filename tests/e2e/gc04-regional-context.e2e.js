import { expect, test } from '@playwright/test';
import { enableE2EMockBackend } from './support/mockBackend.js';
import { buildAppUrl } from './support/rehearsalRuntime.js';
import { seedDeckProbe, readDeckProbe } from '../../scripts/gc04-deck-probe.mjs';

// Synthetic browser fixtures only. These are not roster approval or RLS evidence.
test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL && !['localhost', '127.0.0.1'].includes(new URL(process.env.PLAYWRIGHT_BASE_URL).hostname)),
    'Run mock browser coverage against a local build only.');

async function seed(page, { occupiedRole = null, shared = false } = {}) {
    await page.goto(buildAppUrl());
    await page.waitForFunction(() => Boolean(globalThis.__ESG_E2E_BACKEND__));
    await page.evaluate(({ occupiedRole, shared }) => {
        const state = globalThis.__ESG_E2E_BACKEND__.dump();
        const now = new Date().toISOString();
        state.tables.sessions.push({ id: 'gc04-session', name: 'GC04 synthetic fixture', session_code: 'GC04TEST',
            status: 'active', session_classification: 'live_exercise', is_protected: false,
            session_topology_version: 2, green_seat_model: shared ? 'shared_facilitator_v1' : null,
            green_roster_version: 'synthetic-browser-only',
            green_roster_snapshot: { fixture: true }, created_at: now });
        state.tables.game_state.push({ id: 'gc04-state', session_id: 'gc04-session', move: 1, phase: 1,
            timer_seconds: 5400, timer_running: false });
        if (occupiedRole) {
            state.tables.participants.push({ id: 'occupied-participant', auth_user_id: 'other-auth', client_id: 'other-client', name: 'Synthetic occupied seat' });
            state.tables.session_participants.push({ id: 'occupied-seat', session_id: 'gc04-session', participant_id: 'occupied-participant',
                role: occupiedRole, delegation_id: occupiedRole === 'green_shared_facilitator' ? null : 'europe', is_active: true, heartbeat_at: now, joined_at: now });
        }
        localStorage.setItem('esg_e2e_backend_state', JSON.stringify(state));
    }, { occupiedRole, shared });
    await page.locator('#sessionCode').fill('GC04TEST');
    await page.locator('#displayName').fill('Synthetic participant');
    await page.locator('#checkSessionBtn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#joinStatus')).toContainText('regional Green');
    await page.locator('[data-team="green"]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#delegationSelection')).toBeVisible();
    await expect(page.locator('[data-role-surface="notetaker"]')).toBeHidden();
}

for (const delegation of ['asian_pacific', 'europe']) {
    for (const surface of ['facilitator', 'scribe']) {
        test(`${delegation} ${surface}: keyboard join, reload, stale storage and tampered deep link`, async ({ context, page }) => {
            await enableE2EMockBackend(context);
            await seed(page);
            const regionLabel = delegation === 'europe' ? 'Europe' : 'Asia-Pacific';
            const semanticLabel = surface === 'facilitator' ? 'Scribe' : 'Facilitator';
            await page.locator(`[data-delegation="${delegation}"]`).focus();
            await page.keyboard.press('Space');
            await expect(page.locator(`[data-delegation="${delegation}"]`)).toHaveAttribute('aria-pressed', 'true');
            await page.locator(`[data-role-surface="${surface}"]`).focus();
            await page.keyboard.press('Enter');
            await expect(page.locator('#seatSelectionSummary')).toContainText(`Green - ${regionLabel} ${semanticLabel}`);
            await page.locator('#joinForm button[type="submit"]').focus();
            await page.keyboard.press('Enter');
            await expect(page).toHaveURL(new RegExp(`teams/green/${surface}\\.html\\?delegation=${delegation}`));
            await expect(page.locator('#sessionRoleLabel')).toHaveText(`Green - ${regionLabel} ${semanticLabel}`);
            await page.reload();
            await expect(page.locator('#sessionRoleLabel')).toHaveText(`Green - ${regionLabel} ${semanticLabel}`);
            // Local state is only a hint. It cannot replace the authenticated seat.
            await page.evaluate(() => {
                sessionStorage.setItem('esg_role', 'blue_facilitator');
                const data = JSON.parse(sessionStorage.getItem('esg_session_data'));
                data.role = 'blue_facilitator'; data.team = 'blue'; data.delegationId = null;
                sessionStorage.setItem('esg_session_data', JSON.stringify(data));
            });
            await page.goto(buildAppUrl(`teams/green/${surface}.html`));
            await expect(page.locator('#sessionRoleLabel')).toHaveText(`Green - ${regionLabel} ${semanticLabel}`);
            const other = delegation === 'europe' ? 'asian_pacific' : 'europe';
            await page.goto(buildAppUrl(`teams/green/${surface}.html?delegation=${other}`));
            await expect(page.locator('#seatContextStatus')).toContainText('Permission error');
            await expect(page.locator('.app-layout, .scribe-shell')).toBeHidden();
            await expect(page.getByRole('button', { name: 'Retry session validation' })).toBeVisible();
        });
    }
}

test('full seat stays on join with persistent accessible retry feedback', async ({ context, page }) => {
    await enableE2EMockBackend(context);
    await seed(page, { occupiedRole: 'green_europe_scribe' });
    await page.locator('[data-delegation="europe"]').click();
    await page.locator('[data-role-surface="facilitator"]').click();
    await page.locator('#joinForm button[type="submit"]').click();
    await expect(page.locator('#joinStatus')).toContainText('full');
    await expect(page.locator('#joinStatus')).toBeFocused();
    await expect(page.locator('#joinForm button[type="submit"]')).toBeEnabled();
});

for (const [delegation, surface, label] of [
    ['asian_pacific', 'facilitator', 'Green - Asia-Pacific Scribe'],
    ['europe', 'facilitator', 'Green - Europe Scribe'],
    [null, 'scribe', 'Green Shared Facilitator — Asia-Pacific and Europe']
]) {
    test(`GC04A ${label}: keyboard join, reload and model-bound deep links`, async ({ context, page }) => {
        await enableE2EMockBackend(context);
        await seed(page, { shared: true });
        if (delegation) {
            await page.locator(`[data-delegation="${delegation}"]`).focus();
            await page.keyboard.press('Space');
        }
        await page.locator(`[data-role-surface="${surface}"]`).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#seatSelectionSummary')).toContainText(label);
        await page.locator('#joinForm button[type="submit"]').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#sessionRoleLabel')).toHaveText(label);
        if (!delegation) {
            await expect(page.locator('#sharedGreenWorkflowNotice')).toContainText('Private drafts and notes remain inaccessible');
            await page.locator('#sharedGreenWorkingRegion').focus();
            await page.keyboard.press('End');
            await page.keyboard.press('Enter');
            await expect(page.locator('#sharedGreenWorkingRegion')).toHaveValue('europe');
        }
        await page.reload();
        await expect(page.locator('#sessionRoleLabel')).toHaveText(label);
        if (!delegation) await expect(page.locator('#sharedGreenWorkingRegion')).toHaveValue('europe');
        await page.evaluate(() => {
            sessionStorage.setItem('esg_role', 'green_scribe');
            const cached = JSON.parse(sessionStorage.getItem('esg_session_data'));
            cached.role = 'green_scribe'; cached.greenSeatModel = 'unified_v1';
            sessionStorage.setItem('esg_session_data', JSON.stringify(cached));
        });
        await page.goto(buildAppUrl(`teams/green/${surface}.html`));
        await expect(page.locator('#sessionRoleLabel')).toHaveText(label);
        await page.goto(buildAppUrl(`teams/green/${surface}.html?delegation=${delegation === 'europe' ? 'asian_pacific' : 'europe'}`));
        await expect(page.locator('#seatContextStatus')).toContainText('Permission error');
        await expect(page.locator('.app-layout, .scribe-shell')).toBeHidden();
    });
}

test('GC04A full shared seat offers retry without creating a regional Facilitator', async ({ context, page }) => {
    await enableE2EMockBackend(context);
    await seed(page, { shared: true, occupiedRole: 'green_shared_facilitator' });
    await page.locator('[data-role-surface="scribe"]').click();
    await page.locator('#joinForm button[type="submit"]').click();
    await expect(page.locator('#joinStatus')).toContainText('full');
    await expect(page.locator('#joinStatus')).toBeFocused();
    await expect(page.locator('#seatSelectionSummary')).toContainText('Shared Facilitator');
});

test('GC04A shared seat reconnect and simulated removal clear the DOM and scoped storage', async ({ context, page }) => {
    await enableE2EMockBackend(context);
    await seed(page, { shared: true });
    await page.locator('[data-role-surface="scribe"]').click();
    await page.locator('#joinForm button[type="submit"]').click();
    await expect(page.locator('#sessionRoleLabel')).toContainText('Shared Facilitator');
    await expect(page.locator('#syncStatusBanner')).toBeHidden();
    await context.setOffline(true);
    await expect(page.locator('#syncStatusBanner')).toContainText('Live updates paused');
    await context.setOffline(false);
    await expect(page.locator('#syncStatusBanner')).toBeHidden({ timeout: 45000 });
    await expect(page.locator('#sessionRoleLabel')).toContainText('Asia-Pacific and Europe');
    const deckKey = await page.evaluate(() => {
        const seat = JSON.parse(sessionStorage.getItem('esg_session_data'));
        return `scribe-deck:${seat.id}:green:shared_facilitator_v1:${seat.participantSessionId}`;
    });
    await seedDeckProbe(page, deckKey);
    expect(await readDeckProbe(page, deckKey)).toEqual({ own: true, retained: true });
    const prefix = await page.evaluate(() => {
        const cached = JSON.parse(sessionStorage.getItem('esg_session_data'));
        const prefix = `gc04:${cached.id}:2:green:shared:${cached.role}:${cached.participantSessionId}:shared_facilitator_v1:`;
        localStorage.setItem(`${prefix}region:europe:draft`, 'synthetic private data');
        sessionStorage.setItem(`${prefix}working-delegation`, 'europe');
        const key = 'esg_e2e_backend_state';
        const oldValue = localStorage.getItem(key);
        const state = JSON.parse(oldValue);
        const seat = state.tables.session_participants.find((row) => row.id === cached.participantSessionId);
        seat.is_active = false; seat.revoked_at = new Date().toISOString();
        const newValue = JSON.stringify(state);
        localStorage.setItem(key, newValue);
        // Mock transport only: hosted RPC and realtime validation remain separate.
        window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue }));
        return prefix;
    });
    await expect(page.locator('#seatContextStatus')).toContainText('Session validation lost');
    await expect(page.locator('.app-layout, .scribe-shell, #sharedGreenWorkingRegion')).toHaveCount(0);
    expect(await page.evaluate((prefix) => [localStorage, sessionStorage].every((store) =>
        Object.keys(store).every((key) => !key.startsWith(prefix))), prefix)).toBe(true);
    await expect.poll(() => readDeckProbe(page, deckKey), { timeout: 15000 }).toEqual({ own: false, retained: true });
});
