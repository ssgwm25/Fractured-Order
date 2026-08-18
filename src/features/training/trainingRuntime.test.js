import { afterEach, describe, expect, it, vi } from 'vitest';

import { database } from '../../services/database.js';
import { sessionStore } from '../../stores/session.js';
import { getTrainingRoleRoute } from './trainingContext.js';
import {
    BLUE_SCRIBE_PRACTICE_ARTIFACT,
    FACILITATOR_COMMANDS,
    SCRIBE_COMMANDS,
    TRAINING_RECOVERY_MESSAGE,
    buildTrainingTelemetryPayload,
    getFacilitatorTrainingCommand,
    getScribeTrainingCommand,
    hydrateTrainingFixtures,
    syncTrainingSandboxBannerLayout,
    trainingRuntime
} from './trainingRuntime.js';

function serverBootstrap(overrides = {}) {
    return {
        attempt_id: 'attempt-blue-scribe-1',
        template_session_id: '00000000-0000-4000-8000-000000002026',
        curriculum_version: '1.0',
        profile_id: 'blue.scribe',
        semantic_role: 'scribe',
        team: 'blue',
        status: 'in_progress',
        current_step_id: null,
        attempt_revision: 0,
        completed_step_ids: [],
        mastered_step_ids: [],
        resumed: false,
        session_classification: 'training_template',
        is_protected: true,
        experience_plugin_id: 'ssg-training',
        ...overrides
    };
}

function createSessionStoreDouble() {
    let context = null;
    return {
        clear: vi.fn(() => { context = null; }),
        setTrainingContext: vi.fn((value) => { context = value; }),
        clearTrainingContext: vi.fn(() => { context = null; }),
        setRole: vi.fn(),
        setUserName: vi.fn(),
        hasTrainingContext: vi.fn(() => Boolean(context)),
        getTrainingContext: vi.fn(() => context)
    };
}

describe('isolated training runtime', () => {
    afterEach(() => {
        sessionStore.clear();
    });

    it('bounds lifecycle telemetry and drops learner content fields', () => {
        expect(buildTrainingTelemetryPayload('step_mastery', {
            semanticRole: 'scribe',
            team: 'blue'
        }, {
            stepId: 'training.v1.scribe.blue.retrieve',
            resultCode: 'passed',
            revision: 4,
            answer: 'free text learner answer',
            narration: 'full narration body',
            artifactBody: { secret: true }
        })).toEqual({
            event: 'step_mastery',
            semantic_role: 'scribe',
            team: 'blue',
            step_id: 'training.v1.scribe.blue.retrieve',
            result_code: 'passed',
            reason_code: null,
            request_id: null,
            revision: 4
        });
        expect(buildTrainingTelemetryPayload('unbounded-custom-event', {}, {})).toBeNull();
    });

    it('starts from protected bootstrap metadata without seat, sync, or live persistence calls', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        const databaseRef = {
            startOrResumeTrainingAttempt: vi.fn().mockResolvedValue(serverBootstrap()),
            claimParticipantSeat: vi.fn(),
            getGameState: vi.fn(),
            createAction: vi.fn()
        };

        const result = await trainingRuntime.startOrResume({
            code: 'TRAINING2026',
            team: 'blue',
            publicRoleSurface: 'facilitator',
            displayName: 'Morgan',
            databaseRef,
            sessionStoreRef
        });

        expect(result).toMatchObject({
            role: 'blue_facilitator',
            route: getTrainingRoleRoute('blue', 'scribe'),
            context: { team: 'blue', semanticRole: 'scribe', trainingMode: true }
        });
        expect(databaseRef.claimParticipantSeat).not.toHaveBeenCalled();
        expect(databaseRef.getGameState).not.toHaveBeenCalled();
        expect(databaseRef.createAction).not.toHaveBeenCalled();
    });

    it('rejects a forged training flag when protected plugin metadata is absent', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        const databaseRef = {
            startOrResumeTrainingAttempt: vi.fn().mockResolvedValue({
                ...serverBootstrap(),
                training_mode: true,
                experience_plugin_id: undefined
            })
        };

        await expect(trainingRuntime.startOrResume({
            code: 'TRAINING2026',
            team: 'blue',
            publicRoleSurface: 'facilitator',
            databaseRef,
            sessionStoreRef
        })).rejects.toMatchObject({ code: 'TRAINING_WRITE_BLOCKED' });
        expect(sessionStoreRef.setTrainingContext).not.toHaveBeenCalled();
    });

    it('rejects a protected bootstrap for a curriculum version not bundled by the client', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        const databaseRef = {
            startOrResumeTrainingAttempt: vi.fn().mockResolvedValue(serverBootstrap({
                curriculum_version: '2.0'
            }))
        };

        await expect(trainingRuntime.startOrResume({
            code: 'TRAINING2026',
            team: 'blue',
            publicRoleSurface: 'facilitator',
            databaseRef,
            sessionStoreRef
        })).rejects.toMatchObject({ code: 'TRAINING_WRITE_BLOCKED' });
        expect(databaseRef.startOrResumeTrainingAttempt).toHaveBeenCalledWith(expect.objectContaining({
            curriculumVersion: '1.0'
        }));
        expect(sessionStoreRef.setTrainingContext).not.toHaveBeenCalled();
    });

    it('revalidates cached context by owner-scoped attempt ID and rejects mismatches', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        sessionStoreRef.setTrainingContext({
            attemptId: 'attempt-blue-scribe-1',
            curriculumVersion: '1.0',
            semanticRole: 'scribe',
            team: 'blue',
            trainingMode: true
        });
        const databaseRef = {
            getTrainingAttemptBootstrap: vi.fn().mockResolvedValue(serverBootstrap({
                profile_id: 'red.scribe',
                team: 'red'
            }))
        };

        await expect(trainingRuntime.revalidate({ databaseRef, sessionStoreRef }))
            .rejects.toMatchObject({ code: 'TRAINING_WRITE_BLOCKED' });
        expect(sessionStoreRef.clearTrainingContext).toHaveBeenCalled();
    });

    it('explains an incompatible curriculum version instead of silently discarding progress', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        sessionStoreRef.setTrainingContext({
            attemptId: 'attempt-blue-scribe-legacy',
            curriculumVersion: '0.9',
            semanticRole: 'scribe',
            team: 'blue',
            trainingMode: true
        });
        const databaseRef = {
            getTrainingAttemptBootstrap: vi.fn().mockResolvedValue(serverBootstrap({
                attempt_id: 'attempt-blue-scribe-legacy',
                curriculum_version: '0.9'
            }))
        };

        await expect(trainingRuntime.revalidate({ databaseRef, sessionStoreRef }))
            .rejects.toMatchObject({
                code: 'TRAINING_CURRICULUM_RESTART_REQUIRED',
                message: expect.stringContaining('restart')
            });
        expect(sessionStoreRef.clearTrainingContext).toHaveBeenCalled();
    });

    it('records retrieval mastery only after the expected bounded choice', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        sessionStoreRef.setTrainingContext({
            attemptId: 'attempt-blue-scribe-mastery',
            curriculumVersion: '1.0',
            semanticRole: 'scribe',
            team: 'blue',
            trainingMode: true
        });
        const databaseRef = { recordTrainingProgressEvent: vi.fn().mockResolvedValue({ ok: true }) };
        const module = (await import('./content/curriculum.js')).getTrainingModule('scribe', 'blue');
        const step = module.steps.find((entry) => entry.stage === 'retrieve');

        const failed = await trainingRuntime.recordMastery({
            step,
            evidence: { optionId: 'submit-to-white-cell' },
            passed: true
        }, { databaseRef, sessionStoreRef });
        expect(failed.passed).toBe(false);
        expect(trainingRuntime.getAttemptSnapshot(sessionStoreRef.getTrainingContext().attemptId).masteredStepIds)
            .not.toContain(step.id);

        const passed = await trainingRuntime.recordMastery({
            step,
            evidence: { optionId: 'forward-to-facilitator' },
            passed: true
        }, { databaseRef, sessionStoreRef });
        expect(passed.passed).toBe(true);
        expect(trainingRuntime.getAttemptSnapshot(sessionStoreRef.getTrainingContext().attemptId).masteredStepIds)
            .toContain(step.id);
        expect(databaseRef.recordTrainingProgressEvent.mock.calls.map(([call]) => call.eventType))
            .toEqual(['mastery_failed', 'mastery_passed']);
        expect(databaseRef.recordTrainingProgressEvent.mock.calls.flatMap(([call]) => Object.values(call)).join(' '))
            .not.toContain('submit-to-white-cell');
    });

    it('refreshes after a revision conflict and never overwrites the newer server revision', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        sessionStoreRef.setTrainingContext({
            attemptId: 'attempt-blue-scribe-conflict',
            curriculumVersion: '1.0',
            semanticRole: 'scribe',
            team: 'blue',
            trainingMode: true
        });
        const conflict = Object.assign(new Error('newer revision'), { code: 'TRAINING_REVISION_CONFLICT' });
        const databaseRef = {
            recordTrainingProgressEvent: vi.fn().mockRejectedValue(conflict),
            getTrainingAttemptBootstrap: vi.fn().mockResolvedValue(serverBootstrap({
                attempt_id: 'attempt-blue-scribe-conflict',
                attempt_revision: 3,
                current_step_id: 'training.v1.scribe.blue.show',
                mastered_step_ids: ['training.v1.scribe.blue.orient'],
                completed_step_ids: ['training.v1.scribe.blue.orient']
            }))
        };

        await expect(trainingRuntime.recordProgress({
            eventType: 'mastery_passed',
            stepId: 'training.v1.scribe.blue.show',
            resultCode: 'passed',
            eventKey: 'mastery_passed.training.v1.scribe.blue.show.passed'
        }, { databaseRef, sessionStoreRef })).rejects.toMatchObject({ code: 'TRAINING_REVISION_CONFLICT' });
        expect(trainingRuntime.getAttemptSnapshot('attempt-blue-scribe-conflict')).toMatchObject({ revision: 3 });
        expect(databaseRef.recordTrainingProgressEvent).toHaveBeenCalledTimes(1);
    });

    it('rejects a stale successful write response without downgrading optimistic progress', async () => {
        const attemptId = 'attempt-blue-scribe-stale-success';
        const stepId = 'training.v1.scribe.blue.orient';
        const sessionStoreRef = createSessionStoreDouble();
        sessionStoreRef.setTrainingContext({
            attemptId,
            curriculumVersion: '1.0',
            semanticRole: 'scribe',
            team: 'blue',
            trainingMode: true
        });
        const databaseRef = {
            getTrainingAttemptBootstrap: vi.fn().mockResolvedValue(serverBootstrap({ attempt_id: attemptId })),
            recordTrainingProgressEvent: vi.fn().mockResolvedValue(serverBootstrap({
                attempt_id: attemptId,
                attempt_revision: 0,
                current_step_id: stepId,
                completed_step_ids: [stepId],
                mastered_step_ids: [stepId]
            }))
        };

        await expect(trainingRuntime.recordProgress({
            eventType: 'mastery_passed',
            stepId,
            resultCode: 'passed',
            eventKey: `mastery_passed.${stepId}.passed`
        }, { databaseRef, sessionStoreRef })).rejects.toThrow('TRAINING_STALE_SERVER_REVISION');
        expect(trainingRuntime.getAttemptSnapshot(attemptId)).toMatchObject({
            revision: 1,
            masteredStepIds: [stepId]
        });
    });

    it('rejects handcrafted operator, SME, Observer, and White Cell routes', async () => {
        for (const pathname of ['/master.html', '/sme.html', '/whitecell.html', '/teams/blue/facilitator.html?mode=observer']) {
            const sessionStoreRef = createSessionStoreDouble();
            sessionStoreRef.setTrainingContext({
                attemptId: 'attempt-blue-scribe-1',
                curriculumVersion: '1.0',
                semanticRole: 'scribe',
                team: 'blue',
                trainingMode: true
            });
            const navigateRef = vi.fn();
            const showToastRef = vi.fn();
            const databaseRef = {
                getTrainingAttemptBootstrap: vi.fn().mockResolvedValue(serverBootstrap())
            };
            const url = new URL(pathname, 'https://app.local');

            const state = await trainingRuntime.guardCurrentRoute({
                locationRef: url,
                databaseRef,
                sessionStoreRef,
                navigateRef,
                showToastRef
            });

            expect(state).toEqual({ active: false, allowed: false });
            expect(sessionStoreRef.clearTrainingContext).toHaveBeenCalled();
            expect(navigateRef).toHaveBeenCalledWith('', { replace: true });
            expect(showToastRef).toHaveBeenCalledWith({
                message: TRAINING_RECOVERY_MESSAGE,
                type: 'error'
            });
        }
    });

    it('hydrates one deterministic Blue Scribe practice artifact in memory', () => {
        const first = hydrateTrainingFixtures({ team: 'blue', semanticRole: 'scribe' });
        const second = hydrateTrainingFixtures({ team: 'blue', semanticRole: 'scribe' });

        expect(first.actions).toEqual([BLUE_SCRIBE_PRACTICE_ARTIFACT]);
        expect(second.actions).toEqual(first.actions);
        expect(second.actions).not.toBe(first.actions);
        expect(hydrateTrainingFixtures({ team: 'red', semanticRole: 'scribe' }).actions).toEqual([]);
    });

    it('reserves the full measured banner height when its content wraps', () => {
        const setProperty = vi.fn();
        const documentRef = { body: { style: { setProperty } } };
        const banner = {
            getBoundingClientRect: vi.fn(() => ({ height: 97.2 }))
        };

        expect(syncTrainingSandboxBannerLayout({ banner, documentRef })).toBe(98);
        expect(setProperty).toHaveBeenCalledWith('--training-sandbox-banner-height', '98px');
    });

    it('fails closed on unrecognized training writes with recovery copy', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        sessionStoreRef.setTrainingContext({
            attemptId: 'attempt-blue-scribe-1',
            curriculumVersion: '1.0',
            semanticRole: 'scribe',
            team: 'blue',
            trainingMode: true
        });
        const databaseRef = {
            recordTrainingProgressEvent: vi.fn(),
            createAction: vi.fn()
        };

        await expect(trainingRuntime.executeWrite('create-action', {}, {
            databaseRef,
            sessionStoreRef
        })).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        expect(databaseRef.recordTrainingProgressEvent).not.toHaveBeenCalled();
        expect(databaseRef.createAction).not.toHaveBeenCalled();
    });

    it.each(['blue', 'red', 'green', 'industry'])(
        'routes the %s Scribe draft, handoff, and returned revision through the bounded command registry',
        async (team) => {
            const sessionStoreRef = createSessionStoreDouble();
            sessionStoreRef.setTrainingContext({
                attemptId: `attempt-${team}-scribe-command`,
                curriculumVersion: '1.0',
                semanticRole: 'scribe',
                team,
                trainingMode: true
            });
            const databaseRef = {
                recordTrainingProgressEvent: vi.fn().mockResolvedValue({ ok: true }),
                createCommunication: vi.fn(),
                createRequest: vi.fn(),
                submitAction: vi.fn(),
                appendProposalThreadMessage: vi.fn()
            };
            const execute = (suffix, artifact) => trainingRuntime.executeCommand(
                getScribeTrainingCommand(team, suffix),
                { artifact },
                { databaseRef, sessionStoreRef }
            );

            await execute(SCRIBE_COMMANDS.ORIENTATION_COMPLETED, { id: `${team}-orientation` });
            const draft = await execute(SCRIBE_COMMANDS.ARTIFACT_DRAFT_SAVED, { id: `${team}-artifact`, revision: 1 });
            expect(draft).toMatchObject({ team, artifactState: 'draft', revision: 0 });

            const returned = await execute(SCRIBE_COMMANDS.ARTIFACT_FORWARDED, { id: `${team}-artifact`, revision: 1 });
            expect(returned).toMatchObject({
                team,
                artifactState: 'returned',
                revision: 1,
                facilitatorReceipt: expect.objectContaining({ team }),
                returnedArtifact: expect.objectContaining({
                    workflow_state: 'returned_to_team'
                })
            });
            expect(returned.returnedArtifact).not.toHaveProperty('review_record_id');

            const completed = await execute(SCRIBE_COMMANDS.RETURNED_ARTIFACT_REVISED, {
                id: `${team}-artifact`,
                revision: 2
            });
            expect(completed).toMatchObject({ artifactState: 'completed', revision: 2 });
            expect(databaseRef.recordTrainingProgressEvent).toHaveBeenCalledTimes(4);
            expect(databaseRef.recordTrainingProgressEvent).toHaveBeenLastCalledWith(expect.objectContaining({
                attemptId: `attempt-${team}-scribe-command`,
                eventType: 'mastery_passed',
                stepId: `training.v1.scribe.${team}.respond`,
                resultCode: 'passed',
                expectedRevision: 3
            }));
            expect(databaseRef.createCommunication).not.toHaveBeenCalled();
            expect(databaseRef.createRequest).not.toHaveBeenCalled();
            expect(databaseRef.submitAction).not.toHaveBeenCalled();
            expect(databaseRef.appendProposalThreadMessage).not.toHaveBeenCalled();
        }
    );

    it('fails closed on unknown, cross-team, and out-of-order Scribe training commands', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        sessionStoreRef.setTrainingContext({
            attemptId: 'attempt-blue-scribe-closed-command',
            curriculumVersion: '1.0',
            semanticRole: 'scribe',
            team: 'blue',
            trainingMode: true
        });
        const databaseRef = { recordTrainingProgressEvent: vi.fn().mockResolvedValue({ ok: true }) };

        await expect(trainingRuntime.executeCommand(
            'scribe.red.artifact-forwarded',
            { artifact: { id: 'cross-team' } },
            { databaseRef, sessionStoreRef }
        )).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        await expect(trainingRuntime.executeCommand(
            'scribe.blue.submit-to-white-cell',
            { artifact: { id: 'forbidden' } },
            { databaseRef, sessionStoreRef }
        )).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        await expect(trainingRuntime.executeCommand(
            'scribe.blue.artifact-forwarded',
            { artifact: { id: 'out-of-order' } },
            { databaseRef, sessionStoreRef }
        )).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        expect(databaseRef.recordTrainingProgressEvent).not.toHaveBeenCalled();
    });

    it.each(['blue', 'red', 'green', 'industry'])(
        'runs the %s Facilitator path entirely through the bounded command registry',
        async (team) => {
            const sessionStoreRef = createSessionStoreDouble();
            sessionStoreRef.setTrainingContext({
                attemptId: `attempt-${team}-facilitator-command`,
                curriculumVersion: '1.0',
                semanticRole: 'facilitator',
                team,
                trainingMode: true
            });
            const databaseRef = {
                recordTrainingProgressEvent: vi.fn().mockResolvedValue({ ok: true }),
                createCommunication: vi.fn(),
                createRequest: vi.fn(),
                submitAction: vi.fn(),
                appendProposalThreadMessage: vi.fn()
            };
            const fixtureBundle = (await import('./content/fixtures.js'))
                .getTrainingProfileFixtureBundle(team, 'facilitator');
            const execute = (suffix, payload) => trainingRuntime.executeCommand(
                getFacilitatorTrainingCommand(team, suffix),
                payload,
                { databaseRef, sessionStoreRef }
            );

            const reviewed = await execute(FACILITATOR_COMMANDS.ARTIFACT_REVIEWED, {
                artifactId: fixtureBundle.artifact.id
            });
            expect(reviewed).toMatchObject({
                artifactReviewed: true,
                artifactState: 'forwarded_to_facilitator',
                artifact: {
                    id: fixtureBundle.artifact.id,
                    workflow_state: 'submitted_to_facilitator'
                }
            });
            await execute(FACILITATOR_COMMANDS.WORKSPACES_RESTORED, {
                workspaces: ['actions', 'deck', 'rfis', 'communications', 'notifications'],
                restoredWorkspace: 'actions'
            });
            await execute(FACILITATOR_COMMANDS.ARTIFACT_PROJECTED, {
                artifactId: fixtureBundle.artifact.id
            });
            const returned = await execute(FACILITATOR_COMMANDS.RFI_CREATED, {
                query: 'Which checkpoint applies in the current move?',
                categories: ['Implementation Timeline']
            });
            expect(returned.rfi).toMatchObject({
                id: fixtureBundle.rfi.id,
                revision_number: 1,
                workflow_state: 'returned_to_team'
            });

            const answered = await execute(FACILITATOR_COMMANDS.RFI_RESUBMITTED, {
                rfiId: fixtureBundle.rfi.id,
                query: 'Which measurable checkpoint applies before the current move closes?'
            });
            expect(answered.rfi).toMatchObject({
                id: fixtureBundle.rfi.id,
                revision_number: 2,
                workflow_state: 'completed'
            });
            expect(answered.rfiRevisions.map((revision) => revision.workflow_state)).toEqual([
                'submitted_to_white_cell',
                'returned_to_team',
                'resubmitted',
                'completed'
            ]);

            await execute(FACILITATOR_COMMANDS.COMMUNICATION_SENT, {
                message: 'Please confirm the current move checkpoint.'
            });
            await execute(FACILITATOR_COMMANDS.RESPONSE_CLASSIFIED, {
                rfiAnswer: 'rfi-answer',
                communication: 'direct-communication',
                notification: 'team-action-notification'
            });

            if (fixtureBundle.proposalThreads.length) {
                const root = fixtureBundle.proposalThreads[0];
                const negotiated = await execute(FACILITATOR_COMMANDS.PROPOSAL_NEGOTIATED, {
                    proposalMessageId: root.id,
                    decision: 'negotiate',
                    terms: 'Add one checkpoint.'
                });
                expect(negotiated.proposalThread).toHaveLength(2);
                expect(negotiated.proposalThread[0]).toEqual(root);
                expect(negotiated.proposalThread[1].metadata).toMatchObject({
                    recipient_team: team,
                    round_number: 1,
                    parent_message_id: root.id
                });
            }

            const submitted = await execute(FACILITATOR_COMMANDS.ARTIFACT_SUBMITTED, {
                artifactId: fixtureBundle.artifact.id,
                answer: 'facilitator'
            });
            expect(submitted).toMatchObject({
                artifactState: 'submitted_to_white_cell',
                submissionReceipt: {
                    artifact_id: fixtureBundle.artifact.id,
                    workflow_state: 'submitted_to_white_cell'
                }
            });
            const verified = await execute(FACILITATOR_COMMANDS.RECEIPT_VERIFIED, {
                artifactId: fixtureBundle.artifact.id
            });
            expect(verified.receiptVerified).toBe(true);
            expect(verified.timelineEntries.at(-1)).toMatchObject({
                type: 'ACTION_SUBMITTED',
                metadata: { artifact_id: fixtureBundle.artifact.id, source: 'training_fixture' }
            });
            expect(databaseRef.recordTrainingProgressEvent).toHaveBeenLastCalledWith(expect.objectContaining({
                attemptId: `attempt-${team}-facilitator-command`,
                eventType: 'mastery_passed',
                stepId: `training.v1.facilitator.${team}.reflect`,
                resultCode: 'passed'
            }));
            expect(databaseRef.recordTrainingProgressEvent.mock.calls.filter(([call]) => (
                call.eventType === 'mastery_passed'
                && call.stepId === `training.v1.facilitator.${team}.respond`
            ))).toHaveLength(1);
            expect(databaseRef.createCommunication).not.toHaveBeenCalled();
            expect(databaseRef.createRequest).not.toHaveBeenCalled();
            expect(databaseRef.submitAction).not.toHaveBeenCalled();
            expect(databaseRef.appendProposalThreadMessage).not.toHaveBeenCalled();
        }
    );

    it('fails closed on cross-team Facilitator commands and recipient-thread leakage', async () => {
        const sessionStoreRef = createSessionStoreDouble();
        sessionStoreRef.setTrainingContext({
            attemptId: 'attempt-blue-facilitator-isolation',
            curriculumVersion: '1.0',
            semanticRole: 'facilitator',
            team: 'blue',
            trainingMode: true
        });
        const databaseRef = { recordTrainingProgressEvent: vi.fn().mockResolvedValue({ ok: true }) };
        const fixtureBundle = (await import('./content/fixtures.js'))
            .getTrainingProfileFixtureBundle('blue', 'facilitator');
        const executeBlue = (suffix, payload) => trainingRuntime.executeCommand(
            getFacilitatorTrainingCommand('blue', suffix),
            payload,
            { databaseRef, sessionStoreRef }
        );

        await expect(trainingRuntime.executeCommand(
            getFacilitatorTrainingCommand('red', FACILITATOR_COMMANDS.ARTIFACT_REVIEWED),
            { artifactId: 'training-fixture:artifact:red-move-response' },
            { databaseRef, sessionStoreRef }
        )).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        await executeBlue(FACILITATOR_COMMANDS.ARTIFACT_REVIEWED, { artifactId: fixtureBundle.artifact.id });
        await executeBlue(FACILITATOR_COMMANDS.WORKSPACES_RESTORED, {
            workspaces: ['actions', 'deck', 'rfis', 'communications', 'notifications'],
            restoredWorkspace: 'actions'
        });
        await executeBlue(FACILITATOR_COMMANDS.ARTIFACT_PROJECTED, { artifactId: fixtureBundle.artifact.id });
        await executeBlue(FACILITATOR_COMMANDS.RFI_CREATED, {
            query: 'Which checkpoint applies?',
            categories: ['Implementation Timeline']
        });
        await executeBlue(FACILITATOR_COMMANDS.RFI_RESUBMITTED, {
            rfiId: fixtureBundle.rfi.id,
            query: 'Which measurable checkpoint applies before the move closes?'
        });
        await executeBlue(FACILITATOR_COMMANDS.COMMUNICATION_SENT, { message: 'Confirm the checkpoint.' });
        await executeBlue(FACILITATOR_COMMANDS.RESPONSE_CLASSIFIED, {
            rfiAnswer: 'rfi-answer',
            communication: 'direct-communication',
            notification: 'team-action-notification'
        });
        databaseRef.recordTrainingProgressEvent.mockClear();
        await expect(trainingRuntime.executeCommand(
            getFacilitatorTrainingCommand('blue', FACILITATOR_COMMANDS.PROPOSAL_NEGOTIATED),
            {
                proposalMessageId: 'training-fixture:proposal-message:industry:red:0',
                decision: 'negotiate',
                terms: 'This must not enter the Blue thread.'
            },
            { databaseRef, sessionStoreRef }
        )).rejects.toThrow(TRAINING_RECOVERY_MESSAGE);
        expect(databaseRef.recordTrainingProgressEvent).not.toHaveBeenCalled();
        expect(trainingRuntime.getPracticeState({ sessionStoreRef }).proposalThread).toEqual([
            fixtureBundle.proposalThreads[0]
        ]);
    });

    it('blocks every live database method while a training attempt hint is present', () => {
        const createActionBoundary = database.createAction;
        sessionStore.setTrainingContext({
            attemptId: 'attempt-blue-scribe-1',
            curriculumVersion: '1.0',
            semanticRole: 'scribe',
            team: 'blue',
            trainingMode: true
        }, { serverValidated: true });

        expect(database.createAction).toBe(createActionBoundary);
        expect(() => database.createAction({})).toThrow(TRAINING_RECOVERY_MESSAGE);
        expect(() => database.fetchActions('forged-live-session')).toThrow(TRAINING_RECOVERY_MESSAGE);
    });

    it('announces training exit before clearing context and navigating', () => {
        const order = [];
        class FakeCustomEvent {
            constructor(type) {
                this.type = type;
            }
        }
        const documentRef = {
            defaultView: { CustomEvent: FakeCustomEvent },
            dispatchEvent: vi.fn((event) => order.push(`event:${event.type}`))
        };
        const sessionStoreRef = {
            clear: vi.fn(() => order.push('clear'))
        };
        const navigateRef = vi.fn(() => order.push('navigate'));

        trainingRuntime.exitTraining({ documentRef, sessionStoreRef, navigateRef });

        expect(order).toEqual(['event:training:exit', 'clear', 'navigate']);
        expect(navigateRef).toHaveBeenCalledWith('');
    });
});
