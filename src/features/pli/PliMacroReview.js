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
    PLI_VIEW_MODES,
    escapeHtml,
    getSeatReview,
    seatNeedsReview,
    seatIsFinalized,
    isPliRowVisible,
    isPliQueueStub,
    renderQueueStubNotice,
    leadSeatStatusBadge,
    renderSeatSmeNotes,
    getActionTitle,
    getMacroBlock,
    renderTrendCharts,
    createSeatPanelShell,
    emptyState,
    sourceActionColumn,
    footerActions
} from './pliShared.js';
import { notifyPliSeatSentBack } from './pliNotify.js';
import { sessionStore } from '../../stores/session.js';
import {
    collectMacroOverrideFromCard,
    validateMacroOverride,
    renderEditDiffHtml,
    resolveOutputTracks
} from './pliSmeEdits.js';

const logger = createLogger('PliMacroReview');
const SEAT = SEATS.MACRO;

export function createPliMacroReview(options = {}) {
    const {
        container,
        getSessionId,
        getReviewerName,
        canReview = () => true,
        viewMode = PLI_VIEW_MODES.REVIEW,
        isRowUnlocked = () => true
    } = options;
    if (!container) throw new Error('Container element is required');

    let records = [];
    let actionsById = new Map();
    let showReviewed = false;
    const isLeadReadonly = viewMode === PLI_VIEW_MODES.LEAD_READONLY;

    const wrapper = createSeatPanelShell({
        title: isLeadReadonly ? 'PLI Macro' : 'PLI Macro',
        description: isLeadReadonly
            ? 'Read-only Macro view. Draft agent outputs appear before Econ finalize; Finalized is the official gate for reports.'
            : 'Petrihos Lever Index macroeconomic chain — classify, score, chart, then approve or override.',
        seatId: SEAT,
        viewMode
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
        return records.filter((row) => isPliRowVisible(row, SEAT, {
            viewMode,
            showReviewed,
            isRowUnlocked
        }));
    }

    function render() {
        const pending = isLeadReadonly
            ? records.filter((r) => {
                const seat = getSeatReview(r, SEAT);
                return seatIsFinalized(seat) || seatNeedsReview(seat);
            })
            : records.filter((r) => seatNeedsReview(getSeatReview(r, SEAT)));
        pendingBadge.textContent = String(pending.length);
        const visible = visibleRows();
        if (!visible.length) {
            list.innerHTML = emptyState(
                isLeadReadonly
                    ? 'No Macro drafts or finalized outputs yet'
                    : (showReviewed ? 'No PLI macro adjudications' : 'No PLI macro adjudications awaiting review'),
                isLeadReadonly
                    ? 'Cards appear as soon as White Cell accepts an action. Scoring fills the Macro trace shortly after.'
                    : 'Cards appear as soon as White Cell accepts an action. Review unlocks after PLI scoring lands.'
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
        const seat = getSeatReview(row, SEAT);
        const status = seat.status || row.status;
        const displayRecord = seatIsFinalized(seat)
            ? { ...record, tracks: resolveOutputTracks(row) }
            : record;
        const { worksheet, adjudication } = getMacroBlock(displayRecord);
        const queued = isPliQueueStub(row);
        const reviewable = seatNeedsReview(seat) && canReview() && !queued;
        const leadBadge = isLeadReadonly ? leadSeatStatusBadge(seat) : null;
        const badgeClass = queued
            ? 'badge-warning'
            : (leadBadge?.badgeClass || STATUS_BADGE[status] || 'badge-secondary');
        const badgeLabel = queued
            ? STATUS_LABELS.queued
            : (leadBadge?.label || STATUS_LABELS[status] || status);
        const classification = worksheet?.classification || adjudication?.classification || {};
        const precedent = worksheet?.precedent || adjudication?.precedent || {};
        const implementation = adjudication?.implementation || {};
        const modifiers = precedent.modifiers || worksheet?.precedent?.modifiers || {};
        const implementationNarrative = (
            (precedent.statutory_basis || []).join('; ')
            || precedent.rationale
            || ''
        ).trim();
        const declaredOrientation = record.declared_orientation
            || record.tracks?.orientation
            || worksheet?.fit?.orientation
            || '';
        const legacyFit = adjudication?.fit || worksheet?.fit;

        card.innerHTML = `
            <header class="pli-sme-card-header">
                <div>
                    <h3 class="pli-sme-card-title">${escapeHtml(getActionTitle(action, row))}</h3>
                    <p class="text-sm text-gray-600">PLI Adjudication — SME Review · Codebook ${escapeHtml(queued ? 'queued' : (row.codebook_version || ''))}</p>
                </div>
                <span class="badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
            </header>
            ${renderQueueStubNotice(row)}
            <div class="pli-sme-columns">
                ${sourceActionColumn(action, row, record)}
                <section class="pli-col pli-col-chain">
                    <h3 class="pli-col-title">2. Adjudication chain (PLI trace)</h3>
                    <div class="pli-block">
                        <div class="pli-label">2.1 Classification</div>
                        ${reviewable ? `
                            <div class="pli-field-grid">
                                <div class="form-group pli-edit-field">
                                    <label class="form-label" for="pli-macro-lever-${escapeHtml(row.id)}">Primary lever</label>
                                    <input id="pli-macro-lever-${escapeHtml(row.id)}" type="text" class="form-input" data-pli-macro-lever
                                        value="${escapeHtml(classification.lever || '')}">
                                </div>
                                <div class="form-group pli-edit-field">
                                    <label class="form-label" for="pli-macro-instrument-${escapeHtml(row.id)}">Policy instrument</label>
                                    <input id="pli-macro-instrument-${escapeHtml(row.id)}" type="text" class="form-input" data-pli-macro-instrument
                                        value="${escapeHtml(classification.instrument || '')}">
                                </div>
                            </div>` : `
                            <div class="pli-field-grid">
                                <div class="pli-field"><span class="pli-k">Primary lever</span><span class="pli-v">${escapeHtml(classification.lever || '—')}</span></div>
                                <div class="pli-field"><span class="pli-k">Policy instrument</span><span class="pli-v">${escapeHtml(classification.instrument || '—')}</span></div>
                            </div>`}
                        <p class="pli-cite text-sm">${escapeHtml(classification.rule_citation || 'No tie-break citation.')}</p>
                    </div>
                    <div class="pli-block">
                        <div class="pli-label">2.2 Implementation worksheet</div>
                        <p class="text-sm"><strong>Precedent tier:</strong> ${escapeHtml(String(precedent.tier ?? '—'))}
                            ${implementation.tier_midpoint != null ? ` · Midpoint ${escapeHtml(String(implementation.tier_midpoint))}` : ''}</p>
                        <p class="pli-cite text-sm">${escapeHtml(implementationNarrative || 'No implementation narrative on worksheet.')}</p>
                        <div class="pli-modifiers">${renderModifiers(modifiers, implementation)}</div>
                        ${reviewable ? `
                            <div class="form-group pli-edit-field">
                                <label class="form-label" for="pli-macro-impl-${escapeHtml(row.id)}">Implementation score (1-10)</label>
                                <input id="pli-macro-impl-${escapeHtml(row.id)}" type="number" class="form-input" min="1" max="10" data-pli-macro-impl
                                    value="${escapeHtml(String(implementation.score ?? ''))}">
                            </div>` : `
                            <p class="text-sm"><strong>Implementation score:</strong> ${escapeHtml(String(implementation.score ?? '—'))}</p>`}
                    </div>
                    <div class="pli-block">
                        <div class="pli-label">2.3 Declared orientation (intake)</div>
                        <p class="text-sm"><strong>Orientation:</strong> ${escapeHtml(declaredOrientation || '—')}
                            <span class="text-sm text-gray-500"> — scored on the NI seat (Source 12), not on this Macro path.</span></p>
                        ${legacyFit && (legacyFit.score != null || legacyFit.band) ? `
                            <p class="pli-cite text-sm">Legacy Fit ${escapeHtml(String(legacyFit.score ?? '—'))}/10
                            ${legacyFit.band ? ` (band ${escapeHtml(String(legacyFit.band))})` : ''}
                            — orientation not scored under current Macro grammar.</p>` : ''}
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
            ${reviewable ? `
                <div class="pli-notice pli-notice-gold" style="margin-top: var(--space-3);">
                    <strong>Override</strong> — change lever, instrument, or implementation, then save with a rationale.
                    <textarea class="form-input form-textarea" data-pli-rationale rows="3" maxlength="1000"
                        placeholder="Which codebook table entry is wrong, and why?">${escapeHtml(seat.override_rationale || '')}</textarea>
                    <div class="text-sm text-gray-500" data-pli-rationale-count>0 / 1000</div>
                </div>
                ${footerActions({
                    approveLabel: status === 'needs_human' ? 'Approve as-is' : 'Approve PLI Outputs',
                    canApprove: status === 'pending' || status === 'needs_human',
                    canOverride: true,
                    overrideDisabledReason: ''
                })}` : ''}
            ${renderSeatSmeNotes(seat)}
            ${renderEditDiffHtml(seat)}
        `;

        const chartsHost = card.querySelector('[data-pli-charts]');
        if (chartsHost) {
            const trend = adjudication?.trend || record.tracks?.macro?.trend;
            chartsHost.appendChild(renderTrendCharts(trend, record.submission_month));
        }

        const rationale = card.querySelector('[data-pli-rationale]');
        const count = card.querySelector('[data-pli-rationale-count]');
        if (rationale && count) {
            const sync = () => { count.textContent = `${rationale.value.length} / 1000`; };
            rationale.addEventListener('input', sync);
            sync();
        }

        card.querySelector('[data-pli-approve]')?.addEventListener('click', () => handleApprove(row));
        card.querySelector('[data-pli-override]')?.addEventListener('click', () => handleOverride(row, card));
        card.querySelector('[data-pli-sendback]')?.addEventListener('click', () => handleSendBack(row));

        return card;
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
            const seat = getSeatReview(row, SEAT);
            const status = seat.status || row.status;
            const payload = {
                status: 'approved',
                sme_reviewer: getReviewerName?.() || 'White Cell'
            };
            if (status === 'needs_human') {
                payload.override_rationale = 'Accepted agent needs_human reason';
            }
            await database.reviewPliSeat(row.id, SEAT, payload);
            showToast({
                message: status === 'needs_human'
                    ? 'PLI macro outputs approved as-is'
                    : 'PLI macro outputs approved',
                type: 'success'
            });
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
                            const reviewer = getReviewerName?.() || 'White Cell';
                            await database.reviewPliSeat(row.id, SEAT, {
                                status: 'needs_human',
                                sme_reviewer: reviewer,
                                override_rationale: notes
                            });
                            const gameState = sessionStore.getGameState?.() || {};
                            await notifyPliSeatSentBack({
                                sessionId: getSessionId?.() || row.session_id,
                                actionId: row.action_id,
                                seatId: SEAT,
                                notes,
                                reviewerName: reviewer,
                                move: gameState.move ?? 1,
                                phase: gameState.phase ?? 1
                            });
                            showToast({ message: 'Sent back to White Cell', type: 'success' });
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

    async function handleOverride(row, card) {
        const collected = collectMacroOverrideFromCard(card, row);
        if (!collected.override_rationale) {
            showToast({ message: 'An override rationale is required', type: 'error' });
            return;
        }
        const invalid = validateMacroOverride(collected.override_value);
        if (invalid) {
            showToast({ message: invalid, type: 'error' });
            return;
        }
        try {
            await database.reviewPliSeat(row.id, SEAT, {
                status: 'overridden',
                sme_reviewer: getReviewerName?.() || 'White Cell',
                override_value: collected.override_value,
                override_rationale: collected.override_rationale,
                edit_diff: collected.edit_diff
            });
            showToast({ message: 'Override recorded', type: 'success' });
            await refresh();
        } catch (err) {
            logger.error('Failed to record PLI override:', err);
            showToast({ message: 'Failed to record override', type: 'error' });
        }
    }

    function destroy() {
        wrapper.remove();
    }

    return { refresh, destroy };
}

export default createPliMacroReview;
