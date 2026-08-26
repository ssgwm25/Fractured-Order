/**
 * White Cell Lead — session SME vs engine efficacy summary.
 */

import { database } from '../../services/database.js';
import { createLogger } from '../../utils/logger.js';
import { SEATS, escapeHtml, emptyState } from './pliShared.js';
import { summarizeSessionEfficacy } from './pliSmeEdits.js';

const logger = createLogger('PliSmeEfficacy');

const SEAT_LABELS = Object.freeze({
    [SEATS.MACRO]: 'Macro',
    [SEATS.DIPLOMACY_INFORMATION]: 'Diplomacy & Information',
    [SEATS.NATIONAL_INTEREST_ESCALATION]: 'NI & Escalation'
});

export function createPliSmeEfficacyPanel(options = {}) {
    const { container, getSessionId } = options;
    if (!container) throw new Error('Container element is required');

    const wrapper = document.createElement('div');
    wrapper.className = 'pli-sme-panel pli-efficacy-panel';
    wrapper.innerHTML = `
        <div class="pli-sme-toolbar">
            <p class="text-sm text-gray-600 pli-sme-desc" style="margin:0;">
                Approve vs override counts from this session. Repeated overrides of the same field are a codebook-revision signal.
            </p>
            <button type="button" class="btn btn-secondary btn-sm" data-pli-efficacy-refresh>Refresh</button>
        </div>
        <div data-pli-efficacy-body></div>
    `;
    container.appendChild(wrapper);

    const body = wrapper.querySelector('[data-pli-efficacy-body]');
    wrapper.querySelector('[data-pli-efficacy-refresh]').addEventListener('click', () => refresh());

    async function refresh() {
        const sessionId = getSessionId?.();
        if (!sessionId) {
            body.innerHTML = '<p class="text-sm text-gray-500">No active session.</p>';
            return;
        }
        try {
            const rows = await database.fetchPliAdjudications(sessionId);
            render(summarizeSessionEfficacy(rows || []));
        } catch (err) {
            logger.error('Failed to load PLI SME efficacy:', err);
            body.innerHTML = '<p class="text-sm text-gray-500">Failed to load PLI adjudications.</p>';
        }
    }

    function render(summary) {
        const seatRows = Object.entries(SEAT_LABELS).map(([seatId, label]) => {
            const counts = summary.seats[seatId] || { approved: 0, overridden: 0, needs_human: 0 };
            return `<tr>
                <th scope="row">${escapeHtml(label)}</th>
                <td>${counts.approved}</td>
                <td>${counts.overridden}</td>
                <td>${counts.needs_human}</td>
            </tr>`;
        }).join('');

        const pathRows = (summary.topPaths || []).map((entry) => `
            <tr>
                <th scope="row">${escapeHtml(entry.path)}</th>
                <td>${entry.count}</td>
            </tr>`).join('');

        body.innerHTML = `
            <div class="pli-block">
                <div class="pli-label">Seat outcomes</div>
                <table class="pli-table">
                    <thead><tr><th>Seat</th><th>Approved as proposed</th><th>Overridden</th><th>Sent back</th></tr></thead>
                    <tbody>${seatRows}</tbody>
                </table>
            </div>
            <div class="pli-block">
                <div class="pli-label">Most-changed fields</div>
                ${pathRows
                    ? `<table class="pli-table"><thead><tr><th>Path</th><th>Overrides</th></tr></thead><tbody>${pathRows}</tbody></table>`
                    : emptyState('No field-level overrides yet', 'Overrides appear here after Econ, NI, or Dip-Info save edited values.')}
            </div>
        `;
    }

    function destroy() {
        wrapper.remove();
    }

    return { refresh, destroy };
}

export default createPliSmeEfficacyPanel;
