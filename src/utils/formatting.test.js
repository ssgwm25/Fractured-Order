import { describe, expect, it } from 'vitest';

import { formatStatus } from './formatting.js';

describe('formatStatus', () => {
    it('surfaces adjudicated actions as deliberation underway', () => {
        expect(formatStatus('adjudicated')).toBe('Completed');
    });

    it('preserves the default title-cased mapping for other statuses', () => {
        expect(formatStatus('submitted')).toBe('Deliberation Underway');
    });
});
