import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createE2EMockSupabaseClient } from './supabaseMock.js';
import { serializeProposalDetails } from '../features/actions/proposalDetails.js';

const key = 'esg_e2e_backend_state';
const identity = (id) => localStorage.setItem('esg_e2e_auth_session', JSON.stringify({ user: { id } }));
const read = () => JSON.parse(localStorage.getItem(key)).tables;
const seed = (change) => { const state = JSON.parse(localStorage.getItem(key)); change(state.tables); localStorage.setItem(key, JSON.stringify(state)); };
const roster = { version: 'green-roster-v1', approved_by: 'GC08 synthetic test only', approved_at: '2026-09-21T00:00:00Z',
    snapshot: { asian_pacific: ['ROK', 'Japan', 'ASEAN'], europe: ['UK', 'France', 'EU'], aliases: { 'South Korea': 'ROK' }, source_references: ['Rollback-only test fixture; not exercise approval'] } };
const params = { requested_name: 'Synthetic GC08', requested_session_code: 'GC08TEST', requested_description: null,
    requested_green_configuration: 'shared_facilitator_v1', requested_roster_version: roster.version,
    requested_request_key: '00000000-0000-4000-8000-000000000008' };
let api;
const create = (changes = {}) => api.rpc('create_configured_live_session', { ...params, ...changes });
async function claim(sid, id, role) {
    identity(id);
    return api.rpc('claim_session_role_seat', { requested_session_id: sid, requested_role: role, requested_name: 'Snapshot ' + id, requested_client_id: id });
}

describe('GC08 atomic administration contract (mock, not deployed SQL evidence)', () => {
    beforeEach(() => {
        const storage = new Map();
        globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
        api = createE2EMockSupabaseClient();
        // Denied mutations intentionally do not persist normalized state. Seed
        // the tables inspected by rollback assertions before making any calls.
        localStorage.setItem(key, JSON.stringify({ counters: {}, tables: {
            sessions: [], game_state: [], gc08_session_creations: [], green_roster_approvals: [roster],
            operator_grants: [{ auth_user_id: 'gm', surface: 'gamemaster', role: 'white' }] } }));
        identity('gm');
    });
    afterEach(() => { delete globalThis.localStorage; });

    it('lists only usable approved versions for an authenticated Game Master', async () => {
        seed((t) => t.green_roster_approvals.push({ ...roster, version: 'green-roster-v2', snapshot: { ...roster.snapshot, europe: [] } }));
        const before = localStorage.getItem(key);
        expect((await api.rpc('list_approved_green_rosters')).data).toEqual([roster]);
        identity('participant');
        expect((await api.rpc('list_approved_green_rosters')).error.code).toBe('42501');
        expect((await create()).error.code).toBe('42501');
        expect((await api.from('green_roster_approvals').insert(roster).select('*')).error).toBeTruthy();
        expect(read().sessions).toHaveLength(0);
        expect(localStorage.getItem(key)).toBe(before);
    });
    it.each([null, 'forged-version', 'green-roster-v2'])('rejects missing, forged or empty roster %s atomically', async (version) => {
        seed((t) => t.green_roster_approvals.push({ ...roster, version: 'green-roster-v2', snapshot: { ...roster.snapshot, asian_pacific: [] } }));
        const before = localStorage.getItem(key);
        expect((await create({ requested_roster_version: version })).error.code).toBe('23514');
        expect(read().sessions).toHaveLength(0);
        expect(read().game_state).toHaveLength(0);
        expect(read().gc08_session_creations).toHaveLength(0);
        expect(localStorage.getItem(key)).toBe(before);
    });
    it('binds the exact server snapshot and serializes identical retries without extra sessions or clocks', async () => {
        const results = await Promise.all([create(), create()]);
        expect(results.map((r) => r.error)).toEqual([null, null]);
        expect(results[0].data.id).toBe(results[1].data.id);
        expect(results[0].data.green_roster_snapshot).toEqual({ ...roster.snapshot, approved_by: roster.approved_by, approved_at: roster.approved_at });
        expect(read().sessions).toHaveLength(1); expect(read().game_state).toHaveLength(1);
        expect((await create({ requested_green_configuration: 'unified_v1', requested_roster_version: null })).error.code).toBe('PT409');
    });
    it.each(['setup-first', 'join-first'])('serializes evidence-free setup and a unified join (%s)', async (order) => {
        const session = (await api.rpc('create_live_demo_session', { requested_name: 'Setup race', requested_session_code: 'RACE' })).data;
        const setup = () => { identity('gm'); return api.rpc('configure_session_green_shared_facilitator', { sid: session.id, roster_version: roster.version }); };
        const join = () => claim(session.id, 'joining', 'green_facilitator');
        const results = await Promise.all(order === 'setup-first' ? [setup(), join()] : [join(), setup()]);
        expect(results[0].error).toBeNull();
        expect(results[1].error).toBeTruthy();
        const stored = read().sessions.find((s) => s.id === session.id);
        expect(stored.session_topology_version).toBe(order === 'setup-first' ? 2 : 1);
        expect(read().session_participants.filter((s) => s.session_id === session.id)).toHaveLength(order === 'setup-first' ? 0 : 1);
    });
    it('preserves the legacy creation signature and does not modify historical NULL/v1 or paired records', async () => {
        const historical = [null, 1, 2].map((v) => ({ id: 'old-' + v, session_topology_version: v, status: 'active' }));
        seed((t) => t.sessions.push(...historical));
        const unified = await api.rpc('create_live_demo_session', { requested_name: 'Legacy client', requested_session_code: 'OLDCLIENT' });
        expect(unified.data.session_topology_version).toBe(1);
        expect((await create()).error).toBeNull();
        expect(read().sessions.filter((s) => s.id.startsWith('old-'))).toEqual(
            historical.map((row) => expect.objectContaining(row))
        );
    });
    it('follows a newly created session through lookup, three claims, isolated handoffs and shared submission', async () => {
        const session = (await create()).data;
        identity('ap');
        expect((await api.rpc('lookup_joinable_session_by_code', { requested_code: 'GC08TEST' })).data.green_seat_model).toBe('shared_facilitator_v1');
        for (const [user, role] of [['ap','green_asian_pacific_scribe'], ['eu','green_europe_scribe'], ['fac','green_shared_facilitator']]) {
            expect((await claim(session.id, user, role)).error).toBeNull();
        }
        expect((await claim(session.id, 'other-fac', 'green_shared_facilitator')).error).toBeTruthy();
        const handed = [];
        for (const [region, user, member] of [['asian_pacific','ap','ROK'],['europe','eu','UK']]) {
            identity(user);
            const result = await api.rpc('write_regional_proposal', { requested_session_id: session.id, requested_delegation_id: region,
                requested_action_id: null, requested_expected_revision: null, requested_expected_row_version: null,
                requested_operation: 'forward', requested_client_key: 'handoff', requested_payload: {
                    goal: 'Synthetic ' + region, expected_outcomes: 'Synthetic outcome', sector: 'Agriculture',
                    ally_contingencies: serializeProposalDetails({ originators: [member], objective: 'Synthetic objective', intendedPartners: 'Blue',
                        recipientTeams: ['blue'], focusSectors: ['Agriculture'], supplyChainFocusDecision: 'No', timingAndConditions: 'Synthetic conditions', scribeHandoff: 'Forwarded' }) } });
            expect(result.error).toBeNull(); handed.push(result.data);
        }
        identity('ap');
        expect((await api.from('actions').select('*')).data.map((a) => a.delegation_id)).toEqual(['asian_pacific']);
        const eu = handed[1];
        expect((await api.rpc('write_regional_proposal', { requested_session_id: session.id, requested_delegation_id: 'europe', requested_action_id: eu.id,
            requested_expected_revision: eu.revision_number, requested_expected_row_version: eu.row_version, requested_operation: 'submit', requested_payload: {} })).error.code).toBe('42501');
        identity('fac');
        const submitted = await Promise.all(handed.map((a) => api.rpc('write_regional_proposal', {
            requested_session_id: session.id, requested_delegation_id: a.delegation_id, requested_action_id: a.id,
            requested_expected_revision: a.revision_number, requested_expected_row_version: a.row_version, requested_operation: 'submit', requested_payload: {} })));
        expect(submitted.map((r) => r.error)).toEqual([null, null]);
        expect(submitted.map((r) => r.data.status)).toEqual(['submitted', 'submitted']);
        identity('gm');
        expect((await api.rpc('configure_session_green_shared_facilitator', { sid: session.id, roster_version: roster.version })).error.code).toBe('23514');
        await api.rpc('archive_live_demo_session', { requested_session_id: session.id });
        expect((await create()).data.status).toBe('archived');
        expect((await claim(session.id, 'fac', 'green_shared_facilitator')).error).toBeTruthy();
        expect(read().session_participants.find((s) => s.role === 'green_shared_facilitator').display_name_snapshot).toBe('Snapshot fac');
        expect(read().actions).toHaveLength(2);
    });
});
