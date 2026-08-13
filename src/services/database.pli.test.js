import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    assertPliSeatReviewerAllowed,
    assertSmeHandoffAcknowledgerAllowed,
    database,
    resolveNiGlaslStageAfter
} from './database.js';
import { sessionStore } from '../stores/session.js';
import { SEATS as PLI_SEATS } from '../features/pli/pliShared.js';

describe('database PLI review helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('exposes fetchPliAdjudications and reviewPliSeat', () => {
        expect(typeof database.fetchPliAdjudications).toBe('function');
        expect(typeof database.reviewPliSeat).toBe('function');
        expect(typeof database.reviewPliAdjudication).toBe('function');
        expect(typeof database.fetchSmeHandoffs).toBe('function');
        expect(typeof database.ensureSmeHandoffs).toBe('function');
        expect(typeof database.acknowledgeSmeHandoff).toBe('function');
    });

    it('rejects invalid seats before network I/O', async () => {
        await expect(database.reviewPliSeat('id', 'not-a-seat', { status: 'approved' }))
            .rejects.toThrow(/Invalid PLI SME seat/);
    });

    it('rejects override without rationale before network I/O', async () => {
        await expect(database.reviewPliSeat('id', 'macro', {
            status: 'overridden',
            override_value: { implementation_score: 5 }
        })).rejects.toThrow(/rationale/i);
    });

    it('allows only the matching SME role to review a PLI seat', () => {
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('sme_econ');
        expect(() => assertPliSeatReviewerAllowed(PLI_SEATS.MACRO)).not.toThrow();
        expect(() => assertPliSeatReviewerAllowed(PLI_SEATS.NATIONAL_INTEREST_ESCALATION))
            .toThrow(/cannot review seat/);
    });

    it('blocks White Cell from reviewing PLI seats', () => {
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        expect(() => assertPliSeatReviewerAllowed(PLI_SEATS.MACRO))
            .toThrow(/read-only/i);
    });

    it('rejects re-finalize unless status is needs_human send-back', () => {
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('sme_econ');
        const existing = {
            seat_reviews: {
                [PLI_SEATS.MACRO]: { status: 'approved' }
            }
        };
        expect(() => assertPliSeatReviewerAllowed(PLI_SEATS.MACRO, existing, {
            nextStatus: 'approved'
        })).toThrow(/already finalized/);
        expect(() => assertPliSeatReviewerAllowed(PLI_SEATS.MACRO, existing, {
            nextStatus: 'needs_human'
        })).not.toThrow();
    });

    it('gates handoff ack to matching TSJ / Verba SME roles', () => {
        vi.spyOn(sessionStore, 'getRole').mockReturnValue('sme_tsj');
        expect(() => assertSmeHandoffAcknowledgerAllowed('tsj')).not.toThrow();
        expect(() => assertSmeHandoffAcknowledgerAllowed('verba'))
            .toThrow(/cannot acknowledge/);

        vi.spyOn(sessionStore, 'getRole').mockReturnValue('whitecell_lead');
        expect(() => assertSmeHandoffAcknowledgerAllowed('tsj'))
            .toThrow(/Only the matching SME/);
    });

    it('resolves Glasl stage_after from NI override or track record', () => {
        expect(resolveNiGlaslStageAfter({
            record: { tracks: { glasl: { stage_after: 5 } } }
        })).toBe(5);
        expect(resolveNiGlaslStageAfter(
            { record: { tracks: { glasl: { stage_after: 5 } } } },
            { override_value: { stage_after: 7 } }
        )).toBe(7);
        expect(resolveNiGlaslStageAfter({})).toBeNull();
    });
});
