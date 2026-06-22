/**
 * Modal Dialog Component
 * Displays modal dialogs with customizable content
 */

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
 * @param {Function} options.onClose - Callback when modal is closed
 * @returns {Object} Modal controller with close method
 */
export function showModal({
    title = '',
    content = '',
    buttons = [],
    size = 'md',
    closable = true,
    onClose = null
} = {}) {
    // Close any existing modal
    if (activeModal) {
        closeModal(activeModal);
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
                        <svg viewBox="0 0 20 20" fill="currentColor">
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
        buttons.forEach(({ label, onClick, variant = 'secondary', disabled = false }) => {
            const btn = document.createElement('button');
            btn.className = `btn btn-${variant}`;
            btn.textContent = label;
            btn.disabled = disabled;
            btn.addEventListener('click', () => {
                const result = onClick?.();
                // Close modal unless onClick returns false
                if (result !== false) {
                    closeModal(overlay);
                }
            });
            footer.appendChild(btn);
        });
    }

    overlay.appendChild(modal);

    // Close button handler
    if (closable && title) {
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn?.addEventListener('click', () => closeModal(overlay));
    }

    // Click outside to close
    if (closable) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay);
            }
        });
    }

    // Escape key to close
    const handleEscape = (e) => {
        if (e.key === 'Escape' && closable) {
            closeModal(overlay);
        }
    };
    document.addEventListener('keydown', handleEscape);

    // Store references
    overlay._onClose = onClose;
    overlay._escapeHandler = handleEscape;

    // Add to DOM
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

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
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) {
        focusable[0].focus();
    }

    // Trap focus within modal
    overlay.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;

        const focusableEls = modal.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

    activeModal = overlay;

    return {
        close: () => closeModal(overlay),
        element: modal,
        overlay
    };
}

/**
 * Close a modal
 * @param {HTMLElement} overlay - Modal overlay element
 */
export function closeModal(overlay = activeModal) {
    if (!overlay) return;

    overlay.classList.remove('modal-visible');
    overlay.classList.add('modal-hiding');

    // Remove escape handler
    if (overlay._escapeHandler) {
        document.removeEventListener('keydown', overlay._escapeHandler);
    }

    setTimeout(() => {
        // Call onClose callback
        overlay._onClose?.();

        // Remove from DOM
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }

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
    }, 260);
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
        showModal({
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
        showModal({
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
