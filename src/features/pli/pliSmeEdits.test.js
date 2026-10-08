import { describe, expect, it } from 'vitest';
import { SEATS, SEAT_STATUS } from './pliShared.js';
import {
    emptyEditDiff,
    buildMacroEditDiff,
    collectMacroOverrideFromCard,
    validateMacroOverride,
    buildNiEditDiff,
    collectNiOverrideFromCard,
    collectDipOverrideFromCard,
    resolveOutputTracks,
    renderEditDiffHtml,
    summarizeSessionEfficacy,
    buildPliSmePacket,
    readInformationSection,
    PLI_PACKET_VERSION
} from './pliSmeEdits.js';
import { buildCumulativeMacroTrend } from './pliReportBuilders.js';

function fakeCard(values = {}, peaks = []) {
    return {
        querySelector: (selector) => {
            if (!Object.prototype.hasOwnProperty.call(values, selector)) return null;
            return { value: values[selector] };
        },
        querySelectorAll: (selector) => (selector === '[data-pli-macro-peak]' ? peaks : [])
    };
}

function peakInput(key, value) {
    return {
        disabled: false,
        value: String(value),
        getAttribute: (name) => (name === 'data-pli-macro-peak' ? key : null)
    };
}

function sampleRow() {
    return {
        id: 'adj-1',
        action_id: 'act-1',
        session_id: 'sess-1',
        record: {
            action: { goal: 'Export controls', team: 'blue', move: 1 },
            tracks: {
                macro: {
                    classification: { lever: 'L2', instrument: 'I2.01' },
                    implementation: { score: 6 },
                    trend: {
                        quarters: ['2026Q1', '2026Q2', '2026Q3'],
                        indicators: {
                            real_gdp_growth: {
                                label: 'Real GDP growth (%)',
                                favorable_direction: 1,
                                delta_value: 1,
                                weights: [0, 0.5, 1],
                                baseline: [2, 2, 2],
                                deltas: [0, 0.5, 1],
                                post_action: [2, 2.5, 3],
                                verdict: 'favorable'
                            }
                        }
                    }
                },
                national_interest: {
                    domain_deltas: {
                        'NI-1': { delta: 1 },
                        'NI-2': { delta: 0 }
                    }
                },
                glasl: { stage_before: 3, stage_after: 4, delta: 1 },
                diplomacy: {
                    band: 'B',
                    code: 'DIP-1',
                    category: 'Bilateral',
                    policy_style: 'Quiet',
                    fields: { effect_summary: 'Reassure allies' }
                },
                information: {
                    sections: {
                        summary: 'Engine summary text here.',
                        audiences: 'Allied publics.',
                        narratives: 'Frame as rule-keeping.',
                        second_order_effects: 'Limited blowback.',
                        sme_questions: 'Does the message hold in Seoul?',
                        suggested_sme_edits: 'Name the primary allied audience.'
                    }
                }
            }
        },
        seat_reviews: {}
    };
}

describe('pliSmeEdits', () => {
    it('records peak modulation diffs and keeps lever and score unchanged', () => {
        const row = sampleRow();
        const collected = collectMacroOverrideFromCard(fakeCard({
            '[data-pli-rationale]': 'Peak is too small'
        }, [peakInput('real_gdp_growth', 2)]), row);

        expect(collected.override_rationale).toBe('Peak is too small');
        expect(collected.override_value.lever).toBeUndefined();
        expect(collected.override_value.trend.indicators.real_gdp_growth.delta_value).toBe(2);
        expect(collected.override_value.trend.indicators.real_gdp_growth.post_action).toEqual([2, 3, 4]);
        expect(collected.override_value.trend.indicators.real_gdp_growth.deltas).toEqual([0, 1, 2]);
        expect(collected.edit_diff.fields).toEqual([{
            path: 'macro.trend.indicators.real_gdp_growth.delta_value',
            engine: '1',
            sme: '2'
        }]);
        expect(collected.edit_diff.fields.some((entry) => entry.path.includes('classification'))).toBe(false);
        expect(validateMacroOverride(collected.override_value)).toBeNull();
        expect(validateMacroOverride({ trend: { indicators: {} } })).toBe('No indicator modulations to save');
        expect(buildMacroEditDiff(row, collected.override_value).fields[0].path).toContain('delta_value');
    });

    it('applies a peak to an indicator the action left flat', () => {
        const row = sampleRow();
        row.record.tracks.macro.trend.indicators.pce_inflation = {
            label: 'PCE inflation (Q4/Q4, %)',
            favorable_direction: -1,
            delta_value: 0,
            weights: [0, 0, 0],
            baseline: [2, 2, 2],
            deltas: [0, 0, 0],
            post_action: [2, 2, 2],
            verdict: 'neutral'
        };
        const collected = collectMacroOverrideFromCard(fakeCard({
            '[data-pli-rationale]': 'Inflation should move too'
        }, [peakInput('pce_inflation', 0.4)]), row);
        const pce = collected.override_value.trend.indicators.pce_inflation;
        expect(pce.delta_value).toBe(0.4);
        expect(pce.deltas).toEqual([0, 0.2, 0.4]);
        expect(pce.post_action).toEqual([2, 2.2, 2.4]);
        expect(collected.edit_diff.fields).toEqual([{
            path: 'macro.trend.indicators.pce_inflation.delta_value',
            engine: '0',
            sme: '0.4'
        }]);
        expect(validateMacroOverride(collected.override_value)).toBeNull();
    });

    it('collects NI domain and Glasl stage edits into override_value', () => {
        const row = sampleRow();
        const collected = collectNiOverrideFromCard(fakeCard({
            '[data-pli-ni-delta="NI-1"]': '2',
            '[data-pli-glasl-stage]': '6',
            '[data-pli-rationale]': 'Stage jump'
        }), row);

        expect(collected.override_value.national_interest.domain_deltas['NI-1'].delta).toBe(2);
        expect(collected.override_value.glasl.stage_after).toBe(6);
        expect(collected.override_value.stage_after).toBe(6);
        expect(collected.override_value.glasl.delta).toBe(3);
        expect(buildNiEditDiff(row, collected.override_value).fields.map((entry) => entry.path)).toEqual([
            'national_interest.domain_deltas.NI-1.delta',
            'glasl.stage_after'
        ]);
    });

    it('collects Diplomacy taxonomy and Information brief section edits', () => {
        const row = sampleRow();
        const collected = collectDipOverrideFromCard(fakeCard({
            '[data-pli-dip-band]': 'C',
            '[data-pli-dip-code]': 'DIP-9',
            '[data-pli-dip-category]': 'Multilateral',
            '[data-pli-dip-style]': 'Public',
            '[data-pli-dip-effect]': 'Isolate the target',
            '[data-pli-info-section="summary"]': 'SME rewritten summary for the information environment.',
            '[data-pli-info-section="audiences"]': 'Allied publics.',
            '[data-pli-info-section="narratives"]': 'Frame as rule-keeping.',
            '[data-pli-info-section="second_order_effects"]': 'Limited blowback.',
            '[data-pli-info-section="sme_questions"]': 'Does the message hold in Seoul?',
            '[data-pli-info-section="suggested_sme_edits"]': 'Name the primary allied audience.',
            '[data-pli-rationale]': 'Tighten the brief'
        }), row);

        expect(collected.override_value.diplomacy.band).toBe('C');
        expect(collected.override_value.information.sections.summary).toContain('SME rewritten');
        expect(collected.edit_diff.fields.some((entry) => entry.path === 'information.sections.summary')).toBe(true);
        expect(readInformationSection(collected.override_value.information, 'summary')).toContain('SME rewritten');
    });

    it('preserves engine Information and Diplomacy values when override inputs are absent', () => {
        const row = sampleRow();
        const collected = collectDipOverrideFromCard(fakeCard({
            '[data-pli-rationale]': 'Rationale only'
        }), row);

        expect(collected.override_value.information.sections.summary).toBe('Engine summary text here.');
        expect(collected.override_value.diplomacy.band).toBe('B');
        expect(collected.override_value.diplomacy.code).toBe('DIP-1');
        expect(collected.edit_diff.fields).toEqual([]);
    });

    it('applies finalized overrides as the output of record', () => {
        const row = sampleRow();
        row.seat_reviews = {
            [SEATS.MACRO]: {
                status: SEAT_STATUS.OVERRIDDEN,
                override_value: { lever: 'L4', instrument: 'I4.01', implementation_score: 9 }
            }
        };
        const tracks = resolveOutputTracks(row);
        expect(tracks.macro.implementation.score).toBe(9);
        expect(tracks.macro.classification.lever).toBe('L4');
    });

    it('uses an overridden macro trend as the output of record', () => {
        const row = sampleRow();
        const collected = collectMacroOverrideFromCard(fakeCard({
            '[data-pli-rationale]': 'Raise GDP peak'
        }, [peakInput('real_gdp_growth', 2)]), row);
        row.seat_reviews = {
            [SEATS.MACRO]: {
                status: SEAT_STATUS.OVERRIDDEN,
                override_value: collected.override_value
            }
        };
        const tracks = resolveOutputTracks(row);
        expect(tracks.macro.classification.lever).toBe('L2');
        expect(tracks.macro.implementation.score).toBe(6);
        expect(tracks.macro.trend.indicators.real_gdp_growth.post_action).toEqual([2, 3, 4]);
        expect(tracks.macro.trend.indicators.real_gdp_growth.delta_value).toBe(2);
        const stacked = buildCumulativeMacroTrend([{
            finalized: { macro: true },
            tracks
        }]);
        expect(stacked.indicators.real_gdp_growth.deltas).toEqual([0, 1, 2]);
        expect(stacked.indicators.real_gdp_growth.post_action).toEqual([2, 3, 4]);
    });

    it('renders approved-as-proposed when there is no edit_diff', () => {
        const html = renderEditDiffHtml({ status: 'approved', edit_diff: emptyEditDiff() });
        expect(html).toContain('Approved as proposed');
        expect(renderEditDiffHtml({ status: 'pending' })).toBe('');
    });

    it('summarizes session efficacy from seat_reviews', () => {
        const summary = summarizeSessionEfficacy([
            {
                seat_reviews: {
                    [SEATS.MACRO]: { status: 'approved', edit_diff: emptyEditDiff() },
                    [SEATS.NATIONAL_INTEREST_ESCALATION]: {
                        status: 'overridden',
                        edit_diff: { fields: [{ path: 'glasl.stage_after', engine: '4', sme: '6' }] }
                    }
                }
            },
            {
                seat_reviews: {
                    [SEATS.MACRO]: {
                        status: 'overridden',
                        edit_diff: { fields: [{ path: 'macro.implementation.score', engine: '6', sme: '8' }] }
                    },
                    [SEATS.DIPLOMACY_INFORMATION]: { status: 'needs_human' }
                }
            }
        ]);
        expect(summary.seats[SEATS.MACRO]).toEqual({ approved: 1, overridden: 1, needs_human: 0 });
        expect(summary.seats[SEATS.DIPLOMACY_INFORMATION].needs_human).toBe(1);
        expect(summary.topPaths[0].path).toBe('glasl.stage_after');
    });

    it('builds TSJ markdown and Verba JSON packets from finalized seats only', () => {
        const row = sampleRow();
        row.seat_reviews = {
            [SEATS.MACRO]: {
                status: 'approved',
                sme_reviewer: 'Econ',
                edit_diff: emptyEditDiff()
            }
        };
        const tsj = buildPliSmePacket({
            row,
            action: { id: 'act-1', goal: 'Export controls', team: 'blue', move: 1 },
            pliSeat: SEATS.MACRO,
            handoffSeat: 'tsj'
        });
        expect(tsj.payload.version).toBe(PLI_PACKET_VERSION);
        expect(tsj.copyText).toContain('Tribe Street Journal PLI packet');
        expect(tsj.copyText).toContain('Lever: L2');

        const verba = buildPliSmePacket({
            row,
            action: { id: 'act-1', goal: 'Export controls', team: 'blue', move: 1 },
            pliSeat: SEATS.MACRO,
            handoffSeat: 'verba'
        });
        expect(verba.copyText).toContain('"version": "pli-sme-packet.v1"');
        expect(JSON.parse(verba.copyText).outputOfRecord.macro.lever).toBe('L2');
    });

    it('appends Information markdown to Verba copy text for the Dip/Info seat', () => {
        const row = sampleRow();
        row.seat_reviews = {
            [SEATS.DIPLOMACY_INFORMATION]: {
                status: 'overridden',
                sme_reviewer: 'Dip',
                override_value: {
                    diplomacy: row.record.tracks.diplomacy,
                    information: {
                        sections: {
                            ...row.record.tracks.information.sections,
                            summary: 'SME rewritten summary for the information environment.'
                        }
                    }
                },
                edit_diff: {
                    fields: [{
                        path: 'information.sections.summary',
                        engine: 'Engine summary text here.',
                        sme: 'SME rewritten summary for the information environment.'
                    }]
                }
            }
        };
        const verba = buildPliSmePacket({
            row,
            action: { id: 'act-1', goal: 'Export controls', team: 'blue', move: 1 },
            pliSeat: SEATS.DIPLOMACY_INFORMATION,
            handoffSeat: 'verba'
        });
        expect(verba.copyText).toContain('"version": "pli-sme-packet.v1"');
        expect(verba.copyText).toContain('### Information brief');
        expect(verba.copyText).toContain('SME rewritten summary');
        expect(verba.payload.sme.information.summary).toContain('SME rewritten');
        expect(verba.payload.engine.information.summary).toContain('Engine summary');
    });
});
