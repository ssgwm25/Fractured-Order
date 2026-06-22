/**
 * RFI List Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Displays a list of RFIs with filtering by status.
 */

import { requestsStore, REQUEST_STATUS } from '../../stores/index.js';
import { createStatusBadge } from '../../components/ui/Badge.js';
import { showInlineLoader } from '../../components/ui/Loader.js';
import { formatRelativeTime } from '../../utils/formatting.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('RfiList');

/**
 * Create an RFI list component
 * @param {Object} options - List options
 * @param {HTMLElement} options.container - Container element
 * @param {string} options.team - Filter by team (optional)
 * @param {string} options.status - Filter by status (optional)
 * @param {boolean} options.showFilters - Show filter controls
 * @param {Function} options.onSelect - RFI selection callback
 * @returns {Object} List controller
 */
export function createRfiList(options = {}) {
    const {
        container,
        team = null,
        status = null,
        showFilters = true,
        onSelect
    } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let currentFilters = { team, status };
    let unsubscribe = null;

    // Create list structure
    const wrapper = document.createElement('div');
    wrapper.className = 'rfi-list-wrapper';

    if (showFilters) {
        wrapper.appendChild(createFilterBar(currentFilters, (newFilters) => {
            currentFilters = newFilters;
            render();
        }));
    }

    const listContainer = document.createElement('div');
    listContainer.className = 'rfi-list';
    wrapper.appendChild(listContainer);

    container.appendChild(wrapper);

    /**
     * Render the RFI list
     */
    function render() {
        const rfis = getFilteredRfis();

        if (rfis.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <h3 class="empty-state-title">No RFIs</h3>
                    <p class="empty-state-message">
                        ${getEmptyMessage()}
                    </p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';

        rfis.forEach(rfi => {
            const card = createRfiCard(rfi, { onSelect });
            listContainer.appendChild(card);
        });
    }

    /**
     * Get filtered RFIs
     * @returns {Array}
     */
    function getFilteredRfis() {
        let rfis = requestsStore.getAll();

        if (currentFilters.team) {
            rfis = rfis.filter(r => r.team === currentFilters.team);
        }

        if (currentFilters.status) {
            rfis = rfis.filter(r => r.status === currentFilters.status);
        }

        // Sort by created_at descending
        return rfis.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    /**
     * Get appropriate empty message
     * @returns {string}
     */
    function getEmptyMessage() {
        if (currentFilters.status === REQUEST_STATUS.PENDING) {
            return 'No pending RFIs';
        }
        if (currentFilters.status) {
            return `No ${currentFilters.status} RFIs`;
        }
        return 'No RFIs submitted yet';
    }

    /**
     * Initialize the list
     */
    function init() {
        unsubscribe = requestsStore.subscribe((event, data) => {
            render();
        });

        render();
    }

    /**
     * Set filters
     * @param {Object} newFilters
     */
    function setFilters(newFilters) {
        currentFilters = { ...currentFilters, ...newFilters };
        render();
    }

    /**
     * Refresh the list
     */
    async function refresh() {
        const loader = showInlineLoader(listContainer, { message: 'Loading RFIs...' });
        try {
            await requestsStore.loadRequests();
            render();
        } finally {
            if (loader) loader.hide();
        }
    }

    /**
     * Destroy the list
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
        setFilters,
        refresh,
        destroy,
        getPendingCount: () => requestsStore.getPendingCount()
    };
}

/**
 * Create an RFI card
 * @param {Object} rfi - RFI data
 * @param {Object} options - Card options
 * @returns {HTMLElement}
 */
function createRfiCard(rfi, options = {}) {
    const { onSelect } = options;

    const card = document.createElement('div');
    card.className = 'card card-bordered rfi-card';
    card.dataset.rfiId = rfi.id;

    const statusBadge = createStatusBadge(rfi.status);

    const queryText = rfi.query || rfi.question || '';
    card.innerHTML = `
        <div class="rfi-card-header">
            <div class="rfi-card-meta">
                <span class="rfi-card-team">${rfi.team || 'Unknown'}</span>
                <span class="rfi-card-separator">•</span>
                <span class="rfi-card-time">${formatRelativeTime(rfi.created_at)}</span>
                <span class="rfi-card-separator">•</span>
                <span class="rfi-card-move">Move ${rfi.move || 1}</span>
            </div>
            ${statusBadge.outerHTML}
        </div>

        <div class="rfi-card-body">
            <p class="rfi-card-question">${escapeHtml(queryText)}</p>
            ${rfi.context ? `<p class="rfi-card-context"><strong>Context:</strong> ${escapeHtml(rfi.context)}</p>` : ''}
        </div>

        ${rfi.response ? `
            <div class="rfi-card-response">
                <div class="rfi-card-response-header">
                    <strong>Response</strong>
                    ${rfi.responded_at ? `<span class="rfi-card-response-time">${formatRelativeTime(rfi.responded_at)}</span>` : ''}
                </div>
                <p class="rfi-card-response-text">${escapeHtml(rfi.response)}</p>
            </div>
        ` : ''}
    `;

    if (onSelect) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => onSelect(rfi));
    }

    return card;
}

/**
 * Create filter bar
 * @param {Object} filters
 * @param {Function} onChange
 * @returns {HTMLElement}
 */
function createFilterBar(filters, onChange) {
    const bar = document.createElement('div');
    bar.className = 'rfi-list-filters';

    bar.innerHTML = `
        <div class="filter-group">
            <select class="form-select form-select-sm" id="statusFilter">
                <option value="">All Statuses</option>
                <option value="${REQUEST_STATUS.PENDING}" ${filters.status === REQUEST_STATUS.PENDING ? 'selected' : ''}>Pending</option>
                <option value="${REQUEST_STATUS.ANSWERED}" ${filters.status === REQUEST_STATUS.ANSWERED ? 'selected' : ''}>Answered</option>
                <option value="${REQUEST_STATUS.WITHDRAWN}" ${filters.status === REQUEST_STATUS.WITHDRAWN ? 'selected' : ''}>Withdrawn</option>
            </select>
        </div>
    `;

    bar.querySelector('#statusFilter').addEventListener('change', (e) => {
        filters.status = e.target.value || null;
        onChange(filters);
    });

    return bar;
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

export default createRfiList;
