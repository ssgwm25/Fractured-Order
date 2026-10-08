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
    isPliQueueStub,
    leadSeatStatusBadge,
    getMacroBlock,
    getActionTitle,
    escapeHtml,
    indicatorChartSvgHtml,
    scaleIndicatorToPeak,
    engineIndicatorPeak,
    indicatorHasEffectWindow,
    referenceWeights,
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
        expect(isPliQueueStub({ codebook_version: 'queued', record: { queue_stub: true } })).toBe(true);
        expect(isPliQueueStub({ codebook_version: '1.0', record: { tracks: {} } })).toBe(false);
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
        const needsHuman = {
            seat_reviews: { [SEATS.MACRO]: { status: 'needs_human' } }
        };
        const approved = {
            seat_reviews: { [SEATS.MACRO]: { status: 'approved' } }
        };
        const skipped = {
            seat_reviews: { [SEATS.MACRO]: { status: 'skipped' } }
        };

        expect(isPliRowVisible(pending, SEATS.MACRO, {
            viewMode: PLI_VIEW_MODES.REVIEW
        })).toBe(true);
        // Lead can preview drafts before SME finalize.
        expect(isPliRowVisible(pending, SEATS.MACRO, {
            viewMode: PLI_VIEW_MODES.LEAD_READONLY
        })).toBe(true);
        expect(isPliRowVisible(needsHuman, SEATS.MACRO, {
            viewMode: PLI_VIEW_MODES.LEAD_READONLY
        })).toBe(true);
        expect(isPliRowVisible(approved, SEATS.MACRO, {
            viewMode: PLI_VIEW_MODES.LEAD_READONLY
        })).toBe(true);
        expect(isPliRowVisible(skipped, SEATS.MACRO, {
            viewMode: PLI_VIEW_MODES.LEAD_READONLY
        })).toBe(false);

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

    it('labels Lead seat badges as draft vs finalized', () => {
        expect(leadSeatStatusBadge({ status: 'pending' }).label).toBe('Draft — awaiting SME');
        expect(leadSeatStatusBadge({ status: 'needs_human' }).label).toBe('Draft — awaiting SME');
        expect(leadSeatStatusBadge({
            status: 'needs_human',
            override_rationale: 'Hey this is nonsense'
        }).label).toBe('Returned by SME');
        expect(leadSeatStatusBadge({ status: 'approved' }).label).toBe('Finalized');
        expect(leadSeatStatusBadge({ status: 'overridden' }).label).toBe('Finalized (overridden)');
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

    it('scales an indicator peak without changing the quarterly shape', () => {
        const indicator = {
            label: 'Real GDP growth (%)',
            favorable_direction: 1,
            delta_value: 1,
            weights: [0, 0.5, 1],
            baseline: [2, 2, 2],
            deltas: [0, 0.5, 1],
            post_action: [2, 2.5, 3]
        };
        const scaled = scaleIndicatorToPeak(indicator, 2);
        expect(scaled.scalable).toBe(true);
        expect(scaled.delta_value).toBe(2);
        expect(scaled.deltas).toEqual([0, 1, 2]);
        expect(scaled.post_action).toEqual([2, 3, 4]);
        expect(scaled.verdict).toBe('favorable');
        expect(engineIndicatorPeak(indicator)).toBe(1);
        const before = indicatorChartSvgHtml(['2026Q1', '2026Q2', '2026Q3'], indicator);
        const after = indicatorChartSvgHtml(['2026Q1', '2026Q2', '2026Q3'], scaled);
        expect(after).not.toBe(before);
        expect(after).toContain('2 pp');
    });

    it('gives a flat indicator the action shape, and a level shift when the action has none', () => {
        const flat = {
            label: 'PCE inflation',
            favorable_direction: -1,
            delta_value: 0,
            weights: [0, 0, 0],
            baseline: [2, 2, 2],
            deltas: [0, 0, 0],
            post_action: [2, 2, 2]
        };
        expect(indicatorHasEffectWindow(flat)).toBe(false);
        const unchanged = scaleIndicatorToPeak(flat, 0, [0, 0.5, 1]);
        expect(unchanged.delta_value).toBe(0);
        expect(unchanged.deltas).toEqual([0, 0, 0]);

        const borrowed = scaleIndicatorToPeak(flat, 0.4, [0, 0.5, 1]);
        expect(borrowed.scalable).toBe(true);
        expect(borrowed.weights).toEqual([0, 0.5, 1]);
        expect(borrowed.deltas).toEqual([0, 0.2, 0.4]);
        expect(borrowed.post_action).toEqual([2, 2.2, 2.4]);
        expect(borrowed.verdict).toBe('unfavorable');
        expect(referenceWeights({ gdp: { weights: [0, 0.5, 1] }, pce: flat })).toEqual([0, 0.5, 1]);

        const held = scaleIndicatorToPeak(flat, 0.4);
        expect(held.deltas).toEqual([0.4, 0.4, 0.4]);
        expect(held.post_action).toEqual([2.4, 2.4, 2.4]);
        expect(indicatorChartSvgHtml(['2026Q1'], { label: 'GDP', baseline: [1], post_action: [1] })).toContain('GDP');
    });
});
