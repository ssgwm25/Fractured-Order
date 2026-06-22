/**
 * Button Component
 * Styled button creation utilities
 */

/**
 * Create a button element
 * @param {Object} options - Button options
 * @param {string} options.label - Button text
 * @param {string} options.variant - Button variant ('primary', 'secondary', 'danger', 'ghost', 'link')
 * @param {string} options.size - Button size ('sm', 'md', 'lg')
 * @param {string} options.type - Button type ('button', 'submit', 'reset')
 * @param {boolean} options.disabled - Whether button is disabled
 * @param {boolean} options.fullWidth - Whether button takes full width
 * @param {string} options.icon - SVG icon HTML (optional)
 * @param {string} options.iconPosition - Icon position ('left', 'right')
 * @param {Function} options.onClick - Click handler
 * @param {string} options.className - Additional CSS classes
 * @param {Object} options.attributes - Additional HTML attributes
 * @returns {HTMLButtonElement} Button element
 */
export function createButton({
    label = '',
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    fullWidth = false,
    icon = null,
    iconPosition = 'left',
    onClick = null,
    className = '',
    attributes = {}
} = {}) {
    const button = document.createElement('button');

    // Build class list
    const classes = ['btn', `btn-${variant}`, `btn-${size}`];
    if (fullWidth) classes.push('btn-full-width');
    if (icon && !label) classes.push('btn-icon-only');
    if (className) classes.push(className);

    button.className = classes.join(' ');
    button.type = type;
    button.disabled = disabled;

    // Build content
    let content = '';
    if (icon && iconPosition === 'left') {
        content += `<span class="btn-icon">${icon}</span>`;
    }
    if (label) {
        content += `<span class="btn-label">${escapeHtml(label)}</span>`;
    }
    if (icon && iconPosition === 'right') {
        content += `<span class="btn-icon">${icon}</span>`;
    }
    button.innerHTML = content;

    // Add attributes
    Object.entries(attributes).forEach(([key, value]) => {
        button.setAttribute(key, value);
    });

    // Add click handler
    if (onClick) {
        button.addEventListener('click', onClick);
    }

    return button;
}

/**
 * Create a button group
 * @param {Array} buttons - Array of button options
 * @param {Object} options - Group options
 * @param {string} options.orientation - 'horizontal' or 'vertical'
 * @returns {HTMLElement} Button group element
 */
export function createButtonGroup(buttons, { orientation = 'horizontal' } = {}) {
    const group = document.createElement('div');
    group.className = `btn-group btn-group-${orientation}`;
    group.setAttribute('role', 'group');

    buttons.forEach(buttonOptions => {
        const button = createButton(buttonOptions);
        group.appendChild(button);
    });

    return group;
}

/**
 * Create a toggle button
 * @param {Object} options - Toggle options
 * @param {string} options.label - Button text
 * @param {boolean} options.pressed - Initial pressed state
 * @param {Function} options.onChange - Change handler
 * @returns {HTMLButtonElement} Toggle button element
 */
export function createToggleButton({
    label = '',
    pressed = false,
    onChange = null,
    ...rest
} = {}) {
    const button = createButton({
        ...rest,
        label,
        variant: pressed ? 'primary' : 'secondary'
    });

    button.setAttribute('aria-pressed', pressed.toString());
    button.classList.add('btn-toggle');
    if (pressed) button.classList.add('btn-toggle-pressed');

    button.addEventListener('click', () => {
        const newState = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', newState.toString());
        button.classList.toggle('btn-toggle-pressed', newState);

        // Update variant
        if (newState) {
            button.classList.remove('btn-secondary');
            button.classList.add('btn-primary');
        } else {
            button.classList.remove('btn-primary');
            button.classList.add('btn-secondary');
        }

        onChange?.(newState);
    });

    return button;
}

/**
 * Create an icon button
 * @param {Object} options - Icon button options
 * @param {string} options.icon - SVG icon HTML
 * @param {string} options.ariaLabel - Accessibility label
 * @param {string} options.variant - Button variant
 * @param {string} options.size - Button size
 * @param {Function} options.onClick - Click handler
 * @returns {HTMLButtonElement} Icon button element
 */
export function createIconButton({
    icon,
    ariaLabel,
    variant = 'ghost',
    size = 'md',
    onClick = null,
    ...rest
} = {}) {
    const button = createButton({
        ...rest,
        icon,
        variant,
        size,
        onClick,
        className: 'btn-icon-only'
    });

    button.setAttribute('aria-label', ariaLabel);
    button.setAttribute('title', ariaLabel);

    return button;
}

/**
 * Common icon SVGs
 */
export const ICONS = {
    close: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
    </svg>`,
    plus: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/>
    </svg>`,
    minus: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clip-rule="evenodd"/>
    </svg>`,
    check: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
    </svg>`,
    edit: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
    </svg>`,
    trash: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
    </svg>`,
    refresh: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
    </svg>`,
    download: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
    </svg>`,
    send: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
    </svg>`,
    chevronLeft: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
    </svg>`,
    chevronRight: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
    </svg>`,
    menu: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
    </svg>`
};

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
    create: createButton,
    createGroup: createButtonGroup,
    createToggle: createToggleButton,
    createIcon: createIconButton,
    ICONS
};
