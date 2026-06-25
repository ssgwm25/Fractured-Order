import { describe, expect, it } from 'vitest';

import {
    SESSION_CODE_MAX_LENGTH,
    SESSION_CODE_MIN_LENGTH,
    validateSessionCode
} from './validation.js';

describe('session code validation', () => {
    it('accepts the shared minimum and maximum lengths', () => {
        expect(validateSessionCode('A'.repeat(SESSION_CODE_MIN_LENGTH))).toBeNull();
        expect(validateSessionCode('A'.repeat(SESSION_CODE_MAX_LENGTH))).toBeNull();
    });

    it('rejects codes outside the shared length contract', () => {
        expect(validateSessionCode('A'.repeat(SESSION_CODE_MIN_LENGTH - 1)))
            .toBe(`Session code must be at least ${SESSION_CODE_MIN_LENGTH} characters`);
        expect(validateSessionCode('A'.repeat(SESSION_CODE_MAX_LENGTH + 1)))
            .toBe(`Session code must be at most ${SESSION_CODE_MAX_LENGTH} characters`);
    });
});
