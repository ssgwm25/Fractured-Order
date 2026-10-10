/**
 * Verba simulation export.
 * One JSON document for the whole session: every action under its move,
 * with the action description and the PLI macro series of record.
 */

import { getActionTitle, buildSourceActionPresentation } from './pliShared.js';
import { resolveOutputTracks } from './pliSmeEdits.js';

export const VERBA_SIMULATION_EXPORT_VERSION = 'pli-verba-simulation.v3';

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

const INDICATOR_GUIDE = Object.freeze({
    real_gdp_growth: { label: 'Real GDP growth (%)', favorableDirection: 1 },
    pce_inflation: { label: 'PCE inflation (Q4/Q4, %)', favorableDirection: -1 },
    unemployment_rate: { label: 'Unemployment rate (%)', favorableDirection: -1 },
    trade_volume_growth: { label: 'Trade volume growth (%)', favorableDirection: 1 },
    fixed_investment_growth: { label: 'Fixed investment growth (%)', favorableDirection: 1 }
});

const FLAG_GUIDE = Object.freeze({
    onset_beyond_horizon: 'The effect starts after the last forecast quarter, so every delta in this window is zero.',
    clamped_to_horizon: 'Submission timing was clamped to the forecast horizon.'
});

const EXPORT_DESCRIPTION = 'Whole-simulation export for Verba. moves groups each action under the move it was filed in. timeline.quarters is the shared forecast window and timeline.baseline is the shared U.S. indicator path. Each macro.indicators entry lines its delta and postAction arrays up with that window. postAction is the indicator level after the action. If an action uses a different window, it carries macro.quarters; if an indicator uses a different baseline, it carries baseline. rows is the flat action sheet: one object per action, with peaks and verdicts, and no second copy of the path. indicatorGuide says whether a higher or lower reading is favorable to the United States. macro.status scored is a finished series; pending means a series is attached but not marked finished. flagGuide explains macro.flags.';

function round2(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 100) / 100;
}

function teamRank(team) {
    const index = TEAM_ORDER.indexOf(String(team || '').toLowerCase());
    return index === -1 ? TEAM_ORDER.length : index;
}

function actionDescription(action, title) {
    const presentation = buildSourceActionPresentation(action || {});
    const narrative = String(presentation.narrative || '').trim();
    const usableNarrative = narrative && !/^no (objective )?narrative on record\.?$/i.test(narrative)
        ? narrative
        : '';
    const fallback = String(action?.expected_outcomes || action?.ally_contingencies || '').trim();
    const text = usableNarrative || fallback;
    if (!text || text === title) return null;
    return text;
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

function listsEqual(left, right) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

function favorableMeans(direction) {
    if (direction === -1) return 'Lower is favorable to the United States.';
    if (direction === 1) return 'Higher is favorable to the United States.';
    return null;
}

function alignedSeries(indicator, quarters) {
    const baseline = Array.isArray(indicator?.baseline) ? indicator.baseline : [];
    const deltas = Array.isArray(indicator?.deltas) ? indicator.deltas : [];
    const post = Array.isArray(indicator?.post_action) ? indicator.post_action : [];
    const length = Math.max(baseline.length, deltas.length, post.length, quarters.length);
    const labels = [];
    const baselineOut = [];
    const deltaOut = [];
    const postOut = [];
    for (let index = 0; index < length; index += 1) {
        labels.push(quarters[index] ?? null);
        baselineOut.push(round2(baseline[index]));
        deltaOut.push(round2(deltas[index]));
        const level = post[index];
        postOut.push(round2(level ?? baseline[index]));
    }
    return { quarters: labels, baseline: baselineOut, delta: deltaOut, postAction: postOut };
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
    const length = keys.reduce((max, key) => (
        Math.max(max, alignedSeries(indicators[key], quarters).delta.length)
    ), quarters.length);
    const axis = Array.from({ length }, (_, index) => quarters[index] ?? null);
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
        noEffectReason: trend.no_effect_reason || trend.reason || null,
        flags: Array.isArray(macro.flags) ? macro.flags : [],
        codebookVersion: adjudication.codebook_version || adjudication.record?.codebook_version || null,
        quarters: axis,
        indicators: keys.map((key) => {
            const indicator = indicators[key] || {};
            const series = alignedSeries(indicator, axis);
            return {
                indicator: key,
                label: indicator.label || INDICATOR_GUIDE[key]?.label || key,
                verdict: indicator.verdict || null,
                favorableDirection: indicator.favorable_direction ?? INDICATOR_GUIDE[key]?.favorableDirection ?? null,
                peakDelta: peakDelta(indicator.deltas),
                baseline: series.baseline,
                delta: series.delta,
                postAction: series.postAction
            };
        })
    };
}

function actionRecord(action, adjudication) {
    const presentation = buildSourceActionPresentation(action || {});
    const title = getActionTitle(action, { action_id: action?.id });
    const details = (presentation.details || []).map((entry) => ({
        label: entry.label,
        value: entry.value
    }));
    const record = {
        move: action?.move ?? null,
        actionId: action?.id || null,
        team: action?.team || null,
        artifactType: action?.artifact_type || null,
        title,
        description: actionDescription(action, title),
        mechanism: action?.mechanism || null,
        sector: action?.sector || null,
        phase: action?.phase ?? null,
        status: action?.status || null,
        workflowState: action?.workflow_state || null,
        outcome: action?.outcome || null,
        macro: macroOutput(adjudication)
    };
    if (action?.delegation_id) record.delegation = action.delegation_id;
    if (details.length) record.details = details;
    return record;
}

function indicatorPeaks(macro) {
    const peaks = {};
    (macro?.indicators || []).forEach((indicator) => {
        peaks[indicator.indicator] = {
            label: indicator.label,
            peakDelta: indicator.peakDelta,
            verdict: indicator.verdict
        };
    });
    return peaks;
}

function actionRow(action) {
    const macro = action.macro;
    return {
        move: action.move,
        actionId: action.actionId,
        team: action.team,
        artifactType: action.artifactType,
        title: action.title,
        description: action.description,
        mechanism: action.mechanism,
        sector: action.sector,
        phase: action.phase,
        status: action.status,
        workflowState: action.workflowState,
        outcome: action.outcome,
        macroStatus: macro?.status || null,
        lever: macro?.lever || null,
        instrument: macro?.instrument || null,
        direction: macro?.direction || null,
        implementationScore: macro?.implementationScore ?? null,
        fitScore: macro?.fitScore ?? null,
        fitBand: macro?.fitBand || null,
        submissionMonth: macro?.submissionMonth || null,
        codebookVersion: macro?.codebookVersion || null,
        noEffect: macro ? macro.noEffect : null,
        noEffectReason: macro?.noEffectReason || null,
        flags: macro?.flags || [],
        peaks: macro ? indicatorPeaks(macro) : null
    };
}

function macrosWithSeries(moves) {
    const macros = [];
    moves.forEach((move) => {
        move.actions.forEach((action) => {
            if (action.macro?.indicators?.length) macros.push(action.macro);
        });
    });
    return macros;
}

function compactSharedTimeline(moves) {
    const macros = macrosWithSeries(moves);
    const timeline = { quarters: [], baseline: {} };
    if (!macros.length) return timeline;

    const sharedQuarters = macros.every((macro) => listsEqual(macro.quarters, macros[0].quarters))
        ? macros[0].quarters
        : null;
    if (sharedQuarters) timeline.quarters = sharedQuarters;

    const keys = [];
    macros.forEach((macro) => {
        macro.indicators.forEach((indicator) => {
            if (!keys.includes(indicator.indicator)) keys.push(indicator.indicator);
        });
    });
    keys.forEach((key) => {
        const baselines = macros.flatMap((macro) => {
            const found = macro.indicators.find((indicator) => indicator.indicator === key);
            return found ? [found.baseline] : [];
        });
        if (baselines.length && baselines.every((list) => listsEqual(list, baselines[0]))) {
            timeline.baseline[key] = baselines[0];
        }
    });

    macros.forEach((macro) => {
        if (sharedQuarters) delete macro.quarters;
        macro.indicators = macro.indicators.map((indicator) => {
            const next = {
                indicator: indicator.indicator,
                label: indicator.label,
                verdict: indicator.verdict,
                favorableDirection: indicator.favorableDirection,
                peakDelta: indicator.peakDelta,
                delta: indicator.delta,
                postAction: indicator.postAction
            };
            if (!listsEqual(indicator.baseline, timeline.baseline[indicator.indicator])) {
                next.baseline = indicator.baseline;
            }
            return next;
        });
    });
    return timeline;
}

function sharedCodebookVersion(moves) {
    const versions = new Set();
    macrosWithSeries(moves).forEach((macro) => {
        if (macro.codebookVersion) versions.add(macro.codebookVersion);
    });
    return versions.size === 1 ? [...versions][0] : null;
}

function buildIndicatorGuide(moves) {
    const guide = {};
    INDICATOR_ORDER.forEach((key) => {
        const known = INDICATOR_GUIDE[key];
        guide[key] = {
            label: known.label,
            favorableDirection: known.favorableDirection,
            favorableMeans: favorableMeans(known.favorableDirection)
        };
    });
    moves.forEach((move) => {
        move.actions.forEach((action) => {
            (action.macro?.indicators || []).forEach((indicator) => {
                const current = guide[indicator.indicator] || {
                    label: indicator.label,
                    favorableDirection: indicator.favorableDirection,
                    favorableMeans: favorableMeans(indicator.favorableDirection)
                };
                if (indicator.label) current.label = indicator.label;
                if (indicator.favorableDirection === 1 || indicator.favorableDirection === -1) {
                    current.favorableDirection = indicator.favorableDirection;
                    current.favorableMeans = favorableMeans(indicator.favorableDirection);
                }
                guide[indicator.indicator] = current;
            });
        });
    });
    return guide;
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
    const timeline = compactSharedTimeline(moves);
    const rows = moves.flatMap((move) => move.actions.map((action) => actionRow(action)));

    return {
        version: VERBA_SIMULATION_EXPORT_VERSION,
        description: EXPORT_DESCRIPTION,
        exportedAt,
        session: {
            id: session?.id || null,
            code: session?.session_code || null,
            name: session?.name || null
        },
        codebookVersion: sharedCodebookVersion(moves),
        timeline,
        indicatorGuide: buildIndicatorGuide(moves),
        flagGuide: { ...FLAG_GUIDE },
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
