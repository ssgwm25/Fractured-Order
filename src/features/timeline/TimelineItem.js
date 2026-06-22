/**
 * Timeline Item Component
 * ESG Economic Statecraft Simulation Platform v2.0
 *
 * Displays a single timeline event.
 */

import { createBadge } from '../../components/ui/Badge.js';
import { formatDateTime, formatRelativeTime } from '../../utils/formatting.js';
import { EVENT_TYPES } from '../../stores/timeline.js';

/**
 * Event type configurations
 */
const EVENT_CONFIG = {
    [EVENT_TYPES.PHASE_CHANGE]: { color: 'primary', icon: '🔄' },
    [EVENT_TYPES.MOVE_CHANGE]: { color: 'primary', icon: '➡️' },
    [EVENT_TYPES.TIMER_START]: { color: 'success', icon: '▶️' },
    [EVENT_TYPES.TIMER_PAUSE]: { color: 'warning', icon: '⏸️' },
    [EVENT_TYPES.TIMER_RESET]: { color: 'default', icon: '🔁' },
    [EVENT_TYPES.ACTION_CREATED]: { color: 'info', icon: '📝' },
    [EVENT_TYPES.ACTION_SUBMITTED]: { color: 'info', icon: '📤' },
    [EVENT_TYPES.ACTION_ADJUDICATED]: { color: 'success', icon: '⚖️' },
    [EVENT_TYPES.INJECT]: { color: 'warning', icon: '💉' },
    [EVENT_TYPES.ANNOUNCEMENT]: { color: 'primary', icon: '📢' },
    [EVENT_TYPES.GUIDANCE]: { color: 'info', icon: '📋' },
    [EVENT_TYPES.NOTE]: { color: 'default', icon: '📝' },
    [EVENT_TYPES.MOMENT]: { color: 'warning', icon: '⭐' },
    [EVENT_TYPES.QUOTE]: { color: 'info', icon: '💬' },
    [EVENT_TYPES.PARTICIPANT_JOINED]: { color: 'success', icon: '👋' },
    [EVENT_TYPES.PARTICIPANT_LEFT]: { color: 'default', icon: '👋' }
};

/**
 * Create a timeline item
 * @param {Object} event - Timeline event data
 * @param {Object} options - Display options
 * @param {boolean} options.showFullTimestamp - Show full timestamp
 * @param {boolean} options.compact - Use compact layout
 * @param {Function} options.onClick - Click callback
 * @returns {HTMLElement}
 */
export function createTimelineItem(event, options = {}) {
    const {
        showFullTimestamp = false,
        compact = false,
        onClick
    } = options;

    const eventType = event.type || event.event_type || 'EVENT';
    const eventContent = event.content || event.description || '';
    const eventActor = event.actor || event.metadata?.actor || '';
    const config = EVENT_CONFIG[eventType] || { color: 'default', icon: '•' };

    const item = document.createElement('div');
    item.className = `timeline-item ${compact ? 'timeline-item-compact' : ''}`;
    item.dataset.eventId = event.id;

    const badge = createBadge({
        text: eventType,
        type: config.color,
        size: compact ? 'sm' : 'md'
    });

    const timestamp = showFullTimestamp
        ? formatDateTime(event.created_at)
        : formatRelativeTime(event.created_at);

    if (compact) {
        item.innerHTML = `
            <div class="timeline-item-marker" style="color: var(--color-${config.color}-500);">
                ${config.icon}
            </div>
            <div class="timeline-item-content">
                <span class="timeline-item-description">${escapeHtml(eventContent)}</span>
                <span class="timeline-item-time">${timestamp}</span>
            </div>
        `;
    } else {
        item.innerHTML = `
            <div class="timeline-item-marker">
                <div class="timeline-item-dot" style="background: var(--color-${config.color}-500);"></div>
                <div class="timeline-item-line"></div>
            </div>
            <div class="timeline-item-content">
                <div class="timeline-item-header">
                    ${badge.outerHTML}
                    <span class="timeline-item-time">${timestamp}</span>
                </div>
                <p class="timeline-item-description">${escapeHtml(eventContent)}</p>
                <div class="timeline-item-meta">
                    ${event.team ? `<span class="timeline-item-team">${event.team}</span>` : ''}
                    ${eventActor ? `<span class="timeline-item-actor">by ${escapeHtml(eventActor)}</span>` : ''}
                    <span class="timeline-item-move">Move ${event.move || 1}</span>
                </div>
            </div>
        `;
    }

    if (onClick) {
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => onClick(event));
    }

    return item;
}

/**
 * Create a timeline group header (for move grouping)
 * @param {number} move - Move number
 * @param {number} eventCount - Number of events in group
 * @returns {HTMLElement}
 */
export function createTimelineGroupHeader(move, eventCount) {
    const header = document.createElement('div');
    header.className = 'timeline-group-header';

    header.innerHTML = `
        <h4 class="timeline-group-title">Move ${move}</h4>
        <span class="timeline-group-count">${eventCount} events</span>
    `;

    return header;
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

export default createTimelineItem;
