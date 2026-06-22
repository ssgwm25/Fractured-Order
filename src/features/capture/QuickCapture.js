/**
 * Quick Capture Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Fast capture form for notes, moments, and quotes.
 */

import { timelineStore, EVENT_TYPES } from '../../stores/index.js';
import { gameStateStore } from '../../stores/index.js';
import { showToast } from '../../components/ui/Toast.js';
import { createLogger } from '../../utils/logger.js';
import { getUserMessage } from '../../core/errors.js';

const logger = createLogger('QuickCapture');

/**
 * Capture types configuration
 */
const CAPTURE_TYPES = [
    {
        value: EVENT_TYPES.NOTE,
        label: 'Note',
        icon: '📝',
        placeholder: 'General observation or note...',
        color: 'default'
    },
    {
        value: EVENT_TYPES.MOMENT,
        label: 'Moment',
        icon: '⭐',
        placeholder: 'Key moment or decision point...',
        color: 'warning'
    },
    {
        value: EVENT_TYPES.QUOTE,
        label: 'Quote',
        icon: '💬',
        placeholder: '"Direct quote from participant..."',
        color: 'info'
    }
];

/**
 * Create a quick capture component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {string} options.team - Team identifier
 * @param {string} options.actor - Actor name (for attribution)
 * @param {Function} options.onCapture - Capture callback
 * @returns {Object} Component controller
 */
export function createQuickCapture(options = {}) {
    const { container, team = 'blue', actor = null, onCapture } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let selectedType = CAPTURE_TYPES[0].value;
    let isSubmitting = false;

    // Create component structure
    const wrapper = document.createElement('div');
    wrapper.className = 'quick-capture';

    wrapper.innerHTML = `
        <div class="quick-capture-types">
            ${CAPTURE_TYPES.map((type, index) => `
                <button
                    type="button"
                    class="quick-capture-type-btn ${index === 0 ? 'active' : ''}"
                    data-type="${type.value}"
                    title="${type.label}"
                    aria-label="${type.label} capture type"
                >
                    <span class="quick-capture-type-icon">${type.icon}</span>
                    <span class="quick-capture-type-label">${type.label}</span>
                </button>
            `).join('')}
        </div>

        <form class="quick-capture-form" id="captureForm">
            <div class="quick-capture-input-wrapper">
                <textarea
                    class="form-input quick-capture-input"
                    id="captureContent"
                    placeholder="${CAPTURE_TYPES[0].placeholder}"
                    rows="3"
                ></textarea>
            </div>
            <div class="quick-capture-actions">
                <span class="quick-capture-hint">Press Ctrl+Enter to save</span>
                <button type="submit" class="btn btn-primary btn-sm">Save Capture</button>
            </div>
        </form>
    `;

    container.appendChild(wrapper);

    const typeButtons = wrapper.querySelectorAll('.quick-capture-type-btn');
    const contentInput = wrapper.querySelector('#captureContent');
    const form = wrapper.querySelector('#captureForm');
    const submitButton = form.querySelector('button[type="submit"]');

    // Handle type selection
    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            typeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            selectedType = btn.dataset.type;
            const typeConfig = CAPTURE_TYPES.find(t => t.value === selectedType);
            contentInput.placeholder = typeConfig?.placeholder || 'Enter capture...';
            contentInput.focus();
        });
    });

    // Handle form submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitCapture();
    });

    // Handle Ctrl+Enter shortcut
    contentInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            submitCapture();
        }
    });

    /**
     * Submit a capture
     */
    async function submitCapture() {
        if (isSubmitting) return;
        const content = contentInput.value.trim();

        if (!content) {
            showToast({ message: 'Please enter content', type: 'error' });
            contentInput.focus();
            return;
        }

        isSubmitting = true;
        form.setAttribute('aria-busy', 'true');
        setButtonPending(submitButton, true, 'Saving...');
        try {
            const metadata = actor ? { actor } : null;
            const captureData = {
                type: selectedType,
                content,
                team,
                move: gameStateStore.getCurrentMove(),
                phase: gameStateStore.getCurrentPhase(),
                metadata
            };

            const result = await timelineStore.create(captureData);

            showToast({
                message: `${getTypeLabel(selectedType)} saved`,
                type: 'success'
            });

            // Clear input
            contentInput.value = '';

            if (onCapture) onCapture(result);

            logger.info('Capture saved:', selectedType);
        } catch (err) {
            logger.error('Failed to save capture:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to save capture. Check the note and try again.'
                }),
                type: 'error'
            });
        } finally {
            isSubmitting = false;
            form.setAttribute('aria-busy', 'false');
            setButtonPending(submitButton, false);
        }
    }

    /**
     * Get type label
     * @param {string} type
     * @returns {string}
     */
    function getTypeLabel(type) {
        const config = CAPTURE_TYPES.find(t => t.value === type);
        return config?.label || 'Capture';
    }

    /**
     * Set capture type
     * @param {string} type
     */
    function setType(type) {
        const btn = wrapper.querySelector(`[data-type="${type}"]`);
        if (btn) {
            btn.click();
        }
    }

    /**
     * Focus the input
     */
    function focus() {
        contentInput.focus();
    }

    /**
     * Clear the input
     */
    function clear() {
        contentInput.value = '';
    }

    /**
     * Destroy component
     */
    function destroy() {
        wrapper.remove();
    }

    return {
        setType,
        focus,
        clear,
        destroy
    };
}

/**
 * Create a minimal capture input (single line)
 * @param {Object} options
 * @returns {HTMLElement}
 */
export function createMinimalCapture(options = {}) {
    const { team = 'blue', type = EVENT_TYPES.NOTE, placeholder = 'Quick note...', onCapture } = options;

    const wrapper = document.createElement('div');
    wrapper.className = 'minimal-capture';

    wrapper.innerHTML = `
        <input
            type="text"
            class="form-input minimal-capture-input"
            placeholder="${placeholder}"
        >
        <button type="button" class="btn btn-primary btn-sm minimal-capture-btn" aria-label="Save quick note">+</button>
    `;

    const input = wrapper.querySelector('input');
    const btn = wrapper.querySelector('button');
    let isSubmitting = false;

    async function submit() {
        if (isSubmitting) return;
        const content = input.value.trim();
        if (!content) return;

        isSubmitting = true;
        wrapper.setAttribute('aria-busy', 'true');
        setButtonPending(btn, true, 'Saving...');
        try {
            const result = await timelineStore.create({
                type,
                content,
                team,
                move: gameStateStore.getCurrentMove()
            });

            input.value = '';
            showToast({ message: 'Saved', type: 'success' });

            if (onCapture) onCapture(result);
        } catch (err) {
            logger.error('Failed to save capture:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Failed to save capture. Check the note and try again.'
                }),
                type: 'error'
            });
        } finally {
            isSubmitting = false;
            wrapper.setAttribute('aria-busy', 'false');
            setButtonPending(btn, false);
        }
    }

    btn.addEventListener('click', submit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        }
    });

    return wrapper;
}

function setButtonPending(button, isPending, pendingLabel = 'Saving...') {
    if (!button) return;
    if (!button.dataset.defaultLabel) {
        button.dataset.defaultLabel = button.textContent;
    }

    button.disabled = isPending;
    button.textContent = isPending ? pendingLabel : button.dataset.defaultLabel;
}

export default createQuickCapture;
