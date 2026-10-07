import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    createUnsavedChangesTracker,
    handleBeforeUnload,
    hasUnsavedChanges,
    requestDiscardUnsavedChanges,
    resetUnsavedChangesForTests,
    UNSAVED_CHANGES_MESSAGE,
    UNSAVED_EXIT_REASONS
} from './unsavedChanges.js';

function createRoot() {
    const listeners = new Map();
    return {
        dataset: {},
        addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
        removeEventListener: vi.fn((type) => listeners.delete(type)),
        edit(type = 'input') {
            listeners.get(type)?.({
                target: {
                    tagName: 'TEXTAREA',
                    disabled: false,
                    closest: () => null
                }
            });
        }
    };
}

afterEach(() => resetUnsavedChangesForTests());

describe('authoritative unsaved-change contract', () => {
    it('starts clean, becomes dirty after an edit, and clears only after confirmed discard', () => {
        const root = createRoot();
        const confirmRef = vi.fn()
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(true);
        const tracker = createUnsavedChangesTracker(root, { confirmRef });

        expect(tracker.isDirty()).toBe(false);
        root.edit();
        expect(tracker.isDirty()).toBe(true);
        expect(root.dataset.unsavedChanges).toBe('true');
        expect(tracker.requestDiscard()).toBe(false);
        expect(tracker.isDirty()).toBe(true);
        expect(tracker.requestDiscard()).toBe(true);
        expect(tracker.isDirty()).toBe(false);
        expect(confirmRef).toHaveBeenNthCalledWith(1, UNSAVED_CHANGES_MESSAGE);
    });

    it.each(Object.values(UNSAVED_EXIT_REASONS))(
        'uses the same retain-or-discard decision for %s',
        (reason) => {
            const root = createRoot();
            const tracker = createUnsavedChangesTracker(root);
            const confirmRef = vi.fn().mockReturnValue(false);
            root.edit('change');

            expect(requestDiscardUnsavedChanges({ confirmRef, reason })).toBe(false);
            expect(tracker.isDirty()).toBe(true);
            expect(confirmRef).toHaveBeenCalledWith(UNSAVED_CHANGES_MESSAGE);
        }
    );

    it('arms the native browser-navigation prompt without supplying misleading custom text', () => {
        const root = createRoot();
        const event = { preventDefault: vi.fn(), returnValue: undefined };
        createUnsavedChangesTracker(root);
        root.edit();

        expect(handleBeforeUnload(event)).toBe(true);
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.returnValue).toBe('');
        expect(hasUnsavedChanges()).toBe(true);
    });

    it('does not block navigation after a successful save marks the form clean', () => {
        const root = createRoot();
        const event = { preventDefault: vi.fn(), returnValue: undefined };
        const tracker = createUnsavedChangesTracker(root);
        root.edit();
        tracker.markClean();

        expect(handleBeforeUnload(event)).toBe(false);
        expect(event.preventDefault).not.toHaveBeenCalled();
    });
});
