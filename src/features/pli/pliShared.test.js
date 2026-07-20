import { describe, expect, it } from 'vitest';
import {
    SEATS,
    getSeatReview,
    seatNeedsReview,
    getMacroBlock,
    getActionTitle,
    escapeHtml
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
});
