import { describe, expect, it } from 'vitest';

import {
    AuthError,
    ConfigurationError,
    DatabaseError,
    fromSupabaseError,
    getUserMessage
} from './errors.js';

describe('getUserMessage', () => {
    it('does not expose raw Supabase database errors', () => {
        const error = fromSupabaseError({
            message: 'permission denied for table operator_grants',
            code: '42501'
        }, 'authorizeOperatorAccess');

        expect(getUserMessage(error)).toBe(
            'Operator access could not be authorized. Check the access code and try again.'
        );
        expect(getUserMessage(error)).not.toContain('operator_grants');
    });

    it('uses action-specific safe copy for public join database failures', () => {
        const error = fromSupabaseError({
            message: 'relation "sessions" does not exist'
        }, 'lookupJoinableSessionByCode');

        expect(getUserMessage(error)).toBe('Session not found. Please check the code and try again.');
    });

    it('preserves curated database recovery messages', () => {
        const error = new DatabaseError(
            'This browser is still attached to a previous session seat. Please refresh and try again, or ask the operator to remove your seat from the participant roster.',
            'claimParticipantSeat',
            { code: '23505' }
        );

        expect(getUserMessage(error)).toContain('previous session seat');
    });

    it('preserves safe auth and configuration messages', () => {
        expect(getUserMessage(new AuthError('Unable to establish browser identity.'))).toBe(
            'Unable to establish browser identity.'
        );
        expect(getUserMessage(new ConfigurationError('Backend configuration is missing.'))).toBe(
            'Backend configuration is missing.'
        );
    });

    it('uses the provided fallback for unexpected errors', () => {
        expect(getUserMessage(new Error('internal stack detail'), {
            fallback: 'Failed to save action. Check the form and try again.'
        })).toBe('Failed to save action. Check the form and try again.');
    });
});
