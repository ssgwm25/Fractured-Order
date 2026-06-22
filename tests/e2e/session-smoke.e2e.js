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
    joinPublicParticipant,
    LANDING_URL_PATTERN,
    logoutCurrentUser,
    submitAction
} from './support/liveDemoHarness.js';

test('@smoke session creation, role join, action submit, and White Cell adjudication', async ({ browser }) => {
    const context = await browser.newContext();
    await enableE2EMockBackend(context);

    const page = await context.newPage();
    const operatorAccessCode = E2E_MOCK_OPERATOR_ACCESS_CODE;
    const sessionName = 'Smoke Session Alpha';
    const sessionCode = 'SMOKE2026';
    const actionGoal = 'Coordinate export controls to reduce semiconductor exposure across allied partners.';

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

    await test.step('join as facilitator and submit an action', async () => {
        await joinPublicParticipant(page, {
            sessionCode,
            displayName: 'Blue Lead',
            team: 'blue',
            roleSurface: 'facilitator'
        });

        await createDraftAction(page, {
            goal: actionGoal
        });

        await submitAction(page, actionGoal);
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

        await expect(page.locator('#adjudicationQueue')).toContainText('No actions are waiting for White Cell deliberation.');

        await page.locator('.sidebar-link[data-section="timeline"]').click();
        await expect(page.locator('#timelineList')).toContainText('Action adjudicated: SUCCESS');
    });

    await test.step('verify the mock backend reflects the completed lifecycle', async () => {
        const backendState = await dumpE2EMockBackend(page);
        const actionRecord = backendState.tables.actions[0];

        expect(actionRecord.goal).toBe(actionGoal);
        expect(actionRecord.status).toBe('adjudicated');
        expect(actionRecord.outcome).toBe('SUCCESS');
        expect(actionRecord.submitted_at).toBeTruthy();
        expect(actionRecord.adjudicated_at).toBeTruthy();
    });

    await context.close();
});
