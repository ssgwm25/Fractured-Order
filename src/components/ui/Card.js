/**
 * Card Component
 * Container cards for content
 */

/**
 * Create a card element
 * @param {Object} options - Card options
 * @param {string|HTMLElement} options.header - Card header content
 * @param {string|HTMLElement} options.content - Card body content
 * @param {string|HTMLElement} options.footer - Card footer content
 * @param {string} options.variant - Card variant ('default', 'bordered', 'elevated')
 * @param {boolean} options.hoverable - Add hover effect
 * @param {boolean} options.clickable - Make entire card clickable
 * @param {Function} options.onClick - Click handler (if clickable)
 * @param {string} options.className - Additional CSS classes
 * @param {string} options.id - Card ID
 * @returns {HTMLElement} Card element
 */
export function createCard({
    header = null,
    content = null,
    footer = null,
    variant = 'default',
    hoverable = false,
    clickable = false,
    onClick = null,
    className = '',
    id = null
} = {}) {
    const card = document.createElement('div');

    const classes = ['card', `card-${variant}`];
    if (hoverable) classes.push('card-hoverable');
    if (clickable) classes.push('card-clickable');
    if (className) classes.push(className);

    card.className = classes.join(' ');
    if (id) card.id = id;

    // Add header
    if (header) {
        const headerEl = document.createElement('div');
        headerEl.className = 'card-header';
        appendContent(headerEl, header);
        card.appendChild(headerEl);
    }

    // Add body
    if (content) {
        const bodyEl = document.createElement('div');
        bodyEl.className = 'card-body';
        appendContent(bodyEl, content);
        card.appendChild(bodyEl);
    }

    // Add footer
    if (footer) {
        const footerEl = document.createElement('div');
        footerEl.className = 'card-footer';
        appendContent(footerEl, footer);
        card.appendChild(footerEl);
    }

    // Click handler
    if (clickable && onClick) {
        card.addEventListener('click', onClick);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e);
            }
        });
    }

    return card;
}

/**
 * Create a stat card
 * @param {Object} options - Stat card options
 * @param {string} options.label - Stat label
 * @param {string|number} options.value - Stat value
 * @param {string} options.icon - Optional icon HTML
 * @param {string} options.trend - Trend direction ('up', 'down', 'neutral')
 * @param {string} options.trendValue - Trend value text
 * @param {string} options.variant - Card variant
 * @returns {HTMLElement} Stat card element
 */
export function createStatCard({
    label = '',
    value = '',
    icon = null,
    trend = null,
    trendValue = '',
    variant = 'default'
} = {}) {
    const content = document.createElement('div');
    content.className = 'stat-card-content';

    content.innerHTML = `
        <div class="stat-card-main">
            ${icon ? `<div class="stat-card-icon">${icon}</div>` : ''}
            <div class="stat-card-data">
                <p class="stat-card-label">${escapeHtml(label)}</p>
                <p class="stat-card-value">${escapeHtml(String(value))}</p>
            </div>
        </div>
        ${trend ? `
            <div class="stat-card-trend stat-card-trend-${trend}">
                ${getTrendIcon(trend)}
                <span>${escapeHtml(trendValue)}</span>
            </div>
        ` : ''}
    `;

    return createCard({
        content,
        variant,
        className: 'stat-card'
    });
}

/**
 * Create an action card (for action list items)
 * @param {Object} options - Action card options
 * @param {string} options.mechanism - Action mechanism
 * @param {string} options.sector - Action sector
 * @param {string[]} options.targets - Target countries
 * @param {string} options.goal - Action goal (truncated)
 * @param {string} options.status - Action status
 * @param {Function} options.onEdit - Edit handler
 * @param {Function} options.onDelete - Delete handler
 * @param {Function} options.onView - View handler
 * @returns {HTMLElement} Action card element
 */
export function createActionCard({
    mechanism = '',
    sector = '',
    targets = [],
    goal = '',
    status = 'draft',
    onEdit = null,
    onDelete = null,
    onView = null
} = {}) {
    const headerContent = `
        <div class="action-card-header-content">
            <span class="action-card-mechanism">${escapeHtml(mechanism)}</span>
            <span class="action-card-status badge badge-${getStatusVariant(status)} badge-rounded">${escapeHtml(status)}</span>
        </div>
    `;

    const bodyContent = `
        <div class="action-card-details">
            <p class="action-card-sector"><strong>Sector:</strong> ${escapeHtml(sector)}</p>
            <p class="action-card-targets"><strong>Targets:</strong> ${escapeHtml(targets.join(', '))}</p>
            <p class="action-card-goal"><strong>Goal:</strong> ${escapeHtml(truncate(goal, 100))}</p>
        </div>
    `;

    const footerContent = document.createElement('div');
    footerContent.className = 'action-card-actions';

    if (onView) {
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-sm btn-ghost';
        viewBtn.textContent = 'View';
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onView();
        });
        footerContent.appendChild(viewBtn);
    }

    if (onEdit && status === 'draft') {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-ghost';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onEdit();
        });
        footerContent.appendChild(editBtn);
    }

    if (onDelete && status === 'draft') {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-ghost text-error';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete();
        });
        footerContent.appendChild(deleteBtn);
    }

    return createCard({
        header: headerContent,
        content: bodyContent,
        footer: footerContent,
        variant: 'bordered',
        className: 'action-card',
        hoverable: true
    });
}

/**
 * Create an empty state card
 * @param {Object} options - Empty state options
 * @param {string} options.title - Title text
 * @param {string} options.message - Message text
 * @param {string} options.icon - Icon HTML
 * @param {Object} options.action - Action button config
 * @returns {HTMLElement} Empty state card
 */
export function createEmptyState({
    title = 'No items',
    message = '',
    icon = null,
    action = null
} = {}) {
    const content = document.createElement('div');
    content.className = 'empty-state';

    content.innerHTML = `
        ${icon ? `<div class="empty-state-icon">${icon}</div>` : ''}
        <h3 class="empty-state-title">${escapeHtml(title)}</h3>
        ${message ? `<p class="empty-state-message">${escapeHtml(message)}</p>` : ''}
    `;

    if (action) {
        const btn = document.createElement('button');
        btn.className = `btn btn-${action.variant || 'primary'}`;
        btn.textContent = action.label;
        if (action.onClick) {
            btn.addEventListener('click', action.onClick);
        }
        content.appendChild(btn);
    }

    return createCard({
        content,
        className: 'empty-state-card'
    });
}

/**
 * Append content to an element
 * @param {HTMLElement} parent - Parent element
 * @param {string|HTMLElement} content - Content to append
 */
function appendContent(parent, content) {
    if (typeof content === 'string') {
        parent.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        parent.appendChild(content);
    }
}

/**
 * Get status variant for badges
 * @param {string} status - Status string
 * @returns {string} Variant name
 */
function getStatusVariant(status) {
    const variants = {
        draft: 'default',
        submitted: 'primary',
        adjudicated: 'success',
        abandoned: 'error',
        pending: 'warning',
        answered: 'success'
    };
    return variants[status] || 'default';
}

/**
 * Get trend icon
 * @param {string} trend - Trend direction
 * @returns {string} Icon HTML
 */
function getTrendIcon(trend) {
    const icons = {
        up: `<svg viewBox="0 0 20 20" fill="currentColor" class="trend-icon">
            <path fill-rule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
        </svg>`,
        down: `<svg viewBox="0 0 20 20" fill="currentColor" class="trend-icon">
            <path fill-rule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
        </svg>`,
        neutral: `<svg viewBox="0 0 20 20" fill="currentColor" class="trend-icon">
            <path fill-rule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clip-rule="evenodd"/>
        </svg>`
    };
    return icons[trend] || '';
}

/**
 * Truncate text
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
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
    create: createCard,
    stat: createStatCard,
    action: createActionCard,
    emptyState: createEmptyState
};
