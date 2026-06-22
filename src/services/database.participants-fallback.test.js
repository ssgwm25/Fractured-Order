import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockSupabase,
    mockParticipantQuery,
    mockEnsureBrowserIdentity,
    mockSessionStore
} = vi.hoisted(() => {
    const participantQuery = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn()
    };

    participantQuery.select.mockReturnValue(participantQuery);
    participantQuery.eq.mockReturnValue(participantQuery);

    return {
        mockSupabase: {
            rpc: vi.fn(),
            from: vi.fn(() => participantQuery)
        },
        mockParticipantQuery: participantQuery,
        mockEnsureBrowserIdentity: vi.fn(),
        mockSessionStore: {
            getClientId: vi.fn(() => 'client-gm-test')
        }
    };
});

vi.mock('./supabase.js', () => ({
    supabase: mockSupabase,
    ensureBrowserIdentity: mockEnsureBrowserIdentity,
    getRuntimeConfigStatus: () => ({ ready: true })
}));

vi.mock('../stores/session.js', () => ({
    sessionStore: mockSessionStore
}));

describe('database active participant fallback', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockEnsureBrowserIdentity.mockResolvedValue({
            access_token: 'anon-token'
        });
    });

    it('falls back to a direct session_participants read when the roster RPC is ambiguous on the live backend', async () => {
        mockParticipantQuery.order.mockResolvedValue({
            data: [{
                id: 'seat-1',
                session_id: 'session-1',
                participant_id: 'participant-1',
                role: 'blue_facilitator',
                is_active: true,
                heartbeat_at: '2026-04-08T15:00:00.000Z',
                joined_at: '2026-04-08T14:59:00.000Z',
                participants: {
                    name: 'Morgan',
                    client_id: 'client-gm-test'
                }
            }],
            error: null
        });

        mockSupabase.rpc.mockResolvedValue({
            data: null,
            error: {
                message: 'function public.release_stale_session_role_seats(uuid, integer) is not unique'
            }
        });

        const { database } = await import('./database.js');
        const participants = await database.getActiveParticipants('session-1');

        expect(mockSupabase.rpc).toHaveBeenCalledWith('list_active_session_participants', {
            requested_session_id: 'session-1',
            requested_timeout_seconds: 90
        });
        expect(mockSupabase.from).toHaveBeenCalledWith('session_participants');
        expect(mockParticipantQuery.select).toHaveBeenCalledWith('*, participants(name, client_id)');
        expect(participants).toEqual([
            expect.objectContaining({
                id: 'seat-1',
                role: 'blue_facilitator',
                display_name: 'Morgan',
                client_id: 'client-gm-test'
            })
        ]);
    });
});
