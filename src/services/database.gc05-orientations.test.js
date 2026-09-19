import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createE2EMockSupabaseClient } from './supabaseMock.js';
import { getStrategicOrientationCompletion, serializeStrategicOrientationDetails } from '../features/actions/strategicOrientationDetails.js';

const key = 'esg_e2e_backend_state';
const identity = (id) => localStorage.setItem('esg_e2e_auth_session', JSON.stringify({ user: { id } }));
const seed = (change) => { const state = JSON.parse(localStorage.getItem(key)); change(state.tables); localStorage.setItem(key, JSON.stringify(state)); };
const details = (strategyDescription = 'Synthetic strategy') => serializeStrategicOrientationDetails({ team: 'green', ownOrientation: 'pressure',
    forecastTargets: [{ key: 'blue', orientation: 'stabilization' }], strategyDescription, scribeHandoff: 'Forwarded' });
const params = (action) => ({ requested_session_id: action.session_id, requested_delegation_id: action.delegation_id,
    requested_action_id: action.id, requested_expected_revision: action.revision_number, requested_expected_row_version: action.row_version });
let api;
async function claim(id, role, session = 'shared') {
    identity(id);
    const result = await api.rpc('claim_session_role_seat', { requested_session_id: session, requested_role: role,
        requested_name: 'Synthetic actor', requested_client_id: id });
    expect(result.error).toBeNull();
    return result.data;
}
async function handoff(region, session = 'shared', action = null) {
    identity(`${session}-${region}`);
    return api.rpc('handoff_regional_orientation', { requested_session_id: session, requested_delegation_id: region,
        requested_action_id: null, requested_expected_revision: null, requested_expected_row_version: null,
        ...(action ? params(action) : {}), requested_details: details(), requested_goal: `Synthetic ${region}` });
}
async function submit(action, model = 'shared') {
    identity(model === 'shared' ? 'shared-fac' : `pairs-${action.delegation_id}-fac`);
    return api.rpc('submit_regional_orientation', params(action));
}
describe('GC05 orientation RPC contract (mock; SQL evidence required separately)', () => {
    beforeEach(async () => {
        const storage = new Map();
        globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
        api = createE2EMockSupabaseClient();
        localStorage.setItem(key, JSON.stringify({ counters: {}, tables: {
            sessions: ['shared', 'pairs', 'unified'].map((id) => ({ id, name: 'GC05 fixture', status: 'active', session_classification: 'live_exercise',
                is_protected: false, session_topology_version: id === 'unified' ? 1 : 2,
                green_seat_model: id === 'shared' ? 'shared_facilitator_v1' : null,
                green_roster_version: 'synthetic', green_roster_snapshot: { fixture: true } })),
            game_state: ['shared', 'pairs', 'unified'].map((session_id) => ({ id: `game-${session_id}`, session_id, move: 1, phase: 1 }))
        } }));
        for (const model of ['shared', 'pairs']) {
            for (const region of ['asian_pacific', 'europe']) {
                await claim(`${model}-${region}`, `green_${region}_scribe`, model);
                if (model === 'pairs') await claim(`pairs-${region}-fac`, `green_${region}_facilitator`, model);
            }
        }
        await claim('shared-fac', 'green_shared_facilitator');
        seed((tables) => {
            tables.operator_grants.push({ auth_user_id: 'wc', session_id: 'shared', surface: 'whitecell', role: 'whitecell_lead' });
            tables.actions.push(...['blue', 'red', 'industry'].map((team) => ({ id: team, session_id: 'shared', team, status: 'submitted',
                ally_contingencies: `Strategic Orientation Details\nTeam: ${team}` })));
        });
        await claim('wc', 'whitecell_lead');
    });
    afterEach(() => { delete globalThis.localStorage; });

    it.each(['shared', 'pairs'])('hands off both owners and submits independently with %s staffing', async (model) => {
        const ap = await handoff('asian_pacific', model);
        const eu = await handoff('europe', model);
        expect(ap.error).toBeNull(); expect(eu.error).toBeNull();
        expect((await handoff('asian_pacific', model)).error.code).toBe('23505');
        expect((await submit(ap.data, model)).error).toBeNull();
        const result = await submit(eu.data, model);
        expect(result.error).toBeNull();
        expect(result.data.delegation_id).toBe('europe');
        expect((await submit(result.data, model)).error.code).toBe('23514');
    });

    it('identifies Europe, blocks operator jumps and restores completion after originating-Scribe correction', async () => {
        const ap = (await handoff('asian_pacific')).data;
        const eu = (await handoff('europe')).data;
        await submit(ap);
        identity('wc');
        expect((await api.rpc('get_orientation_completion', { requested_session_id: 'shared' })).data.missingTeams).toEqual(['green:europe']);
        expect((await api.rpc('operator_update_game_state', { requested_session_id: 'shared', requested_move: 3, requested_phase: 5 })).error.code).toBe('23514');
        const submitted = (await submit(eu)).data;
        identity('wc');
        expect((await api.rpc('get_orientation_completion', { requested_session_id: 'shared' })).data.complete).toBe(true);
        const returned = await api.rpc('operator_review_artifact', { requested_artifact_kind: 'strategic_orientation', requested_artifact_id: eu.id,
            requested_team: 'green', requested_review_decision: 'return_to_team', requested_expected_revision: 1, requested_reviewer_notes: 'Synthetic correction' });
        expect(returned.error).toBeNull();
        expect(returned.data.artifact).toMatchObject({ delegation_id: 'europe', revision_number: 2, orientation_handoff_revision: null });
        expect((await api.rpc('get_orientation_completion', { requested_session_id: 'shared' })).data.missingTeams).toEqual(['green:europe']);
        expect((await submit(returned.data.artifact)).error.code).toBe('23514');
        expect((await api.from('artifact_workflow_reviews').select('*')).data).toHaveLength(1);
        identity('shared-asian_pacific');
        expect((await api.from('artifact_workflow_reviews').select('*')).data).toHaveLength(0);
        expect((await handoff('europe', 'shared', submitted)).error.code).toBe('PT409');
        const corrected = await handoff('europe', 'shared', returned.data.artifact);
        expect(corrected.error).toBeNull();
        const resubmitted = await submit(corrected.data);
        expect(resubmitted.data).toMatchObject({ workflow_state: 'resubmitted', revision_number: 2 });
        identity('wc');
        expect((await api.rpc('operator_update_game_state', { requested_session_id: 'shared', requested_move: 2 })).error).toBeNull();
    });

    it('preserves already-forwarded revision-one paired handoffs without backfilling history', async () => {
        const action = (await handoff('europe', 'pairs')).data;
        seed((tables) => { delete tables.actions.find((row) => row.id === action.id).orientation_handoff_revision; });
        const result = await submit(action, 'pairs');
        expect(result.error).toBeNull();
        expect(result.data.status).toBe('submitted');
        expect(result.data.orientation_handoff_revision).toBeUndefined();
    });

    it('rejects expired and revoked originating Scribes before handoff', async () => {
        for (const change of [{ heartbeat_at: new Date(Date.now() - 91000).toISOString() }, { revoked_at: new Date().toISOString(), is_active: false }]) {
            seed((tables) => Object.assign(tables.session_participants.find((s) => s.session_id === 'shared' && s.role === 'green_europe_scribe'), change));
            expect((await handoff('europe')).error.code).toBe('42501');
        }
    });

    it.each(['revoked', 'expired', 'inactive'])('rejects a %s White Cell seat even when its regional review grant remains', async (seatState) => {
        const submitted = (await submit((await handoff('europe')).data)).data;
        identity('wc');
        const seatChange = seatState === 'revoked' ? { revoked_at: new Date().toISOString() }
            : seatState === 'expired' ? { heartbeat_at: new Date(Date.now() - 91000).toISOString() }
                : { is_active: false };
        seed((tables) => Object.assign(tables.session_participants.find((s) => s.role === 'whitecell_lead'), seatChange));
        const before = JSON.parse(localStorage.getItem(key)).tables;
        for (const decision of ['return_to_team', 'complete']) {
            const result = await api.rpc('operator_review_artifact', { requested_artifact_kind: 'strategic_orientation', requested_artifact_id: submitted.id,
                requested_team: 'green', requested_review_decision: decision, requested_expected_revision: 1, requested_reviewer_notes: 'Denied correction' });
            expect(result).toMatchObject({ data: null, error: { code: '42501' } });
        }
        const after = JSON.parse(localStorage.getItem(key)).tables;
        expect(after.actions).toEqual(before.actions);
        expect(after.artifact_workflow_reviews).toEqual(before.artifact_workflow_reviews);
    });

    it('keeps the legacy action adjudication handler independent of orientation review parameters', async () => {
        seed((tables) => {
            tables.operator_grants.find((g) => g.auth_user_id === 'wc').session_id = 'unified';
            tables.actions.push({ id: 'legacy-action', session_id: 'unified', team: 'blue', artifact_type: 'action', status: 'submitted' });
        });
        identity('wc');
        const result = await api.rpc('operator_adjudicate_action', { requested_action_id: 'legacy-action' });
        expect(result.error).toBeNull();
        expect(result.data).toMatchObject({ id: 'legacy-action', status: 'adjudicated' });
    });

    it('rejects wrong region/session/revision/type, direct writes and stale or revoked shared seats', async () => {
        const action = (await handoff('europe')).data;
        identity('shared-fac');
        for (const changed of [{ requested_session_id: 'pairs' }, { requested_delegation_id: 'asian_pacific' },
            { requested_expected_revision: 2 }, { requested_expected_row_version: 9 }]) {
            expect((await api.rpc('submit_regional_orientation', { ...params(action), ...changed })).error).toBeTruthy();
        }
        expect((await api.from('actions').update({ status: 'submitted' }).eq('id', action.id)).error.code).toBe('42501');
        expect((await api.from('requests').insert({ session_id: 'shared', team: 'green', delegation_id: 'europe', query: 'denied' })).error.code).toBe('42501');
        seed((tables) => tables.actions.push({ ...action, id: 'proposal', artifact_type: 'proposal', ally_contingencies: 'Proposal Details' }));
        expect((await api.rpc('submit_regional_orientation', { ...params(action), requested_action_id: 'proposal' })).error.code).toBe('42501');
        identity('shared-europe');
        expect((await api.rpc('handoff_regional_orientation', { ...params(action), requested_details: 'RFI Details', requested_goal: 'spoof' })).error.code).toBe('23514');
        for (const change of [{ heartbeat_at: new Date(Date.now() - 91000).toISOString() }, { revoked_at: new Date().toISOString(), is_active: false }]) {
            seed((tables) => Object.assign(tables.session_participants.find((s) => s.role === 'green_shared_facilitator'), change));
            expect((await submit(action)).error.code).toBe('42501');
        }
    });
});

describe('GC05 completion ownership and compatibility', () => {
    const row = (team, delegation_id = null) => ({ session_id: 's', team, delegation_id, status: 'submitted',
        ally_contingencies: `Strategic Orientation Details\nTeam: ${team}` });
    it('retains four-team unified and historical NULL topology completion', () => {
        for (const topology of [1, null]) expect(getStrategicOrientationCompletion(['blue','green','red','industry'].map((t) => row(t)),
            { id: 's', session_topology_version: topology }).complete).toBe(true);
    });
    it('does not let duplicate AP, foreign sessions, deleted or envelope-spoofed records fill Europe', () => {
        const actions = [row('blue'), row('red'), row('industry'), row('green','asian_pacific'), row('green','asian_pacific'),
            { ...row('green','europe'), session_id: 'other' }, { ...row('green','europe'), is_deleted: true },
            { ...row('green','asian_pacific'), ally_contingencies: 'Strategic Orientation Details\nTeam: green:europe' }];
        expect(getStrategicOrientationCompletion(actions, { id:'s', session_topology_version: 2 }).missingTeams).toEqual(['green:europe']);
    });
});
