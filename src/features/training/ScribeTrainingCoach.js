import { TrainingAudioController } from './TrainingAudioController.js';
import { getTrainingModule } from './content/curriculum.js';
import { TrainingCoach } from './TrainingCoach.js';
import { trainingRuntime } from './trainingRuntime.js';

const TEAM_ARTIFACTS = Object.freeze({
    blue: Object.freeze({
        label: 'Structured Blue action',
        guidance: 'Connect the objective, instruments of power, sectors, supply-chain choices, implementation, countries, and expected outcomes.'
    }),
    red: Object.freeze({
        label: 'Red Move Response',
        guidance: 'State the assessment, response strategy, key actions, targets or pressure points, a concrete delivery mechanism, and expected effect.'
    }),
    green: Object.freeze({
        label: 'Green multi-partner proposal',
        guidance: 'Choose Green originators, intended Blue or Red partners, focus sectors, the conditional supply-chain fields, timing, and outcomes.'
    }),
    industry: Object.freeze({
        label: 'Industry proposal',
        guidance: 'Record Industry of Focus, Country of Focus, Proposed Activity, intended partners, sectors, conditional supply-chain fields, timing, and outcomes.'
    })
});

function createElement(documentRef, tagName, className = '', text = '') {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function appendText(documentRef, parent, tagName, className, text) {
    const element = createElement(documentRef, tagName, className, text);
    parent.appendChild(element);
    return element;
}

function makeButton(documentRef, text, onClick, variant = 'primary') {
    const button = createElement(documentRef, 'button', `btn btn-${variant}`, text);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
}

function readHeaderContext(documentRef) {
    return {
        move: documentRef.getElementById?.('headerMove')?.textContent?.trim() || '1',
        phase: documentRef.getElementById?.('headerPhase')?.textContent?.trim() || 'Internal Deliberation',
        timer: documentRef.getElementById?.('timerDisplay')?.textContent?.trim() || '90:00',
        timerStatus: documentRef.getElementById?.('timerStatus')?.textContent?.trim() || 'Paused'
    };
}

export function getScribeTrainingArtifactDescriptor(team) {
    return TEAM_ARTIFACTS[team] || null;
}

export function shouldMountScribeTrainingCoach(activation, expectedTeam) {
    const context = activation?.context;
    return Boolean(
        activation?.active === true
        && context?.trainingMode === true
        && context.semanticRole === 'scribe'
        && context.team === expectedTeam
        && TEAM_ARTIFACTS[context.team]
    );
}

export function mountScribeTrainingCoach({
    activation,
    documentRef = typeof document !== 'undefined' ? document : null,
    onOpenOrientation = () => {},
    onOpenArtifact = () => {},
    onNavigate = () => {},
    renderLifecycleBadge = () => '',
    runtimeRef = trainingRuntime,
    AudioController = TrainingAudioController
} = {}) {
    const context = activation?.context;
    const fixtureBundle = activation?.fixtureBundle;
    const module = context ? getTrainingModule('scribe', context.team) : null;
    const descriptor = context ? getScribeTrainingArtifactDescriptor(context.team) : null;
    const host = documentRef?.querySelector?.('.page-container') || documentRef?.querySelector?.('main');
    if (!host || !module || !descriptor || !fixtureBundle) return null;

    documentRef.getElementById?.('scribeTrainingCoach')?.remove?.();
    const root = createElement(documentRef, 'section', 'training-coach');
    root.id = 'scribeTrainingCoach';
    root.tabIndex = -1;
    root.setAttribute('aria-labelledby', 'scribeTrainingCoachTitle');
    root.dataset.trainingTeam = context.team;

    const header = createElement(documentRef, 'div', 'training-coach__header');
    const headingGroup = createElement(documentRef, 'div');
    const title = appendText(documentRef, headingGroup, 'h2', 'training-coach__title', `${context.team[0].toUpperCase()}${context.team.slice(1)} Scribe coach`);
    title.id = 'scribeTrainingCoachTitle';
    header.appendChild(headingGroup);

    const audioHost = createElement(documentRef, 'div', 'training-coach__audio');

    const lesson = createElement(documentRef, 'section', 'training-coach__lesson');
    lesson.setAttribute('aria-live', 'polite');
    lesson.setAttribute('aria-atomic', 'true');
    const feedback = createElement(documentRef, 'p', 'training-coach__feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true');
    root.append(header, audioHost, lesson, feedback);
    host.insertBefore(root, host.firstChild || null);

    let degradedClipId = null;
    const audio = new AudioController({
        documentRef,
        windowRef: documentRef.defaultView,
        onStateChange: (audioState) => {
            if (!['degraded', 'unavailable'].includes(audioState?.status) || !audioState.clipId || degradedClipId === audioState.clipId) return;
            degradedClipId = audioState.clipId;
            const degradationWrite = runtimeRef.recordMediaDegradation?.(
                audioState.clipId,
                'audio_unavailable'
            );
            if (degradationWrite?.catch) void degradationWrite.catch(() => {});
        }
    });
    audio.mountControls(audioHost, { documentRef, compact: true });

    const initialPracticeState = runtimeRef.getPracticeState?.() || null;
    const state = {
        stepIndex: 0,
        status: initialPracticeState?.artifactState || 'empty',
        practiceState: initialPracticeState,
        retryMessage: '',
        completed: runtimeRef.getAttemptSnapshot?.(context.attemptId)?.status === 'completed'
    };

    const coach = new TrainingCoach({
        root,
        module,
        context,
        runtimeRef,
        lessonHost: lesson,
        feedbackHost: feedback,
        documentRef,
        onStepChange: (stepIndex) => {
            state.stepIndex = stepIndex;
            state.retryMessage = '';
            render();
        },
        onReset: () => runtimeRef.resetAttempt(),
        onStartAnotherRole: () => runtimeRef.startAnotherRole()
    });
    state.stepIndex = coach.getResumeIndex();

    const setRetry = (message) => {
        state.status = 'retry';
        state.retryMessage = String(message || 'Review the highlighted field and try again.');
        feedback.textContent = `Try again: ${state.retryMessage}`;
        render();
    };

    const advance = (stepIndex, message = '') => {
        coach.requireMastery(module.steps[Math.max(0, stepIndex - 1)]);
        state.stepIndex = Math.min(stepIndex, module.steps.length - 1);
        if (state.status === 'retry') {
            state.status = state.practiceState?.artifactState || 'empty';
        }
        state.retryMessage = '';
        feedback.textContent = message;
        render();
    };

    const renderStateBadge = (container, lifecycleState) => {
        const markup = renderLifecycleBadge(lifecycleState);
        if (!markup) return;
        const wrapper = createElement(documentRef, 'span', 'training-coach__lifecycle');
        wrapper.innerHTML = markup;
        container.appendChild(wrapper);
    };

    const renderContext = (container) => {
        const current = readHeaderContext(documentRef);
        const grid = createElement(documentRef, 'dl', 'training-coach__context');
        [
            ['Move', current.move],
            ['Phase', current.phase],
            ['Timer', `${current.timer} — ${current.timerStatus}`],
            ['Handoff', 'Scribe → Facilitator → White Cell']
        ].forEach(([term, value]) => {
            appendText(documentRef, grid, 'dt', '', term);
            appendText(documentRef, grid, 'dd', '', value);
        });
        container.appendChild(grid);
    };

    const renderArtifactStatus = (container) => {
        const status = createElement(documentRef, 'div', 'training-coach__artifact-state');
        if (state.status === 'empty') {
            appendText(documentRef, status, 'h4', '', 'No practice artifact yet');
            appendText(documentRef, status, 'p', 'text-sm', 'Complete Strategic Orientation before drafting the move artifact.');
        } else if (state.practiceState?.artifactState === 'draft') {
            appendText(documentRef, status, 'h4', '', `${descriptor.label} draft`);
            renderStateBadge(status, 'draft');
            appendText(documentRef, status, 'p', 'text-sm', 'The draft remains inside this training attempt. It has not reached the Facilitator.');
        }
        container.appendChild(status);
    };

    const renderOrient = (container) => {
        renderContext(container);
        container.appendChild(makeButton(documentRef, 'I understand the Scribe handoff', async () => {
            try {
                await coach.recordMastery({
                    step: module.steps[0],
                    evidence: { eventKey: module.steps[0].masteryPredicate.eventKey }
                });
                advance(1, module.steps[0].correctFeedback);
            } catch (error) {
                setRetry(error.message);
            }
        }));
    };

    const renderShow = (container) => {
        container.appendChild(makeButton(documentRef, 'Open Strategic Orientation', () => {
            onOpenOrientation({
                onComplete: (practiceState) => {
                    state.practiceState = practiceState;
                    state.status = 'empty';
                    advance(2, module.steps[1].correctFeedback);
                },
                onRetry: setRetry
            });
        }));
    };

    const renderGuide = (container) => {
        appendText(documentRef, container, 'h4', '', `Worked example: ${descriptor.label}`);
        appendText(documentRef, container, 'p', '', fixtureBundle.artifact.goal);
        appendText(documentRef, container, 'p', 'text-sm', descriptor.guidance);
        container.appendChild(makeButton(documentRef, 'Start my practice artifact', async () => {
            try {
                await coach.recordMastery({
                    step: module.steps[2],
                    evidence: { eventKey: module.steps[2].masteryPredicate.eventKey }
                });
                advance(3, module.steps[2].correctFeedback);
            } catch (error) {
                setRetry(error.message);
            }
        }));
    };

    const renderPractice = (container) => {
        renderArtifactStatus(container);
        appendText(documentRef, container, 'p', '', 'Save a Draft first. Then reopen it, resolve any validation feedback, and use Forward to Facilitator.');
        container.appendChild(makeButton(
            documentRef,
            state.practiceState?.artifactState === 'draft' ? 'Continue draft' : `Draft ${descriptor.label}`,
            () => {
                onOpenArtifact({
                    mode: state.practiceState?.artifactState === 'draft' ? 'draft' : 'new',
                    practiceState: state.practiceState,
                    onDraft: (practiceState) => {
                        state.practiceState = practiceState;
                        state.status = 'draft';
                        feedback.textContent = 'Draft saved in the isolated training attempt.';
                        render();
                    },
                    onForward: (practiceState) => {
                        state.practiceState = practiceState;
                        state.status = 'returned';
                        advance(4, module.steps[3].correctFeedback);
                    },
                    onRetry: setRetry
                });
            }
        ));
    };

    const renderRespond = (container) => {
        const returned = createElement(documentRef, 'article', 'training-coach__returned');
        returned.dataset.trainingState = 'returned-dummy-artifact';
        appendText(documentRef, returned, 'h4', '', 'Returned training artifact');
        renderStateBadge(returned, 'returned');
        appendText(documentRef, returned, 'p', 'text-sm', `Simulated Facilitator receipt: ${state.practiceState?.facilitatorReceipt?.visibleLabel || 'Artifact received.'}`);
        appendText(documentRef, returned, 'p', 'text-sm', `Simulated White Cell / Facilitator return: ${state.practiceState?.returnedArtifact?.review_notes || 'Clarify the timing and observable outcome.'}`);
        appendText(documentRef, returned, 'p', 'text-sm', 'This is deterministic instructional feedback. It does not create a White Cell review record.');
        container.appendChild(returned);
        container.appendChild(makeButton(documentRef, 'Revise the same artifact', () => {
            onOpenArtifact({
                mode: 'revision',
                practiceState: state.practiceState,
                onForward: (practiceState) => {
                    state.practiceState = practiceState;
                    state.status = 'completed';
                    advance(5, module.steps[4].correctFeedback);
                },
                onRetry: setRetry
            });
        }));
    };

    const renderRetrieve = (container) => {
        const form = createElement(documentRef, 'form', 'training-coach__retrieval');
        const fieldset = createElement(documentRef, 'fieldset', 'form-group');
        appendText(documentRef, fieldset, 'legend', 'form-label', 'The artifact is complete. What does the Scribe do next?');
        [
            ['save-draft', 'Save Draft'],
            ['forward-to-facilitator', 'Forward to Facilitator'],
            ['submit-to-white-cell', 'Submit to White Cell']
        ].forEach(([value, label], index) => {
            const row = createElement(documentRef, 'label', 'form-check');
            const input = createElement(documentRef, 'input', 'form-radio');
            input.type = 'radio';
            input.name = 'scribeTrainingRetrieval';
            input.value = value;
            input.id = `scribeTrainingRetrieval-${index}`;
            row.htmlFor = input.id;
            row.append(input, createElement(documentRef, 'span', 'form-check-label', label));
            fieldset.appendChild(row);
        });
        const checkButton = makeButton(documentRef, 'Check answer', () => {}, 'primary');
        checkButton.type = 'submit';
        form.append(fieldset, checkButton);
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const answer = form.querySelector('[name="scribeTrainingRetrieval"]:checked')?.value || '';
            if (answer !== 'forward-to-facilitator') {
                void coach.recordMastery({
                    step: module.steps[5],
                    evidence: { optionId: answer },
                    passed: false
                }).catch(() => {});
                setRetry(module.steps[5].retryFeedback);
                return;
            }
            void coach.recordMastery({
                step: module.steps[5],
                evidence: { optionId: answer }
            }).then(() => advance(6, module.steps[5].correctFeedback)).catch((error) => setRetry(error.message));
        });
        container.appendChild(form);
    };

    const renderReflect = (container) => {
        onNavigate('timeline');
        coach.updateTargetSpotlight(module.steps[6], { shouldScroll: true });
        renderStateBadge(container, 'completed');
        container.appendChild(makeButton(documentRef, 'Complete Scribe practice', async () => {
            try {
                await coach.recordMastery({
                    step: module.steps[6],
                    evidence: { eventKey: module.steps[6].masteryPredicate.eventKey }
                });
                await runtimeRef.completeAttempt();
                state.completed = true;
                feedback.textContent = 'Scribe learning path completed in this training attempt.';
                render();
            } catch (error) {
                setRetry(error.message);
            }
        }));
    };

    function render() {
        lesson.replaceChildren();
        const step = module.steps[state.stepIndex];
        coach.refreshSnapshot();
        coach.renderStep(state.stepIndex);
        void audio.setClip(step.id, {
            nextClipId: module.steps[state.stepIndex + 1]?.id || null,
            autoplay: audio.isAutoplayEnabled()
        });

        if (state.completed) {
            void coach.renderCompletion(lesson);
            return;
        }

        lesson.dataset.trainingState = state.status === 'retry' ? 'retry' : state.status;
        if (state.retryMessage) appendText(documentRef, lesson, 'p', 'form-error', state.retryMessage);

        [renderOrient, renderShow, renderGuide, renderPractice, renderRespond, renderRetrieve, renderReflect][state.stepIndex](lesson);
    }

    const handleExit = () => destroy();
    documentRef.addEventListener?.('training:exit', handleExit);

    function destroy() {
        coach.destroy();
        audio.destroy();
        documentRef.removeEventListener?.('training:exit', handleExit);
        root.remove?.();
    }

    render();
    return Object.freeze({ root, destroy, getState: () => ({ ...state }) });
}

export default mountScribeTrainingCoach;
