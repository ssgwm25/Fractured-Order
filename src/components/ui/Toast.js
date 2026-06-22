/**
 * Toast Notification Component
 * Displays temporary notification messages
 */

import { CONFIG } from '../../core/config.js';

let toastContainer = null;

/**
 * Create the toast container if it doesn't exist
 * @returns {HTMLElement} Toast container element
 */
function getContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.setAttribute('role', 'region');
        toastContainer.setAttribute('aria-live', 'polite');
        toastContainer.setAttribute('aria-label', 'Notifications');
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

function normalizeToastArgs(messageOrConfig, options = {}) {
    const defaults = {
        type: 'info',
        duration: CONFIG.TOAST_DURATION_MS,
        dismissible: true
    };

    if (messageOrConfig && typeof messageOrConfig === 'object' && !Array.isArray(messageOrConfig)) {
        const merged = {
            ...defaults,
            ...messageOrConfig,
            ...options
        };

        return {
            message: String(messageOrConfig.message ?? ''),
            type: merged.type,
            duration: merged.duration,
            dismissible: merged.dismissible
        };
    }

    const merged = {
        ...defaults,
        ...options
    };

    return {
        message: String(messageOrConfig ?? ''),
        type: merged.type,
        duration: merged.duration,
        dismissible: merged.dismissible
    };
}

/**
 * Show a toast notification
 * Supports both:
 * - showToast('Message', { type: 'success' })
 * - showToast({ message: 'Message', type: 'success' })
 * @param {string|Object} messageOrConfig - Message text or config object
 * @param {Object} options - Toast options
 * @param {'info'|'success'|'error'|'warning'} options.type - Toast type
 * @param {number} options.duration - Duration in milliseconds
 * @param {boolean} options.dismissible - Whether toast can be dismissed
 * @returns {HTMLElement} Toast element
 */
export function showToast(messageOrConfig, options = {}) {
    const {
        message,
        type,
        duration,
        dismissible
    } = normalizeToastArgs(messageOrConfig, options);

    const container = getContainer();

    const toast = document.createElement('div');
    const urgent = type === 'error' || type === 'warning';
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', urgent ? 'alert' : 'status');
    toast.setAttribute('aria-live', urgent ? 'assertive' : 'polite');
    toast.setAttribute('aria-atomic', 'true');

    // Icon based on type
    const icons = {
        info: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>`,
        success: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>`,
        error: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>`,
        warning: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>`
    };

    toast.innerHTML = `
        ${icons[type]}
        <span class="toast-message">${escapeHtml(message)}</span>
        ${dismissible ? `
            <button class="toast-dismiss" aria-label="Dismiss">
                <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
            </button>
        ` : ''}
    `;

    // Add dismiss handler
    if (dismissible) {
        const dismissBtn = toast.querySelector('.toast-dismiss');
        dismissBtn.addEventListener('click', () => dismissToast(toast));
    }

    container.appendChild(toast);

    // Trigger the slide-in only after the hidden start state has painted (double
    // rAF), otherwise the browser skips the transition and the toast pops in.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add('toast-visible');
        });
    });

    // Auto dismiss
    if (duration > 0) {
        setTimeout(() => dismissToast(toast), duration);
    }

    return toast;
}

/**
 * Dismiss a toast
 * @param {HTMLElement} toast - Toast element to dismiss
 */
export function dismissToast(toast) {
    if (!toast || !toast.parentNode) return;

    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');

    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

/**
 * Clear all toasts
 */
export function clearAllToasts() {
    const container = getContainer();
    const toasts = container.querySelectorAll('.toast');
    toasts.forEach(toast => dismissToast(toast));
}

/**
 * Show a success toast
 * @param {string} message - Message to display
 * @param {Object} options - Toast options
 */
export function showSuccess(message, options = {}) {
    return showToast(message, { ...options, type: 'success' });
}

/**
 * Show an error toast
 * @param {string} message - Message to display
 * @param {Object} options - Toast options
 */
export function showError(message, options = {}) {
    return showToast(message, {
        duration: CONFIG.TOAST_ERROR_DURATION_MS,
        ...options,
        type: 'error'
    });
}

/**
 * Show a warning toast
 * @param {string} message - Message to display
 * @param {Object} options - Toast options
 */
export function showWarning(message, options = {}) {
    return showToast(message, { ...options, type: 'warning' });
}

/**
 * Show an info toast
 * @param {string} message - Message to display
 * @param {Object} options - Toast options
 */
export function showInfo(message, options = {}) {
    return showToast(message, { ...options, type: 'info' });
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export default {
    show: showToast,
    success: showSuccess,
    error: showError,
    warning: showWarning,
    info: showInfo,
    dismiss: dismissToast,
    clearAll: clearAllToasts
};
