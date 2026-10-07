import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeModal, requestCloseModal } from './Modal.js';

const originalDocument = globalThis.document;

afterEach(() => {
    globalThis.document = originalDocument;
});

describe('modal lifecycle', () => {
    it.each(['cancel', 'escape', 'close', 'backdrop'])(
        'retains a dirty modal when the user declines the %s discard prompt',
        (reason) => {
            const overlay = {
                _closing: false,
                dataset: {},
                _unsavedChangesTracker: {
                    requestDiscard: vi.fn(() => false)
                }
            };
            const confirmRef = vi.fn();

            expect(requestCloseModal(overlay, reason, confirmRef)).toBe(false);
            expect(overlay.dataset.dismissReason).toBe(reason);
            expect(overlay._unsavedChangesTracker.requestDiscard).toHaveBeenCalledWith({ confirmRef });
            expect(overlay._closing).toBe(false);
        }
    );

    it('closes a dirty modal after discard is confirmed', () => {
        const tracker = {
            requestDiscard: vi.fn(() => true),
            markClean: vi.fn(),
            dispose: vi.fn()
        };
        const overlay = {
            _closing: false,
            dataset: {},
            _unsavedChangesTracker: tracker,
            _backgroundElements: [],
            classList: {
                add: vi.fn(),
                remove: vi.fn()
            },
            parentNode: null
        };
        globalThis.document = {
            removeEventListener: vi.fn(),
            querySelector: vi.fn(() => null),
            body: {
                classList: {
                    remove: vi.fn()
                }
            }
        };

        expect(requestCloseModal(overlay, 'escape', vi.fn(() => true))).toBe(true);
        expect(overlay._closing).toBe(true);
        expect(tracker.markClean).toHaveBeenCalledOnce();
        expect(tracker.dispose).toHaveBeenCalledOnce();
    });

    it('removes a closing modal immediately and only once', () => {
        const onClose = vi.fn();
        const removeBodyClass = vi.fn();
        const overlay = {
            _closing: false,
            _escapeHandler: vi.fn(),
            _onClose: onClose,
            _backgroundElements: [],
            classList: {
                add: vi.fn(),
                remove: vi.fn()
            },
            parentNode: null
        };
        const parentNode = {
            removeChild: vi.fn(() => {
                overlay.parentNode = null;
            })
        };
        overlay.parentNode = parentNode;
        globalThis.document = {
            removeEventListener: vi.fn(),
            querySelector: vi.fn(() => null),
            body: {
                classList: {
                    remove: removeBodyClass
                }
            }
        };

        closeModal(overlay);
        closeModal(overlay);

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(parentNode.removeChild).toHaveBeenCalledTimes(1);
        expect(removeBodyClass).toHaveBeenCalledWith('modal-open');
        expect(overlay.classList.remove).toHaveBeenCalledWith('modal-visible');
        expect(overlay.classList.add).toHaveBeenCalledWith('modal-hiding');
    });

    it('restores the exact background inert state when the modal closes', () => {
        const ordinaryBackground = {
            inert: true,
            removeAttribute: vi.fn()
        };
        const alreadyInertBackground = {
            inert: true,
            removeAttribute: vi.fn()
        };
        const overlay = {
            _closing: false,
            _onClose: vi.fn(),
            _backgroundElements: [
                {
                    element: ordinaryBackground,
                    hadInertAttribute: false,
                    wasInert: false
                },
                {
                    element: alreadyInertBackground,
                    hadInertAttribute: true,
                    wasInert: true
                }
            ],
            classList: {
                add: vi.fn(),
                remove: vi.fn()
            },
            parentNode: null
        };
        globalThis.document = {
            removeEventListener: vi.fn(),
            querySelector: vi.fn(() => null),
            body: {
                classList: {
                    remove: vi.fn()
                }
            }
        };

        closeModal(overlay);

        expect(ordinaryBackground.inert).toBe(false);
        expect(ordinaryBackground.removeAttribute).toHaveBeenCalledWith('inert');
        expect(alreadyInertBackground.inert).toBe(true);
        expect(alreadyInertBackground.removeAttribute).not.toHaveBeenCalled();
    });
});
