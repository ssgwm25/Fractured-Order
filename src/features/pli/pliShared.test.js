import { describe, expect, it } from 'vitest';
import { serializeBlueActionDetails } from '../actions/blueActionDetails.js';
import {
    SEATS,
    PLI_VIEW_MODES,
    getSeatReview,
    seatNeedsReview,
    seatIsFinalized,
    isDownstreamSeatUnlocked,
    isPliRowVisible,
    getMacroBlock,
    getActionTitle,
    escapeHtml,
    buildSourceActionPresentation,
    sourceActionColumn
} from './pliShared.js';

describe('pliShared', () => {
    it('reads seat review with fallback to row status', () => {
        const row = {
            status: 'pending',
            seat_reviews: {
                [SEATS.MACRO]: { status: 'needs_human' }
            }
        };
        expect(getSeatReview(row, SEATS.MACRO).status).toBe('needs_human');
        expect(getSeatReview(row, SEATS.DIPLOMACY_INFORMATION).status).toBe('pending');
        expect(seatNeedsReview(getSeatReview(row, SEATS.MACRO))).toBe(true);
        expect(seatNeedsReview({ status: 'approved' })).toBe(false);
        expect(seatNeedsReview({ status: 'skipped' })).toBe(false);
        expect(seatIsFinalized({ status: 'approved' })).toBe(true);
        expect(seatIsFinalized({ status: 'pending' })).toBe(false);
    });

    it('unlocks NI/Dip seats only after Macro is finalized or skipped', () => {
        expect(isDownstreamSeatUnlocked({
            seat_reviews: { [SEATS.MACRO]: { status: 'pending' } }
        })).toBe(false);
        expect(isDownstreamSeatUnlocked({
            seat_reviews: { [SEATS.MACRO]: { status: 'approved' } }
        })).toBe(true);
        expect(isDownstreamSeatUnlocked({
            seat_reviews: { [SEATS.MACRO]: { status: 'skipped' } }
        })).toBe(true);
    });

    it('filters PLI rows for SME review vs White Cell Lead readonly', () => {
        const pending = {
            seat_reviews: { [SEATS.MACRO]: { status: 'pending' } }
        };
        const approved = {
            seat_reviews: { [SEATS.MACRO]: { status: 'approved' } }
        };

        expect(isPliRowVisible(pending, SEATS.MACRO, {
            viewMode: PLI_VIEW_MODES.REVIEW
        })).toBe(true);
        expect(isPliRowVisible(pending, SEATS.MACRO, {
            viewMode: PLI_VIEW_MODES.LEAD_READONLY
        })).toBe(false);
        expect(isPliRowVisible(approved, SEATS.MACRO, {
            viewMode: PLI_VIEW_MODES.LEAD_READONLY
        })).toBe(true);

        const niPending = {
            seat_reviews: {
                [SEATS.MACRO]: { status: 'pending' },
                [SEATS.NATIONAL_INTEREST_ESCALATION]: { status: 'pending' }
            }
        };
        expect(isPliRowVisible(niPending, SEATS.NATIONAL_INTEREST_ESCALATION, {
            viewMode: PLI_VIEW_MODES.REVIEW,
            isRowUnlocked: isDownstreamSeatUnlocked
        })).toBe(false);
    });

    it('extracts macro aliases from multi-track records', () => {
        const record = {
            tracks: {
                macro: {
                    status: 'pending',
                    classification: { lever: 'L4' },
                    implementation: { score: 7 },
                    fit: { score: 5 },
                    trend: { indicators: {} }
                }
            }
        };
        const { adjudication } = getMacroBlock(record);
        expect(adjudication.classification.lever).toBe('L4');
        expect(adjudication.implementation.score).toBe(7);
    });

    it('prefers action goal for titles and escapes HTML', () => {
        expect(getActionTitle({ goal: 'Sanctions package' }, { action_id: 'abc' })).toBe('Sanctions package');
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('splits Blue action dumps into objective prose and compact details', () => {
        const action = {
            goal: 'Expand Secondary Sanctions on PRC Advanced Semiconductor Ecosystem',
            team: 'blue',
            move: 1,
            mechanism: 'Economic',
            ally_contingencies: serializeBlueActionDetails({
                objective: 'Blue expands secondary financial sanctions on foreign firms.',
                instruments: ['Economic'],
                levers: [],
                sectors: ['Semiconductors / advanced microelectronics'],
                supplyChainFocusDecision: 'Yes',
                supplyChainActionAngles: ['Disrupt Red'],
                supplyChainAreas: ['Advanced Manufacturing'],
                implementation: 'Executive Order',
                legislativeOptions: [],
                enforcementTimeline: '',
                coordinatedDecision: 'Yes',
                coordinated: ['Executive'],
                informedEngagedDecision: 'Yes',
                informed: ['Industry', 'Allies'],
                scribeHandoff: 'Forwarded'
            })
        };

        const presentation = buildSourceActionPresentation(action, {});
        expect(presentation.structured).toBe(true);
        expect(presentation.narrative).toBe('Blue expands secondary financial sanctions on foreign firms.');
        expect(presentation.details.map((d) => d.label)).toEqual([
            'Instruments',
            'Sectors',
            'Supply chain angles',
            'Supply chain areas',
            'Implementation',
            'Coordinated with',
            'Informed / engaged'
        ]);
        expect(presentation.details.find((d) => d.label === 'Informed / engaged').value)
            .toBe('Industry, Allies');

        const markup = sourceActionColumn(action, { action_id: 'a1' }, { declared_orientation: 'reframing' });
        expect(markup).toContain('Blue expands secondary financial sanctions on foreign firms.');
        expect(markup).toContain('Action details');
        expect(markup).not.toContain('None selected');
        expect(markup).not.toContain('Scribe Handoff');
        expect(markup).not.toContain('Blue Team Action Details');
    });
});
