/**
 * Export Panel Component
 * UI for selecting and triggering data exports
 */

import { downloadJson } from './exportJson.js';
import { downloadCsv, exportActionsCsv, exportRequestsCsv, exportTimelineCsv, exportParticipantsCsv } from './exportCsv.js';
import { sessionStore } from '../../stores/session.js';

/**
 * Create export panel component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @returns {Object} Component interface
 */
export function createExportPanel(options = {}) {
    const { container } = options;

    if (!container) {
        throw new Error('ExportPanel requires a container element');
    }

    let element = null;

    /**
     * Generate filename with session and timestamp
     * @param {string} base - Base filename
     * @param {string} extension - File extension
     * @returns {string} Full filename
     */
    function generateFilename(base, extension) {
        const sessionId = sessionStore.getSessionId();
        const timestamp = new Date().toISOString().split('T')[0];
        const sessionPart = sessionId ? sessionId.substring(0, 8) : 'export';
        return `esg-${base}-${sessionPart}-${timestamp}.${extension}`;
    }

    /**
     * Handle JSON export
     * @param {Event} e - Click event
     */
    function handleJsonExport(e) {
        e.preventDefault();
        const includeActions = element.querySelector('#export-actions')?.checked ?? true;
        const includeRequests = element.querySelector('#export-requests')?.checked ?? true;
        const includeTimeline = element.querySelector('#export-timeline')?.checked ?? true;
        const includeParticipants = element.querySelector('#export-participants')?.checked ?? true;
        const includeGameState = element.querySelector('#export-gamestate')?.checked ?? true;

        downloadJson(generateFilename('full', 'json'), {
            includeActions,
            includeRequests,
            includeTimeline,
            includeParticipants,
            includeGameState
        });
    }

    /**
     * Handle CSV export for specific data type
     * @param {string} type - Data type to export
     */
    function handleCsvExport(type) {
        let csvContent, filename;

        switch (type) {
            case 'actions':
                csvContent = exportActionsCsv();
                filename = generateFilename('actions', 'csv');
                break;
            case 'requests':
                csvContent = exportRequestsCsv();
                filename = generateFilename('rfis', 'csv');
                break;
            case 'timeline':
                csvContent = exportTimelineCsv();
                filename = generateFilename('timeline', 'csv');
                break;
            case 'participants':
                csvContent = exportParticipantsCsv();
                filename = generateFilename('participants', 'csv');
                break;
            default:
                console.error('Unknown CSV export type:', type);
                return;
        }

        downloadCsv(csvContent, filename);
    }

    /**
     * Render the component
     */
    function render() {
        element = document.createElement('div');
        element.className = 'export-panel';
        element.innerHTML = `
            <div class="export-panel__header">
                <h3 class="export-panel__title">Export Data</h3>
            </div>

            <div class="export-panel__section">
                <h4 class="export-panel__section-title">Include in Export</h4>
                <div class="export-panel__options">
                    <label class="export-panel__checkbox">
                        <input type="checkbox" id="export-actions" checked>
                        <span>Actions</span>
                    </label>
                    <label class="export-panel__checkbox">
                        <input type="checkbox" id="export-requests" checked>
                        <span>RFIs</span>
                    </label>
                    <label class="export-panel__checkbox">
                        <input type="checkbox" id="export-timeline" checked>
                        <span>Timeline</span>
                    </label>
                    <label class="export-panel__checkbox">
                        <input type="checkbox" id="export-participants" checked>
                        <span>Participants</span>
                    </label>
                    <label class="export-panel__checkbox">
                        <input type="checkbox" id="export-gamestate" checked>
                        <span>Game State</span>
                    </label>
                </div>
            </div>

            <div class="export-panel__section">
                <h4 class="export-panel__section-title">JSON Export</h4>
                <p class="export-panel__description">Complete data export with all selected items</p>
                <button type="button" class="btn btn--primary export-panel__btn" data-action="json">
                    Download JSON
                </button>
            </div>

            <div class="export-panel__section">
                <h4 class="export-panel__section-title">CSV Export</h4>
                <p class="export-panel__description">Export individual data tables</p>
                <div class="export-panel__btn-group">
                    <button type="button" class="btn btn--secondary" data-action="csv-actions">
                        Actions CSV
                    </button>
                    <button type="button" class="btn btn--secondary" data-action="csv-requests">
                        RFIs CSV
                    </button>
                    <button type="button" class="btn btn--secondary" data-action="csv-timeline">
                        Timeline CSV
                    </button>
                    <button type="button" class="btn btn--secondary" data-action="csv-participants">
                        Participants CSV
                    </button>
                </div>
            </div>

        `;

        // Bind event handlers
        element.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (!action) return;

            switch (action) {
                case 'json':
                    handleJsonExport(e);
                    break;
                case 'csv-actions':
                    handleCsvExport('actions');
                    break;
                case 'csv-requests':
                    handleCsvExport('requests');
                    break;
                case 'csv-timeline':
                    handleCsvExport('timeline');
                    break;
                case 'csv-participants':
                    handleCsvExport('participants');
                    break;
            }
        });

        container.appendChild(element);
    }

    /**
     * Destroy the component
     */
    function destroy() {
        if (element) {
            element.remove();
            element = null;
        }
    }

    // Initialize
    render();

    return {
        destroy,
        getElement: () => element
    };
}

/**
 * Show export panel in a modal
 * @param {Object} options - Modal options
 */
export function showExportModal(options = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal modal--export';
    modal.innerHTML = `
        <div class="modal__header">
            <h2 class="modal__title">Export Data</h2>
            <button type="button" class="modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="modal__body" id="export-modal-content"></div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const contentContainer = modal.querySelector('#export-modal-content');
    const panel = createExportPanel({ container: contentContainer });

    // Close handlers
    const closeModal = () => {
        panel.destroy();
        overlay.remove();
    };

    modal.querySelector('.modal__close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    // ESC key handler
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}
