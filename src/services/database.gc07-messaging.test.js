import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createE2EMockSupabaseClient } from './supabaseMock.js';

const stateKey = 'esg_e2e_backend_state';
const realtimeKey = 'esg_e2e_realtime_changes';
const identity = (id) => localStorage.setItem('esg_e2e_auth_session', JSON.stringify({ user: { id } }));
const seed = (change) => { const state = JSON.parse(localStorage.getItem(stateKey)); change(state.tables); localStorage.setItem(stateKey, JSON.stringify(state)); };
let api;
async function claim(id, role, sid = 'shared') {
    identity(id);
    expect((await api.rpc('claim_session_role_seat', { requested_session_id: sid, requested_role: role,
        requested_name: 'Synthetic GC07', requested_client_id: id })).error).toBeNull();
}
const write = (region, r = null, overrides = {}) => api.rpc('write_regional_rfi', {
    requested_session_id: 'shared', requested_delegation_id: region, requested_request_id: r?.id ?? null,
    requested_expected_revision: r?.revision_number ?? null, requested_query: r ? 'Synthetic corrected question?' : 'Synthetic regional question?',
    requested_categories: ['Other'], requested_client_key: 'same-key', ...overrides
});
const send = (region, overrides = {}) => api.rpc('send_regional_direct_message', {
    requested_session_id: 'shared', requested_delegation_id: region, requested_content: 'Synthetic private coordination',
    requested_client_key: 'same-key', ...overrides
});
const wcSend = (recipient, metadata = {}) => api.rpc('operator_send_communication', {
    requested_session_id: 'shared', requested_to_role: recipient, requested_type: 'GUIDANCE', requested_content: 'Synthetic update', requested_metadata: metadata
});

describe('GC07 scoped messaging (mock; hosted RPC/RLS evidence is separate)', () => {
    beforeEach(async () => {
        const storage = new Map();
        globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
        api = createE2EMockSupabaseClient();
        localStorage.setItem(stateKey, JSON.stringify({ counters: {}, tables: {
            sessions: ['shared', 'pairs', 'legacy'].map((id) => ({ id, status: 'active', session_classification: 'live_exercise', is_protected: false,
                session_topology_version: id === 'legacy' ? 1 : 2, green_seat_model: id === 'shared' ? 'shared_facilitator_v1' : null,
                green_roster_version: 'synthetic', green_roster_snapshot: { asian_pacific: ['ROK'], europe: ['UK'] } })),
            game_state: ['shared', 'pairs', 'legacy'].map((session_id) => ({ id: `${session_id}-game`, session_id, move: 1, phase: 1 }))
        } }));
        for (const [id, role] of [['ap', 'green_asian_pacific_scribe'], ['eu', 'green_europe_scribe'], ['fac', 'green_shared_facilitator']]) await claim(id, role);
        seed((t) => t.operator_grants.push({ auth_user_id: 'wc', session_id: 'shared', surface: 'whitecell', role: 'whitecell_lead' }));
        await claim('wc', 'whitecell_lead');
    });
    afterEach(() => { delete globalThis.localStorage; });

    it.each(['asian_pacific', 'europe'])('creates, returns, corrects and answers %s without exposing it to the other Scribe', async (region) => {
        identity('fac');
        const created = await write(region); expect(created.error).toBeNull();
        expect((await write(region)).data.id).toBe(created.data.id);
        identity('wc');
        const review = await api.rpc('operator_review_artifact', { requested_artifact_kind: 'rfi', requested_artifact_id: created.data.id,
            requested_team: 'green', requested_expected_revision: 1, requested_review_decision: 'return_for_clarification', requested_reviewer_notes: 'Clarify synthetic scope' });
        expect(review.error).toBeNull();
        identity('fac');
        expect((await api.from('artifact_workflow_reviews').select('*')).data).toHaveLength(1);
        expect((await write(region, created.data)).error.code).toBe('PT409');
        const revised = await write(region, review.data.artifact); expect(revised.error).toBeNull();
        expect(revised.data).toMatchObject({ id: created.data.id, delegation_id: region, revision_number: 2, workflow_state: 'resubmitted' });
        expect((await write(region, revised.data)).error.code).toBe('23514');
        identity('wc');
        const params = { requested_session_id: 'shared', requested_delegation_id: region, requested_request_id: created.data.id,
            requested_expected_revision: 2, requested_response: 'Synthetic answer' };
        expect((await api.rpc('operator_answer_regional_rfi', { ...params, requested_expected_revision: 1 })).error.code).toBe('PT409');
        expect((await api.rpc('operator_answer_regional_rfi', params)).data.workflow_state).toBe('completed');
        identity(region === 'europe' ? 'eu' : 'ap');
        expect((await api.from('requests').select('*')).data).toHaveLength(1);
        expect((await api.from('communications').select('*')).data[0]).toMatchObject({ recipient_scope: 'delegation', recipient_delegation_id: region });
        expect((await write(region)).error.code).toBe('42501');
        identity(region === 'europe' ? 'ap' : 'eu');
        expect((await api.from('requests').select('*')).data).toEqual([]);
        expect((await api.from('communications').select('*')).data).toEqual([]);
    });

    it('requires explicit scope, preserves retries by seat and region, and rejects forged state and direct table writes', async () => {
        identity('fac');
        expect((await write(null)).error.code).toBe('42501');
        const ap = (await write('asian_pacific')).data;
        const eu = (await write('europe')).data;
        expect(ap.id).not.toBe(eu.id);
        expect((await write('asian_pacific', eu)).error.code).toBe('42501');
        expect((await write('europe', null, { requested_session_id: 'pairs' })).error.code).toBe('42501');
        expect((await api.from('requests').insert({ session_id: 'shared', team: 'green', delegation_id: 'europe', query: 'Synthetic forbidden table insert' })).error.code).toBe('42501');
        const message = await send('europe'); expect(message.error).toBeNull();
        expect(message.data).toMatchObject({ from_role: 'green_shared_facilitator', owner_team: 'green', delegation_id: 'europe', sender_delegation_id: 'europe' });
        expect((await send('europe')).data.id).toBe(message.data.id);
        expect((await send('europe', { requested_content: 'Changed retry' })).error.code).toBe('PT409');
        identity('eu'); expect((await send('europe')).error.code).toBe('42501');
        expect((await api.from('communications').select('*')).data).toEqual([]);
        identity('wc'); expect((await api.from('communications').select('*')).data).toHaveLength(1);
    });

    it('resolves both-region, delegation and individual-role audiences without broadening private metadata', async () => {
        identity('wc');
        const both = await wcSend('green', { recipient_scope: 'team', recipient_team: 'green' });
        const ap = await wcSend('green_asian_pacific');
        const eu = await wcSend('green_europe_scribe', { recipient_team: 'green', recipient_scope: 'role', recipient_role: 'green_europe_scribe' });
        const shared = await wcSend('green_shared_facilitator');
        for (const result of [both, ap, eu, shared]) expect(result.error).toBeNull();
        expect(both.data.metadata.resolved_delivery_audience).toEqual(['asian_pacific', 'europe']);
        expect(eu.data.metadata.resolved_delivery_audience).toEqual(['green_europe_scribe']);
        expect((await wcSend('green', { recipient_role: 'green_europe_scribe' })).error.code).toBe('23514');
        expect((await wcSend('green_europe', { recipient_delegation_id: 'asian_pacific' })).error.code).toBe('23514');
        expect((await wcSend('green_europe_facilitator')).error.code).toBe('42501');
        for (const [user, expected] of [['ap', [both.data.id, ap.data.id]], ['eu', [both.data.id, eu.data.id]], ['fac', [both.data.id, ap.data.id, shared.data.id]]]) {
            identity(user);
            expect((await api.from('communications').select('*')).data.map((c) => c.id).sort()).toEqual(expected.sort());
        }
    });

    it.each(['heartbeat_at', 'revoked_at', 'is_active'])('denies reads and writes when the shared seat loses %s', async (field) => {
        identity('fac'); await write('europe');
        seed((t) => { const seat = t.session_participants.find((s) => s.role === 'green_shared_facilitator');
            seat[field] = field === 'heartbeat_at' ? '2000-01-01T00:00:00Z' : field === 'is_active' ? false : new Date().toISOString(); });
        expect((await write('europe')).error.code).toBe('42501');
        expect((await send('europe')).error.code).toBe('42501');
        expect((await api.from('requests').select('*')).data).toEqual([]);
    });

    it('filters regional realtime delivery using the receiving seat, including revocation', async () => {
        const previousWindow = globalThis.window;
        const listeners = new Set();
        globalThis.window = { addEventListener: (_event, callback) => listeners.add(callback),
            removeEventListener: (_event, callback) => listeners.delete(callback) };
        const received = [];
        const channel = api.channel('gc07-private-stream')
            .on('postgres_changes', { table: 'requests' }, (event) => received.push(event.new.id))
            .on('postgres_changes', { table: 'communications' }, (event) => received.push(event.new.id))
            .subscribe();
        try {
            const oldValue = localStorage.getItem(stateKey);
            const oldState = JSON.parse(oldValue);
            identity('fac');
            const ap = (await write('asian_pacific')).data;
            await write('europe'); await send('asian_pacific');
            identity('wc');
            const both = (await wcSend('green')).data;
            await wcSend('green_europe_scribe');
            identity('ap');
            const currentState = JSON.parse(localStorage.getItem(stateKey));
            const changes = ['requests', 'communications'].flatMap((table) => {
                const previousIds = new Set((oldState.tables[table] || []).map((row) => row.id));
                return (currentState.tables[table] || [])
                    .filter((row) => !previousIds.has(row.id))
                    .map((row) => ({ table, eventType: 'INSERT', old: null, new: row }));
            });
            let deliverySequence = 0;
            const deliver = () => {
                const newValue = JSON.stringify({ version: 1, sequence: ++deliverySequence, changes });
                listeners.forEach((callback) => callback({ key: realtimeKey, oldValue: null, newValue }));
            };
            deliver();
            expect(received.sort()).toEqual([ap.id, both.id].sort());
            received.length = 0;
            seed((t) => { t.session_participants.find((s) => s.role === 'green_asian_pacific_scribe').revoked_at = new Date().toISOString(); });
            deliver();
            expect(received).toEqual([]);
        } finally {
            channel.unsubscribe();
            if (previousWindow === undefined) delete globalThis.window;
            else globalThis.window = previousWindow;
        }
    });

    it('keeps Blue/Red requests subject to White Cell approval and resolves Green to both delegations', async () => {
        seed((t) => t.actions.push({ id: 'blue-action', session_id: 'shared', team: 'blue', artifact_type: 'action',
            status: 'submitted', workflow_state: 'submitted_to_white_cell', revision_number: 1, is_deleted: false,
            artifact_payload: { action: { notificationTeams: ['Green'] } } }));
        identity('wc');
        const params = { requested_action_id: 'blue-action', requested_team: 'blue', requested_expected_revision: 1,
            requested_notification_teams: ['green'], requested_notification_content: 'Synthetic approved action' };
        expect((await api.rpc('operator_complete_action_with_notifications', { ...params, requested_notification_teams: ['industry'] })).error).toBeTruthy();
        seed((t) => { t.session_participants.find((s) => s.role === 'whitecell_lead').heartbeat_at = '2000-01-01T00:00:00Z'; });
        expect((await api.rpc('operator_complete_action_with_notifications', params)).error).toBeTruthy();
        const failedState = JSON.parse(localStorage.getItem(stateKey)).tables;
        expect(failedState.actions.find((a) => a.id === 'blue-action').workflow_state).toBe('submitted_to_white_cell');
        expect(failedState.artifact_workflow_reviews).toEqual([]);
        expect(failedState.communications).toEqual([]);
        seed((t) => { t.session_participants.find((s) => s.role === 'whitecell_lead').heartbeat_at = new Date().toISOString(); });
        const result = await api.rpc('operator_complete_action_with_notifications', params);
        expect(result.error).toBeNull();
        expect(result.data.communications[0]).toMatchObject({ recipient_scope: 'both_green_delegations',
            metadata: { notification_delivery: 'approved', resolved_delivery_audience: ['asian_pacific', 'europe'] } });
        for (const user of ['ap', 'eu', 'fac']) {
            identity(user);
            expect((await api.from('communications').select('*')).data.map((c) => c.id)).toContain(result.data.communications[0].id);
        }
    });

    it('preserves paired regional Facilitators and the legacy inverted role with unscoped records', async () => {
        await claim('pair', 'green_europe_facilitator', 'pairs');
        expect((await write('europe', null, { requested_session_id: 'pairs' })).error).toBeNull();
        expect((await write('asian_pacific', null, { requested_session_id: 'pairs' })).error.code).toBe('42501');
        await claim('legacy', 'green_scribe', 'legacy');
        const old = await api.from('requests').insert({ session_id: 'legacy', team: 'green', query: 'Legacy synthetic question', categories: ['Other'] }).select().single();
        expect(old.error).toBeNull(); expect(old.data.delegation_id ?? null).toBeNull();
    });
});
