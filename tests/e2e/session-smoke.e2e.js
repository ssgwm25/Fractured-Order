import { test, expect } from '@playwright/test';

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

test('@smoke session creation, Scribe handoff, Facilitator action submit, and White Cell adjudication', async ({ browser }) => {
    test.setTimeout(180000);

    const context = await browser.newContext();
    await enableE2EMockBackend(context);

    const page = await context.newPage();
    const operatorAccessCode = E2E_MOCK_OPERATOR_ACCESS_CODE;
    const sessionName = 'Smoke Session Alpha';
    const sessionCode = 'SMOKE2026';
    const actionGoal = 'Coordinate export controls to reduce semiconductor exposure across allied partners.';
    const orientationTeams = [
        { team: 'blue', orientation: 'pressure' },
        { team: 'green', orientation: 'stabilization' },
        { team: 'red', orientation: 'reframe' },
        { team: 'industry', orientation: 'pressure' }
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
        for (const { team, orientation } of orientationTeams) {
            const teamLabel = team.charAt(0).toUpperCase() + team.slice(1);

            await joinPublicParticipant(page, {
                sessionCode,
                displayName: `${teamLabel} Orientation Lead`,
                team,
                roleSurface: 'facilitator'
            });

            const orientationGoal = await recordStrategicOrientationFromScribe(page, {
                team,
                orientation,
                rationale: `${teamLabel} orientation recorded to complete the pre-move gate.`
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

    await test.step('rejoin as White Cell and adjudicate the submitted action', async () => {
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

        const pendingAction = page.locator('#adjudicationQueue .entity-card').filter({ hasText: actionGoal });
        await expect(pendingAction).toHaveCount(0);

        await page.locator('.sidebar-link[data-section="timeline"]').click();
        await expect(page.locator('#timelineList')).toContainText('ACTION_ADJUDICATED');
        await expect(page.locator('#timelineList')).toContainText('White Cell deliberation recorded: SUCCESS');
    });

    await test.step('verify the mock backend reflects the completed lifecycle', async () => {
        const backendState = await dumpE2EMockBackend(page);
        const actionRecord = backendState.tables.actions.find((action) => action.goal === actionGoal);

        expect(actionRecord).toBeTruthy();
        expect(actionRecord.goal).toBe(actionGoal);
        expect(actionRecord.status).toBe('adjudicated');
        expect(actionRecord.outcome).toBe('SUCCESS');
        expect(actionRecord.submitted_at).toBeTruthy();
        expect(actionRecord.adjudicated_at).toBeTruthy();
    });

    await context.close();
});
