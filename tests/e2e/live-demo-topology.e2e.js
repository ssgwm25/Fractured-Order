import { test, expect } from '@playwright/test';

import { dumpE2EMockBackend } from './support/mockBackend.js';
import {
    buildAppUrl,
    LANDING_URL_PATTERN,
    authorizeGameMaster,
    authorizeWhiteCell,
    createDraftAction,
    createIsolatedActorPage,
    createSessionFromMaster,
    adjudicateAction,
    expectJoinFailure,
    getActiveSeatCounts,
    getSessionFromState,
    joinPublicParticipant,
    logoutCurrentUser,
    openSidebarSection,
    submitAction,
    waitForToast
} from './support/liveDemoHarness.js';

async function fillAndWaitForAutoSave(page, {
    section,
    fieldSelector,
    value,
    statusSelector
}) {
    await openSidebarSection(page, section);
    await page.locator(fieldSelector).fill(value);
    await expect(page.locator(statusSelector)).toHaveText('Saved to your notes');
}

test('@live-demo one-team topology covers operator session creation, onboarding, White Cell access, the dedicated scribe deck, and seat contention', async ({ browser }) => {
    test.slow();

    const context = await browser.newContext();
    const sessionCode = 'TOPO2026';
    const actionGoal = 'Coordinate allied export controls before the next semiconductor escalation window.';

    const gameMaster = await createIsolatedActorPage(context, 'game-master', { resetBackend: true });
    const intruder = await createIsolatedActorPage(context, 'whitecell-intruder');

    await test.step('block direct White Cell access without operator auth', async () => {
        await intruder.goto(buildAppUrl('whitecell.html'));
        await expect(intruder).toHaveURL(/operatorAccessSection/);
        await expect(intruder.locator('#operatorAccessSection')).toBeVisible();
    });

    const facilitator = await createIsolatedActorPage(context, 'blue-facilitator');
    const scribe = await createIsolatedActorPage(context, 'blue-scribe');
    const notetakers = [];
    let whiteCellLead;
    let whiteCellSupport;

    await test.step('create a live-demo session from the operator surface', async () => {
        await authorizeGameMaster(gameMaster, {
            displayName: 'Topology Game Master'
        });

        await createSessionFromMaster(gameMaster, {
            sessionName: 'Live Demo Topology Rehearsal',
            sessionCode,
            description: 'Automated rehearsal for the one-team live demo seat model.'
        });
    });

    await test.step('fill the one-team public and operator seat topology', async () => {
        await joinPublicParticipant(facilitator, {
            sessionCode,
            displayName: 'Blue Facilitator',
            team: 'blue',
            roleSurface: 'facilitator'
        });

        await joinPublicParticipant(scribe, {
            sessionCode,
            displayName: 'Blue Scribe',
            team: 'blue',
            roleSurface: 'scribe'
        });

        for (let index = 1; index <= 2; index += 1) {
            const page = await createIsolatedActorPage(context, `blue-notetaker-${index}`);
            await joinPublicParticipant(page, {
                sessionCode,
                displayName: `Blue Notetaker ${index}`,
                team: 'blue',
                roleSurface: 'notetaker'
            });
            notetakers.push(page);
        }

        whiteCellLead = await createIsolatedActorPage(context, 'blue-whitecell-lead');
        whiteCellSupport = await createIsolatedActorPage(context, 'blue-whitecell-support');

        await authorizeWhiteCell(whiteCellLead, {
            sessionCode,
            displayName: 'White Cell Lead',
            operatorRole: 'lead'
        });

        await authorizeWhiteCell(whiteCellSupport, {
            sessionCode,
            displayName: 'White Cell Support',
            operatorRole: 'support'
        });

        await expect(whiteCellSupport.locator('#startTimerBtn')).toBeDisabled();

        const extraFacilitator = await createIsolatedActorPage(context, 'extra-facilitator');
        const extraScribe = await createIsolatedActorPage(context, 'extra-scribe');
        const extraNotetaker = await createIsolatedActorPage(context, 'extra-notetaker');

        await expectJoinFailure(extraFacilitator, {
            sessionCode,
            displayName: 'Blocked Facilitator',
            team: 'blue',
            roleSurface: 'facilitator'
        }, 'The requested role is full. Please choose another seat.');

        await expectJoinFailure(extraScribe, {
            sessionCode,
            displayName: 'Blocked Scribe',
            team: 'blue',
            roleSurface: 'scribe'
        }, 'The requested role is full. Please choose another seat.');

        await expectJoinFailure(extraNotetaker, {
            sessionCode,
            displayName: 'Blocked Notetaker',
            team: 'blue',
            roleSurface: 'notetaker'
        }, 'The requested role is full. Please choose another seat.');
    });

    await test.step('verify the dedicated scribe deck and complete the facilitator to White Cell workflow', async () => {
        await createDraftAction(facilitator, {
            goal: actionGoal
        });

        await expect(scribe).toHaveURL(/\/teams\/blue\/scribe\.html(?:\?.*)?$/);
        await expect(scribe.locator('body')).toHaveAttribute('data-role-surface', 'scribe');
        await expect(scribe.locator('body')).toHaveAttribute('data-scribe-deck-state', 'ready');
        await expect(scribe.locator('#scribeSectionList')).toContainText('Communications');
        await expect(scribe.locator('#deckActionFrame')).toBeVisible();
        await expect(scribe.locator('#deckSlideImage')).toBeHidden();
        await expect(scribe.locator('#main-content')).toContainText(actionGoal);
        await expect(scribe.locator('#newActionBtn')).toHaveCount(0);

        const actionsSectionTrigger = scribe.locator('#scribeSectionList .scribe-section-trigger').first();
        await expect(actionsSectionTrigger).toContainText('Actions');
        await actionsSectionTrigger.click();

        const actionSlideLink = scribe.locator('#scribeSectionList button[data-slide-key^="action-"]').first();
        await expect(actionSlideLink).toBeVisible();
        await expect(actionSlideLink).toContainText(actionGoal);
        await actionSlideLink.click();
        await expect(scribe.locator('#deckActionFrame')).toBeVisible();
        await expect(scribe.locator('#main-content')).toContainText(actionGoal);

        await submitAction(facilitator, actionGoal);

        await adjudicateAction(whiteCellLead, {
            goal: actionGoal,
            notes: 'Approved by White Cell lead during the topology rehearsal.'
        });

        await expect(whiteCellLead.locator('#adjudicationQueue')).toContainText('No actions are waiting for White Cell deliberation.');

        await expect(scribe.locator('#nextSlideBtn')).toBeVisible();
        await expect(scribe.locator('#main-content')).toContainText(actionGoal);
        await expect(scribe.locator('#main-content')).toContainText('Approved by White Cell lead during the topology rehearsal.');
    });

    await test.step('record the active seat counts for the one-team topology', async () => {
        const backendState = await dumpE2EMockBackend(gameMaster);
        const session = getSessionFromState(backendState, sessionCode);

        expect(session).toBeTruthy();
        expect(getActiveSeatCounts(backendState, session.id)).toEqual(expect.objectContaining({
            blue_facilitator: 1,
            blue_scribe: 1,
            blue_notetaker: 2,
            whitecell_lead: 1,
            whitecell_support: 1
        }));
    });

    await context.close();
});

test('@live-demo facilitator disconnect recovery and concurrent notetaker capture behavior hold under multi-user writes', async ({ browser }) => {
    test.slow();

    const context = await browser.newContext();
    const sessionCode = 'RECOV2026';

    const gameMaster = await createIsolatedActorPage(context, 'recovery-game-master', { resetBackend: true });
    const facilitator = await createIsolatedActorPage(context, 'recovery-facilitator-a');
    const facilitatorRetry = await createIsolatedActorPage(context, 'recovery-facilitator-b');
    const noteOne = await createIsolatedActorPage(context, 'recovery-notetaker-1');
    const noteTwo = await createIsolatedActorPage(context, 'recovery-notetaker-2');

    await test.step('set up the session and prove facilitator seat recovery after disconnect', async () => {
        await authorizeGameMaster(gameMaster, {
            displayName: 'Recovery Game Master'
        });

        await createSessionFromMaster(gameMaster, {
            sessionName: 'Seat Recovery Rehearsal',
            sessionCode,
            description: 'Automated recovery and concurrency rehearsal.'
        });

        await joinPublicParticipant(facilitator, {
            sessionCode,
            displayName: 'Recovery Facilitator A',
            team: 'blue',
            roleSurface: 'facilitator'
        });

        await expectJoinFailure(facilitatorRetry, {
            sessionCode,
            displayName: 'Recovery Facilitator B',
            team: 'blue',
            roleSurface: 'facilitator'
        }, 'The requested role is full. Please choose another seat.');

        await logoutCurrentUser(facilitator);
        await facilitator.waitForURL(LANDING_URL_PATTERN);

        await joinPublicParticipant(facilitatorRetry, {
            sessionCode,
            displayName: 'Recovery Facilitator B',
            team: 'blue',
            roleSurface: 'facilitator'
        });
    });

    await test.step('preserve seat-scoped notetaker notes while shared captures append from two concurrent notetakers and survive logout', async () => {
        await joinPublicParticipant(noteOne, {
            sessionCode,
            displayName: 'Recovery Notetaker 1',
            team: 'blue',
            roleSurface: 'notetaker'
        });

        await joinPublicParticipant(noteTwo, {
            sessionCode,
            displayName: 'Recovery Notetaker 2',
            team: 'blue',
            roleSurface: 'notetaker'
        });

        await fillAndWaitForAutoSave(noteOne, {
            section: 'dynamics',
            fieldSelector: '#dynamicsSummary',
            value: 'Seat one summary',
            statusSelector: '#dynamicsAutoSave'
        });

        await fillAndWaitForAutoSave(noteTwo, {
            section: 'dynamics',
            fieldSelector: '#dynamicsSummary',
            value: 'Seat two summary',
            statusSelector: '#dynamicsAutoSave'
        });

        await fillAndWaitForAutoSave(noteOne, {
            section: 'alliance',
            fieldSelector: '#allianceNotes',
            value: 'Seat one alliance notes',
            statusSelector: '#allianceAutoSave'
        });

        await fillAndWaitForAutoSave(noteTwo, {
            section: 'alliance',
            fieldSelector: '#allianceNotes',
            value: 'Seat two alliance notes',
            statusSelector: '#allianceAutoSave'
        });

        await openSidebarSection(noteOne, 'capture');
        await noteOne.locator('#captureContent').fill('Seat one capture');
        await noteOne.locator('#captureForm').getByRole('button', { name: 'Save Observation' }).click();
        await waitForToast(noteOne, 'Observation saved');

        await openSidebarSection(noteTwo, 'capture');
        await noteTwo.locator('#captureContent').fill('Seat two capture');
        await noteTwo.locator('#captureForm').getByRole('button', { name: 'Save Observation' }).click();
        await waitForToast(noteTwo, 'Observation saved');

        await logoutCurrentUser(noteOne);
        await logoutCurrentUser(noteTwo);
        await noteOne.waitForURL(LANDING_URL_PATTERN);
        await noteTwo.waitForURL(LANDING_URL_PATTERN);

        await joinPublicParticipant(noteOne, {
            sessionCode,
            displayName: 'Recovery Notetaker 1',
            team: 'blue',
            roleSurface: 'notetaker'
        });

        await joinPublicParticipant(noteTwo, {
            sessionCode,
            displayName: 'Recovery Notetaker 2',
            team: 'blue',
            roleSurface: 'notetaker'
        });

        await expect(noteOne.locator('#recentCaptures')).toContainText('Seat one capture');
        await expect(noteOne.locator('#recentCaptures')).toContainText('Seat two capture');
        await expect(noteTwo.locator('#recentCaptures')).toContainText('Seat one capture');
        await expect(noteTwo.locator('#recentCaptures')).toContainText('Seat two capture');

        await openSidebarSection(noteOne, 'dynamics');
        await openSidebarSection(noteTwo, 'dynamics');
        await expect(noteOne.locator('#dynamicsSummary')).toHaveValue('Seat one summary');
        await expect(noteTwo.locator('#dynamicsSummary')).toHaveValue('Seat two summary');

        await openSidebarSection(noteOne, 'alliance');
        await openSidebarSection(noteTwo, 'alliance');
        await expect(noteOne.locator('#allianceNotes')).toHaveValue('Seat one alliance notes');
        await expect(noteTwo.locator('#allianceNotes')).toHaveValue('Seat two alliance notes');
    });

    await test.step('verify the shared backend kept both notetaker participants and the recovered facilitator seat', async () => {
        const backendState = await dumpE2EMockBackend(gameMaster);
        const session = getSessionFromState(backendState, sessionCode);
        const noteRecord = backendState.tables.notetaker_data.find((record) => (
            record.session_id === session.id && record.move === 1
        ));

        expect(session).toBeTruthy();
        expect(getActiveSeatCounts(backendState, session.id)).toEqual(expect.objectContaining({
            blue_facilitator: 1,
            blue_notetaker: 2
        }));
        expect(Object.keys(noteRecord.dynamics_analysis.team_entries.blue.participant_entries)).toHaveLength(2);
        expect(noteRecord.observation_timeline.map((entry) => entry.content)).toEqual(expect.arrayContaining([
            'Seat one capture',
            'Seat two capture'
        ]));
    });

    await context.close();
});
