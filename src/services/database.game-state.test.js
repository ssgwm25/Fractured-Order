import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockSupabase,
    mockGameStateQuery,
    mockEnsureBrowserIdentity,
    mockSessionStore
} = vi.hoisted(() => {
    const query = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn()
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);

    return {
        mockSupabase: { from: vi.fn(() => query) },
        mockGameStateQuery: query,
        mockEnsureBrowserIdentity: vi.fn(),
        mockSessionStore: { getClientId: vi.fn(() => 'client-game-state-test') }
    };
});

vi.mock('./supabase.js', () => ({
    supabase: mockSupabase,
    ensureBrowserIdentity: mockEnsureBrowserIdentity,
    getRuntimeConfigStatus: () => ({ ready: true })
}));

vi.mock('../stores/session.js', () => ({ sessionStore: mockSessionStore }));

describe('database game-state reads', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockGameStateQuery.select.mockReturnValue(mockGameStateQuery);
        mockGameStateQuery.eq.mockReturnValue(mockGameStateQuery);
        mockEnsureBrowserIdentity.mockResolvedValue({ access_token: 'anon-token' });
    });

    it('uses a zero-row-safe read and reports a missing game_state row without a 406 response contract', async () => {
        mockGameStateQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
        const { database } = await import('./database.js');

        await expect(database.getGameState('session-1')).rejects.toMatchObject({
            name: 'NotFoundError',
            code: 'NOT_FOUND',
            entity: 'GameState',
            entityId: 'session-1'
        });

        expect(mockSupabase.from).toHaveBeenCalledWith('game_state');
        expect(mockGameStateQuery.select).toHaveBeenCalledWith('*');
        expect(mockGameStateQuery.eq).toHaveBeenCalledWith('session_id', 'session-1');
        expect(mockGameStateQuery.maybeSingle).toHaveBeenCalledOnce();
    });
});
