import { navigateToApp } from '../../core/navigation.js';
import { database } from '../../services/database.js';
import { sessionStore } from '../../stores/session.js';
import { showToast } from '../../components/ui/Toast.js';
import { DatabaseError } from '../../core/errors.js';
import { getBlueActionViewModel } from '../actions/blueActionDetails.js';
import { TRAINING_CURRICULUM, getTrainingModule } from './content/curriculum.js';
import { getTrainingProfileFixtureBundle } from './content/fixtures.js';
import { showTrainingIntroModal } from './TrainingIntroModal.js';
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
    [FACILITATOR_COMMANDS.PROPOSAL_NEGOTIATED]: Object.freeze({ stage: 'respond', eventType: 'step_completed', resultCode: 'completed' }),
    [FACILITATOR_COMMANDS.ARTIFACT_SUBMITTED]: Object.freeze({ stage: 'retrieve', eventType: 'step_completed', resultCode: 'completed' }),
    [FACILITATOR_COMMANDS.RECEIPT_VERIFIED]: Object.freeze({ stage: 'reflect', eventType: 'step_completed', resultCode: 'completed' })
});
const FACILITATOR_WORKSPACES = Object.freeze(['actions', 'deck', 'rfis', 'communications', 'notifications']);
const TRAINING_PRACTICE_PAYLOAD_LIMIT = 32 * 1024;
const practiceStates = new Map();

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
        : buildEmptyScribePracticeState(context);
    practiceStates.set(context.attemptId, created);
    return created;
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

function parseTrainingCommand(command, context) {
    return parseScribeCommand(command, context) || parseFacilitatorCommand(command, context);
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

export function getScribeTrainingCommand(team, suffix) {
    if (!SCRIBE_COMMAND_DEFINITIONS[suffix]) return null;
    return `scribe.${team}.${suffix}`;
}

export function getFacilitatorTrainingCommand(team, suffix) {
    if (!FACILITATOR_COMMAND_DEFINITIONS[suffix]) return null;
    return `facilitator.${team}.${suffix}`;
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
    const resetHelp = createElement(
        documentRef,
        'span',
        'sr-only',
        'Reset will be enabled when attempt reset is implemented.'
    );
    resetHelp.id = 'trainingResetHelp';

    const resetButton = createElement(documentRef, 'button', 'btn btn-secondary btn-sm', 'Reset');
    resetButton.type = 'button';
    resetButton.id = 'trainingResetBtn';
    resetButton.disabled = true;
    resetButton.setAttribute('aria-describedby', resetHelp.id);

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

        const bootstrap = await databaseRef.startOrResumeTrainingAttempt({
            code,
            semanticRole,
            team,
            curriculumVersion
        });
        const context = createTrainingContextFromBootstrap(bootstrap);
        if (!context || context.curriculumVersion !== TRAINING_CURRICULUM.version) {
            throw makeBoundaryError('activateTrainingBootstrap');
        }

        const role = getTrainingRole(context.team, context.semanticRole);
        sessionStoreRef.clear();
        sessionStoreRef.setTrainingContext(context, { serverValidated: true });
        sessionStoreRef.setRole(role);
        sessionStoreRef.setUserName(displayName);

        return {
            bootstrap,
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
        if (
            !serverContext
            || serverContext.curriculumVersion !== TRAINING_CURRICULUM.version
            || !trainingContextsMatch(storedContext, serverContext)
        ) {
            sessionStoreRef.clearTrainingContext?.();
            throw makeBoundaryError('revalidateTrainingAttempt');
        }

        sessionStoreRef.setTrainingContext(serverContext, { serverValidated: true });
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
        showTrainingIntroModalRef = showTrainingIntroModal
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
                onReplayIntro: () => openIntro({ forceReplay: true })
            });
            documentRef?.querySelectorAll?.('[data-write-control]')?.forEach?.((control) => {
                control.disabled = true;
                control.setAttribute?.('aria-describedby', 'trainingSandboxBanner');
                control.title = 'Live write controls are unavailable in the training sandbox.';
            });
            const fixtures = hydrateTrainingFixtures(context);
            const fixtureBundle = getTrainingProfileFixtureBundle(context.team, context.semanticRole);

            openIntro();

            return { active: true, context, fixtures, fixtureBundle };
        } catch (_error) {
            sessionStoreRef.clearTrainingContext?.();
            showToastRef({ message: TRAINING_RECOVERY_MESSAGE, type: 'error' });
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

    getPracticeState({ sessionStoreRef = sessionStore } = {}) {
        const context = sessionStoreRef.getTrainingContext?.();
        if (!context || !['scribe', 'facilitator'].includes(context.semanticRole)) {
            return null;
        }
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
        } else {
            applyFacilitatorCommand(nextState, parsed.suffix, safePayload, fixtureBundle);
        }

        await this.executeWrite('record-progress', {
            eventType: parsed.definition.eventType,
            stepId: `training.v1.${context.semanticRole}.${context.team}.${parsed.definition.stage}`,
            resultCode: parsed.definition.resultCode
        }, { databaseRef, sessionStoreRef });

        practiceStates.set(context.attemptId, nextState);
        return clonePracticeState(nextState);
    },

    exitTraining({
        sessionStoreRef = sessionStore,
        navigateRef = navigateToApp,
        documentRef = typeof document !== 'undefined' ? document : null
    } = {}) {
        const context = sessionStoreRef.getTrainingContext?.({ requireServerValidation: false });
        if (context?.attemptId) practiceStates.delete(context.attemptId);
        const EventConstructor = documentRef?.defaultView?.CustomEvent
            || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
        if (EventConstructor) {
            documentRef?.dispatchEvent?.(new EventConstructor('training:exit'));
        }
        sessionStoreRef.clear();
        navigateRef('');
    }
};

export { FACILITATOR_COMMANDS, SCRIBE_COMMANDS };

export default trainingRuntime;
