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

                            const walkthroughStart = documentRef?.querySelector?.('main');
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
            if (context.team === 'blue' && context.semanticRole === 'scribe') {
                renderBlueScribePracticeArtifact({ documentRef, fixture: fixtures.actions[0] });
            }

            openIntro();

            return { active: true, context, fixtures };
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

    exitTraining({
        sessionStoreRef = sessionStore,
        navigateRef = navigateToApp,
        documentRef = typeof document !== 'undefined' ? document : null
    } = {}) {
        const EventConstructor = documentRef?.defaultView?.CustomEvent
            || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
        if (EventConstructor) {
            documentRef?.dispatchEvent?.(new EventConstructor('training:exit'));
        }
        sessionStoreRef.clear();
        navigateRef('');
    }
};

export default trainingRuntime;
