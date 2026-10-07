import { describe, expect, it } from 'vitest';

import {
    AuthError,
    ConfigurationError,
    DatabaseError,
    NetworkError,
    fromSupabaseError,
    getUserMessage,
    normalizeUserFacingErrorMessage
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

    it('explains the Industry draft recipient constraint without exposing SQL details', () => {
        const error = fromSupabaseError({
            message: 'INDUSTRY_PROPOSAL_RECIPIENT_REQUIRED',
            code: '23514'
        }, 'createAction');

        expect(getUserMessage(error)).toBe(
            'Select Blue, Red, or both as an intended recipient, then save again.'
        );
    });

    it('replaces infrastructure-oriented auth and configuration messages', () => {
        expect(getUserMessage(new AuthError('Unable to establish browser identity.'))).toBe(
            'We couldn\'t verify access to this session. Try again. If the issue continues, tell your exercise facilitator.'
        );
        expect(getUserMessage(new ConfigurationError('Backend configuration is missing.'))).toBe(
            'This exercise isn\'t ready yet. Ask your exercise facilitator to check the session setup, then try again.'
        );
    });

    it('uses the provided fallback for unexpected errors', () => {
        expect(getUserMessage(new Error('internal stack detail'), {
            fallback: 'Failed to save action. Check the form and try again.'
        })).toBe('We couldn\'t save action. Check the form and try again.');
    });

    it('replaces generic and terse failure copy with a next step', () => {
        expect(normalizeUserFacingErrorMessage('An unexpected error occurred')).toBe(
            'Something went wrong. Try again.'
        );
        expect(normalizeUserFacingErrorMessage('No active session')).toContain(
            'Return to the join page'
        );
        expect(normalizeUserFacingErrorMessage('Unable to verify browser identity.')).toBe(
            'We couldn\'t verify browser identity.'
        );
    });

    it('describes connection recovery without technical error terminology', () => {
        expect(getUserMessage(new NetworkError())).toBe(
            'We couldn\'t connect. Check your internet connection and try again.'
        );
    });
});
