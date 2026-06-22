/**
 * Loader Component
 * Loading indicators and spinners
 */

/**
 * Create a spinner element
 * @param {Object} options - Spinner options
 * @param {string} options.size - Size ('sm', 'md', 'lg')
 * @param {string} options.color - Color (CSS color or 'primary', 'white', etc.)
 * @returns {HTMLElement} Spinner element
 */
export function createSpinner({ size = 'md', color = 'primary' } = {}) {
    const spinner = document.createElement('div');
    spinner.className = `spinner spinner-${size}`;

    if (color === 'primary') {
        spinner.classList.add('spinner-primary');
    } else if (color === 'white') {
        spinner.classList.add('spinner-white');
    } else {
        spinner.style.borderTopColor = color;
    }

    spinner.setAttribute('role', 'status');
    spinner.innerHTML = '<span class="sr-only">Loading...</span>';

    return spinner;
}

/**
 * Show a full-page loading overlay
 * @param {Object} options - Loader options
 * @param {string} options.message - Loading message
 * @param {boolean} options.transparent - Use transparent background
 * @returns {Object} Loader controller with hide method
 */
export function showLoader({ message = 'Loading...', transparent = false } = {}) {
    // Check if loader already exists
    let overlay = document.getElementById('global-loader');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'global-loader';
        overlay.className = 'loader-overlay';
        overlay.setAttribute('role', 'alert');
        overlay.setAttribute('aria-busy', 'true');

        overlay.innerHTML = `
            <div class="loader-content">
                <div class="spinner spinner-lg spinner-primary"></div>
                <p class="loader-message">${escapeHtml(message)}</p>
            </div>
        `;

        document.body.appendChild(overlay);
    } else {
        // Update message
        const messageEl = overlay.querySelector('.loader-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
    }

    if (transparent) {
        overlay.classList.add('loader-transparent');
    } else {
        overlay.classList.remove('loader-transparent');
    }

    // Show with animation
    requestAnimationFrame(() => {
        overlay.classList.add('loader-visible');
    });

    document.body.classList.add('loader-active');

    return {
        hide: () => hideLoader(),
        updateMessage: (newMessage) => {
            const messageEl = overlay.querySelector('.loader-message');
            if (messageEl) {
                messageEl.textContent = newMessage;
            }
        }
    };
}

/**
 * Hide the global loader
 */
export function hideLoader() {
    const overlay = document.getElementById('global-loader');
    if (!overlay) return;

    overlay.classList.remove('loader-visible');

    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        document.body.classList.remove('loader-active');
    }, 200);
}

/**
 * Show inline loading indicator in an element
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Options
 * @param {string} options.message - Loading message
 * @param {boolean} options.replace - Replace existing content
 * @returns {Object} Loader controller
 */
export function showInlineLoader(container, { message = 'Loading...', replace = true } = {}) {
    if (!container) return null;

    // Store original content
    const originalContent = container.innerHTML;
    const originalMinHeight = container.style.minHeight;

    // Set minimum height to prevent layout shift
    const currentHeight = container.offsetHeight;
    container.style.minHeight = `${Math.max(currentHeight, 100)}px`;

    if (replace) {
        container.innerHTML = '';
    }

    const loader = document.createElement('div');
    loader.className = 'inline-loader';
    loader.innerHTML = `
        <div class="spinner spinner-md spinner-primary"></div>
        ${message ? `<p class="inline-loader-message">${escapeHtml(message)}</p>` : ''}
    `;

    container.appendChild(loader);
    container.classList.add('is-loading');

    return {
        hide: () => {
            container.classList.remove('is-loading');
            container.style.minHeight = originalMinHeight;
            if (replace) {
                container.innerHTML = originalContent;
            } else {
                loader.remove();
            }
        },
        updateMessage: (newMessage) => {
            const messageEl = loader.querySelector('.inline-loader-message');
            if (messageEl) {
                messageEl.textContent = newMessage;
            }
        }
    };
}

/**
 * Create a skeleton loading placeholder
 * @param {Object} options - Skeleton options
 * @param {string} options.type - Type ('text', 'circle', 'rect')
 * @param {string} options.width - Width (CSS value)
 * @param {string} options.height - Height (CSS value)
 * @param {number} options.lines - Number of text lines
 * @returns {HTMLElement} Skeleton element
 */
export function createSkeleton({
    type = 'text',
    width = '100%',
    height = 'auto',
    lines = 1
} = {}) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-container';

    if (type === 'text') {
        for (let i = 0; i < lines; i++) {
            const line = document.createElement('div');
            line.className = 'skeleton skeleton-text';
            // Last line is shorter
            if (i === lines - 1 && lines > 1) {
                line.style.width = '60%';
            }
            skeleton.appendChild(line);
        }
    } else if (type === 'circle') {
        const circle = document.createElement('div');
        circle.className = 'skeleton skeleton-circle';
        circle.style.width = width;
        circle.style.height = width; // Same as width for circle
        skeleton.appendChild(circle);
    } else if (type === 'rect') {
        const rect = document.createElement('div');
        rect.className = 'skeleton skeleton-rect';
        rect.style.width = width;
        rect.style.height = height;
        skeleton.appendChild(rect);
    }

    return skeleton;
}

/**
 * Create a button with loading state
 * @param {HTMLButtonElement} button - Button element
 * @returns {Object} Button controller
 */
export function createLoadingButton(button) {
    const originalContent = button.innerHTML;
    const originalDisabled = button.disabled;

    return {
        startLoading: (text = '') => {
            button.disabled = true;
            button.classList.add('btn-loading');
            button.innerHTML = `
                <span class="spinner spinner-sm spinner-white"></span>
                ${text ? `<span>${escapeHtml(text)}</span>` : ''}
            `;
        },
        stopLoading: () => {
            button.disabled = originalDisabled;
            button.classList.remove('btn-loading');
            button.innerHTML = originalContent;
        },
        setDisabled: (disabled) => {
            button.disabled = disabled;
        }
    };
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
    createSpinner,
    showLoader,
    hideLoader,
    showInlineLoader,
    createSkeleton,
    createLoadingButton
};
