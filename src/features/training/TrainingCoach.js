import { confirm as confirmModal } from '../../components/ui/Modal.js';
import {
    getTrainingStageLabel,
    normalizeTrainingAttemptSnapshot,
    resolveTrainingResumeIndex
} from './TrainingProgress.js';

const COMPLETION_SUMMARIES = Object.freeze({
    scribe: Object.freeze({
        capabilities: 'You practiced Strategic Orientation, structured artifact authoring, revision, and the Scribe-to-Facilitator handoff.',
        firstLiveAction: 'In your first live session, read the move, phase, and timer, then open Strategic Orientation before drafting the team artifact.'
    }),
    facilitator: Object.freeze({
        capabilities: 'You practiced artifact review, projection, Requests for Information, direct communication, notifications, and final submission.',
        firstLiveAction: 'In your first live session, review the Scribe handoff and its lifecycle state before projecting or submitting anything.'
    }),
    notetaker: Object.freeze({
        capabilities: 'You practiced seat-scoped observations, shared captures, team dynamics, inbox review, and read-only action and timeline review.',
        firstLiveAction: 'In your first live session, confirm the team, move, phase, and timer before recording the first observation.'
    })
});

function createElement(documentRef, tagName, className = '', text = '') {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

export function getTrainingCompletionSummary(semanticRole) {
    const role = COMPLETION_SUMMARIES[semanticRole];
    if (!role) return null;
    return Object.freeze({
        ...role,
        handoff: 'The practiced ownership chain is Scribe to Facilitator to White Cell.',
        reopen: 'To reopen training later, return to code entry and use the shared training code. Progress is separate for every team and role.',
        boundary: 'This completion records isolated practice only. It is not live-session evidence, identity verification, authorization, or a formal score.'
    });
}

export class TrainingCoach {
    constructor({
        root,
        module,
        context,
        runtimeRef,
        lessonHost,
        feedbackHost,
        documentRef = root?.ownerDocument || (typeof document !== 'undefined' ? document : null),
        confirmRef = confirmModal,
        onStepChange = () => {},
        onReset = () => {},
        onStartAnotherRole = () => {}
    } = {}) {
        this.root = root;
        this.module = module;
        this.context = context;
        this.runtime = runtimeRef;
        this.document = documentRef;
        this.lessonHost = lessonHost;
        this.feedbackHost = feedbackHost;
        this.confirm = confirmRef;
        this.onStepChange = onStepChange;
        this.onReset = onReset;
        this.onStartAnotherRole = onStartAnotherRole;
        this.snapshot = normalizeTrainingAttemptSnapshot(
            runtimeRef?.getAttemptSnapshot?.(context?.attemptId) || activationSnapshot(context)
        );
        this.currentStepIndex = resolveTrainingResumeIndex(module, this.snapshot);
        this.lastRenderedStepIndex = null;
        this.activeTarget = null;

        const header = root.querySelector?.('.training-coach__header');
        this.headerActions = createElement(documentRef, 'div', 'training-coach__header-actions');
        this.collapseButton = createElement(
            documentRef,
            'button',
            'btn btn-secondary btn-sm training-coach__toggle',
            'Hide guide'
        );
        this.collapseButton.type = 'button';
        this.collapseButton.setAttribute('aria-expanded', 'true');
        this.headerActions.appendChild(this.collapseButton);
        header?.appendChild(this.headerActions);

        this.meta = createElement(documentRef, 'section', 'training-coach__instruction');
        this.meta.setAttribute('aria-label', 'Current training instruction');
        this.stepLabel = createElement(documentRef, 'p', 'training-coach__active-label');
        this.objective = createElement(documentRef, 'h3', 'training-coach__objective');
        this.objective.tabIndex = -1;
        this.explanation = createElement(documentRef, 'p', 'training-coach__explanation');
        this.hint = createElement(documentRef, 'details', 'training-coach__hint');
        this.hintText = createElement(documentRef, 'p');
        this.hint.append(
            createElement(documentRef, 'summary', '', 'Show hint'),
            this.hintText
        );
        this.meta.append(this.stepLabel, this.objective, this.explanation, this.hint);
        root.insertBefore(this.meta, lessonHost);

        this.navigation = createElement(documentRef, 'nav', 'training-coach__navigation');
        this.navigation.setAttribute('aria-label', 'Training step navigation');
        this.backButton = createElement(documentRef, 'button', 'btn btn-secondary', 'Back');
        this.backButton.type = 'button';
        this.nextButton = createElement(documentRef, 'button', 'btn btn-primary', 'Next');
        this.nextButton.type = 'button';
        this.nextHelp = createElement(documentRef, 'span', 'sr-only', 'Next becomes available only after the current step is mastered.');
        this.nextHelp.id = `${this.root.id}-next-help`;
        this.nextButton.setAttribute('aria-describedby', this.nextHelp.id);
        this.navigation.append(this.backButton, this.nextButton, this.nextHelp);
        root.insertBefore(this.navigation, feedbackHost);
        this.liveRegion = createElement(documentRef, 'p', 'sr-only');
        this.liveRegion.setAttribute('role', 'status');
        this.liveRegion.setAttribute('aria-live', 'polite');
        this.liveRegion.setAttribute('aria-atomic', 'true');
        root.appendChild(this.liveRegion);

        this.body = createElement(documentRef, 'div', 'training-coach__body');
        this.body.id = `${root.id}-body`;
        this.collapseButton.setAttribute('aria-controls', this.body.id);
        this.stage = createElement(documentRef, 'section', 'training-coach__active-stage');
        this.stage.setAttribute('aria-label', 'Active learning step');

        const audioHost = [...root.children].find((element) => element.classList?.contains('training-coach__audio'));
        if (audioHost) this.headerActions.prepend(audioHost);
        this.stage.append(this.meta, lessonHost, feedbackHost, this.navigation);
        this.body.appendChild(this.stage);
        root.insertBefore(this.body, this.liveRegion);
        this.backButton.addEventListener('click', () => this.goBack());
        this.nextButton.addEventListener('click', () => this.goNext());
        this.collapseButton.addEventListener('click', () => {
            this.setCollapsed(this.root.dataset.collapsed !== 'true');
        });
        this.handleViewportChange = () => this.positionDockForTarget(this.activeTarget);
        documentRef.defaultView?.addEventListener?.('resize', this.handleViewportChange);
    }

    getResumeIndex() {
        return this.currentStepIndex;
    }

    isMastered(stepId) {
        return this.snapshot.masteredStepIds.includes(stepId);
    }

    refreshSnapshot() {
        const next = this.runtime?.getAttemptSnapshot?.(this.context.attemptId);
        if (next) this.snapshot = normalizeTrainingAttemptSnapshot(next);
        return this.snapshot;
    }

    renderStep(index) {
        const previousStepIndex = this.lastRenderedStepIndex;
        this.currentStepIndex = Math.min(Math.max(index, 0), this.module.steps.length - 1);
        const step = this.module.steps[this.currentStepIndex];
        this.stepLabel.textContent = `Step ${this.currentStepIndex + 1} of ${this.module.steps.length}`;
        this.objective.textContent = getTrainingStageLabel(step.stage);
        this.explanation.textContent = step.coachCopy;
        this.hintText.textContent = step.hint || '';
        this.hint.hidden = !step.hint;
        this.hint.open = false;
        this.backButton.disabled = this.currentStepIndex === 0;
        this.nextButton.disabled = !this.isMastered(step.id) || this.currentStepIndex === this.module.steps.length - 1;
        this.root.dataset.stepDirection = previousStepIndex !== null && this.currentStepIndex < previousStepIndex
            ? 'back'
            : 'forward';
        const stepChanged = previousStepIndex !== null && previousStepIndex !== this.currentStepIndex;
        this.updateTargetSpotlight(step, { shouldScroll: previousStepIndex === null || stepChanged });

        if (stepChanged) {
            this.presentCurrentStep();
        }
        this.lastRenderedStepIndex = this.currentStepIndex;
    }

    presentCurrentStep() {
        this.setCollapsed(false, { focus: false });
        this.stage.classList.remove('training-coach__active-stage--entering');
        void this.stage.offsetWidth;
        this.stage.classList.add('training-coach__active-stage--entering');

        const windowRef = this.document?.defaultView;
        const reducedMotion = windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
        const present = () => {
            this.objective.focus({ preventScroll: true });
            this.activeTarget?.scrollIntoView?.({
                behavior: reducedMotion ? 'auto' : 'smooth',
                block: windowRef?.innerWidth < 768 ? 'start' : 'center',
                inline: 'nearest'
            });
        };
        if (windowRef?.requestAnimationFrame) {
            windowRef.requestAnimationFrame(present);
            return;
        }
        present();
    }

    setCollapsed(collapsed, { focus = true } = {}) {
        const isCollapsed = collapsed === true;
        this.root.dataset.collapsed = String(isCollapsed);
        this.body.hidden = isCollapsed;
        this.collapseButton.setAttribute('aria-expanded', String(!isCollapsed));
        this.collapseButton.textContent = isCollapsed
            ? `Show guide · Step ${this.currentStepIndex + 1} of ${this.module.steps.length}`
            : 'Hide guide';
        if (focus) this.collapseButton.focus();
    }

    updateTargetSpotlight(step, { shouldScroll = false } = {}) {
        let target = null;
        try {
            target = this.document?.querySelector?.(step?.targetSelector) || null;
        } catch (_error) {
            target = null;
        }
        if (!target || target === this.root || this.root.contains(target)) {
            this.clearTargetSpotlight();
            this.root.dataset.dockSide = 'right';
            return;
        }

        if (target !== this.activeTarget) {
            this.clearTargetSpotlight();
            this.activeTarget = target;
            target.classList.add('training-walkthrough-target');
        }
        this.positionDockForTarget(target);
        if (!shouldScroll) return;

        const windowRef = this.document?.defaultView;
        const reducedMotion = windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
        target.scrollIntoView?.({
            behavior: reducedMotion ? 'auto' : 'smooth',
            block: windowRef?.innerWidth < 768 ? 'start' : 'center',
            inline: 'nearest'
        });
    }

    positionDockForTarget(target) {
        const windowRef = this.document?.defaultView;
        if (!target || !windowRef || windowRef.innerWidth < 768) {
            this.root.dataset.dockSide = 'right';
            return;
        }
        const bounds = target.getBoundingClientRect?.();
        if (!bounds) return;
        this.root.dataset.dockSide = bounds.left + (bounds.width / 2) > windowRef.innerWidth / 2
            ? 'left'
            : 'right';
    }

    clearTargetSpotlight() {
        this.activeTarget?.classList?.remove('training-walkthrough-target');
        this.activeTarget = null;
    }

    destroy() {
        this.clearTargetSpotlight();
        this.document?.defaultView?.removeEventListener?.('resize', this.handleViewportChange);
    }

    async recordMastery({ step = this.module.steps[this.currentStepIndex], evidence, passed = true } = {}) {
        const result = await this.runtime.recordMastery({ step, evidence, passed });
        this.refreshSnapshot();
        this.liveRegion.textContent = passed
            ? `${step.stage} step mastered.`
            : `${step.stage} step is not yet mastered. Review the explanation and try again.`;
        return result;
    }

    requireMastery(step = this.module.steps[this.currentStepIndex]) {
        this.refreshSnapshot();
        if (!this.isMastered(step.id)) {
            throw new Error('TRAINING_MASTERY_REQUIRED');
        }
        return true;
    }

    goBack() {
        if (this.currentStepIndex === 0) return;
        this.currentStepIndex -= 1;
        this.onStepChange(this.currentStepIndex, { direction: 'back' });
    }

    goNext() {
        const step = this.module.steps[this.currentStepIndex];
        if (!this.isMastered(step.id) || this.currentStepIndex >= this.module.steps.length - 1) return;
        this.currentStepIndex += 1;
        this.onStepChange(this.currentStepIndex, { direction: 'next' });
    }

    async renderCompletion(container) {
        const summary = getTrainingCompletionSummary(this.context.semanticRole);
        container.replaceChildren();
        container.dataset.trainingState = 'completed';
        container.append(
            createElement(this.document, 'h3', '', `${this.context.semanticRole[0].toUpperCase()}${this.context.semanticRole.slice(1)} practice complete`),
            createElement(this.document, 'p', '', summary.capabilities),
            createElement(this.document, 'p', '', summary.handoff),
            createElement(this.document, 'p', '', summary.firstLiveAction),
            createElement(this.document, 'p', '', summary.reopen),
            createElement(this.document, 'p', 'training-coach__boundary', summary.boundary)
        );
        const actions = createElement(this.document, 'div', 'training-coach__completion-actions');
        const reset = createElement(this.document, 'button', 'btn btn-secondary', 'Reset current role');
        reset.type = 'button';
        reset.addEventListener('click', async () => {
            const confirmed = await this.confirm({
                title: 'Reset current role?',
                message: 'This clears only this team-and-role attempt and starts it again from the first step.',
                confirmLabel: 'Reset current role',
                cancelLabel: 'Keep progress',
                variant: 'danger'
            });
            if (!confirmed) return;
            reset.disabled = true;
            try {
                await this.onReset();
            } catch (error) {
                this.reportActionFailure(error?.code === 'TRAINING_REVISION_CONFLICT'
                    ? 'This attempt changed in another tab. Refresh before resetting it.'
                    : 'Reset could not finish. Your progress was not cleared; try again.');
            } finally {
                reset.disabled = false;
            }
        });
        const another = createElement(this.document, 'button', 'btn btn-primary', 'Start another role');
        another.type = 'button';
        another.addEventListener('click', async () => {
            const confirmed = await this.confirm({
                title: 'Start another role?',
                message: 'You will return to role selection. This role keeps its own separate completion state.',
                confirmLabel: 'Choose another role',
                cancelLabel: 'Stay here'
            });
            if (!confirmed) return;
            another.disabled = true;
            try {
                await this.onStartAnotherRole();
            } catch (_error) {
                this.reportActionFailure('Role selection could not open. This completion is still saved; try again.');
            } finally {
                another.disabled = false;
            }
        });
        actions.append(reset, another);
        container.appendChild(actions);
        this.navigation.hidden = true;
        this.liveRegion.textContent = `${this.context.semanticRole} practice complete. This is isolated practice, not live-session evidence.`;
    }

    reportActionFailure(message) {
        this.feedbackHost.textContent = message;
        this.feedbackHost.dataset.state = 'error';
        this.liveRegion.textContent = message;
    }
}

function activationSnapshot(context = {}) {
    return {
        attemptId: context.attemptId,
        curriculumVersion: context.curriculumVersion,
        status: 'in_progress',
        revision: 0,
        completedStepIds: [],
        masteredStepIds: []
    };
}

export default TrainingCoach;
