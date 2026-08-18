import { TrainingAudioController } from './TrainingAudioController.js';
import { getTrainingModule } from './content/curriculum.js';
import {
    NOTETAKER_COMMANDS,
    NOTETAKER_PRACTICE_TEXT_LIMIT,
    getNotetakerTrainingCommand,
    trainingRuntime
} from './trainingRuntime.js';
import { readParticipantScopedNotetakerSection } from '../notetaker/storage.js';

const SUPPORTED_TEAMS = Object.freeze(['blue', 'red', 'green', 'industry']);
const AUTOSAVE_DELAY_MS = 2000;

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

function makeTextarea(documentRef, {
    id,
    label,
    hint,
    rows = 3
}) {
    const group = createElement(documentRef, 'div', 'form-group');
    const labelElement = appendText(documentRef, group, 'label', 'form-label', label);
    labelElement.htmlFor = id;
    const textarea = createElement(documentRef, 'textarea', 'form-input form-textarea');
    textarea.id = id;
    textarea.rows = rows;
    textarea.required = true;
    textarea.maxLength = NOTETAKER_PRACTICE_TEXT_LIMIT;
    const hintElement = appendText(documentRef, group, 'p', 'form-hint', hint);
    hintElement.id = `${id}Hint`;
    textarea.setAttribute('aria-describedby', hintElement.id);
    group.appendChild(textarea);
    group.appendChild(hintElement);
    return { group, textarea };
}

function readHeaderContext(documentRef, team) {
    return {
        move: documentRef.getElementById?.('headerMove')?.textContent?.trim() || '1',
        phase: documentRef.getElementById?.('headerPhase')?.textContent?.trim() || 'Internal Deliberation',
        timer: documentRef.getElementById?.('timerDisplay')?.textContent?.trim() || '90:00',
        timerStatus: documentRef.getElementById?.('timerStatus')?.textContent?.trim() || 'Paused',
        team: `${team[0].toUpperCase()}${team.slice(1)} Team`
    };
}

export function getNotetakerPracticeInputError(value, {
    existingValues = []
} = {}) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) return 'Enter a practice note before saving.';
    if (normalized.length > NOTETAKER_PRACTICE_TEXT_LIMIT) {
        return `Keep each practice note to ${NOTETAKER_PRACTICE_TEXT_LIMIT} characters or fewer.`;
    }
    const signature = normalized.toLowerCase();
    if (existingValues.some((entry) => String(entry || '').trim().toLowerCase() === signature)) {
        return 'This duplicates an existing practice note. Record a distinct observation.';
    }
    return null;
}

export function isNotetakerPracticeOffline(navigatorRef = globalThis.navigator) {
    return navigatorRef?.onLine === false;
}

export function shouldMountNotetakerTrainingCoach(activation, expectedTeam) {
    const context = activation?.context;
    return Boolean(
        activation?.active === true
        && context?.trainingMode === true
        && context.semanticRole === 'notetaker'
        && context.team === expectedTeam
        && SUPPORTED_TEAMS.includes(context.team)
        && activation.fixtureBundle?.team === expectedTeam
        && activation.fixtureBundle?.semanticRole === 'notetaker'
        && activation.fixtureBundle?.notetakerRecord
        && activation.fixtureBundle?.secondNotetakerRecord
    );
}

export function mountNotetakerTrainingCoach({
    activation,
    documentRef = typeof document !== 'undefined' ? document : null,
    windowRef = documentRef?.defaultView || (typeof window !== 'undefined' ? window : null),
    runtimeRef = trainingRuntime,
    onNavigate = () => {},
    onStateChange = () => {},
    AudioController = TrainingAudioController
} = {}) {
    const context = activation?.context;
    const fixtureBundle = activation?.fixtureBundle;
    const module = context ? getTrainingModule('notetaker', context.team) : null;
    const host = documentRef?.querySelector?.('.page-container') || documentRef?.querySelector?.('main');
    if (!host || !module || !fixtureBundle) return null;

    documentRef.getElementById?.('notetakerTrainingCoach')?.remove?.();
    const root = createElement(documentRef, 'section', 'training-coach card card-bordered');
    root.id = 'notetakerTrainingCoach';
    root.tabIndex = -1;
    root.dataset.trainingTeam = context.team;
    root.setAttribute('aria-labelledby', 'notetakerTrainingCoachTitle');

    const header = createElement(documentRef, 'div', 'training-coach__header');
    const headingGroup = createElement(documentRef, 'div');
    appendText(documentRef, headingGroup, 'p', 'training-coach__eyebrow', 'GUIDED NOTETAKER PRACTICE');
    const title = appendText(
        documentRef,
        headingGroup,
        'h2',
        'training-coach__title',
        `${context.team[0].toUpperCase()}${context.team.slice(1)} Notetaker coach`
    );
    title.id = 'notetakerTrainingCoachTitle';
    const progress = createElement(documentRef, 'div', 'training-coach__progress');
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-valuemin', '1');
    progress.setAttribute('aria-valuemax', String(module.steps.length));
    header.append(headingGroup, progress);

    const audioHost = createElement(documentRef, 'div', 'training-coach__audio');
    const common = createElement(documentRef, 'section', 'training-coach__common');
    common.setAttribute('aria-labelledby', 'notetakerTrainingCommonTitle');
    const commonTitle = appendText(documentRef, common, 'h3', '', 'Notetaker ownership boundary');
    commonTitle.id = 'notetakerTrainingCommonTitle';
    appendText(
        documentRef,
        common,
        'p',
        'text-sm',
        'You explain team reasoning. You do not author, approve, edit, or submit actions, requests for information (RFIs), communications, or official timeline events.'
    );
    const landmarks = createElement(documentRef, 'div', 'training-coach__landmarks');
    [
        ['capture', 'Quick Capture'],
        ['dynamics', 'Team Dynamics'],
        ['alliance', 'Alliance Tracking'],
        ['inbox', 'White Cell Inbox'],
        ['actions', 'Team Actions'],
        ['timeline', 'Official Timeline']
    ].forEach(([section, label]) => {
        landmarks.appendChild(makeButton(documentRef, label, () => onNavigate(section), 'secondary'));
    });
    common.appendChild(landmarks);

    const lesson = createElement(documentRef, 'section', 'training-coach__lesson');
    lesson.setAttribute('aria-live', 'polite');
    lesson.setAttribute('aria-atomic', 'true');
    const feedback = createElement(documentRef, 'p', 'training-coach__feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true');
    root.append(header, audioHost, common, lesson, feedback);
    host.insertBefore(root, host.firstChild || null);

    const audio = new AudioController({ documentRef, windowRef });
    audio.mountControls(audioHost, { documentRef });

    const state = {
        stepIndex: 0,
        practiceState: runtimeRef.getPracticeState?.() || null,
        retryMessage: '',
        completed: false,
        actionReviewed: false,
        timelineReviewed: false,
        autosaveStatus: 'idle',
        drafts: {}
    };
    let autosaveTimer = null;
    let autosavePromise = null;
    let pendingAutosave = null;

    const setRetry = (message) => {
        state.retryMessage = String(message || 'Review the practice entry and try again.');
        feedback.textContent = `Try again: ${state.retryMessage}`;
        render();
    };

    const clearRetry = () => {
        state.retryMessage = '';
        feedback.textContent = '';
    };

    const advance = (stepIndex, message = '') => {
        clearRetry();
        state.stepIndex = Math.min(stepIndex, module.steps.length - 1);
        feedback.textContent = message;
        render();
    };

    const execute = async (suffix, payload = {}) => {
        if (isNotetakerPracticeOffline(windowRef?.navigator)) {
            const error = new Error('You are offline. Your practice text is still in the form; reconnect and retry.');
            error.code = 'TRAINING_OFFLINE';
            throw error;
        }
        const command = getNotetakerTrainingCommand(context.team, suffix);
        if (!command) throw new Error('Unsupported Notetaker training command.');
        const nextState = await runtimeRef.executeCommand(command, payload);
        state.practiceState = nextState;
        onStateChange(nextState);
        return nextState;
    };

    const existingCaptureValues = () => (
        state.practiceState?.activeSeatRecord?.observation_timeline?.map((entry) => entry.content) || []
    );

    const validatePair = (first, second, existingValues = []) => {
        const firstError = getNotetakerPracticeInputError(first, { existingValues });
        if (firstError) return firstError;
        return getNotetakerPracticeInputError(second, {
            existingValues: [...existingValues, first]
        });
    };

    const validateObservationPair = (observation, reasoning, existingValues = [], connector = 'Reasoning:') => {
        const error = validatePair(observation, reasoning, existingValues);
        if (error) return error;
        if (`${observation.trim()} ${connector} ${reasoning.trim()}`.length > NOTETAKER_PRACTICE_TEXT_LIMIT) {
            return `Keep the complete observation to ${NOTETAKER_PRACTICE_TEXT_LIMIT} characters or fewer.`;
        }
        return null;
    };

    const bindDraft = (textarea, key) => {
        textarea.value = state.drafts[key] || '';
        textarea.addEventListener('input', () => {
            state.drafts[key] = textarea.value;
        });
    };

    const renderContext = (container) => {
        const current = readHeaderContext(documentRef, context.team);
        const grid = createElement(documentRef, 'dl', 'training-coach__context');
        [
            ['Team', current.team],
            ['Move', current.move],
            ['Phase', current.phase],
            ['Timer', `${current.timer} - ${current.timerStatus}`]
        ].forEach(([term, value]) => {
            appendText(documentRef, grid, 'dt', '', term);
            appendText(documentRef, grid, 'dd', '', value);
        });
        container.appendChild(grid);
    };

    const renderOrient = (container) => {
        renderContext(container);
        appendText(documentRef, container, 'p', '', 'Use this context to scope every note to the current exercise window and team. The explanatory record never replaces the official decision.');
        container.appendChild(makeButton(documentRef, 'I understand the Notetaker boundary', async () => {
            try {
                await execute(NOTETAKER_COMMANDS.CONTEXT_ORIENTED);
                advance(1, module.steps[0].correctFeedback);
            } catch (error) {
                setRetry(error.message);
            }
        }));
    };

    const renderShow = (container) => {
        appendText(documentRef, container, 'h4', '', 'Simulated deliberation');
        appendText(documentRef, container, 'p', '', 'The team accepts a reversible checkpoint after comparing delivery risk with the cost of waiting for complete information.');
        appendText(documentRef, container, 'p', 'form-hint', 'Example shape: state what the team considered, then explain the reason or trade-off. Write your own entry below.');
        const form = createElement(documentRef, 'form', 'training-coach__form');
        const observation = makeTextarea(documentRef, {
            id: 'notetakerTrainingObservation',
            label: 'What did the team consider or decide?',
            hint: 'Capture the meaningful choice or change, not a verdict from White Cell.'
        });
        const reasoning = makeTextarea(documentRef, {
            id: 'notetakerTrainingReasoning',
            label: 'What reasoning or trade-off led there?',
            hint: 'Name the evidence, concern, or alternative the team weighed.'
        });
        bindDraft(observation.textarea, 'observation');
        bindDraft(reasoning.textarea, 'reasoning');
        const submit = makeButton(documentRef, 'Save observation', () => {}, 'primary');
        submit.type = 'submit';
        form.append(observation.group, reasoning.group, submit);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const error = validateObservationPair(
                observation.textarea.value,
                reasoning.textarea.value,
                existingCaptureValues()
            );
            if (error) return setRetry(error);
            try {
                await execute(NOTETAKER_COMMANDS.OBSERVATION_ADDED, {
                    observation: observation.textarea.value,
                    reasoning: reasoning.textarea.value
                });
                advance(2, module.steps[1].correctFeedback);
            } catch (commandError) {
                setRetry(commandError.message);
            }
        });
        container.appendChild(form);
    };

    const renderGuide = (container) => {
        appendText(documentRef, container, 'p', '', 'A key moment marks a turn in the discussion. A quote preserves exact words. Keep them as separate capture types.');
        const form = createElement(documentRef, 'form', 'training-coach__form');
        const moment = makeTextarea(documentRef, {
            id: 'notetakerTrainingMoment',
            label: 'Key moment',
            hint: 'Describe the point when the discussion changed direction.'
        });
        const quote = makeTextarea(documentRef, {
            id: 'notetakerTrainingQuote',
            label: 'Quote',
            hint: 'Enter only words attributed to the simulated discussion; do not turn a paraphrase into a quote.'
        });
        bindDraft(moment.textarea, 'moment');
        bindDraft(quote.textarea, 'quote');
        const submit = makeButton(documentRef, 'Save moment and quote', () => {}, 'primary');
        submit.type = 'submit';
        form.append(moment.group, quote.group, submit);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const error = validatePair(moment.textarea.value, quote.textarea.value, existingCaptureValues());
            if (error) return setRetry(error);
            try {
                await execute(NOTETAKER_COMMANDS.QUICK_CAPTURES_ADDED, {
                    moment: moment.textarea.value,
                    quote: quote.textarea.value
                });
                advance(3, module.steps[2].correctFeedback);
            } catch (commandError) {
                setRetry(commandError.message);
            }
        });
        container.appendChild(form);
    };

    const renderPractice = (container) => {
        const comparisonRecord = state.practiceState?.secondSeatRecord || fixtureBundle.secondNotetakerRecord;
        const comparisonDynamics = readParticipantScopedNotetakerSection(
            comparisonRecord.dynamics_analysis,
            {},
            { teamId: context.team, participantKey: comparisonRecord.participantKey }
        );
        const comparison = createElement(documentRef, 'article', 'training-coach__artifact-state');
        appendText(documentRef, comparison, 'h4', '', 'Comparison seat - read only');
        appendText(documentRef, comparison, 'p', 'text-sm', comparisonDynamics.dynamicsSummary || 'The second Notetaker fixture has a separate record.');
        appendText(documentRef, comparison, 'p', 'form-hint', `Record ID: ${comparisonRecord.id}. Your saves cannot replace it.`);
        container.appendChild(comparison);

        const form = createElement(documentRef, 'form', 'training-coach__form');
        const dynamics = makeTextarea(documentRef, {
            id: 'notetakerTrainingDynamics',
            label: 'Team-dynamics note for this move',
            hint: 'Explain how the team reasoned, handled disagreement, or reached consensus.'
        });
        const alliance = makeTextarea(documentRef, {
            id: 'notetakerTrainingAlliance',
            label: 'Alliance shift for this move',
            hint: 'State what changed, between whom, and what evidence supports the change.'
        });
        bindDraft(dynamics.textarea, 'dynamics');
        bindDraft(alliance.textarea, 'alliance');
        const status = appendText(documentRef, form, 'p', 'training-coach__feedback', 'No unsaved changes');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        const retryAutosave = makeButton(documentRef, 'Retry autosave', () => {
            if (pendingAutosave) void startAutosave(pendingAutosave);
        }, 'secondary');
        retryAutosave.hidden = true;
        const manualSave = makeButton(documentRef, 'Save notes and publish practice snapshots', () => {}, 'primary');
        manualSave.type = 'submit';
        form.append(dynamics.group, alliance.group, status, retryAutosave, manualSave);

        const setAutosaveStatus = (kind, message) => {
            state.autosaveStatus = kind;
            status.dataset.status = kind;
            status.textContent = message;
            retryAutosave.hidden = !['error', 'offline'].includes(kind);
        };
        const readNotes = () => ({
            dynamicsNote: dynamics.textarea.value,
            allianceNote: alliance.textarea.value
        });
        const runAutosave = async (notes) => {
            pendingAutosave = notes;
            const error = validatePair(notes.dynamicsNote, notes.allianceNote);
            if (error) {
                setAutosaveStatus('error', error);
                return;
            }
            if (isNotetakerPracticeOffline(windowRef?.navigator)) {
                setAutosaveStatus('offline', 'Offline. Your text remains in this form; reconnect and retry autosave.');
                return;
            }
            setAutosaveStatus('saving', 'Saving practice notes...');
            try {
                await execute(NOTETAKER_COMMANDS.SEAT_NOTES_AUTOSAVED, notes);
                setAutosaveStatus('saved', 'Saved to your seat-scoped practice notes');
            } catch (_error) {
                setAutosaveStatus('error', 'Autosave failed. Your text remains in this form; retry before leaving this step.');
            }
        };
        const startAutosave = (notes) => {
            const currentPromise = runAutosave(notes);
            autosavePromise = currentPromise;
            void currentPromise.finally(() => {
                if (autosavePromise === currentPromise) autosavePromise = null;
            });
            return currentPromise;
        };
        const scheduleAutosave = () => {
            if (autosaveTimer) windowRef?.clearTimeout?.(autosaveTimer);
            pendingAutosave = readNotes();
            setAutosaveStatus('saving', 'Saving practice notes...');
            autosaveTimer = windowRef?.setTimeout?.(() => {
                autosaveTimer = null;
                void startAutosave(pendingAutosave);
            }, AUTOSAVE_DELAY_MS);
        };
        dynamics.textarea.addEventListener('input', scheduleAutosave);
        alliance.textarea.addEventListener('input', scheduleAutosave);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (autosaveTimer) {
                windowRef?.clearTimeout?.(autosaveTimer);
                autosaveTimer = null;
            }
            const notes = readNotes();
            const error = validatePair(notes.dynamicsNote, notes.allianceNote);
            if (error) return setAutosaveStatus('error', error);
            if (autosavePromise) await autosavePromise;
            try {
                await execute(NOTETAKER_COMMANDS.SEAT_NOTES_SAVED, notes);
                advance(4, module.steps[3].correctFeedback);
            } catch (commandError) {
                setAutosaveStatus(
                    commandError.code === 'TRAINING_OFFLINE' ? 'offline' : 'error',
                    commandError.code === 'TRAINING_OFFLINE'
                        ? commandError.message
                        : 'Save failed. Your text remains in this form; retry when the training service is available.'
                );
            }
        });
        container.appendChild(form);
    };

    const renderRespond = (container) => {
        const inboxItem = state.practiceState?.inboxItem || fixtureBundle.inject;
        const card = createElement(documentRef, 'article', 'training-coach__returned');
        appendText(documentRef, card, 'h4', '', inboxItem.title);
        appendText(documentRef, card, 'p', 'text-sm', inboxItem.content);
        appendText(
            documentRef,
            card,
            'p',
            'form-hint',
            state.practiceState?.inboxOpened
                ? 'Opened. The unread marker cleared, but the inbox history remains.'
                : 'Unread training inbox update.'
        );
        container.appendChild(card);
        if (!state.practiceState?.inboxOpened) {
            container.appendChild(makeButton(documentRef, 'Open inbox update', async () => {
                try {
                    onNavigate('inbox');
                    await execute(NOTETAKER_COMMANDS.INBOX_OPENED, { inboxItemId: inboxItem.id });
                    render();
                } catch (error) {
                    setRetry(error.message);
                }
            }));
            return;
        }

        const form = createElement(documentRef, 'form', 'training-coach__form');
        const observation = makeTextarea(documentRef, {
            id: 'notetakerTrainingInboxObservation',
            label: 'What should be observed now?',
            hint: 'Describe the team behavior or reasoning to watch; do not rewrite the action.'
        });
        const reasoning = makeTextarea(documentRef, {
            id: 'notetakerTrainingInboxReasoning',
            label: 'Why does the update make that observation useful?',
            hint: 'Connect the supply disruption to a question, trade-off, or change in deliberation.'
        });
        bindDraft(observation.textarea, 'inboxObservation');
        bindDraft(reasoning.textarea, 'inboxReasoning');
        const submit = makeButton(documentRef, 'Save inbox-informed observation', () => {}, 'primary');
        submit.type = 'submit';
        form.append(observation.group, reasoning.group, submit);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const error = validateObservationPair(
                observation.textarea.value,
                reasoning.textarea.value,
                existingCaptureValues(),
                'Reasoning after inbox update:'
            );
            if (error) return setRetry(error);
            try {
                await execute(NOTETAKER_COMMANDS.INJECT_OBSERVATION_ADDED, {
                    observation: observation.textarea.value,
                    reasoning: reasoning.textarea.value
                });
                advance(5, module.steps[4].correctFeedback);
            } catch (commandError) {
                setRetry(commandError.message);
            }
        });
        container.appendChild(form);
    };

    const renderRetrieve = (container) => {
        appendText(documentRef, container, 'p', '', 'Review the submitted team artifact and chronological timeline. Both are read-only in this workspace.');
        const reviewControls = createElement(documentRef, 'div', 'training-coach__landmarks');
        reviewControls.append(
            makeButton(documentRef, state.actionReviewed ? 'Team action reviewed' : 'Review team action', () => {
                state.actionReviewed = true;
                onNavigate('actions');
                render();
            }, 'secondary'),
            makeButton(documentRef, state.timelineReviewed ? 'Official timeline reviewed' : 'Review official timeline', () => {
                state.timelineReviewed = true;
                onNavigate('timeline');
                render();
            }, 'secondary')
        );
        container.appendChild(reviewControls);
        if (!state.actionReviewed || !state.timelineReviewed) return;

        const form = createElement(documentRef, 'form', 'training-coach__retrieval');
        const fieldset = createElement(documentRef, 'fieldset', 'form-group');
        appendText(documentRef, fieldset, 'legend', 'form-label', 'Which record explains why the team reasoned as it did?');
        [
            ['official-timeline', 'The official timeline'],
            ['notetaker-record', 'The Notetaker explanatory record']
        ].forEach(([value, label], index) => {
            const row = createElement(documentRef, 'label', 'form-check');
            const input = createElement(documentRef, 'input', 'form-radio');
            input.type = 'radio';
            input.name = 'notetakerTrainingRetrieval';
            input.value = value;
            input.id = `notetakerTrainingRetrieval-${index}`;
            row.htmlFor = input.id;
            row.append(input, createElement(documentRef, 'span', 'form-check-label', label));
            fieldset.appendChild(row);
        });
        const submit = makeButton(documentRef, 'Check answer', () => {}, 'primary');
        submit.type = 'submit';
        form.append(fieldset, submit);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const answer = form.querySelector('[name="notetakerTrainingRetrieval"]:checked')?.value || '';
            if (answer !== 'notetaker-record') return setRetry(module.steps[5].retryFeedback);
            try {
                if (!state.practiceState?.readonlyReviewCompleted) {
                    await execute(NOTETAKER_COMMANDS.READONLY_REVIEW_COMPLETED, {
                        actionReviewed: true,
                        timelineReviewed: true,
                        artifactId: state.practiceState.officialAction.id,
                        timelineEntryIds: state.practiceState.officialTimelineEntries.map((entry) => entry.id)
                    });
                }
                await execute(NOTETAKER_COMMANDS.RETRIEVAL_COMPLETED, { answer });
                advance(6, module.steps[5].correctFeedback);
            } catch (commandError) {
                setRetry(commandError.message);
            }
        });
        container.appendChild(form);
    };

    const renderReflect = (container) => {
        appendText(documentRef, container, 'p', '', 'Seat notes stay with your Notetaker record. Quick captures append shared explanatory evidence. Manual saves publish practice snapshots. The action and official timeline remain read-only.');
        container.appendChild(makeButton(documentRef, 'Complete Notetaker practice', async () => {
            try {
                await execute(NOTETAKER_COMMANDS.PRACTICE_COMPLETED);
                state.completed = true;
                feedback.textContent = 'Notetaker learning path completed in this training attempt.';
                render();
            } catch (error) {
                setRetry(error.message);
            }
        }));
    };

    function render() {
        lesson.replaceChildren();
        const step = module.steps[state.stepIndex];
        progress.setAttribute('aria-valuenow', String(state.stepIndex + 1));
        progress.setAttribute('aria-label', `Notetaker training: step ${state.stepIndex + 1} of ${module.steps.length}`);
        progress.textContent = `Step ${state.stepIndex + 1} of ${module.steps.length}`;
        void audio.setClip(step.id, {
            nextClipId: module.steps[state.stepIndex + 1]?.id || null,
            autoplay: false
        });

        if (state.completed) {
            lesson.dataset.trainingState = 'completed';
            appendText(documentRef, lesson, 'h3', '', 'Notetaker practice complete');
            appendText(documentRef, lesson, 'p', '', 'You completed the observation, dynamics, alliance, inbox, action-review, and timeline loop without mutating an official artifact or another Notetaker seat.');
            return;
        }

        lesson.dataset.trainingState = state.retryMessage ? 'retry' : 'in-progress';
        appendText(documentRef, lesson, 'p', 'training-coach__stage', step.stage.toUpperCase());
        appendText(documentRef, lesson, 'h3', '', step.learningObjective);
        appendText(documentRef, lesson, 'p', '', step.coachCopy);
        if (state.retryMessage) appendText(documentRef, lesson, 'p', 'form-error', state.retryMessage);
        [renderOrient, renderShow, renderGuide, renderPractice, renderRespond, renderRetrieve, renderReflect][state.stepIndex](lesson);
    }

    const handleExit = () => destroy();
    documentRef.addEventListener?.('training:exit', handleExit);

    function destroy() {
        if (autosaveTimer) windowRef?.clearTimeout?.(autosaveTimer);
        autosaveTimer = null;
        audio.destroy();
        documentRef.removeEventListener?.('training:exit', handleExit);
        root.remove?.();
    }

    render();
    return Object.freeze({ root, destroy, getState: () => ({ ...state }) });
}

export default mountNotetakerTrainingCoach;
