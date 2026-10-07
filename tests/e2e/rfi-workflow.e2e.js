import { expect, recordRehearsalMetrics, test } from './support/rehearsalTest.js';
import {
    answerRfi,
    authorizeGameMaster,
    authorizeWhiteCell,
    createIsolatedActorPage,
    createSessionFromMaster,
    joinPublicParticipant,
    openSidebarSection,
    returnRfi,
    reviseAndResubmitRfi,
    submitRfi
} from './support/liveDemoHarness.js';

test.use({ trace: 'retain-on-failure' });

test('@rfi-focus answer, return, same-record resubmission, and reload history', async ({ rehearsalBrowser: browser }, testInfo) => {
    test.setTimeout(5 * 60 * 1000);
    recordRehearsalMetrics(testInfo, { actorCount: 3, sessionCount: 1 });
    const contexts = [];
    const hosted = Boolean(process.env.PLAYWRIGHT_BASE_URL);
    const sharedContext = hosted ? null : await browser.newContext();
    if (sharedContext) contexts.push(sharedContext);
    const createActor = async (name, options) => {
        const context = sharedContext || await browser.newContext();
        if (hosted) contexts.push(context);
        return createIsolatedActorPage(context, name, options);
    };
    const sessionCode = `RFI${Date.now().toString(36)}`.toUpperCase();
    const question = 'When does the RFI rehearsal checkpoint begin?';
    const response = 'The checkpoint begins after the review window.';
    const returnedQuestion = 'Clarify the RFI rehearsal delivery timing.';
    const notes = 'Specify which delivery checkpoint needs clarification.';
    const revisedQuestion = 'Does the allied delivery checkpoint precede the six-month review?';
    const revisedResponse = 'Yes, the allied checkpoint precedes the six-month review.';

    try {
        const operator = await createActor('rfi-focus-operator', { resetBackend: true });
        await authorizeGameMaster(operator, { displayName: 'RFI Rehearsal Operator' });
        await createSessionFromMaster(operator, {
            sessionName: `RFI Focus ${sessionCode}`,
            sessionCode,
            description: 'Focused RFI browser-input and lifecycle regression.'
        });
        const facilitator = await createActor('rfi-focus-facilitator');
        await joinPublicParticipant(facilitator, {
            sessionCode, displayName: 'RFI Blue Facilitator', team: 'blue', roleSurface: 'scribe'
        });
        const whiteCell = await createActor('rfi-focus-whitecell');
        await authorizeWhiteCell(whiteCell, {
            sessionCode, displayName: 'RFI White Cell Lead', operatorRole: 'lead'
        });

        await test.step('answer a submitted RFI and deliver the exact response', async () => {
            await submitRfi(facilitator, { question });
            await answerRfi(whiteCell, { question, response });
            await expect(facilitator.locator('#deckActionFrame')).toContainText(response);
        });

        await submitRfi(facilitator, { question: returnedQuestion });
        await openSidebarSection(whiteCell, 'requests');
        const pendingCard = (text) => whiteCell.locator('#rfiQueue [data-rfi-id]')
            .filter({ hasText: text }).first();
        await expect(pendingCard(returnedQuestion)).toBeVisible();
        const recordId = await pendingCard(returnedQuestion).getAttribute('data-rfi-id');
        expect(recordId).toBeTruthy();

        await test.step('return, revise, and answer the same RFI record', async () => {
            await returnRfi(whiteCell, { question: returnedQuestion, notes });
            await reviseAndResubmitRfi(facilitator, {
                originalQuestion: returnedQuestion, revisedQuestion, returnNotes: notes
            });
            await expect(pendingCard(revisedQuestion)).toHaveAttribute('data-rfi-id', recordId);
            await answerRfi(whiteCell, { question: revisedQuestion, response: revisedResponse });
            await expect(facilitator.locator('#deckActionFrame')).toContainText(revisedResponse);
        });

        await test.step('reload White Cell and retain answer and return history', async () => {
            await whiteCell.reload();
            await openSidebarSection(whiteCell, 'requests');
            const historyTab = whiteCell.locator('#rfiHistoryTab');
            await historyTab.dispatchEvent('click');
            await expect(historyTab).toHaveAttribute('aria-selected', 'true');
            const history = whiteCell.locator('#rfiQueuePanel');
            await expect(history).toContainText(question);
            await expect(history).toContainText(response);
            await expect(history).toContainText(revisedQuestion);
            await expect(history).toContainText(revisedResponse);
            await expect(history).toContainText(notes);
        });
    } finally {
        await Promise.all(contexts.map((context) => context.close()));
    }
});
