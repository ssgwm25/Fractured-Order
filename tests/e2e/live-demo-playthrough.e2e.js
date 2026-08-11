import { execFileSync } from 'node:child_process';
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
    getDurableNotificationSnapshot,
    getSessionFromState,
    joinPublicParticipant,
    openFacilitatorActionSlide,
    openReceivedProposalSlide,
    openSidebarSection,
    recordStrategicOrientationFromScribe,
    replyToProposalThread,
    respondToForwardedProposal,
    returnRfi,
    reviewProposal,
    reviewStrategicOrientation,
    reviseAndResubmitRfi,
    reviseReturnedAction,
    reviseReturnedStrategicOrientation,
    sendFacilitatorCommunication,
    sendWhiteCellCommunication,
    submitActionFromScribe,
    submitForwardedProposalFromFacilitator,
    submitRfi,
    submitStrategicOrientationFromScribe,
    waitForDurableNotification
} from './support/liveDemoHarness.js';

const TEAMS = Object.freeze(['blue', 'red', 'green', 'industry']);
const TEAM_LABELS = Object.freeze({
    blue: 'Blue',
    red: 'Red',
    green: 'Green',
    industry: 'Industry'
});

const CURRENT_OUTCOME_LABELS = Object.freeze([
    'SUCCESS',
    'PARTIAL_SUCCESS',
    'FAIL',
    'BACKFIRE'
]);
const REQUIRED_MIGRATION_STATE = '2026-08-11_requests_responded_by_schema_repair';

function getSourceRevisionEvidence() {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '';
    return { commit, dirty };
}

function readStoredZipEntries(buffer) {
    const entries = new Map();
    let offset = 0;

    while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
        const compressionMethod = buffer.readUInt16LE(offset + 8);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const filenameLength = buffer.readUInt16LE(offset + 26);
        const extraLength = buffer.readUInt16LE(offset + 28);
        expect(compressionMethod, 'research archive entries must use deterministic stored ZIP records').toBe(0);

        const filenameStart = offset + 30;
        const contentStart = filenameStart + filenameLength + extraLength;
        const filename = buffer.subarray(filenameStart, filenameStart + filenameLength).toString('utf8');
        const relativePath = filename.includes('/') ? filename.slice(filename.indexOf('/') + 1) : filename;
        entries.set(relativePath, buffer.subarray(contentStart, contentStart + compressedSize).toString('utf8'));
        offset = contentStart + compressedSize;
    }

    return entries;
}

function parseArchiveJson(entries, path) {
    const content = entries.get(path);
    expect(content, `research archive is missing ${path}`).toBeTruthy();
    return JSON.parse(content);
}

function expectUniqueNotificationIds(snapshot, label) {
    const ids = snapshot.map((record) => record.id);
    expect(new Set(ids).size, `${label} contains duplicate durable notification ids`).toBe(ids.length);
}

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
    const sourceRevision = getSourceRevisionEvidence();
    const declaredDeploymentCommit = String(process.env.PLAYWRIGHT_DEPLOYED_COMMIT || '').trim();
    const declaredMigrationState = String(process.env.PLAYWRIGHT_MIGRATION_STATE || '').trim();
    if (actorPool.useIndependentContexts) {
        expect(
            declaredDeploymentCommit,
            'hosted current-head evidence requires PLAYWRIGHT_DEPLOYED_COMMIT'
        ).toBe(sourceRevision.commit);
        expect(
            declaredMigrationState,
            'hosted current-head evidence requires the verified final migration identifier'
        ).toBe(REQUIRED_MIGRATION_STATE);
    }
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
        const orientationReturnNotes = 'Clarify the Blue escalation guardrails before Strategic Orientation completion.';
        const correctedOrientationRationale = 'Blue will stabilize partner relationships while retaining explicit escalation guardrails.';
        await test.step('complete the orientation gate while retaining a returned Blue revision and outcome-free completion', async () => {
            await expect(actors.whiteCellLead.locator('#nextMoveBtn')).toBeDisabled();
            await expect(actors.whiteCellLead.locator('#nextMoveBtn')).toHaveText('Awaiting Orientation');

            const orientationByTeam = {
                blue: { ownOrientation: 'pressure', forecasts: { red: 'stabilization' }, forecastActionDescription: 'Red will preserve market access while limiting escalation.' },
                green: { ownOrientation: 'stabilization', forecasts: { blue: 'pressure' }, strategyDescription: 'Green will protect regional stability under the Blue forecast.' },
                red: { ownOrientation: 'reframe', forecasts: { blue: 'pressure', green_asian_pacific: 'reframe', green_europe: 'stabilization' }, orientationRationale: 'Red will reframe its partnerships for long-term leverage.' },
                industry: { ownOrientation: 'pressure', forecasts: { blue: 'stabilization' }, strategyDescription: 'Industry will protect capacity under the Blue forecast.' }
            };
            const recordedGoals = await runActorOperations(TEAMS.map((team) => () => (
                recordStrategicOrientationFromScribe(actors.teams[team].scribe, {
                    team,
                    ...orientationByTeam[team]
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
                    notes: team === 'blue'
                        ? orientationReturnNotes
                        : `${TEAM_LABELS[team]} orientation reviewed during the playthrough.`,
                    decision: team === 'blue' ? 'return' : 'complete'
                });
            }

            await openSidebarSection(actors.teams.blue.scribe, 'actions');
            await expect(actors.teams.blue.scribe.locator('#actionsList')).toContainText(orientationReturnNotes);
            await expect(actors.teams.blue.scribe.locator('#actionsList')).toContainText(/REV 2|Revision: 2/);

            orientationGoals.blue = await reviseReturnedStrategicOrientation(actors.teams.blue.scribe, {
                goal: orientationGoals.blue,
                orientation: 'stabilization',
                rationale: correctedOrientationRationale
            });
            await submitStrategicOrientationFromScribe(actors.teams.blue.facilitator, orientationGoals.blue);
            if (!actorPool.useIndependentContexts) {
                await actors.whiteCellLead.reload();
                await expect(actors.whiteCellLead.locator('#sessionName')).toContainText(sessionName);
            }
            await reviewStrategicOrientation(actors.whiteCellLead, {
                goal: orientationGoals.blue,
                team: 'blue',
                notes: ''
            });

            await openSidebarSection(actors.whiteCellLead, 'strategicOrientation');
            const orientationSurface = actors.whiteCellLead.locator('#strategicOrientationList');
            await expect(orientationSurface).toContainText('Completed');
            await expect(orientationSurface).toContainText('Green will protect regional stability under the Blue forecast.');
            await expect(orientationSurface).toContainText('Red will reframe its partnerships for long-term leverage.');
            await expect(orientationSurface).toContainText('Industry will protect capacity under the Blue forecast.');
            await expect(orientationSurface).toContainText(correctedOrientationRationale);
            for (const outcome of CURRENT_OUTCOME_LABELS) {
                await expect(orientationSurface.getByText(outcome, { exact: true })).toHaveCount(0);
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
        const returnedActionTitles = {
            blue: 'Revise allied critical-minerals coordination',
            red: 'Revise regional infrastructure access posture'
        };
        const actionReturnNotes = {
            blue: 'Add a measurable allied delivery checkpoint and preserve the requested Green and Industry notifications.',
            red: 'Clarify the six-month implementation sequence before resubmission.'
        };
        const correctedActionOutcomes = {
            blue: 'Deliver an allied checkpoint within six months while preserving Green and Industry notification routing.',
            red: 'Sequence regional infrastructure access measures across the six-month implementation window.'
        };
        await test.step('run Blue and Red action lifecycles through White Cell Lead adjudication', async () => {
            await runActorOperations(['blue', 'red'].map((team) => async () => {
                const actionInput = team === 'blue'
                    ? {
                        goal: actionTitles.blue,
                        objective: 'Coordinate allied controls while preserving a measurable delivery path.',
                        instrumentOfPower: ['Economic', 'Diplomacy'],
                        sector: ['Biotechnology', 'Telecommunications'],
                        supplyChainActionAngle: ['Build resilience for Blue', 'Disrupt Red'],
                        supplyChainFocus: ['Extraction', 'Advanced Manufacturing'],
                        implementation: 'Legislative',
                        legislativeOptions: ['Existing legislation/policy', 'Proposing new legislation/policy'],
                        focusCountries: ['PRC', 'Japan', 'EU'],
                        expectedOutcomes: 'Reduce allied dependence and establish a joint review before the next move.',
                        notificationTeams: ['Green', 'Industry'],
                        notificationNote: 'Notify Green and Industry after White Cell accepts the action.'
                    }
                    : {
                        goal: actionTitles.red,
                        focusCountries: ['U.S', 'PRC']
                    };
                await createDraftAction(actors.teams[team].scribe, actionInput);
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
                notes: 'Blue action approved during the professional playthrough.',
                expectedDetails: {
                    Objective: 'Coordinate allied controls while preserving a measurable delivery path.',
                    'Instrument of Power': 'Economic, Diplomacy',
                    'Supply Chain Decision': 'Yes',
                    'Action Angles': 'Build resilience for Blue, Disrupt Red',
                    'Supply Chain Areas': 'Extraction, Advanced Manufacturing',
                    Implementation: 'Legislative',
                    'Legislative Route': 'Existing legislation/policy, Proposing new legislation/policy',
                    Sectors: 'Biotechnology, Telecommunications',
                    'Focus Countries': 'PRC, EU, Japan',
                    'Coordination Decision': 'Yes',
                    'Coordination Selections': 'Executive',
                    'Informed/Engaged Decision': 'Yes',
                    'Informed/Engaged Selections': 'Allies',
                    'Teams to Inform': 'Green, Industry',
                    'Notification Note': 'Notify Green and Industry after White Cell accepts the action.',
                    'Expected Outcomes': 'Reduce allied dependence and establish a joint review before the next move.'
                }
            });
            await adjudicateAction(actors.whiteCellLead, {
                goal: actionTitles.red,
                section: 'responses',
                notes: 'Red action accepted as complete during the professional playthrough.'
            });
        });

        await test.step('return, edit, and resubmit separate Blue and Red actions without weakening normal completion', async () => {
            for (const team of ['blue', 'red']) {
                await createDraftAction(actors.teams[team].scribe, {
                    goal: returnedActionTitles[team],
                    focusCountries: team === 'blue' ? ['U.S', 'Japan'] : ['U.S', 'PRC'],
                    notificationTeams: team === 'blue' ? ['Green', 'Industry'] : [],
                    notificationNote: team === 'blue'
                        ? 'Retain both notification audiences through the returned revision.'
                        : ''
                });
                await forwardActionToScribe(actors.teams[team].scribe, returnedActionTitles[team]);
                await submitActionFromScribe(actors.teams[team].facilitator, returnedActionTitles[team]);
                await adjudicateAction(actors.whiteCellLead, {
                    goal: returnedActionTitles[team],
                    section: team === 'red' ? 'responses' : 'actions',
                    notes: actionReturnNotes[team],
                    decision: 'return'
                });

                await openSidebarSection(actors.teams[team].scribe, 'actions');
                const returnedCard = actors.teams[team].scribe.locator('#actionsList .entity-card')
                    .filter({ hasText: returnedActionTitles[team] })
                    .first();
                await expect(returnedCard).toContainText('Returned by White Cell');
                await expect(returnedCard).toContainText(actionReturnNotes[team]);
                await expect(returnedCard).toContainText(/REV 2|Revision: 2/);

                await reviseReturnedAction(actors.teams[team].scribe, {
                    goal: returnedActionTitles[team],
                    expectedOutcomes: correctedActionOutcomes[team]
                });
                await submitActionFromScribe(actors.teams[team].facilitator, returnedActionTitles[team]);
                await adjudicateAction(actors.whiteCellLead, {
                    goal: returnedActionTitles[team],
                    section: team === 'red' ? 'responses' : 'actions',
                    notes: ''
                });
            }

            for (const team of ['blue', 'red']) {
                await openSidebarSection(actors.teams[team].scribe, 'actions');
                const actionSurface = actors.teams[team].scribe.locator('#actionsList');
                await expect(actionSurface).toContainText(returnedActionTitles[team]);
                await expect(actionSurface).toContainText('Completed');
                for (const outcome of CURRENT_OUTCOME_LABELS) {
                    await expect(actionSurface.getByText(outcome, { exact: true })).toHaveCount(0);
                }
            }
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
        const dualProposalTitle = 'Green proposal for Blue negotiation';
        const blueNegotiationTerms = 'Add a six-month review clause and a shared delivery checkpoint.';
        const redNegotiationTerms = 'Add a Red-specific infrastructure checkpoint and a nine-month review clause.';
        const blueFollowUp = 'Green accepts the six-month checkpoint and proposes a joint implementation review.';
        const redFollowUp = 'Green accepts the Red infrastructure checkpoint while keeping that negotiation independently scoped.';
        await test.step('cover proposal decisions plus independent immutable Blue and Red negotiation threads', async () => {
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
                    negotiationTerms: proposal.title === dualProposalTitle
                        ? blueNegotiationTerms
                        : 'Add a six-month review clause and a shared delivery checkpoint.'
                });
            }

            await respondToForwardedProposal(actors.teams.red.facilitator, {
                title: dualProposalTitle,
                decision: 'negotiate',
                negotiationTerms: redNegotiationTerms
            });

            await replyToProposalThread(actors.teams.green.facilitator, {
                title: dualProposalTitle,
                recipientTeam: 'blue',
                message: blueFollowUp
            });
            await replyToProposalThread(actors.teams.green.facilitator, {
                title: dualProposalTitle,
                recipientTeam: 'red',
                message: redFollowUp
            });

            await openFacilitatorActionSlide(
                actors.teams.green.facilitator,
                dualProposalTitle
            );
            const proposingFrame = actors.teams.green.facilitator.locator('#deckActionFrame');
            await expect(proposingFrame).toContainText(/Blue Team.*Negotiation underway/);
            await expect(proposingFrame).toContainText(/Red Team.*Negotiation underway/);
            await expect(proposingFrame).toContainText(blueNegotiationTerms);
            await expect(proposingFrame).toContainText(redNegotiationTerms);
            await expect(proposingFrame).toContainText(blueFollowUp);
            await expect(proposingFrame).toContainText(redFollowUp);

            await openReceivedProposalSlide(actors.teams.blue.facilitator, dualProposalTitle);
            await expect(actors.teams.blue.facilitator.locator('#deckActionFrame')).toContainText(blueNegotiationTerms);
            await expect(actors.teams.blue.facilitator.locator('#deckActionFrame')).toContainText(blueFollowUp);
            await expect(actors.teams.blue.facilitator.locator('#deckActionFrame')).not.toContainText(redNegotiationTerms);
            await expect(actors.teams.blue.facilitator.locator('#deckActionFrame')).not.toContainText(redFollowUp);

            await openReceivedProposalSlide(actors.teams.red.facilitator, dualProposalTitle);
            await expect(actors.teams.red.facilitator.locator('#deckActionFrame')).toContainText(redNegotiationTerms);
            await expect(actors.teams.red.facilitator.locator('#deckActionFrame')).toContainText(redFollowUp);
            await expect(actors.teams.red.facilitator.locator('#deckActionFrame')).not.toContainText(blueNegotiationTerms);
            await expect(actors.teams.red.facilitator.locator('#deckActionFrame')).not.toContainText(blueFollowUp);

            await openSidebarSection(actors.whiteCellLead, 'communications');
            await expect(actors.whiteCellLead.locator('#commHistory')).toContainText(blueNegotiationTerms);
            await expect(actors.whiteCellLead.locator('#commHistory')).toContainText(redNegotiationTerms);

            await openSidebarSection(actors.whiteCellLead, 'proposals');
            const proposalSurface = actors.whiteCellLead.locator('#proposalsList');
            for (const outcome of CURRENT_OUTCOME_LABELS) {
                await expect(proposalSurface.getByText(outcome, { exact: true })).toHaveCount(0);
            }
        });

        const rfiQuestions = Object.fromEntries(TEAMS.map((team) => [
            team,
            `${TEAM_LABELS[team]} asks for implementation timing guidance`
        ]));
        const blueRfiResponse = 'White Cell confirms that implementation begins after the current review window.';
        const returnedRfiQuestion = 'Blue asks how to sequence the critical-minerals delivery checkpoint';
        const returnedRfiNotes = 'Name the intended checkpoint and the decision window that requires clarification.';
        const revisedRfiQuestion = 'Blue asks whether the allied delivery checkpoint occurs before the six-month review window';
        const returnedRfiAnswer = 'White Cell confirms the allied delivery checkpoint occurs before the six-month review window.';
        await test.step('retain the simple RFI answer and add returned-RFI edit, resubmission, and answer history', async () => {
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

            await submitRfi(actors.teams.blue.facilitator, { question: returnedRfiQuestion });
            await returnRfi(actors.whiteCellLead, {
                question: returnedRfiQuestion,
                notes: returnedRfiNotes
            });
            await reviseAndResubmitRfi(actors.teams.blue.facilitator, {
                originalQuestion: returnedRfiQuestion,
                revisedQuestion: revisedRfiQuestion,
                returnNotes: returnedRfiNotes
            });
            await answerRfi(actors.whiteCellLead, {
                question: revisedRfiQuestion,
                response: returnedRfiAnswer
            });

            await expect(actors.teams.blue.facilitator.locator('#deckActionFrame')).toContainText(returnedRfiAnswer);
            await openSidebarSection(actors.whiteCellLead, 'requests');
            await actors.whiteCellLead.locator('#rfiHistoryTab').click();
            await expect(actors.whiteCellLead.locator('#rfiQueuePanel')).toContainText(rfiQuestions.blue);
            await expect(actors.whiteCellLead.locator('#rfiQueuePanel')).toContainText(revisedRfiQuestion);
            await expect(actors.whiteCellLead.locator('#rfiQueuePanel')).toContainText(returnedRfiAnswer);
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
            const inboundMessage = actors.whiteCellLead.locator('#commHistory [data-communication-id]')
                .filter({ hasText: facilitatorMessage });
            const openMessageButton = inboundMessage.getByRole('button', { name: 'Open message' });
            await expect(openMessageButton).toBeEnabled({ timeout: 20000 });
            await openMessageButton.dispatchEvent('click');
            await expect(openMessageButton).toBeHidden();
        });

        await test.step('deliver ordered direct communications with exact unread notification behavior', async () => {
            const blueAlertsBadge = actors.teams.blue.facilitator.locator('#scribeAlertsBadge');
            for (let index = 0; index < 30 && await blueAlertsBadge.isVisible(); index += 1) {
                await actors.teams.blue.facilitator.locator('#scribeAlertsBtn').click();
                await actors.teams.blue.facilitator.locator('#scribeAlertsList .scribe-alert.is-unread').first().click();
            }
            await expect(blueAlertsBadge).toBeHidden();

            for (const content of communicationMessages) {
                await sendWhiteCellCommunication(actors.whiteCellLead, {
                    recipient: 'blue_scribe',
                    content
                });
            }

            await expect(blueAlertsBadge).toHaveText('2');
            const durableNotice = await waitForDurableNotification(actors.teams.blue.facilitator, {
                source: 'White Cell',
                artifact: communicationMessages[1],
                requiredAction: 'Open and read the message; reply if action is required.'
            });
            await actors.teams.blue.facilitator.waitForTimeout(5500);
            await expect(durableNotice).toBeVisible();
            const dismissedNotificationId = await durableNotice.getAttribute('data-notification-id');
            expect(dismissedNotificationId).toBeTruthy();
            await durableNotice.getByRole('button', { name: 'Dismiss notification' }).click();
            await expect(durableNotice).toBeHidden();
            await expect(blueAlertsBadge).toHaveText('2');

            await actors.teams.blue.facilitator.reload();
            await expect(actors.teams.blue.facilitator.locator('#sessionName')).toContainText(sessionName);
            await expect(
                actors.teams.blue.facilitator.locator(
                    `#toast-container [data-notification-id="${dismissedNotificationId}"]`
                )
            ).toHaveCount(0);
            await expect(blueAlertsBadge).toHaveText('2');

            await actors.teams.blue.facilitator.locator('#scribeAlertsBtn').click();
            await expect(actors.teams.blue.facilitator.locator('#scribeAlertsList')).toContainText(communicationMessages[1]);
            await expect(actors.teams.blue.facilitator.locator('#scribeAlertsList')).toContainText(communicationMessages[0]);
            await expect(blueAlertsBadge).toHaveText('2');
            await actors.teams.blue.facilitator.locator('#scribeAlertsList .scribe-alert.is-unread').first().click();
            await expect(blueAlertsBadge).toHaveText('1');
            await actors.teams.blue.facilitator.locator('#scribeAlertsBtn').click();
            await actors.teams.blue.facilitator.locator('#scribeAlertsList .scribe-alert.is-unread').first().click();
            await expect(blueAlertsBadge).toBeHidden();

            await expect(actors.teams.red.facilitator.locator('#scribeAlertsList')).not.toContainText(communicationMessages[0]);
            await expect(actors.teams.green.facilitator.locator('#scribeAlertsList')).not.toContainText(communicationMessages[0]);
            await expect(actors.teams.industry.facilitator.locator('#scribeAlertsList')).not.toContainText(communicationMessages[0]);
        });

        await test.step('deduplicate every inbound notification family across startup and reconnect reconciliation', async () => {
            const expectedFamilies = {
                whiteCell: [
                    'artifact-submission',
                    'rfi-submission',
                    'direct-communication',
                    'proposal-response',
                    'proposal-follow-up'
                ],
                blueFacilitator: [
                    'artifact-return',
                    'rfi-return',
                    'rfi-answer',
                    'proposal-response',
                    'proposal-follow-up',
                    'direct-communication'
                ]
            };
            const pages = {
                whiteCell: actors.whiteCellLead,
                blueFacilitator: actors.teams.blue.facilitator
            };
            const before = {};

            for (const [label, page] of Object.entries(pages)) {
                before[label] = await getDurableNotificationSnapshot(page);
                expectUniqueNotificationIds(before[label], `${label} before startup/reconnect`);
                expect(before[label].map((record) => record.family)).toEqual(
                    expect.arrayContaining(expectedFamilies[label])
                );
            }

            await Promise.all(Object.values(pages).map((page) => page.reload()));
            await Promise.all(Object.values(pages).map((page) => (
                expect(page.locator('#sessionName')).toContainText(sessionName)
            )));
            await Promise.all(Object.values(pages).map((page) => page.evaluate(() => {
                window.dispatchEvent(new Event('offline'));
                window.dispatchEvent(new Event('online'));
            })));
            await Promise.all(Object.values(pages).map((page) => (
                expect(page.locator('#syncStatusBanner')).toBeHidden({ timeout: 30000 })
            )));

            for (const [label, page] of Object.entries(pages)) {
                const after = await getDurableNotificationSnapshot(page);
                expectUniqueNotificationIds(after, `${label} after startup/reconnect`);
                expect(after.map((record) => record.id)).toEqual(before[label].map((record) => record.id));
                expect(after.map((record) => record.family)).toEqual(before[label].map((record) => record.family));
            }
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

        await test.step('export and reconcile workflow, revision, recipient-thread, notification, and RFI evidence', async () => {
            await selectSessionForOperatorView(actors.gameMaster, {
                section: 'export',
                selectId: '#exportSessionSelect',
                sessionName
            });
            await expect(actors.gameMaster.locator('#exportResearchArchiveBtn')).toBeEnabled();

            const downloadPromise = actors.gameMaster.waitForEvent('download');
            await actors.gameMaster.locator('#exportResearchArchiveBtn').click();
            const download = await downloadPromise;
            const downloadPath = await download.path();
            expect(downloadPath).toBeTruthy();
            expect(download.suggestedFilename()).toMatch(/^research_export_.+\.zip$/);

            const archiveEntries = readStoredZipEntries(await readFile(downloadPath));
            const manifest = parseArchiveJson(archiveEntries, 'manifest.json');
            const actionContent = parseArchiveJson(archiveEntries, 'action_content.json');
            const proposalContent = parseArchiveJson(archiveEntries, 'proposal_content.json');
            const rfiContent = parseArchiveJson(archiveEntries, 'rfi_content.json');
            const workflowReviews = parseArchiveJson(archiveEntries, 'artifact_workflow_reviews.json');

            expect(manifest.session_config_snapshot.session_name).toBe(sessionName);
            expect(manifest.schema_version).toBe('1.9.0');
            expect(manifest.export_format_revision).toBe(10);
            expect(manifest.contract_reconciliation.status).toBe('passed');
            expect(manifest.contract_reconciliation.checks.artifact_review_rows.matches).toBe(true);
            expect(manifest.contract_reconciliation.checks.proposal_threads.matches).toBe(true);
            expect(manifest.contract_reconciliation.checks.rfi_revisions.matches).toBe(true);
            expect(manifest.contract_reconciliation.checks.ui_workflow_projection).toMatchObject({
                matches: true,
                current_completed_outcome_violations: 0
            });
            expect(manifest.row_counts.artifact_workflow_reviews).toBe(workflowReviews.length);

            const actionByTitle = new Map(actionContent.map((action) => [action.title, action]));
            for (const team of ['blue', 'red']) {
                expect(actionByTitle.get(actionTitles[team])).toMatchObject({
                    workflow_state: 'completed',
                    revision_number: 1,
                    legacy_adjudication_outcome: null
                });

                const returnedAction = actionByTitle.get(returnedActionTitles[team]);
                expect(returnedAction).toMatchObject({
                    workflow_state: 'completed',
                    revision_number: 2,
                    legacy_adjudication_outcome: null
                });
                expect(returnedAction.full_content.expected_outcomes).toBe(correctedActionOutcomes[team]);
                expect(returnedAction.review_history.map((review) => review.decision)).toEqual([
                    'return_to_team',
                    'complete'
                ]);
                const returnReview = returnedAction.review_history[0];
                expect(returnReview).toMatchObject({
                    revision_number: 1,
                    next_revision_number: 2,
                    reviewer_role: 'whitecell_lead',
                    reviewer_notes: actionReturnNotes[team]
                });
                expect(Date.parse(returnReview.reviewed_utc)).not.toBeNaN();
                expect(returnReview.prior_state.goal).toBe(returnedActionTitles[team]);
                expect(returnReview.new_state.revision_number).toBe(2);
            }

            const completedOrientation = actionByTitle.get(orientationGoals.blue);
            expect(completedOrientation).toMatchObject({
                workflow_state: 'completed',
                revision_number: 2,
                legacy_adjudication_outcome: null
            });
            expect(completedOrientation.full_content.details.rationale).toBe(correctedOrientationRationale);
            expect(completedOrientation.review_history.map((review) => review.decision)).toEqual([
                'return_to_team',
                'complete'
            ]);
            expect(completedOrientation.review_history[0]).toMatchObject({
                reviewer_notes: orientationReturnNotes,
                reviewer_role: 'whitecell_lead'
            });
            expect(Date.parse(completedOrientation.review_history[0].reviewed_utc)).not.toBeNaN();

            const blueNotificationAction = actionByTitle.get(actionTitles.blue);
            expect(blueNotificationAction.notification_audiences).toEqual(['green', 'industry']);
            expect(blueNotificationAction.notification_note).toBe(
                'Notify Green and Industry after White Cell accepts the action.'
            );

            const dualProposal = proposalContent.find((proposal) => proposal.title === dualProposalTitle);
            expect(dualProposal).toMatchObject({
                workflow_state: 'completed',
                revision_number: 1,
                thread_count: 2,
                round_count: 6,
                review_decision: null
            });
            expect(dualProposal.recipient_approvals.blue.status).toBe('approved_forwarded');
            expect(dualProposal.recipient_approvals.red.status).toBe('approved_forwarded');
            expect(dualProposal.recipient_approval_states).toEqual({
                blue: 'approved_forwarded',
                red: 'approved_forwarded'
            });

            for (const [recipient, expectedMessages] of Object.entries({
                blue: [blueNegotiationTerms, blueFollowUp],
                red: [redNegotiationTerms, redFollowUp]
            })) {
                const rounds = dualProposal.thread_history.filter((round) => round.recipient_team === recipient);
                expect(rounds.map((round) => round.round_number)).toEqual([0, 1, 2]);
                expect(new Set(rounds.map((round) => round.thread_id)).size).toBe(1);
                expect(new Set(rounds.map((round) => round.message_id)).size).toBe(3);
                expect(rounds[0].parent_message_id).toBeNull();
                expect(rounds[1].parent_message_id).toBe(rounds[0].message_id);
                expect(rounds[2].parent_message_id).toBe(rounds[1].message_id);
                expect(rounds[1].content).toBe(expectedMessages[0]);
                expect(rounds[2].content).toBe(expectedMessages[1]);
                rounds.forEach((round) => {
                    expect(round.source_proposal_id).toBe(dualProposal.proposal_id);
                    expect(round.source_revision).toBe(1);
                    expect(round.sender_team).toBeTruthy();
                    expect(round.sender_role).toBeTruthy();
                    expect(round.message_type).toBeTruthy();
                    expect(Date.parse(round.sent_utc)).not.toBeNaN();
                });
            }

            const simpleAnsweredRfi = rfiContent.find((rfi) => rfi.question_text === rfiQuestions.blue);
            expect(simpleAnsweredRfi).toMatchObject({
                workflow_state: 'completed',
                revision_number: 1,
                answer_text: blueRfiResponse
            });
            expect(simpleAnsweredRfi.answer_history).toHaveLength(1);
            expect(simpleAnsweredRfi.review_history).toEqual([]);

            const returnedRfi = rfiContent.find((rfi) => rfi.question_text === revisedRfiQuestion);
            expect(returnedRfi).toMatchObject({
                workflow_state: 'completed',
                revision_number: 2,
                return_notes: returnedRfiNotes,
                returned_by_role: 'whitecell_lead',
                answer_text: returnedRfiAnswer
            });
            expect(Date.parse(returnedRfi.returned_utc)).not.toBeNaN();
            expect(Date.parse(returnedRfi.resubmitted_utc)).not.toBeNaN();
            expect(returnedRfi.review_history).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    decision: 'return_for_clarification',
                    reviewer_notes: returnedRfiNotes,
                    revision_number: 1,
                    next_revision_number: 2
                })
            ]));
            expect(returnedRfi.resubmission_history).toHaveLength(1);
            expect(returnedRfi.resubmission_history[0]).toMatchObject({
                revision_number: 2
            });
            expect(returnedRfi.answer_history).toHaveLength(1);
            expect(returnedRfi.answer_history[0]).toMatchObject({
                revision_number: 2,
                answer_text: returnedRfiAnswer,
                answered_by_role: 'whitecell_lead',
                workflow_state: 'completed'
            });

            for (const requiredPath of [
                'action_content.csv',
                'proposal_content.csv',
                'rfi_content.csv',
                'artifact_workflow_reviews.csv',
                'report.html',
                'report.tex'
            ]) {
                expect(archiveEntries.has(requiredPath), `research archive is missing ${requiredPath}`).toBe(true);
            }
            for (const projectionPath of ['report.html', 'report.tex']) {
                const projection = archiveEntries.get(projectionPath);
                expect(projection).toContain(returnedActionTitles.blue);
                expect(projection).toContain(actionReturnNotes.blue);
                expect(projection).toContain(dualProposalTitle);
                expect(projection).toContain(returnedRfiNotes);
                expect(projection).toContain(returnedRfiAnswer);
            }
        });

        await testInfo.attach('playthrough-diagnostics.json', {
            body: JSON.stringify({
                sessionCode,
                sessionName,
                actorCount: allActorPages.length,
                sessionSeatCount: 17,
                backend: actorPool.useIndependentContexts ? 'hosted-real-backend' : 'local-deterministic-mock',
                sourceRevision,
                declaredDeploymentCommit: declaredDeploymentCommit || null,
                migrationState: actorPool.useIndependentContexts
                    ? declaredMigrationState
                    : REQUIRED_MIGRATION_STATE,
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
