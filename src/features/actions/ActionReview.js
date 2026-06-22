/**
 * Action Review Component (White Cell)
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Interface for White Cell to review and adjudicate actions.
 */

import { actionsStore } from '../../stores/index.js';
import { timelineStore, EVENT_TYPES } from '../../stores/index.js';
import { createActionCard } from './ActionCard.js';
import { showModal, confirmModal } from '../../components/ui/Modal.js';
import { showToast } from '../../components/ui/Toast.js';
import { showInlineLoader } from '../../components/ui/Loader.js';
import { ENUMS } from '../../core/enums.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ActionReview');

/**
 * Create an action review component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {boolean} options.showAll - Show all actions or just pending
 * @returns {Object} Component controller
 */
export function createActionReview(options = {}) {
    const { container, showAll = false } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let showAllActions = showAll;
    let unsubscribe = null;

    // Create component structure
    const wrapper = document.createElement('div');
    wrapper.className = 'action-review-wrapper';

    wrapper.innerHTML = `
        <div class="action-review-header">
            <div class="action-review-title">
                <h3>Action Review</h3>
                <span class="badge badge-primary" id="pendingCount">0</span>
            </div>
            <div class="action-review-controls">
                <label class="checkbox-label">
                    <input type="checkbox" id="showAllToggle" ${showAllActions ? 'checked' : ''}>
                    <span>Show all actions</span>
                </label>
            </div>
        </div>
        <div class="action-review-list" id="reviewList"></div>
    `;

    container.appendChild(wrapper);

    const reviewList = wrapper.querySelector('#reviewList');
    const pendingCountBadge = wrapper.querySelector('#pendingCount');
    const showAllToggle = wrapper.querySelector('#showAllToggle');

    // Handle show all toggle
    showAllToggle.addEventListener('change', (e) => {
        showAllActions = e.target.checked;
        render();
    });

    /**
     * Render the review list
     */
    function render() {
        const actions = getActionsToReview();

        // Update pending count
        const pendingCount = actionsStore.getByStatus(ENUMS.ACTION_STATUS.SUBMITTED).length;
        pendingCountBadge.textContent = pendingCount;

        if (actions.length === 0) {
            reviewList.innerHTML = `
                <div class="empty-state">
                    <h3 class="empty-state-title">No Actions to Review</h3>
                    <p class="empty-state-message">
                        ${showAllActions ? 'No actions have been created yet' : 'No actions are currently awaiting White Cell deliberation'}
                    </p>
                </div>
            `;
            return;
        }

        reviewList.innerHTML = '';

        actions.forEach(action => {
            const card = createActionCard(action, {
                showActions: true,
                canAdjudicate: action.status === ENUMS.ACTION_STATUS.SUBMITTED,
                onAdjudicate: () => showAdjudicationModal(action)
            });
            reviewList.appendChild(card);
        });
    }

    /**
     * Get actions to review based on current filter
     * @returns {Array}
     */
    function getActionsToReview() {
        let actions;

        if (showAllActions) {
            actions = actionsStore.getAll();
        } else {
            actions = actionsStore.getByStatus(ENUMS.ACTION_STATUS.SUBMITTED);
        }

        // Sort by created_at ascending (oldest first for review)
        return actions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    /**
     * Show adjudication modal
     * @param {Object} action - Action to adjudicate
     */
    function showAdjudicationModal(action) {
        const content = document.createElement('div');
        const targets = Array.isArray(action.targets)
            ? action.targets
            : (action.target ? [action.target] : []);
        const targetLabel = targets.length ? targets.join(', ') : 'Not specified';
        const exposureType = action.exposure_type || 'Not specified';
        const goal = action.goal || action.title || 'Untitled action';
        const expectedOutcomes = action.expected_outcomes || action.description || '';

        const outcomeOptions = Object.entries(ENUMS.OUTCOMES)
            .map(([key, value]) => `<option value="${value}">${value}</option>`)
            .join('');

        content.innerHTML = `
            <div class="adjudication-action-summary" style="background: var(--color-gray-50); padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
                <h4 style="margin-bottom: var(--space-2);">${escapeHtml(goal)}</h4>
                <p style="font-size: var(--text-sm); color: var(--color-gray-600); margin-bottom: var(--space-2);">
                    <strong>Mechanism:</strong> ${action.mechanism} |
                    <strong>Team:</strong> ${action.team} |
                    <strong>Move:</strong> ${action.move}
                </p>
                <p style="font-size: var(--text-sm); margin-bottom: var(--space-2);">
                    <strong>Targets:</strong> ${escapeHtml(targetLabel)} |
                    <strong>Exposure:</strong> ${escapeHtml(exposureType)}
                </p>
                <p style="font-size: var(--text-sm);">${escapeHtml(expectedOutcomes)}</p>
                ${action.ally_contingencies ? `<p style="font-size: var(--text-sm); margin-top: var(--space-2);"><strong>Ally Contingencies:</strong> ${escapeHtml(action.ally_contingencies)}</p>` : ''}
                ${action.rationale ? `<p style="font-size: var(--text-sm); margin-top: var(--space-2);"><strong>Rationale:</strong> ${escapeHtml(action.rationale)}</p>` : ''}
            </div>

            <form id="adjudicationForm">
                <div class="form-group">
                    <label class="form-label" for="outcomeSelect">Outcome *</label>
                    <select id="outcomeSelect" class="form-select" required>
                        <option value="">Select outcome</option>
                        ${outcomeOptions}
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label" for="adjudicationNotes">Notes</label>
                    <textarea
                        id="adjudicationNotes"
                        class="form-input form-textarea"
                        rows="4"
                        placeholder="Explain the outcome, provide context, describe effects..."
                    ></textarea>
                </div>
            </form>
        `;

        showModal({
            title: 'Record Deliberation',
            content,
            size: 'md',
            buttons: [
                {
                    text: 'Cancel',
                    variant: 'secondary',
                    onClick: (modal) => modal.close()
                },
                {
                    text: 'Record Deliberation',
                    variant: 'primary',
                    onClick: (modal) => handleAdjudication(modal, action)
                }
            ]
        });
    }

    /**
     * Handle adjudication submission
     * @param {Object} modal - Modal instance
     * @param {Object} action - Action being adjudicated
     */
    async function handleAdjudication(modal, action) {
        const outcome = document.getElementById('outcomeSelect').value;
        const notes = document.getElementById('adjudicationNotes').value.trim();

        if (!outcome) {
            showToast({ message: 'Please select an outcome', type: 'error' });
            return;
        }

        try {
            // Adjudicate the action
            await actionsStore.adjudicate(action.id, outcome, notes);

            // Create timeline event
            await timelineStore.create({
                type: EVENT_TYPES.ACTION_ADJUDICATED,
                content: `White Cell deliberation recorded for "${action.goal || action.title || 'Action'}": ${outcome}`,
                team: 'white_cell',
                move: action.move,
                related_id: action.id,
                metadata: { outcome, notes }
            });

            showToast({ message: 'Deliberation recorded', type: 'success' });
            modal.close();
            render();

        } catch (err) {
            logger.error('Failed to adjudicate action:', err);
            showToast({ message: 'Failed to record deliberation', type: 'error' });
        }
    }

    /**
     * Initialize component
     */
    function init() {
        // Subscribe to store changes
        unsubscribe = actionsStore.subscribe((event, data) => {
            render();
        });

        // Initial render
        render();
    }

    /**
     * Refresh the list
     */
    async function refresh() {
        const loader = showInlineLoader(reviewList, { message: 'Loading actions...' });
        try {
            await actionsStore.loadActions();
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
        getPendingCount: () => actionsStore.getByStatus(ENUMS.ACTION_STATUS.SUBMITTED).length
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

export default createActionReview;
