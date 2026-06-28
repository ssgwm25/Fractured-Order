import { test, expect } from '@playwright/test';

import { dumpE2EMockBackend } from './support/mockBackend.js';
import {
    authorizeGameMaster,
    authorizeWhiteCell,
    createIsolatedActorPage,
    createSessionFromMaster,
    joinPublicParticipant,
    openSidebarSection,
    seedLargeExerciseData
} from './support/liveDemoHarness.js';

const SESSION_CODE = 'SCALE26';
const SESSION_NAME = 'Large Exercise Scale Rehearsal';

function getScaleRows(backendState, tableName, sessionId) {
    return (backendState.tables[tableName] || []).filter((row) => (
        row.session_id === sessionId && String(row.id || '').startsWith('scale_')
    ));
}

test('@live-demo larger exercise seeded records keep operator and team views usable', async ({ browser }) => {
    test.slow();

    const context = await browser.newContext();
    const gameMaster = await createIsolatedActorPage(context, 'scale-game-master', { resetBackend: true });
    const blueFacilitator = await createIsolatedActorPage(context, 'scale-blue-facilitator');
    const whiteCellLead = await createIsolatedActorPage(context, 'scale-whitecell-lead');

    await test.step('create a rehearsal session and seed larger exercise records', async () => {
        await authorizeGameMaster(gameMaster, {
            displayName: 'Scale Game Master'
        });

        await createSessionFromMaster(gameMaster, {
            sessionName: SESSION_NAME,
            sessionCode: SESSION_CODE,
            description: 'Seeded larger-exercise rehearsal for the J7/JFSC demo gate.'
        });

        await joinPublicParticipant(blueFacilitator, {
            sessionCode: SESSION_CODE,
            displayName: 'Scale Blue Scribe',
            team: 'blue',
            roleSurface: 'facilitator'
        });

        await authorizeWhiteCell(whiteCellLead, {
            sessionCode: SESSION_CODE,
            displayName: 'Scale White Cell Lead',
            operatorRole: 'lead'
        });

        const seedSummary = await seedLargeExerciseData(gameMaster, {
            sessionCode: SESSION_CODE
        });

        expect(seedSummary).toMatchObject({
            actionCount: 90,
            requestCount: 36,
            communicationCount: 48,
            timelineCount: 180,
            participantCount: 60
        });
    });

    await test.step('verify seeded backend counts before rendering pages', async () => {
        const backendState = await dumpE2EMockBackend(gameMaster);
        const session = backendState.tables.sessions.find((entry) => (
            String(entry.session_code || entry.metadata?.session_code || '').toUpperCase() === SESSION_CODE
        ));

        expect(session).toBeTruthy();
        expect(getScaleRows(backendState, 'actions', session.id)).toHaveLength(90);
        expect(getScaleRows(backendState, 'requests', session.id)).toHaveLength(36);
        expect(getScaleRows(backendState, 'communications', session.id)).toHaveLength(48);
        expect(getScaleRows(backendState, 'timeline', session.id)).toHaveLength(180);
        expect(getScaleRows(backendState, 'session_participants', session.id)).toHaveLength(60);
    });

    await test.step('keep Game Master dashboard and participant roster usable with seeded records', async () => {
        await gameMaster.reload();
        await expect(gameMaster).toHaveURL(/master\.html/);

        await openSidebarSection(gameMaster, 'dashboard');
        await expect(gameMaster.locator('#statsGrid')).toContainText('90');
        await expect(gameMaster.locator('#statsGrid')).toContainText('18');

        const backendState = await dumpE2EMockBackend(gameMaster);
        const session = backendState.tables.sessions.find((entry) => (
            String(entry.session_code || entry.metadata?.session_code || '').toUpperCase() === SESSION_CODE
        ));

        await openSidebarSection(gameMaster, 'participants');
        await expect(gameMaster.locator(`#participantsSessionSelect option[value="${session.id}"]`)).toHaveCount(1);
        await gameMaster.locator('#participantsSessionSelect').selectOption(session.id);
        await expect(gameMaster.locator('#participantsSelectionState')).toContainText(SESSION_NAME);
        await expect(gameMaster.locator('#participantsList')).toContainText('Historical Participant 01');
    });

    await test.step('keep White Cell review queues and timeline usable with seeded records', async () => {
        await whiteCellLead.reload();
        await expect(whiteCellLead).toHaveURL(/whitecell\.html/);

        await openSidebarSection(whiteCellLead, 'actions');
        await expect(whiteCellLead.locator('#actionsList')).toContainText('Blue Decision');

        await openSidebarSection(whiteCellLead, 'proposals');
        await expect(whiteCellLead.locator('#proposalsList')).toContainText('Green Proposal');

        await openSidebarSection(whiteCellLead, 'responses');
        await expect(whiteCellLead.locator('#responsesList')).toContainText('Red Move Response');

        await openSidebarSection(whiteCellLead, 'requests');
        await expect(whiteCellLead.locator('#rfiQueue')).toContainText('RFI');

        await openSidebarSection(whiteCellLead, 'timeline');
        await expect(whiteCellLead.locator('#timelineList')).toContainText('Timeline Event');
    });

    await test.step('keep Blue facilitator action, RFI, response, and timeline views usable', async () => {
        await blueFacilitator.reload();
        await expect(blueFacilitator).toHaveURL(/\/teams\/blue\/facilitator\.html(?:\?.*)?$/);

        await openSidebarSection(blueFacilitator, 'actions');
        await expect(blueFacilitator.locator('#actionsList')).toContainText('Blue Decision');

        await openSidebarSection(blueFacilitator, 'requests');
        await expect(blueFacilitator.locator('#rfiList')).toContainText('Blue RFI');

        await openSidebarSection(blueFacilitator, 'responses');
        await expect(blueFacilitator.locator('#responsesList')).toContainText('White Cell');

        await openSidebarSection(blueFacilitator, 'timeline');
        await expect(blueFacilitator.locator('#timelineList')).toContainText('Timeline Event');
    });

    await context.close();
});
