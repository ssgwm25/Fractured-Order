import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createE2EMockSupabaseClient } from './supabaseMock.js';

const stateKey = 'esg_e2e_backend_state';
let api;
function identity(id) {
    localStorage.setItem('esg_e2e_auth_session', JSON.stringify({ user: { id } }));
}
function seed(change) {
    const state = JSON.parse(localStorage.getItem(stateKey));
    change(state.tables);
    localStorage.setItem(stateKey, JSON.stringify(state));
}
function claim(user, role, session = 'regional', extra = {}) {
    identity(user);
    return api.rpc('claim_session_role_seat', { requested_session_id: session, requested_role: role,
        requested_name: user, requested_client_id: `client-${user}`, ...extra });
}
function action(delegation = 'asian_pacific', extra = {}) {
    return { session_id: 'regional', team: 'green', delegation_id: delegation, move: 1, phase: 1,
        mechanism: 'Proposal', artifact_type: 'proposal', status: 'draft', goal: 'Synthetic proposal', ...extra };
}

describe('GC-03 direct API authorization (mock; SQL evidence is separate)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));
        const values = new Map();
        globalThis.localStorage = { getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
        globalThis.__ESG_E2E_TEST_CONFIG__ = { operatorAccessCode: 'test-only' };
        api = createE2EMockSupabaseClient();
        localStorage.setItem(stateKey, JSON.stringify({ counters: {}, tables: { sessions: ['regional', 'other', 'legacy'].map((id) => ({
            id, status: 'active', session_classification: 'live_exercise', is_protected: false,
            session_topology_version: id === 'legacy' ? 1 : 2,
            green_roster_version: id === 'legacy' ? null : 'synthetic-test-only',
            green_roster_snapshot: id === 'legacy' ? null : { fixture: true }
        })) } }));
    });
    afterEach(() => {
        vi.useRealTimers();
        delete globalThis.localStorage;
        delete globalThis.__ESG_E2E_TEST_CONFIG__;
    });

    it('serializes contending identities with one winner and allows the other region independently', async () => {
        const first = claim('ap1', 'green_asian_pacific_scribe');
        const second = claim('ap2', 'green_asian_pacific_scribe');
        const europe = claim('eu', 'green_europe_scribe');
        const results = await Promise.all([first, second, europe]);
        expect(results.filter((result) => !result.error)).toHaveLength(2);
        expect(results[0].data.delegation_id).toBe('asian_pacific');
        expect(results[1].error.message).toContain('full');
        expect(results[2].data.delegation_id).toBe('europe');
    });

    it('rejects incompatible topology, missing approval and stolen client identity', async () => {
        expect((await claim('a', 'green_europe_scribe', 'legacy')).error?.message).toBe('GC03_TOPOLOGY_ROLE_MISMATCH');
        expect((await claim('a', 'green_scribe')).error?.message).toBe('GC03_TOPOLOGY_ROLE_MISMATCH');
        await claim('a', 'green_europe_scribe');
        expect((await claim('b', 'green_asian_pacific_scribe', 'regional', { requested_client_id: 'client-a' })).error?.message).toBe('GC03_CLIENT_IDENTITY_CONFLICT');
        seed((tables) => { tables.sessions.find((row) => row.id === 'other').green_roster_snapshot = null; });
        expect((await claim('b', 'green_europe_scribe', 'other')).error?.message).toBe('GC02_APPROVED_ROSTER_REQUIRED');
    });

    it('binds reads, edits and submission to the session seat, ignoring global role and spoofed scope', async () => {
        await claim('ap', 'green_asian_pacific_scribe');
        const created = await api.from('actions').insert(action()).select().single();
        expect(created.error).toBeNull();
        const id = created.data.id;
        seed((tables) => { tables.participants.find((row) => row.auth_user_id === 'ap').role = 'green_europe_facilitator'; });
        expect((await api.from('actions').insert(action('europe'))).error?.code).toBe('42501');
        expect((await api.from('actions').insert(action('asian_pacific', { session_id: 'other' }))).error?.code).toBe('42501');
        expect((await api.from('actions').update({ status: 'submitted' }).eq('id', id)).error?.code).toBe('42501');
        await claim('eu', 'green_europe_scribe');
        expect((await api.from('actions').select('*')).data).toEqual([]);
        expect((await api.from('actions').update({ goal: 'stolen' }).eq('id', id)).error?.code).toBe('42501');
        expect((await api.from('actions').delete().eq('id', id)).error?.code).toBe('42501');
        expect((await api.rpc('operator_review_artifact', { requested_artifact_id: id })).error?.code).toBe('42501');
    });

    it('permits only the semantic Facilitator to submit a forwarded regional draft and send an RFI', async () => {
        await claim('ap-scribe', 'green_asian_pacific_scribe');
        const created = await api.from('actions').insert(action('asian_pacific', { ally_contingencies: 'Scribe Handoff: forwarded' })).select().single();
        await claim('ap-facilitator', 'green_asian_pacific_facilitator');
        expect((await api.from('actions').update({ status: 'submitted' }).eq('id', created.data.id)).error).toBeNull();
        expect((await api.from('requests').insert({ session_id: 'regional', team: 'green', delegation_id: 'asian_pacific', query: 'Synthetic question' })).error).toBeNull();
        expect((await api.from('communications').insert({ session_id: 'regional', type: 'direct', to_role: 'white_cell',
            from_role: 'green_europe_facilitator', content: 'Spoof', metadata: { source_team: 'green' } })).error?.code).toBe('42501');
        identity('ap-scribe');
        expect((await api.from('requests').insert({ session_id: 'regional', team: 'green', delegation_id: 'asian_pacific', query: 'Not authorized' })).error?.code).toBe('42501');
    });

    it('closes proposal retry reads and derived evidence to the other region and session', async () => {
        await claim('ap', 'green_asian_pacific_facilitator');
        seed((tables) => {
            tables.communications.push({ id: 'root', session_id: 'regional', owner_team: 'green', delegation_id: 'europe',
                type: 'PROPOSAL_FORWARDED', from_role: 'white_cell', to_role: 'blue',
                metadata: { thread_id: 'eu-blue', source_team: 'green', recipient_team: 'blue' } });
            tables.communications.push({ id: 'retry', session_id: 'regional', owner_team: 'green', delegation_id: 'europe',
                type: 'PROPOSAL_RESPONSE_REVIEW', from_role: 'green_europe_facilitator', to_role: 'white_cell',
                metadata: { thread_id: 'eu-blue', client_message_id: 'retry-key', sender_team: 'green' } });
            tables.timeline.push({ id: 'private-timeline', session_id: 'regional', owner_team: 'green', delegation_id: 'europe' });
            tables.research_action_content.push({ id: 'copy', session_id: 'regional', team: 'green', delegation_id: 'europe' });
            tables.research_note.push({ note_id: 'eu-note', session_id: 'regional' });
            tables.research_note_revision.push({ note_id: 'eu-note', version: 1, content_text: 'private derived note' });
        });
        for (const table of ['communications', 'timeline', 'research_action_content', 'research_note_revision']) {
            expect((await api.from(table).select('*')).data).toEqual([]);
        }
        expect((await api.rpc('append_proposal_thread_message', { requested_parent_message_id: 'root', requested_content: 'spoof',
            requested_message_type: 'negotiation_message', requested_client_message_id: 'retry-key' })).error?.code).toBe('42501');
        identity('outsider');
        expect((await api.from('communications').select('*')).data).toEqual([]);
    });

    it('requires explicit stale rejoin, fixes timeout at 90 seconds and never revives a replaced lease', async () => {
        const seat = (await claim('ap', 'green_asian_pacific_scribe')).data;
        vi.advanceTimersByTime(2000);
        expect((await claim('attacker', 'green_asian_pacific_scribe', 'regional', { requested_timeout_seconds: 1 })).error?.message).toContain('full');
        vi.advanceTimersByTime(90000);
        identity('ap');
        expect((await api.rpc('heartbeat_session_role_seat', { requested_session_id: 'regional', requested_session_participant_id: seat.id })).error?.message).toBe('GC03_SEAT_REJOIN_REQUIRED');
        expect((await claim('ap', 'green_asian_pacific_scribe')).data.id).toBe(seat.id);
        await api.rpc('disconnect_session_role_seat', { requested_session_id: 'regional', requested_session_participant_id: seat.id });
        await claim('replacement', 'green_asian_pacific_scribe');
        expect((await claim('ap', 'green_asian_pacific_scribe')).error?.message).toBe('GC03_SEAT_REVOKED');
    });

    it('retains removed note authorship and denies heartbeat, claim and archived access', async () => {
        const seat = (await claim('note', 'green_europe_notetaker')).data;
        expect((await api.rpc('save_scoped_notetaker_data', { requested_session_id: 'regional', requested_move: 1, requested_phase: 1,
            requested_dynamics: {}, requested_external: {}, requested_observations: [], requested_expected_revision: 0 })).error).toBeNull();
        seed((tables) => tables.operator_grants.push({ auth_user_id: 'gm', surface: 'gamemaster' }));
        identity('gm');
        expect((await api.rpc('operator_remove_session_participant', { requested_session_id: 'regional', requested_session_participant_id: seat.id })).error).toBeNull();
        identity('note');
        expect((await api.from('scoped_notetaker_data').select('*')).data).toEqual([]);
        expect((await claim('note', 'green_europe_notetaker')).error?.message).toBe('GC03_SEAT_REVOKED');
        const state = JSON.parse(localStorage.getItem(stateKey));
        expect(state.tables.scoped_notetaker_data[0].session_participant_id).toBe(seat.id);
        expect(state.tables.session_participants.find((row) => row.id === seat.id).revoked_at).toBeTruthy();
        seed((tables) => { tables.sessions.find((row) => row.id === 'regional').status = 'archived'; });
        expect((await claim('new', 'green_asian_pacific_scribe')).error).toBeTruthy();
    });

    it('rejects a stale note revision with a terminal conflict and preserves the latest note', async () => {
        await claim('note', 'green_asian_pacific_notetaker');
        const save = (revision, text) => api.rpc('save_scoped_notetaker_data', {
            requested_session_id: 'regional', requested_move: 1, requested_phase: 1,
            requested_dynamics: { observation: text }, requested_external: {}, requested_observations: [],
            requested_expected_revision: revision
        });
        expect((await save(0, 'first')).error).toBeNull();
        const latest = await save(1, 'second');
        expect(latest.data.revision).toBe(2);
        expect((await save(1, 'stale overwrite')).error).toEqual({ code: 'PT409', message: 'GC02_NOTE_REVISION_CONFLICT' });
        expect((await api.from('scoped_notetaker_data').select('*')).data).toEqual([latest.data]);
    });

    it('keeps legacy normalization and inverted role permissions', async () => {
        const seat = await claim('legacy', 'Green_Facilitator\u200b', 'legacy');
        expect(seat.data.role).toBe('green_facilitator');
        expect((await api.rpc('green_semantic_role', { requested_session_id: 'legacy' })).data).toBe('scribe');
        expect((await api.from('actions').insert({ session_id: 'legacy', team: 'green', status: 'draft' })).error).toBeNull();
    });

    it('does not let regional or cross-session callers dispatch unscoped derived work', async () => {
        await claim('ap', 'green_asian_pacific_facilitator');
        expect((await api.functions.invoke('trigger-pli-adjudication', { body: { sessionId: 'regional' } })).error?.code).toBe('42501');
        expect((await api.functions.invoke('pli-report-narrative', { body: { sessionId: 'legacy', scope: 'simulation', factPack: { fixture: true } } })).error?.code).toBe('42501');
        seed((tables) => tables.operator_grants.push({ auth_user_id: 'gm', surface: 'gamemaster' }));
        identity('gm');
        expect((await api.functions.invoke('trigger-pli-adjudication', { body: { sessionId: 'legacy' } })).error).toBeNull();
        expect((await api.functions.invoke('trigger-pli-adjudication', { body: { sessionId: 'regional' } })).error?.code).toBe('42501');
    });
});
