import { navigateToApp } from '../../core/navigation.js';
import { database } from '../../services/database.js';
import { sessionStore } from '../../stores/session.js';
import { showToast } from '../../components/ui/Toast.js';
import { confirm as confirmModal } from '../../components/ui/Modal.js';
import { DatabaseError } from '../../core/errors.js';
import { createLogger } from '../../utils/logger.js';
import { getBlueActionViewModel } from '../actions/blueActionDetails.js';
import { TRAINING_CURRICULUM, getTrainingModule } from './content/curriculum.js';
import { getTrainingProfileFixtureBundle } from './content/fixtures.js';
import { showTrainingIntroModal } from './TrainingIntroModal.js';
import {
    createTrainingProgressEventKey,
    normalizeTrainingAttemptSnapshot,
    reconcileTrainingProgress
} from './TrainingProgress.js';
import {
    annotateObservationTimelineEntries,
    mergeParticipantScopedNotetakerSection,
    readParticipantScopedNotetakerSection
} from '../notetaker/storage.js';
import {
    NOTETAKER_TIMELINE_EVENT_SOURCE,
    buildNotetakerTimelineDetailItems,
    getNotetakerTimelineScopeLabel
} from '../notetaker/timelineDetails.js';
import {
    createTrainingContextFromBootstrap,
    getSemanticRoleForPublicSurface,
    getTrainingRole,
    getTrainingRoleRoute,
    isAllowedTrainingRolePage,
    normalizeStoredTrainingContext,
    trainingContextsMatch
} from './trainingContext.js';

export const TRAINING_RECOVERY_MESSAGE =
    'That action is not available in the training sandbox. Your live sessions were not changed. Exit training and re-enter the code to recover.';

const blueScribeFixture = getTrainingProfileFixtureBundle('blue', 'scribe').artifact;
const blueScribeViewModel = getBlueActionViewModel(blueScribeFixture);

const SCRIBE_COMMANDS = Object.freeze({
    ORIENTATION_COMPLETED: 'orientation-completed',
    ARTIFACT_DRAFT_SAVED: 'artifact-draft-saved',
    ARTIFACT_FORWARDED: 'artifact-forwarded',
    RETURNED_ARTIFACT_REVISED: 'returned-artifact-revised'
});
const SCRIBE_COMMAND_DEFINITIONS = Object.freeze({
    [SCRIBE_COMMANDS.ORIENTATION_COMPLETED]: Object.freeze({
        stage: 'show',
        eventType: 'step_completed',
        resultCode: 'completed'
    }),
    [SCRIBE_COMMANDS.ARTIFACT_DRAFT_SAVED]: Object.freeze({
        stage: 'practice',
        eventType: 'step_started',
        resultCode: null
    }),
    [SCRIBE_COMMANDS.ARTIFACT_FORWARDED]: Object.freeze({
        stage: 'practice',
        eventType: 'step_completed',
        resultCode: 'completed'
    }),
    [SCRIBE_COMMANDS.RETURNED_ARTIFACT_REVISED]: Object.freeze({
        stage: 'respond',
        eventType: 'step_completed',
        resultCode: 'completed'
    })
});
const FACILITATOR_COMMANDS = Object.freeze({
    ARTIFACT_REVIEWED: 'artifact-reviewed',
    WORKSPACES_RESTORED: 'workspaces-restored',
    ARTIFACT_PROJECTED: 'artifact-projected',
    RFI_CREATED: 'rfi-created',
    RFI_RESUBMITTED: 'rfi-resubmitted',
    COMMUNICATION_SENT: 'communication-sent',
    RESPONSE_CLASSIFIED: 'response-classified',
    PROPOSAL_NEGOTIATED: 'proposal-negotiated',
    ARTIFACT_SUBMITTED: 'artifact-submitted',
    RECEIPT_VERIFIED: 'receipt-verified'
});
const FACILITATOR_COMMAND_DEFINITIONS = Object.freeze({
    [FACILITATOR_COMMANDS.ARTIFACT_REVIEWED]: Object.freeze({ stage: 'orient', eventType: 'step_completed', resultCode: 'completed' }),
    [FACILITATOR_COMMANDS.WORKSPACES_RESTORED]: Object.freeze({ stage: 'show', eventType: 'step_completed', resultCode: 'completed' }),
    [FACILITATOR_COMMANDS.ARTIFACT_PROJECTED]: Object.freeze({ stage: 'guide', eventType: 'step_completed', resultCode: 'completed' }),
    [FACILITATOR_COMMANDS.RFI_CREATED]: Object.freeze({ stage: 'practice', eventType: 'step_started', resultCode: null }),
    [FACILITATOR_COMMANDS.RFI_RESUBMITTED]: Object.freeze({ stage: 'practice', eventType: 'step_completed', resultCode: 'completed' }),
    [FACILITATOR_COMMANDS.COMMUNICATION_SENT]: Object.freeze({ stage: 'respond', eventType: 'step_started', resultCode: null }),
    [FACILITATOR_COMMANDS.RESPONSE_CLASSIFIED]: Object.freeze({ stage: 'respond', eventType: 'step_completed', resultCode: 'completed' }),
    [FACILITATOR_COMMANDS.PROPOSAL_NEGOTIATED]: Object.freeze({ stage: 'respond', eventType: 'step_started', resultCode: null }),
    [FACILITATOR_COMMANDS.ARTIFACT_SUBMITTED]: Object.freeze({ stage: 'retrieve', eventType: 'step_completed', resultCode: 'completed' }),
    [FACILITATOR_COMMANDS.RECEIPT_VERIFIED]: Object.freeze({ stage: 'reflect', eventType: 'step_completed', resultCode: 'completed' })
});
const NOTETAKER_COMMANDS = Object.freeze({
    CONTEXT_ORIENTED: 'context-oriented',
    OBSERVATION_ADDED: 'observation-added',
    QUICK_CAPTURES_ADDED: 'quick-captures-added',
    SEAT_NOTES_AUTOSAVED: 'seat-notes-autosaved',
    SEAT_NOTES_SAVED: 'seat-notes-saved',
    INBOX_OPENED: 'inbox-opened',
    INJECT_OBSERVATION_ADDED: 'inject-observation-added',
    READONLY_REVIEW_COMPLETED: 'readonly-review-completed',
    RETRIEVAL_COMPLETED: 'retrieval-completed',
    PRACTICE_COMPLETED: 'practice-completed'
});
const NOTETAKER_COMMAND_DEFINITIONS = Object.freeze({
    [NOTETAKER_COMMANDS.CONTEXT_ORIENTED]: Object.freeze({ stage: 'orient', eventType: 'step_completed', resultCode: 'completed' }),
    [NOTETAKER_COMMANDS.OBSERVATION_ADDED]: Object.freeze({ stage: 'show', eventType: 'step_completed', resultCode: 'completed' }),
    [NOTETAKER_COMMANDS.QUICK_CAPTURES_ADDED]: Object.freeze({ stage: 'guide', eventType: 'step_completed', resultCode: 'completed' }),
    [NOTETAKER_COMMANDS.SEAT_NOTES_AUTOSAVED]: Object.freeze({ stage: 'practice', eventType: 'step_started', resultCode: null }),
    [NOTETAKER_COMMANDS.SEAT_NOTES_SAVED]: Object.freeze({ stage: 'practice', eventType: 'step_completed', resultCode: 'completed' }),
    [NOTETAKER_COMMANDS.INBOX_OPENED]: Object.freeze({ stage: 'respond', eventType: 'step_started', resultCode: null }),
    [NOTETAKER_COMMANDS.INJECT_OBSERVATION_ADDED]: Object.freeze({ stage: 'respond', eventType: 'step_completed', resultCode: 'completed' }),
    [NOTETAKER_COMMANDS.READONLY_REVIEW_COMPLETED]: Object.freeze({ stage: 'retrieve', eventType: 'step_started', resultCode: null }),
    [NOTETAKER_COMMANDS.RETRIEVAL_COMPLETED]: Object.freeze({ stage: 'retrieve', eventType: 'step_completed', resultCode: 'completed' }),
    [NOTETAKER_COMMANDS.PRACTICE_COMPLETED]: Object.freeze({ stage: 'reflect', eventType: 'step_completed', resultCode: 'completed' })
});
const FACILITATOR_WORKSPACES = Object.freeze(['actions', 'deck', 'rfis', 'communications', 'notifications']);
const TRAINING_PRACTICE_PAYLOAD_LIMIT = 32 * 1024;
export const NOTETAKER_PRACTICE_TEXT_LIMIT = 2000;
const practiceStates = new Map();
const attemptSnapshots = new Map();
const attemptWriteQueues = new Map();
const trainingLogger = createLogger('TrainingLifecycle');
const TRAINING_TELEMETRY_EVENTS = new Set([
    'start',
    'media_degradation',
    'step_mastery',
    'reset',
    'completion',
    'failure',
    'role_switch'
]);
const TRAINING_TELEMETRY_REASON_CODES = new Set([
    'audio_unavailable',
    'intro_missing',
    'intro_decode',
    'intro_offline',
    'intro_timeout',
    'intro_captions',
    'revision_conflict',
    'progress_reconcile_failed',
    'progress_write_failed',
    'curriculum_mismatch',
    'activation_failed',
    'reset_failed',
    'resume_rebuild_failed'
]);
const TRAINING_TELEMETRY_STEP_IDS = new Set(
    Object.values(TRAINING_CURRICULUM.profiles).flatMap((roleProfiles) => (
        Object.values(roleProfiles).flatMap((module) => module.steps.map((step) => step.id))
    ))
);
let trainingTelemetrySequence = 0;

export const BLUE_SCRIBE_PRACTICE_ARTIFACT = Object.freeze({
    id: blueScribeFixture.id,
    artifactType: 'action',
    team: 'blue',
    title: blueScribeFixture.goal,
    objective: blueScribeViewModel.objective,
    status: 'Practice draft',
    destination: 'Facilitator'
});

let rolePageActivationPromise = null;

export function buildTrainingTelemetryPayload(eventName, context = {}, details = {}) {
    if (!TRAINING_TELEMETRY_EVENTS.has(eventName)) return null;
    return Object.freeze({
        event: eventName,
        semantic_role: ['scribe', 'facilitator', 'notetaker'].includes(context.semanticRole)
            ? context.semanticRole
            : 'unknown',
        team: ['blue', 'red', 'green', 'industry'].includes(context.team)
            ? context.team
            : 'unknown',
        step_id: TRAINING_TELEMETRY_STEP_IDS.has(details.stepId)
            ? details.stepId
            : null,
        result_code: ['passed', 'failed', 'completed', 'degraded'].includes(details.resultCode)
            ? details.resultCode
            : null,
        reason_code: TRAINING_TELEMETRY_REASON_CODES.has(details.reasonCode)
            ? details.reasonCode
            : null,
        request_id: typeof details.requestId === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(details.requestId)
            ? details.requestId
            : null,
        revision: Number.isSafeInteger(details.revision) && details.revision >= 0
            ? details.revision
            : null
    });
}

function emitTrainingTelemetry(eventName, context = {}, details = {}) {
    trainingTelemetrySequence += 1;
    const requestId = globalThis.crypto?.randomUUID?.()
        || `training-${Date.now().toString(36)}-${trainingTelemetrySequence.toString(36)}`;
    const payload = buildTrainingTelemetryPayload(eventName, context, {
        ...details,
        requestId
    });
    if (!payload) return;
    if (eventName === 'failure') trainingLogger.warn('training_event', payload);
    else trainingLogger.info('training_event', payload);
}

function cacheAttemptSnapshot(rawSnapshot) {
    const snapshot = normalizeTrainingAttemptSnapshot(rawSnapshot);
    if (snapshot.attemptId) attemptSnapshots.set(snapshot.attemptId, snapshot);
    return snapshot;
}

function projectAttemptSnapshot(snapshot, {
    eventType,
    stepId = null,
    resultCode = null,
    revision = snapshot.revision + 1,
    status = null
} = {}) {
    const completed = new Set(snapshot.completedStepIds);
    const mastered = new Set(snapshot.masteredStepIds);
    if (eventType === 'step_completed' && stepId) completed.add(stepId);
    if (eventType === 'mastery_passed' && stepId) {
        completed.add(stepId);
        mastered.add(stepId);
    }
    return normalizeTrainingAttemptSnapshot({
        attemptId: snapshot.attemptId,
        curriculumVersion: snapshot.curriculumVersion,
        revision,
        currentStepId: stepId || snapshot.currentStepId,
        completedStepIds: [...completed],
        masteredStepIds: [...mastered],
        status: status || (eventType === 'attempt_completed' ? 'completed' : snapshot.status),
        result_code: resultCode
    });
}

function queueAttemptWrite(attemptId, task) {
    const previous = attemptWriteQueues.get(attemptId) || Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    const tracked = next.finally(() => {
        if (attemptWriteQueues.get(attemptId) === tracked) attemptWriteQueues.delete(attemptId);
    });
    attemptWriteQueues.set(attemptId, tracked);
    return tracked;
}

function getMasteryEvidenceResult(step, evidence = {}) {
    const predicate = step?.masteryPredicate;
    if (!predicate || typeof evidence !== 'object' || evidence === null) return false;
    switch (predicate.kind) {
        case 'acknowledgement':
        case 'guided_event':
            return evidence.eventKey === predicate.eventKey;
        case 'viewed_fixture':
            return evidence.fixtureId === predicate.fixtureId;
        case 'choice':
            return evidence.optionId === predicate.correctOptionId;
        case 'training_command':
            return evidence.command === predicate.command && evidence.runtimeVerified === true;
        default:
            return false;
    }
}

function buildRuntimeMasteryEvidence(step, command, payload = {}) {
    switch (step?.masteryPredicate?.kind) {
        case 'acknowledgement':
        case 'guided_event':
            return { eventKey: step.masteryPredicate.eventKey };
        case 'viewed_fixture':
            return { fixtureId: step.masteryPredicate.fixtureId };
        case 'training_command':
            return { command, runtimeVerified: true };
        case 'choice':
            return { optionId: payload.answer };
        default:
            return null;
    }
}

function makeCurriculumRestartError(serverVersion) {
    const error = new DatabaseError(
        `This training attempt uses curriculum ${serverVersion || 'unknown'}, which is not compatible with the current ${TRAINING_CURRICULUM.version} curriculum. You must restart training to continue.`,
        'revalidateTrainingAttempt'
    );
    error.name = 'TrainingCurriculumMismatchError';
    error.code = 'TRAINING_CURRICULUM_RESTART_REQUIRED';
    error.userSafe = true;
    return error;
}

function cloneFixture(value) {
    return JSON.parse(JSON.stringify(value));
}

function clonePracticePayload(value, operation) {
    let serialized;
    try {
        serialized = JSON.stringify(value ?? null);
    } catch (_error) {
        throw makeBoundaryError(operation);
    }

    if (serialized.length > TRAINING_PRACTICE_PAYLOAD_LIMIT) {
        throw makeBoundaryError(operation);
    }

    const clone = JSON.parse(serialized);
    if (!clone || typeof clone !== 'object' || Array.isArray(clone)) {
        throw makeBoundaryError(operation);
    }
    return clone;
}

function buildEmptyScribePracticeState(context) {
    return {
        attemptId: context.attemptId,
        team: context.team,
        semanticRole: 'scribe',
        orientation: null,
        artifact: null,
        artifactState: 'empty',
        revision: 0,
        facilitatorReceipt: null,
        returnedArtifact: null
    };
}

function buildEmptyFacilitatorPracticeState(context, fixtureBundle) {
    const proposalThread = fixtureBundle.proposalThreads || [];
    return {
        attemptId: context.attemptId,
        team: context.team,
        semanticRole: 'facilitator',
        artifact: {
            ...cloneFixture(fixtureBundle.artifact),
            status: 'draft',
            workflow_state: 'submitted_to_facilitator'
        },
        artifactState: 'forwarded_to_facilitator',
        artifactReviewed: false,
        workspacesVisited: [],
        restoredWorkspace: null,
        projected: false,
        rfi: null,
        rfiRevisions: [],
        rfiAnswer: null,
        outboundCommunication: null,
        responseClassified: false,
        proposalThread: cloneFixture(proposalThread.slice(0, proposalThread.length ? 1 : 0)),
        proposalNegotiated: false,
        submissionReceipt: null,
        timelineEntries: cloneFixture(fixtureBundle.timelineEntries || []),
        receiptVerified: false
    };
}

function buildEmptyNotetakerPracticeState(context, fixtureBundle) {
    return {
        attemptId: context.attemptId,
        team: context.team,
        semanticRole: 'notetaker',
        activeSeatRecord: cloneFixture(fixtureBundle.notetakerRecord),
        secondSeatRecord: cloneFixture(fixtureBundle.secondNotetakerRecord),
        officialAction: cloneFixture(fixtureBundle.artifact),
        officialTimelineEntries: cloneFixture(fixtureBundle.timelineEntries || []),
        timelineSnapshots: [],
        inboxItem: cloneFixture(fixtureBundle.inject),
        contextOriented: false,
        observationAdded: false,
        quickCapturesAdded: false,
        autosaveCount: 0,
        manualSaveCount: 0,
        inboxOpened: false,
        injectObservationAdded: false,
        readonlyReviewCompleted: false,
        retrievalCompleted: false,
        completed: false
    };
}

function getPracticeState(context) {
    const existing = practiceStates.get(context.attemptId);
    if (
        existing
        && existing.team === context.team
        && existing.semanticRole === context.semanticRole
    ) {
        return existing;
    }

    const fixtureBundle = getTrainingProfileFixtureBundle(context.team, context.semanticRole);
    const created = context.semanticRole === 'facilitator' && fixtureBundle
        ? buildEmptyFacilitatorPracticeState(context, fixtureBundle)
        : context.semanticRole === 'notetaker' && fixtureBundle
            ? buildEmptyNotetakerPracticeState(context, fixtureBundle)
            : buildEmptyScribePracticeState(context);
    restorePracticeStateFromSnapshot(
        context,
        created,
        fixtureBundle,
        attemptSnapshots.get(context.attemptId)
    );
    practiceStates.set(context.attemptId, created);
    return created;
}

function restorePracticeStateFromSnapshot(context, state, fixtureBundle, snapshot) {
    if (!fixtureBundle || !snapshot?.masteredStepIds?.length) return state;
    const masteredStages = new Set(snapshot.masteredStepIds.map((stepId) => stepId.split('.').at(-1)));
    try {
        if (context.semanticRole === 'scribe') {
            if (masteredStages.has('show')) {
                applyScribeCommand(state, SCRIBE_COMMANDS.ORIENTATION_COMPLETED, {
                    artifact: cloneFixture(fixtureBundle.orientation)
                }, fixtureBundle);
            }
            if (masteredStages.has('practice')) {
                applyScribeCommand(state, SCRIBE_COMMANDS.ARTIFACT_DRAFT_SAVED, {
                    artifact: cloneFixture(fixtureBundle.artifact)
                }, fixtureBundle);
                applyScribeCommand(state, SCRIBE_COMMANDS.ARTIFACT_FORWARDED, {
                    artifact: cloneFixture(fixtureBundle.artifact)
                }, fixtureBundle);
            }
            if (masteredStages.has('respond')) {
                applyScribeCommand(state, SCRIBE_COMMANDS.RETURNED_ARTIFACT_REVISED, {
                    artifact: { ...cloneFixture(fixtureBundle.artifact), revision_number: 2 }
                }, fixtureBundle);
            }
            return state;
        }

        if (context.semanticRole === 'facilitator') {
            if (masteredStages.has('orient')) applyFacilitatorCommand(state, FACILITATOR_COMMANDS.ARTIFACT_REVIEWED, { artifactId: fixtureBundle.artifact.id }, fixtureBundle);
            if (masteredStages.has('show')) applyFacilitatorCommand(state, FACILITATOR_COMMANDS.WORKSPACES_RESTORED, { workspaces: FACILITATOR_WORKSPACES, restoredWorkspace: 'actions' }, fixtureBundle);
            if (masteredStages.has('guide')) applyFacilitatorCommand(state, FACILITATOR_COMMANDS.ARTIFACT_PROJECTED, { artifactId: fixtureBundle.artifact.id }, fixtureBundle);
            if (masteredStages.has('practice')) {
                applyFacilitatorCommand(state, FACILITATOR_COMMANDS.RFI_CREATED, {
                    query: 'Which training checkpoint applies?',
                    categories: ['Implementation Timeline']
                }, fixtureBundle);
                applyFacilitatorCommand(state, FACILITATOR_COMMANDS.RFI_RESUBMITTED, {
                    rfiId: fixtureBundle.rfi.id,
                    query: 'Which measurable training checkpoint applies before the move closes?'
                }, fixtureBundle);
            }
            if (masteredStages.has('respond')) {
                applyFacilitatorCommand(state, FACILITATOR_COMMANDS.COMMUNICATION_SENT, { message: 'Confirm the training checkpoint.' }, fixtureBundle);
                applyFacilitatorCommand(state, FACILITATOR_COMMANDS.RESPONSE_CLASSIFIED, {
                    rfiAnswer: 'rfi-answer',
                    communication: 'direct-communication',
                    notification: 'team-action-notification'
                }, fixtureBundle);
                if (fixtureBundle.proposalThreads?.length) {
                    applyFacilitatorCommand(state, FACILITATOR_COMMANDS.PROPOSAL_NEGOTIATED, {
                        proposalMessageId: fixtureBundle.proposalThreads[0].id,
                        decision: 'negotiate',
                        terms: 'Restore the completed deterministic training round.'
                    }, fixtureBundle);
                }
            }
            if (masteredStages.has('retrieve')) applyFacilitatorCommand(state, FACILITATOR_COMMANDS.ARTIFACT_SUBMITTED, { artifactId: fixtureBundle.artifact.id }, fixtureBundle);
            if (masteredStages.has('reflect')) applyFacilitatorCommand(state, FACILITATOR_COMMANDS.RECEIPT_VERIFIED, { artifactId: fixtureBundle.artifact.id }, fixtureBundle);
            return state;
        }

        if (masteredStages.has('orient')) applyNotetakerCommand(state, NOTETAKER_COMMANDS.CONTEXT_ORIENTED, {});
        if (masteredStages.has('show')) applyNotetakerCommand(state, NOTETAKER_COMMANDS.OBSERVATION_ADDED, {
            observation: 'The training team selected a reversible checkpoint.',
            reasoning: 'The fixture balances delivery risk against waiting for more information.'
        });
        if (masteredStages.has('guide')) applyNotetakerCommand(state, NOTETAKER_COMMANDS.QUICK_CAPTURES_ADDED, {
            moment: 'The training discussion changed after the supply update.',
            quote: 'Use the checkpoint before expanding the commitment.'
        });
        if (masteredStages.has('practice')) applyNotetakerCommand(state, NOTETAKER_COMMANDS.SEAT_NOTES_SAVED, {
            dynamicsNote: 'The training team tested disagreement against a reversible checkpoint.',
            allianceNote: 'The fixture records a conditional alignment around the checkpoint.'
        });
        if (masteredStages.has('respond')) {
            applyNotetakerCommand(state, NOTETAKER_COMMANDS.INBOX_OPENED, { inboxItemId: state.inboxItem.id });
            applyNotetakerCommand(state, NOTETAKER_COMMANDS.INJECT_OBSERVATION_ADDED, {
                observation: 'The training team revisited delivery assumptions after the inbox update.',
                reasoning: 'The supply change makes the checkpoint timing newly relevant.'
            });
        }
        if (masteredStages.has('retrieve')) {
            applyNotetakerCommand(state, NOTETAKER_COMMANDS.READONLY_REVIEW_COMPLETED, {
                actionReviewed: true,
                timelineReviewed: true,
                artifactId: state.officialAction.id,
                timelineEntryIds: state.officialTimelineEntries.map((entry) => entry.id)
            });
            applyNotetakerCommand(state, NOTETAKER_COMMANDS.RETRIEVAL_COMPLETED, { answer: 'notetaker-record' });
        }
        if (masteredStages.has('reflect')) applyNotetakerCommand(state, NOTETAKER_COMMANDS.PRACTICE_COMPLETED, {});
    } catch (_error) {
        emitTrainingTelemetry('failure', context, { reasonCode: 'resume_rebuild_failed' });
    }
    return state;
}

function clonePracticeState(state) {
    return Object.freeze(cloneFixture(state));
}

function parseScribeCommand(command, context) {
    const prefix = `scribe.${context.team}.`;
    if (context.semanticRole !== 'scribe' || !String(command || '').startsWith(prefix)) {
        return null;
    }

    const suffix = command.slice(prefix.length);
    const definition = SCRIBE_COMMAND_DEFINITIONS[suffix];
    return definition ? { suffix, definition } : null;
}

function parseFacilitatorCommand(command, context) {
    const prefix = `facilitator.${context.team}.`;
    if (context.semanticRole !== 'facilitator' || !String(command || '').startsWith(prefix)) {
        return null;
    }

    const suffix = command.slice(prefix.length);
    const definition = FACILITATOR_COMMAND_DEFINITIONS[suffix];
    return definition ? { suffix, definition } : null;
}

function parseNotetakerCommand(command, context) {
    const prefix = `notetaker.${context.team}.`;
    if (context.semanticRole !== 'notetaker' || !String(command || '').startsWith(prefix)) {
        return null;
    }

    const suffix = command.slice(prefix.length);
    const definition = NOTETAKER_COMMAND_DEFINITIONS[suffix];
    return definition ? { suffix, definition } : null;
}

function parseTrainingCommand(command, context) {
    return parseScribeCommand(command, context)
        || parseFacilitatorCommand(command, context)
        || parseNotetakerCommand(command, context);
}

function applyScribeCommand(state, suffix, payload, fixtureBundle) {
    if (suffix === SCRIBE_COMMANDS.ORIENTATION_COMPLETED) {
        if (state.orientation) {
            throw makeBoundaryError(`scribe.${state.team}.${suffix}`);
        }
        state.orientation = payload.artifact;
        return;
    }

    if (!state.orientation) {
        throw makeBoundaryError(`scribe.${state.team}.${suffix}`);
    }

    if (suffix === SCRIBE_COMMANDS.ARTIFACT_DRAFT_SAVED) {
        if (!['empty', 'draft'].includes(state.artifactState)) {
            throw makeBoundaryError(`scribe.${state.team}.${suffix}`);
        }
        state.artifact = payload.artifact;
        state.artifactState = 'draft';
        return;
    }

    if (suffix === SCRIBE_COMMANDS.ARTIFACT_FORWARDED) {
        if (state.artifactState !== 'draft') {
            throw makeBoundaryError(`scribe.${state.team}.${suffix}`);
        }
        state.artifact = payload.artifact;
        state.artifactState = 'returned';
        state.revision = Math.max(1, state.revision);
        state.facilitatorReceipt = cloneFixture(fixtureBundle.handoff);
        state.returnedArtifact = cloneFixture(fixtureBundle.whiteCellReturn);
        return;
    }

    if (suffix === SCRIBE_COMMANDS.RETURNED_ARTIFACT_REVISED) {
        if (state.artifactState !== 'returned' || !state.returnedArtifact) {
            throw makeBoundaryError(`scribe.${state.team}.${suffix}`);
        }
        state.artifact = payload.artifact;
        state.artifactState = 'completed';
        state.revision += 1;
        return;
    }

    throw makeBoundaryError(`scribe.${state.team}.${suffix}`);
}

function assertFacilitatorState(condition, state, suffix) {
    if (!condition) throw makeBoundaryError(`facilitator.${state.team}.${suffix}`);
}

function applyFacilitatorCommand(state, suffix, payload, fixtureBundle) {
    const artifactId = String(payload.artifactId || '');

    if (suffix === FACILITATOR_COMMANDS.ARTIFACT_REVIEWED) {
        assertFacilitatorState(artifactId === fixtureBundle.artifact.id && !state.artifactReviewed, state, suffix);
        state.artifactReviewed = true;
        return;
    }

    if (suffix === FACILITATOR_COMMANDS.WORKSPACES_RESTORED) {
        const visited = Array.isArray(payload.workspaces) ? [...new Set(payload.workspaces)] : [];
        assertFacilitatorState(
            state.artifactReviewed
                && FACILITATOR_WORKSPACES.every((workspace) => visited.includes(workspace))
                && FACILITATOR_WORKSPACES.includes(payload.restoredWorkspace),
            state,
            suffix
        );
        state.workspacesVisited = FACILITATOR_WORKSPACES.filter((workspace) => visited.includes(workspace));
        state.restoredWorkspace = payload.restoredWorkspace;
        return;
    }

    if (suffix === FACILITATOR_COMMANDS.ARTIFACT_PROJECTED) {
        assertFacilitatorState(
            state.workspacesVisited.length === FACILITATOR_WORKSPACES.length
                && artifactId === fixtureBundle.artifact.id,
            state,
            suffix
        );
        state.projected = true;
        return;
    }

    if (suffix === FACILITATOR_COMMANDS.RFI_CREATED) {
        const query = String(payload.query || '').trim();
        const categories = Array.isArray(payload.categories)
            ? payload.categories.map((value) => String(value || '').trim()).filter(Boolean)
            : [];
        assertFacilitatorState(state.projected && !state.rfi && query && categories.length > 0, state, suffix);
        state.rfi = {
            ...cloneFixture(fixtureBundle.rfi),
            query,
            revision_number: 1,
            status: 'pending',
            workflow_state: 'returned_to_team'
        };
        state.rfiRevisions = [
            { revision_number: 1, workflow_state: 'submitted_to_white_cell', query },
            { revision_number: 1, workflow_state: 'returned_to_team', review_notes: fixtureBundle.rfi.review_notes }
        ];
        return;
    }

    if (suffix === FACILITATOR_COMMANDS.RFI_RESUBMITTED) {
        const query = String(payload.query || '').trim();
        assertFacilitatorState(
            state.rfi?.id === payload.rfiId
                && state.rfi.workflow_state === 'returned_to_team'
                && query
                && query !== state.rfi.query,
            state,
            suffix
        );
        state.rfi = {
            ...state.rfi,
            query,
            revision_number: 2,
            status: 'answered',
            workflow_state: 'completed',
            response: fixtureBundle.rfiAnswer.response,
            updated_at: fixtureBundle.rfiAnswer.responded_at
        };
        state.rfiRevisions.push(
            { revision_number: 2, workflow_state: 'resubmitted', query },
            { revision_number: 2, workflow_state: 'completed', response: fixtureBundle.rfiAnswer.response }
        );
        state.rfiAnswer = cloneFixture(fixtureBundle.rfiAnswer);
        return;
    }

    if (suffix === FACILITATOR_COMMANDS.COMMUNICATION_SENT) {
        const message = String(payload.message || '').trim();
        assertFacilitatorState(state.rfiAnswer && !state.outboundCommunication && message && message.length <= 2000, state, suffix);
        state.outboundCommunication = {
            id: `training-fixture:communication-outbound:${state.team}`,
            session_id: fixtureBundle.communication.session_id,
            type: 'GUIDANCE',
            from_role: `${state.team}_scribe`,
            to_role: 'white_cell',
            team: state.team,
            title: 'TRAINING FIXTURE - Facilitator direct communication',
            content: message,
            metadata: {
                source_team: state.team,
                source_role: `${state.team}_scribe`,
                recipient: 'white_cell',
                recipient_scope: 'whitecell'
            },
            created_at: fixtureBundle.rfiAnswer.responded_at
        };
        return;
    }

    if (suffix === FACILITATOR_COMMANDS.RESPONSE_CLASSIFIED) {
        assertFacilitatorState(
            state.outboundCommunication
                && payload.rfiAnswer === 'rfi-answer'
                && payload.communication === 'direct-communication'
                && payload.notification === 'team-action-notification',
            state,
            suffix
        );
        state.responseClassified = true;
        return;
    }

    if (suffix === FACILITATOR_COMMANDS.PROPOSAL_NEGOTIATED) {
        const expectedThread = fixtureBundle.proposalThreads || [];
        const root = expectedThread[0];
        const response = expectedThread[1];
        const terms = String(payload.terms || '').trim();
        assertFacilitatorState(
            state.responseClassified
                && root
                && response
                && state.proposalThread.length === 1
                && payload.proposalMessageId === root.id
                && payload.decision === 'negotiate'
                && terms
                && root.metadata?.recipient_team === state.team
                && response.metadata?.recipient_team === state.team
                && response.metadata?.thread_id === root.metadata?.thread_id
                && response.metadata?.parent_message_id === root.id,
            state,
            suffix
        );
        state.proposalThread.push({
            ...cloneFixture(response),
            content: `TRAINING FIXTURE: ${terms}`
        });
        state.proposalNegotiated = true;
        return;
    }

    if (suffix === FACILITATOR_COMMANDS.ARTIFACT_SUBMITTED) {
        const proposalReady = !fixtureBundle.proposalThreads?.length || state.proposalNegotiated;
        assertFacilitatorState(state.responseClassified && proposalReady && artifactId === fixtureBundle.artifact.id, state, suffix);
        state.artifact = {
            ...state.artifact,
            status: 'submitted',
            workflow_state: 'submitted_to_white_cell'
        };
        state.artifactState = 'submitted_to_white_cell';
        state.submissionReceipt = {
            id: `training-fixture:submission-receipt:${state.team}`,
            artifact_id: fixtureBundle.artifact.id,
            workflow_state: 'submitted_to_white_cell',
            visibleLabel: `TRAINING FIXTURE - ${state.team} artifact received by simulated White Cell`,
            created_at: fixtureBundle.rfiAnswer.responded_at
        };
        state.timelineEntries.push({
            id: `training-fixture:timeline:${state.team}:submission-receipt`,
            session_id: fixtureBundle.artifact.session_id,
            type: 'ACTION_SUBMITTED',
            content: `TRAINING FIXTURE: ${state.team} Facilitator submitted the artifact to simulated White Cell.`,
            team: state.team,
            move: fixtureBundle.artifact.move,
            phase: fixtureBundle.artifact.phase,
            created_at: fixtureBundle.rfiAnswer.responded_at,
            metadata: { artifact_id: fixtureBundle.artifact.id, source: 'training_fixture' }
        });
        return;
    }

    if (suffix === FACILITATOR_COMMANDS.RECEIPT_VERIFIED) {
        assertFacilitatorState(
            state.submissionReceipt?.artifact_id === payload.artifactId
                && state.timelineEntries.some((entry) => entry.id.endsWith(':submission-receipt')),
            state,
            suffix
        );
        state.receiptVerified = true;
        return;
    }

    throw makeBoundaryError(`facilitator.${state.team}.${suffix}`);
}

function normalizeNotetakerPracticeText(value, operation) {
    if (typeof value !== 'string') {
        throw makeBoundaryError(operation);
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > NOTETAKER_PRACTICE_TEXT_LIMIT) {
        throw makeBoundaryError(operation);
    }
    return normalized;
}

function buildNotetakerCapture(state, type, content, offset = 0) {
    const record = state.activeSeatRecord;
    const captureIndex = record.observation_timeline.length + 1 + offset;
    const timestamp = record.updated_at;
    return annotateObservationTimelineEntries([{
        id: `training-fixture:observation:${state.team}:learner:${captureIndex}`,
        type,
        content,
        created_at: timestamp
    }], {
        teamId: state.team,
        timestamp,
        participantKey: record.participantKey,
        participantId: record.participantKey,
        clientId: `training-fixture:notetaker-client:${state.team}:a`,
        participantLabel: `TRAINING FIXTURE - ${state.team} Notetaker learner`
    })[0];
}

function appendNotetakerCaptures(state, entries, operation) {
    const existingSignatures = new Set(
        state.activeSeatRecord.observation_timeline.map((entry) => (
            String(entry.content || '').trim().toLowerCase()
        ))
    );
    const nextSignatures = entries.map((entry) => String(entry.content || '').trim().toLowerCase());
    if (
        nextSignatures.some((signature) => !signature || existingSignatures.has(signature))
        || new Set(nextSignatures).size !== nextSignatures.length
    ) {
        throw makeBoundaryError(operation);
    }
    state.activeSeatRecord.observation_timeline.push(...entries);
}

function updateNotetakerSeatNotes(state, payload, operation) {
    const dynamicsNote = normalizeNotetakerPracticeText(payload.dynamicsNote, operation);
    const allianceNote = normalizeNotetakerPracticeText(payload.allianceNote, operation);
    if (dynamicsNote.toLowerCase() === allianceNote.toLowerCase()) {
        throw makeBoundaryError(operation);
    }

    const record = state.activeSeatRecord;
    const participantOptions = {
        teamId: state.team,
        timestamp: record.updated_at,
        participantKey: record.participantKey,
        participantId: record.participantKey,
        clientId: `training-fixture:notetaker-client:${state.team}:a`,
        participantLabel: `TRAINING FIXTURE - ${state.team} Notetaker learner`
    };
    const currentDynamics = readParticipantScopedNotetakerSection(record.dynamics_analysis, {}, {
        teamId: state.team,
        participantKey: record.participantKey
    });
    const currentAlliance = readParticipantScopedNotetakerSection(record.external_factors, {}, {
        teamId: state.team,
        participantKey: record.participantKey
    });
    record.dynamics_analysis = mergeParticipantScopedNotetakerSection(record.dynamics_analysis, {
        ...currentDynamics,
        dynamicsSummary: dynamicsNote
    }, participantOptions);
    record.external_factors = mergeParticipantScopedNotetakerSection(record.external_factors, {
        ...currentAlliance,
        allianceNotes: allianceNote
    }, participantOptions);

    return {
        dynamicsData: readParticipantScopedNotetakerSection(record.dynamics_analysis, {}, {
            teamId: state.team,
            participantKey: record.participantKey
        }),
        allianceData: readParticipantScopedNotetakerSection(record.external_factors, {}, {
            teamId: state.team,
            participantKey: record.participantKey
        })
    };
}

function buildNotetakerPracticeTimelineSnapshot(state, noteScope, noteData) {
    const sequence = state.timelineSnapshots.length + 1;
    return {
        id: `training-fixture:timeline:${state.team}:notetaker-${noteScope}:${sequence}`,
        session_id: state.activeSeatRecord.session_id,
        type: 'NOTE',
        content: noteScope === 'dynamics'
            ? 'Team dynamics notes saved'
            : 'Alliance tracking notes saved',
        team: state.team,
        move: state.activeSeatRecord.move,
        phase: state.activeSeatRecord.phase,
        created_at: state.activeSeatRecord.updated_at,
        metadata: {
            actor: `TRAINING FIXTURE - ${state.team} Notetaker learner`,
            role: `${state.team}_notetaker`,
            source: NOTETAKER_TIMELINE_EVENT_SOURCE,
            note_scope: noteScope,
            note_scope_label: getNotetakerTimelineScopeLabel(noteScope),
            note_details: buildNotetakerTimelineDetailItems(noteScope, noteData),
            participant_key: state.activeSeatRecord.participantKey,
            participant_id: state.activeSeatRecord.participantKey,
            participant_label: `TRAINING FIXTURE - ${state.team} Notetaker learner`
        }
    };
}

function assertNotetakerState(condition, state, suffix) {
    if (!condition) throw makeBoundaryError(`notetaker.${state.team}.${suffix}`);
}

function applyNotetakerCommand(state, suffix, payload) {
    const operation = `notetaker.${state.team}.${suffix}`;

    if (suffix === NOTETAKER_COMMANDS.CONTEXT_ORIENTED) {
        assertNotetakerState(!state.contextOriented, state, suffix);
        state.contextOriented = true;
        return;
    }

    if (suffix === NOTETAKER_COMMANDS.OBSERVATION_ADDED) {
        assertNotetakerState(state.contextOriented && !state.observationAdded, state, suffix);
        const observation = normalizeNotetakerPracticeText(payload.observation, operation);
        const reasoning = normalizeNotetakerPracticeText(payload.reasoning, operation);
        const content = `${observation} Reasoning: ${reasoning}`;
        if (content.length > NOTETAKER_PRACTICE_TEXT_LIMIT) throw makeBoundaryError(operation);
        appendNotetakerCaptures(state, [buildNotetakerCapture(state, 'NOTE', content)], operation);
        state.observationAdded = true;
        return;
    }

    if (suffix === NOTETAKER_COMMANDS.QUICK_CAPTURES_ADDED) {
        assertNotetakerState(state.observationAdded && !state.quickCapturesAdded, state, suffix);
        const moment = normalizeNotetakerPracticeText(payload.moment, operation);
        const quote = normalizeNotetakerPracticeText(payload.quote, operation);
        appendNotetakerCaptures(state, [
            buildNotetakerCapture(state, 'MOMENT', moment),
            buildNotetakerCapture(state, 'QUOTE', quote, 1)
        ], operation);
        state.quickCapturesAdded = true;
        return;
    }

    if (suffix === NOTETAKER_COMMANDS.SEAT_NOTES_AUTOSAVED) {
        assertNotetakerState(state.quickCapturesAdded, state, suffix);
        updateNotetakerSeatNotes(state, payload, operation);
        state.autosaveCount += 1;
        return;
    }

    if (suffix === NOTETAKER_COMMANDS.SEAT_NOTES_SAVED) {
        assertNotetakerState(state.quickCapturesAdded && state.manualSaveCount === 0, state, suffix);
        const { dynamicsData, allianceData } = updateNotetakerSeatNotes(state, payload, operation);
        state.timelineSnapshots.push(
            buildNotetakerPracticeTimelineSnapshot(state, 'dynamics', dynamicsData),
            buildNotetakerPracticeTimelineSnapshot(state, 'alliance', allianceData)
        );
        state.manualSaveCount = 1;
        return;
    }

    if (suffix === NOTETAKER_COMMANDS.INBOX_OPENED) {
        assertNotetakerState(state.manualSaveCount === 1 && !state.inboxOpened && payload.inboxItemId === state.inboxItem.id, state, suffix);
        state.inboxOpened = true;
        return;
    }

    if (suffix === NOTETAKER_COMMANDS.INJECT_OBSERVATION_ADDED) {
        assertNotetakerState(state.inboxOpened && !state.injectObservationAdded, state, suffix);
        const observation = normalizeNotetakerPracticeText(payload.observation, operation);
        const reasoning = normalizeNotetakerPracticeText(payload.reasoning, operation);
        const content = `${observation} Reasoning after inbox update: ${reasoning}`;
        if (content.length > NOTETAKER_PRACTICE_TEXT_LIMIT) throw makeBoundaryError(operation);
        appendNotetakerCaptures(state, [
            buildNotetakerCapture(state, 'NOTE', content)
        ], operation);
        state.injectObservationAdded = true;
        return;
    }

    if (suffix === NOTETAKER_COMMANDS.READONLY_REVIEW_COMPLETED) {
        const officialTimelineIds = state.officialTimelineEntries.map((entry) => entry.id);
        assertNotetakerState(
            state.injectObservationAdded
                && !state.readonlyReviewCompleted
                && payload.actionReviewed === true
                && payload.timelineReviewed === true
                && payload.artifactId === state.officialAction.id
                && Array.isArray(payload.timelineEntryIds)
                && payload.timelineEntryIds.length === officialTimelineIds.length
                && officialTimelineIds.every((id) => payload.timelineEntryIds.includes(id)),
            state,
            suffix
        );
        state.readonlyReviewCompleted = true;
        return;
    }

    if (suffix === NOTETAKER_COMMANDS.RETRIEVAL_COMPLETED) {
        assertNotetakerState(
            state.readonlyReviewCompleted
                && !state.retrievalCompleted
                && payload.answer === 'notetaker-record',
            state,
            suffix
        );
        state.retrievalCompleted = true;
        return;
    }

    if (suffix === NOTETAKER_COMMANDS.PRACTICE_COMPLETED) {
        assertNotetakerState(state.retrievalCompleted && !state.completed, state, suffix);
        state.completed = true;
        return;
    }

    throw makeBoundaryError(operation);
}

export function getScribeTrainingCommand(team, suffix) {
    if (!SCRIBE_COMMAND_DEFINITIONS[suffix]) return null;
    return `scribe.${team}.${suffix}`;
}

export function getFacilitatorTrainingCommand(team, suffix) {
    if (!FACILITATOR_COMMAND_DEFINITIONS[suffix]) return null;
    return `facilitator.${team}.${suffix}`;
}

export function getNotetakerTrainingCommand(team, suffix) {
    if (!NOTETAKER_COMMAND_DEFINITIONS[suffix]) return null;
    return `notetaker.${team}.${suffix}`;
}

function makeBoundaryError(operation) {
    const error = new DatabaseError(TRAINING_RECOVERY_MESSAGE, operation);
    error.name = 'TrainingIsolationError';
    error.code = 'TRAINING_WRITE_BLOCKED';
    error.operation = operation;
    error.userSafe = true;
    return error;
}

function createElement(documentRef, tagName, className, textContent = '') {
    const element = documentRef.createElement(tagName);
    element.className = className;
    element.textContent = textContent;
    return element;
}

export function syncTrainingSandboxBannerLayout({
    banner,
    documentRef = typeof document !== 'undefined' ? document : null
} = {}) {
    const measuredHeight = Number(banner?.getBoundingClientRect?.().height || banner?.offsetHeight || 0);
    if (!documentRef?.body?.style?.setProperty || !Number.isFinite(measuredHeight) || measuredHeight <= 0) {
        return 0;
    }

    const reservedHeight = Math.ceil(measuredHeight);
    documentRef.body.style.setProperty('--training-sandbox-banner-height', `${reservedHeight}px`);
    return reservedHeight;
}

function observeTrainingSandboxBannerLayout({ banner, documentRef }) {
    const syncLayout = () => syncTrainingSandboxBannerLayout({ banner, documentRef });
    syncLayout();

    const ResizeObserverConstructor = documentRef?.defaultView?.ResizeObserver
        || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : null);
    if (ResizeObserverConstructor) {
        const resizeObserver = new ResizeObserverConstructor(syncLayout);
        resizeObserver.observe(banner);
        return resizeObserver;
    }

    documentRef?.defaultView?.addEventListener?.('resize', syncLayout);
    return null;
}

export function hydrateTrainingFixtures(context) {
    // Importing and resolving the module makes schema/catalog validation part
    // of normal application startup, not a test-only content check.
    if (
        (context?.curriculumVersion && context.curriculumVersion !== TRAINING_CURRICULUM.version)
        || !getTrainingModule(context?.semanticRole, context?.team)
    ) {
        return Object.freeze({ actions: Object.freeze([]) });
    }

    if (context?.team === 'blue' && context?.semanticRole === 'scribe') {
        return Object.freeze({
            actions: Object.freeze([Object.freeze(cloneFixture(BLUE_SCRIBE_PRACTICE_ARTIFACT))])
        });
    }

    return Object.freeze({ actions: Object.freeze([]) });
}

export function renderBlueScribePracticeArtifact({
    documentRef = typeof document !== 'undefined' ? document : null,
    fixture = BLUE_SCRIBE_PRACTICE_ARTIFACT
} = {}) {
    const host = documentRef?.getElementById?.('actionsList');
    if (!host) {
        return null;
    }

    host.replaceChildren();
    const card = createElement(documentRef, 'article', 'card card-bordered training-practice-artifact');
    card.dataset.trainingArtifactId = fixture.id;
    card.setAttribute('aria-labelledby', 'trainingPracticeArtifactTitle');

    const eyebrow = createElement(documentRef, 'p', 'training-practice-artifact-label', 'TRAINING FIXTURE | Blue Action');
    const title = createElement(documentRef, 'h3', 'card-title', fixture.title);
    title.id = 'trainingPracticeArtifactTitle';
    const objective = createElement(documentRef, 'p', 'text-sm text-gray-600', fixture.objective);
    const status = createElement(
        documentRef,
        'p',
        'training-practice-artifact-status',
        `${fixture.status} | Next owner: ${fixture.destination}`
    );
    const note = createElement(
        documentRef,
        'p',
        'text-sm',
        'Practice data stays in this browser tab and is never submitted to a live session.'
    );

    card.append(eyebrow, title, objective, status, note);
    host.appendChild(card);
    return card;
}

export function mountTrainingSandboxBanner({
    context,
    documentRef = typeof document !== 'undefined' ? document : null,
    onReplayIntro = null,
    onReset = null,
    onExit = null
} = {}) {
    if (!documentRef?.body || !context) {
        return null;
    }

    const existing = documentRef.getElementById?.('trainingSandboxBanner');
    if (existing) {
        documentRef.body.classList?.add?.('training-sandbox-visible');
        syncTrainingSandboxBannerLayout({ banner: existing, documentRef });
        return existing;
    }

    const banner = createElement(documentRef, 'section', 'training-sandbox-banner');
    banner.id = 'trainingSandboxBanner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-label', 'Training sandbox');
    banner.setAttribute('aria-live', 'polite');

    const copy = createElement(documentRef, 'div', 'training-sandbox-banner-copy');
    const title = createElement(documentRef, 'strong', 'training-sandbox-banner-title', 'Training sandbox');
    const detail = createElement(
        documentRef,
        'span',
        'training-sandbox-banner-detail',
        `${context.team} ${context.semanticRole} | Practice data is isolated from live sessions.`
    );
    copy.append(title, detail);

    const controls = createElement(documentRef, 'div', 'training-sandbox-banner-controls');
    const resetHelp = createElement(documentRef, 'span', 'sr-only', 'Reset only this team-and-role training attempt.');
    resetHelp.id = 'trainingResetHelp';

    const resetButton = createElement(documentRef, 'button', 'btn btn-secondary btn-sm', 'Reset current role');
    resetButton.type = 'button';
    resetButton.id = 'trainingResetBtn';
    resetButton.disabled = typeof onReset !== 'function';
    resetButton.setAttribute('aria-describedby', resetHelp.id);
    resetButton.addEventListener('click', () => onReset?.(resetButton));

    const replayIntroButton = createElement(
        documentRef,
        'button',
        'btn btn-secondary btn-sm training-coach-replay-intro',
        'Replay intro'
    );
    replayIntroButton.type = 'button';
    replayIntroButton.id = 'trainingReplayIntroBtn';
    replayIntroButton.dataset.trainingCoachControl = 'replay-intro';
    replayIntroButton.setAttribute('aria-label', 'Replay training introduction video');
    replayIntroButton.addEventListener('click', () => onReplayIntro?.());

    const exitButton = createElement(documentRef, 'button', 'btn btn-primary btn-sm', 'Exit training');
    exitButton.type = 'button';
    exitButton.id = 'exitTrainingBtn';
    exitButton.addEventListener('click', () => {
        if (onExit) onExit();
        else trainingRuntime.exitTraining({ documentRef });
    });

    controls.append(resetHelp, replayIntroButton, resetButton, exitButton);
    banner.append(copy, controls);
    documentRef.body.appendChild(banner);
    documentRef.body.classList?.add?.('training-sandbox-visible');
    observeTrainingSandboxBannerLayout({ banner, documentRef });

    const liveLogout = documentRef.getElementById?.('logoutBtn');
    if (liveLogout) {
        liveLogout.hidden = true;
    }

    return banner;
}

export const trainingRuntime = {
    async startOrResume({
        code,
        team,
        publicRoleSurface,
        curriculumVersion = TRAINING_CURRICULUM.version,
        displayName = null,
        databaseRef = database,
        sessionStoreRef = sessionStore
    } = {}) {
        const semanticRole = getSemanticRoleForPublicSurface(publicRoleSurface);
        if (!semanticRole || curriculumVersion !== TRAINING_CURRICULUM.version) {
            throw makeBoundaryError('startOrResume');
        }

        let bootstrap = await databaseRef.startOrResumeTrainingAttempt({
            code,
            semanticRole,
            team,
            curriculumVersion
        });
        if (bootstrap?.resumed === true) {
            bootstrap = await databaseRef.getTrainingAttemptBootstrap(bootstrap.attempt_id);
        }
        const context = createTrainingContextFromBootstrap(bootstrap);
        if (!context || context.curriculumVersion !== TRAINING_CURRICULUM.version) {
            throw makeBoundaryError('activateTrainingBootstrap');
        }
        const attemptSnapshot = cacheAttemptSnapshot(bootstrap);

        const role = getTrainingRole(context.team, context.semanticRole);
        sessionStoreRef.clear();
        sessionStoreRef.setTrainingContext(context, { serverValidated: true });
        sessionStoreRef.setRole(role);
        sessionStoreRef.setUserName(displayName);
        emitTrainingTelemetry('start', context, { revision: attemptSnapshot.revision });

        return {
            bootstrap,
            attemptSnapshot,
            context,
            role,
            route: getTrainingRoleRoute(context.team, context.semanticRole)
        };
    },

    async revalidate({
        databaseRef = database,
        sessionStoreRef = sessionStore
    } = {}) {
        const storedContext = normalizeStoredTrainingContext(sessionStoreRef.getTrainingContext?.({
            requireServerValidation: false
        }));
        if (!storedContext) {
            return null;
        }

        const bootstrap = await databaseRef.getTrainingAttemptBootstrap(storedContext.attemptId);
        const serverContext = createTrainingContextFromBootstrap(bootstrap);
        if (bootstrap?.curriculum_version !== TRAINING_CURRICULUM.version) {
            sessionStoreRef.clearTrainingContext?.();
            throw makeCurriculumRestartError(bootstrap?.curriculum_version);
        }
        if (
            !serverContext
            || !trainingContextsMatch(storedContext, serverContext)
        ) {
            sessionStoreRef.clearTrainingContext?.();
            throw makeBoundaryError('revalidateTrainingAttempt');
        }

        sessionStoreRef.setTrainingContext(serverContext, { serverValidated: true });
        cacheAttemptSnapshot(bootstrap);
        return serverContext;
    },

    async initializeRolePage({
        expectedSemanticRole,
        team,
        documentRef = typeof document !== 'undefined' ? document : null,
        databaseRef = database,
        sessionStoreRef = sessionStore,
        navigateRef = navigateToApp,
        showToastRef = showToast,
        showTrainingIntroModalRef = showTrainingIntroModal,
        confirmRef = confirmModal
    } = {}) {
        if (!sessionStoreRef.hasTrainingContext?.()) {
            return null;
        }

        if (!rolePageActivationPromise) {
            rolePageActivationPromise = this.revalidate({ databaseRef, sessionStoreRef })
                .finally(() => {
                    rolePageActivationPromise = null;
                });
        }

        try {
            const context = await rolePageActivationPromise;
            if (
                !sessionStoreRef.hasTrainingContext?.()
                || !isAllowedTrainingRolePage(context, {
                    team,
                    semanticRole: expectedSemanticRole
                })
            ) {
                sessionStoreRef.clearTrainingContext?.();
                showToastRef({ message: TRAINING_RECOVERY_MESSAGE, type: 'error' });
                navigateRef('', { replace: true });
                return { active: false, rejected: true };
            }

            const openIntro = ({ forceReplay = false } = {}) => {
                try {
                    return showTrainingIntroModalRef({
                        context,
                        forceReplay,
                        documentRef,
                        windowRef: documentRef?.defaultView || (typeof window !== 'undefined' ? window : null),
                        onMediaDegraded: (reasonCode) => {
                            void this.recordMediaDegradation(null, `intro_${reasonCode}`, {
                                databaseRef,
                                sessionStoreRef
                            }).catch(() => {});
                        },
                        onChangeProfile: () => this.exitTraining({
                            sessionStoreRef,
                            navigateRef,
                            documentRef
                        }),
                        onContinue: (introContext, detail) => {
                            const eventName = 'training:intro-complete';
                            const EventConstructor = documentRef?.defaultView?.CustomEvent
                                || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
                            if (EventConstructor) {
                                documentRef?.dispatchEvent?.(new EventConstructor(eventName, {
                                    detail: {
                                        attemptId: introContext.attemptId,
                                        curriculumVersion: introContext.curriculumVersion,
                                        semanticRole: introContext.semanticRole,
                                        team: introContext.team,
                                        reason: detail?.reason || 'continued'
                                    }
                                }));
                            }

                            const walkthroughStart = documentRef?.getElementById?.('scribeTrainingCoach')
                                || documentRef?.getElementById?.('facilitatorTrainingCoach')
                                || documentRef?.getElementById?.('notetakerTrainingCoach')
                                || documentRef?.querySelector?.('main');
                            if (walkthroughStart?.focus) {
                                if (!walkthroughStart.hasAttribute?.('tabindex')) {
                                    walkthroughStart.setAttribute?.('tabindex', '-1');
                                }
                                walkthroughStart.focus();
                            }
                        }
                    });
                } catch (_mediaError) {
                    showToastRef({
                        message: 'The introduction could not open. Training is still available; use Replay intro to try again.',
                        type: 'warning'
                    });
                    return null;
                }
            };

            mountTrainingSandboxBanner({
                context,
                documentRef,
                onReplayIntro: () => openIntro({ forceReplay: true }),
                onReset: async () => {
                    const confirmed = await confirmRef({
                        title: 'Reset current role?',
                        message: 'This clears only this team-and-role attempt and starts again from the first step.',
                        confirmLabel: 'Reset current role',
                        cancelLabel: 'Keep progress',
                        variant: 'danger'
                    });
                    if (!confirmed) return;
                    try {
                        await this.resetAttempt({ databaseRef, sessionStoreRef, navigateRef, documentRef });
                    } catch (error) {
                        emitTrainingTelemetry('failure', context, { reasonCode: 'reset_failed' });
                        showToastRef({
                            message: error?.code === 'TRAINING_REVISION_CONFLICT'
                                ? 'This attempt changed in another tab. Refresh before resetting it.'
                                : 'The training attempt could not be reset. Your current progress was not cleared.',
                            type: 'error'
                        });
                    }
                }
            });
            documentRef?.querySelectorAll?.('[data-write-control]')?.forEach?.((control) => {
                control.disabled = true;
                control.setAttribute?.('aria-describedby', 'trainingSandboxBanner');
                control.title = 'Live write controls are unavailable in the training sandbox.';
            });
            const fixtures = hydrateTrainingFixtures(context);
            const fixtureBundle = getTrainingProfileFixtureBundle(context.team, context.semanticRole);

            const attemptSnapshot = this.getAttemptSnapshot(context.attemptId);
            if (attemptSnapshot?.status !== 'completed') openIntro();

            return {
                active: true,
                context,
                fixtures,
                fixtureBundle,
                attemptSnapshot
            };
        } catch (error) {
            sessionStoreRef.clearTrainingContext?.();
            const message = error?.code === 'TRAINING_CURRICULUM_RESTART_REQUIRED'
                ? error.message
                : TRAINING_RECOVERY_MESSAGE;
            emitTrainingTelemetry('failure', {}, {
                reasonCode: error?.code === 'TRAINING_CURRICULUM_RESTART_REQUIRED'
                    ? 'curriculum_mismatch'
                    : 'activation_failed'
            });
            showToastRef({ message, type: 'error' });
            navigateRef('', { replace: true });
            return { active: false, rejected: true };
        }
    },

    async guardCurrentRoute({
        locationRef = typeof window !== 'undefined' ? window.location : null,
        databaseRef = database,
        sessionStoreRef = sessionStore,
        navigateRef = navigateToApp,
        showToastRef = showToast
    } = {}) {
        if (!sessionStoreRef.hasTrainingContext?.()) {
            return { active: false, allowed: true };
        }

        try {
            if (!rolePageActivationPromise) {
                rolePageActivationPromise = this.revalidate({ databaseRef, sessionStoreRef })
                    .finally(() => {
                        rolePageActivationPromise = null;
                    });
            }
            const context = await rolePageActivationPromise;
            const expectedRoute = getTrainingRoleRoute(context.team, context.semanticRole);
            const expectedPath = new URL(expectedRoute, locationRef?.origin || 'https://app.local').pathname;
            if (
                !locationRef
                || locationRef.pathname !== expectedPath
                || Boolean(locationRef.search)
            ) {
                sessionStoreRef.clearTrainingContext?.();
                showToastRef({ message: TRAINING_RECOVERY_MESSAGE, type: 'error' });
                navigateRef('', { replace: true });
                return { active: false, allowed: false };
            }

            return { active: true, allowed: true, context };
        } catch (_error) {
            sessionStoreRef.clearTrainingContext?.();
            showToastRef({ message: TRAINING_RECOVERY_MESSAGE, type: 'error' });
            navigateRef('', { replace: true });
            return { active: false, allowed: false };
        }
    },

    async executeWrite(operation, payload, {
        databaseRef = database,
        sessionStoreRef = sessionStore
    } = {}) {
        const context = sessionStoreRef.getTrainingContext?.();
        if (!context) {
            throw makeBoundaryError(operation);
        }

        if (operation !== 'record-progress') {
            throw makeBoundaryError(operation);
        }

        return databaseRef.recordTrainingProgressEvent({
            attemptId: context.attemptId,
            ...payload
        });
    },

    getAttemptSnapshot(attemptId = null, { sessionStoreRef = sessionStore } = {}) {
        const resolvedAttemptId = attemptId || sessionStoreRef.getTrainingContext?.()?.attemptId;
        return resolvedAttemptId ? attemptSnapshots.get(resolvedAttemptId) || null : null;
    },

    async refreshAttemptSnapshot({
        databaseRef = database,
        sessionStoreRef = sessionStore
    } = {}) {
        const context = sessionStoreRef.getTrainingContext?.();
        if (!context) throw makeBoundaryError('refresh-training-progress');
        const bootstrap = await databaseRef.getTrainingAttemptBootstrap(context.attemptId);
        if (bootstrap?.curriculum_version !== TRAINING_CURRICULUM.version) {
            throw makeCurriculumRestartError(bootstrap?.curriculum_version);
        }
        return cacheAttemptSnapshot(bootstrap);
    },

    async recordProgress({
        eventType,
        stepId = null,
        resultCode = null,
        eventKey = null
    } = {}, {
        databaseRef = database,
        sessionStoreRef = sessionStore
    } = {}) {
        const context = sessionStoreRef.getTrainingContext?.();
        if (!context) throw makeBoundaryError('record-progress');
        const key = eventKey || createTrainingProgressEventKey(eventType, stepId, resultCode);
        return queueAttemptWrite(context.attemptId, async () => {
            let snapshot = attemptSnapshots.get(context.attemptId);
            if (!snapshot && typeof databaseRef.getTrainingAttemptBootstrap === 'function') {
                snapshot = await this.refreshAttemptSnapshot({ databaseRef, sessionStoreRef });
            }
            if (!snapshot) {
                snapshot = cacheAttemptSnapshot({
                    attempt_id: context.attemptId,
                    curriculum_version: context.curriculumVersion,
                    status: 'in_progress',
                    attempt_revision: 0,
                    completed_step_ids: [],
                    mastered_step_ids: []
                });
            }
            if (eventType === 'mastery_passed' && snapshot.masteredStepIds.includes(stepId)) {
                return Object.freeze({ idempotent: true, snapshot });
            }
            const isOptimisticProgress = ['step_completed', 'mastery_passed'].includes(eventType);
            const optimisticSnapshot = isOptimisticProgress
                ? cacheAttemptSnapshot(projectAttemptSnapshot(snapshot, { eventType, stepId, resultCode }))
                : snapshot;
            let writeAccepted = false;
            try {
                const result = await databaseRef.recordTrainingProgressEvent({
                    attemptId: context.attemptId,
                    eventType,
                    stepId,
                    resultCode,
                    eventKey: key,
                    expectedRevision: snapshot.revision
                });
                writeAccepted = true;
                const serverRevision = Number(result?.attempt_revision);
                const next = result?.mastered_step_ids || result?.completed_step_ids
                    ? normalizeTrainingAttemptSnapshot({
                        attempt_id: context.attemptId,
                        curriculum_version: context.curriculumVersion,
                        status: result.attempt_status || result.status || snapshot.status,
                        attempt_revision: result.attempt_revision,
                        current_step_id: result.current_step_id || snapshot.currentStepId,
                        completed_step_ids: result.completed_step_ids || snapshot.completedStepIds,
                        mastered_step_ids: result.mastered_step_ids || snapshot.masteredStepIds
                    })
                    : projectAttemptSnapshot(snapshot, {
                        eventType,
                        stepId,
                        resultCode,
                        revision: Number.isSafeInteger(serverRevision) ? serverRevision : snapshot.revision + 1,
                        status: result?.attempt_status
                    });
                const reconciled = reconcileTrainingProgress(optimisticSnapshot, next);
                cacheAttemptSnapshot(reconciled);
                return Object.freeze({ ...result, snapshot: reconciled });
            } catch (error) {
                if (error?.code === 'TRAINING_REVISION_CONFLICT' || error?.code === '40001') {
                    const fresh = await this.refreshAttemptSnapshot({ databaseRef, sessionStoreRef });
                    const alreadyApplied = eventType === 'mastery_passed'
                        && fresh.masteredStepIds.includes(stepId);
                    if (alreadyApplied) return Object.freeze({ idempotent: true, snapshot: fresh });
                }
                if (!writeAccepted && attemptSnapshots.get(context.attemptId)?.revision === optimisticSnapshot.revision) {
                    cacheAttemptSnapshot(snapshot);
                }
                emitTrainingTelemetry('failure', context, {
                    stepId,
                    reasonCode: error?.code === 'TRAINING_REVISION_CONFLICT'
                        ? 'revision_conflict'
                        : ['TRAINING_ATTEMPT_MISMATCH', 'TRAINING_STALE_SERVER_REVISION'].includes(error?.code)
                            ? 'progress_reconcile_failed'
                            : 'progress_write_failed',
                    revision: snapshot.revision
                });
                throw error;
            }
        });
    },

    async recordMastery({ step, evidence, passed = true } = {}, options = {}) {
        const sessionStoreRef = options.sessionStoreRef || sessionStore;
        const context = sessionStoreRef.getTrainingContext?.();
        const module = context ? getTrainingModule(context.semanticRole, context.team) : null;
        const catalogStep = module?.steps?.find((entry) => entry.id === step?.id);
        if (!context || !catalogStep || catalogStep !== step) {
            throw makeBoundaryError('record-mastery');
        }
        const observed = getMasteryEvidenceResult(catalogStep, evidence);
        const masteryPassed = passed === true && observed;
        const eventType = masteryPassed ? 'mastery_passed' : 'mastery_failed';
        const currentSnapshot = this.getAttemptSnapshot(context.attemptId, { sessionStoreRef });
        const suffix = masteryPassed ? 'passed' : `failed-${(currentSnapshot?.revision || 0) + 1}`;
        const result = await this.recordProgress({
            eventType,
            stepId: catalogStep.id,
            resultCode: masteryPassed ? 'passed' : 'failed',
            eventKey: createTrainingProgressEventKey(eventType, catalogStep.id, suffix)
        }, options);
        emitTrainingTelemetry('step_mastery', context, {
            stepId: catalogStep.id,
            resultCode: masteryPassed ? 'passed' : 'failed',
            revision: result.snapshot?.revision
        });
        return Object.freeze({ ...result, passed: masteryPassed });
    },

    async recordMediaDegradation(stepId, reasonCode = 'audio_unavailable', options = {}) {
        const sessionStoreRef = options.sessionStoreRef || sessionStore;
        const context = sessionStoreRef.getTrainingContext?.();
        if (!context) return null;
        const result = await this.recordProgress({
            eventType: 'media_degraded',
            stepId,
            resultCode: 'degraded',
            eventKey: createTrainingProgressEventKey('media_degraded', stepId, reasonCode)
        }, options);
        emitTrainingTelemetry('media_degradation', context, {
            stepId,
            resultCode: 'degraded',
            reasonCode,
            revision: result.snapshot?.revision
        });
        return result;
    },

    async completeAttempt(options = {}) {
        const sessionStoreRef = options.sessionStoreRef || sessionStore;
        const context = sessionStoreRef.getTrainingContext?.();
        const module = context ? getTrainingModule(context.semanticRole, context.team) : null;
        const snapshot = context ? this.getAttemptSnapshot(context.attemptId, { sessionStoreRef }) : null;
        if (!context || !module || !snapshot || module.steps.some((step) => !snapshot.masteredStepIds.includes(step.id))) {
            throw makeBoundaryError('complete-training-attempt');
        }
        const result = await this.recordProgress({
            eventType: 'attempt_completed',
            stepId: module.steps.at(-1).id,
            resultCode: 'completed',
            eventKey: createTrainingProgressEventKey('attempt_completed', module.id, 'completed')
        }, options);
        emitTrainingTelemetry('completion', context, {
            resultCode: 'completed',
            revision: result.snapshot?.revision
        });
        return result;
    },

    async resetAttempt({
        databaseRef = database,
        sessionStoreRef = sessionStore,
        navigateRef = navigateToApp,
        documentRef = typeof document !== 'undefined' ? document : null
    } = {}) {
        const context = sessionStoreRef.getTrainingContext?.();
        const snapshot = context ? this.getAttemptSnapshot(context.attemptId, { sessionStoreRef }) : null;
        if (!context || !snapshot) throw makeBoundaryError('reset-training-attempt');
        const bootstrap = await databaseRef.resetTrainingAttempt({
            attemptId: context.attemptId,
            expectedRevision: snapshot.revision
        });
        const nextContext = createTrainingContextFromBootstrap(bootstrap);
        if (!nextContext || !trainingContextsMatch(context, nextContext)) {
            throw makeBoundaryError('reset-training-attempt');
        }
        practiceStates.delete(context.attemptId);
        attemptSnapshots.delete(context.attemptId);
        cacheAttemptSnapshot(bootstrap);
        sessionStoreRef.setTrainingContext(nextContext, { serverValidated: true });
        emitTrainingTelemetry('reset', nextContext, { revision: 0 });
        const EventConstructor = documentRef?.defaultView?.CustomEvent
            || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
        if (EventConstructor) documentRef?.dispatchEvent?.(new EventConstructor('training:reset'));
        navigateRef(getTrainingRoleRoute(nextContext.team, nextContext.semanticRole), { replace: true });
        return bootstrap;
    },

    async startAnotherRole(options = {}) {
        const sessionStoreRef = options.sessionStoreRef || sessionStore;
        const context = sessionStoreRef.getTrainingContext?.();
        if (context && ['in_progress', 'completed'].includes(
            this.getAttemptSnapshot(context.attemptId, { sessionStoreRef })?.status
        )) {
            await this.recordProgress({
                eventType: 'role_switched',
                resultCode: 'completed',
                eventKey: createTrainingProgressEventKey('role_switched', null, 'profile-picker')
            }, options);
            emitTrainingTelemetry('role_switch', context, { resultCode: 'completed' });
        }
        this.exitTraining(options);
    },

    getPracticeState({ sessionStoreRef = sessionStore } = {}) {
        const context = sessionStoreRef.getTrainingContext?.();
        if (!context || !['scribe', 'facilitator', 'notetaker'].includes(context.semanticRole)) {
            return null;
        }
        return clonePracticeState(getPracticeState(context));
    },

    resetPracticeState({ sessionStoreRef = sessionStore } = {}) {
        const context = sessionStoreRef.getTrainingContext?.();
        if (!context || !['scribe', 'facilitator', 'notetaker'].includes(context.semanticRole)) {
            return null;
        }
        practiceStates.delete(context.attemptId);
        return clonePracticeState(getPracticeState(context));
    },

    async executeCommand(command, payload, {
        databaseRef = database,
        sessionStoreRef = sessionStore
    } = {}) {
        const context = sessionStoreRef.getTrainingContext?.();
        const parsed = context ? parseTrainingCommand(command, context) : null;
        if (!context || !parsed) {
            throw makeBoundaryError(command || 'training-command');
        }

        const safePayload = clonePracticePayload(payload, command);
        const fixtureBundle = getTrainingProfileFixtureBundle(context.team, context.semanticRole);
        if (!fixtureBundle) {
            throw makeBoundaryError(command);
        }

        const nextState = cloneFixture(getPracticeState(context));
        if (context.semanticRole === 'scribe') {
            if (!safePayload.artifact || typeof safePayload.artifact !== 'object') {
                throw makeBoundaryError(command);
            }
            applyScribeCommand(nextState, parsed.suffix, safePayload, fixtureBundle);
        } else if (context.semanticRole === 'facilitator') {
            applyFacilitatorCommand(nextState, parsed.suffix, safePayload, fixtureBundle);
        } else {
            applyNotetakerCommand(nextState, parsed.suffix, safePayload);
        }

        const module = getTrainingModule(context.semanticRole, context.team);
        const step = module?.steps?.find((entry) => entry.stage === parsed.definition.stage);
        if (!step) throw makeBoundaryError(command);
        if (parsed.definition.eventType === 'step_completed') {
            const evidence = buildRuntimeMasteryEvidence(step, command, safePayload);
            if (!evidence) throw makeBoundaryError(command);
            const mastery = await this.recordMastery(
                { step, evidence, passed: true },
                { databaseRef, sessionStoreRef }
            );
            if (!mastery.passed) throw makeBoundaryError(command);
        } else {
            await this.recordProgress({
                eventType: parsed.definition.eventType,
                stepId: step.id,
                resultCode: parsed.definition.resultCode,
                eventKey: createTrainingProgressEventKey(parsed.definition.eventType, step.id, parsed.suffix)
            }, { databaseRef, sessionStoreRef });
        }

        practiceStates.set(context.attemptId, nextState);
        return clonePracticeState(nextState);
    },

    exitTraining({
        sessionStoreRef = sessionStore,
        navigateRef = navigateToApp,
        documentRef = typeof document !== 'undefined' ? document : null
    } = {}) {
        const context = sessionStoreRef.getTrainingContext?.({ requireServerValidation: false });
        if (context?.attemptId) {
            practiceStates.delete(context.attemptId);
            attemptSnapshots.delete(context.attemptId);
            attemptWriteQueues.delete(context.attemptId);
        }
        const EventConstructor = documentRef?.defaultView?.CustomEvent
            || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
        if (EventConstructor) {
            documentRef?.dispatchEvent?.(new EventConstructor('training:exit'));
        }
        sessionStoreRef.clear();
        navigateRef('');
    }
};

export { FACILITATOR_COMMANDS, NOTETAKER_COMMANDS, SCRIBE_COMMANDS };

export default trainingRuntime;
