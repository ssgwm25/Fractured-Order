import {
    WHITE_CELL_OPERATOR_ROLES,
    parseTeamRole,
    ROLE_SURFACES
} from '../../core/teamContext.js';

/**
 * Badge Component
 * Status badges and labels
 */

/**
 * Create a badge element
 * @param {Object} options - Badge options
 * @param {string} options.text - Badge text
 * @param {string} options.variant - Badge variant ('default', 'primary', 'success', 'warning', 'error', 'info')
 * @param {string} options.size - Badge size ('sm', 'md', 'lg')
 * @param {boolean} options.rounded - Use pill-style rounded corners
 * @param {boolean} options.dot - Show as dot indicator only
 * @param {string} options.icon - Optional icon HTML
 * @param {string} options.className - Additional CSS classes
 * @returns {HTMLElement} Badge element
 */
export function createBadge({
    text = '',
    variant = 'default',
    size = 'md',
    rounded = false,
    dot = false,
    icon = null,
    className = ''
} = {}) {
    const badge = document.createElement('span');

    const classes = ['badge', `badge-${variant}`, `badge-${size}`];
    if (rounded) classes.push('badge-rounded');
    if (dot) classes.push('badge-dot');
    if (className) classes.push(className);

    badge.className = classes.join(' ');

    if (dot) {
        badge.innerHTML = '<span class="badge-dot-indicator"></span>';
    } else {
        let content = '';
        if (icon) {
            content += `<span class="badge-icon">${icon}</span>`;
        }
        content += `<span class="badge-text">${escapeHtml(text)}</span>`;
        badge.innerHTML = content;
    }

    return badge;
}

/**
 * Create a status badge based on action status
 * @param {string} status - Action status ('draft', 'submitted', 'adjudicated', 'abandoned')
 * @returns {HTMLElement} Badge element
 */
export function createStatusBadge(status) {
    const statusConfig = {
        draft: { text: 'Draft', variant: 'default' },
        submitted: { text: 'Submitted', variant: 'primary' },
        adjudicated: { text: 'Deliberation Underway', variant: 'warning' },
        abandoned: { text: 'Abandoned', variant: 'error' },
        pending: { text: 'Pending', variant: 'warning' },
        answered: { text: 'Answered', variant: 'success' },
        withdrawn: { text: 'Withdrawn', variant: 'default' }
    };

    const config = statusConfig[status] || { text: status, variant: 'default' };
    return createBadge({ ...config, rounded: true });
}

/**
 * Create a priority badge
 * @param {string} priority - Priority level ('NORMAL', 'HIGH', 'URGENT')
 * @returns {HTMLElement} Badge element
 */
export function createPriorityBadge(priority) {
    const priorityConfig = {
        NORMAL: { text: 'Normal', variant: 'default' },
        HIGH: { text: 'High', variant: 'warning' },
        URGENT: { text: 'Urgent', variant: 'error' }
    };

    const config = priorityConfig[priority] || { text: priority, variant: 'default' };
    return createBadge({ ...config, rounded: true, size: 'sm' });
}

/**
 * Create an outcome badge
 * @param {string} outcome - Outcome type ('SUCCESS', 'PARTIAL_SUCCESS', 'FAIL', 'BACKFIRE')
 * @returns {HTMLElement} Badge element
 */
export function createOutcomeBadge(outcome) {
    const outcomeConfig = {
        SUCCESS: { text: 'Success', variant: 'success' },
        PARTIAL_SUCCESS: { text: 'Partial Success', variant: 'warning' },
        FAIL: { text: 'Fail', variant: 'error' },
        BACKFIRE: { text: 'Backfire', variant: 'error', className: 'badge-backfire' }
    };

    const config = outcomeConfig[outcome] || { text: outcome, variant: 'default' };
    return createBadge({ ...config, rounded: true });
}

/**
 * Create a role badge
 * @param {string} role - User role
 * @returns {HTMLElement} Badge element
 */
export function createRoleBadge(role) {
    const parsedRole = parseTeamRole(role);
    let config = null;

    if (role === 'white') {
        config = { text: 'Game Master', variant: 'success' };
    } else if (role === 'viewer') {
        config = { text: 'Observer', variant: 'default' };
    } else if (parsedRole.surface === ROLE_SURFACES.FACILITATOR) {
        config = { text: 'Facilitator', variant: 'primary' };
    } else if (parsedRole.surface === ROLE_SURFACES.SCRIBE) {
        config = { text: 'Scribe', variant: 'primary' };
    } else if (parsedRole.surface === ROLE_SURFACES.NOTETAKER) {
        config = { text: 'Notetaker', variant: 'info' };
    } else if (parsedRole.surface === ROLE_SURFACES.WHITECELL) {
        config = {
            text: parsedRole.operatorRole === WHITE_CELL_OPERATOR_ROLES.SUPPORT
                ? 'White Cell Support'
                : 'White Cell Lead',
            variant: 'warning'
        };
    }

    config ||= { text: role, variant: 'default' };
    return createBadge({ ...config, rounded: true, size: 'sm' });
}

/**
 * Create a count badge (for notifications, etc.)
 * @param {number} count - Count to display
 * @param {Object} options - Badge options
 * @param {number} options.max - Maximum number to show (shows "99+" if exceeded)
 * @param {string} options.variant - Badge variant
 * @returns {HTMLElement} Badge element
 */
export function createCountBadge(count, { max = 99, variant = 'error' } = {}) {
    const displayCount = count > max ? `${max}+` : count.toString();
    return createBadge({
        text: displayCount,
        variant,
        rounded: true,
        size: 'sm',
        className: 'badge-count'
    });
}

/**
 * Create a badge group
 * @param {Array} badges - Array of badge options
 * @returns {HTMLElement} Badge group element
 */
export function createBadgeGroup(badges) {
    const group = document.createElement('div');
    group.className = 'badge-group';

    badges.forEach(badgeOptions => {
        const badge = createBadge(badgeOptions);
        group.appendChild(badge);
    });

    return group;
}

/**
 * Create phase badge
 * @param {number} phase - Phase number (1-5)
 * @returns {HTMLElement} Badge element
 */
export function createPhaseBadge(phase) {
    const phaseNames = {
        1: 'Internal Deliberation',
        2: 'Alliance Consultation',
        3: 'Finalization',
        4: 'Adjudication',
        5: 'Results Brief'
    };

    return createBadge({
        text: `Phase ${phase}: ${phaseNames[phase] || ''}`,
        variant: 'primary',
        rounded: true
    });
}

/**
 * Create move badge
 * @param {number} move - Move number (1-3)
 * @returns {HTMLElement} Badge element
 */
export function createMoveBadge(move) {
    const moveNames = {
        1: 'Epoch 1',
        2: 'Epoch 2',
        3: 'Epoch 3'
    };

    return createBadge({
        text: `Move ${move}: ${moveNames[move] || ''}`,
        variant: 'info',
        rounded: true
    });
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export default {
    create: createBadge,
    status: createStatusBadge,
    priority: createPriorityBadge,
    outcome: createOutcomeBadge,
    role: createRoleBadge,
    count: createCountBadge,
    group: createBadgeGroup,
    phase: createPhaseBadge,
    move: createMoveBadge
};
