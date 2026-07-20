/**
 * Diplomacy Index & Information SME Review (paired seat)
 * Layout mirrors diplomacy-information-sme-review-ui-mockup.png
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
    isDownstreamSeatUnlocked,
    getActionTitle,
    createSeatPanelShell,
    emptyState,
    sourceActionColumn,
    footerActions
} from './pliShared.js';

const logger = createLogger('DiplomacyInfoReview');
const SEAT = SEATS.DIPLOMACY_INFORMATION;

export function createDiplomacyInfoReview(options = {}) {
    const {
        container,
        getSessionId,
        getReviewerName,
        canReview = () => true,
        viewMode = PLI_VIEW_MODES.REVIEW,
        isRowUnlocked = isDownstreamSeatUnlocked
    } = options;
    if (!container) throw new Error('Container element is required');

    let records = [];
    let actionsById = new Map();
    let showReviewed = false;
    const isLeadReadonly = viewMode === PLI_VIEW_MODES.LEAD_READONLY;

    const wrapper = createSeatPanelShell({
        title: isLeadReadonly ? 'Diplomacy & Information (finalized)' : 'Diplomacy & Information',
        description: isLeadReadonly
            ? 'Read-only Diplomacy / Information outputs finalized by the Diplomacy & Information SME.'
            : 'Paired Diplomacy Index + Information brief — both tracks clear together under one SME seat. Unlocks after Macro is finalized or skipped.',
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
            logger.error('Failed to load diplomacy/info adjudications:', err);
            list.innerHTML = '<p class="text-sm text-gray-500">Failed to load PLI adjudications.</p>';
        }
    }

    function visibleRows() {
        return records.filter((row) => isPliRowVisible(row, SEAT, {
            viewMode,
            showReviewed,
            isRowUnlocked: isLeadReadonly ? () => true : isRowUnlocked
        }));
    }

    function render() {
        const pending = isLeadReadonly
            ? records.filter((r) => seatIsFinalized(getSeatReview(r, SEAT)))
            : records.filter((r) => (
                isRowUnlocked(r) && seatNeedsReview(getSeatReview(r, SEAT))
            ));
        pendingBadge.textContent = String(pending.length);
        const visible = visibleRows();
        if (!visible.length) {
            const locked = !isLeadReadonly
                ? records.filter((r) => seatNeedsReview(getSeatReview(r, SEAT)) && !isRowUnlocked(r)).length
                : 0;
            list.innerHTML = emptyState(
                isLeadReadonly
                    ? 'No finalized Diplomacy / Information outputs yet'
                    : (locked > 0
                        ? 'Awaiting Macro finalize'
                        : (showReviewed ? 'No Diplomacy / Information adjudications' : 'No Diplomacy / Information items awaiting review')),
                isLeadReadonly
                    ? 'Finalized reviews appear here after the Diplomacy & Information SME approves or overrides.'
                    : (locked > 0
                        ? `${locked} item(s) waiting for Econ SME Macro finalize (or Macro skip on non-economic actions).`
                        : 'Diplomatic and Informational actions (and secondary facets) appear here after the PLI multi-track run.')
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
        const tracks = record.tracks || {};
        const diplomacy = tracks.diplomacy || null;
        const information = tracks.information || null;
        const seat = getSeatReview(row, SEAT);
        const status = seat.status || row.status;
        const routing = tracks.routing?.tracks || {};

        card.innerHTML = `
            <header class="pli-sme-card-header">
                <div>
                    <h3 class="pli-sme-card-title">${escapeHtml(getActionTitle(action, row))}</h3>
                    <p class="text-sm text-gray-600">Diplomacy &amp; Information — SME Review · Model Dip / Info Trial</p>
                </div>
                <span class="badge ${STATUS_BADGE[status] || 'badge-secondary'}">${escapeHtml(STATUS_LABELS[status] || status)}</span>
            </header>
            <div class="pli-sme-columns pli-sme-columns-3">
                ${sourceActionColumn(action, row, record)}
                <section class="pli-col pli-col-chain">
                    <h3 class="pli-col-title">SME review</h3>
                    <div class="pli-block">
                        <div class="pli-label">A. Diplomacy ${routing.diplomacy ? '' : '(not routed)'}</div>
                        ${renderDiplomacy(diplomacy, routing.diplomacy)}
                    </div>
                    <div class="pli-block">
                        <div class="pli-label">B. Information ${routing.information ? '' : '(not routed)'}</div>
                        ${renderInformation(information, routing.information)}
                    </div>
                    ${seatNeedsReview(seat) ? `
                        <div class="pli-notice pli-notice-gold">
                            <strong>Override active when edited.</strong> Provide rationale below before Override &amp; Save.
                            <textarea class="form-input form-textarea" data-pli-rationale rows="3" maxlength="3000"
                                placeholder="Override rationale (required when changing proposed fields)">${escapeHtml(seat.override_rationale || '')}</textarea>
                            <div class="text-sm text-gray-500" data-pli-rationale-count>0 / 3000</div>
                        </div>` : ''}
                </section>
                <section class="pli-col pli-col-outputs">
                    <h3 class="pli-col-title">Paired outputs preview</h3>
                    <div class="pli-block">
                        <div class="pli-label">Diplomacy outputs</div>
                        <p class="text-sm">${escapeHtml(summarizeDiplomacy(diplomacy))}</p>
                    </div>
                    <div class="pli-block">
                        <div class="pli-label">Information outputs</div>
                        <p class="text-sm">${escapeHtml(summarizeInformation(information))}</p>
                    </div>
                    ${record.agent?.attempts?.length ? `
                        <details class="pli-transcript">
                            <summary>View full agent transcript</summary>
                            <pre class="pli-pre">${escapeHtml(JSON.stringify(record.agent.attempts, null, 2).slice(0, 4000))}</pre>
                        </details>` : ''}
                </section>
            </div>
            ${seatNeedsReview(seat) && canReview() ? footerActions({
                approveLabel: 'Approve Diplomacy & Information',
                canApprove: status === 'pending' || status === 'needs_human',
                canOverride: true
            }) : ''}
            <p class="text-sm text-gray-600" style="margin-top: var(--space-2);">Nothing is final until SME approval — both tracks clear together.</p>
        `;

        const rationale = card.querySelector('[data-pli-rationale]');
        const count = card.querySelector('[data-pli-rationale-count]');
        if (rationale && count) {
            const sync = () => { count.textContent = `${rationale.value.length} / 3000`; };
            rationale.addEventListener('input', sync);
            sync();
        }

        card.querySelector('[data-pli-approve]')?.addEventListener('click', () => handleApprove(row));
        card.querySelector('[data-pli-override]')?.addEventListener('click', () => handleOverride(row, card));
        card.querySelector('[data-pli-sendback]')?.addEventListener('click', () => handleSendBack(row));

        return card;
    }

    function renderDiplomacy(diplomacy, routed) {
        if (!routed) {
            return '<p class="text-sm text-gray-500">Not on the default lane map for this Instrument of Power.</p>';
        }
        if (!diplomacy) {
            return '<p class="text-sm text-gray-500">No diplomacy worksheet yet.</p>';
        }
        if (diplomacy.status === 'needs_human' && !diplomacy.code) {
            return `<div class="pli-notice pli-notice-danger">${escapeHtml(diplomacy.needs_human_reason || 'Needs human diplomacy worksheet.')}</div>`;
        }
        const fields = diplomacy.fields || diplomacy.taxonomy || diplomacy;
        return `
            <dl class="pli-meta">
                <div><dt>Taxonomy / code</dt><dd>${escapeHtml(String(diplomacy.code || fields.code || '—'))}</dd></div>
                <div><dt>Paradigm</dt><dd>${escapeHtml(String(fields.paradigm || fields.diplomacy_paradigm || '—'))}</dd></div>
                <div><dt>Channel / modality</dt><dd>${escapeHtml(formatList(fields.channel || fields.channels || fields.modality))}</dd></div>
                <div><dt>Audience</dt><dd>${escapeHtml(formatList(fields.audience || fields.counterpart))}</dd></div>
                <div><dt>Effect summary</dt><dd>${escapeHtml(String(fields.effect_summary || fields.proposed_outcome || '—'))}</dd></div>
                <div><dt>Credibility / feasibility</dt><dd>${escapeHtml(String(fields.credibility || fields.feasibility || '—'))}</dd></div>
            </dl>
            ${diplomacy.rationale ? `<p class="pli-cite text-sm">${escapeHtml(diplomacy.rationale)}</p>` : ''}
        `;
    }

    function renderInformation(information, routed) {
        if (!routed) {
            return '<p class="text-sm text-gray-500">Not on the default lane map for this Instrument of Power.</p>';
        }
        if (!information) {
            return '<p class="text-sm text-gray-500">No information brief yet.</p>';
        }
        if (information.status === 'needs_human' && !information.brief && !information.message_thesis) {
            return `<div class="pli-notice pli-notice-danger">${escapeHtml(information.needs_human_reason || 'Needs human information brief.')}</div>`;
        }
        const brief = information.brief || information;
        return `
            <dl class="pli-meta">
                <div><dt>Operation type</dt><dd>${escapeHtml(String(brief.operation_type || brief.information_operation_type || '—'))}</dd></div>
                <div><dt>Target audience</dt><dd>${escapeHtml(formatList(brief.target_audience || brief.theater))}</dd></div>
                <div><dt>Message thesis</dt><dd>${escapeHtml(String(brief.message_thesis || brief.thesis || '—'))}</dd></div>
                <div><dt>Intended effect</dt><dd>${escapeHtml(String(brief.intended_effect || '—'))}</dd></div>
                <div><dt>Attribution posture</dt><dd>${escapeHtml(String(brief.attribution_posture || brief.attribution || '—'))}</dd></div>
                <div><dt>Blowback risk</dt><dd>${escapeHtml(String(brief.risk_of_blowback || brief.blowback || '—'))}</dd></div>
            </dl>
        `;
    }

    function summarizeDiplomacy(diplomacy) {
        if (!diplomacy) return 'No diplomacy output.';
        if (diplomacy.status === 'needs_human') return diplomacy.needs_human_reason || 'Needs human.';
        return diplomacy.code || diplomacy.fields?.paradigm || JSON.stringify(diplomacy).slice(0, 160);
    }

    function summarizeInformation(information) {
        if (!information) return 'No information output.';
        if (information.status === 'needs_human') return information.needs_human_reason || 'Needs human.';
        const brief = information.brief || information;
        return brief.message_thesis || brief.thesis || JSON.stringify(brief).slice(0, 160);
    }

    function formatList(value) {
        if (Array.isArray(value)) return value.join(', ');
        if (value == null) return '—';
        return String(value);
    }

    async function handleApprove(row) {
        try {
            await database.reviewPliSeat(row.id, SEAT, {
                status: 'approved',
                sme_reviewer: getReviewerName?.() || 'White Cell'
            });
            showToast({ message: 'Diplomacy & Information approved', type: 'success' });
            await refresh();
        } catch (err) {
            logger.error(err);
            showToast({ message: 'Failed to approve', type: 'error' });
        }
    }

    async function handleOverride(row, card) {
        const rationale = card.querySelector('[data-pli-rationale]')?.value?.trim() || '';
        if (!rationale) {
            showToast({ message: 'Override rationale is required', type: 'error' });
            return;
        }
        try {
            const tracks = row.record?.tracks || {};
            await database.reviewPliSeat(row.id, SEAT, {
                status: 'overridden',
                sme_reviewer: getReviewerName?.() || 'White Cell',
                override_value: {
                    diplomacy: tracks.diplomacy || null,
                    information: tracks.information || null
                },
                override_rationale: rationale
            });
            showToast({ message: 'Override saved for Diplomacy & Information', type: 'success' });
            await refresh();
        } catch (err) {
            logger.error(err);
            showToast({ message: 'Failed to save override', type: 'error' });
        }
    }

    async function handleSendBack(row) {
        const content = document.createElement('div');
        content.innerHTML = `
            <textarea id="pliDipSendBack" class="form-input form-textarea" rows="4" placeholder="Notes for White Cell / agent"></textarea>
        `;
        showModal({
            title: 'Send Back / Needs Human',
            content,
            size: 'md',
            buttons: [
                { text: 'Cancel', variant: 'secondary', onClick: (m) => m.close() },
                {
                    text: 'Send Back',
                    variant: 'primary',
                    onClick: async (modal) => {
                        const notes = document.getElementById('pliDipSendBack').value.trim();
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
                            logger.error(err);
                            showToast({ message: 'Failed to send back', type: 'error' });
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

export default createDiplomacyInfoReview;
