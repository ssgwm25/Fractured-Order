import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeModal } from './Modal.js';

const originalDocument = globalThis.document;

afterEach(() => {
    globalThis.document = originalDocument;
});

describe('modal lifecycle', () => {
    it('removes a closing modal immediately and only once', () => {
        const onClose = vi.fn();
        const removeBodyClass = vi.fn();
        const overlay = {
            _closing: false,
            _escapeHandler: vi.fn(),
            _onClose: onClose,
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
});
