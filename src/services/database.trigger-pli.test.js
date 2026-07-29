import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockEnsureBrowserIdentity,
    mockFunctionsInvoke
} = vi.hoisted(() => ({
    mockEnsureBrowserIdentity: vi.fn(async () => ({ user: { id: 'user-1' } })),
    mockFunctionsInvoke: vi.fn()
}));

vi.mock('./supabase.js', () => ({
    ensureBrowserIdentity: (...args) => mockEnsureBrowserIdentity(...args),
    getRuntimeConfigStatus: () => ({ ok: true }),
    supabase: {
        functions: {
            invoke: (...args) => mockFunctionsInvoke(...args)
        },
        from: vi.fn(),
        rpc: vi.fn()
    }
}));

vi.mock('../stores/session.js', () => ({
    sessionStore: {
        getUserName: () => 'WC Lead',
        getOperatorAuth: () => ({ role: 'whitecell_lead' }),
        getRole: () => 'whitecell_lead',
        getClientId: () => 'client-1',
        getSessionId: () => 'sess-1'
    }
}));

describe('database.triggerPliAdjudication', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('invokes the edge function for a session', async () => {
        mockFunctionsInvoke.mockResolvedValue({
            data: { ok: true, dispatched: true, sessionId: 'sess-1' },
            error: null
        });

        const { database } = await import('./database.js');
        const result = await database.triggerPliAdjudication('sess-1');

        expect(mockEnsureBrowserIdentity).toHaveBeenCalled();
        expect(mockFunctionsInvoke).toHaveBeenCalledWith('trigger-pli-adjudication', {
            body: { sessionId: 'sess-1', dryRun: false }
        });
        expect(result.ok).toBe(true);
        expect(result.dispatched).toBe(true);
    });

    it('throws when the edge function returns an error payload', async () => {
        mockFunctionsInvoke.mockResolvedValue({
            data: { error: 'GITHUB_PAT is not configured on the server' },
            error: null
        });

        const { database } = await import('./database.js');
        await expect(database.triggerPliAdjudication('sess-1'))
            .rejects.toThrow(/GITHUB_PAT/i);
    });
});
