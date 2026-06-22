/**
 * Timeline View Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Full timeline display with grouping and filtering.
 */

import { timelineStore, EVENT_TYPES } from '../../stores/index.js';
import { createTimelineItem, createTimelineGroupHeader } from './TimelineItem.js';
import { showInlineLoader } from '../../components/ui/Loader.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('TimelineView');

/**
 * Create a timeline view component
 * @param {Object} options - View options
 * @param {HTMLElement} options.container - Container element
 * @param {boolean} options.groupByMove - Group events by move
 * @param {boolean} options.showFilters - Show filter controls
 * @param {number} options.limit - Maximum events to show
 * @param {Object} options.filters - Initial filters
 * @returns {Object} View controller
 */
export function createTimelineView(options = {}) {
    const {
        container,
        groupByMove = true,
        showFilters = true,
        limit = 100,
        filters = {}
    } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let currentFilters = { ...filters };
    let unsubscribe = null;

    // Create view structure
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-view-wrapper';

    if (showFilters) {
        wrapper.appendChild(createFilterBar(currentFilters, (newFilters) => {
            currentFilters = newFilters;
            render();
        }));
    }

    const timelineContainer = document.createElement('div');
    timelineContainer.className = 'timeline-view';
    wrapper.appendChild(timelineContainer);

    container.appendChild(wrapper);

    /**
     * Render the timeline
     */
    function render() {
        const events = getFilteredEvents();

        if (events.length === 0) {
            timelineContainer.innerHTML = `
                <div class="empty-state">
                    <h3 class="empty-state-title">No Events</h3>
                    <p class="empty-state-message">
                        ${Object.values(currentFilters).some(v => v) ? 'No events match the current filters' : 'No timeline events yet'}
                    </p>
                </div>
            `;
            return;
        }

        timelineContainer.innerHTML = '';

        if (groupByMove) {
            renderGrouped(events);
        } else {
            renderFlat(events);
        }
    }

    /**
     * Render events grouped by move
     * @param {Array} events
     */
    function renderGrouped(events) {
        const grouped = {};

        events.forEach(event => {
            const move = event.move || 1;
            if (!grouped[move]) {
                grouped[move] = [];
            }
            grouped[move].push(event);
        });

        // Sort moves in descending order (newest first)
        const sortedMoves = Object.keys(grouped).sort((a, b) => b - a);

        sortedMoves.forEach(move => {
            const moveEvents = grouped[move];

            const group = document.createElement('div');
            group.className = 'timeline-group';

            group.appendChild(createTimelineGroupHeader(parseInt(move), moveEvents.length));

            const eventsList = document.createElement('div');
            eventsList.className = 'timeline-group-events';

            moveEvents.forEach(event => {
                eventsList.appendChild(createTimelineItem(event));
            });

            group.appendChild(eventsList);
            timelineContainer.appendChild(group);
        });
    }

    /**
     * Render events as flat list
     * @param {Array} events
     */
    function renderFlat(events) {
        events.forEach(event => {
            timelineContainer.appendChild(createTimelineItem(event));
        });
    }

    /**
     * Get filtered events
     * @returns {Array}
     */
    function getFilteredEvents() {
        let events = timelineStore.getAll();

        // Apply filters
        if (currentFilters.move !== null && currentFilters.move !== undefined) {
            events = events.filter(e => e.move === currentFilters.move);
        }

        if (currentFilters.eventType) {
            events = events.filter(e => (e.type || e.event_type) === currentFilters.eventType);
        }

        if (currentFilters.team) {
            events = events.filter(e => e.team === currentFilters.team);
        }

        if (currentFilters.category) {
            events = events.filter(e => getEventCategory(e.type || e.event_type) === currentFilters.category);
        }

        // Apply limit
        if (limit > 0) {
            events = events.slice(0, limit);
        }

        return events;
    }

    /**
     * Get event category
     * @param {string} eventType
     * @returns {string}
     */
    function getEventCategory(eventType) {
        const categories = {
            game: [EVENT_TYPES.PHASE_CHANGE, EVENT_TYPES.MOVE_CHANGE, EVENT_TYPES.TIMER_START, EVENT_TYPES.TIMER_PAUSE, EVENT_TYPES.TIMER_RESET],
            action: [EVENT_TYPES.ACTION_CREATED, EVENT_TYPES.ACTION_SUBMITTED, EVENT_TYPES.ACTION_ADJUDICATED],
            communication: [EVENT_TYPES.INJECT, EVENT_TYPES.ANNOUNCEMENT, EVENT_TYPES.GUIDANCE],
            capture: [EVENT_TYPES.NOTE, EVENT_TYPES.MOMENT, EVENT_TYPES.QUOTE],
            participant: [EVENT_TYPES.PARTICIPANT_JOINED, EVENT_TYPES.PARTICIPANT_LEFT]
        };

        for (const [category, types] of Object.entries(categories)) {
            if (types.includes(eventType)) {
                return category;
            }
        }

        return 'other';
    }

    /**
     * Initialize the view
     */
    function init() {
        unsubscribe = timelineStore.subscribe((event, data) => {
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
     * Refresh the timeline
     */
    async function refresh() {
        const loader = showInlineLoader(timelineContainer, { message: 'Loading timeline...' });
        try {
            await timelineStore.loadEvents();
            render();
        } finally {
            if (loader) loader.hide();
        }
    }

    /**
     * Destroy the view
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
        getEventCount: () => timelineStore.getAll().length
    };
}

/**
 * Create filter bar
 * @param {Object} filters
 * @param {Function} onChange
 * @returns {HTMLElement}
 */
function createFilterBar(filters, onChange) {
    const bar = document.createElement('div');
    bar.className = 'timeline-view-filters';

    bar.innerHTML = `
        <div class="filter-group">
            <select class="form-select form-select-sm" id="categoryFilter">
                <option value="">All Categories</option>
                <option value="game" ${filters.category === 'game' ? 'selected' : ''}>Game Events</option>
                <option value="action" ${filters.category === 'action' ? 'selected' : ''}>Actions</option>
                <option value="communication" ${filters.category === 'communication' ? 'selected' : ''}>Communications</option>
                <option value="capture" ${filters.category === 'capture' ? 'selected' : ''}>Captures</option>
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
            <select class="form-select form-select-sm" id="teamFilter">
                <option value="">All Teams</option>
                <option value="blue" ${filters.team === 'blue' ? 'selected' : ''}>Blue Team</option>
                <option value="white_cell" ${filters.team === 'white_cell' ? 'selected' : ''}>White Cell</option>
                <option value="system" ${filters.team === 'system' ? 'selected' : ''}>System</option>
            </select>
        </div>
    `;

    bar.querySelector('#categoryFilter').addEventListener('change', (e) => {
        filters.category = e.target.value || null;
        onChange(filters);
    });

    bar.querySelector('#moveFilter').addEventListener('change', (e) => {
        filters.move = e.target.value ? parseInt(e.target.value) : null;
        onChange(filters);
    });

    bar.querySelector('#teamFilter').addEventListener('change', (e) => {
        filters.team = e.target.value || null;
        onChange(filters);
    });

    return bar;
}

export default createTimelineView;
