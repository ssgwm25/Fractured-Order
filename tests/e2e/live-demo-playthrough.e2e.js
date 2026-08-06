import { readFile } from 'node:fs/promises';

import { test, expect } from '@playwright/test';

import { dumpE2EMockBackend } from './support/mockBackend.js';
import {
    adjudicateAction,
    answerRfi,
    appendNotetakerObservation,
    authorizeGameMaster,
    authorizeWhiteCell,
    createDraftAction,
    createIsolatedActorPage,
    createProposal,
    createSessionFromMaster,
    forwardActionToScribe,
    getActiveSeatCounts,
    getSessionFromState,
    joinPublicParticipant,
    openFacilitatorActionSlide,
    openSidebarSection,
    recordStrategicOrientationFromScribe,
    replyToProposalThread,
    respondToForwardedProposal,
    reviewProposal,
    reviewStrategicOrientation,
    sendFacilitatorCommunication,
    sendWhiteCellCommunication,
    submitActionFromScribe,
    submitForwardedProposalFromFacilitator,
    submitRfi,
    submitStrategicOrientationFromScribe
} from './support/liveDemoHarness.js';

const TEAMS = Object.freeze(['blue', 'red', 'green', 'industry']);
const TEAM_LABELS = Object.freeze({
    blue: 'Blue',
    red: 'Red',
    green: 'Green',
    industry: 'Industry'
});

function buildSessionCode(retry = 0) {
    const configuredRunId = String(process.env.PLAYWRIGHT_REHEARSAL_RUN_ID || '').trim();
    const runId = configuredRunId || Date.now().toString(36);
    return `P18${runId.replace(/[^a-z0-9]/gi, '').slice(-8)}${retry || ''}`.toUpperCase();
}

async function createActorPool(browser) {
    const useIndependentContexts = Boolean(process.env.PLAYWRIGHT_BASE_URL);
    const contexts = [];
    const sharedContext = useIndependentContexts
        ? null
        : await browser.newContext({ viewport: { width: 1440, height: 900 } });

    if (sharedContext) {
        contexts.push(sharedContext);
    }

    return {
        useIndependentContexts,
        async create(actorName, options = {}) {
            const context = useIndependentContexts
                ? await browser.newContext({ viewport: { width: 1440, height: 900 } })
                : sharedContext;
            if (useIndependentContexts) {
                contexts.push(context);
            }
            return createIsolatedActorPage(context, actorName, options);
        },
        async close() {
            await Promise.all(contexts.map(async (context) => {
                const owningBrowser = context.browser();
                if (!owningBrowser?.isConnected()) {
                    return;
                }

                try {
                    await context.close();
                } catch (error) {
                    if (!/Target page, context or browser has been closed/.test(error.message)) {
                        throw error;
                    }
                }
            }));
        }
    };
}

function observeBrowserDiagnostics(page, actorName, diagnostics) {
    page.on('pageerror', (error) => {
        diagnostics.pageErrors.push({ actor: actorName, message: error.message });
    });
    page.on('console', (message) => {
        if (message.type() === 'error') {
            diagnostics.consoleErrors.push({ actor: actorName, message: message.text() });
        }
    });
}

async function runActorOperations(operations, { concurrent }) {
    if (concurrent) {
        return Promise.all(operations.map((operation) => operation()));
    }

    const results = [];
    for (const operation of operations) {
        results.push(await operation());
    }
    return results;
}

async function inspectSharedUiContract(page) {
    await expect(page.locator('#logoutBtn')).toBeVisible();

    return page.evaluate(() => {
        const idCounts = new Map();
        document.querySelectorAll('[id]').forEach((element) => {
            idCounts.set(element.id, (idCounts.get(element.id) || 0) + 1);
        });
        const duplicateIds = [...idCounts.entries()]
            .filter(([, count]) => count > 1)
            .map(([id]) => id);
        const rootStyle = getComputedStyle(document.documentElement);

        return {
            duplicateIds,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            exposesRawJson: /\{\s*"(?:id|session_id|client_id)"\s*:/.test(document.body.innerText),
            tokens: {
                primary: rootStyle.getPropertyValue('--color-primary-600').trim(),
                spacing: rootStyle.getPropertyValue('--space-4').trim(),
                radius: rootStyle.getPropertyValue('--radius-md').trim()
            }
        };
    });
}

async function selectSessionForOperatorView(page, {
    section,
    selectId,
    sessionName
}) {
    await openSidebarSection(page, section);
    const select = page.locator(selectId);
    const option = select.locator('option').filter({ hasText: sessionName }).first();
    await expect(option).toBeAttached();
    const sessionId = await option.getAttribute('value');
    expect(sessionId).toBeTruthy();
    await select.selectOption(sessionId);
    return sessionId;
}

test('@playthrough eighteen-actor professional rehearsal covers the complete shipped role and workflow contract', async ({ browser }, testInfo) => {
    test.setTimeout(10 * 60 * 1000);

    const actorPool = await createActorPool(browser);
    const diagnostics = { pageErrors: [], consoleErrors: [] };
    const sessionCode = buildSessionCode(testInfo.retry);
    const sessionName = `Professional Playthrough ${sessionCode}`;
    const actors = {
        teams: Object.fromEntries(TEAMS.map((team) => [team, { notetakers: [] }]))
    };
    const allActorPages = [];
    const publicActorPages = [];

    const createObservedActor = async (name, options = {}) => {
        const page = await actorPool.create(name, options);
        observeBrowserDiagnostics(page, name, diagnostics);
        allActorPages.push({ name, page });
        return page;
    };

    try {
        await test.step('create the rehearsal session and fill the 18-browser role topology', async () => {
            actors.gameMaster = await createObservedActor('playthrough-game-master', { resetBackend: true });
            await authorizeGameMaster(actors.gameMaster, {
                displayName: 'Playthrough Game Master'
            });
            await createSessionFromMaster(actors.gameMaster, {
                sessionName,
                sessionCode,
                description: 'Automated 18-person professional playthrough covering communications, proposals, actions, RFIs, notes, controls, UI consistency, and export.'
            });

            for (const team of TEAMS) {
                const teamActors = actors.teams[team];
                teamActors.scribe = await createObservedActor(`${team}-playthrough-scribe`);
                teamActors.facilitator = await createObservedActor(`${team}-playthrough-facilitator`);
                publicActorPages.push(teamActors.scribe, teamActors.facilitator);

                for (let index = 1; index <= 2; index += 1) {
                    const notetaker = await createObservedActor(`${team}-playthrough-notetaker-${index}`);
                    teamActors.notetakers.push(notetaker);
                    publicActorPages.push(notetaker);
                }
            }

            actors.whiteCellLead = await createObservedActor('playthrough-whitecell-lead');

            const seatClaimOperations = TEAMS.flatMap((team) => {
                const teamActors = actors.teams[team];
                const teamLabel = TEAM_LABELS[team];
                return [
                    () => joinPublicParticipant(teamActors.scribe, {
                        sessionCode,
                        displayName: `${teamLabel} Scribe`,
                        team,
                        roleSurface: 'facilitator'
                    }),
                    () => joinPublicParticipant(teamActors.facilitator, {
                        sessionCode,
                        displayName: `${teamLabel} Facilitator`,
                        team,
                        roleSurface: 'scribe'
                    }),
                    ...teamActors.notetakers.map((page, index) => () => joinPublicParticipant(page, {
                        sessionCode,
                        displayName: `${teamLabel} Notetaker ${index + 1}`,
                        team,
                        roleSurface: 'notetaker'
                    }))
                ];
            });

            seatClaimOperations.push(
                () => authorizeWhiteCell(actors.whiteCellLead, {
                    sessionCode,
                    displayName: 'White Cell Lead',
                    operatorRole: 'lead'
                })
            );
            await runActorOperations(seatClaimOperations, {
                concurrent: actorPool.useIndependentContexts
            });

            expect(allActorPages).toHaveLength(18);
            await expect(actors.whiteCellLead.locator('#startTimerBtn')).toBeEnabled();

            const backendState = await dumpE2EMockBackend(actors.gameMaster);
            if (backendState) {
                const session = getSessionFromState(backendState, sessionCode);
                const activeSeatCounts = getActiveSeatCounts(backendState, session.id);
                expect(Object.values(activeSeatCounts).reduce((sum, count) => sum + count, 0)).toBe(17);
                for (const team of TEAMS) {
                    expect(activeSeatCounts).toMatchObject({
                        [`${team}_facilitator`]: 1,
                        [`${team}_scribe`]: 1,
                        [`${team}_notetaker`]: 2
                    });
                }
                expect(activeSeatCounts).toMatchObject({
                    whitecell_lead: 1
                });
            }
        });

        await test.step('enforce a shared UI shell, token, and document-integrity contract across every role', async () => {
            const inspections = await Promise.all(
                allActorPages.map(async ({ name, page }) => ({
                    name,
                    ...(await inspectSharedUiContract(page))
                }))
            );

            inspections.forEach((inspection) => {
                expect(inspection.duplicateIds, `${inspection.name} has duplicate DOM ids`).toEqual([]);
                expect(inspection.horizontalOverflow, `${inspection.name} overflows at 1440px`).toBe(false);
                expect(inspection.exposesRawJson, `${inspection.name} exposes raw JSON`).toBe(false);
                expect(inspection.tokens.primary, `${inspection.name} is missing the primary token`).not.toBe('');
                expect(inspection.tokens.spacing, `${inspection.name} is missing the spacing token`).not.toBe('');
                expect(inspection.tokens.radius, `${inspection.name} is missing the radius token`).not.toBe('');
            });

            const referenceTokens = inspections[0].tokens;
            inspections.forEach((inspection) => {
                expect(inspection.tokens, `${inspection.name} does not share the platform tokens`).toEqual(referenceTokens);
            });

            await Promise.all(allActorPages.map(({ page }) => page.setViewportSize({ width: 390, height: 844 })));
            try {
                const mobileInspections = await Promise.all(allActorPages.map(async ({ name, page }) => ({
                    name,
                    horizontalOverflow: await page.evaluate(() => (
                        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
                    ))
                })));
                mobileInspections.forEach((inspection) => {
                    expect(inspection.horizontalOverflow, `${inspection.name} overflows at 390px`).toBe(false);
                });
            } finally {
                await Promise.all(allActorPages.map(({ page }) => page.setViewportSize({ width: 1440, height: 900 })));
            }
        });

        const orientationGoals = {};
        await test.step('complete the multi-team Strategic Orientation gate through Scribe, Facilitator, and White Cell', async () => {
            await expect(actors.whiteCellLead.locator('#nextMoveBtn')).toBeDisabled();
            await expect(actors.whiteCellLead.locator('#nextMoveBtn')).toHaveText('Awaiting Orientation');

            const orientationByTeam = {
                blue: 'pressure',
                green: 'stabilization',
                red: 'reframe',
                industry: 'pressure'
            };
            const recordedGoals = await runActorOperations(TEAMS.map((team) => () => (
                recordStrategicOrientationFromScribe(actors.teams[team].scribe, {
                    team,
                    orientation: orientationByTeam[team],
                    rationale: `${TEAM_LABELS[team]} rationale recorded during the 18-person playthrough.`
                })
            )), { concurrent: actorPool.useIndependentContexts });
            TEAMS.forEach((team, index) => {
                orientationGoals[team] = recordedGoals[index];
            });

            await runActorOperations(TEAMS.map((team) => () => (
                submitStrategicOrientationFromScribe(
                    actors.teams[team].facilitator,
                    orientationGoals[team]
                )
            )), { concurrent: actorPool.useIndependentContexts });

            await expect(actors.whiteCellLead.locator('#nextMoveBtn')).toBeEnabled();
            await expect(actors.whiteCellLead.locator('#nextMoveBtn')).toHaveText('Advance to Move 2');

            for (const team of TEAMS) {
                await reviewStrategicOrientation(actors.whiteCellLead, {
                    goal: orientationGoals[team],
                    team,
                    notes: `${TEAM_LABELS[team]} orientation reviewed during the playthrough.`
                });
            }
        });

        await test.step('synchronize timer state through White Cell Lead controls', async () => {
            await openSidebarSection(actors.whiteCellLead, 'controls');
            await actors.whiteCellLead.locator('#startTimerBtn').click();
            await expect(actors.whiteCellLead.locator('#pauseTimerBtn')).toBeEnabled();
            await Promise.all(publicActorPages.map((page) => (
                expect(page.locator('#timerDisplay')).not.toHaveText('90:00', { timeout: 10000 })
            )));
            await actors.whiteCellLead.locator('#pauseTimerBtn').click();
            await expect(actors.whiteCellLead.locator('#pauseTimerBtn')).toBeDisabled();
        });

        const actionTitles = {
            blue: 'Coordinate allied semiconductor export controls',
            red: 'Reframe regional investment incentives'
        };
        await test.step('run Blue and Red action lifecycles through White Cell Lead adjudication', async () => {
            await runActorOperations(['blue', 'red'].map((team) => async () => {
                await createDraftAction(actors.teams[team].scribe, {
                    goal: actionTitles[team],
                    focusCountries: team === 'red' ? ['U.S', 'PRC'] : ['PRC', 'Japan'],
                    notificationTeams: team === 'blue' ? ['Green', 'Industry'] : [],
                    notificationNote: team === 'blue'
                        ? 'Notify Green and Industry after White Cell accepts the action.'
                        : ''
                });
                await forwardActionToScribe(actors.teams[team].scribe, actionTitles[team]);
            }), { concurrent: actorPool.useIndependentContexts });

            await runActorOperations(['blue', 'red'].map((team) => () => (
                submitActionFromScribe(actors.teams[team].facilitator, actionTitles[team])
            )), { concurrent: actorPool.useIndependentContexts });

            const blueReviewCard = actors.whiteCellLead
                .locator('#actionsList .entity-card')
                .filter({ hasText: actionTitles.blue })
                .first();
            await expect(blueReviewCard).toContainText('Team notification request');
            await expect(blueReviewCard).toContainText('Teams to Inform: Green, Industry');
            await expect(blueReviewCard).toContainText(
                'Notification Note: Notify Green and Industry after White Cell accepts the action.'
            );

            await adjudicateAction(actors.whiteCellLead, {
                goal: actionTitles.blue,
                notes: 'Blue action approved during the professional playthrough.'
            });
            await adjudicateAction(actors.whiteCellLead, {
                goal: actionTitles.red,
                section: 'responses',
                notes: 'Red action accepted as complete during the professional playthrough.'
            });
        });

        const proposalCases = [
            {
                owner: 'green',
                title: 'Green proposal for Blue negotiation',
                recipient: 'blue',
                recipientTeams: ['blue', 'red'],
                focusSectors: ['Biotechnology', 'Agriculture'],
                supplyChainFocusDecision: 'Yes',
                supplyChainAreas: ['Advanced Manufacturing'],
                review: 'forward_to_recipient',
                response: 'negotiate'
            },
            { owner: 'industry', title: 'Industry proposal for Red acceptance', recipient: 'red', review: 'forward_to_recipient', response: 'accept' },
            { owner: 'green', title: 'Green proposal for Red non-interest', recipient: 'red', review: 'forward_to_recipient', response: 'not_interested' },
            { owner: 'industry', title: 'Industry proposal requiring changes', recipient: 'blue', review: 'request_changes' }
        ];
        await test.step('cover all White Cell proposal decisions and all recipient response options', async () => {
            for (const proposal of proposalCases) {
                await createProposal(actors.teams[proposal.owner].scribe, {
                    title: proposal.title,
                    recipientTeam: proposal.recipient,
                    recipientTeams: proposal.recipientTeams,
                    focusSectors: proposal.focusSectors,
                    supplyChainFocusDecision: proposal.supplyChainFocusDecision,
                    supplyChainAreas: proposal.supplyChainAreas
                });
                await submitForwardedProposalFromFacilitator(actors.teams[proposal.owner].facilitator, {
                    title: proposal.title
                });
            }

            for (const proposal of proposalCases) {
                await reviewProposal(actors.whiteCellLead, {
                    title: proposal.title,
                    decision: proposal.review,
                    recipientTeams: proposal.review === 'forward_to_recipient'
                        ? [proposal.recipient]
                        : [],
                    notes: `${proposal.review} exercised by the automated playthrough.`
                });
                if (proposal.recipientTeams?.includes('red') && proposal.recipient !== 'red') {
                    await openSidebarSection(actors.whiteCellLead, 'proposals');
                    await expect(actors.whiteCellLead.locator('#proposalsList')).toContainText('Red Team');
                    await expect(actors.whiteCellLead.locator('#proposalsList')).toContainText('Pending approval');
                    await reviewProposal(actors.whiteCellLead, {
                        title: proposal.title,
                        recipientTeams: ['red'],
                        notes: 'Red recipient independently approved after Blue.'
                    });
                }
            }

            for (const proposal of proposalCases.filter((entry) => entry.response)) {
                await respondToForwardedProposal(actors.teams[proposal.recipient].facilitator, {
                    title: proposal.title,
                    decision: proposal.response,
                    negotiationTerms: 'Add a six-month review clause and a shared delivery checkpoint.'
                });
            }

            await openFacilitatorActionSlide(
                actors.teams.green.facilitator,
                'Green proposal for Blue negotiation'
            );
            await expect(actors.teams.green.facilitator.locator('#deckActionFrame')).toContainText('Negotiation underway');
            await expect(actors.teams.green.facilitator.locator('#deckActionFrame')).toContainText('Add a six-month review clause');
            await openSidebarSection(actors.whiteCellLead, 'communications');
            await expect(actors.whiteCellLead.locator('#commHistory')).toContainText('Add a six-month review clause');
        });

        const rfiQuestions = Object.fromEntries(TEAMS.map((team) => [
            team,
            `${TEAM_LABELS[team]} asks for implementation timing guidance`
        ]));
        const blueRfiResponse = 'White Cell confirms that implementation begins after the current review window.';
        await test.step('submit multi-team RFIs, answer one, and route the response only to its team', async () => {
            await runActorOperations(TEAMS.map((team) => () => submitRfi(actors.teams[team].facilitator, {
                question: rfiQuestions[team]
            })), { concurrent: actorPool.useIndependentContexts });

            await answerRfi(actors.whiteCellLead, {
                question: rfiQuestions.blue,
                response: blueRfiResponse
            });

            await expect(actors.teams.blue.facilitator.locator('#deckActionFrame')).toContainText(blueRfiResponse);
            for (const team of TEAMS.filter((team) => team !== 'blue')) {
                await expect(actors.teams[team].facilitator.locator('#deckActionFrame')).not.toContainText(blueRfiResponse);
            }

            await replyToProposalThread(actors.teams.green.facilitator, {
                title: 'Green proposal for Blue negotiation',
                message: 'Green accepts the six-month checkpoint and proposes a joint implementation review.'
            });
            await openSidebarSection(actors.whiteCellLead, 'communications');
            await expect(actors.whiteCellLead.locator('#commHistory')).toContainText('Green accepts the six-month checkpoint');
        });

        const communicationMessages = [
            'Blue Facilitator direct communication one',
            'Blue Facilitator direct communication two'
        ];
        await test.step('persist an Industry Facilitator direct message to White Cell', async () => {
            const facilitatorMessage = 'Industry Facilitator requests direct White Cell guidance.';
            await sendFacilitatorCommunication(actors.teams.industry.facilitator, {
                content: facilitatorMessage
            });
            await openSidebarSection(actors.whiteCellLead, 'communications');
            await expect(actors.whiteCellLead.locator('#commHistory')).toContainText(facilitatorMessage);
        });

        await test.step('deliver ordered direct communications with exact unread notification behavior', async () => {
            const blueAlertsBadge = actors.teams.blue.facilitator.locator('#scribeAlertsBadge');
            if (await blueAlertsBadge.isVisible()) {
                await actors.teams.blue.facilitator.locator('#scribeAlertsBtn').click();
                await actors.teams.blue.facilitator.locator('#scribeAlertsBtn').click();
                await expect(blueAlertsBadge).toBeHidden();
            }

            for (const content of communicationMessages) {
                await sendWhiteCellCommunication(actors.whiteCellLead, {
                    recipient: 'blue_scribe',
                    content
                });
            }

            await expect(blueAlertsBadge).toHaveText('2');
            await actors.teams.blue.facilitator.locator('#scribeAlertsBtn').click();
            await expect(actors.teams.blue.facilitator.locator('#scribeAlertsList')).toContainText(communicationMessages[1]);
            await expect(actors.teams.blue.facilitator.locator('#scribeAlertsList')).toContainText(communicationMessages[0]);
            await expect(blueAlertsBadge).toBeHidden();

            await expect(actors.teams.red.facilitator.locator('#scribeAlertsList')).not.toContainText(communicationMessages[0]);
            await expect(actors.teams.green.facilitator.locator('#scribeAlertsList')).not.toContainText(communicationMessages[0]);
            await expect(actors.teams.industry.facilitator.locator('#scribeAlertsList')).not.toContainText(communicationMessages[0]);
        });

        await test.step('append observations from all eight Notetakers without cross-team overwrite', async () => {
            const observations = TEAMS.flatMap((team) => actors.teams[team].notetakers.map((page, index) => ({
                page,
                team,
                content: `${TEAM_LABELS[team]} Notetaker ${index + 1} playthrough observation`
            })));

            await runActorOperations(observations.map(({ page, content }) => () => (
                appendNotetakerObservation(page, content)
            )), { concurrent: actorPool.useIndependentContexts });

            if (!actorPool.useIndependentContexts) {
                await runActorOperations(observations.map(({ page }) => async () => {
                    await page.reload();
                    await expect(page.locator('#sessionName')).toContainText(sessionName);
                }), { concurrent: false });
            }

            for (const team of TEAMS) {
                const teamObservations = observations.filter((entry) => entry.team === team);
                for (const notetaker of actors.teams[team].notetakers) {
                    for (const observation of teamObservations) {
                        await expect(notetaker.locator('#recentCaptures')).toContainText(observation.content);
                    }
                    for (const otherTeam of TEAMS.filter((candidate) => candidate !== team)) {
                        await expect(notetaker.locator('#recentCaptures')).not.toContainText(
                            `${TEAM_LABELS[otherTeam]} Notetaker`
                        );
                    }
                }
            }
        });

        await test.step('reload representative roles without replaying or losing committed state', async () => {
            await runActorOperations([
                () => actors.teams.green.scribe.reload(),
                () => actors.teams.blue.facilitator.reload(),
                () => actors.teams.industry.notetakers[0].reload(),
                () => actors.whiteCellLead.reload()
            ], { concurrent: actorPool.useIndependentContexts });

            await expect(actors.teams.green.scribe.locator('#sessionName')).toContainText(sessionName);
            await openSidebarSection(actors.teams.green.scribe, 'actions');
            await expect(actors.teams.green.scribe.locator('#actionsList')).toContainText('Green proposal for Blue negotiation');

            await expect(actors.teams.blue.facilitator.locator('#sessionName')).toContainText(sessionName);
            await expect(actors.teams.blue.facilitator.locator('#scribeAlertsBadge')).toBeHidden();

            await expect(actors.teams.industry.notetakers[0].locator('#recentCaptures')).toContainText(
                'Industry Notetaker 1 playthrough observation'
            );
            await expect(actors.whiteCellLead.locator('#startTimerBtn')).toBeEnabled();
        });

        await test.step('export and reconcile the selected-session JSON evidence', async () => {
            await selectSessionForOperatorView(actors.gameMaster, {
                section: 'export',
                selectId: '#exportSessionSelect',
                sessionName
            });
            await expect(actors.gameMaster.locator('#exportJsonBtn')).toBeEnabled();

            const downloadPromise = actors.gameMaster.waitForEvent('download');
            await actors.gameMaster.locator('#exportJsonBtn').click();
            const download = await downloadPromise;
            const downloadPath = await download.path();
            expect(downloadPath).toBeTruthy();
            const exported = JSON.parse(await readFile(downloadPath, 'utf8'));

            expect(exported.session.name).toBe(sessionName);
            expect(exported.actions.map((action) => action.goal)).toEqual(expect.arrayContaining([
                actionTitles.blue,
                actionTitles.red,
                ...proposalCases.map((proposal) => proposal.title)
            ]));
            expect(exported.requests.map((request) => request.query)).toEqual(expect.arrayContaining(
                Object.values(rfiQuestions).map((question) => expect.stringContaining(question))
            ));
            expect(exported.participants).toHaveLength(17);
            expect(exported.timeline.length).toBeGreaterThan(0);
        });

        await testInfo.attach('playthrough-diagnostics.json', {
            body: JSON.stringify({
                sessionCode,
                sessionName,
                actorCount: allActorPages.length,
                sessionSeatCount: 17,
                backend: actorPool.useIndependentContexts ? 'hosted-real-backend' : 'local-deterministic-mock',
                diagnostics
            }, null, 2),
            contentType: 'application/json'
        });

        expect(diagnostics.pageErrors, 'Uncaught browser errors were recorded').toEqual([]);
        expect(diagnostics.consoleErrors, 'Browser console errors were recorded').toEqual([]);
    } finally {
        await actorPool.close();
    }
});
