/**
 * RFI Response Component (White Cell)
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Interface for White Cell to respond to RFIs.
 */

import { requestsStore, REQUEST_STATUS } from '../../stores/index.js';
import { createStatusBadge } from '../../components/ui/Badge.js';
import { showModal } from '../../components/ui/Modal.js';
import { showToast } from '../../components/ui/Toast.js';
import { showInlineLoader } from '../../components/ui/Loader.js';
import { formatRelativeTime } from '../../utils/formatting.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('RfiResponse');

/**
 * Create an RFI response queue component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {boolean} options.showAll - Show all RFIs or just pending
 * @returns {Object} Component controller
 */
export function createRfiResponseQueue(options = {}) {
    const { container, showAll = false } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let showAllRfis = showAll;
    let unsubscribe = null;

    // Create component structure
    const wrapper = document.createElement('div');
    wrapper.className = 'rfi-response-wrapper';

    wrapper.innerHTML = `
        <div class="rfi-response-header">
            <div class="rfi-response-title">
                <h3>RFI Queue</h3>
                <span class="badge badge-warning" id="pendingCount">0</span>
            </div>
            <div class="rfi-response-controls">
                <label class="checkbox-label">
                    <input type="checkbox" id="showAllToggle" ${showAllRfis ? 'checked' : ''}>
                    <span>Show all RFIs</span>
                </label>
            </div>
        </div>
        <div class="rfi-response-list" id="responseList"></div>
    `;

    container.appendChild(wrapper);

    const responseList = wrapper.querySelector('#responseList');
    const pendingCountBadge = wrapper.querySelector('#pendingCount');
    const showAllToggle = wrapper.querySelector('#showAllToggle');

    // Handle show all toggle
    showAllToggle.addEventListener('change', (e) => {
        showAllRfis = e.target.checked;
        render();
    });

    /**
     * Render the response queue
     */
    function render() {
        const rfis = getRfisToRespond();

        // Update pending count
        const pendingCount = requestsStore.getPendingCount();
        pendingCountBadge.textContent = pendingCount;

        if (rfis.length === 0) {
            responseList.innerHTML = `
                <div class="empty-state">
                    <h3 class="empty-state-title">No RFIs</h3>
                    <p class="empty-state-message">
                        ${showAllRfis ? 'No RFIs have been submitted' : 'All RFIs have been responded to'}
                    </p>
                </div>
            `;
            return;
        }

        responseList.innerHTML = '';

        rfis.forEach(rfi => {
            const card = createResponseCard(rfi);
            responseList.appendChild(card);
        });
    }

    /**
     * Get RFIs to respond to
     * @returns {Array}
     */
    function getRfisToRespond() {
        let rfis;

        if (showAllRfis) {
            rfis = requestsStore.getAll();
        } else {
            rfis = requestsStore.getPending();
        }

        // Sort by created_at ascending (oldest first)
        return rfis.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    /**
     * Create a response card
     * @param {Object} rfi - RFI data
     * @returns {HTMLElement}
     */
    function createResponseCard(rfi) {
        const card = document.createElement('div');
        card.className = 'card card-bordered rfi-response-card';
        card.dataset.rfiId = rfi.id;

        const statusBadge = createStatusBadge(rfi.status);
        const isPending = rfi.status === REQUEST_STATUS.PENDING;
        const queryText = rfi.query || rfi.question || '';

        card.innerHTML = `
            <div class="rfi-response-card-header">
                <div class="rfi-response-card-meta">
                    <span class="rfi-response-card-team">${rfi.team || 'Unknown'}</span>
                    <span>•</span>
                    <span>${formatRelativeTime(rfi.created_at)}</span>
                    <span>•</span>
                    <span>Move ${rfi.move || 1}</span>
                </div>
                ${statusBadge.outerHTML}
            </div>

            <div class="rfi-response-card-body">
                <p class="rfi-response-card-question">${escapeHtml(queryText)}</p>
                ${rfi.context ? `<p class="rfi-response-card-context"><em>Context:</em> ${escapeHtml(rfi.context)}</p>` : ''}
            </div>

            ${rfi.response ? `
                <div class="rfi-response-card-answer">
                    <strong>Response:</strong>
                    <p>${escapeHtml(rfi.response)}</p>
                </div>
            ` : ''}

            ${isPending ? `
                <div class="rfi-response-card-actions">
                    <button class="btn btn-primary btn-sm respond-btn">Respond</button>
                    <button class="btn btn-ghost btn-sm withdraw-btn">Withdraw</button>
                </div>
            ` : ''}
        `;

        // Bind action buttons
        if (isPending) {
            card.querySelector('.respond-btn').addEventListener('click', () => {
                showResponseModal(rfi);
            });

            card.querySelector('.withdraw-btn').addEventListener('click', () => {
                showWithdrawModal(rfi);
            });
        }

        return card;
    }

    /**
     * Show response modal
     * @param {Object} rfi - RFI to respond to
     */
    function showResponseModal(rfi) {
        const content = document.createElement('div');
        const queryText = rfi.query || rfi.question || '';

        content.innerHTML = `
            <div class="rfi-response-modal-question" style="background: var(--color-gray-50); padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
                <p style="font-size: var(--text-sm); color: var(--color-gray-500); margin-bottom: var(--space-2);">
                    From: ${rfi.team} • Move ${rfi.move}
                </p>
                <p style="font-weight: var(--font-medium);">${escapeHtml(queryText)}</p>
                ${rfi.context ? `<p style="font-size: var(--text-sm); color: var(--color-gray-600); margin-top: var(--space-2);"><em>Context:</em> ${escapeHtml(rfi.context)}</p>` : ''}
            </div>

            <form id="responseForm">
                <div class="form-group">
                    <label class="form-label" for="responseText">Your Response *</label>
                    <textarea
                        id="responseText"
                        class="form-input form-textarea"
                        rows="5"
                        placeholder="Enter your response..."
                        required
                    ></textarea>
                </div>
            </form>
        `;

        showModal({
            title: 'Respond to RFI',
            content,
            size: 'md',
            buttons: [
                {
                    text: 'Cancel',
                    variant: 'secondary',
                    onClick: (modal) => modal.close()
                },
                {
                    text: 'Send Response',
                    variant: 'primary',
                    onClick: (modal) => handleResponse(modal, rfi)
                }
            ]
        });
    }

    /**
     * Handle response submission
     * @param {Object} modal - Modal instance
     * @param {Object} rfi - RFI being responded to
     */
    async function handleResponse(modal, rfi) {
        const responseText = document.getElementById('responseText').value.trim();

        if (!responseText) {
            showToast({ message: 'Please enter a response', type: 'error' });
            return;
        }

        try {
            await requestsStore.respond(rfi.id, responseText, 'white_cell');
            showToast({ message: 'Response sent successfully', type: 'success' });
            modal.close();
            render();
        } catch (err) {
            logger.error('Failed to send response:', err);
            showToast({ message: 'Failed to send response', type: 'error' });
        }
    }

    /**
     * Show withdraw modal
     * @param {Object} rfi - RFI to withdraw
     */
    function showWithdrawModal(rfi) {
        const content = document.createElement('div');
        const queryText = rfi.query || rfi.question || '';

        content.innerHTML = `
            <div class="rfi-decline-modal-question" style="background: var(--color-gray-50); padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
                <p style="font-weight: var(--font-medium);">${escapeHtml(queryText)}</p>
            </div>

            <form id="declineForm">
                <div class="form-group">
                    <label class="form-label" for="declineReason">Reason for Withdrawal (Optional)</label>
                    <textarea
                        id="declineReason"
                        class="form-input form-textarea"
                        rows="3"
                        placeholder="Explain why this RFI is being withdrawn..."
                    ></textarea>
                </div>
            </form>
        `;

        showModal({
            title: 'Withdraw RFI',
            content,
            size: 'sm',
            buttons: [
                {
                    text: 'Cancel',
                    variant: 'secondary',
                    onClick: (modal) => modal.close()
                },
                {
                    text: 'Withdraw RFI',
                    variant: 'danger',
                    onClick: (modal) => handleWithdraw(modal, rfi)
                }
            ]
        });
    }

    /**
     * Handle withdraw
     * @param {Object} modal - Modal instance
     * @param {Object} rfi - RFI being withdrawn
     */
    async function handleWithdraw(modal, rfi) {
        const reason = document.getElementById('declineReason').value.trim();

        try {
            await requestsStore.withdraw(rfi.id, reason);
            showToast({ message: 'RFI withdrawn', type: 'info' });
            modal.close();
            render();
        } catch (err) {
            logger.error('Failed to withdraw RFI:', err);
            showToast({ message: 'Failed to withdraw RFI', type: 'error' });
        }
    }

    /**
     * Initialize component
     */
    function init() {
        unsubscribe = requestsStore.subscribe((event, data) => {
            render();
        });

        render();
    }

    /**
     * Refresh the queue
     */
    async function refresh() {
        const loader = showInlineLoader(responseList, { message: 'Loading RFIs...' });
        try {
            await requestsStore.loadRequests();
            render();
        } finally {
            if (loader) loader.hide();
        }
    }

    /**
     * Destroy component
     */
    function destroy() {
        if (unsubscribe) {
            unsubscribe();
        }
        wrapper.remove();
    }

    // Initialize
    init();

    return {
        render,
        refresh,
        destroy,
        getPendingCount: () => requestsStore.getPendingCount()
    };
}

/**
 * Escape HTML
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export default createRfiResponseQueue;
