/**
 * Section Component
 * Content sections with optional headers and actions
 */

/**
 * Create a content section
 * @param {Object} options - Section options
 * @param {string} options.id - Section ID
 * @param {string} options.title - Section title
 * @param {string} options.description - Section description
 * @param {string|HTMLElement} options.content - Section content
 * @param {HTMLElement[]} options.actions - Action buttons
 * @param {boolean} options.collapsible - Whether section can be collapsed
 * @param {boolean} options.collapsed - Initial collapsed state
 * @param {string} options.variant - Section variant ('default', 'card', 'bordered')
 * @param {string} options.className - Additional CSS classes
 * @returns {HTMLElement} Section element
 */
export function createSection({
    id = '',
    title = '',
    description = '',
    content = null,
    actions = [],
    collapsible = false,
    collapsed = false,
    variant = 'default',
    className = ''
} = {}) {
    const section = document.createElement('section');
    section.className = `content-section section-${variant} ${className}`.trim();
    if (id) section.id = id;
    if (collapsed) section.classList.add('section-collapsed');

    // Header
    if (title || actions.length > 0) {
        const header = document.createElement('div');
        header.className = 'section-header';

        const headerContent = document.createElement('div');
        headerContent.className = 'section-header-content';

        if (collapsible) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'section-toggle';
            toggleBtn.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section');
            toggleBtn.innerHTML = `
                <svg class="section-toggle-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
            `;
            toggleBtn.addEventListener('click', () => {
                section.classList.toggle('section-collapsed');
                const isCollapsed = section.classList.contains('section-collapsed');
                toggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand section' : 'Collapse section');
            });
            headerContent.appendChild(toggleBtn);
        }

        if (title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'section-title-wrapper';
            titleEl.innerHTML = `
                <h2 class="section-title">${escapeHtml(title)}</h2>
                ${description ? `<p class="section-description">${escapeHtml(description)}</p>` : ''}
            `;
            headerContent.appendChild(titleEl);
        }

        header.appendChild(headerContent);

        // Actions
        if (actions.length > 0) {
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'section-actions';
            actions.forEach(action => {
                actionsContainer.appendChild(action);
            });
            header.appendChild(actionsContainer);
        }

        section.appendChild(header);
    }

    // Body
    const body = document.createElement('div');
    body.className = 'section-body';

    if (content) {
        if (typeof content === 'string') {
            body.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            body.appendChild(content);
        }
    }

    section.appendChild(body);

    return section;
}

/**
 * Create a form section with labeled inputs
 * @param {Object} options - Form section options
 * @param {string} options.title - Section title
 * @param {Array} options.fields - Form fields configuration
 * @returns {HTMLElement} Form section element
 */
export function createFormSection({ title = '', fields = [] } = {}) {
    const content = document.createElement('div');
    content.className = 'form-section-content';

    fields.forEach(field => {
        const group = createFormGroup(field);
        content.appendChild(group);
    });

    return createSection({
        title,
        content,
        variant: 'card'
    });
}

/**
 * Create a form group (label + input)
 * @param {Object} field - Field configuration
 * @returns {HTMLElement} Form group element
 */
function createFormGroup(field) {
    const group = document.createElement('div');
    group.className = `form-group ${field.required ? 'form-group-required' : ''}`;

    // Label
    if (field.label) {
        const label = document.createElement('label');
        label.className = 'form-label';
        label.htmlFor = field.id;
        label.textContent = field.label;
        if (field.required) {
            label.innerHTML += '<span class="required-indicator">*</span>';
        }
        group.appendChild(label);
    }

    // Help text (before input)
    if (field.helpBefore) {
        const help = document.createElement('p');
        help.className = 'form-help form-help-before';
        help.textContent = field.helpBefore;
        group.appendChild(help);
    }

    // Input container
    const inputContainer = document.createElement('div');
    inputContainer.className = 'form-input-container';

    // Create input based on type
    let input;
    switch (field.type) {
        case 'textarea':
            input = document.createElement('textarea');
            input.className = 'form-input form-textarea';
            input.rows = field.rows || 4;
            break;

        case 'select':
            input = document.createElement('select');
            input.className = 'form-input form-select';
            if (field.options) {
                field.options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = typeof opt === 'object' ? opt.value : opt;
                    option.textContent = typeof opt === 'object' ? opt.label : opt;
                    input.appendChild(option);
                });
            }
            break;

        case 'checkbox':
            input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'form-checkbox';
            break;

        case 'range':
            input = document.createElement('input');
            input.type = 'range';
            input.className = 'form-range';
            input.min = field.min || 0;
            input.max = field.max || 100;
            input.step = field.step || 1;
            break;

        default:
            input = document.createElement('input');
            input.type = field.type || 'text';
            input.className = 'form-input';
    }

    // Common attributes
    if (field.id) input.id = field.id;
    if (field.name) input.name = field.name;
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.required) input.required = true;
    if (field.disabled) input.disabled = true;
    if (field.value !== undefined) input.value = field.value;
    if (field.maxLength) input.maxLength = field.maxLength;

    inputContainer.appendChild(input);
    group.appendChild(inputContainer);

    // Help text (after input)
    if (field.help) {
        const help = document.createElement('p');
        help.className = 'form-help';
        help.textContent = field.help;
        group.appendChild(help);
    }

    // Error message placeholder
    const error = document.createElement('p');
    error.className = 'form-error';
    error.id = `${field.id}-error`;
    group.appendChild(error);

    return group;
}

/**
 * Create a grid section with multiple columns
 * @param {Object} options - Grid section options
 * @param {number} options.columns - Number of columns (1-4)
 * @param {HTMLElement[]} options.items - Grid items
 * @param {string} options.gap - Gap size ('sm', 'md', 'lg')
 * @returns {HTMLElement} Grid section element
 */
export function createGridSection({ columns = 2, items = [], gap = 'md' } = {}) {
    const grid = document.createElement('div');
    grid.className = `section-grid section-grid-${columns} section-grid-gap-${gap}`;

    items.forEach(item => {
        const cell = document.createElement('div');
        cell.className = 'section-grid-cell';
        if (item instanceof HTMLElement) {
            cell.appendChild(item);
        } else {
            cell.innerHTML = item;
        }
        grid.appendChild(cell);
    });

    return grid;
}

/**
 * Create a tabbed section
 * @param {Object} options - Tabbed section options
 * @param {Array} options.tabs - Tab configurations
 * @param {string} options.activeTab - Initially active tab ID
 * @param {Function} options.onTabChange - Tab change handler
 * @returns {HTMLElement} Tabbed section element
 */
export function createTabbedSection({ tabs = [], activeTab = '', onTabChange = null } = {}) {
    const container = document.createElement('div');
    container.className = 'tabbed-section';

    // Tab list
    const tabList = document.createElement('div');
    tabList.className = 'tab-list';
    tabList.setAttribute('role', 'tablist');

    // Tab panels container
    const panels = document.createElement('div');
    panels.className = 'tab-panels';

    tabs.forEach((tab, index) => {
        const isActive = tab.id === activeTab || (!activeTab && index === 0);

        // Tab button
        const tabBtn = document.createElement('button');
        tabBtn.className = `tab-button ${isActive ? 'tab-button-active' : ''}`;
        tabBtn.setAttribute('role', 'tab');
        tabBtn.setAttribute('aria-selected', isActive.toString());
        tabBtn.setAttribute('aria-controls', `panel-${tab.id}`);
        tabBtn.id = `tab-${tab.id}`;
        tabBtn.textContent = tab.label;
        if (tab.badge) {
            tabBtn.innerHTML += `<span class="tab-badge">${escapeHtml(tab.badge)}</span>`;
        }

        tabBtn.addEventListener('click', () => {
            // Update all tabs
            tabList.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('tab-button-active');
                btn.setAttribute('aria-selected', 'false');
            });
            tabBtn.classList.add('tab-button-active');
            tabBtn.setAttribute('aria-selected', 'true');

            // Update all panels
            panels.querySelectorAll('.tab-panel').forEach(panel => {
                panel.hidden = true;
            });
            const panel = document.getElementById(`panel-${tab.id}`);
            if (panel) panel.hidden = false;

            onTabChange?.(tab.id);
        });

        tabList.appendChild(tabBtn);

        // Tab panel
        const panel = document.createElement('div');
        panel.className = 'tab-panel';
        panel.id = `panel-${tab.id}`;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', `tab-${tab.id}`);
        panel.hidden = !isActive;

        if (tab.content) {
            if (typeof tab.content === 'string') {
                panel.innerHTML = tab.content;
            } else if (tab.content instanceof HTMLElement) {
                panel.appendChild(tab.content);
            }
        }

        panels.appendChild(panel);
    });

    container.appendChild(tabList);
    container.appendChild(panels);

    return container;
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
    create: createSection,
    form: createFormSection,
    grid: createGridSection,
    tabbed: createTabbedSection
};