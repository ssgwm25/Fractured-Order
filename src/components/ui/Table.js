/**
 * Table Component
 * Reusable data table with sorting, filtering, and pagination
 */

/**
 * Create table component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {Array<Object>} options.columns - Column definitions
 * @param {string} options.columns[].key - Data key
 * @param {string} options.columns[].label - Column header label
 * @param {boolean} options.columns[].sortable - Whether column is sortable
 * @param {Function} options.columns[].render - Custom cell render function
 * @param {string} options.columns[].width - Column width (CSS value)
 * @param {string} options.columns[].align - Text alignment
 * @param {Array<Object>} options.data - Table data
 * @param {Object} options.sorting - Initial sorting state
 * @param {boolean} options.pagination - Enable pagination
 * @param {number} options.pageSize - Items per page
 * @param {string} options.emptyMessage - Message when no data
 * @param {Function} options.onRowClick - Row click handler
 * @param {Function} options.onSort - Sort change handler
 * @returns {Object} Component interface
 */
export function createTable(options = {}) {
    const {
        container,
        columns = [],
        data = [],
        sorting = { key: null, direction: 'asc' },
        pagination = false,
        pageSize = 10,
        emptyMessage = 'No data available',
        onRowClick = null,
        onSort = () => {}
    } = options;

    if (!container) {
        throw new Error('Table requires a container element');
    }

    let element = null;
    let tableData = [...data];
    let currentSort = { ...sorting };
    let currentPage = 1;

    /**
     * Sort data by column
     * @param {string} key - Column key to sort by
     */
    function sortData(key) {
        if (!key) return;

        const column = columns.find(c => c.key === key);
        if (!column?.sortable) return;

        // Toggle direction if same column
        if (currentSort.key === key) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.key = key;
            currentSort.direction = 'asc';
        }

        tableData.sort((a, b) => {
            const aVal = a[key];
            const bVal = b[key];

            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;

            let comparison;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                comparison = aVal - bVal;
            } else if (aVal instanceof Date && bVal instanceof Date) {
                comparison = aVal.getTime() - bVal.getTime();
            } else {
                comparison = String(aVal).localeCompare(String(bVal));
            }

            return currentSort.direction === 'asc' ? comparison : -comparison;
        });

        currentPage = 1;
        onSort(currentSort);
    }

    /**
     * Get paginated data
     * @returns {Array} Paginated data slice
     */
    function getPaginatedData() {
        if (!pagination) return tableData;

        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        return tableData.slice(start, end);
    }

    /**
     * Get total pages
     * @returns {number} Total page count
     */
    function getTotalPages() {
        return Math.ceil(tableData.length / pageSize);
    }

    /**
     * Render table header
     * @returns {string} HTML string
     */
    function renderHeader() {
        return columns.map(col => {
            const isSorted = currentSort.key === col.key;
            const sortIcon = col.sortable
                ? `<span class="table__sort-icon ${isSorted ? 'table__sort-icon--active' : ''}">
                     ${isSorted && currentSort.direction === 'desc' ? '▼' : '▲'}
                   </span>`
                : '';

            const style = col.width ? `style="width: ${col.width}"` : '';
            const classes = [
                'table__th',
                col.sortable ? 'table__th--sortable' : '',
                col.align ? `table__th--${col.align}` : ''
            ].filter(Boolean).join(' ');

            return `
                <th
                    class="${classes}"
                    ${style}
                    ${col.sortable ? `data-sort="${col.key}"` : ''}
                >
                    ${col.label}${sortIcon}
                </th>
            `;
        }).join('');
    }

    /**
     * Render table row
     * @param {Object} row - Row data
     * @param {number} index - Row index
     * @returns {string} HTML string
     */
    function renderRow(row, index) {
        const cells = columns.map(col => {
            const value = row[col.key];
            const content = col.render
                ? col.render(value, row, index)
                : escapeHtml(String(value ?? ''));

            const classes = [
                'table__td',
                col.align ? `table__td--${col.align}` : ''
            ].filter(Boolean).join(' ');

            return `<td class="${classes}">${content}</td>`;
        }).join('');

        const rowClasses = [
            'table__tr',
            onRowClick ? 'table__tr--clickable' : ''
        ].filter(Boolean).join(' ');

        return `<tr class="${rowClasses}" data-row-index="${index}">${cells}</tr>`;
    }

    /**
     * Render pagination controls
     * @returns {string} HTML string
     */
    function renderPagination() {
        if (!pagination) return '';

        const totalPages = getTotalPages();
        if (totalPages <= 1) return '';

        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
            if (
                i === 1 ||
                i === totalPages ||
                (i >= currentPage - 1 && i <= currentPage + 1)
            ) {
                pages.push(i);
            } else if (pages[pages.length - 1] !== '...') {
                pages.push('...');
            }
        }

        const pageButtons = pages.map(p => {
            if (p === '...') {
                return `<span class="table__page-ellipsis">...</span>`;
            }
            const isActive = p === currentPage;
            return `
                <button
                    type="button"
                    class="table__page-btn ${isActive ? 'table__page-btn--active' : ''}"
                    data-page="${p}"
                    ${isActive ? 'disabled' : ''}
                >
                    ${p}
                </button>
            `;
        }).join('');

        return `
            <div class="table__pagination">
                <button
                    type="button"
                    class="table__page-btn table__page-btn--prev"
                    data-page="prev"
                    ${currentPage === 1 ? 'disabled' : ''}
                >
                    ← Prev
                </button>
                ${pageButtons}
                <button
                    type="button"
                    class="table__page-btn table__page-btn--next"
                    data-page="next"
                    ${currentPage === totalPages ? 'disabled' : ''}
                >
                    Next →
                </button>
                <span class="table__page-info">
                    Page ${currentPage} of ${totalPages}
                </span>
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
            element.className = 'table-container';
        }

        const displayData = getPaginatedData();

        const rows = displayData.length > 0
            ? displayData.map((row, index) => renderRow(row, index)).join('')
            : `<tr><td colspan="${columns.length}" class="table__empty">${emptyMessage}</td></tr>`;

        element.innerHTML = `
            <table class="table">
                <thead class="table__head">
                    <tr>${renderHeader()}</tr>
                </thead>
                <tbody class="table__body">
                    ${rows}
                </tbody>
            </table>
            ${renderPagination()}
        `;

        if (isFirstRender) {
            element.addEventListener('click', handleClick);
            container.appendChild(element);
        }
    }

    /**
     * Handle click events
     * @param {Event} e - Click event
     */
    function handleClick(e) {
        // Handle sort clicks
        const sortHeader = e.target.closest('[data-sort]');
        if (sortHeader) {
            sortData(sortHeader.dataset.sort);
            render();
            return;
        }

        // Handle pagination clicks
        const pageBtn = e.target.closest('[data-page]');
        if (pageBtn) {
            const page = pageBtn.dataset.page;
            if (page === 'prev') {
                currentPage = Math.max(1, currentPage - 1);
            } else if (page === 'next') {
                currentPage = Math.min(getTotalPages(), currentPage + 1);
            } else {
                currentPage = parseInt(page, 10);
            }
            render();
            return;
        }

        // Handle row clicks
        if (onRowClick) {
            const row = e.target.closest('[data-row-index]');
            if (row) {
                const index = parseInt(row.dataset.rowIndex, 10);
                const rowData = getPaginatedData()[index];
                if (rowData) {
                    onRowClick(rowData, index);
                }
            }
        }
    }

    /**
     * Escape HTML characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Update table data
     * @param {Array} newData - New data array
     */
    function setData(newData) {
        tableData = [...newData];
        if (currentSort.key) {
            sortData(currentSort.key);
        }
        currentPage = 1;
        render();
    }

    /**
     * Filter data
     * @param {Function} filterFn - Filter function
     */
    function filter(filterFn) {
        tableData = data.filter(filterFn);
        if (currentSort.key) {
            sortData(currentSort.key);
        }
        currentPage = 1;
        render();
    }

    /**
     * Reset filters
     */
    function resetFilter() {
        tableData = [...data];
        if (currentSort.key) {
            sortData(currentSort.key);
        }
        currentPage = 1;
        render();
    }

    /**
     * Go to specific page
     * @param {number} page - Page number
     */
    function goToPage(page) {
        const totalPages = getTotalPages();
        currentPage = Math.max(1, Math.min(page, totalPages));
        render();
    }

    /**
     * Destroy the component
     */
    function destroy() {
        if (element) {
            element.removeEventListener('click', handleClick);
            element.remove();
            element = null;
        }
    }

    // Initialize
    render();

    return {
        setData,
        filter,
        resetFilter,
        goToPage,
        getCurrentPage: () => currentPage,
        getTotalPages,
        getSort: () => ({ ...currentSort }),
        render,
        destroy,
        getElement: () => element
    };
}