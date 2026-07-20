import { describe, expect, it } from 'vitest';
import { database } from './database.js';

describe('database PLI review helpers', () => {
    it('exposes fetchPliAdjudications and reviewPliSeat', () => {
        expect(typeof database.fetchPliAdjudications).toBe('function');
        expect(typeof database.reviewPliSeat).toBe('function');
        expect(typeof database.reviewPliAdjudication).toBe('function');
    });

    it('rejects invalid seats before network I/O', async () => {
        await expect(database.reviewPliSeat('id', 'not-a-seat', { status: 'approved' }))
            .rejects.toThrow(/Invalid PLI SME seat/);
    });

    it('rejects override without rationale before network I/O', async () => {
        await expect(database.reviewPliSeat('id', 'macro', {
            status: 'overridden',
            override_value: { fit_score: 5 }
        })).rejects.toThrow(/rationale/i);
    });
});
