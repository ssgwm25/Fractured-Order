import { describe, expect, it } from 'vitest';

import {
    SESSION_CODE_MAX_LENGTH,
    SESSION_CODE_MIN_LENGTH,
    validateGameState,
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

describe('game state validation', () => {
    it('accepts bounded timer allocations for all game-state marks', () => {
        expect(validateGameState({
            timer_allocations: {
                strategic_orientation: 1800,
                move_1: 2700,
                move_2: 3600,
                move_3: 4500
            }
        })).toEqual({
            valid: true,
            errors: []
        });
    });

    it('rejects missing or out-of-range timer allocation marks', () => {
        const result = validateGameState({
            timer_allocations: {
                strategic_orientation: 0,
                move_1: 2700,
                move_2: 3600
            }
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([
            'timer_allocations.strategic_orientation must be between 60 and 36000',
            'timer_allocations.move_3 must be a number'
        ]));
    });
});
