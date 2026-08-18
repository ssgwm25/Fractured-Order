import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mergeNotetakerRecord } from '../services/database.js';
import { getTrainingProfileFixtureBundle } from '../features/training/content/fixtures.js';
import {
    NOTETAKER_COMMANDS,
    NOTETAKER_PRACTICE_TEXT_LIMIT,
    TRAINING_RECOVERY_MESSAGE,
    getNotetakerTrainingCommand,
    trainingRuntime
} from '../features/training/trainingRuntime.js';
import {
    getNotetakerPracticeInputError,
    isNotetakerPracticeOffline,
    shouldMountNotetakerTrainingCoach
} from '../features/training/NotetakerTrainingCoach.js';
import {
    DEFAULT_ALLIANCE_DATA,
    DEFAULT_DYNAMICS_DATA,
    NOTETAKER_INBOX_RENDER_LIMIT,
    NOTETAKER_TIMELINE_RENDER_LIMIT,
    NotetakerController,
    NOTETAKER_TIMELINE_EVENT_SOURCE,
    buildNotetakerViewState,
    buildNotetakerSaveTimelineEvent,
    createObservationTimelineEntry,
    getNotetakerRecordForMove,
    isObservationCaptureEvent
} from './notetaker.js';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createFakeElement(id = null, tagName = 'div') {
    let textContent = '';
    let explicitInnerHtml = null;

    return {
        id,
        tagName: tagName.toUpperCase(),
        className: '',
        style: {},
        dataset: {},
        get textContent() {
            return textContent;
        },
        set textContent(value) {
            textContent = value == null ? '' : String(value);
            explicitInnerHtml = null;
        },
        get innerHTML() {
            return explicitInnerHtml ?? escapeHtml(textContent);
        },
        set innerHTML(value) {
            explicitInnerHtml = value == null ? '' : String(value);
        },
        get outerHTML() {
            const attributes = [];
            if (this.id) {
                attributes.push(`id="${escapeHtml(this.id)}"`);
            }
            if (this.className) {
                attributes.push(`class="${escapeHtml(this.className)}"`);
            }

            return `<${tagName}${attributes.length ? ` ${attributes.join(' ')}` : ''}>${this.innerHTML}</${tagName}>`;
        },
        appendChild(child) {
            explicitInnerHtml = `${explicitInnerHtml ?? ''}${child?.outerHTML ?? ''}`;
        }
    };
}

function createFakeDocument(ids = []) {
    const elements = Object.fromEntries(ids.map((id) => [id, createFakeElement(id)]));

    return {
        elements,
        body: {
            dataset: {}
        },
        createElement(tagName) {
            return createFakeElement(null, tagName);
        },
        getElementById(id) {
            return elements[id] || null;
        }
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    delete global.document;
});

const BLUE_NOTETAKER_HTML_PATH = new URL('../../teams/blue/notetaker.html', import.meta.url);
const RED_NOTETAKER_HTML_PATH = new URL('../../teams/red/notetaker.html', import.meta.url);
const GREEN_NOTETAKER_HTML_PATH = new URL('../../teams/green/notetaker.html', import.meta.url);
const INDUSTRY_NOTETAKER_HTML_PATH = new URL('../../teams/industry/notetaker.html', import.meta.url);
const NOTETAKER_TRAINING_COACH_PATH = new URL('../features/training/NotetakerTrainingCoach.js', import.meta.url);

describe('Notetaker move-scoped view state', () => {
    it('hydrates participant-scoped notes and filters move observations by team', () => {
        const viewState = buildNotetakerViewState({
            dynamics_analysis: {
                schema_version: 2,
                team_entries: {
                    blue: {
                        participant_entries: {
                            'seat-blue-1': {
                                participant_key: 'seat-blue-1',
                                data: {
                                    emergingLeaders: 'Taylor'
                                }
                            }
                        }
                    }
                }
            },
            external_factors: null,
            observation_timeline: [
                {
                    id: 'obs-blue-1',
                    team: 'blue',
                    type: 'NOTE',
                    content: 'Blue note'
                },
                {
                    id: 'obs-red-1',
                    team: 'red',
                    type: 'NOTE',
                    content: 'Red note'
                }
            ]
        }, {
            teamId: 'blue',
            participantKey: 'seat-blue-1'
        });

        expect(viewState.dynamicsData).toEqual({
            ...DEFAULT_DYNAMICS_DATA,
            emergingLeaders: 'Taylor'
        });
        expect(viewState.allianceData).toEqual(DEFAULT_ALLIANCE_DATA);
        expect(viewState.observationTimeline).toEqual([
            {
                id: 'obs-blue-1',
                team: 'blue',
                type: 'NOTE',
                content: 'Blue note'
            }
        ]);
    });

    it('restores each notetaker seat without overwriting a second seat on the same move', () => {
        const firstSave = mergeNotetakerRecord(null, {
            session_id: 'session-77',
            move: 1,
            phase: 2,
            team: 'blue',
            client_id: 'client-blue-1',
            participant_key: 'seat-blue-1',
            participant_id: 'seat-blue-1',
            dynamics_analysis: {
                emergingLeaders: 'Sam',
                frictionLevel: '7'
            }
        }, {
            timestamp: '2026-04-06T12:00:00.000Z'
        });

        const captureEntry = createObservationTimelineEntry({
            id: 'obs-77',
            type: 'NOTE',
            content: 'Delegation pressure rising',
            phase: 2,
            createdAt: '2026-04-06T12:02:00.000Z',
            teamId: 'blue',
            participantKey: 'seat-blue-1'
        });

        const secondSave = mergeNotetakerRecord(firstSave, {
            session_id: 'session-77',
            move: 1,
            phase: 2,
            team: 'blue',
            client_id: 'client-blue-2',
            participant_key: 'seat-blue-2',
            participant_id: 'seat-blue-2',
            dynamics_analysis: {
                emergingLeaders: 'Morgan',
                consensusLevel: '8'
            }
        }, {
            timestamp: '2026-04-06T12:01:00.000Z'
        });

        const thirdSave = mergeNotetakerRecord(secondSave, {
            session_id: 'session-77',
            move: 1,
            phase: 2,
            team: 'blue',
            client_id: 'client-blue-1',
            participant_key: 'seat-blue-1',
            participant_id: 'seat-blue-1',
            external_factors: {
                allianceNotes: 'Regional partners aligned',
                externalPressures: 'Commodity price shock'
            },
            observation_timeline_append: [captureEntry]
        }, {
            timestamp: '2026-04-06T12:02:00.000Z'
        });

        const otherMoveRecord = mergeNotetakerRecord(null, {
            session_id: 'session-77',
            move: 2,
            phase: 1,
            team: 'blue',
            client_id: 'client-blue-1',
            participant_key: 'seat-blue-1',
            participant_id: 'seat-blue-1',
            dynamics_analysis: {
                emergingLeaders: 'Morgan'
            }
        }, {
            timestamp: '2026-04-06T12:05:00.000Z'
        });

        const restoredRecord = getNotetakerRecordForMove([thirdSave, otherMoveRecord], 1);
        const restoredState = buildNotetakerViewState(restoredRecord, {
            teamId: 'blue',
            participantKey: 'seat-blue-1'
        });
        const secondSeatState = buildNotetakerViewState(restoredRecord, {
            teamId: 'blue',
            participantKey: 'seat-blue-2'
        });

        expect(restoredState.dynamicsData).toMatchObject({
            emergingLeaders: 'Sam',
            frictionLevel: '7'
        });
        expect(restoredState.allianceData).toMatchObject({
            allianceNotes: 'Regional partners aligned',
            externalPressures: 'Commodity price shock'
        });
        expect(restoredState.observationTimeline).toEqual([
            {
                ...captureEntry,
                participant_id: 'seat-blue-1',
                client_id: 'client-blue-1',
                participant_label: null
            }
        ]);

        expect(secondSeatState.dynamicsData).toMatchObject({
            emergingLeaders: 'Morgan',
            consensusLevel: '8'
        });
        expect(secondSeatState.allianceData).toEqual(DEFAULT_ALLIANCE_DATA);
    });

    it('builds structured shared timeline updates for manual note saves while keeping the top-level content generic', () => {
        const timelineEvent = buildNotetakerSaveTimelineEvent('dynamics', {
            sessionId: 'session-88',
            teamId: 'blue',
            teamLabel: 'Blue Team',
            participantKey: 'seat-blue-1',
            participantId: 'participant-blue-1',
            participantLabel: 'Morgan',
            clientId: 'client-blue-1',
            move: 2,
            phase: 3
        }, {
            emergingLeaders: 'Taylor',
            decisionStyle: 'Consensus with side caucuses',
            frictionLevel: '7',
            frictionSources: 'Tariff sequencing dispute',
            consensusLevel: '6',
            dynamicsSummary: 'Lead delegates are aligned on timing but split on concessions.'
        });

        expect(timelineEvent).toEqual({
            session_id: 'session-88',
            type: 'NOTE',
            content: 'Team dynamics notes saved',
            team: 'blue',
            client_id: 'client-blue-1',
            move: 2,
            phase: 3,
            metadata: {
                actor: 'Morgan',
                role: 'blue_notetaker',
                source: NOTETAKER_TIMELINE_EVENT_SOURCE,
                note_scope: 'dynamics',
                note_scope_label: 'Team Dynamics',
                note_details: [
                    { key: 'emergingLeaders', label: 'Emerging Leaders', value: 'Taylor' },
                    { key: 'decisionStyle', label: 'Decision Making Style', value: 'Consensus with side caucuses' },
                    { key: 'frictionLevel', label: 'Friction Level', value: '7/10' },
                    { key: 'frictionSources', label: 'Friction Sources', value: 'Tariff sequencing dispute' },
                    { key: 'consensusLevel', label: 'Consensus Level', value: '6/10' },
                    { key: 'dynamicsSummary', label: 'Summary Notes', value: 'Lead delegates are aligned on timing but split on concessions.' }
                ],
                participant_key: 'seat-blue-1',
                participant_id: 'participant-blue-1',
                participant_label: 'Morgan'
            }
        });
    });

    it('keeps shared save events out of the recent captures stream', () => {
        const saveEvent = buildNotetakerSaveTimelineEvent('alliance', {
            sessionId: 'session-88',
            teamId: 'blue',
            teamLabel: 'Blue Team',
            move: 1,
            phase: 1
        });

        expect(isObservationCaptureEvent({
            type: 'NOTE',
            content: 'Team quoted the minister directly.',
            metadata: { actor: 'Morgan' }
        })).toBe(true);
        expect(isObservationCaptureEvent(saveEvent)).toBe(false);
        expect(isObservationCaptureEvent({
            type: 'MOMENT',
            content: 'Turning point reached'
        })).toBe(true);
    });

    it('renders full facilitator action details in the read-only action view', () => {
        const fakeDocument = createFakeDocument(['actionsListView']);
        global.document = fakeDocument;

        const controller = new NotetakerController();
        controller.actions = [{
            id: 'action-91',
            goal: 'Lock in refinery access',
            mechanism: 'Backchannel guarantees',
            move: 2,
            phase: 3,
            status: 'adjudicated',
            priority: 'URGENT',
            expected_outcomes: 'Maintain fuel deliveries through the next move.',
            ally_contingencies: 'Use regional lenders as guarantors.',
            targets: ['Refinery Board'],
            sector: 'Energy',
            exposure_type: 'Covert',
            submitted_at: '2026-04-08T11:15:00.000Z',
            adjudication_notes: 'White Cell requires tighter sanctions mitigation.'
        }];

        controller.renderActionsView();

        const markup = fakeDocument.elements.actionsListView.innerHTML;
        expect(markup).toContain('Move 2 • Phase 3');
        expect(markup).toContain('Targets:</strong> Refinery Board');
        expect(markup).toContain('Sector:</strong> Energy');
        expect(markup).toContain('Exposure:</strong> Covert');
        expect(markup).toContain('Ally Contingencies:</strong> Use regional lenders as guarantors.');
        expect(markup).toContain('Completed');
        expect(markup).toContain('Submitted:</strong>');
        expect(markup).toContain('White Cell Notes:</strong> White Cell requires tighter sanctions mitigation.');
    });

    it('renders structured notetaker save details in the session timeline', () => {
        const fakeDocument = createFakeDocument(['timelineList']);
        global.document = fakeDocument;

        const controller = new NotetakerController();
        controller.renderTimeline([{
            id: 'timeline-88',
            type: 'NOTE',
            content: 'Team dynamics notes saved',
            created_at: '2026-04-10T09:00:00.000Z',
            move: 2,
            metadata: {
                actor: 'Morgan',
                source: NOTETAKER_TIMELINE_EVENT_SOURCE,
                note_scope: 'dynamics',
                note_details: [
                    { label: 'Emerging Leaders', value: 'Taylor' },
                    { label: 'Friction Sources', value: 'Tariff sequencing dispute' },
                    { label: 'Summary Notes', value: 'Delegation cohesion softened after the caucus break.' }
                ]
            }
        }]);

        const markup = fakeDocument.elements.timelineList.innerHTML;
        expect(markup).toContain('Team dynamics notes saved');
        expect(markup).toContain('Team Dynamics snapshot');
        expect(markup).toContain('Emerging Leaders');
        expect(markup).toContain('Tariff sequencing dispute');
        expect(markup).toContain('Delegation cohesion softened after the caucus break.');
    });

    it('bounds notetaker timeline rendering for large exercise datasets', () => {
        const fakeDocument = createFakeDocument(['timelineList']);
        global.document = fakeDocument;

        const controller = new NotetakerController();
        controller.renderTimeline(Array.from({ length: NOTETAKER_TIMELINE_RENDER_LIMIT + 2 }, (_, index) => ({
            id: `timeline-${index + 1}`,
            type: 'NOTE',
            content: `Notetaker timeline event ${index + 1}`,
            created_at: '2026-04-10T09:00:00.000Z',
            move: 2,
            metadata: {
                actor: 'Morgan'
            }
        })));

        const markup = fakeDocument.elements.timelineList.innerHTML;
        expect(markup).toContain(
            `Showing the first ${NOTETAKER_TIMELINE_RENDER_LIMIT} of ${NOTETAKER_TIMELINE_RENDER_LIMIT + 2} timeline events.`
        );
        expect(markup).toContain(`Notetaker timeline event ${NOTETAKER_TIMELINE_RENDER_LIMIT}`);
        expect(markup).not.toContain(`Notetaker timeline event ${NOTETAKER_TIMELINE_RENDER_LIMIT + 1}`);
    });

    it('bounds notetaker inbox rendering while preserving the full unread count', () => {
        const fakeDocument = createFakeDocument(['inboxList', 'inboxBadge']);
        global.document = fakeDocument;

        const controller = new NotetakerController();
        controller.inboxCommunications = Array.from({ length: NOTETAKER_INBOX_RENDER_LIMIT + 2 }, (_, index) => ({
            id: `comm-${index + 1}`,
            type: 'GUIDANCE',
            content: `White Cell communication ${index + 1}`,
            created_at: '2026-04-10T09:00:00.000Z',
            metadata: {}
        }));

        controller.renderInbox();

        const markup = fakeDocument.elements.inboxList.innerHTML;
        expect(fakeDocument.elements.inboxBadge.textContent).toBe(String(NOTETAKER_INBOX_RENDER_LIMIT + 2));
        expect(markup).toContain(
            `Showing the first ${NOTETAKER_INBOX_RENDER_LIMIT} of ${NOTETAKER_INBOX_RENDER_LIMIT + 2} White Cell communications.`
        );
        expect(markup).toContain(`White Cell communication ${NOTETAKER_INBOX_RENDER_LIMIT}`);
        expect(markup).not.toContain(`White Cell communication ${NOTETAKER_INBOX_RENDER_LIMIT + 1}`);
    });

    it('ships a dedicated White Cell inbox section on the notetaker surface', () => {
        const html = readFileSync(BLUE_NOTETAKER_HTML_PATH, 'utf8');

        expect(html).toContain('data-section="inbox"');
        expect(html).toContain('id="inboxBadge"');
        expect(html).toContain('id="inboxSection"');
        expect(html).toContain('id="inboxList"');
        expect(html).toContain('White Cell Inbox');
    });

    it('binds notetaker dynamics and alliance labels to their controls on every team surface', () => {
        const controlIds = [
            'emergingLeaders',
            'decisionStyle',
            'frictionLevel',
            'frictionSources',
            'consensusLevel',
            'dynamicsSummary',
            'allianceNotes',
            'externalPressures'
        ];

        [
            BLUE_NOTETAKER_HTML_PATH,
            RED_NOTETAKER_HTML_PATH,
            GREEN_NOTETAKER_HTML_PATH,
            INDUSTRY_NOTETAKER_HTML_PATH
        ].forEach((htmlPath) => {
            const html = readFileSync(htmlPath, 'utf8');

            controlIds.forEach((controlId) => {
                expect(html).toContain(`for="${controlId}"`);
                expect(html).toContain(`id="${controlId}"`);
            });
        });
    });

    it('groups notetaker quick-capture type radios with a semantic fieldset on every team surface', () => {
        [
            BLUE_NOTETAKER_HTML_PATH,
            RED_NOTETAKER_HTML_PATH,
            GREEN_NOTETAKER_HTML_PATH,
            INDUSTRY_NOTETAKER_HTML_PATH
        ].forEach((htmlPath) => {
            const html = readFileSync(htmlPath, 'utf8');

            expect(html).toContain('<fieldset class="form-group">');
            expect(html).toContain('<legend class="form-label">Type</legend>');
            expect(html).toContain('name="captureType"');
            expect(html).not.toContain('<label class="form-label">Type</label>');
        });
    });
});

describe('Notetaker training learning paths', () => {
    function createTrainingSessionStore(context) {
        return {
            getTrainingContext: vi.fn(() => context)
        };
    }

    function createTrainingDatabase() {
        return {
            recordTrainingProgressEvent: vi.fn().mockResolvedValue({ ok: true }),
            createAction: vi.fn(),
            updateAction: vi.fn(),
            submitAction: vi.fn(),
            createRequest: vi.fn(),
            createCommunication: vi.fn(),
            createTimelineEvent: vi.fn(),
            saveNotetakerData: vi.fn()
        };
    }

    it.each(['blue', 'red', 'green', 'industry'])(
        'mounts the isolated %s Notetaker coach with distinct seat fixtures',
        (team) => {
            const fixtureBundle = getTrainingProfileFixtureBundle(team, 'notetaker');
            const activation = {
                active: true,
                context: {
                    attemptId: `attempt-${team}-notetaker-mount`,
                    curriculumVersion: '1.0',
                    semanticRole: 'notetaker',
                    team,
                    trainingMode: true
                },
                fixtureBundle
            };
            const controller = new NotetakerController();
            controller.teamId = team;
            controller.renderTrainingFixtureWorkspace = vi.fn();
            vi.spyOn(trainingRuntime, 'getPracticeState').mockReturnValue(null);
            const coach = { root: {}, destroy: vi.fn() };
            const mountCoachRef = vi.fn(() => coach);
            const documentRef = {};

            const mounted = controller.mountVerifiedTrainingCoach(activation, {
                mountCoachRef,
                documentRef
            });

            expect(mounted).toBe(coach);
            expect(shouldMountNotetakerTrainingCoach(activation, team)).toBe(true);
            expect(fixtureBundle.notetakerRecord.id).not.toBe(fixtureBundle.secondNotetakerRecord.id);
            expect(fixtureBundle.notetakerRecord.participantKey)
                .not.toBe(fixtureBundle.secondNotetakerRecord.participantKey);
            expect(controller.renderTrainingFixtureWorkspace).toHaveBeenCalledWith(
                fixtureBundle,
                null,
                documentRef
            );
            expect(mountCoachRef).toHaveBeenCalledWith(expect.objectContaining({
                activation,
                documentRef,
                onNavigate: expect.any(Function),
                onStateChange: expect.any(Function)
            }));
        }
    );

    it.each(['blue', 'red', 'green', 'industry'])(
        'completes the %s observation, dynamics, alliance, inbox, action, and timeline loop without live writes',
        async (team) => {
            const context = {
                attemptId: `attempt-${team}-notetaker-complete`,
                curriculumVersion: '1.0',
                semanticRole: 'notetaker',
                team,
                trainingMode: true
            };
            const sessionStoreRef = createTrainingSessionStore(context);
            const databaseRef = createTrainingDatabase();
            const fixtureBundle = getTrainingProfileFixtureBundle(team, 'notetaker');
            const originalSecondSeat = JSON.stringify(fixtureBundle.secondNotetakerRecord);
            const originalAction = JSON.stringify(fixtureBundle.artifact);
            const originalTimeline = JSON.stringify(fixtureBundle.timelineEntries);
            const execute = (suffix, payload = {}) => trainingRuntime.executeCommand(
                getNotetakerTrainingCommand(team, suffix),
                payload,
                { databaseRef, sessionStoreRef }
            );

            await execute(NOTETAKER_COMMANDS.CONTEXT_ORIENTED);
            await execute(NOTETAKER_COMMANDS.OBSERVATION_ADDED, {
                observation: 'The team preferred a reversible checkpoint.',
                reasoning: 'It limited delivery exposure while evidence remained incomplete.'
            });
            await execute(NOTETAKER_COMMANDS.QUICK_CAPTURES_ADDED, {
                moment: 'The discussion turned when the logistics lead quantified the delay.',
                quote: 'Use a checkpoint we can reverse if the supplier recovers.'
            });
            await execute(NOTETAKER_COMMANDS.SEAT_NOTES_AUTOSAVED, {
                dynamicsNote: 'The team tested two alternatives before consensus formed.',
                allianceNote: 'The implementation coalition shifted toward a time-limited bridge.'
            });
            const saved = await execute(NOTETAKER_COMMANDS.SEAT_NOTES_SAVED, {
                dynamicsNote: 'The team tested two alternatives before consensus formed.',
                allianceNote: 'The implementation coalition shifted toward a time-limited bridge.'
            });
            expect(saved.timelineSnapshots).toHaveLength(2);
            expect(saved.timelineSnapshots.map((entry) => entry.metadata.note_scope))
                .toEqual(['dynamics', 'alliance']);
            expect(saved.officialTimelineEntries).toEqual(fixtureBundle.timelineEntries);

            const opened = await execute(NOTETAKER_COMMANDS.INBOX_OPENED, {
                inboxItemId: fixtureBundle.inject.id
            });
            expect(opened.inboxOpened).toBe(true);
            expect(opened.inboxItem).toEqual(fixtureBundle.inject);

            await execute(NOTETAKER_COMMANDS.INJECT_OBSERVATION_ADDED, {
                observation: 'Watch whether the team reopens its delivery assumption.',
                reasoning: 'The six-week disruption changes the evidence behind the earlier checkpoint.'
            });
            await execute(NOTETAKER_COMMANDS.READONLY_REVIEW_COMPLETED, {
                actionReviewed: true,
                timelineReviewed: true,
                artifactId: fixtureBundle.artifact.id,
                timelineEntryIds: fixtureBundle.timelineEntries.map((entry) => entry.id)
            });
            await execute(NOTETAKER_COMMANDS.RETRIEVAL_COMPLETED, {
                answer: 'notetaker-record'
            });
            const completed = await execute(NOTETAKER_COMMANDS.PRACTICE_COMPLETED);

            expect(completed.completed).toBe(true);
            expect(completed.activeSeatRecord.observation_timeline.slice(-4).map((entry) => entry.type))
                .toEqual(['NOTE', 'MOMENT', 'QUOTE', 'NOTE']);
            expect(buildNotetakerViewState(completed.activeSeatRecord, {
                teamId: team,
                participantKey: completed.activeSeatRecord.participantKey
            })).toMatchObject({
                dynamicsData: {
                    dynamicsSummary: 'The team tested two alternatives before consensus formed.'
                },
                allianceData: {
                    allianceNotes: 'The implementation coalition shifted toward a time-limited bridge.'
                }
            });
            expect(JSON.stringify(completed.secondSeatRecord)).toBe(originalSecondSeat);
            expect(JSON.stringify(completed.officialAction)).toBe(originalAction);
            expect(JSON.stringify(completed.officialTimelineEntries)).toBe(originalTimeline);
            expect(databaseRef.recordTrainingProgressEvent).toHaveBeenLastCalledWith(expect.objectContaining({
                attemptId: context.attemptId,
                eventType: 'mastery_passed',
                stepId: `training.v1.notetaker.${team}.reflect`,
                resultCode: 'passed'
            }));
            expect(databaseRef.createAction).not.toHaveBeenCalled();
            expect(databaseRef.updateAction).not.toHaveBeenCalled();
            expect(databaseRef.submitAction).not.toHaveBeenCalled();
            expect(databaseRef.createRequest).not.toHaveBeenCalled();
            expect(databaseRef.createCommunication).not.toHaveBeenCalled();
            expect(databaseRef.createTimelineEvent).not.toHaveBeenCalled();
            expect(databaseRef.saveNotetakerData).not.toHaveBeenCalled();
        }
    );

    it('keeps reset and practice state isolated by attempt and preserves the second seat fixture', async () => {
        const team = 'blue';
        const contextA = {
            attemptId: 'attempt-blue-notetaker-isolation-a',
            curriculumVersion: '1.0',
            semanticRole: 'notetaker',
            team,
            trainingMode: true
        };
        const contextB = { ...contextA, attemptId: 'attempt-blue-notetaker-isolation-b' };
        const storeA = createTrainingSessionStore(contextA);
        const storeB = createTrainingSessionStore(contextB);
        const databaseRef = createTrainingDatabase();
        const command = getNotetakerTrainingCommand(team, NOTETAKER_COMMANDS.CONTEXT_ORIENTED);
        const initialB = trainingRuntime.getPracticeState({ sessionStoreRef: storeB });

        await trainingRuntime.executeCommand(command, {}, { databaseRef, sessionStoreRef: storeA });
        const changedA = trainingRuntime.getPracticeState({ sessionStoreRef: storeA });
        expect(changedA.contextOriented).toBe(true);
        expect(changedA.activeSeatRecord.id).not.toBe(changedA.secondSeatRecord.id);

        const resetA = trainingRuntime.resetPracticeState({ sessionStoreRef: storeA });
        const unchangedB = trainingRuntime.getPracticeState({ sessionStoreRef: storeB });
        expect(resetA.contextOriented).toBe(false);
        expect(resetA.secondSeatRecord).toEqual(changedA.secondSeatRecord);
        expect(unchangedB).toEqual(initialB);
    });

    it('fails closed on cross-team and artifact-mutating Notetaker commands', async () => {
        const context = {
            attemptId: 'attempt-blue-notetaker-forbidden-command',
            curriculumVersion: '1.0',
            semanticRole: 'notetaker',
            team: 'blue',
            trainingMode: true
        };
        const sessionStoreRef = createTrainingSessionStore(context);
        const databaseRef = createTrainingDatabase();

        await expect(trainingRuntime.executeCommand(
            getNotetakerTrainingCommand('red', NOTETAKER_COMMANDS.CONTEXT_ORIENTED),
            {},
            { databaseRef, sessionStoreRef }
        )).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        await expect(trainingRuntime.executeCommand(
            'notetaker.blue.submit-action',
            { artifactId: getTrainingProfileFixtureBundle('blue', 'notetaker').artifact.id },
            { databaseRef, sessionStoreRef }
        )).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        expect(databaseRef.recordTrainingProgressEvent).not.toHaveBeenCalled();
        expect(databaseRef.submitAction).not.toHaveBeenCalled();
        expect(databaseRef.createRequest).not.toHaveBeenCalled();
        expect(databaseRef.createCommunication).not.toHaveBeenCalled();
        expect(databaseRef.createTimelineEvent).not.toHaveBeenCalled();
    });

    it('rejects blank, overlong, duplicate, offline, and autosave-failed practice notes without partial mutation', async () => {
        expect(getNotetakerPracticeInputError('')).toMatch(/Enter a practice note/);
        expect(getNotetakerPracticeInputError('x'.repeat(NOTETAKER_PRACTICE_TEXT_LIMIT + 1)))
            .toMatch(/characters or fewer/);
        expect(getNotetakerPracticeInputError('Repeated note', {
            existingValues: [' repeated NOTE ']
        })).toMatch(/duplicates/);
        expect(isNotetakerPracticeOffline({ onLine: false })).toBe(true);
        expect(isNotetakerPracticeOffline({ onLine: true })).toBe(false);

        const team = 'red';
        const context = {
            attemptId: 'attempt-red-notetaker-safe-notes',
            curriculumVersion: '1.0',
            semanticRole: 'notetaker',
            team,
            trainingMode: true
        };
        const sessionStoreRef = createTrainingSessionStore(context);
        const databaseRef = createTrainingDatabase();
        const execute = (suffix, payload = {}) => trainingRuntime.executeCommand(
            getNotetakerTrainingCommand(team, suffix),
            payload,
            { databaseRef, sessionStoreRef }
        );
        await execute(NOTETAKER_COMMANDS.CONTEXT_ORIENTED);
        databaseRef.recordTrainingProgressEvent.mockClear();

        await expect(execute(NOTETAKER_COMMANDS.OBSERVATION_ADDED, {
            observation: '',
            reasoning: 'A reason without an observation.'
        })).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        await expect(execute(NOTETAKER_COMMANDS.OBSERVATION_ADDED, {
            observation: 'x'.repeat(NOTETAKER_PRACTICE_TEXT_LIMIT + 1),
            reasoning: 'The entry is deliberately overlong.'
        })).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        expect(databaseRef.recordTrainingProgressEvent).not.toHaveBeenCalled();

        const observed = await execute(NOTETAKER_COMMANDS.OBSERVATION_ADDED, {
            observation: 'The team paused before choosing the bridge measure.',
            reasoning: 'Members wanted evidence that the step could be reversed.'
        });
        const duplicateContent = observed.activeSeatRecord.observation_timeline.at(-1).content;
        databaseRef.recordTrainingProgressEvent.mockClear();
        await expect(execute(NOTETAKER_COMMANDS.QUICK_CAPTURES_ADDED, {
            moment: duplicateContent,
            quote: 'We should preserve an exit option.'
        })).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        expect(databaseRef.recordTrainingProgressEvent).not.toHaveBeenCalled();

        await execute(NOTETAKER_COMMANDS.QUICK_CAPTURES_ADDED, {
            moment: 'The team paused to compare the bridge with waiting.',
            quote: 'We should preserve an exit option.'
        });
        const beforeFailedAutosave = trainingRuntime.getPracticeState({ sessionStoreRef });
        databaseRef.recordTrainingProgressEvent.mockRejectedValueOnce(new Error('offline'));
        await expect(execute(NOTETAKER_COMMANDS.SEAT_NOTES_AUTOSAVED, {
            dynamicsNote: 'Consensus formed only after the group compared alternatives.',
            allianceNote: 'Partners moved toward a reversible bridge arrangement.'
        })).rejects.toThrow('offline');
        expect(trainingRuntime.getPracticeState({ sessionStoreRef })).toEqual(beforeFailedAutosave);
    });

    it('leaves the live Notetaker workspace unchanged without a verified training activation', () => {
        const controller = new NotetakerController();
        controller.actions = [{ id: 'live-action-1' }];
        controller.captures = [{ id: 'live-capture-1' }];
        controller.renderTrainingFixtureWorkspace = vi.fn();
        const mountCoachRef = vi.fn();
        const liveControl = {
            disabled: false,
            setAttribute: vi.fn(),
            title: ''
        };
        const documentRef = {
            querySelectorAll: vi.fn(() => [liveControl])
        };

        controller.disableTrainingLiveWriteControls(documentRef);
        expect(liveControl.disabled).toBe(false);
        expect(controller.mountVerifiedTrainingCoach(null, { mountCoachRef, documentRef })).toBeNull();
        expect(controller.actions).toEqual([{ id: 'live-action-1' }]);
        expect(controller.captures).toEqual([{ id: 'live-capture-1' }]);
        expect(controller.renderTrainingFixtureWorkspace).not.toHaveBeenCalled();
        expect(mountCoachRef).not.toHaveBeenCalled();
    });

    it('disables the shipped live-write forms only after verified Notetaker training activation', () => {
        const controller = new NotetakerController();
        const control = {
            disabled: false,
            setAttribute: vi.fn(),
            title: ''
        };
        const documentRef = {
            querySelectorAll: vi.fn(() => [control])
        };

        controller.disableTrainingLiveWriteControls(documentRef);
        expect(control.disabled).toBe(false);

        controller.trainingActivation = { active: true };
        controller.disableTrainingLiveWriteControls(documentRef);
        expect(control.disabled).toBe(true);
        expect(control.setAttribute).toHaveBeenCalledWith('aria-describedby', 'trainingSandboxBanner');
        expect(control.title).toMatch(/guided coach/);
    });

    it('ships authored examples and hints without prefilling a learner practice entry', () => {
        const source = readFileSync(NOTETAKER_TRAINING_COACH_PATH, 'utf8');

        expect(source).toContain('Example shape: state what the team considered');
        expect(source).toContain('Write your own entry below.');
        expect(source).toContain('textarea.value = state.drafts[key] ||');
        expect(source).not.toMatch(/textarea\.value\s*=\s*['"]The team/);
        expect(source).toContain('Offline. Your text remains in this form');
        expect(source).toContain('Autosave failed. Your text remains in this form');
    });
});
