import { expect, recordRehearsalMetrics, test } from './support/rehearsalTest.js';

import {
    dumpE2EMockBackend,
    enableE2EMockBackend,
    E2E_MOCK_OPERATOR_ACCESS_CODE
} from './support/mockBackend.js';
import {
    adjudicateAction,
    authorizeGameMaster,
    authorizeWhiteCell,
    createDraftAction,
    createSessionFromMaster,
    forwardActionToScribe,
    joinPublicParticipant,
    LANDING_URL_PATTERN,
    logoutCurrentUser,
    recordStrategicOrientationFromScribe,
    submitStrategicOrientationFromScribe,
    submitActionFromScribe
} from './support/liveDemoHarness.js';

test('@smoke session creation, Scribe handoff, Facilitator action submit, and White Cell adjudication', async ({ rehearsalBrowser: browser }, testInfo) => {
    test.setTimeout(180000);
    recordRehearsalMetrics(testInfo, { actorCount: 1, sessionCount: 1 });

    const context = await browser.newContext();
    await enableE2EMockBackend(context);

    const page = await context.newPage();
    const operatorAccessCode = E2E_MOCK_OPERATOR_ACCESS_CODE;
    const sessionName = 'Smoke Session Alpha';
    const sessionCode = 'SMOKE2026';
    const actionGoal = 'Coordinate export controls to reduce semiconductor exposure across allied partners.';
    const orientationTeams = [
        { team: 'blue', ownOrientation: 'pressure', forecasts: { red: 'stabilization' }, forecastActionDescription: 'Red will preserve market access while limiting escalation.' },
        { team: 'green', ownOrientation: 'stabilization', forecasts: { blue: 'pressure' }, strategyDescription: 'Green will protect regional stability under Blue pressure.' },
        { team: 'red', ownOrientation: 'reframe', forecasts: { blue: 'pressure', green_asian_pacific: 'reframe', green_europe: 'stabilization' }, orientationRationale: 'Red will reframe its partnerships for long-term leverage.' },
        { team: 'industry', ownOrientation: 'pressure', forecasts: { blue: 'stabilization' }, strategyDescription: 'Industry will protect critical capacity under Blue stabilization.' }
    ];

    await test.step('create a session from the control panel', async () => {
        await authorizeGameMaster(page, {
            displayName: 'Game Master Operator',
            operatorAccessCode
        });

        await createSessionFromMaster(page, {
            sessionName,
            sessionCode,
            description: 'Automated smoke flow for the shipped ESG build.'
        });
    });

    await test.step('complete the required pre-move Strategic Orientation handoffs', async () => {
        for (const orientationFixture of orientationTeams) {
            const { team } = orientationFixture;
            const teamLabel = team.charAt(0).toUpperCase() + team.slice(1);

            await joinPublicParticipant(page, {
                sessionCode,
                displayName: `${teamLabel} Orientation Lead`,
                team,
                roleSurface: 'facilitator'
            });

            const orientationGoal = await recordStrategicOrientationFromScribe(page, {
                ...orientationFixture
            });

            await logoutCurrentUser(page);
            await page.waitForURL(LANDING_URL_PATTERN);

            await joinPublicParticipant(page, {
                sessionCode,
                displayName: `${teamLabel} Orientation Facilitator`,
                team,
                roleSurface: 'scribe'
            });

            await submitStrategicOrientationFromScribe(page, orientationGoal);
            await logoutCurrentUser(page);
            await page.waitForURL(LANDING_URL_PATTERN);
        }
    });

    await test.step('join as Scribe and forward an action to the Facilitator', async () => {
        await joinPublicParticipant(page, {
            sessionCode,
            displayName: 'Blue Lead',
            team: 'blue',
            roleSurface: 'facilitator'
        });

        await createDraftAction(page, {
            goal: actionGoal
        });

        await forwardActionToScribe(page, actionGoal);
    });

    await test.step('join as Facilitator and submit the action to White Cell', async () => {
        await logoutCurrentUser(page);
        await page.waitForURL(LANDING_URL_PATTERN);

        await joinPublicParticipant(page, {
            sessionCode,
            displayName: 'Blue Facilitator',
            team: 'blue',
            roleSurface: 'scribe'
        });

        await submitActionFromScribe(page, actionGoal);
    });

    await test.step('rejoin as White Cell and accept the submitted action as complete', async () => {
        await logoutCurrentUser(page);
        await page.waitForURL(LANDING_URL_PATTERN);

        await authorizeWhiteCell(page, {
            sessionCode,
            displayName: 'White Cell Lead',
            operatorAccessCode
        });

        await adjudicateAction(page, {
            goal: actionGoal,
            notes: 'Approved in smoke test to verify the live submitted-to-adjudicated flow.'
        });

        const pendingAction = page.locator('#actionsList [data-review-panel="pending"] .entity-card').filter({ hasText: actionGoal });
        await expect(pendingAction).toHaveCount(0);

        await page.locator('.sidebar-link[data-section="timeline"]').click();
        await expect(page.locator('#timelineList')).toContainText('ARTIFACT_COMPLETED');
        await expect(page.locator('#timelineList')).toContainText('Blue Team action revision 1 accepted as complete by White Cell.');
    });

    await test.step('verify the mock backend reflects the completed lifecycle', async () => {
        const backendState = await dumpE2EMockBackend(page);
        const actionRecord = backendState.tables.actions.find((action) => action.goal === actionGoal);

        expect(actionRecord).toBeTruthy();
        expect(actionRecord.goal).toBe(actionGoal);
        expect(actionRecord.status).toBe('adjudicated');
        expect(actionRecord.workflow_state).toBe('completed');
        expect(actionRecord.outcome).toBeNull();
        expect(actionRecord.submitted_at).toBeTruthy();
        expect(actionRecord.adjudicated_at).toBeTruthy();
    });

    await context.close();
});
