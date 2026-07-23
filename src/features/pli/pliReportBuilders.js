/**
 * PLI after-action report builders for White Cell Lead PDF export.
 * Only SME-finalized seats (approved / overridden) are included.
 */

import {
    SEATS,
    escapeHtml,
    getSeatReview,
    seatIsFinalized,
    getActionTitle,
    indicatorChartSvgHtml
} from './pliShared.js';

export const PLI_REPORT_SCOPES = Object.freeze({
    ACTION: 'action',
    MOVE: 'move',
    SIMULATION: 'simulation'
});

const MAX_FACT_PACK_CHARS = 80000;

function asNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function formatSigned(value) {
    const n = asNumber(value);
    if (n == null) return 'n/a';
    return n > 0 ? `+${n}` : String(n);
}

function formatList(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (value == null || value === '') return '';
    return String(value);
}

/** NI is always U.S./Blue-centric; label that for non-Blue acting teams. */
export function nationalInterestSectionTitle(team) {
    return String(team || '').trim().toLowerCase() === 'blue'
        ? 'National Interest'
        : 'National Interest (impact on Blue)';
}

function resolveActionMeta(row, actionsById = new Map()) {
    const action = actionsById.get(row.action_id) || null;
    const record = row.record || {};
    const recordAction = record.action || {};
    const move = asNumber(action?.move ?? recordAction.move ?? record.move);
    return {
        actionId: row.action_id,
        title: getActionTitle(action, row),
        team: action?.team || recordAction.team || 'unknown',
        move,
        mechanism: action?.mechanism || recordAction.mechanism || '',
        instrumentOfPower: action?.instrument_of_power
            || recordAction.instrument_of_power
            || record.tracks?.routing?.instrument_of_power
            || '',
        goal: action?.goal || recordAction.goal || '',
        action
    };
}

function resolveTracks(row) {
    const record = row.record || {};
    const tracks = { ...(record.tracks || {}) };

    const macroSeat = getSeatReview(row, SEATS.MACRO);
    if (seatIsFinalized(macroSeat) && macroSeat.override_value && typeof macroSeat.override_value === 'object') {
        const ov = macroSeat.override_value;
        if (ov.macro || ov.adjudication || ov.trend) {
            tracks.macro = { ...(tracks.macro || {}), ...ov, ...(ov.macro || {}) };
        }
    }

    const dipSeat = getSeatReview(row, SEATS.DIPLOMACY_INFORMATION);
    if (seatIsFinalized(dipSeat) && dipSeat.override_value && typeof dipSeat.override_value === 'object') {
        const ov = dipSeat.override_value;
        if (ov.diplomacy !== undefined) tracks.diplomacy = ov.diplomacy;
        if (ov.information !== undefined) tracks.information = ov.information;
    }

    const niSeat = getSeatReview(row, SEATS.NATIONAL_INTEREST_ESCALATION);
    if (seatIsFinalized(niSeat) && niSeat.override_value && typeof niSeat.override_value === 'object') {
        const ov = niSeat.override_value;
        if (ov.national_interest !== undefined) tracks.national_interest = ov.national_interest;
        if (ov.glasl !== undefined) tracks.glasl = ov.glasl;
    }

    return tracks;
}

/**
 * True when Macro produced a real lever vector (not NE-skipped / no-effect).
 * @param {Object|null|undefined} macro
 */
function macroHasScoredVector(macro) {
    if (!macro) return false;
    if (macro.status === 'skipped_ne' || macro.status === 'skipped') return false;
    if (macro.trend?.no_effect || macro.noEffect) return false;
    return true;
}

function indicatorHasSeries(indicator) {
    return Array.isArray(indicator?.baseline) && indicator.baseline.length > 0;
}

function padSeries(values, n, fill = 0) {
    const out = (values || []).map(Number).slice(0, n);
    while (out.length < n) out.push(fill);
    return out;
}

function rollupVerdict(baseline, post, favorableDirection) {
    const favDir = Number(favorableDirection ?? 1) || 1;
    let net = 0;
    for (let i = 0; i < baseline.length; i += 1) {
        net += ((post[i] ?? 0) - (baseline[i] ?? 0)) * favDir;
    }
    if (Math.abs(net) < 1e-9) return 'neutral';
    return net > 0 ? 'favorable' : 'unfavorable';
}

/**
 * Uncapped FO 2.0 stack of finalized Macro deltas in the report scope.
 * One cumulative trend for Move/Sim charts (not per-action).
 * @param {Object[]} reportRows collected via collectFinalizedPliReportRows
 * @returns {Object|null} synthetic trend or null when no series available
 */
export function buildCumulativeMacroTrend(reportRows = []) {
    const scored = (reportRows || []).filter(
        (row) => row?.finalized?.macro && macroHasScoredVector(row.tracks?.macro)
    );
    if (!scored.length) return null;

    let quarters = null;
    const indicatorMeta = new Map();

    for (const row of scored) {
        const trend = row.tracks.macro.trend || {};
        if (!quarters) {
            const q = trend.quarters || trend.years || [];
            if (Array.isArray(q) && q.length) quarters = [...q];
        }
        for (const [key, ind] of Object.entries(trend.indicators || {})) {
            if (!indicatorHasSeries(ind)) continue;
            if (!indicatorMeta.has(key)) {
                indicatorMeta.set(key, {
                    label: ind.label || key,
                    favorable_direction: Number(ind.favorable_direction ?? 1) || 1,
                    baseline: ind.baseline.map(Number)
                });
            }
        }
    }

    if (!indicatorMeta.size) return null;

    if (!quarters || !quarters.length) {
        const firstBaseline = indicatorMeta.values().next().value.baseline;
        quarters = firstBaseline.map((_, i) => `Q${i + 1}`);
    }
    const n = quarters.length;

    const indicators = {};
    for (const [key, meta] of indicatorMeta.entries()) {
        const baseline = padSeries(meta.baseline, n, meta.baseline[meta.baseline.length - 1] ?? 0);
        const stacked = Array(n).fill(0);
        for (const row of scored) {
            const ind = row.tracks.macro.trend?.indicators?.[key];
            if (!ind) continue;
            let deltas = ind.deltas;
            if (!Array.isArray(deltas) || !deltas.length) {
                if (Array.isArray(ind.post_action) && Array.isArray(ind.baseline)) {
                    const base = padSeries(ind.baseline, n);
                    const post = padSeries(ind.post_action, n);
                    deltas = base.map((b, i) => (post[i] ?? 0) - b);
                } else {
                    continue;
                }
            }
            const series = padSeries(deltas, n, 0);
            for (let i = 0; i < n; i += 1) stacked[i] += series[i];
        }
        const post_action = baseline.map((b, i) => Math.round((b + stacked[i]) * 100) / 100);
        const deltasRounded = stacked.map((v) => Math.round(v * 100) / 100);
        indicators[key] = {
            label: meta.label,
            favorable_direction: meta.favorable_direction,
            baseline,
            deltas: deltasRounded,
            post_action,
            verdict: rollupVerdict(baseline, post_action, meta.favorable_direction)
        };
    }

    if (!Object.keys(indicators).length) return null;

    return {
        quarters,
        years: quarters,
        stacked: true,
        stacking_policy: 'uncapped',
        action_count: scored.length,
        indicators
    };
}

/**
 * Shape adjudication rows into report entries with only finalized seat tracks.
 * @param {Object[]} rows
 * @param {Map<string, Object>} [actionsById]
 * @returns {Object[]}
 */
export function collectFinalizedPliReportRows(rows = [], actionsById = new Map()) {
    return (rows || [])
        .map((row) => {
            const seats = {
                macro: getSeatReview(row, SEATS.MACRO),
                diplomacy_information: getSeatReview(row, SEATS.DIPLOMACY_INFORMATION),
                national_interest_escalation: getSeatReview(row, SEATS.NATIONAL_INTEREST_ESCALATION)
            };
            const finalized = {
                macro: seatIsFinalized(seats.macro),
                diplomacy_information: seatIsFinalized(seats.diplomacy_information),
                national_interest_escalation: seatIsFinalized(seats.national_interest_escalation)
            };
            if (!finalized.macro && !finalized.diplomacy_information && !finalized.national_interest_escalation) {
                return null;
            }

            const meta = resolveActionMeta(row, actionsById);
            const tracks = resolveTracks(row);
            const included = {};
            if (finalized.macro && macroHasScoredVector(tracks.macro)) {
                included.macro = tracks.macro || null;
            }
            if (finalized.diplomacy_information) {
                included.diplomacy = tracks.diplomacy || null;
                included.information = tracks.information || null;
            }
            if (finalized.national_interest_escalation) {
                included.national_interest = tracks.national_interest || null;
                included.glasl = tracks.glasl || null;
            }

            return {
                adjudicationId: row.id,
                actionId: meta.actionId,
                title: meta.title,
                team: meta.team,
                move: meta.move,
                mechanism: meta.mechanism,
                instrumentOfPower: meta.instrumentOfPower,
                goal: meta.goal,
                codebookVersion: row.codebook_version || row.record?.codebook_version || '',
                seats,
                finalized: {
                    ...finalized,
                    // Treat NE-skipped / no-effect as not showing a Macro section in reports
                    macro: Boolean(finalized.macro && macroHasScoredVector(tracks.macro))
                },
                tracks: included
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            const moveDiff = (a.move ?? 999) - (b.move ?? 999);
            if (moveDiff !== 0) return moveDiff;
            return String(a.title).localeCompare(String(b.title));
        });
}

/**
 * @param {Object[]} reportRows
 * @returns {number[]}
 */
export function listReportMoves(reportRows = []) {
    const moves = new Set();
    for (const row of reportRows) {
        if (row.move != null) moves.add(row.move);
    }
    return [...moves].sort((a, b) => a - b);
}

/**
 * @param {Object[]} reportRows
 * @param {{ move?: number|null }} [filters]
 * @returns {{ actionId: string, title: string, move: number|null, team: string }[]}
 */
export function listReportActions(reportRows = [], { move = null } = {}) {
    return reportRows
        .filter((row) => move == null || move === '' || Number(row.move) === Number(move))
        .map((row) => ({
            actionId: row.actionId,
            title: row.title,
            move: row.move,
            team: row.team
        }));
}

/**
 * @param {Object[]} reportRows
 * @param {{ scope: string, move?: number|null, actionId?: string|null }} selection
 * @returns {Object[]}
 */
export function filterReportRowsForScope(reportRows = [], selection = {}) {
    const scope = selection.scope || PLI_REPORT_SCOPES.SIMULATION;
    if (scope === PLI_REPORT_SCOPES.ACTION) {
        if (!selection.actionId) return [];
        return reportRows.filter((row) => row.actionId === selection.actionId);
    }
    if (scope === PLI_REPORT_SCOPES.MOVE) {
        if (selection.move == null || selection.move === '') return [];
        return reportRows.filter((row) => Number(row.move) === Number(selection.move));
    }
    return [...reportRows];
}

function compactMacro(macro) {
    if (!macro) return null;
    const classification = macro.classification || {};
    const implementation = macro.implementation || {};
    const fit = macro.fit || {};
    const trend = macro.trend || {};
    const indicators = {};
    for (const [key, ind] of Object.entries(trend.indicators || {})) {
        indicators[key] = {
            label: ind.label || key,
            verdict: ind.verdict || null
        };
    }
    return {
        status: macro.status || null,
        lever: classification.lever || null,
        instrument: classification.instrument || null,
        direction: classification.direction || null,
        implementationScore: implementation.score ?? null,
        fitScore: fit.score ?? null,
        fitBand: fit.band || null,
        orientation: fit.orientation || null,
        noEffect: Boolean(trend.no_effect || macro.status === 'skipped_ne'),
        indicators
    };
}

function buildDiplomacyNarrativeSummary(diplomacy, meta = {}) {
    if (!diplomacy) return '';
    if (diplomacy.status === 'needs_human' && !diplomacy.band && !diplomacy.code_string && !diplomacy.code) {
        const reason = diplomacy.needs_human_reason || 'Needs human indexing.';
        return `White Cell talking points — ${meta.actionId || 'this action'}: Diplomacy lane is awaiting SME indexing (${reason}).`;
    }
    const aid = meta.actionId || 'this action';
    const title = meta.title || meta.goal || aid;
    const team = meta.team || 'n/a';
    const band = diplomacy.band || 'n/a';
    const category = diplomacy.category || diplomacy.fields?.paradigm || 'n/a';
    const style = diplomacy.policy_style || diplomacy.policyStyle || 'n/a';
    const code = diplomacy.code_string || diplomacy.code || 'n/a';
    const rationale = String(diplomacy.rationale || '').trim();
    const rationaleBit = rationale
        ? ` SME rationale: ${rationale}`
        : ' SME rationale was not recorded on the worksheet.';
    return (
        `White Cell talking points — ${aid}: ${title} (${team}). `
        + `Indexed in the ${band} band under ${category} with a ${style} policy style `
        + `(code \`${code}\`).${rationaleBit} `
        + 'Brief players that the Diplomacy Index is a categorical code path — band and '
        + 'style shifts are the story — not a numeric effectiveness score. Use the band '
        + 'to situate how hard or soft this filing sits relative to Pressure vs '
        + 'Relationship-Building neighbors in the move.'
    );
}

function compactDiplomacy(diplomacy, meta = {}) {
    if (!diplomacy) return null;
    return {
        status: diplomacy.status || null,
        code: diplomacy.code_string || diplomacy.code || null,
        band: diplomacy.band || null,
        category: diplomacy.category || diplomacy.fields?.paradigm || null,
        policyStyle: diplomacy.policy_style || null,
        rationale: diplomacy.rationale || null,
        narrativeSummary: buildDiplomacyNarrativeSummary(diplomacy, meta) || null
    };
}

function compactInformation(information) {
    if (!information) return null;
    const brief = information.brief || information;
    const sections = information.sections || {};
    return {
        status: information.status || null,
        summary: sections.summary || brief.message_thesis || brief.thesis || brief.summary || null,
        audiences: sections.audiences || formatList(brief.target_audience || brief.theater) || null,
        narratives: sections.narratives || brief.intended_effect || null,
        secondOrderEffects: sections.second_order_effects || brief.risk_of_blowback || brief.blowback || null,
        operationType: brief.operation_type || brief.information_operation_type || null,
        attribution: brief.attribution_posture || brief.attribution || null
    };
}

function compactNi(ni) {
    if (!ni) return null;
    const domains = {};
    for (const [domain, entry] of Object.entries(ni.domain_deltas || {})) {
        domains[domain] = {
            label: entry.label || domain,
            delta: entry.delta ?? null,
            rationale: entry.rationale || null
        };
    }
    return {
        status: ni.status || null,
        orientation: ni.orientation || null,
        domains
    };
}

function compactGlasl(glasl) {
    if (!glasl) return null;
    return {
        status: glasl.status || null,
        stageBefore: glasl.stage_before ?? null,
        stageBeforeLabel: glasl.stage_before_label || null,
        delta: glasl.delta ?? null,
        stageAfter: glasl.stage_after ?? null,
        stageAfterLabel: glasl.stage_after_label || null,
        rationale: glasl.rationale || null
    };
}

/**
 * Compact fact pack for the narrative Edge Function.
 * @param {{ scope: string, move?: number|null, actionId?: string|null }} selection
 * @param {Object[]} scopedRows
 * @param {{ sessionId?: string, sessionName?: string, sessionCode?: string }} [sessionMeta]
 */
export function buildPliReportFactPack(selection, scopedRows = [], sessionMeta = {}) {
    const actions = scopedRows.map((row) => ({
        actionId: row.actionId,
        title: row.title,
        team: row.team,
        move: row.move,
        instrumentOfPower: row.instrumentOfPower,
        mechanism: row.mechanism,
        goal: row.goal,
        macro: row.finalized.macro ? compactMacro(row.tracks.macro) : undefined,
        diplomacy: row.finalized.diplomacy_information
            ? compactDiplomacy(row.tracks.diplomacy, {
                actionId: row.actionId,
                title: row.title,
                goal: row.goal,
                team: row.team
            })
            : undefined,
        information: row.finalized.diplomacy_information ? compactInformation(row.tracks.information) : undefined,
        nationalInterest: row.finalized.national_interest_escalation
            ? compactNi(row.tracks.national_interest)
            : undefined,
        escalation: row.finalized.national_interest_escalation ? compactGlasl(row.tracks.glasl) : undefined
    }));

    const pack = {
        sessionId: sessionMeta.sessionId || null,
        sessionName: sessionMeta.sessionName || null,
        sessionCode: sessionMeta.sessionCode || null,
        scope: selection.scope,
        move: selection.move ?? null,
        actionId: selection.actionId || null,
        actionCount: actions.length,
        actions
    };

    let serialized = JSON.stringify(pack);
    if (serialized.length > MAX_FACT_PACK_CHARS) {
        // Drop per-domain rationales / long text fields first.
        pack.actions = pack.actions.map((action) => ({
            ...action,
            goal: action.goal ? String(action.goal).slice(0, 120) : action.goal,
            diplomacy: action.diplomacy
                ? {
                    ...action.diplomacy,
                    rationale: action.diplomacy.rationale
                        ? String(action.diplomacy.rationale).slice(0, 160)
                        : null,
                    narrativeSummary: action.diplomacy.narrativeSummary
                        ? String(action.diplomacy.narrativeSummary).slice(0, 400)
                        : null
                }
                : action.diplomacy,
            information: action.information
                ? {
                    status: action.information.status,
                    summary: action.information.summary
                        ? String(action.information.summary).slice(0, 200)
                        : null,
                    operationType: action.information.operationType
                }
                : action.information,
            nationalInterest: action.nationalInterest
                ? {
                    orientation: action.nationalInterest.orientation,
                    domains: Object.fromEntries(
                        Object.entries(action.nationalInterest.domains || {}).map(([k, v]) => [
                            k,
                            { label: v.label, delta: v.delta }
                        ])
                    )
                }
                : action.nationalInterest,
            escalation: action.escalation
                ? {
                    stageBefore: action.escalation.stageBefore,
                    delta: action.escalation.delta,
                    stageAfter: action.escalation.stageAfter
                }
                : action.escalation
        }));
        serialized = JSON.stringify(pack);
    }

    if (serialized.length > MAX_FACT_PACK_CHARS) {
        throw new Error('PLI report fact pack is too large for narrative generation.');
    }

    return pack;
}

function renderCumulativeMacroChartsHtml(trend) {
    if (!trend?.indicators || !Object.keys(trend.indicators).length) return '';
    const periods = trend.quarters || trend.years || [];
    const cards = Object.entries(trend.indicators).map(([key, ind]) => `
        <div class="pli-report-chart-card" data-indicator="${escapeHtml(String(key))}">
            ${indicatorChartSvgHtml(periods, ind, { width: 320, height: 180 })}
        </div>
    `).join('');
    const countNote = trend.action_count
        ? ` Stacked uncapped across ${trend.action_count} finalized Economic action${trend.action_count === 1 ? '' : 's'} in this report scope.`
        : '';
    return `
        <section class="pli-report-cumulative-macro">
            <h2>Cumulative macroeconomic trends</h2>
            <p class="pli-report-note">One chart per indicator (baseline vs cumulative post-action).${countNote} Per-action Macro sections below list lever / fit / verdicts only.</p>
            <div class="pli-report-chart-grid">
                ${cards}
            </div>
        </section>
    `;
}

function renderMacroHtml(macro) {
    if (!macro) {
        return '<p class="pli-report-empty">No macroeconomic vector on this finalized seat.</p>';
    }
    if (!macroHasScoredVector(macro)) {
        return '';
    }
    const classification = macro.classification || {};
    const implementation = macro.implementation || {};
    const fit = macro.fit || {};
    const trend = macro.trend || {};
    const indicatorRows = Object.entries(trend.indicators || {}).map(([key, ind]) => `
        <tr>
            <td>${escapeHtml(String(ind.label || key))}</td>
            <td>${escapeHtml(String(ind.verdict || 'n/a'))}</td>
        </tr>
    `).join('');

    return `
        <dl class="pli-report-dl">
            <div><dt>Lever / instrument</dt><dd>${escapeHtml(String(classification.lever || '—'))} / ${escapeHtml(String(classification.instrument || '—'))} (${escapeHtml(String(classification.direction || '—'))})</dd></div>
            <div><dt>Implementation</dt><dd>${escapeHtml(String(implementation.score ?? '—'))}/10</dd></div>
            <div><dt>Fit</dt><dd>${escapeHtml(String(fit.score ?? '—'))}/10${fit.band ? ` · ${escapeHtml(String(fit.band))}` : ''}${fit.orientation ? ` · ${escapeHtml(String(fit.orientation))}` : ''}</dd></div>
            ${classification.rule_citation ? `<div><dt>Rule</dt><dd>${escapeHtml(String(classification.rule_citation))}</dd></div>` : ''}
        </dl>
        ${indicatorRows ? `
            <table class="pli-report-table">
                <thead><tr><th>Indicator</th><th>Verdict</th></tr></thead>
                <tbody>${indicatorRows}</tbody>
            </table>
        ` : '<p class="pli-report-empty">No indicator verdicts recorded.</p>'}
    `;
}

function renderDiplomacyHtml(diplomacy, meta = {}) {
    if (!diplomacy) {
        return '<p class="pli-report-empty">No diplomacy index on this finalized seat.</p>';
    }
    if (diplomacy.status === 'needs_human' && !diplomacy.band && !diplomacy.code_string && !diplomacy.code) {
        return `<p>${escapeHtml(diplomacy.needs_human_reason || 'Needs human indexing.')}</p>`;
    }
    const code = diplomacy.code_string || diplomacy.code || '—';
    const summary = diplomacy.narrativeSummary || buildDiplomacyNarrativeSummary(diplomacy, meta);
    return `
        <dl class="pli-report-dl">
            <div><dt>Code</dt><dd><code class="pli-report-code">${escapeHtml(String(code))}</code></dd></div>
            <div><dt>Band / category</dt><dd>${escapeHtml(String(diplomacy.band || '—'))} · ${escapeHtml(String(diplomacy.category || diplomacy.fields?.paradigm || '—'))}</dd></div>
            <div><dt>Policy style</dt><dd>${escapeHtml(String(diplomacy.policy_style || diplomacy.policyStyle || '—'))}</dd></div>
            ${diplomacy.rationale ? `<div><dt>Rationale</dt><dd>${escapeHtml(String(diplomacy.rationale))}</dd></div>` : ''}
        </dl>
        <p class="pli-report-note">Diplomacy index code (not a numeric score).</p>
        ${summary ? `
            <h4 class="pli-report-subhead">Narrative summary</h4>
            <p class="pli-report-narrative-inline">${escapeHtml(summary)}</p>
        ` : ''}
    `;
}

function renderInformationHtml(information) {
    if (!information) {
        return '<p class="pli-report-empty">No information brief on this finalized seat.</p>';
    }
    if (information.status === 'needs_human' && !information.brief && !information.sections) {
        return `<p>${escapeHtml(information.needs_human_reason || 'Needs human brief.')}</p>`;
    }
    const brief = information.brief || information;
    const sections = information.sections || {};
    const blocks = [
        ['Summary', sections.summary || brief.message_thesis || brief.thesis || brief.summary],
        ['Audiences', sections.audiences || formatList(brief.target_audience || brief.theater)],
        ['Narratives / intended effect', sections.narratives || brief.intended_effect],
        ['Second-order effects', sections.second_order_effects || brief.risk_of_blowback || brief.blowback],
        ['Operation type', brief.operation_type || brief.information_operation_type],
        ['Attribution', brief.attribution_posture || brief.attribution]
    ].filter(([, value]) => value);

    if (!blocks.length) {
        return '<p class="pli-report-empty">Information brief present but empty.</p>';
    }

    return `
        <dl class="pli-report-dl">
            ${blocks.map(([label, value]) => `
                <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>
            `).join('')}
        </dl>
        <p class="pli-report-note">Unscored SME information brief.</p>
    `;
}

function renderNiHtml(ni) {
    if (!ni) {
        return '<p class="pli-report-empty">No National Interest output on this finalized seat.</p>';
    }
    if (ni.status === 'needs_human' && !ni.domain_deltas) {
        return `<p>${escapeHtml(ni.needs_human_reason || 'Needs human adjudication.')}</p>`;
    }
    const domainRows = Object.entries(ni.domain_deltas || {}).map(([domain, entry]) => `
        <tr>
            <td>${escapeHtml(String(entry.label || domain))}</td>
            <td>${escapeHtml(formatSigned(entry.delta))}</td>
            <td>${escapeHtml(String(entry.rationale || ''))}</td>
        </tr>
    `).join('');

    return `
        <p><strong>Orientation:</strong> ${escapeHtml(String(ni.orientation || '—'))}</p>
        ${domainRows ? `
            <table class="pli-report-table">
                <thead><tr><th>Domain</th><th>Delta</th><th>Rationale</th></tr></thead>
                <tbody>${domainRows}</tbody>
            </table>
        ` : '<p class="pli-report-empty">No domain deltas recorded.</p>'}
    `;
}

function renderGlaslHtml(glasl) {
    if (!glasl) {
        return '<p class="pli-report-empty">No escalation (Glasl) output on this finalized seat.</p>';
    }
    if (glasl.status === 'needs_human' && glasl.delta == null) {
        return `<p>${escapeHtml(glasl.needs_human_reason || 'Needs human adjudication.')}</p>`;
    }
    return `
        <dl class="pli-report-dl">
            <div><dt>Stage before</dt><dd>${escapeHtml(String(glasl.stage_before ?? '—'))}${glasl.stage_before_label ? ` (${escapeHtml(String(glasl.stage_before_label))})` : ''}</dd></div>
            <div><dt>Delta</dt><dd>${escapeHtml(formatSigned(glasl.delta))}</dd></div>
            <div><dt>Stage after</dt><dd>${escapeHtml(String(glasl.stage_after ?? '—'))}${glasl.stage_after_label ? ` (${escapeHtml(String(glasl.stage_after_label))})` : ''}</dd></div>
            ${glasl.rationale ? `<div><dt>Rationale</dt><dd>${escapeHtml(String(glasl.rationale))}</dd></div>` : ''}
        </dl>
    `;
}

function renderActionSectionsHtml(row) {
    const sections = [];
    if (row.finalized.macro && macroHasScoredVector(row.tracks.macro)) {
        const macroHtml = renderMacroHtml(row.tracks.macro);
        if (macroHtml) {
            sections.push(`
            <section class="pli-report-section">
                <h3>Macroeconomic indicators</h3>
                ${macroHtml}
            </section>
        `);
        }
    }
    if (row.finalized.diplomacy_information) {
        sections.push(`
            <section class="pli-report-section">
                <h3>Diplomacy</h3>
                ${renderDiplomacyHtml(row.tracks.diplomacy, {
                    actionId: row.actionId,
                    title: row.title,
                    goal: row.goal,
                    team: row.team
                })}
            </section>
            <section class="pli-report-section">
                <h3>Information</h3>
                ${renderInformationHtml(row.tracks.information)}
            </section>
        `);
    }
    if (row.finalized.national_interest_escalation) {
        sections.push(`
            <section class="pli-report-section">
                <h3>${escapeHtml(nationalInterestSectionTitle(row.team))}</h3>
                ${renderNiHtml(row.tracks.national_interest)}
            </section>
            <section class="pli-report-section">
                <h3>Escalation (Glasl)</h3>
                ${renderGlaslHtml(row.tracks.glasl)}
            </section>
        `);
    }
    return sections.join('');
}

function scopeTitle(selection, scopedRows, sessionMeta) {
    if (selection.scope === PLI_REPORT_SCOPES.ACTION) {
        const row = scopedRows[0];
        return `PLI After-Action Report — ${row?.title || selection.actionId || 'Action'}`;
    }
    if (selection.scope === PLI_REPORT_SCOPES.MOVE) {
        return `PLI After-Action Report — Move ${selection.move}`;
    }
    return `PLI After-Action Report — ${sessionMeta.sessionName || 'Simulation'}`;
}

/**
 * Build printable HTML for the PLI report.
 */
export function buildPliReportHtml({
    selection,
    rows = [],
    narrative = '',
    sessionMeta = {}
} = {}) {
    const title = scopeTitle(selection, rows, sessionMeta);
    const generatedAt = new Date().toISOString();
    const grouped = new Map();
    for (const row of rows) {
        const key = row.move == null ? '—' : String(row.move);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }

    const isRollupScope = selection.scope === PLI_REPORT_SCOPES.MOVE
        || selection.scope === PLI_REPORT_SCOPES.SIMULATION;
    const cumulativeTrend = isRollupScope ? buildCumulativeMacroTrend(rows) : null;
    const cumulativeBlock = cumulativeTrend
        ? renderCumulativeMacroChartsHtml(cumulativeTrend)
        : '';

    const bodyParts = [];
    for (const [moveKey, moveRows] of grouped) {
        if (selection.scope !== PLI_REPORT_SCOPES.ACTION) {
            bodyParts.push(`<h2 class="pli-report-move">Move ${escapeHtml(moveKey)}</h2>`);
        }
        for (const row of moveRows) {
            bodyParts.push(`
                <article class="pli-report-action">
                    <header class="pli-report-action-header">
                        <h2>${escapeHtml(row.title)}</h2>
                        <p>
                            Team <strong>${escapeHtml(String(row.team))}</strong>
                            · Move <strong>${escapeHtml(String(row.move ?? '—'))}</strong>
                            · ${escapeHtml(String(row.instrumentOfPower || '—'))}
                            ${row.mechanism ? ` · ${escapeHtml(String(row.mechanism))}` : ''}
                        </p>
                        ${row.goal ? `<p class="pli-report-goal">${escapeHtml(String(row.goal))}</p>` : ''}
                    </header>
                    ${renderActionSectionsHtml(row)}
                </article>
            `);
        }
    }

    const narrativeHtml = escapeHtml(narrative)
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/\n/g, '<br>');
    const narrativeBlock = narrative
        ? `<section class="pli-report-narrative">
                <h2>Narrative summary</h2>
                <p class="pli-report-narrative-note">Auto-generated after-action narrative from finalized PLI outputs. Grounded in the structured facts above.</p>
                <div class="pli-report-narrative-body"><p>${narrativeHtml}</p></div>
            </section>`
        : `<section class="pli-report-narrative">
                <h2>Narrative summary</h2>
                <p class="pli-report-empty">Narrative unavailable for this report.</p>
            </section>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 0.75in; }
  body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: #1a1f2e;
    line-height: 1.45;
    font-size: 11pt;
    margin: 0;
    padding: 24px;
  }
  h1 { font-size: 20pt; color: #115740; margin: 0 0 8px; }
  h2 { font-size: 14pt; color: #1f3b6e; margin: 28px 0 10px; }
  h3 { font-size: 12pt; color: #115740; margin: 18px 0 8px; }
  .pli-report-meta { color: #5a5f6e; font-size: 10pt; margin-bottom: 20px; }
  .pli-report-action {
    border-top: 1px solid #d7dce5;
    padding-top: 12px;
    margin-top: 18px;
    break-inside: avoid;
  }
  .pli-report-action-header p { margin: 4px 0; color: #3a4154; }
  .pli-report-goal { font-style: italic; }
  .pli-report-section { margin-bottom: 12px; }
  .pli-report-dl { display: grid; gap: 6px; margin: 0; }
  .pli-report-dl > div { display: grid; grid-template-columns: 160px 1fr; gap: 8px; }
  .pli-report-dl dt { font-weight: 600; color: #5a5f6e; }
  .pli-report-dl dd { margin: 0; overflow-wrap: anywhere; word-break: break-word; }
  .pli-report-code {
    display: inline-block;
    max-width: 100%;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    font-size: 0.92em;
  }
  .pli-report-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10pt; }
  .pli-report-table th, .pli-report-table td { border: 1px solid #d7dce5; padding: 6px 8px; text-align: left; vertical-align: top; }
  .pli-report-table th { background: #f3f5f8; }
  .pli-report-note, .pli-report-empty { color: #5a5f6e; font-size: 10pt; }
  .pli-report-subhead { margin: 14px 0 6px; font-size: 11pt; color: #1f3b6e; }
  .pli-report-narrative-inline { margin: 0 0 8px; font-size: 10pt; line-height: 1.45; }
  .pli-report-cumulative-macro {
    margin: 8px 0 24px;
    padding-bottom: 12px;
    border-bottom: 2px solid #115740;
  }
  .pli-report-chart-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
    margin-top: 12px;
  }
  .pli-report-chart-card {
    border: 1px solid #d7dce5;
    border-radius: 4px;
    padding: 8px;
    background: #fff;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .pli-report-narrative {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 2px solid #115740;
    break-before: page;
  }
  .pli-report-narrative-note { color: #5a5f6e; font-size: 9.5pt; }
  .pli-report-narrative-body { margin-top: 10px; }
  .pli-report-narrative-body p { margin: 0 0 10px; }
  code { font-family: Consolas, "Courier New", monospace; background: #f3f5f8; padding: 1px 4px; }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p class="pli-report-meta">
      Session: ${escapeHtml(sessionMeta.sessionName || sessionMeta.sessionId || '—')}
      ${sessionMeta.sessionCode ? ` · Code ${escapeHtml(String(sessionMeta.sessionCode))}` : ''}
      · Scope: ${escapeHtml(selection.scope)}
      · Finalized actions: ${rows.length}
      · Generated: ${escapeHtml(generatedAt)}
    </p>
    <p class="pli-report-note">SME-finalized PLI outputs only (approved or overridden seats).</p>
  </header>
  ${cumulativeBlock}
  ${rows.length ? bodyParts.join('') : '<p class="pli-report-empty">No SME-finalized PLI outputs in this selection.</p>'}
  ${narrativeBlock}
</body>
</html>`;
}

export function canGeneratePliReport(selection, reportRows = []) {
    const scoped = filterReportRowsForScope(reportRows, selection);
    if (!scoped.length) return false;
    if (selection.scope === PLI_REPORT_SCOPES.ACTION) {
        return Boolean(selection.actionId);
    }
    if (selection.scope === PLI_REPORT_SCOPES.MOVE) {
        return selection.move != null && selection.move !== '';
    }
    return selection.scope === PLI_REPORT_SCOPES.SIMULATION;
}
