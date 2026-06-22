/**
 * Action List Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Displays a list of actions with filtering and sorting capabilities.
 */

import { actionsStore } from '../../stores/index.js';
import { createActionCard } from './ActionCard.js';
import { showInlineLoader } from '../../components/ui/Loader.js';
import { ENUMS } from '../../core/enums.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ActionList');

/**
 * Create an action list component
 * @param {Object} options - List options
 * @param {HTMLElement} options.container - Container element
 * @param {Object} options.filters - Initial filters
 * @param {boolean} options.showFilters - Show filter controls
 * @param {Object} options.cardOptions - Options to pass to action cards
 * @returns {Object} List controller
 */
export function createActionList(options = {}) {
    const {
        container,
        filters = {},
        showFilters = true,
        cardOptions = {}
    } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let currentFilters = { ...filters };
    let unsubscribe = null;

    // Create list structure
    const wrapper = document.createElement('div');
    wrapper.className = 'action-list-wrapper';

    if (showFilters) {
        wrapper.appendChild(createFilterBar(currentFilters, (newFilters) => {
            currentFilters = newFilters;
            render();
        }));
    }

    const listContainer = document.createElement('div');
    listContainer.className = 'action-list';
    wrapper.appendChild(listContainer);

    container.appendChild(wrapper);

    /**
     * Render the action list
     */
    function render() {
        const actions = getFilteredActions();

        if (actions.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0h8v12H6V4z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <h3 class="empty-state-title">No Actions</h3>
                    <p class="empty-state-message">
                        ${getEmptyMessage()}
                    </p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';

        actions.forEach(action => {
            const card = createActionCard(action, cardOptions);
            listContainer.appendChild(card);
        });
    }

    /**
     * Get filtered and sorted actions
     * @returns {Array}
     */
    function getFilteredActions() {
        let actions = actionsStore.getAll();

        // Apply filters
        if (currentFilters.move !== null && currentFilters.move !== undefined) {
            actions = actions.filter(a => a.move === currentFilters.move);
        }

        if (currentFilters.status) {
            actions = actions.filter(a => a.status === currentFilters.status);
        }

        if (currentFilters.team) {
            actions = actions.filter(a => a.team === currentFilters.team);
        }

        if (currentFilters.mechanism) {
            actions = actions.filter(a => a.mechanism === currentFilters.mechanism);
        }

        if (currentFilters.search) {
            const searchLower = currentFilters.search.toLowerCase();
            actions = actions.filter(a => {
                const goal = a.goal || a.title || '';
                const outcomes = a.expected_outcomes || a.description || '';
                const ally = a.ally_contingencies || '';
                const targets = Array.isArray(a.targets) ? a.targets.join(' ') : (a.target || '');
                return [goal, outcomes, ally, targets].some(field =>
                    field?.toLowerCase().includes(searchLower)
                );
            });
        }

        // Sort by created_at descending (newest first)
        actions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return actions;
    }

    /**
     * Get appropriate empty message
     * @returns {string}
     */
    function getEmptyMessage() {
        if (Object.values(currentFilters).some(v => v)) {
            return 'No actions match the current filters';
        }
        return 'No actions have been created yet';
    }

    /**
     * Initialize the list
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
     * Set filters
     * @param {Object} newFilters
     */
    function setFilters(newFilters) {
        currentFilters = { ...currentFilters, ...newFilters };
        render();

        // Update filter bar if present
        const filterBar = wrapper.querySelector('.action-list-filters');
        if (filterBar) {
            updateFilterBar(filterBar, currentFilters);
        }
    }

    /**
     * Refresh the list
     */
    async function refresh() {
        const loader = showInlineLoader(listContainer, { message: 'Loading actions...' });
        try {
            await actionsStore.loadActions();
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
        getFilteredActions
    };
}

/**
 * Create filter bar
 * @param {Object} filters - Current filters
 * @param {Function} onChange - Filter change callback
 * @returns {HTMLElement}
 */
function createFilterBar(filters, onChange) {
    const bar = document.createElement('div');
    bar.className = 'action-list-filters';

    bar.innerHTML = `
        <div class="filter-group">
            <input
                type="text"
                class="form-input form-input-sm"
                placeholder="Search actions..."
                id="actionSearch"
                value="${filters.search || ''}"
            >
        </div>
        <div class="filter-group">
            <select class="form-select form-select-sm" id="statusFilter">
                <option value="">All Statuses</option>
                ${Object.entries(ENUMS.ACTION_STATUS)
                    .map(([key, value]) =>
                        `<option value="${value}" ${filters.status === value ? 'selected' : ''}>${value}</option>`
                    ).join('')}
            </select>
        </div>
        <div class="filter-group">
            <select class="form-select form-select-sm" id="moveFilter">
                <option value="">All Moves</option>
                <option value="1" ${filters.move === 1 ? 'selected' : ''}>Move 1</option>
                <option value="2" ${filters.move === 2 ? 'selected' : ''}>Move 2</option>
                <option value="3" ${filters.move === 3 ? 'selected' : ''}>Move 3</option>
            </select>
        </div>
        <div class="filter-group">
            <select class="form-select form-select-sm" id="mechanismFilter">
                <option value="">All Mechanisms</option>
                ${Object.entries(ENUMS.MECHANISMS)
                    .map(([key, value]) =>
                        `<option value="${value}" ${filters.mechanism === value ? 'selected' : ''}>${value}</option>`
                    ).join('')}
            </select>
        </div>
    `;

    // Bind filter handlers
    bar.querySelector('#actionSearch').addEventListener('input', (e) => {
        filters.search = e.target.value;
        onChange(filters);
    });

    bar.querySelector('#statusFilter').addEventListener('change', (e) => {
        filters.status = e.target.value || null;
        onChange(filters);
    });

    bar.querySelector('#moveFilter').addEventListener('change', (e) => {
        filters.move = e.target.value ? parseInt(e.target.value) : null;
        onChange(filters);
    });

    bar.querySelector('#mechanismFilter').addEventListener('change', (e) => {
        filters.mechanism = e.target.value || null;
        onChange(filters);
    });

    return bar;
}

/**
 * Update filter bar values
 * @param {HTMLElement} bar
 * @param {Object} filters
 */
function updateFilterBar(bar, filters) {
    const searchInput = bar.querySelector('#actionSearch');
    const statusSelect = bar.querySelector('#statusFilter');
    const moveSelect = bar.querySelector('#moveFilter');
    const mechanismSelect = bar.querySelector('#mechanismFilter');

    if (searchInput) searchInput.value = filters.search || '';
    if (statusSelect) statusSelect.value = filters.status || '';
    if (moveSelect) moveSelect.value = filters.move || '';
    if (mechanismSelect) mechanismSelect.value = filters.mechanism || '';
}

export default createActionList;
