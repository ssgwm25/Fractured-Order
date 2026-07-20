/**
 * National Interest & Escalation (Glasl) SME Review — paired seat
 * Layout mirrors ni-escalation-sme-review-ui-mockup.png
 * Field model follows PLI codebooks (NI-1…NI-6 domains + Glasl stages).
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
    createSeatPanelShell,
    emptyState,
    sourceActionColumn,
    footerActions
} from './pliShared.js';

const logger = createLogger('NiEscalationReview');
const SEAT = SEATS.NATIONAL_INTEREST_ESCALATION;

const NI_DOMAIN_LABELS = {
    'NI-1': 'Homeland & Strategic Access',
    'NI-2': 'Economic Prosperity & Tech Leadership',
    'NI-3': 'Alliance / Partner Credibility',
    'NI-4': 'Indo-Pacific Stability & Deterrence',
    'NI-5': 'Rules / Market Integrity / Reciprocity',
    'NI-6': 'Domestic Political Sustainability'
};

const GLASL_LABELS = {
    1: 'Hardening',
    2: 'Debate & polemic',
    3: 'Actions, not words',
    4: 'Images & coalitions',
    5: 'Loss of face',
    6: 'Threat strategies',
    7: 'Limited destructive blows',
    8: 'Fragmentation of the enemy',
    9: 'Together into the abyss'
};

export function createNiEscalationReview(options = {}) {
    const { container, getSessionId, getReviewerName, canReview = () => true } = options;
    if (!container) throw new Error('Container element is required');

    let records = [];
    let actionsById = new Map();
    let showReviewed = false;

    const wrapper = createSeatPanelShell({
        title: 'NI & Escalation',
        description: 'National Interest domain deltas and Glasl escalation — same SME seat, analytically separate tracks.',
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
            logger.error('Failed to load NI/Escalation adjudications:', err);
            list.innerHTML = '<p class="text-sm text-gray-500">Failed to load PLI adjudications.</p>';
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
                showReviewed ? 'No NI & Escalation adjudications' : 'No NI & Escalation items awaiting review',
                'Every submitted action receives NI + Glasl tracks. Review pending rows after the PLI pipeline runs.'
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
        const ni = tracks.national_interest || {};
        const glasl = tracks.glasl || {};
        const seat = getSeatReview(row, SEAT);
        const status = seat.status || row.status;
        const domains = ni.domain_deltas || ni.domains || {};

        card.innerHTML = `
            <header class="pli-sme-card-header">
                <div>
                    <h3 class="pli-sme-card-title">${escapeHtml(getActionTitle(action, row))}</h3>
                    <p class="text-sm text-gray-600">NI &amp; Escalation — SME Review</p>
                </div>
                <span class="badge ${STATUS_BADGE[status] || 'badge-secondary'}">${escapeHtml(STATUS_LABELS[status] || status)}</span>
            </header>
            <div class="pli-sme-columns pli-sme-columns-3">
                ${sourceActionColumn(action, row, record)}
                <section class="pli-col pli-col-chain">
                    <h3 class="pli-col-title">Panel A — National Interest</h3>
                    <div class="pli-ni-grid">
                        ${renderNiDomains(domains, ni)}
                    </div>
                    ${ni.needs_human || ni.status === 'needs_human' ? `
                        <div class="pli-notice pli-notice-danger">${escapeHtml(ni.needs_human_reason || 'NI worksheet needs human adjudication.')}</div>` : ''}

                    <h3 class="pli-col-title" style="margin-top: var(--space-4);">Panel B — Escalation (Glasl)</h3>
                    ${renderGlasl(glasl)}

                    ${seatNeedsReview(seat) ? `
                        <div class="pli-notice pli-notice-gold" style="margin-top: var(--space-3);">
                            <strong>Override active</strong> — rationale required when changing proposed scores / stage.
                            <textarea class="form-input form-textarea" data-pli-rationale rows="3" maxlength="1000"
                                placeholder="Override rationale">${escapeHtml(seat.override_rationale || '')}</textarea>
                            <div class="text-sm text-gray-500" data-pli-rationale-count>0 / 1000</div>
                        </div>` : ''}
                </section>
                <section class="pli-col pli-col-outputs">
                    <h3 class="pli-col-title">Outputs</h3>
                    <div class="pli-block">
                        <div class="pli-label">NI path summary</div>
                        <p class="text-sm">${escapeHtml(summarizeNi(domains, ni))}</p>
                    </div>
                    <div class="pli-block">
                        <div class="pli-label">Glasl trajectory</div>
                        <p class="text-sm">
                            Stage ${escapeHtml(String(glasl.stage_before ?? '—'))}
                            → ${escapeHtml(String(glasl.stage_after ?? '—'))}
                            (Δ ${escapeHtml(String(glasl.delta ?? '—'))})
                        </p>
                        <div class="pli-glasl-bar" aria-hidden="true">
                            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((stage) => {
                                const after = Number(glasl.stage_after);
                                const before = Number(glasl.stage_before);
                                let cls = 'pli-glasl-step';
                                if (stage === after) cls += ' is-proposed';
                                else if (stage === before) cls += ' is-prior';
                                return `<span class="${cls}" title="${escapeHtml(GLASL_LABELS[stage] || '')}">${stage}</span>`;
                            }).join('')}
                        </div>
                    </div>
                    ${record.agent?.attempts?.length ? `
                        <details class="pli-transcript">
                            <summary>View full agent transcript</summary>
                            <pre class="pli-pre">${escapeHtml(JSON.stringify(record.agent.attempts, null, 2).slice(0, 4000))}</pre>
                        </details>` : ''}
                </section>
            </div>
            ${seatNeedsReview(seat) && canReview() ? footerActions({
                approveLabel: 'Approve NI & Escalation',
                canApprove: status === 'pending' || status === 'needs_human',
                canOverride: true
            }) : ''}
        `;

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

    function renderNiDomains(domains, ni) {
        const keys = Object.keys(NI_DOMAIN_LABELS);
        if (!keys.some((k) => domains[k])) {
            return `<p class="text-sm text-gray-500">${escapeHtml(ni.needs_human_reason || 'No NI domain deltas on record yet.')}</p>`;
        }
        return keys.map((key) => {
            const entry = domains[key] || {};
            const delta = entry.delta ?? entry;
            const rationale = typeof entry === 'object' ? (entry.rationale || '') : '';
            return `
                <div class="pli-ni-domain">
                    <div class="pli-ni-domain-head">
                        <strong>${escapeHtml(key)}</strong>
                        <span class="pli-ni-delta">${escapeHtml(String(delta))}</span>
                    </div>
                    <div class="text-sm text-gray-600">${escapeHtml(NI_DOMAIN_LABELS[key])}</div>
                    ${rationale ? `<p class="pli-cite text-sm">${escapeHtml(rationale)}</p>` : ''}
                </div>
            `;
        }).join('');
    }

    function renderGlasl(glasl) {
        if (!glasl || Object.keys(glasl).length === 0) {
            return '<p class="text-sm text-gray-500">No Glasl worksheet on record.</p>';
        }
        const after = Number(glasl.stage_after);
        const label = GLASL_LABELS[after] || '';
        return `
            <div class="pli-block">
                <p class="text-sm">
                    <strong>Proposed stage:</strong> ${escapeHtml(String(glasl.stage_after ?? '—'))}
                    ${label ? ` (${escapeHtml(label)})` : ''}
                    · <strong>Prior:</strong> ${escapeHtml(String(glasl.stage_before ?? '—'))}
                    · <strong>Δ:</strong> ${escapeHtml(String(glasl.delta ?? '—'))}
                </p>
                <p class="pli-cite text-sm">${escapeHtml(glasl.rationale || glasl.movement_rationale || '')}</p>
                ${glasl.needs_human || glasl.status === 'needs_human' ? `
                    <div class="pli-notice pli-notice-danger">${escapeHtml(glasl.needs_human_reason || 'Glasl needs human adjudication.')}</div>` : ''}
            </div>
        `;
    }

    function summarizeNi(domains, ni) {
        if (ni.needs_human || ni.status === 'needs_human') {
            return ni.needs_human_reason || 'Needs human NI adjudication.';
        }
        const parts = Object.keys(NI_DOMAIN_LABELS).map((key) => {
            const entry = domains[key];
            if (!entry) return null;
            const delta = typeof entry === 'object' ? entry.delta : entry;
            return `${key}:${delta}`;
        }).filter(Boolean);
        return parts.length ? parts.join(' · ') : 'No domain deltas.';
    }

    async function handleApprove(row) {
        try {
            await database.reviewPliSeat(row.id, SEAT, {
                status: 'approved',
                sme_reviewer: getReviewerName?.() || 'White Cell'
            });
            showToast({ message: 'NI & Escalation approved', type: 'success' });
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
        const tracks = row.record?.tracks || {};
        try {
            await database.reviewPliSeat(row.id, SEAT, {
                status: 'overridden',
                sme_reviewer: getReviewerName?.() || 'White Cell',
                override_value: {
                    national_interest: tracks.national_interest || null,
                    glasl: tracks.glasl || null
                },
                override_rationale: rationale
            });
            showToast({ message: 'Override saved for NI & Escalation', type: 'success' });
            await refresh();
        } catch (err) {
            logger.error(err);
            showToast({ message: 'Failed to save override', type: 'error' });
        }
    }

    async function handleSendBack(row) {
        const content = document.createElement('div');
        content.innerHTML = `
            <textarea id="pliNiSendBack" class="form-input form-textarea" rows="4" placeholder="Notes for White Cell / agent"></textarea>
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
                        const notes = document.getElementById('pliNiSendBack').value.trim();
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

export default createNiEscalationReview;
