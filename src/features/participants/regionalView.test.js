import { describe, expect, it } from 'vitest';
import { matchesRegionalView, regionalAttribution } from './regionalView.js';

describe('GC08 regional operator presentation', () => {
    it('uses persisted owner on review, returned RFI and communications records', () => {
        for (const row of [{ delegation_id: 'europe' }, { recipient_delegation_id: 'europe' }, { sender_delegation_id: 'europe' }]) {
            expect(regionalAttribution(row)).toContain('Europe');
            expect(matchesRegionalView(row, 'europe')).toBe(true);
            expect(matchesRegionalView(row, 'asian_pacific')).toBe(false);
        }
    });
    it('shows the same shared seat in either roster view without inventing an owner', () => {
        const row = { role: 'green_shared_facilitator', delegation_id: null };
        expect(matchesRegionalView(row, 'europe')).toBe(true);
        expect(matchesRegionalView(row, 'asian_pacific')).toBe(true);
        expect(row.delegation_id).toBeNull();
        expect(regionalAttribution({ team: 'green', delegation_id: null })).toBe('');
    });
});
