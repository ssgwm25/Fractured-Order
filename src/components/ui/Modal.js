/**
 * Modal Dialog Component
 * Displays modal dialogs with customizable content
 */

import {
    createUnsavedChangesTracker,
    UNSAVED_EXIT_REASONS
} from '../../core/unsavedChanges.js';

let activeModal = null;
let previousFocus = null;

/**
 * Show a modal dialog
 * @param {Object} options - Modal options
 * @param {string} options.title - Modal title
 * @param {string|HTMLElement} options.content - Modal content (HTML string or element)
 * @param {Array} options.buttons - Button configurations
 * @param {string} options.size - Modal size ('sm', 'md', 'lg', 'xl')
 * @param {boolean} options.closable - Whether modal can be closed by clicking outside
 * @param {string|HTMLElement|null} options.initialFocus - Preferred initial focus target
 * @param {Function} options.onClose - Callback when modal is closed
 * @returns {Object} Modal controller with close method
 */
export function showModal({
    title = '',
    content = '',
    buttons = [],
    size = 'md',
    closable = true,
    initialFocus = null,
    onClose = null
} = {}) {
    // Close any existing modal
    if (activeModal && !requestCloseModal(activeModal, UNSAVED_EXIT_REASONS.CLOSE)) {
        return null;
    }

    // Store current focus
    previousFocus = document.activeElement;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    if (title) {
        overlay.setAttribute('aria-labelledby', 'modal-title');
    }

    // Create modal
    const modal = document.createElement('div');
    modal.className = `modal modal-${size}`;

    // Build modal content
    let headerHtml = '';
    if (title) {
        headerHtml = `
            <div class="modal-header">
                <h2 id="modal-title" class="modal-title">${escapeHtml(title)}</h2>
                ${closable ? `
                    <button class="modal-close" aria-label="Close modal">
                        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
                            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
        `;
    }

    modal.innerHTML = `
        ${headerHtml}
        <div class="modal-content"></div>
        ${buttons.length > 0 ? '<div class="modal-footer"></div>' : ''}
    `;

    // Add content
    const contentContainer = modal.querySelector('.modal-content');
    if (typeof content === 'string') {
        contentContainer.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        contentContainer.appendChild(content);
    }

    // Add buttons
    if (buttons.length > 0) {
        const footer = modal.querySelector('.modal-footer');
        buttons.forEach(({ label, text, onClick, variant = 'secondary', disabled = false, dismiss = null }) => {
            const buttonLabel = label || text || '';
            const btn = document.createElement('button');
            btn.className = `btn btn-${variant}`;
            btn.textContent = buttonLabel;
            btn.disabled = disabled;
            btn.addEventListener('click', () => {
                const result = onClick?.(controller);
                // Close modal unless onClick returns false
                if (result !== false) {
                    const isDismissAction = dismiss ?? /^(cancel|close)$/i.test(buttonLabel.trim());
                    if (isDismissAction) {
                        requestCloseModal(overlay, UNSAVED_EXIT_REASONS.CANCEL);
                    } else {
                        closeModal(overlay);
                    }
                }
            });
            footer.appendChild(btn);
        });
    }

    overlay.appendChild(modal);

    // Close button handler
    if (closable && title) {
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn?.addEventListener('click', () => requestCloseModal(overlay, UNSAVED_EXIT_REASONS.CLOSE));
    }

    // Click outside to close
    if (closable) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                requestCloseModal(overlay, UNSAVED_EXIT_REASONS.BACKDROP);
            }
        });
    }

    // Escape key to close
    const handleEscape = (e) => {
        if (e.key === 'Escape' && closable) {
            requestCloseModal(overlay, UNSAVED_EXIT_REASONS.ESCAPE);
        }
    };
    document.addEventListener('keydown', handleEscape);

    // Store references
    overlay._onClose = onClose;
    overlay._escapeHandler = handleEscape;

    // Add to DOM, then make every background sibling inert while the dialog is
    // open. The overlay already blocks pointer input; inert also keeps keyboard
    // and assistive-technology navigation inside the modal boundary.
    document.body.appendChild(overlay);
    overlay._backgroundElements = Array.from(document.body.children || [])
        .filter((element) => element !== overlay)
        .map((element) => {
            const state = {
                element,
                hadInertAttribute: element.hasAttribute?.('inert') === true,
                wasInert: element.inert === true
            };
            element.inert = true;
            element.setAttribute?.('inert', '');
            return state;
        });
    document.body.classList.add('modal-open');

    const protectsUnsavedChanges = Boolean(
        contentContainer.querySelector?.('form, input, select, textarea, [contenteditable="true"]')
    );
    overlay._unsavedChangesTracker = protectsUnsavedChanges
        ? createUnsavedChangesTracker(contentContainer)
        : null;

    // Trigger the entrance on the next frame AFTER the initial (hidden) state has
    // painted. A single rAF often runs before the first paint, so the browser sees
    // no start value and skips the transition (the modal "pops" in). Double rAF
    // guarantees the opacity/scale start state is committed first.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('modal-visible');
        });
    });

    // Focus management
    const focusable = modal.querySelectorAll(
        'button, [href], input, select, textarea, video[controls], audio[controls], [tabindex]:not([tabindex="-1"])'
    );
    const preferredFocus = typeof initialFocus === 'string'
        ? modal.querySelector(initialFocus)
        : initialFocus;
    if (
        preferredFocus?.focus
        && (typeof modal.contains !== 'function' || modal.contains(preferredFocus))
    ) {
        preferredFocus.focus();
    } else if (focusable.length > 0) {
        focusable[0].focus();
    }

    // Trap focus within modal
    overlay.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;

        const focusableEls = modal.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], audio[controls], [tabindex]:not([tabindex="-1"])'
        );
        const firstEl = focusableEls[0];
        const lastEl = focusableEls[focusableEls.length - 1];

        if (e.shiftKey && document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
        }
    });

    const controller = {
        close: () => closeModal(overlay),
        requestClose: (reason = UNSAVED_EXIT_REASONS.CLOSE) => requestCloseModal(overlay, reason),
        markClean: () => overlay._unsavedChangesTracker?.markClean?.(),
        isDirty: () => overlay._unsavedChangesTracker?.isDirty?.() === true,
        element: modal,
        overlay
    };
    overlay._controller = controller;
    activeModal = overlay;

    return controller;
}

/**
 * Ask to discard edits before a user-driven modal exit.
 * Programmatic close after a successful write continues to use closeModal().
 * @param {HTMLElement} overlay - Modal overlay element
 * @param {string} reason - Exit path used for contract tests and diagnostics
 * @param {Function|null} confirmRef - Optional confirmation implementation
 * @returns {boolean} Whether the modal closed
 */
export function requestCloseModal(
    overlay = activeModal,
    reason = UNSAVED_EXIT_REASONS.CLOSE,
    confirmRef = null
) {
    if (!overlay || overlay._closing) return false;
    overlay.dataset && (overlay.dataset.dismissReason = reason);
    if (!overlay._unsavedChangesTracker?.requestDiscard?.({ confirmRef })) {
        return false;
    }
    closeModal(overlay);
    return true;
}

/**
 * Close a modal
 * @param {HTMLElement} overlay - Modal overlay element
 */
export function closeModal(overlay = activeModal) {
    if (!overlay || overlay._closing) return;
    overlay._closing = true;

    overlay.classList.remove('modal-visible');
    overlay.classList.add('modal-hiding');
    overlay._unsavedChangesTracker?.markClean?.();
    overlay._unsavedChangesTracker?.dispose?.();
    overlay._unsavedChangesTracker = null;

    // Remove escape handler
    if (overlay._escapeHandler) {
        document.removeEventListener('keydown', overlay._escapeHandler);
    }

    try {
        // Call onClose callback
        overlay._onClose?.();
    } finally {
        overlay._onClose = null;

        // Remove from DOM
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }

        overlay._backgroundElements?.forEach?.(({
            element,
            hadInertAttribute,
            wasInert
        }) => {
            element.inert = wasInert;
            if (!hadInertAttribute) {
                element.removeAttribute?.('inert');
            }
        });
        overlay._backgroundElements = null;

        // Restore body scroll
        if (!document.querySelector('.modal-overlay')) {
            document.body.classList.remove('modal-open');
        }

        // Restore focus
        if (previousFocus) {
            previousFocus.focus();
            previousFocus = null;
        }

        if (activeModal === overlay) {
            activeModal = null;
        }
    }
}

/**
 * Show a confirmation dialog
 * @param {Object} options - Confirmation options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Confirmation message
 * @param {string} options.confirmLabel - Confirm button label
 * @param {string} options.cancelLabel - Cancel button label
 * @param {string} options.variant - Confirm button variant
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
 */
export function confirm({
    title = 'Confirm',
    message = 'Are you sure?',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'primary'
} = {}) {
    return new Promise((resolve) => {
        const modal = showModal({
            title,
            content: `<p>${escapeHtml(message)}</p>`,
            size: 'sm',
            buttons: [
                {
                    label: cancelLabel,
                    variant: 'secondary',
                    onClick: () => {
                        resolve(false);
                    }
                },
                {
                    label: confirmLabel,
                    variant,
                    onClick: () => {
                        resolve(true);
                    }
                }
            ],
            onClose: () => resolve(false)
        });
        if (!modal) resolve(false);
    });
}

/**
 * Show an alert dialog
 * @param {Object} options - Alert options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Alert message
 * @param {string} options.buttonLabel - Button label
 * @returns {Promise<void>} Resolves when closed
 */
export function alert({
    title = 'Alert',
    message = '',
    buttonLabel = 'OK'
} = {}) {
    return new Promise((resolve) => {
        const modal = showModal({
            title,
            content: `<p>${escapeHtml(message)}</p>`,
            size: 'sm',
            buttons: [
                {
                    label: buttonLabel,
                    variant: 'primary',
                    onClick: () => resolve()
                }
            ],
            onClose: () => resolve()
        });
        if (!modal) resolve();
    });
}

/**
 * Show a prompt dialog
 * @param {Object} options - Prompt options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Prompt message
 * @param {string} options.defaultValue - Default input value
 * @param {string} options.placeholder - Input placeholder
 * @returns {Promise<string|null>} Resolves to input value or null if cancelled
 */
export function prompt({
    title = 'Input',
    message = '',
    defaultValue = '',
    placeholder = ''
} = {}) {
    return new Promise((resolve) => {
        const inputId = 'modal-prompt-input';
        const content = `
            ${message ? `<p>${escapeHtml(message)}</p>` : ''}
            <input type="text" id="${inputId}" class="form-input" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}">
        `;

        const modal = showModal({
            title,
            content,
            size: 'sm',
            buttons: [
                {
                    label: 'Cancel',
                    variant: 'secondary',
                    onClick: () => {
                        resolve(null);
                    }
                },
                {
                    label: 'OK',
                    variant: 'primary',
                    onClick: () => {
                        const input = document.getElementById(inputId);
                        resolve(input?.value || '');
                    }
                }
            ],
            onClose: () => resolve(null)
        });

        if (!modal) {
            resolve(null);
            return;
        }

        // Focus input
        setTimeout(() => {
            const input = document.getElementById(inputId);
            input?.focus();
            input?.select();
        }, 100);

        // Enter key to submit
        const input = document.getElementById(inputId);
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                resolve(input.value);
                modal.close();
            }
        });
    });
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Alias for confirm (commonly used name)
export { confirm as confirmModal };

export default {
    show: showModal,
    close: closeModal,
    confirm,
    confirmModal: confirm,
    alert,
    prompt
};
