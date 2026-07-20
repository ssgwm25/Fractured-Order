/**
 * White Cell Lead — PLI after-action PDF report generator.
 */

import { database } from '../../services/database.js';
import { openResearchPrintWindow } from '../export/index.js';
import { showToast } from '../../components/ui/Toast.js';
import { getUserMessage } from '../../core/errors.js';
import { createLogger } from '../../utils/logger.js';
import { escapeHtml } from './pliShared.js';
import {
    PLI_REPORT_SCOPES,
    collectFinalizedPliReportRows,
    listReportMoves,
    listReportActions,
    filterReportRowsForScope,
    buildPliReportFactPack,
    buildPliReportHtml,
    canGeneratePliReport
} from './pliReportBuilders.js';

const logger = createLogger('PliReportPanel');

export function createPliReportPanel(options = {}) {
    const {
        container,
        getSessionId,
        getSessionMeta = () => ({})
    } = options;

    if (!container) throw new Error('Container element is required');

    let reportRows = [];
    let generating = false;
    let selection = {
        scope: PLI_REPORT_SCOPES.ACTION,
        move: '',
        actionId: ''
    };

    const wrapper = document.createElement('div');
    wrapper.className = 'pli-sme-panel pli-report-panel';
    wrapper.innerHTML = `
        <p class="text-sm text-gray-600 pli-sme-desc">
            Generate a PDF of SME-finalized PLI outputs (diplomacy, information, national interest,
            escalation, and macro indicators), with an AI narrative summary.
        </p>
        <form class="pli-report-form" data-pli-report-form novalidate>
            <div class="form-group">
                <label class="form-label" for="pliReportScope">Report type</label>
                <select id="pliReportScope" class="form-input form-select" data-pli-report-scope>
                    <option value="${PLI_REPORT_SCOPES.ACTION}">Per action</option>
                    <option value="${PLI_REPORT_SCOPES.MOVE}">Per move</option>
                    <option value="${PLI_REPORT_SCOPES.SIMULATION}">Per simulation</option>
                </select>
            </div>
            <div class="form-group" data-pli-report-move-field>
                <label class="form-label" for="pliReportMove">Move</label>
                <select id="pliReportMove" class="form-input form-select" data-pli-report-move>
                    <option value="">Select a move</option>
                </select>
            </div>
            <div class="form-group" data-pli-report-action-field>
                <label class="form-label" for="pliReportAction">Action</label>
                <select id="pliReportAction" class="form-input form-select" data-pli-report-action>
                    <option value="">Select an action</option>
                </select>
            </div>
            <div class="pli-sme-toolbar">
                <div class="pli-sme-toolbar-left">
                    <span class="badge badge-secondary" data-pli-report-count>0</span>
                    <span class="text-sm text-gray-600">finalized actions available</span>
                </div>
                <div class="pli-sme-toolbar-right">
                    <button type="button" class="btn btn-secondary btn-sm" data-pli-report-refresh>Refresh</button>
                    <button type="submit" class="btn btn-primary btn-sm" data-pli-report-generate disabled>
                        Generate PDF
                    </button>
                </div>
            </div>
            <p class="text-sm text-gray-500" data-pli-report-status aria-live="polite"></p>
        </form>
    `;
    container.appendChild(wrapper);

    const form = wrapper.querySelector('[data-pli-report-form]');
    const scopeSelect = wrapper.querySelector('[data-pli-report-scope]');
    const moveSelect = wrapper.querySelector('[data-pli-report-move]');
    const actionSelect = wrapper.querySelector('[data-pli-report-action]');
    const moveField = wrapper.querySelector('[data-pli-report-move-field]');
    const actionField = wrapper.querySelector('[data-pli-report-action-field]');
    const countBadge = wrapper.querySelector('[data-pli-report-count]');
    const statusEl = wrapper.querySelector('[data-pli-report-status]');
    const generateBtn = wrapper.querySelector('[data-pli-report-generate]');

    scopeSelect.addEventListener('change', () => {
        selection.scope = scopeSelect.value;
        if (selection.scope === PLI_REPORT_SCOPES.SIMULATION) {
            selection.move = '';
            selection.actionId = '';
        } else if (selection.scope === PLI_REPORT_SCOPES.MOVE) {
            selection.actionId = '';
        }
        syncControls();
    });

    moveSelect.addEventListener('change', () => {
        selection.move = moveSelect.value === '' ? '' : Number(moveSelect.value);
        selection.actionId = '';
        syncControls();
    });

    actionSelect.addEventListener('change', () => {
        selection.actionId = actionSelect.value || '';
        syncControls();
    });

    wrapper.querySelector('[data-pli-report-refresh]').addEventListener('click', () => {
        refresh();
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await generate();
    });

    function setStatus(message) {
        statusEl.textContent = message || '';
    }

    function syncControls() {
        const showMove = selection.scope === PLI_REPORT_SCOPES.ACTION
            || selection.scope === PLI_REPORT_SCOPES.MOVE;
        const showAction = selection.scope === PLI_REPORT_SCOPES.ACTION;
        moveField.hidden = !showMove;
        actionField.hidden = !showAction;

        const moves = listReportMoves(reportRows);
        moveSelect.innerHTML = '<option value="">Select a move</option>'
            + moves.map((move) => `<option value="${move}">Move ${move}</option>`).join('');
        if (selection.move !== '' && moves.includes(Number(selection.move))) {
            moveSelect.value = String(selection.move);
        } else if (showMove && moves.length === 1) {
            selection.move = moves[0];
            moveSelect.value = String(moves[0]);
        } else if (!moves.includes(Number(selection.move))) {
            selection.move = '';
            moveSelect.value = '';
        }

        const moveFilter = selection.scope === PLI_REPORT_SCOPES.ACTION && selection.move !== ''
            ? selection.move
            : null;
        const actions = listReportActions(reportRows, { move: moveFilter });
        actionSelect.innerHTML = '<option value="">Select an action</option>'
            + actions.map((action) => `
                <option value="${escapeHtml(action.actionId)}">
                    ${escapeHtml(`M${action.move ?? '—'} · ${action.team} · ${action.title}`)}
                </option>
            `).join('');
        if (selection.actionId && actions.some((a) => a.actionId === selection.actionId)) {
            actionSelect.value = selection.actionId;
        } else if (showAction && actions.length === 1) {
            selection.actionId = actions[0].actionId;
            actionSelect.value = selection.actionId;
        } else if (!actions.some((a) => a.actionId === selection.actionId)) {
            selection.actionId = '';
            actionSelect.value = '';
        }

        countBadge.textContent = String(reportRows.length);
        const ready = !generating && canGeneratePliReport(selection, reportRows);
        generateBtn.disabled = !ready;
        generateBtn.textContent = generating ? 'Generating…' : 'Generate PDF';

        if (!reportRows.length) {
            setStatus('No SME-finalized PLI outputs in this session yet.');
        } else if (!ready && !generating) {
            if (selection.scope === PLI_REPORT_SCOPES.ACTION) {
                setStatus('Select a move (optional filter) and an action, then generate.');
            } else if (selection.scope === PLI_REPORT_SCOPES.MOVE) {
                setStatus('Select a move, then generate.');
            } else {
                setStatus('');
            }
        } else if (!generating) {
            const scoped = filterReportRowsForScope(reportRows, selection);
            setStatus(`${scoped.length} finalized action(s) will be included.`);
        }
    }

    async function refresh() {
        const sessionId = getSessionId?.();
        if (!sessionId) {
            reportRows = [];
            setStatus('No active session.');
            syncControls();
            return;
        }

        setStatus('Loading finalized PLI outputs…');
        try {
            const [rows, actions] = await Promise.all([
                database.fetchPliAdjudications(sessionId),
                database.fetchActions(sessionId).catch(() => [])
            ]);
            const actionsById = new Map((actions || []).map((action) => [action.id, action]));
            reportRows = collectFinalizedPliReportRows(rows || [], actionsById);
            syncControls();
        } catch (err) {
            logger.error('Failed to load PLI report data:', err);
            reportRows = [];
            setStatus('Failed to load PLI adjudications.');
            syncControls();
            showToast({
                message: getUserMessage(err, { fallback: 'Failed to load PLI report data.' }),
                type: 'error'
            });
        }
    }

    async function generate() {
        if (generating || !canGeneratePliReport(selection, reportRows)) return;

        const sessionId = getSessionId?.();
        if (!sessionId) {
            showToast({ message: 'No active session.', type: 'error' });
            return;
        }

        const scoped = filterReportRowsForScope(reportRows, selection);
        if (!scoped.length) {
            showToast({ message: 'No finalized PLI outputs for this selection.', type: 'error' });
            return;
        }

        generating = true;
        syncControls();
        setStatus('Generating narrative summary…');

        const sessionMeta = {
            sessionId,
            ...(getSessionMeta?.() || {})
        };

        let narrative = '';
        try {
            const factPack = buildPliReportFactPack(selection, scoped, sessionMeta);
            const result = await database.generatePliReportNarrative({
                sessionId,
                scope: selection.scope,
                factPack
            });
            narrative = String(result?.narrative || '').trim();
            if (!narrative) {
                throw new Error('Narrative response was empty.');
            }
        } catch (err) {
            logger.error('PLI report narrative failed:', err);
            showToast({
                message: getUserMessage(err, {
                    fallback: 'Could not generate the narrative summary. Check that CURSOR_API_KEY is configured for the Edge Function, then try again.'
                }),
                type: 'error'
            });
            generating = false;
            syncControls();
            setStatus('Narrative generation failed.');
            return;
        }

        setStatus('Opening print dialog…');
        try {
            const reportHtml = buildPliReportHtml({
                selection,
                rows: scoped,
                narrative,
                sessionMeta
            });
            const title = selection.scope === PLI_REPORT_SCOPES.ACTION
                ? `PLI Report — ${scoped[0]?.title || 'Action'}`
                : selection.scope === PLI_REPORT_SCOPES.MOVE
                    ? `PLI Report — Move ${selection.move}`
                    : `PLI Report — ${sessionMeta.sessionName || 'Simulation'}`;

            await openResearchPrintWindow(reportHtml, { title });
            showToast({ message: 'Report ready — use the print dialog to save as PDF.', type: 'success' });
            setStatus('Report opened. Use Save as PDF in the print dialog.');
        } catch (err) {
            logger.error('PLI report print failed:', err);
            showToast({
                message: getUserMessage(err, { fallback: 'Failed to open the report print window.' }),
                type: 'error'
            });
            setStatus('Failed to open print window (check pop-up blocker).');
        } finally {
            generating = false;
            syncControls();
        }
    }

    syncControls();

    return {
        refresh,
        destroy() {
            wrapper.remove();
        }
    };
}
