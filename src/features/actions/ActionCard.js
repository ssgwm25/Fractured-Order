/**
 * Action Card Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Displays a single action with status, details, and available actions.
 */

import { createStatusBadge, createPriorityBadge, createOutcomeBadge } from '../../components/ui/Badge.js';
import { formatRelativeTime } from '../../utils/formatting.js';
import { ENUMS } from '../../core/enums.js';

/**
 * Create an action card
 * @param {Object} action - Action data
 * @param {Object} options - Display options
 * @param {boolean} options.showActions - Show action buttons
 * @param {boolean} options.canEdit - Can edit action
 * @param {boolean} options.canDelete - Can delete action
 * @param {boolean} options.canSubmit - Can submit action
 * @param {boolean} options.canAdjudicate - Can adjudicate action
 * @param {Function} options.onEdit - Edit callback
 * @param {Function} options.onDelete - Delete callback
 * @param {Function} options.onSubmit - Submit callback
 * @param {Function} options.onAdjudicate - Adjudicate callback
 * @param {Function} options.onClick - Card click callback
 * @returns {HTMLElement}
 */
export function createActionCard(action, options = {}) {
    const {
        showActions = true,
        canEdit = false,
        canDelete = false,
        canSubmit = false,
        canAdjudicate = false,
        onEdit,
        onDelete,
        onSubmit,
        onAdjudicate,
        onClick
    } = options;

    const card = document.createElement('div');
    card.className = 'card card-bordered card-hoverable action-card';
    card.dataset.actionId = action.id;

    const statusBadge = createStatusBadge(action.status || 'draft');
    const priorityBadge = createPriorityBadge(action.priority || 'NORMAL');
    const goal = action.goal || action.title || 'Untitled action';
    const expectedOutcomes = action.expected_outcomes || action.description || 'No expected outcomes';
    const targets = Array.isArray(action.targets)
        ? action.targets
        : (action.target ? [action.target] : []);
    const targetLabel = targets.length ? targets.join(', ') : 'Not specified';
    const exposureType = action.exposure_type || 'Not specified';

    let outcomeBadgeHtml = '';
    if (action.outcome) {
        const outcomeBadge = createOutcomeBadge(action.outcome);
        outcomeBadgeHtml = outcomeBadge.outerHTML;
    }

    card.innerHTML = `
        <div class="action-card-header">
            <div class="action-card-title-row">
                <h3 class="action-card-title">${escapeHtml(goal)}</h3>
                <div class="action-card-badges">
                    ${statusBadge.outerHTML}
                    ${priorityBadge.outerHTML}
                    ${outcomeBadgeHtml}
                </div>
            </div>
            <p class="action-card-meta">
                <span class="action-card-mechanism">${action.mechanism || 'No mechanism'}</span>
                <span class="action-card-separator">•</span>
                <span class="action-card-move">Move ${action.move || 1}</span>
                ${action.team ? `<span class="action-card-separator">•</span><span class="action-card-team">${action.team}</span>` : ''}
            </p>
        </div>

        <div class="action-card-body">
            <p class="action-card-description">${escapeHtml(expectedOutcomes)}</p>

            ${targets.length || action.sector || action.exposure_type ? `
                <div class="action-card-details">
                    <span class="action-card-detail"><strong>Targets:</strong> ${escapeHtml(targetLabel)}</span>
                    ${action.sector ? `<span class="action-card-detail"><strong>Sector:</strong> ${action.sector}</span>` : ''}
                    ${action.exposure_type ? `<span class="action-card-detail"><strong>Exposure:</strong> ${escapeHtml(exposureType)}</span>` : ''}
                </div>
            ` : ''}

            ${action.ally_contingencies ? `
                <div class="action-card-ally">
                    <strong>Ally Contingencies:</strong> ${escapeHtml(action.ally_contingencies)}
                </div>
            ` : ''}

            ${action.rationale ? `
                <div class="action-card-rationale">
                    <strong>Rationale:</strong> ${escapeHtml(action.rationale)}
                </div>
            ` : ''}

            ${action.adjudication_notes ? `
                <div class="action-card-adjudication">
                    <strong>White Cell Notes:</strong> ${escapeHtml(action.adjudication_notes)}
                </div>
            ` : ''}
        </div>

        <div class="action-card-footer">
            <span class="action-card-timestamp">${formatRelativeTime(action.created_at)}</span>

            ${showActions ? `
                <div class="action-card-actions">
                    ${canEdit && action.status === ENUMS.ACTION_STATUS.DRAFT ? `
                        <button class="btn btn-secondary btn-sm edit-btn">Edit</button>
                    ` : ''}
                    ${canSubmit && action.status === ENUMS.ACTION_STATUS.DRAFT ? `
                        <button class="btn btn-primary btn-sm submit-btn">Submit</button>
                    ` : ''}
                    ${canAdjudicate && action.status === ENUMS.ACTION_STATUS.SUBMITTED ? `
                        <button class="btn btn-primary btn-sm adjudicate-btn">Record Deliberation</button>
                    ` : ''}
                    ${canDelete && action.status === ENUMS.ACTION_STATUS.DRAFT ? `
                        <button class="btn btn-ghost btn-sm text-error delete-btn">Delete</button>
                    ` : ''}
                </div>
            ` : ''}
        </div>
    `;

    // Add click handler for card
    if (onClick) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking on buttons
            if (e.target.closest('button')) return;
            onClick(action);
        });
    }

    // Bind button handlers
    const editBtn = card.querySelector('.edit-btn');
    if (editBtn && onEdit) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onEdit(action);
        });
    }

    const deleteBtn = card.querySelector('.delete-btn');
    if (deleteBtn && onDelete) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete(action);
        });
    }

    const submitBtn = card.querySelector('.submit-btn');
    if (submitBtn && onSubmit) {
        submitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onSubmit(action);
        });
    }

    const adjudicateBtn = card.querySelector('.adjudicate-btn');
    if (adjudicateBtn && onAdjudicate) {
        adjudicateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onAdjudicate(action);
        });
    }

    return card;
}

/**
 * Create a compact action card (for lists)
 * @param {Object} action - Action data
 * @param {Object} options - Display options
 * @returns {HTMLElement}
 */
export function createCompactActionCard(action, options = {}) {
    const { onClick } = options;

    const card = document.createElement('div');
    card.className = 'action-card-compact';
    card.dataset.actionId = action.id;

    const statusBadge = createStatusBadge(action.status || 'draft');

    const compactTitle = action.goal || action.title || 'Untitled action';

    card.innerHTML = `
        <div class="action-card-compact-content">
            <span class="action-card-compact-title">${escapeHtml(compactTitle)}</span>
            <span class="action-card-compact-mechanism">${action.mechanism || ''}</span>
        </div>
        <div class="action-card-compact-status">
            ${statusBadge.outerHTML}
        </div>
    `;

    if (onClick) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => onClick(action));
    }

    return card;
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

export default createActionCard;
