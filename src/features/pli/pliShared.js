/**
 * Shared helpers for PLI White Cell SME review panels.
 */

import { getBlueActionViewModel } from '../actions/blueActionDetails.js';

export const SEATS = Object.freeze({
    MACRO: 'macro',
    DIPLOMACY_INFORMATION: 'diplomacy_information',
    NATIONAL_INTEREST_ESCALATION: 'national_interest_escalation'
});

export const SEAT_STATUS = Object.freeze({
    PENDING: 'pending',
    APPROVED: 'approved',
    OVERRIDDEN: 'overridden',
    NEEDS_HUMAN: 'needs_human',
    SKIPPED: 'skipped'
});

export const NAVY = '#1f3b6e';
export const GOLD = '#7a4b00';
export const GREEN = '#0a4d28';
export const GREEN_FILL = '#0f6b35';
export const RED = '#b04a4a';
export const GREY = '#5a5f6e';

export const STATUS_LABELS = {
    pending: 'Pending SME review',
    approved: 'Approved',
    overridden: 'Overridden',
    needs_human: 'Needs human adjudication',
    skipped: 'Skipped (not routed)'
};

export const STATUS_BADGE = {
    pending: 'badge-warning',
    approved: 'badge-success',
    overridden: 'badge-primary',
    needs_human: 'badge-danger',
    skipped: 'badge-secondary'
};

export function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function getSeatReview(row, seatId) {
    const seats = row?.seat_reviews || {};
    return seats[seatId] || { status: row?.status || SEAT_STATUS.PENDING };
}

export function seatNeedsReview(seat) {
    const status = seat?.status || SEAT_STATUS.PENDING;
    return status === SEAT_STATUS.PENDING || status === SEAT_STATUS.NEEDS_HUMAN;
}

export function seatIsFinalized(seat) {
    const status = seat?.status || SEAT_STATUS.PENDING;
    return status === SEAT_STATUS.APPROVED || status === SEAT_STATUS.OVERRIDDEN;
}

/**
 * NI / Diplomacy SME queues unlock only after Macro is finalized or skipped
 * (non-economic actions skip Macro).
 */
export function isDownstreamSeatUnlocked(row) {
    const macro = getSeatReview(row, SEATS.MACRO);
    const status = macro?.status || SEAT_STATUS.PENDING;
    return status === SEAT_STATUS.APPROVED
        || status === SEAT_STATUS.OVERRIDDEN
        || status === SEAT_STATUS.SKIPPED;
}

export const PLI_VIEW_MODES = Object.freeze({
    REVIEW: 'review',
    LEAD_READONLY: 'lead_readonly'
});

/**
 * Shared visibility filter for SME review vs White Cell Lead finalized viewer.
 * @param {Object} row
 * @param {string} seatId
 * @param {{ viewMode?: string, showReviewed?: boolean, isRowUnlocked?: (row: Object) => boolean }} options
 */
export function isPliRowVisible(row, seatId, {
    viewMode = PLI_VIEW_MODES.REVIEW,
    showReviewed = false,
    isRowUnlocked = () => true
} = {}) {
    if (typeof isRowUnlocked === 'function' && !isRowUnlocked(row)) {
        return false;
    }

    const seat = getSeatReview(row, seatId);

    if (viewMode === PLI_VIEW_MODES.LEAD_READONLY) {
        return seatIsFinalized(seat);
    }

    if (seat.status === SEAT_STATUS.SKIPPED) {
        return showReviewed;
    }

    return showReviewed || seatNeedsReview(seat);
}

export function getActionTitle(action, row) {
    return (
        action?.goal
        || action?.title
        || row?.record?.action?.goal
        || `Action ${(row?.action_id || '').toString().slice(0, 8)}`
    );
}

export function getMacroBlock(record = {}) {
    const tracks = record.tracks || {};
    const macro = tracks.macro || null;
    const worksheet = record.worksheet || macro?.worksheet || null;
    const adjudication = record.adjudication || (macro && macro.status !== 'needs_human'
        ? {
            classification: macro.classification,
            precedent: macro.precedent,
            implementation: macro.implementation,
            fit: macro.fit,
            trend: macro.trend,
            flags: macro.flags
        }
        : null);
    return { macro, worksheet, adjudication, tracks };
}

export function renderTrendCharts(trend, submissionMonth) {
    const grid = document.createElement('div');
    grid.className = 'pli-trend-grid';
    if (!trend?.indicators) {
        grid.innerHTML = '<p class="text-sm text-gray-500">No trend series for this action.</p>';
        return grid;
    }
    const periods = trend.quarters || trend.years || [];
    Object.values(trend.indicators).forEach((indicator) => {
        grid.appendChild(renderIndicatorChart(periods, indicator, submissionMonth));
    });
    return grid;
}

function renderIndicatorChart(periods, indicator, submissionMonth) {
    const width = 280;
    const height = 168;
    const pad = { top: 28, right: 10, bottom: 22, left: 34 };
    const n = Math.max(periods.length, 1);
    const base = indicator.baseline || [];
    const post = indicator.post_action || base;
    const favDir = Number(indicator.favorable_direction ?? 1);
    const allValues = base.concat(post);
    let min = Math.min(...allValues);
    let max = Math.max(...allValues);
    if (max - min < 1) {
        const mid = (max + min) / 2;
        min = mid - 0.5;
        max = mid + 0.5;
    }
    const spanX = width - pad.left - pad.right;
    const spanY = height - pad.top - pad.bottom;
    const x = (i) => pad.left + (spanX * i) / Math.max(n - 1, 1);
    const y = (value) => pad.top + spanY * (1 - (value - min) / (max - min));
    const pathOf = (series) => series.map((value, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    const verdictColor = indicator.verdict === 'favorable' ? GREEN : (indicator.verdict === 'unfavorable' ? RED : GREY);

    const fillSegments = [];
    for (let i = 0; i < n - 1; i += 1) {
        const signed = ((post[i] - base[i]) + (post[i + 1] - base[i + 1])) / 2 * favDir;
        if (Math.abs(signed) < 1e-9) continue;
        const fillColor = signed > 0 ? GREEN_FILL : RED;
        const opacity = signed > 0 ? 0.45 : 0.28;
        const d = [
            `M${x(i).toFixed(1)},${y(base[i]).toFixed(1)}`,
            `L${x(i + 1).toFixed(1)},${y(base[i + 1]).toFixed(1)}`,
            `L${x(i + 1).toFixed(1)},${y(post[i + 1]).toFixed(1)}`,
            `L${x(i).toFixed(1)},${y(post[i]).toFixed(1)}`,
            'Z'
        ].join(' ');
        fillSegments.push(`<path d="${d}" fill="${fillColor}" fill-opacity="${opacity}" stroke="none"/>`);
    }

    const gridLines = periods.map((period, i) => {
        const label = String(period);
        const showLabel = label.endsWith('Q1') || (!label.includes('Q') && i % Math.max(1, Math.floor(n / 6)) === 0);
        return `
            <line x1="${x(i)}" y1="${pad.top}" x2="${x(i)}" y2="${height - pad.bottom}" stroke="#e4e6eb" stroke-width="1"/>
            ${showLabel ? `<text x="${x(i)}" y="${height - 6}" font-size="7" text-anchor="middle" fill="${GREY}">${label.slice(2, 4)}</text>` : ''}
        `;
    }).join('');

    const yTicks = [min, (min + max) / 2, max].map((value) => `
        <text x="${pad.left - 4}" y="${y(value) + 3}" font-size="8" text-anchor="end" fill="${GREY}">${value.toFixed(1)}</text>
    `).join('');

    const holder = document.createElement('div');
    holder.className = 'pli-chart-card';
    holder.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(indicator.label)} baseline vs post-action" style="width:100%; height:auto; display:block;">
            <text x="${pad.left}" y="14" font-size="9" font-weight="700" fill="${verdictColor}">${escapeHtml(indicator.label)}</text>
            <text x="${width - pad.right}" y="14" font-size="9" font-weight="700" text-anchor="end" fill="${verdictColor}">[${indicator.verdict}]</text>
            ${gridLines}
            ${yTicks}
            ${fillSegments.join('')}
            <path d="${pathOf(base)}" fill="none" stroke="${NAVY}" stroke-width="1.9"/>
            <path d="${pathOf(post)}" fill="none" stroke="${GOLD}" stroke-width="1.9" stroke-dasharray="5,3"/>
        </svg>
    `;
    return holder;
}

export function createSeatPanelShell({
    title,
    description,
    seatId,
    viewMode = PLI_VIEW_MODES.REVIEW,
    countLabel = null
} = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pli-sme-panel';
    wrapper.dataset.seat = seatId;
    const isLeadReadonly = viewMode === PLI_VIEW_MODES.LEAD_READONLY;
    const resolvedCountLabel = countLabel
        || (isLeadReadonly
            ? `${title} ready to view`
            : `awaiting ${title} review`);
    const reviewedToggleLabel = isLeadReadonly
        ? 'Show all finalized'
        : 'Show reviewed / skipped';
    wrapper.innerHTML = `
        <div class="pli-sme-toolbar">
            <div class="pli-sme-toolbar-left">
                <span class="badge badge-primary" data-pli-pending-count>0</span>
                <span class="text-sm text-gray-600">${escapeHtml(resolvedCountLabel)}</span>
            </div>
            <div class="pli-sme-toolbar-right">
                <label class="checkbox-label">
                    <input type="checkbox" data-pli-show-reviewed>
                    <span class="text-sm">${escapeHtml(reviewedToggleLabel)}</span>
                </label>
                <button type="button" class="btn btn-secondary btn-sm" data-pli-refresh>Refresh</button>
            </div>
        </div>
        <p class="text-sm text-gray-600 pli-sme-desc">${escapeHtml(description)}</p>
        <div class="pli-sme-list" data-pli-list aria-live="polite"></div>
    `;
    return wrapper;
}

export function emptyState(message, detail) {
    return `
        <div class="empty-state">
            <h3 class="empty-state-title">${escapeHtml(message)}</h3>
            <p class="empty-state-message">${escapeHtml(detail)}</p>
        </div>
    `;
}

const EMPTY_DETAIL_MARKERS = new Set([
    '',
    'none',
    'n/a',
    'na',
    '—',
    '-',
    'none selected',
    'not selected',
    'not specified'
]);

function isEmptyDetailValue(value) {
    if (value == null) return true;
    if (Array.isArray(value)) return value.length === 0;
    const text = String(value).trim();
    if (!text) return true;
    return EMPTY_DETAIL_MARKERS.has(text.toLowerCase());
}

function formatDetailValue(value) {
    if (Array.isArray(value)) return value.join(', ');
    return String(value).trim();
}

function pushDetail(details, label, value) {
    if (isEmptyDetailValue(value)) return;
    details.push({ label, value: formatDetailValue(value) });
}

function decisionListDetail(decision, list) {
    if (decision === 'No') return 'No';
    if (!isEmptyDetailValue(list)) return list;
    if (decision === 'Yes') return 'Yes';
    return null;
}

/**
 * Split Blue action dumps into prose Objective + compact structured fields.
 * Non-structured actions keep a single narrative fallback.
 */
export function buildSourceActionPresentation(action = null, record = {}) {
    const view = action ? getBlueActionViewModel(action) : null;
    const details = [];

    if (view?.hasBlueActionDetails) {
        pushDetail(details, 'Instruments', view.instruments);
        pushDetail(details, 'Levers', view.levers);
        pushDetail(details, 'Sectors', view.sectors);

        const supplyAngles = view.supplyChainActionAngles;
        const supplyAreas = view.supplyChainAreas;
        if (view.supplyChainFocusDecision === 'No') {
            pushDetail(details, 'Supply chain focus', 'No');
        } else {
            pushDetail(details, 'Supply chain angles', supplyAngles);
            pushDetail(details, 'Supply chain areas', supplyAreas);
            if (
                isEmptyDetailValue(supplyAngles)
                && isEmptyDetailValue(supplyAreas)
                && view.supplyChainFocusDecision === 'Yes'
            ) {
                pushDetail(details, 'Supply chain focus', 'Yes');
            }
        }

        pushDetail(details, 'Implementation', view.implementation);
        pushDetail(details, 'Legislative options', view.legislativeOptions);
        pushDetail(details, 'Enforcement timeline', view.enforcementTimeline);
        pushDetail(
            details,
            'Coordinated with',
            decisionListDetail(view.coordinatedDecision, view.coordinated)
        );
        pushDetail(
            details,
            'Informed / engaged',
            decisionListDetail(view.informedEngagedDecision, view.informed)
        );

        const narrative = (
            view.objective
            || action?.description
            || action?.expected_outcomes
            || record.action?.expected_outcomes
            || ''
        ).trim();

        return {
            narrative: narrative || 'No objective narrative on record.',
            details,
            structured: true
        };
    }

    const narrative = (
        action?.description
        || action?.ally_contingencies
        || action?.expected_outcomes
        || record.action?.expected_outcomes
        || ''
    ).trim();

    return {
        narrative: narrative || 'No narrative on record.',
        details: [],
        structured: false
    };
}

function renderSourceDetails(details) {
    if (!details.length) return '';
    return `
        <dl class="pli-detail-meta">
            ${details.map((entry) => `
                <div>
                    <dt>${escapeHtml(entry.label)}</dt>
                    <dd>${escapeHtml(entry.value)}</dd>
                </div>
            `).join('')}
        </dl>
    `;
}

export function sourceActionColumn(action, row, record) {
    const title = getActionTitle(action, row);
    const orientation = record.declared_orientation
        || record.tracks?.orientation
        || '—';
    const presentation = buildSourceActionPresentation(action, record);
    const completed = action?.submitted_at || action?.updated_at || action?.created_at || '';
    return `
        <aside class="pli-col pli-col-source">
            <h3 class="pli-col-title">1. Source action</h3>
            <h4 class="pli-action-title">${escapeHtml(title)}</h4>
            <dl class="pli-meta">
                <div><dt>Acting team</dt><dd>${escapeHtml(action?.team || record.action?.team || '—')}</dd></div>
                <div><dt>Move</dt><dd>${escapeHtml(String(action?.move ?? record.action?.move ?? '—'))}</dd></div>
                <div><dt>Declared orientation</dt><dd>${escapeHtml(String(orientation))}</dd></div>
                <div><dt>Instrument of power</dt><dd>${escapeHtml(String(action?.mechanism || record.action?.mechanism || record.action?.instrument_of_power || '—'))}</dd></div>
            </dl>
            <div class="pli-narrative">
                <div class="pli-label">Action narrative</div>
                <div class="pli-narrative-body">${escapeHtml(presentation.narrative)}</div>
            </div>
            ${presentation.details.length ? `
                <div class="pli-source-details">
                    <div class="pli-label">Action details</div>
                    ${renderSourceDetails(presentation.details)}
                </div>` : ''}
            <p class="pli-source-footer text-sm">
                <span class="badge badge-success">White Cell: action complete</span>
                ${completed ? `<span class="text-gray-500"> · ${escapeHtml(String(completed))}</span>` : ''}
            </p>
        </aside>
    `;
}

export function footerActions({ approveLabel, canApprove, canOverride, overrideDisabledReason }) {
    return `
        <footer class="pli-sme-footer">
            <button type="button" class="btn btn-primary" data-pli-approve ${canApprove ? '' : 'disabled'}>
                ${escapeHtml(approveLabel)}
            </button>
            <button type="button" class="btn btn-secondary" data-pli-override ${canOverride ? '' : 'disabled'}
                title="${escapeHtml(overrideDisabledReason || '')}">
                Override &amp; Save
            </button>
            <button type="button" class="btn btn-secondary" data-pli-sendback>
                Send Back / Needs Human
            </button>
            <span class="pli-footer-note text-sm text-gray-600">Approval is required to finalize this seat&apos;s outputs.</span>
        </footer>
    `;
}
