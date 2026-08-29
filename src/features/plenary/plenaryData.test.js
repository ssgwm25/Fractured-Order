import { describe, expect, it } from 'vitest';

import { collectFinalizedPliReportRows } from '../pli/pliReportBuilders.js';
import {
    DEFAULT_GLASL_STAGE,
    FO_DISPLAY_END,
    FO_DISPLAY_START,
    PLI_REPORT_SCOPES,
    buildPlenaryModel,
    buildTickerItems,
    collectPlenaryReportRows,
    rollupDiplomacyBands,
    rollupGlasl,
    rollupNationalInterest,
    rollupTeamActivity,
    sliceTrendToDisplayWindow
} from './plenaryData.js';

function makeRow({
    id = 'adj-1',
    actionId = 'action-1',
    move = 1,
    team = 'blue',
    goal = 'Stabilize markets',
    createdAt = '2026-08-01T00:00:00.000Z',
    seatReviews = {},
    tracks = {}
} = {}) {
    return {
        id,
        action_id: actionId,
        codebook_version: '1.0',
        created_at: createdAt,
        seat_reviews: seatReviews,
        record: {
            action_id: actionId,
            action: { goal, team, move, instrument_of_power: 'Economic' },
            move,
            tracks
        }
    };
}

function niTracks({
    net = 2,
    domains = { 'NI-1': { delta: 1 }, 'NI-2': { delta: 1 } },
    stageAfter = 5,
    stageBefore = 4,
    delta = 1,
    band = 'Pressure'
} = {}) {
    return {
        national_interest: {
            orientation: 'pressure',
            orientation_net: net,
            orientation_assessment: { primary_domains: ['NI-1'] },
            domain_deltas: domains
        },
        glasl: {
            stage_before: stageBefore,
            delta,
            stage_after: stageAfter,
            stage_after_label: 'Loss of face'
        },
        diplomacy: {
            band,
            code_string: 'D-2'
        }
    };
}

const niSeat = {
    national_interest_escalation: { status: 'approved' },
    diplomacy_information: { status: 'approved' }
};

describe('plenaryData', () => {
    it('slices labeled quarterly trends to the FO display window', () => {
        const quarters = [];
        for (let year = 2026; year <= 2034; year += 1) {
            for (let q = 1; q <= 4; q += 1) quarters.push(`${year}Q${q}`);
        }
        const baseline = quarters.map((_, i) => i);
        const sliced = sliceTrendToDisplayWindow({
            quarters,
            indicators: {
                real_gdp_growth: {
                    label: 'GDP',
                    baseline,
                    post_action: baseline.map((v) => v + 1),
                    deltas: baseline.map(() => 1)
                }
            }
        });
        expect(sliced.quarters[0]).toBe(FO_DISPLAY_START);
        expect(sliced.quarters[sliced.quarters.length - 1]).toBe(FO_DISPLAY_END);
        expect(sliced.indicators.real_gdp_growth.baseline).toHaveLength(sliced.quarters.length);
        expect(sliced.indicators.real_gdp_growth.baseline[0]).toBe(quarters.indexOf(FO_DISPLAY_START));
    });

    it('leaves unlabeled fixture series unchanged', () => {
        const trend = {
            quarters: ['Q1', 'Q2'],
            indicators: { gdp: { baseline: [1, 2], post_action: [1, 3] } }
        };
        expect(sliceTrendToDisplayWindow(trend)).toBe(trend);
    });

    it('attaches createdAt and rolls NI, Glasl, teams, bands, and ticker', () => {
        const adjudications = [
            makeRow({
                id: 'adj-1',
                actionId: 'a1',
                team: 'blue',
                move: 1,
                createdAt: '2026-08-01T00:00:00.000Z',
                seatReviews: niSeat,
                tracks: niTracks({ net: 1, stageAfter: 5, band: 'Pressure' })
            }),
            makeRow({
                id: 'adj-2',
                actionId: 'a2',
                team: 'red',
                move: 2,
                goal: 'Counter-move',
                createdAt: '2026-08-02T00:00:00.000Z',
                seatReviews: niSeat,
                tracks: niTracks({
                    net: -2,
                    domains: { 'NI-1': { delta: -1 }, 'NI-3': { delta: -1 } },
                    stageAfter: 6,
                    stageBefore: 5,
                    delta: 1,
                    band: 'Pressure'
                })
            }),
            makeRow({
                id: 'adj-3',
                actionId: 'a3',
                team: 'green',
                move: 2,
                goal: 'Pending',
                seatReviews: { national_interest_escalation: { status: 'pending' } },
                tracks: niTracks({ stageAfter: 9 })
            })
        ];

        const rows = collectPlenaryReportRows(adjudications);
        expect(rows).toHaveLength(2);
        expect(rows[0].createdAt).toBe('2026-08-01T00:00:00.000Z');

        const ni = rollupNationalInterest(rows);
        expect(ni.title).toBe('National Interest (impact on Blue)');
        expect(ni.domains.find((d) => d.key === 'NI-1').delta).toBe(0);
        expect(ni.domains.find((d) => d.key === 'NI-1').primary).toBe(true);
        expect(ni.orientationByMove).toEqual([
            { move: 1, net: 1 },
            { move: 2, net: -2 }
        ]);

        const glasl = rollupGlasl(rows);
        expect(glasl.startStage).toBe(DEFAULT_GLASL_STAGE);
        expect(glasl.currentStage).toBe(6);
        expect(glasl.points.map((p) => p.stageAfter)).toEqual([5, 6]);

        const teams = rollupTeamActivity(rows);
        expect(teams.find((t) => t.id === 'blue').count).toBe(1);
        expect(teams.find((t) => t.id === 'red').count).toBe(1);
        expect(teams.find((t) => t.id === 'industry').count).toBe(0);

        expect(rollupDiplomacyBands(rows)).toEqual([{ band: 'Pressure', count: 2 }]);

        const ticker = buildTickerItems(rows);
        expect(ticker[0].actionId).toBe('a2');
        expect(ticker[0].glaslDelta).toBe(1);
    });

    it('plots one orientation sparkline point per finalized NI action', () => {
        const rows = collectPlenaryReportRows([
            makeRow({
                id: 'adj-m2-a',
                actionId: 'a-m2-a',
                team: 'red',
                move: 2,
                createdAt: '2026-08-02T00:00:00.000Z',
                seatReviews: niSeat,
                tracks: niTracks({ net: 1, domains: { 'NI-2': { delta: 1 } } })
            }),
            makeRow({
                id: 'adj-m2-b',
                actionId: 'a-m2-b',
                team: 'green',
                move: 2,
                createdAt: '2026-08-03T00:00:00.000Z',
                seatReviews: niSeat,
                tracks: niTracks({
                    net: -2,
                    domains: { 'NI-3': { delta: -1 }, 'NI-4': { delta: -1 } }
                })
            })
        ]);
        expect(rollupNationalInterest(rows).orientationByMove).toEqual([
            { move: 2, net: 1 },
            { move: 2, net: -2 }
        ]);
    });

    it('defaults Glasl to stage 4 when no finalized escalation exists', () => {
        const glasl = rollupGlasl(collectFinalizedPliReportRows([
            makeRow({
                seatReviews: { macro: { status: 'approved' } },
                tracks: { macro: { trend: { no_effect: true } } }
            })
        ]));
        expect(glasl.currentStage).toBe(4);
        expect(glasl.hasData).toBe(false);
    });

    it('filters the plenary model by move scope', () => {
        const rows = collectPlenaryReportRows([
            makeRow({
                id: 'adj-1',
                actionId: 'a1',
                move: 1,
                seatReviews: niSeat,
                tracks: niTracks({ stageAfter: 5 })
            }),
            makeRow({
                id: 'adj-2',
                actionId: 'a2',
                move: 2,
                goal: 'Move two',
                createdAt: '2026-08-03T00:00:00.000Z',
                seatReviews: niSeat,
                tracks: niTracks({ stageAfter: 7, stageBefore: 5, delta: 2 })
            })
        ]);
        const model = buildPlenaryModel({
            reportRows: rows,
            selection: { scope: PLI_REPORT_SCOPES.MOVE, move: 2 }
        });
        expect(model.actionCount).toBe(1);
        expect(model.glasl.currentStage).toBe(7);
        expect(model.moves).toEqual([1, 2]);
    });
});
