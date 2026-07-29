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
    PLI_VIEW_MODES,
    escapeHtml,
    getSeatReview,
    seatNeedsReview,
    seatIsFinalized,
    isPliRowVisible,
    leadSeatStatusBadge,
    isDownstreamSeatUnlocked,
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

export function niDomainDelta(entry) {
    if (entry == null) return null;
    if (typeof entry === 'number') return Number.isFinite(entry) ? entry : null;
    if (typeof entry === 'object') {
        const n = Number(entry.delta);
        return Number.isFinite(n) ? n : null;
    }
    const n = Number(entry);
    return Number.isFinite(n) ? n : null;
}

export function sumNiDeltas(domains = {}) {
    let sum = 0;
    let count = 0;
    for (const key of Object.keys(NI_DOMAIN_LABELS)) {
        const delta = niDomainDelta(domains[key]);
        if (delta == null) continue;
        sum += delta;
        count += 1;
    }
    return count ? sum : null;
}

export function formatSigned(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n > 0 ? `+${n}` : String(n);
}

export function summarizeNiPath(domains, ni = {}) {
    if (ni.needs_human || ni.status === 'needs_human') {
        return ni.needs_human_reason || 'Needs human NI adjudication.';
    }
    const parts = Object.keys(NI_DOMAIN_LABELS).map((key) => {
        const delta = niDomainDelta(domains[key]);
        if (delta == null) return null;
        return `${key}:${formatSigned(delta)}`;
    }).filter(Boolean);
    return parts.length ? parts.join(' · ') : 'No domain deltas.';
}

/** Outputs-column NI block: numbered net + path narrative + 1–6 bar (mirrors Glasl). */
export function renderOverallNiScore(domains, ni = {}) {
    if (ni.needs_human || ni.status === 'needs_human') {
        return `
            <div class="pli-block pli-ni-overall">
                <div class="pli-label">NI score</div>
                <p class="text-sm text-gray-500">${escapeHtml(ni.needs_human_reason || 'Needs human NI adjudication.')}</p>
            </div>
        `;
    }
    const net = sumNiDeltas(domains);
    if (net == null) {
        return `
            <div class="pli-block pli-ni-overall">
                <div class="pli-label">NI score</div>
                <p class="text-sm text-gray-500">No domain deltas on record.</p>
            </div>
        `;
    }
    const netTone = net > 0 ? 'is-positive' : (net < 0 ? 'is-negative' : 'is-zero');
    const path = summarizeNiPath(domains, ni);
    const chips = Object.keys(NI_DOMAIN_LABELS).map((key, index) => {
        const domainNum = String(index + 1);
        const delta = niDomainDelta(domains[key]);
        const label = NI_DOMAIN_LABELS[key];
        if (delta == null) {
            return `<span class="pli-ni-score-step is-missing" title="${escapeHtml(label)}">${escapeHtml(domainNum)}</span>`;
        }
        const tone = delta > 0 ? 'is-positive' : (delta < 0 ? 'is-negative' : 'is-zero');
        const active = delta !== 0 ? ' is-active' : '';
        return `<span class="pli-ni-score-step ${tone}${active}" title="${escapeHtml(`${key}: ${label} (${formatSigned(delta)})`)}">${escapeHtml(domainNum)}</span>`;
    }).join('');

    return `
        <div class="pli-block pli-ni-overall">
            <div class="pli-label">NI score</div>
            <p class="text-sm pli-ni-overall-net ${netTone}">
                Net <strong>${escapeHtml(formatSigned(net))}</strong>
                <span class="pli-ni-overall-delta">(Σ NI-1…NI-6)</span>
            </p>
            <p class="text-sm pli-ni-overall-narrative">${escapeHtml(path)}</p>
            <div class="pli-ni-score-bar" aria-label="National Interest domains 1 through 6" aria-hidden="true">
                ${chips}
            </div>
        </div>
    `;
}

export function createNiEscalationReview(options = {}) {
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
        title: 'NI & Escalation',
        description: isLeadReadonly
            ? 'Read-only NI / Escalation view. Draft agent outputs appear before SME finalize; Finalized is the official gate.'
            : 'National Interest domain deltas and Glasl escalation — same SME seat, analytically separate tracks. Unlocks after Macro is finalized or skipped.',
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
            logger.error('Failed to load NI/Escalation adjudications:', err);
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
            ? records.filter((r) => {
                const seat = getSeatReview(r, SEAT);
                return seatIsFinalized(seat) || seatNeedsReview(seat);
            })
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
                    ? 'No NI / Escalation drafts or finalized outputs yet'
                    : (locked > 0
                        ? 'Awaiting Macro finalize'
                        : (showReviewed ? 'No NI & Escalation adjudications' : 'No NI & Escalation items awaiting review')),
                isLeadReadonly
                    ? 'Draft NI / Escalation cards appear after the PLI pipeline runs. Finalized cards appear after SME approval.'
                    : (locked > 0
                        ? `${locked} item(s) waiting for Econ Macro finalize (or Macro skip on non-economic actions).`
                        : 'Every submitted action receives NI + Glasl tracks. Review pending rows after the PLI pipeline runs.')
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
        const leadBadge = isLeadReadonly ? leadSeatStatusBadge(seat) : null;
        const badgeClass = leadBadge?.badgeClass || STATUS_BADGE[status] || 'badge-secondary';
        const badgeLabel = leadBadge?.label || STATUS_LABELS[status] || status;
        const domains = ni.domain_deltas || ni.domains || {};

        card.innerHTML = `
            <header class="pli-sme-card-header">
                <div>
                    <h3 class="pli-sme-card-title">${escapeHtml(getActionTitle(action, row))}</h3>
                    <p class="text-sm text-gray-600">NI &amp; Escalation — SME Review</p>
                </div>
                <span class="badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
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
                    ${renderOverallNiScore(domains, ni)}
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
