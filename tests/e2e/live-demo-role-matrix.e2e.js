import { test, expect } from '@playwright/test';

import { dumpE2EMockBackend } from './support/mockBackend.js';
import {
    authorizeGameMaster,
    authorizeWhiteCell,
    createIsolatedActorPage,
    createSessionFromMaster,
    getActiveSeatCounts,
    joinPublicParticipant
} from './support/liveDemoHarness.js';

const SESSION_NAME = 'All-Team Role Matrix Rehearsal';
const SESSION_CODE = 'MATRIX26';

const TEAM_OPTIONS = Object.freeze([
    { id: 'blue', shortLabel: 'Blue' },
    { id: 'red', shortLabel: 'Red' },
    { id: 'green', shortLabel: 'Green' },
    { id: 'industry', shortLabel: 'Industry' }
]);

const ROLE_SURFACES = Object.freeze({
    FACILITATOR: 'facilitator',
    SCRIBE: 'scribe',
    NOTETAKER: 'notetaker',
    WHITECELL: 'whitecell',
});

const WHITE_CELL_OPERATOR_ROLES = Object.freeze({
    LEAD: 'lead',
    SUPPORT: 'support'
});

const LIVE_DEMO_ROLE_MATRIX = TEAM_OPTIONS.flatMap((team) => ([
    {
        actorName: `${team.id}-facilitator-matrix`,
        displayName: `${team.shortLabel} Facilitator Matrix`,
        teamId: team.id,
        roleSurface: ROLE_SURFACES.FACILITATOR
    },
    {
        actorName: `${team.id}-scribe-matrix`,
        displayName: `${team.shortLabel} Scribe Matrix`,
        teamId: team.id,
        roleSurface: ROLE_SURFACES.SCRIBE
    },
    {
        actorName: `${team.id}-notetaker-matrix`,
        displayName: `${team.shortLabel} Notetaker Matrix`,
        teamId: team.id,
        roleSurface: ROLE_SURFACES.NOTETAKER
    }
])).concat([
    {
        actorName: 'whitecell-lead-matrix',
        displayName: 'White Cell Lead Matrix',
        teamId: null,
        roleSurface: ROLE_SURFACES.WHITECELL,
        operatorRole: WHITE_CELL_OPERATOR_ROLES.LEAD
    },
    {
        actorName: 'whitecell-support-matrix',
        displayName: 'White Cell Support Matrix',
        teamId: null,
        roleSurface: ROLE_SURFACES.WHITECELL,
        operatorRole: WHITE_CELL_OPERATOR_ROLES.SUPPORT
    }
]);

function buildExpectedSeatCounts() {
    return TEAM_OPTIONS.reduce((counts, team) => ({
        ...counts,
        [`${team.id}_facilitator`]: 1,
        [`${team.id}_scribe`]: 1,
        [`${team.id}_notetaker`]: 1
    }), {
        whitecell_lead: 1,
        whitecell_support: 1
    });
}

async function expectRoleSurface(page, roleCase) {
    await expect(page.locator('#sessionName')).toContainText(SESSION_NAME);

    if (roleCase.roleSurface === ROLE_SURFACES.FACILITATOR) {
        await expect(page).toHaveURL(new RegExp(`/teams/${roleCase.teamId}/facilitator\\.html(?:\\?.*)?$`));
        await expect(page.locator('#sessionRoleLabel')).toHaveText('Facilitator');
        await expect(page.locator('body')).toHaveAttribute('data-facilitator-mode', 'facilitator');
        await expect(page.locator('#newActionBtn')).toBeVisible();
        return;
    }

    if (roleCase.roleSurface === ROLE_SURFACES.SCRIBE) {
        await expect(page).toHaveURL(new RegExp(`/teams/${roleCase.teamId}/scribe\\.html(?:\\?.*)?$`));
        await expect(page.locator('#sessionRoleLabel')).toHaveText('Scribe');
        await expect(page.locator('body')).toHaveAttribute('data-role-surface', 'scribe');
        await expect(page.locator('body')).toHaveAttribute('data-scribe-deck-state', 'ready');
        await expect(page.locator('#scribeSectionList')).toContainText('Actions');
        await expect(page.locator('#deckSlideImage')).toBeVisible();
        await expect(page.locator('#newActionBtn')).toHaveCount(0);
        return;
    }

    if (roleCase.roleSurface === ROLE_SURFACES.NOTETAKER) {
        await expect(page).toHaveURL(new RegExp(`/teams/${roleCase.teamId}/notetaker\\.html(?:\\?.*)?$`));
        await expect(page.locator('body')).toHaveAttribute('data-team', roleCase.teamId);
        // The header title was removed; the role is now shown by the session-role pill
        // and the team by body[data-team] (asserted above).
        await expect(page.locator('.session-role')).toContainText('Notetaker');
        await expect(page.locator('#captureForm')).toBeVisible();
        await expect(page.locator('#captureContent')).toBeVisible();
        return;
    }

    await expect(page).toHaveURL(/\/whitecell\.html(?:\?.*)?$/);
    await expect(page.locator('#startTimerBtn')).toBeVisible();

    if (roleCase.operatorRole === WHITE_CELL_OPERATOR_ROLES.SUPPORT) {
        await expect(page.locator('#startTimerBtn')).toBeDisabled();
    } else {
        await expect(page.locator('#startTimerBtn')).toBeEnabled();
    }
}

test('@live-demo browser role matrix covers all teams and roles through join, reload persistence, and operator roster visibility', async ({ browser }) => {
    test.slow();

    const context = await browser.newContext();
    const gameMaster = await createIsolatedActorPage(context, 'matrix-game-master', { resetBackend: true });

    await test.step('create the matrix rehearsal session from Game Master', async () => {
        await authorizeGameMaster(gameMaster, {
            displayName: 'Role Matrix Game Master'
        });

        const session = await createSessionFromMaster(gameMaster, {
            sessionName: SESSION_NAME,
            sessionCode: SESSION_CODE,
            description: 'Browser-level role matrix rehearsal across all shipped teams and roles.'
        });

        expect(session).toBeTruthy();
    });

    await test.step('join every shipped role across blue, red, green, and industry and preserve the active seat across reload', async () => {
        for (const roleCase of LIVE_DEMO_ROLE_MATRIX) {
            const actorPage = await createIsolatedActorPage(context, roleCase.actorName);

            if (roleCase.roleSurface === ROLE_SURFACES.WHITECELL) {
                await authorizeWhiteCell(actorPage, {
                    sessionCode: SESSION_CODE,
                    displayName: roleCase.displayName,
                    operatorRole: roleCase.operatorRole
                });
            } else {
                await joinPublicParticipant(actorPage, {
                    sessionCode: SESSION_CODE,
                    displayName: roleCase.displayName,
                    team: roleCase.teamId,
                    roleSurface: roleCase.roleSurface
                });
            }

            await expectRoleSurface(actorPage, roleCase);
            await actorPage.reload();
            await expectRoleSurface(actorPage, roleCase);
        }
    });

    await test.step('show the full matrix in the operator participant roster and backend seat counts', async () => {
        await gameMaster.reload();
        await expect(gameMaster).toHaveURL(/master\.html/);

        await gameMaster.locator('.sidebar-link[data-section="participants"]').click();

        const backendState = await dumpE2EMockBackend(gameMaster);
        const session = backendState.tables.sessions.find((entry) => (
            String(entry.session_code || entry.metadata?.session_code || '').toUpperCase() === SESSION_CODE
        ));

        expect(session).toBeTruthy();

        await expect(
            gameMaster.locator(`#participantsSessionSelect option[value="${session.id}"]`)
        ).toHaveCount(1);
        await gameMaster.locator('#participantsSessionSelect').selectOption(session.id);
        await expect(gameMaster.locator('#participantsSelectionState')).toContainText(SESSION_NAME);

        const participantsList = gameMaster.locator('#participantsList');
        for (const roleCase of LIVE_DEMO_ROLE_MATRIX) {
            await expect(participantsList).toContainText(roleCase.displayName);
        }

        expect(getActiveSeatCounts(backendState, session.id)).toEqual(expect.objectContaining(
            buildExpectedSeatCounts()
        ));
    });

    await context.close();
});
