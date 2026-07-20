/**
 * PLI Macroeconomic SME Review (White Cell)
 * Layout mirrors Desktop SME UI Samples / pli-sme-review-ui-mockup.png
 * using Fractured Order design tokens.
 */

import { database } from '../../services/database.js';
import { showModal } from '../../components/ui/Modal.js';
import { showToast } from '../../components/ui/Toast.js';
import { createLogger } from '../../utils/logger.js';
import {
    SEATS,
    STATUS_LABELS,
    STATUS_BADGE,
    escapeHtml,
    getSeatReview,
    seatNeedsReview,
    getActionTitle,
    getMacroBlock,
    renderTrendCharts,
    createSeatPanelShell,
    emptyState,
    sourceActionColumn,
    footerActions
} from './pliShared.js';

const logger = createLogger('PliMacroReview');
const SEAT = SEATS.MACRO;

export function createPliMacroReview(options = {}) {
    const { container, getSessionId, getReviewerName, canReview = () => true } = options;
    if (!container) throw new Error('Container element is required');

    let records = [];
    let actionsById = new Map();
    let showReviewed = false;

    const wrapper = createSeatPanelShell({
        title: 'PLI Macro',
        description: 'Petrihos Lever Index macroeconomic chain — classify, score, chart, then approve or override.',
        seatId: SEAT
    });
    container.appendChild(wrapper);

    const list = wrapper.querySelector('[data-pli-list]');
    const pendingBadge = wrapper.querySelector('[data-pli-pending-count]');

    wrapper.querySelector('[data-pli-show-reviewed]').addEventListener('change', (event) => {
        showReviewed = event.target.checked;
        render();
    });
    wrapper.querySelector('[data-pli-refresh]').addEventListener('click', () => refresh());

    async function refresh() {
        const sessionId = getSessionId?.();
        if (!sessionId) {
            list.innerHTML = '<p class="text-sm text-gray-500">No active session.</p>';
            return;
        }
        try {
            const [adjudications, actions] = await Promise.all([
                database.fetchPliAdjudications(sessionId),
                database.fetchActions(sessionId).catch(() => [])
            ]);
            records = adjudications;
            actionsById = new Map((actions || []).map((action) => [action.id, action]));
            render();
        } catch (err) {
            logger.error('Failed to load PLI adjudications:', err);
            list.innerHTML = '<p class="text-sm text-gray-500">Failed to load PLI adjudications. Apply data/2026-07-17_pli_adjudications.sql if needed.</p>';
        }
    }

    function visibleRows() {
        return records.filter((row) => {
            const seat = getSeatReview(row, SEAT);
            if (seat.status === 'skipped') return showReviewed;
            return showReviewed || seatNeedsReview(seat);
        });
    }

    function render() {
        const pending = records.filter((r) => seatNeedsReview(getSeatReview(r, SEAT)));
        pendingBadge.textContent = String(pending.length);
        const visible = visibleRows();
        if (!visible.length) {
            list.innerHTML = emptyState(
                showReviewed ? 'No PLI macro adjudications' : 'No PLI macro adjudications awaiting review',
                'The PLI pipeline writes multi-track records after each run. Trigger Actions → PLI Adjudication or wait for the schedule.'
            );
            return;
        }
        list.innerHTML = '';
        visible.forEach((row) => list.appendChild(renderCard(row)));
    }

    function renderCard(row) {
        const card = document.createElement('article');
        card.className = 'pli-sme-card';
        const action = actionsById.get(row.action_id);
        const record = row.record || {};
        const { worksheet, adjudication } = getMacroBlock(record);
        const seat = getSeatReview(row, SEAT);
        const status = seat.status || row.status;
        const classification = worksheet?.classification || adjudication?.classification || {};
        const precedent = worksheet?.precedent || adjudication?.precedent || {};
        const implementation = adjudication?.implementation || {};
        const fit = mergeFit(adjudication?.fit, worksheet?.fit, record.declared_orientation);
        const modifiers = precedent.modifiers || worksheet?.precedent?.modifiers || {};
        const implementationNarrative = (
            (precedent.statutory_basis || []).join('; ')
            || precedent.rationale
            || ''
        ).trim();
        const fitNarrative = (
            fit.mechanism_rationale
            || fit.rationale
            || ''
        ).trim();

        card.innerHTML = `
            <header class="pli-sme-card-header">
                <div>
                    <h3 class="pli-sme-card-title">${escapeHtml(getActionTitle(action, row))}</h3>
                    <p class="text-sm text-gray-600">PLI Adjudication — SME Review · Codebook ${escapeHtml(row.codebook_version || '')}</p>
                </div>
                <span class="badge ${STATUS_BADGE[status] || 'badge-secondary'}">${escapeHtml(STATUS_LABELS[status] || status)}</span>
            </header>
            <div class="pli-sme-columns">
                ${sourceActionColumn(action, row, record)}
                <section class="pli-col pli-col-chain">
                    <h3 class="pli-col-title">2. Adjudication chain (PLI trace)</h3>
                    <div class="pli-block">
                        <div class="pli-label">2.1 Classification</div>
                        <div class="pli-field-grid">
                            <div class="pli-field"><span class="pli-k">Primary lever</span><span class="pli-v">${escapeHtml(classification.lever || '—')}</span></div>
                            <div class="pli-field"><span class="pli-k">Policy instrument</span><span class="pli-v">${escapeHtml(classification.instrument || '—')}</span></div>
                        </div>
                        <p class="pli-cite text-sm">${escapeHtml(classification.rule_citation || 'No tie-break citation.')}</p>
                    </div>
                    <div class="pli-block">
                        <div class="pli-label">2.2 Implementation worksheet</div>
                        <p class="text-sm"><strong>Precedent tier:</strong> ${escapeHtml(String(precedent.tier ?? '—'))}
                            ${implementation.tier_midpoint != null ? ` · Midpoint ${escapeHtml(String(implementation.tier_midpoint))}` : ''}</p>
                        <p class="pli-cite text-sm">${escapeHtml(implementationNarrative || 'No implementation narrative on worksheet.')}</p>
                        <div class="pli-modifiers">${renderModifiers(modifiers, implementation)}</div>
                        <p class="text-sm"><strong>Implementation score:</strong> ${escapeHtml(String(implementation.score ?? '—'))}</p>
                    </div>
                    <div class="pli-block">
                        <div class="pli-label">2.3 Fit score (orientation anchor)</div>
                        <p class="text-sm"><strong>Orientation:</strong> ${escapeHtml(fit.orientation || '—')}
                            ${fit.band ? ` · <strong>Band:</strong> ${escapeHtml(String(fit.band))}` : ''}
                            · <strong>Fit:</strong> ${escapeHtml(String(fit.score ?? '—'))}</p>
                        <p class="pli-cite text-sm">${escapeHtml(fitNarrative || 'No fit mechanism narrative on worksheet.')}</p>
                    </div>
                    ${(status === 'needs_human' || !adjudication) ? `
                        <div class="pli-notice pli-notice-danger">
                            <strong>Manual adjudication required.</strong>
                            ${escapeHtml(record.needs_human_reason || worksheet?.needs_human_reason || 'Agent could not classify cleanly.')}
                        </div>` : ''}
                </section>
                <section class="pli-col pli-col-outputs">
                    <h3 class="pli-col-title">3. Macro outputs</h3>
                    <div data-pli-charts></div>
                    <p class="text-sm text-gray-600" style="margin-top: var(--space-2);">
                        Included in final deliverables: per-action, per-move, and per-simulation reports.
                    </p>
                    ${record.agent?.attempts?.length ? `
                        <details class="pli-transcript">
                            <summary>View agent transcript</summary>
                            <pre class="pli-pre">${escapeHtml(JSON.stringify(record.agent.attempts, null, 2).slice(0, 4000))}</pre>
                        </details>` : ''}
                </section>
            </div>
            ${seatNeedsReview(seat) && canReview() ? footerActions({
                approveLabel: 'Approve PLI Outputs',
                canApprove: status === 'pending',
                canOverride: true,
                overrideDisabledReason: ''
            }) : ''}
            ${seat.status === 'overridden' && seat.override_rationale ? `
                <div class="pli-notice pli-notice-gold" style="margin-top: var(--space-3);">
                    <strong>SME override</strong>${seat.sme_reviewer ? ` by ${escapeHtml(seat.sme_reviewer)}` : ''}:
                    ${escapeHtml(seat.override_rationale)}
                </div>` : ''}
        `;

        const chartsHost = card.querySelector('[data-pli-charts]');
        if (chartsHost) {
            const trend = adjudication?.trend || record.tracks?.macro?.trend;
            chartsHost.appendChild(renderTrendCharts(trend, record.submission_month));
        }

        card.querySelector('[data-pli-approve]')?.addEventListener('click', () => handleApprove(row));
        card.querySelector('[data-pli-override]')?.addEventListener('click', () => showOverrideModal(row));
        card.querySelector('[data-pli-sendback]')?.addEventListener('click', () => handleSendBack(row));

        return card;
    }

    function mergeFit(adjudicationFit, worksheetFit, declaredOrientation) {
        const fromAdj = adjudicationFit && typeof adjudicationFit === 'object' ? adjudicationFit : {};
        const fromWs = worksheetFit && typeof worksheetFit === 'object' ? worksheetFit : {};
        const narrative = (
            fromAdj.mechanism_rationale
            || fromAdj.rationale
            || fromWs.mechanism_rationale
            || fromWs.rationale
            || ''
        ).trim();
        return {
            ...fromWs,
            ...fromAdj,
            orientation: fromAdj.orientation || fromWs.orientation || declaredOrientation || null,
            band: fromAdj.band || fromWs.band || null,
            score: fromAdj.score ?? fromWs.score ?? null,
            rationale: narrative,
            mechanism_rationale: narrative
        };
    }

    function renderModifiers(modifiers, implementation) {
        const rows = [];
        const boolMods = [
            ['funding_available', 'Funding available'],
            ['partners_committed', 'Partners committed'],
            ['timeline_mismatch', 'Timeline mismatch'],
            ['multi_authority_coordination', 'Multi-authority coordination']
        ];
        boolMods.forEach(([key, label]) => {
            if (typeof modifiers[key] !== 'boolean' && !modifiers[`${key}_rationale`]) return;
            rows.push(`<tr><td>${escapeHtml(label)}</td><td>${modifiers[key] ? 'Yes' : 'No'}</td><td>${escapeHtml(modifiers[`${key}_rationale`] || '')}</td></tr>`);
        });
        if (Array.isArray(implementation.modifiers_applied)) {
            implementation.modifiers_applied.forEach((m) => {
                rows.push(`<tr><td>${escapeHtml(m.name || m.modifier || '')}</td><td>${escapeHtml(String(m.adj ?? m.delta ?? ''))}</td><td>${escapeHtml(m.justification || m.rationale || '')}</td></tr>`);
            });
        }
        if (!rows.length) {
            return '<p class="text-sm text-gray-500">No modifiers on worksheet.</p>';
        }
        return `<table class="pli-table"><thead><tr><th>Modifier</th><th>Value / Adj.</th><th>Justification</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    }

    async function handleApprove(row) {
        try {
            await database.reviewPliSeat(row.id, SEAT, {
                status: 'approved',
                sme_reviewer: getReviewerName?.() || 'White Cell'
            });
            showToast({ message: 'PLI macro outputs approved', type: 'success' });
            await refresh();
        } catch (err) {
            logger.error('Failed to approve PLI macro seat:', err);
            showToast({ message: 'Failed to approve adjudication', type: 'error' });
        }
    }

    async function handleSendBack(row) {
        const content = document.createElement('div');
        content.innerHTML = `
            <p class="text-sm text-gray-600" style="margin-bottom: var(--space-3);">Return this macro adjudication for human rework. Notes are stored on the seat override rationale.</p>
            <textarea id="pliSendBackNotes" class="form-input form-textarea" rows="4" placeholder="What should White Cell / the agent fix?"></textarea>
        `;
        showModal({
            title: 'Send Back / Needs Human',
            content,
            size: 'md',
            buttons: [
                { text: 'Cancel', variant: 'secondary', onClick: (modal) => modal.close() },
                {
                    text: 'Send Back',
                    variant: 'primary',
                    onClick: async (modal) => {
                        const notes = document.getElementById('pliSendBackNotes').value.trim();
                        if (!notes) {
                            showToast({ message: 'Notes are required', type: 'error' });
                            return;
                        }
                        try {
                            await database.reviewPliSeat(row.id, SEAT, {
                                status: 'needs_human',
                                sme_reviewer: getReviewerName?.() || 'White Cell',
                                override_rationale: notes
                            });
                            showToast({ message: 'Returned for human adjudication', type: 'success' });
                            modal.close();
                            await refresh();
                        } catch (err) {
                            logger.error('Failed to send back PLI macro:', err);
                            showToast({ message: 'Failed to send back', type: 'error' });
                        }
                    }
                }
            ]
        });
    }

    function showOverrideModal(row) {
        const { adjudication } = getMacroBlock(row.record || {});
        const content = document.createElement('div');
        content.innerHTML = `
            <p class="text-sm text-gray-600" style="margin-bottom: var(--space-3);">
                Override becomes the macro adjudication of record for this seat. Rationale is required.
            </p>
            <form id="pliOverrideForm">
                <div class="form-group">
                    <label class="form-label" for="pliOverrideImpl">Implementation score (1-10) *</label>
                    <input type="number" id="pliOverrideImpl" class="form-input" min="1" max="10"
                        value="${adjudication?.implementation?.score ?? ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label" for="pliOverrideFit">Fit score (1-10) *</label>
                    <input type="number" id="pliOverrideFit" class="form-input" min="1" max="10"
                        value="${adjudication?.fit?.score ?? ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label" for="pliOverrideRationale">Rationale (required)</label>
                    <textarea id="pliOverrideRationale" class="form-input form-textarea" rows="4"
                        placeholder="Which codebook table entry is wrong, and why?"></textarea>
                </div>
            </form>
        `;
        showModal({
            title: 'Override PLI Macro Outputs',
            content,
            size: 'md',
            buttons: [
                { text: 'Cancel', variant: 'secondary', onClick: (modal) => modal.close() },
                {
                    text: 'Override & Save',
                    variant: 'primary',
                    onClick: async (modal) => {
                        const implementationScore = parseInt(document.getElementById('pliOverrideImpl').value, 10);
                        const fitScore = parseInt(document.getElementById('pliOverrideFit').value, 10);
                        const rationale = document.getElementById('pliOverrideRationale').value.trim();
                        if (!Number.isInteger(implementationScore) || implementationScore < 1 || implementationScore > 10
                            || !Number.isInteger(fitScore) || fitScore < 1 || fitScore > 10) {
                            showToast({ message: 'Scores must be integers from 1 to 10', type: 'error' });
                            return;
                        }
                        if (!rationale) {
                            showToast({ message: 'An override rationale is required', type: 'error' });
                            return;
                        }
                        try {
                            await database.reviewPliSeat(row.id, SEAT, {
                                status: 'overridden',
                                sme_reviewer: getReviewerName?.() || 'White Cell',
                                override_value: {
                                    implementation_score: implementationScore,
                                    fit_score: fitScore
                                },
                                override_rationale: rationale
                            });
                            showToast({ message: 'Override recorded', type: 'success' });
                            modal.close();
                            await refresh();
                        } catch (err) {
                            logger.error('Failed to record PLI override:', err);
                            showToast({ message: 'Failed to record override', type: 'error' });
                        }
                    }
                }
            ]
        });
    }

    function destroy() {
        wrapper.remove();
    }

    return { refresh, destroy };
}

export default createPliMacroReview;
