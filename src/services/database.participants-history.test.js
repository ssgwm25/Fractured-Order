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
            getClientId: vi.fn(() => 'client-history-test')
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

describe('database session participant history', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockEnsureBrowserIdentity.mockResolvedValue({
            access_token: 'anon-token'
        });
    });

    it('loads the full session participant roster including inactive seats', async () => {
        mockParticipantQuery.order.mockResolvedValue({
            data: [
                {
                    id: 'seat-1',
                    session_id: 'session-1',
                    participant_id: 'participant-1',
                    role: 'blue_facilitator',
                    is_active: true,
                    heartbeat_at: '2026-04-08T15:00:00.000Z',
                    joined_at: '2026-04-08T14:59:00.000Z',
                    participants: {
                        name: 'Morgan',
                        client_id: 'client-history-test'
                    }
                },
                {
                    id: 'seat-2',
                    session_id: 'session-1',
                    participant_id: 'participant-2',
                    role: 'viewer',
                    is_active: false,
                    heartbeat_at: '2026-04-08T14:55:00.000Z',
                    joined_at: '2026-04-08T14:54:00.000Z',
                    participants: {
                        name: 'Taylor',
                        client_id: 'client-observer-test'
                    }
                }
            ],
            error: null
        });

        const { database } = await import('./database.js');
        const participants = await database.getSessionParticipants('session-1');

        expect(mockSupabase.rpc).not.toHaveBeenCalled();
        expect(mockSupabase.from).toHaveBeenCalledWith('session_participants');
        expect(mockParticipantQuery.select).toHaveBeenCalledWith('*, participants(name, client_id)');
        expect(mockParticipantQuery.eq).toHaveBeenCalledWith('session_id', 'session-1');
        expect(participants).toEqual([
            expect.objectContaining({
                id: 'seat-1',
                role: 'blue_facilitator',
                display_name: 'Morgan',
                client_id: 'client-history-test',
                is_active: true
            }),
            expect.objectContaining({
                id: 'seat-2',
                role: 'viewer',
                display_name: 'Taylor',
                client_id: 'client-observer-test',
                is_active: false
            })
        ]);
    });
});
