import { beforeEach, describe, expect, it, vi } from 'vitest';
const { supabase, ensureBrowserIdentity } = vi.hoisted(() => ({
    supabase: { rpc: vi.fn(), from: vi.fn() },
    ensureBrowserIdentity: vi.fn().mockResolvedValue({ user: { id: 'authenticated-browser' } })
}));
vi.mock('./supabase.js', () => ({ supabase, ensureBrowserIdentity, getRuntimeConfigStatus: () => ({ ready: true }) }));
vi.mock('../stores/session.js', () => ({ sessionStore: { getClientId: () => 'browser-client' } }));
import { database } from './database.js';
beforeEach(() => vi.clearAllMocks());
describe('GC-04 database context RPCs', () => {
    it('retains server topology in code lookup', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: { id: 'session', session_topology_version: 2 }, error: null });
        expect(await database.lookupJoinableSessionByCode('abc')).toMatchObject({ session_topology_version: 2 });
        expect(supabase.from).not.toHaveBeenCalled();
    });
    it('sends seat and session references without role, delegation or client authority', async () => {
        const data = { seat: { delegation_id: 'europe' }, session: { session_topology_version: 2 } };
        supabase.rpc.mockResolvedValueOnce({ data, error: null });
        expect(await database.restoreSessionSeatContext('session', 'seat')).toEqual(data);
        expect(supabase.rpc).toHaveBeenCalledWith('restore_session_seat_context', {
            requested_session_id: 'session', requested_session_participant_id: 'seat'
        });
    });
    it('does not downgrade when the migration is absent', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Missing RPC' } });
        await expect(database.restoreSessionSeatContext('session', 'seat')).rejects.toThrow();
        expect(supabase.from).not.toHaveBeenCalled();
    });
});
