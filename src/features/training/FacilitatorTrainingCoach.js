import { TrainingAudioController } from './TrainingAudioController.js';
import { TrainingCoach } from './TrainingCoach.js';
import { getTrainingModule } from './content/curriculum.js';
import {
    FACILITATOR_COMMANDS,
    getFacilitatorTrainingCommand,
    trainingRuntime
} from './trainingRuntime.js';

const TEAM_ARTIFACT_LABELS = Object.freeze({
    blue: 'Structured Blue Action',
    red: 'Red Move Response',
    green: 'Green multi-partner proposal',
    industry: 'Industry proposal'
});

export const FACILITATOR_TRAINING_SELECTOR_CONTRACT = Object.freeze({
    actions: '#teamActionReviewViewBtn',
    deck: '#deckViewBtn',
    rfis: '#rfiViewBtn',
    communications: '#communicationsViewBtn',
    notifications: '#notificationsViewBtn',
    present: '#presentBtn',
    workspace: '#facilitatorWorkspacePanel'
});

const WORKSPACE_SEQUENCE = Object.freeze(['actions', 'deck', 'rfis', 'communications', 'notifications']);
const WORKSPACE_LABELS = Object.freeze({
    actions: 'Team Action Review',
    deck: 'Deck',
    rfis: 'RFIs',
    communications: 'Communications',
    notifications: 'Notifications'
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

function appendLabeledInput(documentRef, parent, {
    id,
    label,
    value = '',
    multiline = false,
    help = ''
}) {
    const group = createElement(documentRef, 'div', 'form-group');
    const labelElement = appendText(documentRef, group, 'label', 'form-label', label);
    labelElement.htmlFor = id;
    const input = createElement(documentRef, multiline ? 'textarea' : 'input', 'form-input');
    input.id = id;
    input.value = value;
    input.required = true;
    if (multiline) input.rows = 4;
    group.appendChild(input);
    if (help) {
        const helpId = `${id}-help`;
        const hint = appendText(documentRef, group, 'p', 'form-hint', help);
        hint.id = helpId;
        input.setAttribute('aria-describedby', helpId);
    }
    parent.appendChild(group);
    return input;
}

function initialStepIndex(practiceState) {
    if (practiceState?.receiptVerified || practiceState?.submissionReceipt) return 6;
    if (practiceState?.responseClassified) return 4;
    if (practiceState?.rfiAnswer) return 4;
    if (practiceState?.projected) return 3;
    if (practiceState?.workspacesVisited?.length === WORKSPACE_SEQUENCE.length) return 2;
    if (practiceState?.artifactReviewed) return 1;
    return 0;
}

export function shouldMountFacilitatorTrainingCoach(activation, expectedTeam) {
    const context = activation?.context;
    return Boolean(
        activation?.active === true
        && context?.trainingMode === true
        && context.semanticRole === 'facilitator'
        && context.team === expectedTeam
        && TEAM_ARTIFACT_LABELS[context.team]
    );
}

export function mountFacilitatorTrainingCoach({
    activation,
    documentRef = typeof document !== 'undefined' ? document : null,
    onNavigate = () => {},
    onReviewArtifact = () => {},
    onProjectArtifact = () => {},
    onStateChange = () => {},
    renderLifecycleBadge = () => '',
    runtimeRef = trainingRuntime,
    AudioController = TrainingAudioController
} = {}) {
    const context = activation?.context;
    const fixtureBundle = activation?.fixtureBundle;
    const module = context ? getTrainingModule('facilitator', context.team) : null;
    const host = documentRef?.querySelector?.('.scribe-main') || documentRef?.querySelector?.('main');
    if (!host || !module || !fixtureBundle) return null;

    documentRef.getElementById?.('facilitatorTrainingCoach')?.remove?.();
    const root = createElement(documentRef, 'section', 'training-coach facilitator-training-coach');
    root.id = 'facilitatorTrainingCoach';
    root.tabIndex = -1;
    root.dataset.trainingTeam = context.team;
    root.setAttribute('aria-labelledby', 'facilitatorTrainingCoachTitle');

    const header = createElement(documentRef, 'div', 'training-coach__header');
    const headingGroup = createElement(documentRef, 'div');
    const title = appendText(
        documentRef,
        headingGroup,
        'h2',
        'training-coach__title',
        `${context.team[0].toUpperCase()}${context.team.slice(1)} Facilitator coach`
    );
    title.id = 'facilitatorTrainingCoachTitle';
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
        stepIndex: initialStepIndex(initialPracticeState),
        practiceState: initialPracticeState,
        workspaceVisits: new Set(initialPracticeState?.workspacesVisited || []),
        retryMessage: '',
        completed: runtimeRef.getAttemptSnapshot?.(context.attemptId)?.status === 'completed'
            || Boolean(initialPracticeState?.receiptVerified),
        busy: false
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

    const setFeedback = (message = '') => {
        state.retryMessage = '';
        feedback.textContent = message;
    };

    const setRetry = (message) => {
        state.retryMessage = String(message || 'Review the required fields and try again.');
        feedback.textContent = `Try again: ${state.retryMessage}`;
        render();
    };

    const execute = async (suffix, payload) => {
        if (state.busy) return null;
        state.busy = true;
        try {
            const command = getFacilitatorTrainingCommand(context.team, suffix);
            if (!command) throw new Error('Unsupported Facilitator training command.');
            const nextState = await runtimeRef.executeCommand(command, payload);
            state.practiceState = nextState;
            onStateChange(nextState);
            return nextState;
        } finally {
            state.busy = false;
        }
    };

    const advance = (index, message = '') => {
        coach.requireMastery(module.steps[Math.max(0, index - 1)]);
        state.stepIndex = Math.min(index, module.steps.length - 1);
        setFeedback(message);
        render();
    };

    const appendLifecycleBadge = (container, lifecycleState) => {
        const markup = renderLifecycleBadge(lifecycleState);
        if (!markup) return;
        const wrapper = createElement(documentRef, 'span', 'training-coach__lifecycle');
        wrapper.innerHTML = markup;
        container.appendChild(wrapper);
    };

    const renderArtifactSummary = (container) => {
        const artifact = state.practiceState?.artifact || fixtureBundle.artifact;
        const card = createElement(documentRef, 'article', 'training-coach__artifact-state');
        card.dataset.trainingArtifactId = artifact.id;
        appendText(documentRef, card, 'h4', '', TEAM_ARTIFACT_LABELS[context.team]);
        appendText(documentRef, card, 'p', '', artifact.goal);
        appendLifecycleBadge(card, state.practiceState?.artifactState || 'forwarded_to_facilitator');
        appendText(documentRef, card, 'p', 'text-sm', `Revision ${artifact.revision_number || 1} | Scribe handoff received | Next owner: Facilitator`);
        container.appendChild(card);
    };

    const renderOrient = (container) => {
        renderArtifactSummary(container);
        container.appendChild(makeButton(documentRef, 'Review forwarded artifact', async () => {
            onReviewArtifact(fixtureBundle.artifact.id);
            try {
                await execute(FACILITATOR_COMMANDS.ARTIFACT_REVIEWED, { artifactId: fixtureBundle.artifact.id });
                advance(1, module.steps[0].correctFeedback);
            } catch (_error) {
                setRetry(module.steps[0].retryFeedback);
            }
        }));
    };

    const renderShow = (container) => {
        const landmarks = createElement(documentRef, 'div', 'training-coach__landmarks');
        WORKSPACE_SEQUENCE.forEach((workspace) => {
            const visited = state.workspaceVisits.has(workspace);
            const button = makeButton(
                documentRef,
                `${visited ? 'Visited: ' : 'Open '}${WORKSPACE_LABELS[workspace]}`,
                () => {
                    onNavigate(workspace);
                    state.workspaceVisits.add(workspace);
                    render();
                },
                'secondary'
            );
            button.dataset.trainingWorkspace = workspace;
            landmarks.appendChild(button);
        });
        container.appendChild(landmarks);
        const restoreButton = makeButton(documentRef, 'Restore Team Action Review', async () => {
            onNavigate('actions');
            onReviewArtifact(fixtureBundle.artifact.id);
            try {
                await execute(FACILITATOR_COMMANDS.WORKSPACES_RESTORED, {
                    workspaces: [...state.workspaceVisits],
                    restoredWorkspace: 'actions'
                });
                advance(2, module.steps[1].correctFeedback);
            } catch (_error) {
                setRetry(module.steps[1].retryFeedback);
            }
        });
        restoreButton.disabled = !WORKSPACE_SEQUENCE.every((workspace) => state.workspaceVisits.has(workspace));
        container.appendChild(restoreButton);
    };

    const renderGuide = (container) => {
        renderArtifactSummary(container);
        appendText(documentRef, container, 'p', '', 'Project this exact artifact in Present mode. Exit Present with the header control or Escape; focus returns to this coach at the same step.');
        container.appendChild(makeButton(documentRef, 'Project artifact in Present mode', async (event) => {
            try {
                await execute(FACILITATOR_COMMANDS.ARTIFACT_PROJECTED, { artifactId: fixtureBundle.artifact.id });
                advance(3, module.steps[2].correctFeedback);
                onProjectArtifact({ artifactId: fixtureBundle.artifact.id, returnFocusTo: root, trigger: event.currentTarget });
            } catch (_error) {
                setRetry(module.steps[2].retryFeedback);
            }
        }));
    };

    const renderRfiPractice = (container) => {
        const currentRfi = state.practiceState?.rfi;
        if (!currentRfi) {
            const form = createElement(documentRef, 'form', 'training-coach__form');
            const question = appendLabeledInput(documentRef, form, {
                id: 'facilitatorTrainingRfiQuestion',
                label: 'Question for simulated White Cell',
                multiline: true,
                help: 'Ask one specific question. This remains inside the training attempt.'
            });
            const category = appendLabeledInput(documentRef, form, {
                id: 'facilitatorTrainingRfiCategory',
                label: 'RFI category',
                value: 'Implementation Timeline'
            });
            const submit = makeButton(documentRef, 'Submit training RFI', () => {}, 'primary');
            submit.type = 'submit';
            form.appendChild(submit);
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (!question.value.trim() || !category.value.trim()) {
                    setRetry('Enter a specific question and category.');
                    return;
                }
                try {
                    await execute(FACILITATOR_COMMANDS.RFI_CREATED, {
                        query: question.value,
                        categories: [category.value]
                    });
                    setFeedback('Simulated White Cell returned the same RFI for clarification.');
                    render();
                } catch (_error) {
                    setRetry(module.steps[3].retryFeedback);
                }
            });
            container.appendChild(form);
            return;
        }

        const returned = createElement(documentRef, 'article', 'training-coach__returned');
        returned.dataset.trainingState = currentRfi.workflow_state;
        appendText(documentRef, returned, 'h4', '', currentRfi.workflow_state === 'returned_to_team'
            ? 'Returned for clarification'
            : 'RFI answered');
        appendText(documentRef, returned, 'p', 'text-sm', `RFI ID: ${currentRfi.id} | Revision ${currentRfi.revision_number}`);
        appendText(documentRef, returned, 'p', '', currentRfi.workflow_state === 'returned_to_team'
            ? fixtureBundle.rfi.review_notes
            : fixtureBundle.rfiAnswer.response);
        container.appendChild(returned);

        if (currentRfi.workflow_state === 'returned_to_team') {
            const form = createElement(documentRef, 'form', 'training-coach__form');
            const question = appendLabeledInput(documentRef, form, {
                id: 'facilitatorTrainingRfiRevision',
                label: 'Clarified question',
                value: currentRfi.query,
                multiline: true,
                help: 'Edit and resubmit this same RFI ID; do not create a replacement.'
            });
            const submit = makeButton(documentRef, 'Edit and resubmit same RFI', () => {}, 'primary');
            submit.type = 'submit';
            form.appendChild(submit);
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                try {
                    await execute(FACILITATOR_COMMANDS.RFI_RESUBMITTED, {
                        rfiId: currentRfi.id,
                        query: question.value
                    });
                    advance(4, module.steps[3].correctFeedback);
                } catch (_error) {
                    setRetry(module.steps[3].retryFeedback);
                }
            });
            container.appendChild(form);
        }
    };

    const renderResponse = (container) => {
        appendText(documentRef, container, 'h4', '', 'Deterministic RFI answer');
        appendText(documentRef, container, 'p', '', state.practiceState?.rfiAnswer?.response || fixtureBundle.rfiAnswer.response);

        if (!state.practiceState?.outboundCommunication) {
            const form = createElement(documentRef, 'form', 'training-coach__form');
            const message = appendLabeledInput(documentRef, form, {
                id: 'facilitatorTrainingCommunication',
                label: 'Direct message to simulated White Cell',
                multiline: true,
                help: 'Keep it short. A direct message is not an informational team-action notification.'
            });
            message.maxLength = 2000;
            const submit = makeButton(documentRef, 'Send direct training message', () => {}, 'primary');
            submit.type = 'submit';
            form.appendChild(submit);
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                try {
                    await execute(FACILITATOR_COMMANDS.COMMUNICATION_SENT, { message: message.value });
                    setFeedback('Direct message saved inside this training attempt.');
                    render();
                } catch (_error) {
                    setRetry('Enter a short direct message before continuing.');
                }
            });
            container.appendChild(form);
            return;
        }

        if (!state.practiceState.responseClassified) {
            const form = createElement(documentRef, 'form', 'training-coach__retrieval');
            const fieldset = createElement(documentRef, 'fieldset', 'form-group');
            appendText(documentRef, fieldset, 'legend', 'form-label', 'The team-action item in Notifications is:');
            [
                ['direct-communication', 'a private direct message'],
                ['team-action-notification', 'informational; no response required'],
                ['rfi-answer', 'an answer stored on the RFI record']
            ].forEach(([value, label], index) => {
                const row = createElement(documentRef, 'label', 'form-check');
                const input = createElement(documentRef, 'input', 'form-radio');
                input.type = 'radio';
                input.name = 'facilitatorTrainingClassification';
                input.value = value;
                input.id = `facilitatorTrainingClassification-${index}`;
                row.htmlFor = input.id;
                row.append(input, createElement(documentRef, 'span', 'form-check-label', label));
                fieldset.appendChild(row);
            });
            const submit = makeButton(documentRef, 'Check channel distinction', () => {}, 'primary');
            submit.type = 'submit';
            form.append(fieldset, submit);
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const answer = form.querySelector('[name="facilitatorTrainingClassification"]:checked')?.value || '';
                if (answer !== 'team-action-notification') {
                    void coach.recordMastery({
                        step: module.steps[4],
                        evidence: { command: 'incorrect-channel' },
                        passed: false
                    }).catch(() => {});
                    setRetry(module.steps[4].retryFeedback);
                    return;
                }
                try {
                    await execute(FACILITATOR_COMMANDS.RESPONSE_CLASSIFIED, {
                        rfiAnswer: 'rfi-answer',
                        communication: 'direct-communication',
                        notification: answer
                    });
                    if (!fixtureBundle.proposalThreads?.length) {
                        advance(5, module.steps[4].correctFeedback);
                    } else {
                        setFeedback('Correct. Complete the recipient-only proposal practice next.');
                        render();
                    }
                } catch (_error) {
                    setRetry(module.steps[4].retryFeedback);
                }
            });
            container.appendChild(form);
            return;
        }

        if (fixtureBundle.proposalThreads?.length && !state.practiceState.proposalNegotiated) {
            const rootMessage = fixtureBundle.proposalThreads[0];
            const expectedRound = fixtureBundle.proposalThreads[1];
            appendText(documentRef, container, 'h4', '', 'Recipient-only proposal thread');
            appendText(documentRef, container, 'p', '', rootMessage.content);
            appendText(documentRef, container, 'p', 'text-sm', `Recipient: ${rootMessage.metadata.recipient_team} | Round 0 remains immutable.`);
            const form = createElement(documentRef, 'form', 'training-coach__form');
            const terms = appendLabeledInput(documentRef, form, {
                id: 'facilitatorTrainingProposalTerms',
                label: 'Negotiation terms for round 1',
                value: expectedRound.content,
                multiline: true,
                help: 'This appends one round only to this recipient and team thread.'
            });
            const submit = makeButton(documentRef, 'Negotiate and append round', () => {}, 'primary');
            submit.type = 'submit';
            form.appendChild(submit);
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (!terms.value.trim()) {
                    setRetry('Enter negotiation terms for the recipient-only round.');
                    return;
                }
                try {
                    await execute(FACILITATOR_COMMANDS.PROPOSAL_NEGOTIATED, {
                        proposalMessageId: rootMessage.id,
                        decision: 'negotiate',
                        terms: terms.value
                    });
                    advance(5, 'The negotiation round was appended without changing round 0 or another recipient thread.');
                } catch (_error) {
                    setRetry('Use the current recipient thread and append exactly one negotiation round.');
                }
            });
            container.appendChild(form);
            return;
        }

        container.appendChild(makeButton(documentRef, 'Continue to final submission', () => advance(5, module.steps[4].correctFeedback)));
    };

    const renderRetrieve = (container) => {
        const form = createElement(documentRef, 'form', 'training-coach__retrieval');
        const fieldset = createElement(documentRef, 'fieldset', 'form-group');
        appendText(documentRef, fieldset, 'legend', 'form-label', 'Who owns final submission, RFIs, direct communications, and projection?');
        [['scribe', 'Scribe'], ['facilitator', 'Facilitator'], ['notetaker', 'Notetaker']].forEach(([value, label], index) => {
            const row = createElement(documentRef, 'label', 'form-check');
            const input = createElement(documentRef, 'input', 'form-radio');
            input.type = 'radio';
            input.name = 'facilitatorTrainingOwnership';
            input.value = value;
            input.id = `facilitatorTrainingOwnership-${index}`;
            row.htmlFor = input.id;
            row.append(input, createElement(documentRef, 'span', 'form-check-label', label));
            fieldset.appendChild(row);
        });
        const submit = makeButton(documentRef, 'Check and submit training artifact', () => {}, 'primary');
        submit.type = 'submit';
        form.append(fieldset, submit);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const answer = form.querySelector('[name="facilitatorTrainingOwnership"]:checked')?.value || '';
            if (answer !== 'facilitator') {
                void coach.recordMastery({
                    step: module.steps[5],
                    evidence: { optionId: answer },
                    passed: false
                }).catch(() => {});
                setRetry(module.steps[5].retryFeedback);
                return;
            }
            try {
                await execute(FACILITATOR_COMMANDS.ARTIFACT_SUBMITTED, {
                    artifactId: fixtureBundle.artifact.id,
                    answer
                });
                advance(6, module.steps[5].correctFeedback);
            } catch (_error) {
                setRetry('Complete the response and recipient-thread practice before final submission.');
            }
        });
        container.appendChild(form);
    };

    const renderReflect = (container) => {
        renderArtifactSummary(container);
        const receipt = state.practiceState?.submissionReceipt;
        appendText(documentRef, container, 'h4', '', 'Simulated White Cell receipt');
        appendText(documentRef, container, 'p', '', receipt?.visibleLabel || 'Submit the training artifact to reveal receipt evidence.');
        const timelineReceipt = state.practiceState?.timelineEntries?.find((entry) => entry.id.endsWith(':submission-receipt'));
        appendText(documentRef, container, 'p', 'text-sm', timelineReceipt?.content || 'Timeline receipt pending.');
        if (!state.practiceState?.receiptVerified) {
            container.appendChild(makeButton(documentRef, 'Verify lifecycle and timeline receipt', async () => {
                try {
                    await execute(FACILITATOR_COMMANDS.RECEIPT_VERIFIED, { artifactId: fixtureBundle.artifact.id });
                    await runtimeRef.completeAttempt();
                    state.completed = true;
                    setFeedback('Facilitator learning path completed in this isolated training attempt.');
                    render();
                } catch (_error) {
                    setRetry(module.steps[6].retryFeedback);
                }
            }));
        }
    };

    const renderers = [renderOrient, renderShow, renderGuide, renderRfiPractice, renderResponse, renderRetrieve, renderReflect];

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

        lesson.dataset.trainingState = state.retryMessage ? 'retry' : (state.practiceState?.artifactState || 'active');
        if (state.retryMessage) appendText(documentRef, lesson, 'p', 'form-error', state.retryMessage);
        renderers[state.stepIndex](lesson);
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
    return Object.freeze({
        root,
        destroy,
        getState: () => ({ ...state, workspaceVisits: [...state.workspaceVisits] })
    });
}

export default mountFacilitatorTrainingCoach;
