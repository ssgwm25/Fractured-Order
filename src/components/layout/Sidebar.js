/**
 * Sidebar Component
 * Navigation sidebar for role pages
 */

/**
 * Create a sidebar navigation
 * @param {Object} options - Sidebar options
 * @param {Array} options.items - Navigation items
 * @param {string} options.activeItem - Currently active item ID
 * @param {boolean} options.collapsible - Whether sidebar can be collapsed
 * @param {boolean} options.collapsed - Initial collapsed state
 * @param {Function} options.onItemClick - Item click handler
 * @param {Function} options.onToggle - Collapse toggle handler
 * @returns {HTMLElement} Sidebar element
 */
export function createSidebar({
    items = [],
    activeItem = '',
    collapsible = true,
    collapsed = false,
    onItemClick = null,
    onToggle = null
} = {}) {
    const sidebar = document.createElement('aside');
    sidebar.className = `sidebar ${collapsed ? 'sidebar-collapsed' : ''}`;
    sidebar.setAttribute('role', 'navigation');
    sidebar.setAttribute('aria-label', 'Main navigation');

    // Toggle button
    if (collapsible) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'sidebar-toggle';
        toggleBtn.setAttribute('aria-label', 'Toggle sidebar');
        toggleBtn.innerHTML = `
            <svg viewBox="0 0 20 20" fill="currentColor" class="sidebar-toggle-icon">
                <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
        `;
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('sidebar-collapsed');
            const isCollapsed = sidebar.classList.contains('sidebar-collapsed');
            onToggle?.(isCollapsed);
        });
        sidebar.appendChild(toggleBtn);
    }

    // Navigation list
    const nav = document.createElement('nav');
    nav.className = 'sidebar-nav';

    const ul = document.createElement('ul');
    ul.className = 'sidebar-menu';

    items.forEach(item => {
        const li = createNavItem(item, activeItem, onItemClick);
        ul.appendChild(li);
    });

    nav.appendChild(ul);
    sidebar.appendChild(nav);

    return sidebar;
}

/**
 * Create a navigation item
 * @param {Object} item - Item configuration
 * @param {string} activeItem - Currently active item ID
 * @param {Function} onItemClick - Click handler
 * @returns {HTMLElement} List item element
 */
function createNavItem(item, activeItem, onItemClick) {
    const li = document.createElement('li');
    li.className = 'sidebar-menu-item';

    if (item.type === 'divider') {
        li.className = 'sidebar-divider';
        return li;
    }

    if (item.type === 'heading') {
        li.className = 'sidebar-heading';
        li.textContent = item.label;
        return li;
    }

    const isActive = item.id === activeItem;
    const hasChildren = item.children && item.children.length > 0;

    const link = document.createElement('a');
    link.className = `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`;
    link.href = item.href || '#';

    if (item.id) {
        link.dataset.id = item.id;
    }

    link.innerHTML = `
        ${item.icon ? `<span class="sidebar-icon">${item.icon}</span>` : ''}
        <span class="sidebar-label">${escapeHtml(item.label)}</span>
        ${item.badge ? `<span class="sidebar-badge">${escapeHtml(item.badge)}</span>` : ''}
        ${hasChildren ? `
            <svg class="sidebar-arrow" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
            </svg>
        ` : ''}
    `;

    link.addEventListener('click', (e) => {
        if (item.href === '#' || hasChildren) {
            e.preventDefault();
        }

        if (hasChildren) {
            li.classList.toggle('sidebar-menu-item-expanded');
        } else if (onItemClick) {
            onItemClick(item);
        }
    });

    li.appendChild(link);

    // Children submenu
    if (hasChildren) {
        const submenu = document.createElement('ul');
        submenu.className = 'sidebar-submenu';

        item.children.forEach(child => {
            const childLi = createNavItem(child, activeItem, onItemClick);
            submenu.appendChild(childLi);
        });

        li.appendChild(submenu);
    }

    return li;
}

/**
 * Create sidebar items for a specific role
 * @param {string} role - User role
 * @returns {Array} Navigation items
 */
export function getSidebarItemsForRole(role) {
    const commonItems = [
        { type: 'heading', label: 'Navigation' }
    ];

    const roleItems = {
        blue_facilitator: [
            {
                id: 'actions',
                label: 'Actions',
                icon: getIcon('actions'),
                href: '#actions'
            },
            {
                id: 'requests',
                label: 'Requests (RFIs)',
                icon: getIcon('requests'),
                href: '#requests'
            },
            {
                id: 'responses',
                label: 'Responses',
                icon: getIcon('responses'),
                href: '#responses'
            },
            {
                id: 'timeline',
                label: 'Timeline',
                icon: getIcon('timeline'),
                href: '#timeline'
            },
            { type: 'divider' },
            {
                id: 'capture',
                label: 'Quick Capture',
                icon: getIcon('capture'),
                href: '#capture'
            }
        ],
        blue_notetaker: [
            {
                id: 'capture',
                label: 'Quick Capture',
                icon: getIcon('capture'),
                href: '#capture'
            },
            {
                id: 'dynamics',
                label: 'Team Dynamics',
                icon: getIcon('dynamics'),
                href: '#dynamics'
            },
            {
                id: 'alliance',
                label: 'Alliance Tracking',
                icon: getIcon('alliance'),
                href: '#alliance'
            },
            { type: 'divider' },
            {
                id: 'actions',
                label: 'View Actions',
                icon: getIcon('actions'),
                href: '#actions'
            },
            {
                id: 'timeline',
                label: 'Timeline',
                icon: getIcon('timeline'),
                href: '#timeline'
            }
        ],
        whitecell_lead: [
            {
                id: 'controls',
                label: 'Simulation Settings',
                icon: getIcon('controls'),
                href: '#controls'
            },
            { type: 'divider' },
            {
                id: 'actions',
                label: 'Review Actions',
                icon: getIcon('actions'),
                href: '#actions'
            },
            {
                id: 'adjudication',
                label: 'Adjudication',
                icon: getIcon('adjudication'),
                href: '#adjudication'
            },
            {
                id: 'requests',
                label: 'RFI Queue',
                icon: getIcon('requests'),
                href: '#requests'
            },
            { type: 'divider' },
            {
                id: 'communications',
                label: 'Communications',
                icon: getIcon('communications'),
                href: '#communications'
            },
            {
                id: 'timeline',
                label: 'Timeline',
                icon: getIcon('timeline'),
                href: '#timeline'
            }
        ],
        whitecell_support: [
            {
                id: 'actions',
                label: 'Review Actions',
                icon: getIcon('actions'),
                href: '#actions'
            },
            {
                id: 'requests',
                label: 'RFI Queue',
                icon: getIcon('requests'),
                href: '#requests'
            },
            { type: 'divider' },
            {
                id: 'communications',
                label: 'Communications',
                icon: getIcon('communications'),
                href: '#communications'
            },
            {
                id: 'timeline',
                label: 'Timeline',
                icon: getIcon('timeline'),
                href: '#timeline'
            }
        ],
        whitecell: [
            {
                id: 'controls',
                label: 'Simulation Settings',
                icon: getIcon('controls'),
                href: '#controls'
            },
            { type: 'divider' },
            {
                id: 'actions',
                label: 'Review Actions',
                icon: getIcon('actions'),
                href: '#actions'
            },
            {
                id: 'adjudication',
                label: 'Adjudication',
                icon: getIcon('adjudication'),
                href: '#adjudication'
            },
            {
                id: 'requests',
                label: 'RFI Queue',
                icon: getIcon('requests'),
                href: '#requests'
            },
            { type: 'divider' },
            {
                id: 'communications',
                label: 'Communications',
                icon: getIcon('communications'),
                href: '#communications'
            },
            {
                id: 'timeline',
                label: 'Timeline',
                icon: getIcon('timeline'),
                href: '#timeline'
            }
        ],
        blue_whitecell_lead: [
            {
                id: 'controls',
                label: 'Simulation Settings',
                icon: getIcon('controls'),
                href: '#controls'
            },
            { type: 'divider' },
            {
                id: 'actions',
                label: 'Review Actions',
                icon: getIcon('actions'),
                href: '#actions'
            },
            {
                id: 'adjudication',
                label: 'Adjudication',
                icon: getIcon('adjudication'),
                href: '#adjudication'
            },
            {
                id: 'requests',
                label: 'RFI Queue',
                icon: getIcon('requests'),
                href: '#requests'
            },
            { type: 'divider' },
            {
                id: 'communications',
                label: 'Communications',
                icon: getIcon('communications'),
                href: '#communications'
            },
            {
                id: 'timeline',
                label: 'Timeline',
                icon: getIcon('timeline'),
                href: '#timeline'
            }
        ],
        blue_whitecell_support: [
            {
                id: 'actions',
                label: 'Review Actions',
                icon: getIcon('actions'),
                href: '#actions'
            },
            {
                id: 'requests',
                label: 'RFI Queue',
                icon: getIcon('requests'),
                href: '#requests'
            },
            { type: 'divider' },
            {
                id: 'communications',
                label: 'Communications',
                icon: getIcon('communications'),
                href: '#communications'
            },
            {
                id: 'timeline',
                label: 'Timeline',
                icon: getIcon('timeline'),
                href: '#timeline'
            }
        ],
        blue_whitecell: [
            {
                id: 'controls',
                label: 'Simulation Settings',
                icon: getIcon('controls'),
                href: '#controls'
            },
            { type: 'divider' },
            {
                id: 'actions',
                label: 'Review Actions',
                icon: getIcon('actions'),
                href: '#actions'
            },
            {
                id: 'adjudication',
                label: 'Adjudication',
                icon: getIcon('adjudication'),
                href: '#adjudication'
            },
            {
                id: 'requests',
                label: 'RFI Queue',
                icon: getIcon('requests'),
                href: '#requests'
            },
            { type: 'divider' },
            {
                id: 'communications',
                label: 'Communications',
                icon: getIcon('communications'),
                href: '#communications'
            },
            {
                id: 'timeline',
                label: 'Timeline',
                icon: getIcon('timeline'),
                href: '#timeline'
            }
        ],
        white: [
            {
                id: 'dashboard',
                label: 'Dashboard',
                icon: getIcon('dashboard'),
                href: '#dashboard'
            },
            {
                id: 'sessions',
                label: 'Sessions',
                icon: getIcon('sessions'),
                href: '#sessions'
            },
            {
                id: 'participants',
                label: 'Participants',
                icon: getIcon('participants'),
                href: '#participants'
            },
            { type: 'divider' },
            {
                id: 'export',
                label: 'Export Data',
                icon: getIcon('export'),
                href: '#export'
            }
        ]
    };

    return [...commonItems, ...(roleItems[role] || [])];
}

/**
 * Get icon SVG for a nav item
 * @param {string} iconName - Icon name
 * @returns {string} SVG HTML
 */
function getIcon(iconName) {
    const icons = {
        actions: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
        </svg>`,
        requests: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>
        </svg>`,
        responses: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clip-rule="evenodd"/>
        </svg>`,
        timeline: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
        </svg>`,
        capture: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
        </svg>`,
        dynamics: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
        </svg>`,
        alliance: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clip-rule="evenodd"/>
        </svg>`,
        controls: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
        </svg>`,
        adjudication: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clip-rule="evenodd"/>
        </svg>`,
        communications: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
            <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
        </svg>`,
        dashboard: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
        </svg>`,
        sessions: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/>
        </svg>`,
        participants: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
        </svg>`,
        export: `<svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>`
    };

    return icons[iconName] || '';
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
    create: createSidebar,
    getItemsForRole: getSidebarItemsForRole
};
