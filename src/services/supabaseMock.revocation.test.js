import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createE2EMockSupabaseClient } from './supabaseMock.js';

const stateKey = 'esg_e2e_backend_state';
let api, listeners;
function changeSeat(update) {
    const oldValue = localStorage.getItem(stateKey);
    const state = JSON.parse(oldValue);
    Object.assign(state.tables.session_participants[0], update);
    const newValue = JSON.stringify(state);
    localStorage.setItem(stateKey, newValue);
    listeners.forEach(listener => listener({ key: stateKey, oldValue, newValue }));
}
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:00:00Z'));
    const storage = new Map();
    listeners = new Set();
    vi.stubGlobal('localStorage', { getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) });
    vi.stubGlobal('window', {
        addEventListener: (name, listener) => { if (name === 'storage') listeners.add(listener); },
        removeEventListener: (name, listener) => { if (name === 'storage') listeners.delete(listener); }
    });
    localStorage.setItem('esg_e2e_auth_session', JSON.stringify({ user: { id: 'actor' } }));
    api = createE2EMockSupabaseClient();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([
    ['regional_pairs_v1', 'green_europe_scribe', 'europe'],
    ['shared_facilitator_v1', 'green_shared_facilitator', null]
])('keeps %s revoked rows filtered and denies heartbeat/rejoin without erasing the seat', async (model, role, delegation) => {
    localStorage.setItem(stateKey, JSON.stringify({ counters: {}, tables: {
        sessions: [{ id: 'session', status: 'active', session_classification: 'live_exercise', is_protected: false,
            session_topology_version: 2, green_seat_model: model }],
        participants: [{ id: 'participant', auth_user_id: 'actor', client_id: 'client' }],
        session_participants: [{ id: 'seat', session_id: 'session', participant_id: 'participant', role,
            delegation_id: delegation, is_active: true, heartbeat_at: new Date().toISOString(), display_name_snapshot: 'Retained fixture' }]
    } }));
    const delivered = vi.fn();
    const channel = api.channel('session_participants:session').on('postgres_changes', {
        event: '*', schema: 'public', table: 'session_participants', filter: 'session_id=eq.session'
    }, delivered).subscribe();
    // First prove that this subscription receives an authorized row change.
    changeSeat({ last_seen: new Date().toISOString() });
    expect(delivered).toHaveBeenCalledOnce();
    delivered.mockClear();
    const revokedAt = new Date().toISOString();
    changeSeat({ is_active: false, revoked_at: revokedAt });
    expect(delivered).not.toHaveBeenCalled();
    expect((await api.from('session_participants').select('*')).data).toEqual([]);
    const args = { requested_session_id: 'session', requested_session_participant_id: 'seat', requested_client_id: 'client' };
    expect((await api.rpc('heartbeat_session_role_seat', args)).error).toMatchObject({ code: '42501', message: 'GC03_SEAT_REJOIN_REQUIRED' });
    expect((await api.rpc('restore_session_seat_context', args)).error).toMatchObject({ code: '42501', message: 'GC04_INVALID_SESSION_SEAT' });
    expect(JSON.parse(localStorage.getItem(stateKey)).tables.session_participants).toEqual([
        expect.objectContaining({ id: 'seat', role, delegation_id: delegation, is_active: false,
            revoked_at: revokedAt, display_name_snapshot: 'Retained fixture' })
    ]);
    channel.unsubscribe();
});

it('denies heartbeat and restore for a revoked unified seat without reactivating it', async () => {
    const revokedAt = new Date().toISOString();
    localStorage.setItem(stateKey, JSON.stringify({ counters: {}, tables: {
        sessions: [{ id: 'session', status: 'active', session_classification: 'live_exercise', is_protected: false,
            session_topology_version: 1, green_seat_model: 'unified_v1' }],
        participants: [{ id: 'participant', auth_user_id: 'actor', client_id: 'client' }],
        session_participants: [{ id: 'seat', session_id: 'session', participant_id: 'participant', role: 'green_scribe',
            delegation_id: null, is_active: false, revoked_at: revokedAt, heartbeat_at: new Date().toISOString(),
            display_name_snapshot: 'Retained unified fixture' }]
    } }));
    const args = {
        requested_session_id: 'session',
        requested_session_participant_id: 'seat',
        requested_client_id: 'client'
    };

    expect((await api.rpc('heartbeat_session_role_seat', args)).error)
        .toMatchObject({ code: '42501', message: 'GC03_SEAT_REJOIN_REQUIRED' });
    expect((await api.rpc('restore_session_seat_context', args)).error)
        .toMatchObject({ code: '42501', message: 'GC04_INVALID_SESSION_SEAT' });
    expect(JSON.parse(localStorage.getItem(stateKey)).tables.session_participants).toEqual([
        expect.objectContaining({ id: 'seat', is_active: false, revoked_at: revokedAt })
    ]);
});
