/**
 * Plenary board aggregations over SME-finalized PLI report rows.
 */

import { TEAM_OPTIONS } from '../../core/teamContext.js';
import {
    PLI_REPORT_SCOPES,
    buildCumulativeMacroTrend,
    collectFinalizedPliReportRows,
    filterReportRowsForScope,
    listReportMoves
} from '../pli/pliReportBuilders.js';
import {
    GLASL_LABELS,
    NI_DOMAIN_LABELS,
    headlineNiNet,
    niDomainDelta
} from '../pli/NiEscalationReview.js';

export const FO_DISPLAY_START = '2027Q1';
export const FO_DISPLAY_END = '2032Q4';
export const DEFAULT_GLASL_STAGE = 4;
export const GLASL_OPERATING_MIN = 4;
export const GLASL_OPERATING_MAX = 7;

export const MACRO_INDICATORS = Object.freeze([
    { key: 'real_gdp_growth', label: 'Real GDP growth' },
    { key: 'pce_inflation', label: 'PCE inflation' },
    { key: 'unemployment_rate', label: 'Unemployment rate' },
    { key: 'trade_volume_growth', label: 'Trade volume growth' },
    { key: 'fixed_investment_growth', label: 'Fixed investment growth' }
]);

export { GLASL_LABELS, NI_DOMAIN_LABELS, PLI_REPORT_SCOPES };

function isQuarterLabel(value) {
    return /^\d{4}Q[1-4]$/.test(String(value || ''));
}

function asNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * Trim a 36-quarter trend to the FO display window. Fixtures without
 * YYYYQn labels are returned unchanged.
 * @param {Object|null} trend
 * @returns {Object|null}
 */
export function sliceTrendToDisplayWindow(trend) {
    if (!trend?.indicators) return trend || null;
    const quarters = trend.quarters || trend.years || [];
    if (!quarters.length || !quarters.every(isQuarterLabel)) {
        return trend;
    }
    const start = quarters.findIndex((q) => String(q) >= FO_DISPLAY_START);
    let end = -1;
    for (let i = quarters.length - 1; i >= 0; i -= 1) {
        if (String(quarters[i]) <= FO_DISPLAY_END) {
            end = i;
            break;
        }
    }
    if (start < 0 || end < 0 || start > end) return trend;
    const slicedQuarters = quarters.slice(start, end + 1);
    const indicators = {};
    for (const [key, indicator] of Object.entries(trend.indicators)) {
        indicators[key] = {
            ...indicator,
            baseline: Array.isArray(indicator.baseline)
                ? indicator.baseline.slice(start, end + 1)
                : indicator.baseline,
            post_action: Array.isArray(indicator.post_action)
                ? indicator.post_action.slice(start, end + 1)
                : indicator.post_action,
            deltas: Array.isArray(indicator.deltas)
                ? indicator.deltas.slice(start, end + 1)
                : indicator.deltas
        };
    }
    return {
        ...trend,
        quarters: slicedQuarters,
        years: slicedQuarters,
        indicators
    };
}

export function collectPlenaryReportRows(adjudications = [], actionsById = new Map()) {
    const createdById = new Map(
        (adjudications || []).map((row) => [row.id, row.created_at || row.updated_at || null])
    );
    return collectFinalizedPliReportRows(adjudications, actionsById).map((row) => ({
        ...row,
        createdAt: createdById.get(row.adjudicationId) || null
    }));
}

export function plenaryNiTitle(rows = []) {
    const hasNonBlue = (rows || []).some((row) => String(row.team || '').trim().toLowerCase() !== 'blue');
    return hasNonBlue ? 'National Interest (impact on Blue)' : 'National Interest';
}

export function rollupNationalInterest(rows = []) {
    const domains = Object.keys(NI_DOMAIN_LABELS).map((key) => ({
        key,
        label: NI_DOMAIN_LABELS[key],
        delta: 0,
        count: 0,
        primary: false
    }));
    const byKey = Object.fromEntries(domains.map((domain) => [domain.key, domain]));
    const byMove = new Map();

    for (const row of rows) {
        if (!row?.finalized?.national_interest_escalation) continue;
        const ni = row.tracks?.national_interest;
        if (!ni) continue;
        const domainMap = ni.domain_deltas || ni.domains || {};
        const net = headlineNiNet(domainMap, ni);
        const move = asNumber(row.move);
        if (move != null && net != null) {
            byMove.set(move, (byMove.get(move) || 0) + net);
        }
        const primaries = new Set(
            ni.orientation_assessment?.primary_domains || ni.primary_domains || []
        );
        for (const key of Object.keys(NI_DOMAIN_LABELS)) {
            const delta = niDomainDelta(domainMap[key]);
            if (delta == null) continue;
            byKey[key].delta += delta;
            byKey[key].count += 1;
            if (primaries.has(key)) byKey[key].primary = true;
        }
    }

    return {
        title: plenaryNiTitle(rows),
        domains: domains.map((domain) => ({
            ...domain,
            delta: Math.round(domain.delta * 100) / 100
        })),
        orientationByMove: [...byMove.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([move, net]) => ({ move, net: Math.round(net * 100) / 100 })),
        hasData: domains.some((domain) => domain.count > 0)
    };
}

function sortByCreatedAt(a, b, direction = 1) {
    const left = Date.parse(a.createdAt) || 0;
    const right = Date.parse(b.createdAt) || 0;
    if (left !== right) return (left - right) * direction;
    return ((a.move ?? 0) - (b.move ?? 0)) * direction;
}

export function rollupGlasl(rows = []) {
    const points = [];
    for (const row of rows) {
        if (!row?.finalized?.national_interest_escalation) continue;
        const glasl = row.tracks?.glasl;
        const after = Number(glasl?.stage_after);
        if (!Number.isInteger(after) || after < 1 || after > 9) continue;
        const before = Number(glasl?.stage_before);
        const delta = asNumber(glasl?.delta);
        points.push({
            actionId: row.actionId,
            title: row.title,
            team: String(row.team || 'unknown').toLowerCase(),
            move: asNumber(row.move),
            stageBefore: Number.isInteger(before) ? before : null,
            stageAfter: after,
            delta: delta != null ? delta : (Number.isInteger(before) ? after - before : null),
            createdAt: row.createdAt || ''
        });
    }
    points.sort((a, b) => sortByCreatedAt(a, b, 1));
    const newest = [...points].sort((a, b) => sortByCreatedAt(a, b, -1))[0] || null;
    return {
        currentStage: newest?.stageAfter ?? DEFAULT_GLASL_STAGE,
        startStage: DEFAULT_GLASL_STAGE,
        currentLabel: GLASL_LABELS[newest?.stageAfter] || GLASL_LABELS[DEFAULT_GLASL_STAGE],
        points,
        hasData: points.length > 0
    };
}

export function rollupTeamActivity(rows = []) {
    const counts = Object.fromEntries(TEAM_OPTIONS.map((team) => [team.id, 0]));
    for (const row of rows) {
        const id = String(row.team || '').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(counts, id)) {
            counts[id] += 1;
        }
    }
    const max = Math.max(1, ...Object.values(counts));
    return TEAM_OPTIONS.map((team) => ({
        id: team.id,
        label: team.shortLabel,
        count: counts[team.id],
        share: counts[team.id] / max
    }));
}

export function rollupDiplomacyBands(rows = []) {
    const counts = new Map();
    for (const row of rows) {
        if (!row?.finalized?.diplomacy_information) continue;
        const band = row.tracks?.diplomacy?.band;
        if (!band) continue;
        const key = String(band);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([band, count]) => ({ band, count }));
}

export function buildTickerItems(rows = []) {
    const items = (rows || []).map((row) => {
        const ni = row.tracks?.national_interest;
        const domains = ni?.domain_deltas || ni?.domains || {};
        const net = row.finalized?.national_interest_escalation
            ? headlineNiNet(domains, ni || {})
            : null;
        const delta = row.finalized?.national_interest_escalation
            ? asNumber(row.tracks?.glasl?.delta)
            : null;
        return {
            actionId: row.actionId,
            team: String(row.team || '—'),
            move: asNumber(row.move),
            title: row.title,
            glaslDelta: delta,
            niNet: net,
            createdAt: row.createdAt || ''
        };
    });
    items.sort((a, b) => sortByCreatedAt(a, b, -1));
    return items.slice(0, 16);
}

export function pickCodebookVersion(rows = []) {
    for (const row of rows) {
        if (row?.codebookVersion) return row.codebookVersion;
    }
    return '';
}

/**
 * @param {{
 *   reportRows?: Object[],
 *   selection?: { scope?: string, move?: number|null },
 *   gameState?: Object|null,
 *   sessionMeta?: Object
 * }} input
 */
export function buildPlenaryModel({
    reportRows = [],
    selection = { scope: PLI_REPORT_SCOPES.SIMULATION, move: null },
    gameState = null,
    sessionMeta = {}
} = {}) {
    const resolvedSelection = {
        scope: selection.scope || PLI_REPORT_SCOPES.SIMULATION,
        move: selection.move ?? null
    };
    const scoped = filterReportRowsForScope(reportRows, resolvedSelection);
    const macroTrend = sliceTrendToDisplayWindow(buildCumulativeMacroTrend(scoped));
    return {
        scoped,
        selection: resolvedSelection,
        sessionMeta,
        gameState,
        codebookVersion: pickCodebookVersion(scoped) || pickCodebookVersion(reportRows),
        actionCount: scoped.length,
        moves: listReportMoves(reportRows),
        macroTrend,
        ni: rollupNationalInterest(scoped),
        glasl: rollupGlasl(scoped),
        teams: rollupTeamActivity(scoped),
        diplomacyBands: rollupDiplomacyBands(scoped),
        ticker: buildTickerItems(scoped)
    };
}
