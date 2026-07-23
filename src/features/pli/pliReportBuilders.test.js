import { describe, expect, it } from 'vitest';
import {
    PLI_REPORT_SCOPES,
    collectFinalizedPliReportRows,
    listReportMoves,
    listReportActions,
    filterReportRowsForScope,
    buildPliReportFactPack,
    buildPliReportHtml,
    buildCumulativeMacroTrend,
    canGeneratePliReport
} from './pliReportBuilders.js';

function makeRow({
    id = 'adj-1',
    actionId = 'action-1',
    move = 1,
    team = 'blue',
    goal = 'Stabilize markets',
    seatReviews = {},
    tracks = {}
} = {}) {
    return {
        id,
        action_id: actionId,
        codebook_version: '1.0',
        seat_reviews: seatReviews,
        record: {
            action_id: actionId,
            action: { goal, team, move, instrument_of_power: 'Economic' },
            move,
            tracks
        }
    };
}

function makeMacroWithSeries({
    gdpDeltas = [0.1, 0.2, 0.1, 0],
    pceDeltas = [0.05, 0.05, 0, 0],
    lever = 'sanctions'
} = {}) {
    const quarters = ['2026Q1', '2026Q2', '2026Q3', '2026Q4'];
    const gdpBase = [2.0, 2.1, 2.2, 2.3];
    const pceBase = [2.4, 2.3, 2.2, 2.1];
    return {
        classification: { lever, instrument: 'targeted', direction: 'restrictive' },
        implementation: { score: 7 },
        fit: { score: 6, band: 'aligned', orientation: 'competing' },
        trend: {
            quarters,
            years: quarters,
            indicators: {
                real_gdp_growth: {
                    label: 'GDP growth',
                    verdict: 'favorable',
                    favorable_direction: 1,
                    baseline: gdpBase,
                    deltas: gdpDeltas,
                    post_action: gdpBase.map((b, i) => b + gdpDeltas[i])
                },
                pce_inflation: {
                    label: 'PCE Inflation',
                    verdict: 'unfavorable',
                    favorable_direction: -1,
                    baseline: pceBase,
                    deltas: pceDeltas,
                    post_action: pceBase.map((b, i) => b + pceDeltas[i])
                }
            }
        }
    };
}

const fullTracks = {
    macro: {
        classification: { lever: 'sanctions', instrument: 'targeted', direction: 'restrictive' },
        implementation: { score: 7 },
        fit: { score: 6, band: 'aligned', orientation: 'competing' },
        trend: {
            indicators: {
                gdp: { label: 'GDP growth', verdict: 'down' }
            }
        }
    },
    diplomacy: {
        code_string: 'D-2-COERCE',
        band: 'assertive',
        category: 'coercive',
        policy_style: 'pressure',
        rationale: 'Signals resolve'
    },
    information: {
        brief: {
            message_thesis: 'Highlight enforcement credibility',
            target_audience: ['domestic', 'allies'],
            intended_effect: 'Deterrence',
            risk_of_blowback: 'Narrative backlash'
        }
    },
    national_interest: {
        orientation: 'competing',
        domain_deltas: {
            'NI-1': { label: 'Homeland', delta: 1, rationale: 'Protective effect' },
            'NI-2': { label: 'Alliances', delta: -1, rationale: 'Friction risk' }
        }
    },
    glasl: {
        stage_before: 2,
        stage_before_label: 'Debate',
        delta: 1,
        stage_after: 3,
        stage_after_label: 'Actions',
        rationale: 'Harder posture'
    }
};

describe('pliReportBuilders', () => {
    it('collects only rows with at least one SME-finalized seat', () => {
        const actionsById = new Map([
            ['action-1', { id: 'action-1', goal: 'Stabilize markets', team: 'blue', move: 1 }],
            ['action-2', { id: 'action-2', goal: 'Pending only', team: 'blue', move: 1 }]
        ]);
        const rows = [
            makeRow({
                actionId: 'action-1',
                seatReviews: {
                    macro: { status: 'approved' },
                    diplomacy_information: { status: 'pending' },
                    national_interest_escalation: { status: 'pending' }
                },
                tracks: { macro: fullTracks.macro }
            }),
            makeRow({
                id: 'adj-2',
                actionId: 'action-2',
                goal: 'Pending only',
                seatReviews: {
                    macro: { status: 'pending' },
                    diplomacy_information: { status: 'needs_human' },
                    national_interest_escalation: { status: 'pending' }
                },
                tracks: fullTracks
            })
        ];

        const collected = collectFinalizedPliReportRows(rows, actionsById);
        expect(collected).toHaveLength(1);
        expect(collected[0].actionId).toBe('action-1');
        expect(collected[0].finalized.macro).toBe(true);
        expect(collected[0].tracks.macro).toBeTruthy();
        expect(collected[0].tracks.diplomacy).toBeUndefined();
    });

    it('includes diplomacy/info and NI/escalation only when those seats are finalized', () => {
        const rows = [
            makeRow({
                seatReviews: {
                    macro: { status: 'skipped' },
                    diplomacy_information: { status: 'overridden' },
                    national_interest_escalation: { status: 'approved' }
                },
                tracks: fullTracks
            })
        ];
        const collected = collectFinalizedPliReportRows(rows);
        expect(collected).toHaveLength(1);
        expect(collected[0].finalized.macro).toBe(false);
        expect(collected[0].finalized.diplomacy_information).toBe(true);
        expect(collected[0].finalized.national_interest_escalation).toBe(true);
        expect(collected[0].tracks.diplomacy.code_string).toBe('D-2-COERCE');
        expect(collected[0].tracks.glasl.stage_after).toBe(3);
        expect(collected[0].tracks.macro).toBeUndefined();
    });

    it('lists moves/actions and filters by scope', () => {
        const reportRows = collectFinalizedPliReportRows([
            makeRow({
                actionId: 'a1',
                move: 1,
                goal: 'One',
                seatReviews: { macro: { status: 'approved' } },
                tracks: { macro: fullTracks.macro }
            }),
            makeRow({
                id: 'adj-2',
                actionId: 'a2',
                move: 2,
                goal: 'Two',
                seatReviews: { macro: { status: 'approved' } },
                tracks: { macro: fullTracks.macro }
            })
        ]);

        expect(listReportMoves(reportRows)).toEqual([1, 2]);
        expect(listReportActions(reportRows, { move: 2 })).toHaveLength(1);
        expect(filterReportRowsForScope(reportRows, {
            scope: PLI_REPORT_SCOPES.MOVE,
            move: 1
        })).toHaveLength(1);
        expect(filterReportRowsForScope(reportRows, {
            scope: PLI_REPORT_SCOPES.ACTION,
            actionId: 'a2'
        })[0].title).toBe('Two');
        expect(filterReportRowsForScope(reportRows, {
            scope: PLI_REPORT_SCOPES.SIMULATION
        })).toHaveLength(2);
    });

    it('builds a compact fact pack and printable HTML with all five section types', () => {
        const reportRows = collectFinalizedPliReportRows([
            makeRow({
                seatReviews: {
                    macro: { status: 'approved' },
                    diplomacy_information: { status: 'approved' },
                    national_interest_escalation: { status: 'approved' }
                },
                tracks: fullTracks
            })
        ]);
        const selection = { scope: PLI_REPORT_SCOPES.SIMULATION };
        const factPack = buildPliReportFactPack(selection, reportRows, {
            sessionId: 'sess-1',
            sessionName: 'Alpha',
            sessionCode: 'ALPHA2026'
        });

        expect(factPack.actionCount).toBe(1);
        expect(factPack.actions[0].macro.lever).toBe('sanctions');
        expect(factPack.actions[0].diplomacy.code).toBe('D-2-COERCE');
        expect(factPack.actions[0].diplomacy.narrativeSummary).toContain('White Cell talking points');
        expect(factPack.actions[0].diplomacy.narrativeSummary).toContain('assertive');
        expect(factPack.actions[0].information.summary).toContain('enforcement');
        expect(factPack.actions[0].nationalInterest.domains['NI-1'].delta).toBe(1);
        expect(factPack.actions[0].escalation.stageAfter).toBe(3);

        const html = buildPliReportHtml({
            selection,
            rows: reportRows,
            narrative: 'Facilitator summary paragraph.\n\nSecond paragraph.',
            sessionMeta: { sessionId: 'sess-1', sessionName: 'Alpha', sessionCode: 'ALPHA2026' }
        });

        expect(html).toContain('Macroeconomic indicators');
        expect(html).toContain('Diplomacy');
        expect(html).toContain('Information');
        expect(html).toContain('National Interest');
        expect(html).not.toContain('National Interest (impact on Blue)');
        expect(html).toContain('Escalation (Glasl)');
        expect(html).toContain('Narrative summary');
        expect(html).toContain('Facilitator summary paragraph.');
        expect(html).toContain('GDP growth');
        expect(html).toContain('D-2-COERCE');
        expect(html).toContain('Narrative summary');
        expect(html).toContain('White Cell talking points');
        expect(html).toContain('assertive');
        // Verdict-only macro fixtures have no series → no cumulative chart block
        expect(html).not.toContain('Cumulative macroeconomic trends');
    });

    it('stacks uncapped macro deltas for Move/Sim cumulative charts', () => {
        const reportRows = collectFinalizedPliReportRows([
            makeRow({
                actionId: 'a1',
                goal: 'First package',
                seatReviews: { macro: { status: 'approved' } },
                tracks: { macro: makeMacroWithSeries({ gdpDeltas: [0.1, 0.2, 0, 0], pceDeltas: [0.1, 0, 0, 0] }) }
            }),
            makeRow({
                id: 'adj-2',
                actionId: 'a2',
                goal: 'Second package',
                seatReviews: { macro: { status: 'approved' } },
                tracks: { macro: makeMacroWithSeries({ gdpDeltas: [0.3, 0.1, 0.1, 0], pceDeltas: [0.05, 0.05, 0, 0] }) }
            })
        ]);

        const stacked = buildCumulativeMacroTrend(reportRows);
        expect(stacked).toBeTruthy();
        expect(stacked.stacking_policy).toBe('uncapped');
        expect(stacked.action_count).toBe(2);
        expect(stacked.indicators.real_gdp_growth.deltas).toEqual([0.4, 0.3, 0.1, 0]);
        expect(stacked.indicators.pce_inflation.deltas).toEqual([0.15, 0.05, 0, 0]);
        expect(stacked.indicators.real_gdp_growth.post_action[0]).toBeCloseTo(2.4);
        expect(stacked.indicators.pce_inflation.label).toBe('PCE Inflation');

        const moveHtml = buildPliReportHtml({
            selection: { scope: PLI_REPORT_SCOPES.MOVE, move: 1 },
            rows: reportRows,
            narrative: 'Move rollup.',
            sessionMeta: { sessionName: 'Alpha' }
        });
        expect(moveHtml).toContain('Cumulative macroeconomic trends');
        expect(moveHtml).toContain('PCE Inflation');
        expect(moveHtml).toContain('GDP growth');
        expect(moveHtml).toContain('<svg');
        expect(moveHtml).toContain('data-indicator="pce_inflation"');
        expect(moveHtml).toContain('data-indicator="real_gdp_growth"');
        // One cumulative section, not a chart card per action
        expect(moveHtml.match(/<section class="pli-report-cumulative-macro">/g)).toHaveLength(1);
        expect(moveHtml.match(/data-indicator="pce_inflation"/g)).toHaveLength(1);

        const simHtml = buildPliReportHtml({
            selection: { scope: PLI_REPORT_SCOPES.SIMULATION },
            rows: reportRows,
            narrative: 'Sim rollup.',
            sessionMeta: { sessionName: 'Alpha' }
        });
        expect(simHtml).toContain('Cumulative macroeconomic trends');
        expect(simHtml.match(/data-indicator="pce_inflation"/g)).toHaveLength(1);

        const actionHtml = buildPliReportHtml({
            selection: { scope: PLI_REPORT_SCOPES.ACTION, actionId: 'a1' },
            rows: filterReportRowsForScope(reportRows, { scope: PLI_REPORT_SCOPES.ACTION, actionId: 'a1' }),
            narrative: 'Single action.',
            sessionMeta: { sessionName: 'Alpha' }
        });
        expect(actionHtml).not.toContain('Cumulative macroeconomic trends');
        expect(actionHtml).toContain('Macroeconomic indicators');
    });

    it('omits Macro section for green Dip/Info filings with skipped/no-effect macro', () => {
        const rows = [
            makeRow({
                team: 'green',
                goal: 'EU consultations plus messaging',
                seatReviews: {
                    macro: { status: 'skipped' },
                    diplomacy_information: { status: 'approved' },
                    national_interest_escalation: { status: 'approved' }
                },
                tracks: {
                    macro: { status: 'skipped_ne', trend: { no_effect: true, reason: 'non-economic' } },
                    diplomacy: fullTracks.diplomacy,
                    information: fullTracks.information,
                    national_interest: fullTracks.national_interest,
                    glasl: fullTracks.glasl
                }
            })
        ];
        const collected = collectFinalizedPliReportRows(rows);
        expect(collected[0].finalized.macro).toBe(false);
        expect(collected[0].tracks.macro).toBeUndefined();

        const html = buildPliReportHtml({
            selection: { scope: PLI_REPORT_SCOPES.ACTION, actionId: 'action-1' },
            rows: collected,
            narrative: 'Green dual-lane summary.',
            sessionMeta: { sessionName: 'Green sample' }
        });
        expect(html).not.toContain('Macroeconomic indicators');
        expect(html).not.toContain('No macroeconomic vector applied');
        expect(html).toContain('Diplomacy');
        expect(html).toContain('Information');
        expect(html).toContain('National Interest (impact on Blue)');
        expect(html).toContain('pli-report-code');
    });

    it('gates generate readiness on required dropdowns', () => {
        const reportRows = collectFinalizedPliReportRows([
            makeRow({
                seatReviews: { macro: { status: 'approved' } },
                tracks: { macro: fullTracks.macro }
            })
        ]);

        expect(canGeneratePliReport({ scope: PLI_REPORT_SCOPES.ACTION, actionId: '' }, reportRows)).toBe(false);
        expect(canGeneratePliReport({
            scope: PLI_REPORT_SCOPES.ACTION,
            actionId: 'action-1'
        }, reportRows)).toBe(true);
        expect(canGeneratePliReport({ scope: PLI_REPORT_SCOPES.MOVE, move: '' }, reportRows)).toBe(false);
        expect(canGeneratePliReport({ scope: PLI_REPORT_SCOPES.MOVE, move: 1 }, reportRows)).toBe(true);
        expect(canGeneratePliReport({ scope: PLI_REPORT_SCOPES.SIMULATION }, reportRows)).toBe(true);
        expect(canGeneratePliReport({ scope: PLI_REPORT_SCOPES.SIMULATION }, [])).toBe(false);
    });
});
