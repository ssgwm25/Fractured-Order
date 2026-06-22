import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockSupabase,
    mockEnsureBrowserIdentity,
    mockSessionStore
} = vi.hoisted(() => ({
    mockSupabase: {
        rpc: vi.fn(),
        from: vi.fn()
    },
    mockEnsureBrowserIdentity: vi.fn(),
    mockSessionStore: {
        getClientId: vi.fn(() => 'client-join-test')
    }
}));

vi.mock('./supabase.js', () => ({
    supabase: mockSupabase,
    ensureBrowserIdentity: mockEnsureBrowserIdentity,
    getRuntimeConfigStatus: () => ({ ready: true })
}));

vi.mock('../stores/session.js', () => ({
    sessionStore: mockSessionStore
}));

describe('database secure join lookup', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockSessionStore.getClientId.mockReturnValue('client-join-test');
        mockEnsureBrowserIdentity.mockResolvedValue({
            access_token: 'anon-token'
        });
    });

    it('joins successfully by a valid code through the authenticated RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                id: 'session-1',
                name: 'Alpha Session',
                session_code: 'ALPHA2026',
                status: 'active',
                metadata: {
                    hidden: 'should-not-leak'
                }
            },
            error: null
        });

        const { database } = await import('./database.js');
        const session = await database.lookupJoinableSessionByCode(' alpha2026 ');

        expect(mockEnsureBrowserIdentity).toHaveBeenCalledWith({
            clientId: 'client-join-test'
        });
        expect(mockSupabase.rpc).toHaveBeenCalledWith('lookup_joinable_session_by_code', {
            requested_code: 'ALPHA2026'
        });
        expect(mockSupabase.from).not.toHaveBeenCalled();
        expect(session).toEqual({
            id: 'session-1',
            name: 'Alpha Session',
            session_code: 'ALPHA2026',
            status: 'active'
        });
    });

    it('fails cleanly for an invalid code without enumerating sessions', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: null,
            error: {
                message: 'Session not found. Please check the code and try again.'
            }
        });

        const { database } = await import('./database.js');

        await expect(database.lookupJoinableSessionByCode('missing-code')).rejects.toMatchObject({
            name: 'DatabaseError',
            message: 'Session not found. Please check the code and try again.'
        });

        expect(mockEnsureBrowserIdentity).toHaveBeenCalledWith({
            clientId: 'client-join-test'
        });
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('normalizes invisible whitespace in seat-claim role ids before invoking the RPC', async () => {
        mockSupabase.rpc.mockResolvedValue({
            data: {
                id: 'session-participant-1',
                session_id: 'session-1',
                participant_id: 'participant-1',
                role: 'blue_scribe',
                is_active: true,
                claim_status: 'claimed'
            },
            error: null
        });

        const { database } = await import('./database.js');
        await database.claimParticipantSeat('session-1', ' Blue_Scribe\u200B\r\n', 'Yah');

        expect(mockSupabase.rpc).toHaveBeenCalledWith('claim_session_role_seat', {
            requested_session_id: 'session-1',
            requested_role: 'blue_scribe',
            requested_name: 'Yah',
            requested_client_id: 'client-join-test',
            requested_timeout_seconds: 90
        });
    });
});
