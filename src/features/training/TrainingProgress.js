const STEP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const EVENT_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,159}$/;

function boundedStepIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((stepId) => (
        typeof stepId === 'string' && STEP_ID_PATTERN.test(stepId)
    )))].slice(0, 32);
}

export function normalizeTrainingAttemptSnapshot(raw = {}) {
    const revision = Number(raw.attemptRevision ?? raw.attempt_revision ?? raw.revision ?? 0);
    const currentStepId = String(raw.currentStepId ?? raw.current_step_id ?? '').trim() || null;
    return Object.freeze({
        attemptId: String(raw.attemptId ?? raw.attempt_id ?? '').trim(),
        curriculumVersion: String(raw.curriculumVersion ?? raw.curriculum_version ?? '').trim(),
        status: String(raw.status || 'in_progress').trim(),
        revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
        currentStepId: currentStepId && STEP_ID_PATTERN.test(currentStepId) ? currentStepId : null,
        completedStepIds: Object.freeze(boundedStepIds(
            raw.completedStepIds ?? raw.completed_step_ids
        )),
        masteredStepIds: Object.freeze(boundedStepIds(
            raw.masteredStepIds ?? raw.mastered_step_ids
        ))
    });
}

export function resolveTrainingResumeIndex(module, snapshot) {
    const steps = Array.isArray(module?.steps) ? module.steps : [];
    if (!steps.length) return 0;
    const normalized = normalizeTrainingAttemptSnapshot(snapshot);
    const mastered = new Set(normalized.masteredStepIds);
    const firstIncomplete = steps.findIndex((step) => !mastered.has(step.id));
    if (firstIncomplete >= 0) return firstIncomplete;
    return steps.length - 1;
}

export function reconcileTrainingProgress(localSnapshot, serverSnapshot) {
    const local = normalizeTrainingAttemptSnapshot(localSnapshot);
    const server = normalizeTrainingAttemptSnapshot(serverSnapshot);
    if (local.attemptId && server.attemptId && local.attemptId !== server.attemptId) {
        throw Object.assign(new Error('TRAINING_ATTEMPT_MISMATCH'), {
            code: 'TRAINING_ATTEMPT_MISMATCH'
        });
    }
    if (server.revision < local.revision) {
        throw Object.assign(new Error('TRAINING_STALE_SERVER_REVISION'), {
            code: 'TRAINING_STALE_SERVER_REVISION'
        });
    }
    return server;
}

export function createTrainingProgressEventKey(eventType, stepId = null, suffix = null) {
    const parts = [eventType, stepId, suffix]
        .filter(Boolean)
        .map((part) => String(part).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-'));
    const key = parts.join('.').slice(0, 160);
    if (!EVENT_KEY_PATTERN.test(key)) {
        throw new TypeError('Invalid training progress event key.');
    }
    return key;
}

export function getTrainingProgressRoleLabel(module = {}) {
    const title = String(module.title || '').trim();
    if (title) return title;
    const semanticRole = String(module.semanticRole || '').trim().toLowerCase();
    return semanticRole
        ? `${semanticRole[0].toUpperCase()}${semanticRole.slice(1)}`
        : 'Training';
}

function createElement(documentRef, tagName, className = '', text = '') {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

export function mountTrainingProgress({
    container,
    module,
    snapshot,
    currentStepIndex = 0,
    documentRef = container?.ownerDocument || (typeof document !== 'undefined' ? document : null)
} = {}) {
    if (!container || !documentRef || !Array.isArray(module?.steps) || !module.steps.length) {
        return null;
    }

    const root = createElement(documentRef, 'div', 'training-progress');
    const label = createElement(documentRef, 'p', 'training-progress__label');
    const track = createElement(documentRef, 'div', 'training-progress__track');
    const fill = createElement(documentRef, 'span', 'training-progress__fill');
    const trackText = createElement(documentRef, 'span', 'sr-only');
    const list = createElement(documentRef, 'ol', 'training-progress__steps');
    track.append(fill, trackText);
    root.append(label, track, list);
    container.replaceChildren(root);

    let currentSnapshot = normalizeTrainingAttemptSnapshot(snapshot);
    let currentIndex = currentStepIndex;

    function render(nextSnapshot = currentSnapshot, nextIndex = currentIndex) {
        currentSnapshot = normalizeTrainingAttemptSnapshot(nextSnapshot);
        currentIndex = Math.min(Math.max(Number(nextIndex) || 0, 0), module.steps.length - 1);
        const mastered = new Set(currentSnapshot.masteredStepIds);
        const masteredCount = module.steps.filter((step) => mastered.has(step.id)).length;
        const stepPosition = `Step ${currentIndex + 1} of ${module.steps.length}`;
        label.textContent = `${stepPosition} — ${masteredCount} of ${module.steps.length} steps mastered`;
        trackText.textContent = stepPosition;
        track.setAttribute('role', 'progressbar');
        track.setAttribute(
            'aria-label',
            `${getTrainingProgressRoleLabel(module)} training: step ${currentIndex + 1} of ${module.steps.length}`
        );
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', String(module.steps.length));
        track.setAttribute('aria-valuenow', String(masteredCount));
        track.setAttribute('aria-valuetext', `${masteredCount} of ${module.steps.length} steps mastered`);
        fill.style.setProperty('--training-progress-ratio', String(masteredCount / module.steps.length));
        list.replaceChildren();
        module.steps.forEach((step, index) => {
            const masteredStep = mastered.has(step.id);
            const item = createElement(
                documentRef,
                'li',
                'training-progress__step',
                `${index + 1}. ${step.stage}: ${masteredStep ? 'Mastered' : (index === currentIndex ? 'Current' : 'Not yet mastered')}`
            );
            item.dataset.state = masteredStep ? 'mastered' : (index === currentIndex ? 'current' : 'pending');
            if (index === currentIndex) item.setAttribute('aria-current', 'step');
            list.appendChild(item);
        });
    }

    render();
    return Object.freeze({ root, render, getSnapshot: () => currentSnapshot });
}

export default mountTrainingProgress;
