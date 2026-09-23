import { expect, test } from '@playwright/test';

import { seedDeckProbe, readDeckProbe } from '../../scripts/gc04-deck-probe.mjs';
import { buildAppUrl } from './support/rehearsalRuntime.js';

const operatorAccessCode = String(process.env.GC09_REHEARSAL_OPERATOR_ACCESS_CODE || '').trim();
const projectRef = String(process.env.GC09_REHEARSAL_PROJECT_REF || '').trim();
const runId = String(process.env.GC09_UNIFIED_CLEANUP_RUN || '').trim();
const abandonedSessionId = String(process.env.GC09_ABANDONED_SESSION_ID || '').trim();

if (!operatorAccessCode) throw new Error('Set GC09_REHEARSAL_OPERATOR_ACCESS_CODE for the rehearsal Game Master.');
if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error('Set GC09_REHEARSAL_PROJECT_REF to the 20-character rehearsal project reference.');
if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('Set GC09_UNIFIED_CLEANUP_RUN to a new simple run identifier.');
if (abandonedSessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(abandonedSessionId)) {
    throw new Error('GC09_ABANDONED_SESSION_ID must be the exact UUID from a retained failed run.');
}

async function minimizeGuide(page) {
    const guide = page.locator('.follow-along').first();
    await expect(guide).toBeAttached();
    if (await guide.getAttribute('data-minimized') !== 'true') {
        await guide.getByRole('button', { name: 'Minimize to sidebar', exact: true }).click();
    }
}

async function authorizeGameMaster(page) {
    await page.goto(buildAppUrl());
    await page.locator('#displayName').fill(`GC09 synthetic cleanup GM ${runId}`);
    const access = page.locator('#operatorAccessSection');
    if (!(await access.evaluate((element) => element.hasAttribute('open')))) {
        await access.locator('summary').click();
    }
    await page.locator('#operatorAccessCode').fill(operatorAccessCode);
    await page.locator('#operatorGameMasterBtn').click();
    await page.waitForURL(/master\.html/);
    await minimizeGuide(page);
}

async function createUnifiedFixture(page, sessionName, sessionCode) {
    await page.locator('.sidebar-link[data-section="sessions"]').click();
    await page.locator('#createSessionBtn').click();
    const modal = page.locator('.modal-overlay.modal-visible:not(.modal-hiding)')
        .filter({ has: page.locator('#createSessionForm') });
    await expect(modal).toBeVisible();
    await modal.locator('#newSessionName').fill(sessionName);
    await modal.locator('#newSessionCode').fill(sessionCode);
    await modal.locator('#newSessionDescription').fill(
        'Authorized GC09 synthetic unified cleanup verification only; not exercise approval or participant decisions.'
    );
    await modal.locator('#newSessionGreenConfiguration').selectOption('unified_v1');
    await modal.getByRole('button', { name: 'Create Session', exact: true }).click();
    const option = page.locator('#participantsSessionSelect option').filter({ hasText: sessionCode });
    await expect(option).toBeAttached();
    return option.getAttribute('value');
}

async function joinUnifiedGreenFacilitator(page, sessionCode) {
    await page.goto(buildAppUrl());
    await page.locator('#displayName').fill(`GC09 synthetic unified Facilitator ${runId}`);
    await page.locator('#sessionCode').fill(sessionCode);
    await page.locator('#checkSessionBtn').click();
    await expect(page.locator('#joinStatus')).toContainText('unified Green');
    await page.locator('[data-team="green"]').click();
    await page.locator('[data-role-surface="scribe"]').click();
    await page.locator('#joinForm button[type="submit"]').click();
    await expect(page.locator('#sessionRoleLabel')).toHaveText('Facilitator');
    await minimizeGuide(page);
    return page.evaluate(() => JSON.parse(sessionStorage.getItem('esg_session_data')));
}

async function openSessionDetails(page, sessionId) {
    await page.reload();
    await minimizeGuide(page);
    await page.locator('.sidebar-link[data-section="sessions"]').click();
    const card = page.locator(`#sessionsList [data-session-id="${sessionId}"]`);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /View details/i }).click();
    await expect(page.locator('#sessionDetailSection')).toBeVisible();
}

async function archiveFixture(page, sessionId) {
    await page.reload();
    await minimizeGuide(page);
    await page.locator('.sidebar-link[data-section="sessions"]').click();
    const card = page.locator(`#sessionsList [data-session-id="${sessionId}"]`);
    if (!await card.isVisible().catch(() => false)) {
        return page.locator(`#archivedSessionsList [data-session-id="${sessionId}"]`).isVisible().catch(() => false);
    }
    await card.getByRole('button', { name: /Archive /i }).click();
    const modal = page.locator('.modal-overlay.modal-visible:not(.modal-hiding)')
        .filter({ hasText: 'Archive Session' });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Archive', exact: true }).click({ timeout: 10000 });
    await expect(page.locator(`#archivedSessionsList [data-session-id="${sessionId}"]`)).toBeVisible();
    return true;
}

test('hosted unified Green Facilitator removal deletes only its browser-local deck', async ({ browser }, testInfo) => {
    const suffix = runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase();
    const sessionCode = `GC09UC${suffix}`;
    const sessionName = `GC09 SYNTHETIC UNIFIED CLEANUP ${runId}`;
    const networkHosts = new Set();
    const gmContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const participantContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const gm = await gmContext.newPage();
    const participant = await participantContext.newPage();
    let sessionId = null;
    let seatId = null;
    let deckKey = null;
    let archived = false;
    let joinedSeat = null;
    let beforeRemoval = null;
    let afterRemoval = null;
    let afterReload = null;
    let deniedMessage = null;
    let abandonedSessionArchived = false;

    for (const page of [gm, participant]) {
        page.on('request', (request) => {
            const hostname = new URL(request.url()).hostname;
            if (hostname.endsWith('.supabase.co')) networkHosts.add(hostname);
        });
    }

    try {
        await authorizeGameMaster(gm);
        if (abandonedSessionId) {
            abandonedSessionArchived = await archiveFixture(gm, abandonedSessionId);
            expect(abandonedSessionArchived).toBe(true);
        }
        sessionId = await createUnifiedFixture(gm, sessionName, sessionCode);
        expect(sessionId).toBeTruthy();

        joinedSeat = await joinUnifiedGreenFacilitator(participant, sessionCode);
        expect(joinedSeat).toMatchObject({
            id: sessionId,
            role: 'green_scribe',
            team: 'green',
            delegationId: null,
            sessionTopologyVersion: 1,
            greenSeatModel: 'unified_v1'
        });
        seatId = joinedSeat.participantSessionId;
        deckKey = `scribe-deck:${sessionId}:green`;
        await seedDeckProbe(participant, deckKey);
        beforeRemoval = await readDeckProbe(participant, deckKey);
        expect(beforeRemoval).toEqual({ own: true, retained: true });

        await openSessionDetails(gm, sessionId);
        const remove = gm.locator(
            `#participantsListDetail [data-remove-session-participant-id="${seatId}"]`
        );
        await expect(remove).toBeVisible();
        await remove.click();
        const removalModal = gm.locator('.modal-overlay.modal-visible:not(.modal-hiding)')
            .filter({ hasText: 'Remove Participant' });
        await expect(removalModal).toBeVisible();
        await removalModal.getByRole('button', { name: 'Remove Participant', exact: true }).click();
        await expect(remove).toHaveCount(0);

        await expect(participant.locator('#seatContextStatus')).toContainText(
            /Session validation lost|Session permission denied/,
            { timeout: 75000 }
        );
        deniedMessage = await participant.locator('#seatContextStatus').innerText();
        await expect.poll(async () => {
            afterRemoval = await readDeckProbe(participant, deckKey);
            return afterRemoval;
        }, { timeout: 15000 }).toEqual({ own: false, retained: true });
        await participant.reload();
        await expect(participant.locator('#seatContextStatus')).toContainText('Session permission denied');
        afterReload = await readDeckProbe(participant, deckKey);
        expect(afterReload).toEqual({ own: false, retained: true });
        expect([...networkHosts].sort()).toEqual([`${projectRef}.supabase.co`]);
    } finally {
        if (sessionId) archived = await archiveFixture(gm, sessionId).catch(() => false);
        await testInfo.attach('gc09-unified-cleanup-result.json', {
            body: JSON.stringify({
                runId, projectRef, sessionId, sessionCode, seatId, deckKey, archived,
                role: joinedSeat?.role || null,
                sessionTopologyVersion: joinedSeat?.sessionTopologyVersion ?? null,
                greenSeatModel: joinedSeat?.greenSeatModel || null,
                beforeRemoval, afterRemoval, afterReload, deniedMessage,
                abandonedSessionId: abandonedSessionId || null,
                abandonedSessionArchived,
                syntheticOnly: true, exerciseApproval: false, networkHosts: [...networkHosts]
            }, null, 2),
            contentType: 'application/json'
        });
        await participantContext.close().catch(() => {});
        await gmContext.close().catch(() => {});
    }

    expect(archived).toBe(true);
});
