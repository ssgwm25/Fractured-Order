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

function fakeCard(values = {}) {
    return {
        querySelector: (selector) => {
            if (!Object.prototype.hasOwnProperty.call(values, selector)) return null;
            return { value: values[selector] };
        }
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
                    implementation: { score: 6 }
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
    it('records field-level macro diffs and collects edited override values', () => {
        const row = sampleRow();
        const collected = collectMacroOverrideFromCard(fakeCard({
            '[data-pli-macro-lever]': 'L4',
            '[data-pli-macro-instrument]': 'I4.01',
            '[data-pli-macro-impl]': '8',
            '[data-pli-rationale]': 'Wrong table row'
        }), row);

        expect(collected.override_value.lever).toBe('L4');
        expect(collected.override_value.implementation_score).toBe(8);
        expect(collected.override_rationale).toBe('Wrong table row');
        expect(collected.edit_diff.fields.map((entry) => entry.path)).toEqual([
            'macro.classification.lever',
            'macro.classification.instrument',
            'macro.implementation.score'
        ]);
        expect(validateMacroOverride(collected.override_value)).toBeNull();
        expect(buildMacroEditDiff(row, { implementation_score: 6, lever: 'L2', instrument: 'I2.01' }).fields).toEqual([]);
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
        expect(tracks.macro.classification.lever).toBe('L4');
        expect(tracks.macro.implementation.score).toBe(9);
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
