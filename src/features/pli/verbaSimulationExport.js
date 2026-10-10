/**
 * Verba simulation export.
 * One JSON document for the whole session: every action under its move,
 * with the action description and the PLI macro series of record.
 */

import { getActionTitle, buildSourceActionPresentation } from './pliShared.js';
import { resolveOutputTracks } from './pliSmeEdits.js';

export const VERBA_SIMULATION_EXPORT_VERSION = 'pli-verba-simulation.v1';

const GAME_MOVES = Object.freeze([1, 2, 3]);
const TEAM_ORDER = Object.freeze(['blue', 'red', 'green', 'industry']);
const EXCLUDED_ARTIFACT_TYPES = Object.freeze([
    'strategic_orientation_selection',
    'strategic_orientation_forecast'
]);
const INDICATOR_ORDER = Object.freeze([
    'real_gdp_growth',
    'pce_inflation',
    'unemployment_rate',
    'trade_volume_growth',
    'fixed_investment_growth'
]);

function round2(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 100) / 100;
}

function teamRank(team) {
    const index = TEAM_ORDER.indexOf(String(team || '').toLowerCase());
    return index === -1 ? TEAM_ORDER.length : index;
}

function actionDescription(action) {
    const presentation = buildSourceActionPresentation(action || {});
    const narrative = String(presentation.narrative || '').trim();
    const usableNarrative = narrative && !/^no (objective )?narrative on record\.?$/i.test(narrative)
        ? narrative
        : '';
    const fallback = String(
        action?.expected_outcomes
        || action?.ally_contingencies
        || action?.goal
        || ''
    ).trim();
    return usableNarrative || fallback || '';
}

function peakDelta(deltas) {
    let peak = 0;
    (deltas || []).forEach((value) => {
        const number = Number(value);
        if (!Number.isFinite(number)) return;
        if (Math.abs(number) > Math.abs(peak)) peak = number;
    });
    return round2(peak);
}

function indicatorSeries(indicator, quarters) {
    const baseline = Array.isArray(indicator?.baseline) ? indicator.baseline : [];
    const deltas = Array.isArray(indicator?.deltas) ? indicator.deltas : [];
    const post = Array.isArray(indicator?.post_action) ? indicator.post_action : [];
    const length = Math.max(baseline.length, deltas.length, post.length, quarters.length);
    const points = [];
    for (let index = 0; index < length; index += 1) {
        points.push({
            quarter: quarters[index] || null,
            baseline: round2(baseline[index]),
            delta: round2(deltas[index]),
            postAction: round2(post[index] ?? baseline[index])
        });
    }
    return points;
}

function macroOutput(adjudication) {
    if (!adjudication) {
        return null;
    }
    const tracks = resolveOutputTracks(adjudication);
    const macro = tracks.macro || null;
    if (!macro) return null;
    const trend = macro.trend || {};
    const indicators = trend.indicators || {};
    const quarters = Array.isArray(trend.quarters) ? trend.quarters : [];
    const keys = [
        ...INDICATOR_ORDER.filter((key) => indicators[key]),
        ...Object.keys(indicators).filter((key) => !INDICATOR_ORDER.includes(key))
    ];
    return {
        status: macro.status || null,
        lever: macro.classification?.lever || null,
        instrument: macro.classification?.instrument || null,
        direction: macro.classification?.direction || null,
        implementationScore: macro.implementation?.score ?? null,
        fitScore: macro.fit?.score ?? null,
        fitBand: macro.fit?.band || null,
        submissionMonth: macro.submission_month || adjudication.record?.submission_month || null,
        noEffect: Boolean(trend.no_effect),
        indicators: keys.map((key) => {
            const indicator = indicators[key] || {};
            return {
                indicator: key,
                label: indicator.label || key,
                verdict: indicator.verdict || null,
                favorableDirection: indicator.favorable_direction ?? null,
                peakDelta: peakDelta(indicator.deltas),
                quarters: indicatorSeries(indicator, quarters)
            };
        })
    };
}

function actionRecord(action, adjudication) {
    const presentation = buildSourceActionPresentation(action || {});
    return {
        move: action?.move ?? null,
        actionId: action?.id || null,
        team: action?.team || null,
        delegation: action?.delegation_id || null,
        artifactType: action?.artifact_type || null,
        title: getActionTitle(action, { action_id: action?.id }),
        description: actionDescription(action),
        details: (presentation.details || []).map((entry) => ({
            label: entry.label,
            value: entry.value
        })),
        mechanism: action?.mechanism || null,
        sector: action?.sector || null,
        phase: action?.phase ?? null,
        status: action?.status || null,
        outcome: action?.outcome || null,
        macro: macroOutput(adjudication)
    };
}

export function buildVerbaSimulationExport({
    session = null,
    actions = [],
    adjudications = [],
    exportedAt = new Date().toISOString()
} = {}) {
    const included = (actions || []).filter((action) => (
        !EXCLUDED_ARTIFACT_TYPES.includes(action?.artifact_type)
    ));
    const adjudicationByAction = new Map(
        (adjudications || []).map((row) => [row.action_id, row])
    );
    const byMove = new Map();
    included.forEach((action) => {
        const move = Number(action?.move);
        const key = Number.isFinite(move) ? move : 0;
        if (!byMove.has(key)) byMove.set(key, []);
        byMove.get(key).push(actionRecord(action, adjudicationByAction.get(action.id) || null));
    });
    byMove.forEach((list) => {
        list.sort((a, b) => (
            teamRank(a.team) - teamRank(b.team)
            || String(a.title).localeCompare(String(b.title))
        ));
    });

    const moveNumbers = new Set(GAME_MOVES);
    byMove.forEach((_list, move) => {
        if (move > 0) moveNumbers.add(move);
    });
    const moves = [...moveNumbers].sort((a, b) => a - b).map((move) => {
        const moveActions = byMove.get(move) || [];
        return {
            move,
            actionCount: moveActions.length,
            actions: moveActions
        };
    });
    const rows = moves.flatMap((move) => move.actions.map((action) => ({
        ...action,
        move: move.move
    })));

    return {
        version: VERBA_SIMULATION_EXPORT_VERSION,
        description: 'Whole-simulation export for Verba. moves groups each action under the move it was filed in. rows is the same set as a flat table, one object per action, with the PLI macro indicator series on macro.indicators[].quarters.',
        exportedAt,
        session: {
            id: session?.id || null,
            code: session?.session_code || null,
            name: session?.name || null
        },
        moveCount: moves.length,
        actionCount: rows.length,
        moves,
        rows
    };
}

export function verbaSimulationFilename(payload) {
    const code = String(payload?.session?.code || 'session').replace(/[^\w.-]+/g, '-');
    return `${code}-verba-simulation.json`;
}

export function downloadVerbaSimulationExport(payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = verbaSimulationFilename(payload);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
