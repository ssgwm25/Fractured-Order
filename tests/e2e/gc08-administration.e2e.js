import { expect, test } from '@playwright/test';
import { authorizeGameMaster, authorizeWhiteCell, createIsolatedActorPage, createProposal,
    submitForwardedProposalFromFacilitator, minimizeStartHereGuide, buildAppUrl,
    recordStrategicOrientationFromScribe, submitStrategicOrientationFromScribe } from './support/liveDemoHarness.js';

async function openCreation(page) {
    await page.locator('.sidebar-link[data-section="sessions"]').click();
    await page.locator('#createSessionBtn').click();
    await expect(page.locator('#createSessionForm')).toBeVisible();
    await page.locator('#newSessionName').fill('GC08 synthetic UI creation');
    await page.locator('#newSessionCode').fill('GC08UI');
}
async function seedApproval(page) {
    // Only the pre-existing approval registry is a fixture. Sessions, seats,
    // handoffs and submissions below must be created through the normal UI.
    await page.evaluate(() => {
        const state = globalThis.__ESG_E2E_BACKEND__.dump();
        state.tables.green_roster_approvals = [{ version: 'green-roster-v1', approved_by: 'GC08 synthetic only', approved_at: new Date().toISOString(),
            snapshot: { asian_pacific: ['ROK', 'Japan', 'ASEAN'], europe: ['UK', 'France', 'EU'], aliases: { 'South Korea': 'ROK' },
                source_references: ['Synthetic UI fixture, never exercise approval'] } }];
        localStorage.setItem('esg_e2e_backend_state', JSON.stringify(state));
    });
}
async function join(page, region = null, { team = 'green', roleSurface = region ? 'facilitator' : 'scribe' } = {}) {
    await page.goto(buildAppUrl());
    await page.locator('#displayName').fill(region || (team === 'green' ? 'Shared Facilitator' : `Synthetic ${team} ${roleSurface}`));
    await page.locator('#sessionCode').fill('GC08UI');
    await page.locator('#checkSessionBtn').click();
    await expect(page.locator('#joinStatus')).toContainText('two Scribes and one shared Facilitator');
    await page.locator(`[data-team="${team}"]`).click();
    if (region) await page.locator(`[data-delegation="${region}"]`).click();
    await page.locator(`[data-role-surface="${roleSurface}"]`).click();
    await page.locator('#joinForm button[type="submit"]').click();
    const expectedRole = team === 'green'
        ? region === 'asian_pacific' ? 'Asia-Pacific' : region === 'europe' ? 'Europe' : 'Shared Facilitator'
        : roleSurface === 'facilitator' ? 'Scribe' : 'Facilitator';
    await expect(page.locator('#sessionRoleLabel')).toContainText(expectedRole);
    await expect(page.locator('body')).toHaveAttribute('data-team', team);
    if (region || team !== 'green') {
        await minimizeStartHereGuide(page);
    } else {
        // GC09 now supplies the shared guide; retain the GC08 workspace checks
        // and deliberately minimize guidance before exercising the workflow.
        await expect(page.locator('body')).toHaveAttribute('data-scribe-deck-state', 'ready');
        await expect(page.locator('#sharedGreenWorkingRegion')).toBeVisible();
        await expect(page.locator('#sharedGreenWorkingRegion')).toBeEnabled();
        await expect(page.locator('#sharedGreenWorkingRegion option')).toHaveCount(2);
        await minimizeStartHereGuide(page);
        await expect(page.locator('.follow-along')).toHaveAttribute('data-minimized', 'true');
    }
}

async function completeOrientationPrerequisite(context, gm, ap, eu, fac, sessionId) {
    // All five required subjects use normal authoring and submission controls.
    // These are explicitly synthetic inputs on the UI-created mock session.
    for (const [region, scribe] of [['asian_pacific', ap], ['europe', eu]]) {
        const goal = await recordStrategicOrientationFromScribe(scribe, {
            team: 'green', rationale: `Synthetic GC08 ${region} orientation prerequisite`
        });
        await fac.locator('#sharedGreenWorkingRegion').selectOption(region);
        const actionId = await submitStrategicOrientationFromScribe(fac, goal);
        await expect.poll(() => gm.evaluate((id) => globalThis.__ESG_E2E_BACKEND__.dump().tables.actions
            .find((action) => action.id === id), actionId)).toMatchObject({
            id: actionId, session_id: sessionId, team: 'green', delegation_id: region,
            status: 'submitted', workflow_state: 'submitted_to_white_cell',
            revision_number: 1, orientation_handoff_revision: 1,
            submitted_by_role: 'green_shared_facilitator'
        });
    }
    for (const team of ['blue', 'red', 'industry']) {
        const scribe = await createIsolatedActorPage(context, `gc08-${team}-scribe`);
        const facilitator = await createIsolatedActorPage(context, `gc08-${team}-facilitator`);
        try {
            // Legacy surface names are intentionally inverted for these roles.
            await join(scribe, null, { team, roleSurface: 'facilitator' });
            await join(facilitator, null, { team, roleSurface: 'scribe' });
            const goal = await recordStrategicOrientationFromScribe(scribe, {
                team, rationale: `Synthetic GC08 ${team} orientation prerequisite`
            });
            await submitStrategicOrientationFromScribe(facilitator, goal);
        } finally {
            await Promise.all([scribe.close(), facilitator.close()]);
        }
    }
    await expect.poll(() => gm.evaluate((sid) => globalThis.__ESG_E2E_BACKEND__.dump().tables.actions
        .filter((a) => a.session_id === sid && a.mechanism === 'Strategic Orientation' && a.status === 'submitted')
        .map((a) => a.delegation_id ? `${a.team}:${a.delegation_id}` : a.team).sort(), sessionId))
        .toEqual(['blue', 'green:asian_pacific', 'green:europe', 'industry', 'red']);
}

test('keyboard regional creation leads to all three joins and both real Scribe handoffs to White Cell', async ({ context }) => {
    test.setTimeout(3 * 60 * 1000);
    const gm = await createIsolatedActorPage(context, 'gc08-gm', { resetBackend: true });
    await authorizeGameMaster(gm, { displayName: 'GC08 synthetic GM' });
    await seedApproval(gm);
    await openCreation(gm);
    await gm.locator('#newSessionGreenConfiguration').focus();
    await gm.keyboard.press('ArrowDown');
    await gm.keyboard.press('Tab');
    await expect(gm.locator('#newSessionRoster')).toBeEnabled();
    await gm.locator('#newSessionRoster').focus();
    await gm.keyboard.press('ArrowDown');
    await gm.keyboard.press('Tab');
    await expect(gm.locator('#newSessionSetupSummary')).toContainText('green-roster-v1');
    const createButton = gm.getByRole('button', { name: 'Create Session', exact: true });
    await createButton.focus(); await gm.keyboard.press('Enter');
    await expect(gm.locator('[data-session-configuration]')).toContainText('one Shared Green Facilitator');
    const created = await gm.evaluate(() => globalThis.__ESG_E2E_BACKEND__.dump().tables.sessions.find((s) => s.session_code === 'GC08UI'));
    expect(created.green_roster_snapshot.europe).toEqual(['UK', 'France', 'EU']);

    const ap = await createIsolatedActorPage(context, 'gc08-ap');
    const eu = await createIsolatedActorPage(context, 'gc08-eu');
    const fac = await createIsolatedActorPage(context, 'gc08-fac');
    await join(ap, 'asian_pacific'); await join(eu, 'europe'); await join(fac);
    await ap.locator('#newActionBtn').click();
    await expect(ap.locator('#toast-container')).toContainText('Strategic Orientation is required before Move 1 begins');
    await expect(ap.locator('#proposalTitle')).toHaveCount(0);
    await completeOrientationPrerequisite(context, gm, ap, eu, fac, created.id);
    await Promise.all([createProposal(ap, { title: 'Synthetic Asia-Pacific proposal' }), createProposal(eu, { title: 'Synthetic Europe proposal' })]);
    await expect.poll(() => gm.evaluate((sid) => globalThis.__ESG_E2E_BACKEND__.dump().tables.actions
        .filter((a) => a.session_id === sid && a.artifact_type === 'proposal')
        .map(({ team, delegation_id, goal, status, workflow_state, revision_number, proposal_handoff_revision }) =>
            ({ team, delegation_id, goal, status, workflow_state, revision_number, proposal_handoff_revision }))
        .sort((a, b) => a.delegation_id.localeCompare(b.delegation_id)), created.id)).toEqual([
        { team: 'green', delegation_id: 'asian_pacific', goal: 'Synthetic Asia-Pacific proposal', status: 'draft',
            workflow_state: 'forwarded_to_facilitator', revision_number: 1, proposal_handoff_revision: 1 },
        { team: 'green', delegation_id: 'europe', goal: 'Synthetic Europe proposal', status: 'draft',
            workflow_state: 'forwarded_to_facilitator', revision_number: 1, proposal_handoff_revision: 1 }
    ]);
    await expect(ap.locator('#actionsList')).not.toContainText('Synthetic Europe proposal');
    await expect(eu.locator('#actionsList')).not.toContainText('Synthetic Asia-Pacific proposal');
    for (const [region, title] of [['asian_pacific','Synthetic Asia-Pacific proposal'], ['europe','Synthetic Europe proposal']]) {
        await fac.locator('#sharedGreenWorkingRegion').selectOption(region);
        await submitForwardedProposalFromFacilitator(fac, { title });
    }
    for (const region of ['asian_pacific', 'europe']) {
        await fac.locator('#sharedGreenWorkingRegion').selectOption(region);
        await fac.locator('#rfiViewBtn').click();
        await fac.locator('[data-facilitator-new-rfi]:visible').click();
        await fac.locator('#rfiQuestion').fill(`Synthetic ${region} question?`);
        await fac.locator('[data-rfi-checkbox="category"]').last().check();
        await fac.locator('#rfiForm button[type="submit"]').click();
        await expect(fac.locator('#rfiForm')).toHaveCount(0);
    }
    const wc = await createIsolatedActorPage(context, 'gc08-wc');
    await authorizeWhiteCell(wc, { sessionCode: 'GC08UI', displayName: 'Synthetic White Cell' });
    await wc.locator('.sidebar-link[data-section="proposals"]').click();
    await expect(wc.locator('#proposalsList')).toContainText('Synthetic Asia-Pacific proposal');
    await expect(wc.locator('#proposalsList')).toContainText('Synthetic Europe proposal');
    await wc.locator('label:visible').filter({ hasText: 'Green delegation view' }).locator('select').selectOption('europe');
    await expect(wc.locator('#proposalsList')).not.toContainText('Synthetic Asia-Pacific proposal');
    await expect(wc.locator('#proposalsList')).toContainText('Synthetic Europe proposal');
    await wc.locator('.sidebar-link[data-section="requests"]').click();
    await expect(wc.locator('#rfiQueue')).toContainText('Synthetic asian_pacific question?');
    await expect(wc.locator('#rfiQueue')).toContainText('Synthetic europe question?');
    await wc.locator('label:visible').filter({ hasText: 'Green delegation view' }).locator('select').selectOption('europe');
    await expect(wc.locator('#rfiQueue')).not.toContainText('Synthetic asian_pacific question?');
    await expect(wc.locator('#rfiQueue')).toContainText('Synthetic europe question?');
    const state = await gm.evaluate(() => globalThis.__ESG_E2E_BACKEND__.dump());
    expect(state.tables.game_state.filter((g) => g.session_id === created.id)).toHaveLength(1);
    expect(state.tables.actions.filter((a) => a.session_id === created.id && a.artifact_type === 'proposal').map((a) => a.status)).toEqual(['submitted', 'submitted']);
    expect(state.tables.requests.filter((r) => r.session_id === created.id).map((r) => r.delegation_id)).toEqual(['asian_pacific', 'europe']);
});

test('missing approval blocks regional creation and leaves unified creation available', async ({ context }) => {
    const gm = await createIsolatedActorPage(context, 'gc08-empty', { resetBackend: true });
    await authorizeGameMaster(gm, { displayName: 'GC08 synthetic GM' });
    await openCreation(gm);
    await gm.locator('#newSessionGreenConfiguration').selectOption('shared_facilitator_v1');
    await expect(gm.locator('#newSessionRosterStatus')).toContainText('No approved roster');
    await gm.getByRole('button', { name: 'Create Session', exact: true }).click();
    await expect(gm.locator('#newSessionCreationStatus')).toContainText('requires an existing approved roster');
    expect(await gm.evaluate(() => globalThis.__ESG_E2E_BACKEND__.dump().tables.sessions.length)).toBe(0);
    await gm.locator('#newSessionGreenConfiguration').selectOption('unified_v1');
    await gm.getByRole('button', { name: 'Create Session', exact: true }).click();
    await expect(gm.locator('[data-session-configuration]')).toHaveText('Unified Green');
});
