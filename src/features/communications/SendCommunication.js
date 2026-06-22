/**
 * Send Communication Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Form for White Cell to send communications to teams.
 */

import { database } from '../../services/database.js';
import { sessionStore } from '../../stores/index.js';
import { gameStateStore } from '../../stores/index.js';
import { timelineStore, EVENT_TYPES } from '../../stores/index.js';
import { showToast } from '../../components/ui/Toast.js';
import { showModal } from '../../components/ui/Modal.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('SendCommunication');

/**
 * Communication types
 */
const COMM_TYPES = [
    { value: 'INJECT', label: 'Inject', description: 'New scenario element or development', icon: '💉' },
    { value: 'ANNOUNCEMENT', label: 'Announcement', description: 'Official game announcement', icon: '📢' },
    { value: 'GUIDANCE', label: 'Guidance', description: 'Clarification or procedural guidance', icon: '📋' }
];

/**
 * Recipient options
 */
const RECIPIENTS = [
    { value: 'blue', label: 'Blue Team' },
    { value: 'all', label: 'All Teams' }
];

/**
 * Create a send communication component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {Function} options.onSend - Send callback
 * @returns {Object} Component controller
 */
export function createSendCommunication(options = {}) {
    const { container, onSend } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    // Create component structure
    const wrapper = document.createElement('div');
    wrapper.className = 'send-communication';

    wrapper.innerHTML = `
        <div class="send-communication-header">
            <h3 class="send-communication-title">Send Communication</h3>
        </div>

        <form class="send-communication-form" id="commForm">
            <div class="form-group">
                <label class="form-label">Communication Type</label>
                <div class="comm-type-options" id="commTypeOptions">
                    ${COMM_TYPES.map((type, index) => `
                        <label class="comm-type-option ${index === 0 ? 'selected' : ''}">
                            <input
                                type="radio"
                                name="commType"
                                value="${type.value}"
                                ${index === 0 ? 'checked' : ''}
                            >
                            <span class="comm-type-icon">${type.icon}</span>
                            <span class="comm-type-label">${type.label}</span>
                            <span class="comm-type-desc">${type.description}</span>
                        </label>
                    `).join('')}
                </div>
            </div>

            <div class="form-group">
                <label class="form-label" for="commRecipient">Recipient</label>
                <select id="commRecipient" class="form-select" required>
                    ${RECIPIENTS.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
                </select>
            </div>

            <div class="form-group">
                <label class="form-label" for="commSubject">Subject (Optional)</label>
                <input
                    type="text"
                    id="commSubject"
                    class="form-input"
                    placeholder="Brief subject line..."
                    maxlength="100"
                >
            </div>

            <div class="form-group">
                <label class="form-label" for="commContent">Message *</label>
                <textarea
                    id="commContent"
                    class="form-input form-textarea"
                    rows="5"
                    placeholder="Enter your message..."
                    required
                ></textarea>
            </div>

            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Send Communication</button>
            </div>
        </form>
    `;

    container.appendChild(wrapper);

    const form = wrapper.querySelector('#commForm');
    const typeOptions = wrapper.querySelectorAll('.comm-type-option');

    // Handle type selection visual
    typeOptions.forEach(option => {
        option.addEventListener('click', () => {
            typeOptions.forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
        });
    });

    // Handle form submission
    form.addEventListener('submit', handleSubmit);

    /**
     * Handle form submission
     * @param {Event} e
     */
    async function handleSubmit(e) {
        e.preventDefault();

        const commType = form.querySelector('input[name="commType"]:checked').value;
        const recipient = form.querySelector('#commRecipient').value;
        const subject = form.querySelector('#commSubject').value.trim();
        const content = form.querySelector('#commContent').value.trim();

        if (!content) {
            showToast({ message: 'Please enter a message', type: 'error' });
            return;
        }

        const sessionId = sessionStore.getSessionId();
        if (!sessionId) {
            showToast({ message: 'No active session', type: 'error' });
            return;
        }

        try {
            // Save communication to database
            await database.createCommunication({
                session_id: sessionId,
                from_team: 'white_cell',
                to_team: recipient,
                message_type: commType,
                subject: subject || null,
                content,
                move: gameStateStore.getCurrentMove()
            });

            // Create timeline event
            await timelineStore.create({
                type: commType,
                content: subject || `${commType} to ${recipient}`,
                team: 'white_cell',
                move: gameStateStore.getCurrentMove(),
                metadata: {
                    to_team: recipient,
                    content_preview: content.substring(0, 100)
                }
            });

            showToast({
                message: `${getTypeLabel(commType)} sent to ${getRecipientLabel(recipient)}`,
                type: 'success'
            });

            // Reset form
            form.reset();
            typeOptions.forEach((o, i) => {
                o.classList.toggle('selected', i === 0);
            });

            if (onSend) onSend({ commType, recipient, subject, content });

        } catch (err) {
            logger.error('Failed to send communication:', err);
            showToast({ message: 'Failed to send communication', type: 'error' });
        }
    }

    /**
     * Get type label
     * @param {string} value
     * @returns {string}
     */
    function getTypeLabel(value) {
        return COMM_TYPES.find(t => t.value === value)?.label || value;
    }

    /**
     * Get recipient label
     * @param {string} value
     * @returns {string}
     */
    function getRecipientLabel(value) {
        return RECIPIENTS.find(r => r.value === value)?.label || value;
    }

    /**
     * Destroy component
     */
    function destroy() {
        wrapper.remove();
    }

    return { destroy };
}

/**
 * Show send communication modal
 * @param {Object} options
 * @returns {Promise}
 */
export function showSendCommunicationModal(options = {}) {
    return new Promise((resolve) => {
        const content = document.createElement('div');

        content.innerHTML = `
            <form id="modalCommForm">
                <div class="form-group">
                    <label class="form-label" for="modalCommType">Type</label>
                    <select id="modalCommType" class="form-select" required>
                        ${COMM_TYPES.map(t => `<option value="${t.value}">${t.icon} ${t.label}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label" for="modalCommRecipient">Recipient</label>
                    <select id="modalCommRecipient" class="form-select" required>
                        ${RECIPIENTS.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label" for="modalCommContent">Message *</label>
                    <textarea
                        id="modalCommContent"
                        class="form-input form-textarea"
                        rows="4"
                        placeholder="Enter your message..."
                        required
                    ></textarea>
                </div>
            </form>
        `;

        showModal({
            title: 'Send Communication',
            content,
            size: 'md',
            buttons: [
                {
                    text: 'Cancel',
                    variant: 'secondary',
                    onClick: (modal) => {
                        modal.close();
                        resolve(null);
                    }
                },
                {
                    text: 'Send',
                    variant: 'primary',
                    onClick: async (modal) => {
                        const commType = content.querySelector('#modalCommType').value;
                        const recipient = content.querySelector('#modalCommRecipient').value;
                        const message = content.querySelector('#modalCommContent').value.trim();

                        if (!message) {
                            showToast({ message: 'Please enter a message', type: 'error' });
                            return;
                        }

                        const sessionId = sessionStore.getSessionId();
                        if (!sessionId) return;

                        try {
                            await database.createCommunication({
                                session_id: sessionId,
                                from_team: 'white_cell',
                                to_team: recipient,
                                message_type: commType,
                                content: message,
                                move: gameStateStore.getCurrentMove()
                            });

                            await timelineStore.create({
                                type: commType,
                                content: `${commType} to ${recipient}`,
                                team: 'white_cell',
                                move: gameStateStore.getCurrentMove()
                            });

                            showToast({ message: 'Communication sent', type: 'success' });
                            modal.close();
                            resolve({ commType, recipient, message });
                        } catch (err) {
                            showToast({ message: 'Failed to send', type: 'error' });
                        }
                    }
                }
            ]
        });
    });
}

export default createSendCommunication;
