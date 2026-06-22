/**
 * Tabs Component
 * Reusable tabbed interface component
 */

/**
 * Create tabs component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {Array<Object>} options.tabs - Tab definitions
 * @param {string} options.tabs[].id - Tab identifier
 * @param {string} options.tabs[].label - Tab label text
 * @param {string|Function} options.tabs[].content - Tab content (HTML string or render function)
 * @param {boolean} options.tabs[].disabled - Whether tab is disabled
 * @param {string} options.activeTab - Initially active tab ID
 * @param {Function} options.onTabChange - Callback when tab changes
 * @param {string} options.variant - Style variant ('default', 'pills', 'underline')
 * @returns {Object} Component interface
 */
export function createTabs(options = {}) {
    const {
        container,
        tabs = [],
        activeTab = tabs[0]?.id,
        onTabChange = () => {},
        variant = 'default'
    } = options;

    if (!container) {
        throw new Error('Tabs requires a container element');
    }

    let element = null;
    let currentTab = activeTab;

    /**
     * Get tab content
     * @param {Object} tab - Tab definition
     * @returns {string} HTML content
     */
    function getTabContent(tab) {
        if (typeof tab.content === 'function') {
            return tab.content();
        }
        return tab.content || '';
    }

    /**
     * Render tab list
     * @returns {string} HTML string
     */
    function renderTabList() {
        return tabs.map(tab => {
            const isActive = tab.id === currentTab;
            const isDisabled = tab.disabled;
            const classes = [
                'tabs__tab',
                isActive ? 'tabs__tab--active' : '',
                isDisabled ? 'tabs__tab--disabled' : ''
            ].filter(Boolean).join(' ');

            return `
                <button
                    type="button"
                    class="${classes}"
                    data-tab="${tab.id}"
                    ${isDisabled ? 'disabled' : ''}
                    role="tab"
                    aria-selected="${isActive}"
                    aria-controls="tabpanel-${tab.id}"
                >
                    ${tab.label}
                </button>
            `;
        }).join('');
    }

    /**
     * Render tab panel
     * @returns {string} HTML string
     */
    function renderTabPanel() {
        const tab = tabs.find(t => t.id === currentTab);
        if (!tab) return '';

        return `
            <div
                class="tabs__panel"
                id="tabpanel-${tab.id}"
                role="tabpanel"
                aria-labelledby="tab-${tab.id}"
            >
                ${getTabContent(tab)}
            </div>
        `;
    }

    /**
     * Render the component
     */
    function render() {
        const isFirstRender = !element;

        if (isFirstRender) {
            element = document.createElement('div');
            element.className = `tabs tabs--${variant}`;
        }

        element.innerHTML = `
            <div class="tabs__list" role="tablist">
                ${renderTabList()}
            </div>
            <div class="tabs__content">
                ${renderTabPanel()}
            </div>
        `;

        if (isFirstRender) {
            // Bind event handlers
            element.addEventListener('click', handleTabClick);
            element.addEventListener('keydown', handleKeyDown);
            container.appendChild(element);
        }
    }

    /**
     * Handle tab click
     * @param {Event} e - Click event
     */
    function handleTabClick(e) {
        const tabButton = e.target.closest('[data-tab]');
        if (!tabButton || tabButton.disabled) return;

        const tabId = tabButton.dataset.tab;
        if (tabId !== currentTab) {
            setActiveTab(tabId);
        }
    }

    /**
     * Handle keyboard navigation
     * @param {KeyboardEvent} e - Keyboard event
     */
    function handleKeyDown(e) {
        const tabButton = e.target.closest('[data-tab]');
        if (!tabButton) return;

        const enabledTabs = tabs.filter(t => !t.disabled);
        const currentIndex = enabledTabs.findIndex(t => t.id === currentTab);

        let newIndex;

        switch (e.key) {
            case 'ArrowLeft':
                newIndex = currentIndex > 0 ? currentIndex - 1 : enabledTabs.length - 1;
                break;
            case 'ArrowRight':
                newIndex = currentIndex < enabledTabs.length - 1 ? currentIndex + 1 : 0;
                break;
            case 'Home':
                newIndex = 0;
                break;
            case 'End':
                newIndex = enabledTabs.length - 1;
                break;
            default:
                return;
        }

        e.preventDefault();
        const newTab = enabledTabs[newIndex];
        if (newTab) {
            setActiveTab(newTab.id);
            // Focus the new tab button
            const newButton = element.querySelector(`[data-tab="${newTab.id}"]`);
            newButton?.focus();
        }
    }

    /**
     * Set active tab
     * @param {string} tabId - Tab ID to activate
     */
    function setActiveTab(tabId) {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab || tab.disabled) return;

        const previousTab = currentTab;
        currentTab = tabId;
        render();
        onTabChange(tabId, previousTab);
    }

    /**
     * Get active tab ID
     * @returns {string} Active tab ID
     */
    function getActiveTab() {
        return currentTab;
    }

    /**
     * Update tab content
     * @param {string} tabId - Tab ID to update
     * @param {string|Function} content - New content
     */
    function updateTabContent(tabId, content) {
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
            tab.content = content;
            if (tabId === currentTab) {
                render();
            }
        }
    }

    /**
     * Enable/disable a tab
     * @param {string} tabId - Tab ID
     * @param {boolean} disabled - Disabled state
     */
    function setTabDisabled(tabId, disabled) {
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
            tab.disabled = disabled;
            render();
        }
    }

    /**
     * Destroy the component
     */
    function destroy() {
        if (element) {
            element.removeEventListener('click', handleTabClick);
            element.removeEventListener('keydown', handleKeyDown);
            element.remove();
            element = null;
        }
    }

    // Initialize
    render();

    return {
        setActiveTab,
        getActiveTab,
        updateTabContent,
        setTabDisabled,
        render,
        destroy,
        getElement: () => element
    };
}