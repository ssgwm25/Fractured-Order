import { expect } from '@playwright/test';
import { ROLES, check } from './gc04-live-contract.mjs';

const authKey = 'esg-simulation-auth';
export async function keyboardReach(page, selector) {
    await expect(page.locator(selector)).toBeVisible();
    for (let count = 0; count < 100; count++) {
        if (await page.locator(selector).evaluate(node => node === document.activeElement)) return;
        await page.keyboard.press('Tab');
    }
    throw new Error(`GC04 keyboard cannot reach ${selector}`);
}
async function activate(page, selector, key = 'Enter') {
    await keyboardReach(page, selector);
    await page.keyboard.press(key);
}
async function sessionInfo(page) {
    return page.evaluate(key => {
        const auth = JSON.parse(sessionStorage.getItem(key) || 'null');
        const seat = JSON.parse(sessionStorage.getItem('esg_session_data') || 'null');
        return { userId: auth?.user?.id, seatId: seat?.participantSessionId, role: seat?.role,
            sessionId: seat?.id, region: seat?.delegationId };
    }, authKey);
}
export async function browserRequest(actor, runtime, path, method = 'GET', body) {
    const { page } = actor;
    const result = await page.evaluate(async ({ backend, key, authKey, path, method, body }) => {
        const auth = JSON.parse(sessionStorage.getItem(authKey) || 'null');
        if (!auth?.access_token) throw new Error('Missing real browser Auth session');
        const response = await fetch(`${backend}${path}`, {
            method, redirect: 'error', headers: { apikey: key, Authorization: `Bearer ${auth.access_token}`,
                'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)
        });
        return { status: response.status, data: await response.json(),
            requestId: response.headers.get('sb-request-id') || response.headers.get('x-request-id') };
    }, { backend: runtime.backend, key: runtime.key, authKey, path, method, body });
    runtime.report.requests.push({ actor: actor.role, path, method, status: result.status,
        requestId: result.requestId, code: result.data?.code, rowCount: Array.isArray(result.data) ? result.data.length : undefined,
        at: new Date().toISOString() });
    await runtime.save();
    return result;
}
async function identityVisible(actor) {
    const text = `Green - ${actor.label} ${actor.semantic}`;
    await expect(actor.page.locator('#sessionRoleLabel')).toHaveText(text, { timeout: 30000 });
    await expect(actor.page).toHaveTitle(`Fractured Order | ${text}`);
    await expect(actor.page.locator('#seatContextStatus')).toBeHidden();
}
export async function joinActor(browser, definition, runtime, index) {
    const context = await browser.newContext({ viewport: index < 2 ? { width: 1440, height: 1000 } : { width: 390, height: 844 },
        reducedMotion: 'reduce' });
    runtime.contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const actor = { ...definition, context, page };
    runtime.observe(actor);
    await page.goto(runtime.m.baseURL, { waitUntil: 'domcontentloaded' });
    check(!await page.evaluate(() => Boolean(globalThis.__ESG_E2E_BACKEND__)), 'mock backend must not be active');
    await keyboardReach(page, '#sessionCode');
    await page.keyboard.type(runtime.m.code);
    await keyboardReach(page, '#displayName');
    await page.keyboard.type(`GC04 synthetic ${index + 1}`);
    await runtime.ready(actor, 'join');
    await activate(page, '#checkSessionBtn');
    await expect(page.locator('#joinStatus')).toContainText('regional Green');
    await activate(page, '[data-team="green"]', 'Space');
    await activate(page, `[data-delegation="${actor.region}"]`, 'Space');
    await expect(page.locator(`[data-delegation="${actor.region}"]`)).toHaveAttribute('aria-pressed', 'true');
    await activate(page, `[data-role-surface="${actor.surface}"]`);
    await expect(page.locator('#seatSelectionSummary')).toContainText(`Green - ${actor.label} ${actor.semantic}`);
    await runtime.manual(actor, 'join');
    await activate(page, '#joinForm button[type="submit"]');
    actor.url = new URL(`teams/green/${actor.surface}.html?delegation=${actor.region}`, runtime.m.baseURL).href;
    await expect(page).toHaveURL(actor.url, { timeout: 45000 });
    await identityVisible(actor);
    actor.info = await sessionInfo(page);
    check(actor.info.sessionId === runtime.m.sessionId && actor.info.role === actor.role
        && actor.info.region === actor.region && actor.info.userId && actor.info.seatId, 'confirmed seat storage');
    const user = await browserRequest(actor, runtime, '/auth/v1/user');
    check(user.status === 200 && user.data.id === actor.info.userId && user.data.is_anonymous === true,
        'hosted Auth must verify this browser identity');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await identityVisible(actor);
    check((await sessionInfo(page)).userId === actor.info.userId, 'reload changed Auth identity');
    await page.goto(runtime.m.baseURL);
    await activate(page, '#resumeSessionBtn');
    await identityVisible(actor);
    await runtime.manual(actor, 'workspace');
    await runtime.checkpoint(actor, 'hosted-auth-keyboard-join-reload-resume');
    return actor;
}
export async function verifyScope(actor, actors, runtime) {
    const other = actors.find(candidate => candidate.region !== actor.region && candidate.surface === actor.surface);
    const restore = id => browserRequest(actor, runtime, '/rest/v1/rpc/restore_session_seat_context', 'POST', {
        requested_session_id: runtime.m.sessionId, requested_session_participant_id: id
    });
    let result = await restore(actor.info.seatId);
    check(result.status === 200 && result.data.seat.role === actor.role
        && result.data.seat.delegation_id === actor.region, 'own seat restoration');
    result = await restore(other.info.seatId);
    check(result.status === 403 && result.data.code === '42501'
        && result.data.message === 'GC04_INVALID_SESSION_SEAT', 'foreign seat must be denied by RPC');
    result = await browserRequest(actor, runtime, `/rest/v1/actions?session_id=eq.${runtime.m.sessionId}&select=id,delegation_id`);
    check(result.status === 200 && Array.isArray(result.data) && result.data.length === 1
        && result.data[0].id === runtime.m.actions[actor.region], 'RLS must expose only the own-region transport fixture');
    result = await browserRequest(actor, runtime, `/rest/v1/actions?id=eq.${runtime.m.actions[other.region]}&select=id`);
    check(result.status === 200 && Array.isArray(result.data) && result.data.length === 0, 'explicit foreign-row RLS read');
    await runtime.checkpoint(actor, 'direct-rpc-and-rls-isolation');
}
export async function verifyRecovery(actor, runtime) {
    const { page, context } = actor;
    await runtime.ready(actor, 'offline');
    await context.setOffline(true);
    let restored;
    try {
        await expect(page.locator('#syncStatusBanner')).toContainText('Live updates paused');
        await expect(page.locator('#syncStatusBanner')).toHaveAttribute('role', 'alert');
        await runtime.manual(actor, 'offline');
        // Arm before the actual online transition; the app must issue this RPC.
        restored = page.waitForResponse(response => response.url() === `${runtime.backend}/rest/v1/rpc/restore_session_seat_context`
            && response.status() === 200, { timeout: 45000 });
    } finally { await context.setOffline(false); }
    await restored;
    await identityVisible(actor);
    await expect(page.locator('#syncStatusBanner')).toBeHidden({ timeout: 45000 });
    check((await sessionInfo(page)).seatId === actor.info.seatId, 'reconnect replaced the seat');
    await runtime.manual(actor, 'reconnect');
    await runtime.checkpoint(actor, 'offline-announcement-and-server-revalidated-reconnect');
}
export async function verifyRoutes(actor, runtime) {
    const { page } = actor;
    const otherRegion = actor.region === 'europe' ? 'asian_pacific' : 'europe';
    const badRoutes = [
        `teams/green/${actor.surface}.html?delegation=${otherRegion}`,
        `teams/green/${actor.surface}.html?role=blue_scribe`,
        `teams/green/${actor.surface}.html?team=blue`,
        `teams/green/${actor.surface}.html?session=${runtime.m.actions.europe}`,
        `teams/green/${actor.surface}.html?mode=observer`,
        `teams/green/${actor.surface}.html?delegation=${actor.region}&delegation=${actor.region}`,
        `teams/green/${actor.surface === 'scribe' ? 'facilitator' : 'scribe'}.html?delegation=${actor.region}`
    ];
    for (const [index, route] of badRoutes.entries()) {
        if (index === 0) await runtime.ready(actor, 'permission');
        await page.goto(new URL(route, runtime.m.baseURL).href);
        await expect(page.locator('#seatContextStatus')).toContainText('Permission error');
        await expect(page.locator('#seatContextStatus')).toBeFocused();
        await expect(page.locator('.app-layout, .scribe-shell')).toBeHidden();
        if (index === 0) {
            await runtime.manual(actor, 'permission');
            const retry = page.getByRole('button', { name: 'Retry session validation' });
            await page.keyboard.press('Tab');
            await expect(retry).toBeFocused();
            await page.keyboard.press('Enter');
            await expect(page.locator('#seatContextStatus')).toContainText('Permission error');
        }
        await page.goto(actor.url);
        await identityVisible(actor);
    }
    await page.evaluate(() => {
        const value = JSON.parse(sessionStorage.getItem('esg_session_data'));
        value.role = 'blue_scribe'; value.team = 'blue'; value.delegationId = null;
        sessionStorage.setItem('esg_role', 'blue_scribe');
        sessionStorage.setItem('esg_session_data', JSON.stringify(value));
    });
    await page.goto(new URL(`teams/green/${actor.surface}.html`, runtime.m.baseURL).href);
    await identityVisible(actor);
    check((await sessionInfo(page)).role === actor.role, 'seat must repair stale browser role');
    await runtime.checkpoint(actor, 'base-path-deep-links-tampering-and-stale-storage');
}
export async function verifyRemoval(actor, runtime) {
    const { page } = actor;
    const prefix = `gc04:${runtime.m.sessionId}:2:green:${actor.region}:${actor.role}:${actor.info.seatId}:`;
    const deckKey = `scribe-deck:${runtime.m.sessionId}:green:${actor.region}`;
    await page.evaluate(async ({ prefix, deckKey }) => {
        localStorage.setItem(`${prefix}verification-draft`, 'synthetic local draft probe');
        sessionStorage.setItem(`${prefix}verification-notification`, 'synthetic notification probe');
        const probe = document.createElement('p');
        probe.id = 'gc04PrivateProbe'; probe.textContent = 'GC04 synthetic private DOM probe';
        document.querySelector('.app-layout, .scribe-shell').append(probe);
        await new Promise((resolve, reject) => {
            const request = indexedDB.open('esg-scribe-decks', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('uploaded-decks', { keyPath: 'storageKey' });
            request.onerror = () => reject(new Error('Deck fixture open failed'));
            request.onsuccess = () => {
                const db = request.result, tx = db.transaction('uploaded-decks', 'readwrite');
                tx.objectStore('uploaded-decks').put({ storageKey: deckKey, slides: ['synthetic'] });
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => { db.close(); reject(new Error('Deck fixture write failed')); };
            };
        });
    }, { prefix, deckKey });
    await runtime.ready(actor, 'removal');
    const result = await runtime.operatorRpc('operator_remove_session_participant', {
        requested_session_id: runtime.m.sessionId, requested_session_participant_id: actor.info.seatId
    });
    check(result.status === 200 && result.data.revoked_at && result.data.id === actor.info.seatId, 'operator removal RPC');
    // No refresh or injected store event: production realtime/heartbeat must invalidate.
    await expect(page.locator('#seatContextStatus')).toContainText('Session validation lost', { timeout: 90000 });
    await expect(page.locator('#seatContextStatus')).toBeFocused();
    await expect(page.locator('.app-layout, .scribe-shell, #gc04PrivateProbe')).toHaveCount(0);
    await expect.poll(() => page.evaluate(prefix => [localStorage, sessionStorage].every(storage =>
        Object.keys(storage).every(key => !key.startsWith(prefix))), prefix)).toBe(true);
    await expect.poll(() => page.evaluate(deckKey => new Promise((resolve, reject) => {
        const request = indexedDB.open('esg-scribe-decks', 1);
        request.onerror = () => reject(new Error('Deck verification open failed'));
        request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction('uploaded-decks', 'readonly').objectStore('uploaded-decks').get(deckKey);
            read.onsuccess = () => { db.close(); resolve(read.result === undefined); };
            read.onerror = () => { db.close(); reject(new Error('Deck verification read failed')); };
        };
    }), deckKey), { timeout: 15000 }).toBe(true);
    const denied = await browserRequest(actor, runtime, '/rest/v1/rpc/restore_session_seat_context', 'POST', {
        requested_session_id: runtime.m.sessionId, requested_session_participant_id: actor.info.seatId
    });
    check(denied.status === 403 && denied.data.code === '42501', 'revoked browser RPC denied');
    const rows = await browserRequest(actor, runtime, `/rest/v1/actions?session_id=eq.${runtime.m.sessionId}&select=id`);
    check(rows.status === 200 && Array.isArray(rows.data) && rows.data.length === 0, 'revoked browser RLS closed');
    await runtime.manual(actor, 'removal');
    await runtime.checkpoint(actor, 'operator-removal-dom-storage-deck-and-authority-cleanup');
}

export { ROLES };
