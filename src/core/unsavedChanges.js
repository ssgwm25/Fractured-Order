export const UNSAVED_CHANGES_MESSAGE = 'You have unsaved changes. Discard them and leave this form?';

export const UNSAVED_EXIT_REASONS = Object.freeze({
    CANCEL: 'cancel',
    ESCAPE: 'escape',
    CLOSE: 'close',
    BACKDROP: 'backdrop',
    BROWSER_NAVIGATION: 'browser-navigation',
    IN_APP_NAVIGATION: 'in-app-navigation',
    ROLE_SESSION_SWITCH: 'role-session-switch',
    REFRESH: 'refresh'
});

const activeTrackers = new Set();
const guardedWindows = new WeakMap();

function isEditableTarget(target) {
    if (!target || target.disabled || target.closest?.('[data-unsaved-ignore]')) {
        return false;
    }

    const tagName = String(target.tagName || '').toLowerCase();
    return ['input', 'select', 'textarea'].includes(tagName)
        || target.isContentEditable === true
        || target.getAttribute?.('contenteditable') === 'true';
}

function resolveConfirm(confirmRef) {
    if (typeof confirmRef === 'function') {
        return confirmRef;
    }

    return typeof globalThis.confirm === 'function'
        ? globalThis.confirm.bind(globalThis)
        : () => false;
}

export function createUnsavedChangesTracker(root, {
    message = UNSAVED_CHANGES_MESSAGE,
    confirmRef = null
} = {}) {
    let dirty = false;
    let disposed = false;

    const syncState = () => {
        if (root?.dataset) {
            root.dataset.unsavedChanges = dirty ? 'true' : 'false';
        }
        if (dirty && !disposed) {
            activeTrackers.add(tracker);
        } else {
            activeTrackers.delete(tracker);
        }
    };

    const handleEdit = (event) => {
        if (!isEditableTarget(event?.target)) return;
        dirty = true;
        syncState();
    };

    const tracker = {
        isDirty: () => dirty && !disposed,
        markDirty() {
            if (disposed) return;
            dirty = true;
            syncState();
        },
        markClean() {
            dirty = false;
            syncState();
        },
        requestDiscard({ confirmRef: requestConfirmRef = confirmRef } = {}) {
            if (!dirty || disposed) return true;
            if (!resolveConfirm(requestConfirmRef)(message)) return false;
            dirty = false;
            syncState();
            return true;
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            dirty = false;
            root?.removeEventListener?.('input', handleEdit);
            root?.removeEventListener?.('change', handleEdit);
            syncState();
        }
    };

    root?.addEventListener?.('input', handleEdit);
    root?.addEventListener?.('change', handleEdit);
    syncState();
    return tracker;
}

export function hasUnsavedChanges() {
    return [...activeTrackers].some((tracker) => tracker.isDirty());
}

export function requestDiscardUnsavedChanges({
    confirmRef = null,
    message = UNSAVED_CHANGES_MESSAGE
} = {}) {
    const dirtyTrackers = [...activeTrackers].filter((tracker) => tracker.isDirty());
    if (!dirtyTrackers.length) return true;
    if (!resolveConfirm(confirmRef)(message)) return false;
    dirtyTrackers.forEach((tracker) => tracker.markClean());
    return true;
}

export function handleBeforeUnload(event) {
    if (!hasUnsavedChanges()) return false;
    event?.preventDefault?.();
    if (event) event.returnValue = '';
    return true;
}

export function installUnsavedChangesGuard(windowRef = typeof window !== 'undefined' ? window : null) {
    if (!windowRef?.addEventListener) return () => {};
    if (guardedWindows.has(windowRef)) return guardedWindows.get(windowRef);

    const handler = (event) => handleBeforeUnload(event);
    const cleanup = () => {
        windowRef.removeEventListener?.('beforeunload', handler);
        guardedWindows.delete(windowRef);
    };
    windowRef.addEventListener('beforeunload', handler);
    guardedWindows.set(windowRef, cleanup);
    return cleanup;
}

export function resetUnsavedChangesForTests() {
    [...activeTrackers].forEach((tracker) => tracker.dispose());
    activeTrackers.clear();
}
