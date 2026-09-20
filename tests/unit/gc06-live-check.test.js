import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { makeManifest, roles, validate, setupSql, cleanupSql, guard, assertCleanup, assertSeat, assertBlockedMutation, denied, payload, writeArgs, rows } from '../../scripts/gc06-live-contract.mjs';
import { cleanup } from '../../scripts/gc06-live-check.mjs';
import { raceSql, assertRace, runRace } from '../../scripts/gc06-live-race.mjs';
import { assertSource, assertDatabase, assertAsset, sha } from '../../scripts/gc06-live-provenance.mjs';
import { workflow } from '../../scripts/gc06-live-workflow.mjs';

const make = () => {
    const m = makeManifest('abcdefghijklmnopqrst', 'https://example.test/Fractured-Order/');
    for (const s of m.sessions) s.actors = roles(s.model).map(role => {
        const userId = randomUUID(); return { role, userId, clientId: `gc06-${userId}`, sessionId: s.id };
    });
    return m;
};
const ok = data => ({ status: 201, data });
const history = () => ({ count: 3, digest: 'unchanged' });
const state = (m, archived = false) => m.sessions.map(s => ({ id: s.id, status: archived ? 'archived' : 'active',
    active_seats: archived ? 0 : s.actors.length, grants: archived ? 0 : 3,
    actions: history(), communications: history(), artifact_workflow_reviews: history(), action_logs: history(),
    research_history: history(), closure_events: archived ? 1 : 0 }));
const receipt = (side, artifact, patch = {}) => ok([{ receipt: { result: side === 'a' ? 'PASS: A observed B blocked' : 'PASS: regions',
    connection_a: 112, connection_b: 113, waited_ms: 1100, artifact, ...patch } }]);
const artifact = (m, region = 'asian_pacific') => ({ id: randomUUID(), session_id: m.sessions[0].id, delegation_id: region,
    revision_number: 1, row_version: 1, workflow_state: 'draft', idempotency_key: `gc06:${region}:synthetic` });

describe('GC06 fixture and authority containment (no network/SQL execution)', () => {
    it('configures only fresh synthetic shared, paired and unified sessions before joins', () => {
        const m = make(); validate(m);
        const sql = setupSql(m);
        expect(new Set(m.sessions.flatMap(s => s.actors.map(a => a.userId))).size).toBe(18);
        expect(sql).toContain('configure_session_green_shared_facilitator');
        expect(sql.match(/SELECT public.configure_session_green_topology/g)).toHaveLength(2);
        expect(sql).toContain('model must be configured before joins');
        expect(sql).not.toContain('claim_session_role_seat(');
        expect(sql).toContain('not exercise approval');
        expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY|ALTER (?:TABLE|FUNCTION)|CREATE (?:TABLE|FUNCTION)/i);
        expect(sql.indexOf('pg_advisory_xact_lock(174016')).toBeLessThan(sql.indexOf('INSERT INTO public.sessions'));
    });
    it.each(['name', 'code', 'id'])('rejects modified fixture %s before constructing cleanup SQL', field => {
        const m = make(); m.sessions[0][field] = 'an existing exercise';
        expect(() => cleanupSql(m)).toThrow();
    });
    it('rejects duplicate Auth identities and incomplete seat sets', () => {
        const m = make(); m.sessions[0].actors[0] = { ...m.sessions[0].actors[1], role: m.sessions[0].actors[0].role };
        expect(() => validate(m)).toThrow(/distinct/);
        m.sessions[0].actors.pop(); expect(() => validate(m)).toThrow(/missing/);
    });
    it('guards frozen roster, protected status and ownership; NULL/global grants fail closed', () => {
        const m = make(), sql = cleanupSql(m);
        expect(guard(m)).toContain('snapshot=');
        expect(guard(m)).toContain('AND NOT is_protected');
        expect(sql).toContain('IS NOT TRUE');
        expect(sql).toContain('archive_live_demo_session');
        expect(sql).not.toMatch(/DELETE FROM public\.(sessions|actions|communications|participants|research_)/);
    });
    it('pins the synthetic represented roster to the approved contract without adding members', () => {
        const contract = JSON.parse(readFileSync(new URL('../../docs/architecture/green-regional-contract.json', import.meta.url), 'utf8'));
        const sql = setupSql(make());
        for (const region of ['asian_pacific', 'europe']) expect(sql).toContain(`"${region}":${JSON.stringify(contract.roster.approved_members[region])}`);
    });
    it('keeps required narrative fields and optimistic concurrency inputs', () => {
        const m = make(), a = artifact(m), args = writeArgs(m.sessions[0], 'asian_pacific', 'submit', a);
        expect(args.requested_expected_revision).toBe(1);
        expect(args.requested_expected_row_version).toBe(1);
        expect(args.requested_payload).toEqual({});
        const draft = payload('europe');
        for (const field of ['Originators: ["UK"]', 'Intended Partners:', 'Focus Sectors:', 'Supply Chain Focus Decision:',
            'Supply Chain Areas:', 'Timing And Conditions:', 'Scribe Handoff: Draft']) expect(draft.ally_contingencies).toContain(field);
    });
    it('does not count missing RPCs, HTTP failures or unrelated errors as authorization denials', () => {
        denied({ status: 403, data: { code: '42501' } });
        for (const response of [{ status: 200, data: [] }, { status: 404, data: { code: 'PGRST202' } },
            { status: 500, data: { code: '42501' } }, { status: 400, data: { code: '42703' } }])
            expect(() => denied(response)).toThrow();
        expect(rows(ok([]))).toEqual([]); // Management API POST may return 201.
    });
    it('accepts the historical unified claim shape and rejects changed regional authority on rejoin', () => {
        const m = make(), s = m.sessions[0], actor = s.actors[0];
        const seat = { id: randomUUID(), participant_id: randomUUID(), session_id: s.id, role: actor.role, client_id: actor.clientId,
            delegation_id: 'asian_pacific', green_seat_model: 'shared_facilitator_v1', is_active: true, revoked_at: null };
        actor.seat = seat; assertSeat(s, actor, seat);
        for (const patch of [{ delegation_id: 'europe' }, { id: randomUUID() }, { participant_id: randomUUID() },
            { green_seat_model: 'regional_pairs_v1' }, { client_id: 'foreign' }, { is_active: false }, { revoked_at: 'now' }])
            expect(() => assertSeat(s, actor, { ...seat, ...patch })).toThrow();
        const old = m.sessions[2], oldActor = old.actors[0];
        expect(() => assertSeat(old, oldActor, { id: randomUUID(), participant_id: randomUUID(), session_id: old.id,
            role: oldActor.role, client_id: oldActor.clientId, is_active: true })).not.toThrow();
    });
    it('requires unchanged persisted state even when RLS reports a zero-row update or permission error', () => {
        const before = { id: randomUUID(), delegation_id: 'europe', goal: 'unchanged' };
        for (const response of [ok([]), { status: 403, data: { code: '42501' } }]) {
            assertBlockedMutation(response, before, { ...before });
            expect(() => assertBlockedMutation(response, before, { ...before, goal: 'changed' })).toThrow();
        }
        expect(() => assertBlockedMutation(ok([before]), before, before)).toThrow();
    });
});

describe('GC06 cleanup receipts', () => {
    it('independently verifies archive, grant revocation, history and closure audit', async () => {
        const m = make(), before = state(m), after = state(m, true);
        const send = vi.fn().mockResolvedValueOnce(ok(m.sessions.map(s => ({ id: s.id }))))
            .mockResolvedValueOnce(ok(before)).mockResolvedValueOnce(ok(after)).mockResolvedValueOnce(ok(after));
        expect((await cleanup(m, send)).passed).toBe(true);
        expect(send).toHaveBeenCalledTimes(4);
        expect(send.mock.calls[0][1]).toContain('pg_advisory_xact_lock(174016');
        expect(send.mock.calls[3][0]).toBe('cleanup-independent-confirmation');
    });
    it('will not archive partial or foreign fixture sets', async () => {
        const m = make();
        for (const data of [[{ id: m.sessions[0].id }], [{ id: randomUUID() }]]) {
            const send = vi.fn(async () => ok(data));
            await expect(cleanup(m, send)).rejects.toThrow(); expect(send).toHaveBeenCalledTimes(1);
        }
    });
    it('confirms absent fixtures also have no roster or operator authority left over', async () => {
        const m = make(), send = vi.fn().mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([{ rosters: 0, grants: 1 }]));
        await expect(cleanup(m, send)).rejects.toThrow(/leftover/);
    });
    it.each(['status', 'active_seats', 'grants', 'actions', 'communications', 'artifact_workflow_reviews', 'action_logs', 'research_history', 'closure_events'])(
        'rejects a damaged cleanup receipt: %s', field => {
            const m = make(), after = state(m, true); after[0][field] = 'invalid';
            expect(() => assertCleanup(m, state(m), after)).toThrow();
        });
    it('permits an already archived recovery without inventing another closure event', () => {
        const m = make(), before = state(m, true); expect(() => assertCleanup(m, before, state(m, true))).not.toThrow();
    });
});

describe('GC06 actual contention evidence', () => {
    it('requires two distinct matching backend PIDs, observed blocking and measurable waiting', () => {
        const m = make(), x = artifact(m), y = artifact(m, 'europe');
        expect(assertRace('regions', receipt('a', x), receipt('b', y))).toHaveLength(2);
        for (const patch of [{ connection_b: 112 }, { connection_a: 999 }, { waited_ms: 0 }, { waited_ms: null }, { result: 'PASS' }])
            expect(() => assertRace('regions', receipt('a', x), receipt('b', y, patch))).toThrow();
        expect(() => assertRace('regions', receipt('a', x), receipt('b', { ...y, id: x.id }))).toThrow(/collided/);
    });
    it('distinguishes an idempotent retry from a stale submission rejection', () => {
        const m = make(), x = artifact(m);
        expect(assertRace('retry', receipt('a', x), receipt('b', x, { result: 'PASS: retry' }))).toEqual([x]);
        expect(() => assertRace('retry', receipt('a', x), receipt('b', { ...x, row_version: 2 }, { result: 'PASS: retry' }))).toThrow();
        const submitted = { ...x, row_version: 2, workflow_state: 'submitted_to_white_cell' };
        expect(assertRace('stale', receipt('a', submitted), receipt('b', null, { result: 'PASS: stale' }), x)).toEqual([submitted]);
        expect(() => assertRace('stale', receipt('a', { ...submitted, row_version: 3 }), receipt('b', null, { result: 'PASS: stale' }), x)).toThrow();
    });
    it('constructs competing authenticated RPC calls with a server-observed blocking handshake', () => {
        const m = make(), queries = raceSql(m, 'regions');
        expect(queries.a).toContain('pg_blocking_pids(peer)');
        expect(queries.a).toContain('pg_sleep(1)');
        expect(queries.b).toContain('gc06.wait_ms');
        expect(queries.a).toContain('SET LOCAL ROLE authenticated');
        expect(queries.b).toContain("'europe'");
        expect(queries.a).toContain('COMMIT;');
        expect(queries.a).not.toContain('service_role');
        expect(() => raceSql(m, 'stale', { ...artifact(m), session_id: randomUUID() })).toThrow();
    });
    it('settles BOTH dispatched connections before exposing a transport failure to cleanup', async () => {
        const m = make(); let release;
        const pending = new Promise(resolve => { release = resolve; });
        const send = vi.fn((label) => label.endsWith('-A') ? Promise.reject(new Error('transport lost')) : pending);
        let settled = false;
        const task = runRace(m, 'regions', undefined, send, async () => {}).catch(e => { settled = true; return e; });
        await Promise.resolve(); await Promise.resolve();
        expect(send).toHaveBeenCalledTimes(2); expect(settled).toBe(false);
        release(ok([])); expect(await task).toBeInstanceOf(Error);
        expect(send).toHaveBeenCalledTimes(2);
    });
    it('rejects successful-looking receipts when independent persisted state differs', async () => {
        const m = make(), x = artifact(m), y = artifact(m, 'europe');
        const send = vi.fn(async label => label.endsWith('-A') ? receipt('a', x) : label.endsWith('-B') ? receipt('b', y)
            : ok([x, { ...y, delegation_id: 'asian_pacific' }]));
        await expect(runRace(m, 'regions', undefined, send, async () => {})).rejects.toThrow(/committed state/);
        expect(send.mock.calls[2][1]).toContain('idempotency_key IN');
    });
});

describe('GC06 provenance and hosted API contracts', () => {
    it('requires exact deployed bytes and a successful response, not just an accessible URL', () => {
        const bytes = Buffer.from('candidate bundle'), hash = sha(bytes);
        assertAsset('assets/app.js', hash, 200, bytes);
        expect(() => assertAsset('assets/app.js', hash, 200, Buffer.from('older bundle'))).toThrow();
        expect(() => assertAsset('assets/app.js', hash, 404, bytes)).toThrow();
    });
    it('fails closed on source drift, missing prerequisites and disabled RLS', () => {
        expect(() => assertSource({ head: 'a', digest: 'x' }, { head: 'a', digest: 'y' })).toThrow();
        expect(() => assertSource({ head: 'a', digest: 'x' }, { head: 'b', digest: 'x' })).toThrow();
        const database = { database_name: 'postgres', tables: Array.from({ length: 7 }, () => ({ rls: true })), policies: [{}],
            functions: ['write_regional_proposal', 'append_proposal_thread_message', 'configure_session_green_shared_facilitator',
                'operator_forward_proposal_response', 'handoff_regional_orientation', 'submit_regional_orientation', 'archive_live_demo_session'].map(n => ({ signature: `${n}(uuid)` })) };
        assertDatabase(database);
        expect(() => assertDatabase({ ...database, functions: [] })).toThrow(/missing/);
        database.tables[0].rls = false; expect(() => assertDatabase(database)).toThrow(/RLS/);
    });
    it('uses the installed White Cell approval argument and retains legacy author/reviewer routing', async () => {
        const m = make(), s = m.sessions[2], a = { ...artifact(m), session_id: s.id, delegation_id: null };
        const request = vi.fn(async () => ok([a]));
        const rpc = vi.fn(async () => { throw new Error('stop at approval'); });
        await expect(workflow(s, { request, rpc, fresh: async () => {}, record: async () => {} })).rejects.toThrow('stop at approval');
        expect(request.mock.calls[0][0].role).toBe('green_facilitator');
        expect(request.mock.calls[0][3].proposal_recipient_team).toBe('blue');
        expect(request.mock.calls[1][0].role).toBe('green_scribe');
        expect(rpc.mock.calls[0][1]).toBe('operator_review_proposal');
        expect(rpc.mock.calls[0][2]).toHaveProperty('requested_adjudication_notes');
        expect(rpc.mock.calls[0][2]).not.toHaveProperty('requested_reviewer_notes');
    });
    it('waits for both parallel draft responses before propagating one failure', async () => {
        const s = make().sessions[0]; let release, finished = false;
        const waiting = new Promise(resolve => { release = resolve; });
        const rpc = vi.fn((actor) => actor.role.includes('asian_pacific') ? Promise.reject(new Error('failed draft')) : waiting);
        const task = workflow(s, { rpc, request: vi.fn(), record: vi.fn(), fresh: vi.fn() }).catch(e => { finished = true; return e; });
        await Promise.resolve(); expect(rpc).toHaveBeenCalledTimes(2); expect(finished).toBe(false);
        release(ok([])); expect(await task).toBeInstanceOf(Error);
    });
});
