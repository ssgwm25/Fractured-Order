/**
 * Capture List Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Displays recent captures (notes, moments, quotes).
 */

import { timelineStore, EVENT_TYPES } from '../../stores/index.js';
import { createBadge } from '../../components/ui/Badge.js';
import { showInlineLoader } from '../../components/ui/Loader.js';
import { formatRelativeTime } from '../../utils/formatting.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('CaptureList');

/**
 * Capture type display configuration
 */
const CAPTURE_CONFIG = {
    [EVENT_TYPES.NOTE]: { label: 'Note', color: 'default', icon: '📝' },
    [EVENT_TYPES.MOMENT]: { label: 'Moment', color: 'warning', icon: '⭐' },
    [EVENT_TYPES.QUOTE]: { label: 'Quote', color: 'info', icon: '💬' }
};

/**
 * Create a capture list component
 * @param {Object} options - List options
 * @param {HTMLElement} options.container - Container element
 * @param {number} options.limit - Maximum captures to show
 * @param {string} options.team - Filter by team
 * @param {Function} options.onSelect - Selection callback
 * @returns {Object} List controller
 */
export function createCaptureList(options = {}) {
    const {
        container,
        limit = 20,
        team = null,
        onSelect
    } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let unsubscribe = null;

    // Create list structure
    const wrapper = document.createElement('div');
    wrapper.className = 'capture-list-wrapper';

    const listContainer = document.createElement('div');
    listContainer.className = 'capture-list';
    wrapper.appendChild(listContainer);

    container.appendChild(wrapper);

    /**
     * Render the capture list
     */
    function render() {
        const captures = getCaptures();

        if (captures.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state empty-state-sm">
                    <p class="empty-state-message">No captures yet</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';

        captures.forEach(capture => {
            listContainer.appendChild(createCaptureCard(capture, { onSelect }));
        });
    }

    /**
     * Get captures from store
     * @returns {Array}
     */
    function getCaptures() {
        let captures = timelineStore.getCaptures();

        if (team) {
            captures = captures.filter(c => c.team === team);
        }

        // Sort by newest first and apply limit
        return captures
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, limit);
    }

    /**
     * Initialize the list
     */
    function init() {
        unsubscribe = timelineStore.subscribe((event, data) => {
            // Only re-render on capture-related events
            if (['created', 'deleted', 'loaded', 'initialized'].includes(event)) {
                render();
            }
        });

        render();
    }

    /**
     * Refresh the list
     */
    async function refresh() {
        const loader = showInlineLoader(listContainer, { message: 'Loading...' });
        try {
            await timelineStore.loadEvents();
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
        refresh,
        destroy,
        getCount: () => getCaptures().length
    };
}

/**
 * Create a capture card
 * @param {Object} capture - Capture data
 * @param {Object} options - Card options
 * @returns {HTMLElement}
 */
function createCaptureCard(capture, options = {}) {
    const { onSelect } = options;

    const captureType = capture.type || capture.event_type || EVENT_TYPES.NOTE;
    const captureContent = capture.content || capture.description || '';
    const captureActor = capture.actor || capture.metadata?.actor || '';
    const config = CAPTURE_CONFIG[captureType] || CAPTURE_CONFIG[EVENT_TYPES.NOTE];

    const card = document.createElement('div');
    card.className = 'capture-card';
    card.dataset.captureId = capture.id;

    const badge = createBadge({
        text: config.label,
        type: config.color,
        size: 'sm'
    });

    card.innerHTML = `
        <div class="capture-card-header">
            <span class="capture-card-icon">${config.icon}</span>
            ${badge.outerHTML}
            <span class="capture-card-time">${formatRelativeTime(capture.created_at)}</span>
        </div>
        <p class="capture-card-content">${escapeHtml(captureContent)}</p>
        <div class="capture-card-meta">
            <span class="capture-card-move">Move ${capture.move || 1}</span>
            ${captureActor ? `<span class="capture-card-actor">by ${escapeHtml(captureActor)}</span>` : ''}
        </div>
    `;

    if (onSelect) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => onSelect(capture));
    }

    return card;
}

/**
 * Create a compact capture list (inline display)
 * @param {Object} options
 * @returns {Object}
 */
export function createCompactCaptureList(options = {}) {
    const { container, limit = 5, team = null } = options;

    if (!container) {
        throw new Error('Container element is required');
    }

    let unsubscribe = null;

    const wrapper = document.createElement('div');
    wrapper.className = 'capture-list-compact';
    container.appendChild(wrapper);

    function render() {
        let captures = timelineStore.getCaptures();

        if (team) {
            captures = captures.filter(c => c.team === team);
        }

        captures = captures
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, limit);

        if (captures.length === 0) {
            wrapper.innerHTML = '<p class="text-sm text-gray-500">No recent captures</p>';
            return;
        }

        wrapper.innerHTML = captures.map(capture => {
            const captureType = capture.type || capture.event_type || EVENT_TYPES.NOTE;
            const captureContent = capture.content || capture.description || '';
            const config = CAPTURE_CONFIG[captureType] || CAPTURE_CONFIG[EVENT_TYPES.NOTE];
            return `
                <div class="capture-compact-item">
                    <span class="capture-compact-icon">${config.icon}</span>
                    <span class="capture-compact-text">${escapeHtml(truncate(captureContent, 60))}</span>
                    <span class="capture-compact-time">${formatRelativeTime(capture.created_at)}</span>
                </div>
            `;
        }).join('');
    }

    function init() {
        unsubscribe = timelineStore.subscribe(() => render());
        render();
    }

    function destroy() {
        if (unsubscribe) unsubscribe();
        wrapper.remove();
    }

    init();

    return { render, destroy };
}

/**
 * Truncate text
 * @param {string} str
 * @param {number} length
 * @returns {string}
 */
function truncate(str, length) {
    if (!str || str.length <= length) return str;
    return str.substring(0, length) + '...';
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

export default createCaptureList;
