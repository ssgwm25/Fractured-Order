import { describe, expect, it } from 'vitest';
import {
    VERBA_SIMULATION_EXPORT_VERSION,
    buildVerbaSimulationExport,
    verbaSimulationFilename
} from './verbaSimulationExport.js';

function action(overrides) {
    return {
        id: 'a1',
        move: 1,
        team: 'blue',
        artifact_type: 'action',
        goal: 'Expand export controls',
        expected_outcomes: 'Blue tightens licenses on advanced-node tools.',
        mechanism: 'Economic',
        sector: 'Semiconductors',
        phase: 1,
        status: 'adjudicated',
        outcome: 'SUCCESS',
        ...overrides
    };
}

function adjudication(actionId, macro) {
    return {
        action_id: actionId,
        status: 'approved',
        record: {
            tracks: {
                macro
            }
        },
        seat_reviews: {}
    };
}

describe('buildVerbaSimulationExport', () => {
    it('keeps every game move and nests each action under the move it belongs to', () => {
        const payload = buildVerbaSimulationExport({
            session: { id: 's1', session_code: 'ADMIN2026', name: 'Admin Session' },
            exportedAt: '2026-10-10T00:00:00.000Z',
            actions: [
                action({ id: 'blue-1', goal: 'Blue move 1' }),
                action({ id: 'red-1', team: 'red', goal: 'Red move 1', expected_outcomes: 'Red restricts inputs.' }),
                action({ id: 'blue-2', move: 2, goal: 'Blue move 2', expected_outcomes: 'Blue screens investment.' }),
                action({
                    id: 'orientation',
                    artifact_type: 'strategic_orientation_selection',
                    goal: 'Strategic Orientation: Reframe'
                })
            ],
            adjudications: []
        });

        expect(payload.version).toBe(VERBA_SIMULATION_EXPORT_VERSION);
        expect(payload.session.code).toBe('ADMIN2026');
        expect(payload.moves.map((move) => move.move)).toEqual([1, 2, 3]);
        expect(payload.moves[0].actions.map((entry) => entry.title)).toEqual(['Blue move 1', 'Red move 1']);
        expect(payload.moves[1].actions.map((entry) => entry.actionId)).toEqual(['blue-2']);
        expect(payload.moves[2].actionCount).toBe(0);
        expect(payload.rows.map((row) => row.move)).toEqual([1, 1, 2]);
        expect(payload.actionCount).toBe(3);
        expect(payload.rows[0].description).toBe('Blue tightens licenses on advanced-node tools.');
        expect(payload.rows[0].peaks).toBeNull();
        expect(payload.rows[0].macro).toBeUndefined();
        expect(payload.rows[0].fitBand).toBeNull();
        expect(payload.rows[0].submissionMonth).toBeNull();
        expect(payload.rows[0].artifactType).toBe('action');
        expect(payload.timeline).toEqual({ quarters: [], baseline: {} });
        expect(payload.indicatorGuide.real_gdp_growth.favorableMeans).toBe('Higher is favorable to the United States.');
        expect(payload.indicatorGuide.pce_inflation.favorableMeans).toBe('Lower is favorable to the United States.');
        expect(payload.flagGuide.onset_beyond_horizon).toMatch(/zero/);
        expect(verbaSimulationFilename(payload)).toBe('ADMIN2026-verba-simulation.json');
    });

    it('attaches the macro series of record, including an SME peak override', () => {
        const payload = buildVerbaSimulationExport({
            actions: [action({ id: 'blue-1' })],
            adjudications: [
                adjudication('blue-1', {
                    status: 'scored',
                    classification: { lever: 'L2', instrument: 'I2.01', direction: 'coercive' },
                    implementation: { score: 8 },
                    fit: { score: 7, band: '7-8' },
                    submission_month: '2027-01',
                    trend: {
                        quarters: ['2026Q1', '2026Q2'],
                        indicators: {
                            real_gdp_growth: {
                                label: 'Real GDP growth (%)',
                                verdict: 'unfavorable',
                                favorable_direction: 1,
                                baseline: [2.1, 2.0],
                                deltas: [0, -0.4],
                                post_action: [2.1, 1.6]
                            }
                        }
                    }
                })
            ]
        });
        const [exported] = payload.moves[0].actions;
        expect(exported.macro.lever).toBe('L2');
        expect(exported.macro.implementationScore).toBe(8);
        expect(exported.macro.quarters).toBeUndefined();
        expect(payload.timeline.quarters).toEqual(['2026Q1', '2026Q2']);
        expect(payload.timeline.baseline.real_gdp_growth).toEqual([2.1, 2]);
        expect(exported.macro.indicators[0]).toMatchObject({
            indicator: 'real_gdp_growth',
            verdict: 'unfavorable',
            peakDelta: -0.4,
            delta: [0, -0.4],
            postAction: [2.1, 1.6]
        });
        expect(exported.macro.indicators[0].baseline).toBeUndefined();
        expect(payload.rows[0].fitBand).toBe('7-8');
        expect(payload.rows[0].submissionMonth).toBe('2027-01');

        const overridden = buildVerbaSimulationExport({
            actions: [action({ id: 'blue-1' })],
            adjudications: [{
                action_id: 'blue-1',
                record: {
                    tracks: {
                        macro: {
                            status: 'scored',
                            trend: {
                                quarters: ['2026Q1'],
                                indicators: {
                                    real_gdp_growth: {
                                        label: 'Real GDP growth (%)',
                                        verdict: 'unfavorable',
                                        baseline: [2],
                                        deltas: [-0.2],
                                        post_action: [1.8]
                                    }
                                }
                            }
                        }
                    }
                },
                seat_reviews: {
                    macro: {
                        status: 'overridden',
                        override_value: {
                            trend: {
                                quarters: ['2026Q1'],
                                indicators: {
                                    real_gdp_growth: {
                                        label: 'Real GDP growth (%)',
                                        verdict: 'unfavorable',
                                        baseline: [2],
                                        deltas: [-0.8],
                                        post_action: [1.2]
                                    }
                                }
                            }
                        }
                    }
                }
            }]
        });
        expect(overridden.moves[0].actions[0].macro.indicators[0].peakDelta).toBe(-0.8);
        expect(overridden.moves[0].actions[0].macro.indicators[0].postAction).toEqual([1.2]);
        expect(overridden.rows[0].peaks.real_gdp_growth).toEqual({
            label: 'Real GDP growth (%)',
            peakDelta: -0.8,
            verdict: 'unfavorable'
        });
        expect(overridden.rows[0].quarters).toBeUndefined();
    });

    it('does not repeat the title as the description when the action has no narrative', () => {
        const payload = buildVerbaSimulationExport({
            actions: [action({
                id: 'blue-1',
                goal: 'CHIPS-style surge',
                expected_outcomes: ''
            })]
        });
        expect(payload.moves[0].actions[0].description).toBeNull();
        expect(payload.rows[0].description).toBeNull();
    });

    it('keeps a private window or baseline only on the action that differs', () => {
        const shared = {
            status: 'scored',
            classification: { lever: 'L7' },
            trend: {
                quarters: ['2026Q1', '2026Q2'],
                indicators: {
                    real_gdp_growth: {
                        label: 'Real GDP growth (%)',
                        verdict: 'favorable',
                        favorable_direction: 1,
                        baseline: [2.1, 2],
                        deltas: [0.1, 0.2],
                        post_action: [2.2, 2.2]
                    }
                }
            }
        };
        const payload = buildVerbaSimulationExport({
            actions: [
                action({ id: 'blue-1' }),
                action({ id: 'red-1', team: 'red', goal: 'Red path', expected_outcomes: 'Red restricts inputs.' })
            ],
            adjudications: [
                { ...adjudication('blue-1', shared), codebook_version: 'trial-2026-08-13-quarterly' },
                {
                    ...adjudication('red-1', {
                        ...shared,
                        flags: ['onset_beyond_horizon'],
                        trend: {
                            quarters: ['2032Q1'],
                            indicators: {
                                real_gdp_growth: {
                                    label: 'Real GDP growth (%)',
                                    verdict: 'neutral',
                                    favorable_direction: 1,
                                    baseline: [1.5],
                                    deltas: [0],
                                    post_action: [1.5]
                                }
                            }
                        }
                    }),
                    codebook_version: 'other-codebook'
                }
            ]
        });

        expect(payload.codebookVersion).toBeNull();
        expect(payload.timeline.quarters).toEqual([]);
        expect(payload.timeline.baseline.real_gdp_growth).toBeUndefined();
        expect(payload.moves[0].actions[0].macro.quarters).toEqual(['2026Q1', '2026Q2']);
        expect(payload.moves[0].actions[0].macro.indicators[0].baseline).toEqual([2.1, 2]);
        expect(payload.moves[0].actions[0].macro.codebookVersion).toBe('trial-2026-08-13-quarterly');
        expect(payload.moves[0].actions[1].macro.quarters).toEqual(['2032Q1']);
        expect(payload.moves[0].actions[1].macro.indicators[0].baseline).toEqual([1.5]);
        expect(payload.moves[0].actions[1].macro.flags).toEqual(['onset_beyond_horizon']);
        expect(payload.rows[1].flags).toEqual(['onset_beyond_horizon']);
    });
});
