import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createE2EMockSupabaseClient } from './supabaseMock.js';

const key = 'esg_e2e_backend_state';
const identity = id => localStorage.setItem('esg_e2e_auth_session', JSON.stringify({ user: { id } }));
const read = () => JSON.parse(localStorage.getItem(key)).tables;
const seed = update => { const state = JSON.parse(localStorage.getItem(key)); update(state.tables); localStorage.setItem(key, JSON.stringify(state)); };
let api;
const remove = () => api.rpc('operator_remove_session_participant', { requested_session_id: 'session', requested_session_participant_id: 'seat' });
const claim = (name = 'New claim') => api.rpc('claim_session_role_seat', { requested_session_id: 'session', requested_role: 'green_facilitator', requested_name: name, requested_client_id: 'client' });

beforeEach(() => {
    const storage = new Map();
    vi.stubGlobal('localStorage', { getItem: k => storage.get(k) ?? null,
        setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) });
    api = createE2EMockSupabaseClient();
    localStorage.setItem(key, JSON.stringify({ counters: {}, tables: {
        sessions: [{ id: 'session', status: 'active', session_classification: 'live_exercise', is_protected: false, session_topology_version: 1 }],
        participants: [{ id: 'participant', auth_user_id: 'actor', client_id: 'client', name: 'Changed global name' }],
        session_participants: [{ id: 'seat', session_id: 'session', participant_id: 'participant', role: 'green_facilitator',
            display_name_snapshot: 'Original seat name', joined_at: '2026-09-22T00:00:00Z', heartbeat_at: new Date().toISOString(), is_active: true }],
        operator_grants: [{ auth_user_id: 'gm', surface: 'gamemaster', role: 'white' }], gc08_unified_seat_removals: []
    } }));
    identity('gm');
});
afterEach(() => vi.unstubAllGlobals());

it.each([null, 1])('retains original names with topology %s, without making history a live seat', async topology => {
    seed(t => { t.sessions[0].session_topology_version = topology; });
    const result = await remove();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id: 'seat', role: 'green_facilitator', display_name: 'Original seat name', is_active: false });
    expect(read().session_participants).toEqual([]);
    expect(read().gc08_unified_seat_removals).toEqual([expect.objectContaining({ seat_id: 'seat', session_id: 'session',
        role: 'green_facilitator', display_name_snapshot: 'Original seat name', session_topology_version: topology, removed_by_auth_user_id: 'gm' })]);
    const receipt = read().gc08_unified_seat_removals;
    identity('actor');
    expect((await api.rpc('restore_session_seat_context', { requested_session_id: 'session', requested_session_participant_id: 'seat' })).error.code).toBe('42501');
    expect((await api.rpc('heartbeat_session_role_seat', { requested_session_id: 'session', requested_session_participant_id: 'seat', requested_client_id: 'client' })).error).toBeTruthy();
    const next = await claim();
    expect(next.error).toBeNull();
    expect(next.data.id).not.toBe('seat');
    expect((await claim()).data.id).toBe(next.data.id);
    expect(read().gc08_unified_seat_removals).toEqual(receipt);
    identity('gm');
    expect((await api.rpc('archive_live_demo_session', { requested_session_id: 'session' })).error).toBeNull();
    expect(read().gc08_unified_seat_removals).toEqual(receipt);
});

it.each(['green_scribe', 'whitecell_lead'])('retains %s and preserves White Cell grant revocation', async role => {
    seed(t => { t.session_participants[0].role = role; t.operator_grants.push({ auth_user_id: 'actor', surface: 'whitecell', role: 'whitecell_lead', session_id: 'session' }); });
    expect((await remove()).error).toBeNull();
    expect(read().gc08_unified_seat_removals[0].role).toBe(role);
    expect(read().operator_grants.some(g => g.auth_user_id === 'actor')).toBe(false);
});

it('keeps unknown historical snapshots NULL instead of copying the mutable participant name', async () => {
    seed(t => { t.session_participants[0].display_name_snapshot = null; });
    expect((await remove()).error).toBeNull();
    expect(read().gc08_unified_seat_removals[0].display_name_snapshot).toBeNull();
});

it('denies unauthorized removal atomically and makes retry history nonduplicating', async () => {
    identity('actor');
    const before = read();
    expect((await remove()).error).toBeTruthy();
    expect(read()).toEqual(before);
    identity('gm');
    expect((await remove()).error).toBeNull();
    const removed = read();
    expect((await remove()).error).toBeTruthy();
    expect(read()).toEqual(removed);
});

it('fails removal atomically if an immutable receipt would collide', async () => {
    seed(t => t.gc08_unified_seat_removals.push({ seat_id: 'seat', display_name_snapshot: 'Existing evidence' }));
    const before = read();
    expect((await remove()).error.code).toBe('23505');
    expect(read()).toEqual(before);
});

it('does not expose or permit browser mutations of removal receipts, including to a Game Master', async () => {
    await remove();
    const receipt = read().gc08_unified_seat_removals;
    expect((await api.from('gc08_unified_seat_removals').select('*')).data).toEqual([]);
    expect((await api.from('gc08_unified_seat_removals').insert({ seat_id: 'forged' })).error).toBeTruthy();
    await api.from('gc08_unified_seat_removals').update({ display_name_snapshot: 'Forged' }).eq('seat_id', 'seat');
    await api.from('gc08_unified_seat_removals').delete().eq('seat_id', 'seat');
    expect(read().gc08_unified_seat_removals).toEqual(receipt);
});

it.each([['regional_pairs_v1', 'green_europe_scribe', 'europe'], ['shared_facilitator_v1', 'green_shared_facilitator', null]])(
    'preserves %s tombstones without creating unified receipts', async (model, role, delegation) => {
        seed(t => { Object.assign(t.sessions[0], { session_topology_version: 2, green_seat_model: model });
            Object.assign(t.session_participants[0], { role, delegation_id: delegation }); });
        expect((await remove()).error).toBeNull();
        expect(read().session_participants[0]).toMatchObject({ id: 'seat', is_active: false, display_name_snapshot: 'Original seat name' });
        expect(read().session_participants[0].revoked_at).toBeTruthy();
        expect(read().gc08_unified_seat_removals).toEqual([]);
        identity('actor');
        expect((await api.rpc('restore_session_seat_context', { requested_session_id: 'session', requested_session_participant_id: 'seat' })).error.code).toBe('42501');
    }
);
