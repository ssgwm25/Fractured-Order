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

describe('database.generatePliReportNarrative', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('invokes the edge function and returns narrative text', async () => {
        mockFunctionsInvoke.mockResolvedValue({
            data: { narrative: 'After-action summary for facilitators.' },
            error: null
        });

        const { database } = await import('./database.js');
        const result = await database.generatePliReportNarrative({
            sessionId: 'sess-1',
            scope: 'move',
            factPack: { actions: [{ actionId: 'a1' }] }
        });

        expect(mockEnsureBrowserIdentity).toHaveBeenCalled();
        expect(mockFunctionsInvoke).toHaveBeenCalledWith('pli-report-narrative', {
            body: {
                sessionId: 'sess-1',
                scope: 'move',
                factPack: { actions: [{ actionId: 'a1' }] }
            }
        });
        expect(result).toEqual({ narrative: 'After-action summary for facilitators.' });
    });

    it('throws when the edge function returns an empty narrative', async () => {
        mockFunctionsInvoke.mockResolvedValue({
            data: { error: 'CURSOR_API_KEY is not configured on the server' },
            error: null
        });

        const { database } = await import('./database.js');
        await expect(database.generatePliReportNarrative({
            sessionId: 'sess-1',
            scope: 'simulation',
            factPack: { actions: [] }
        })).rejects.toThrow(/CURSOR_API_KEY|empty/i);
    });
});
