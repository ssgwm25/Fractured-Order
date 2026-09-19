import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createE2EMockSupabaseClient } from './supabaseMock.js';

let api;
const stateKey = 'esg_e2e_backend_state';
const identity = (id) => localStorage.setItem('esg_e2e_auth_session', JSON.stringify({ user: { id } }));
function seed(change) {
    const state = JSON.parse(localStorage.getItem(stateKey));
    change(state.tables); localStorage.setItem(stateKey, JSON.stringify(state));
}
function claim(user, role, session = 'shared') {
    identity(user);
    return api.rpc('claim_session_role_seat', { requested_session_id: session, requested_role: role,
        requested_name: 'Synthetic participant', requested_client_id: `gc04a-${user}` });
}
describe('GC04A direct API contract (mock; hosted SQL evidence is separate)', () => {
    beforeEach(() => {
        const values = new Map();
        globalThis.localStorage = { getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
        globalThis.__ESG_E2E_TEST_CONFIG__ = { operatorAccessCode: 'test-only' };
        api = createE2EMockSupabaseClient();
        localStorage.setItem(stateKey, JSON.stringify({ counters: {}, tables: { sessions: ['shared', 'pairs', 'legacy'].map((id) => ({
            id, name: 'GC04A fixture', session_code: id.toUpperCase(), status: 'active', session_classification: 'live_exercise',
            is_protected: false, session_topology_version: id === 'legacy' ? 1 : 2,
            green_seat_model: id === 'shared' ? 'shared_facilitator_v1' : null,
            green_roster_version: id === 'legacy' ? null : 'synthetic-only',
            green_roster_snapshot: id === 'legacy' ? null : { fixture: true }
        })) } }));
    });
    afterEach(() => {
        delete globalThis.localStorage; delete globalThis.__ESG_E2E_TEST_CONFIG__;
    });
    it('claims three roles and enforces the single shared slot plus model compatibility', async () => {
        for (const [user, role] of [['ap', 'green_asian_pacific_scribe'], ['eu', 'green_europe_scribe'], ['fac', 'green_shared_facilitator']]) {
            expect((await claim(user, role)).error).toBeNull();
        }
        expect((await claim('second', 'green_shared_facilitator')).error.message).toContain('full');
        for (const region of ['asian_pacific', 'europe']) {
            expect((await claim('wrong', `green_${region}_facilitator`)).error?.code).toBe('42501');
        }
        expect((await claim('wrong', 'green_shared_facilitator', 'pairs')).error?.code).toBe('42501');
        expect((await claim('wrong', 'green_shared_facilitator', 'legacy')).error?.code).toBe('42501');
        expect((await claim('old-pair', 'green_europe_facilitator', 'pairs')).error).toBeNull();
        expect((await claim('old-unified', 'green_scribe', 'legacy')).error).toBeNull();
    });
    it('keeps Scribes isolated and grants the shared seat bounded reads with no mutations', async () => {
        await claim('ap', 'green_asian_pacific_scribe');
        await claim('eu', 'green_europe_scribe');
        await claim('fac', 'green_shared_facilitator');
        seed((tables) => {
            tables.actions.push(...['asian_pacific', 'europe'].flatMap((delegation) => ['draft', 'forwarded_to_facilitator', 'returned_to_team'].map((workflow_state) => ({
                id: `${delegation}-${workflow_state}`, session_id: 'shared', team: 'green', delegation_id: delegation,
                status: 'draft', workflow_state, artifact_type: 'proposal', goal: 'Synthetic fixture'
            }))));
            tables.communications.push({ id: 'private-thread', session_id: 'shared', owner_team: 'green', delegation_id: 'europe',
                from_role: 'white_cell', to_role: 'blue', type: 'PROPOSAL_FORWARDED',
                metadata: { source_team: 'green', recipient_team: 'blue', thread_id: 'fixture-thread' } });
            tables.scoped_notetaker_data.push({ id: 'private-notes', session_id: 'shared', team: 'green', delegation_id: 'europe', session_participant_id: 'notes-seat' });
        });
        const sharedRows = (await api.from('actions').select('*')).data;
        expect(sharedRows.map((row) => row.id).sort()).toEqual(['asian_pacific-forwarded_to_facilitator', 'europe-forwarded_to_facilitator']);
        expect((await api.from('communications').select('*')).data).toEqual([]);
        expect((await api.from('scoped_notetaker_data').select('*')).data).toEqual([]);
        expect((await api.from('actions').update({ status: 'submitted' }).eq('id', sharedRows[0].id)).error?.code).toBe('42501');
        expect((await api.from('requests').insert({ session_id: 'shared', team: 'green', delegation_id: 'europe', query: 'denied' })).error?.code).toBe('42501');
        expect((await api.rpc('green_has_capability', { requested_session_id: 'shared', requested_capability: 'thread' })).data).toBe(false);
        identity('ap');
        const apRows = (await api.from('actions').select('*')).data;
        expect(apRows).toHaveLength(3);
        expect(apRows.every((row) => row.delegation_id === 'asian_pacific')).toBe(true);
        expect((await api.from('actions').insert({ session_id: 'shared', team: 'green', delegation_id: 'europe', goal: 'spoof' })).error?.code).toBe('42501');
    });
    it('restores the model through stale reconnect and closes removal/replacement rejoin', async () => {
        const first = await claim('fac', 'green_shared_facilitator');
        const seatId = first.data.id;
        const params = { requested_session_id: 'shared', requested_session_participant_id: seatId };
        expect((await api.rpc('lookup_joinable_session_by_code', { requested_code: 'SHARED' })).data.green_seat_model).toBe('shared_facilitator_v1');
        seed((tables) => { tables.session_participants.find((seat) => seat.id === seatId).heartbeat_at = new Date(Date.now() - 91000).toISOString(); });
        expect((await api.rpc('restore_session_seat_context', params)).data.session.green_seat_model).toBe('shared_facilitator_v1');
        identity('intruder');
        expect((await api.rpc('restore_session_seat_context', params)).error?.code).toBe('42501');
        seed((tables) => { tables.operator_grants.push({ id: 'gm', auth_user_id: 'gm-auth', surface: 'gamemaster', role: 'white' }); });
        identity('gm-auth');
        expect((await api.rpc('operator_remove_session_participant', params)).error).toBeNull();
        identity('fac');
        expect((await api.rpc('restore_session_seat_context', params)).error?.code).toBe('42501');
        const replacement = await claim('replacement', 'green_shared_facilitator');
        expect(replacement.error).toBeNull();
        expect(replacement.data.id).not.toBe(seatId);
        expect((await claim('fac', 'green_shared_facilitator')).error?.code).toBe('42501');
    });
});
