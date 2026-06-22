import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockSupabase,
    mockEnsureBrowserIdentity,
    mockSessionStore
} = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(),
        rpc: vi.fn()
    },
    mockEnsureBrowserIdentity: vi.fn(),
    mockSessionStore: {
        getClientId: vi.fn(() => 'client-research-export-test')
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

describe('database research export helpers', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mockEnsureBrowserIdentity.mockResolvedValue({
            access_token: 'anon-token'
        });
    });

    it('defaults the research capture mode to research when the RPC is unavailable', async () => {
        const { database } = await import('./database.js');
        mockSupabase.rpc.mockResolvedValueOnce({
            data: null,
            error: {
                message: 'function public.live_demo_research_capture_mode() does not exist'
            }
        });

        await expect(database.getResearchCaptureMode()).resolves.toBe('research');
        expect(mockSupabase.rpc).toHaveBeenCalledWith('live_demo_research_capture_mode');
    });

    it('loads session-scoped research tables with the configured sort order', async () => {
        const { database } = await import('./database.js');
        const queryResult = {
            data: [{ event_id: 1 }],
            error: null
        };
        const order = vi.fn().mockResolvedValue(queryResult);
        const eq = vi.fn(() => ({ order }));
        const select = vi.fn(() => ({ eq, order }));
        mockSupabase.from.mockReturnValue({
            select
        });

        await expect(database.fetchResearchTable('research_audit_event_log', 'session-1')).resolves.toEqual([{ event_id: 1 }]);
        expect(mockSupabase.from).toHaveBeenCalledWith('research_audit_event_log');
        expect(eq).toHaveBeenCalledWith('session_id', 'session-1');
        expect(order).toHaveBeenCalledWith('event_id', { ascending: true });
    });

    it('assembles the research export bundle from the legacy session bundle plus research tables', async () => {
        const { database } = await import('./database.js');
        vi.spyOn(database, 'fetchSessionBundle').mockResolvedValue({
            session: { id: 'session-1', name: 'Alpha' },
            gameState: { move: 2, phase: 3 },
            participants: [],
            actions: [],
            requests: [],
            timeline: []
        });
        vi.spyOn(database, 'fetchCommunications').mockResolvedValue([{ id: 'comm-1' }]);
        vi.spyOn(database, 'fetchNotetakerData').mockResolvedValue([{ id: 'note-1' }]);
        vi.spyOn(database, 'getResearchCaptureMode').mockResolvedValue('research');
        vi.spyOn(database, 'getResearchBuildHash').mockResolvedValue('build-hash-1');
        vi.spyOn(database, 'fetchResearchTable').mockImplementation(async (tableName) => {
            if (tableName === 'research_audit_event_log') return [{ event_id: 1 }];
            if (tableName === 'research_participant') return [{ participant_pseudonym: 'participant-001' }];
            if (tableName === 'research_note') return [{ note_id: 'note-1' }];
            if (tableName === 'research_note_revision') return [{ note_id: 'note-1', version: 1 }];
            if (tableName === 'research_derived_session_metrics') return [{ session_id: 'session-1' }];
            if (tableName === 'research_export_codebook') return [{ table_name: 'event_log', column_name: 'event_id' }];
            return [];
        });

        const researchBundle = await database.fetchResearchExportBundle('session-1');

        expect(researchBundle).toMatchObject({
            session: { id: 'session-1', name: 'Alpha' },
            captureMode: 'research',
            softwareBuildHash: 'build-hash-1',
            communications: [{ id: 'comm-1' }],
            notetakerData: [{ id: 'note-1' }],
            researchAuditEventLog: [{ event_id: 1 }],
            researchParticipants: [{ participant_pseudonym: 'participant-001' }],
            researchNoteRevisions: [{ note_id: 'note-1', version: 1 }],
            researchDerivedSessionMetrics: [{ session_id: 'session-1' }],
            researchCodebook: [{ table_name: 'event_log', column_name: 'event_id' }]
        });
    });
});
