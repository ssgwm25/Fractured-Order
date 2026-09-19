import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { makeManifest, validate, seedSql, raceSql, assertRaceEvidence, verifyRace, expectDenial,
    MANAGEMENT_PROBE, assertManagementReady, cleanupFixtures, assertDirectProgressionDenied, rejoinExpiredSeat } from '../../scripts/gc05-live-contract.mjs';
import { cleanupSql, fixtureGuard, archivedComplete, fixtureSessions } from '../../scripts/gc04-live-contract.mjs';

const make = () => makeManifest('abcdefghijklmnopqrst', randomUUID());
const action = m => ({ id: randomUUID(), session_id: m.fixture.sessionId, delegation_id: 'europe', status: 'submitted', revision_number: 2 });
const receipt = (side, changes = {}) => ({ status: 201, data: [{ receipt: {
    result: side === 'A' ? 'PASS: return observed progression blocked' : 'PASS: progression denied after committed return',
    connection_a: 123, connection_b: 456, waited_ms: 1000, ...changes
} }] });
const committed = { status: 201, data: [{ result: 'GC05 committed return and blocked progression' }] };

describe('GC05 hosted rehearsal containment and evidence (no network or SQL execution)', () => {
    const expiredActor = (role = 'green_europe_scribe', delegation = 'europe') => ({
        role, clientId: 'gc05-synthetic-client', userId: randomUUID(), seat: {
            id: randomUUID(), participant_id: randomUUID(), session_id: randomUUID(), role, delegation_id: delegation,
            green_seat_model: 'shared_facilitator_v1', revoked_at: null, is_active: true
        }
    });
    const rejoined = actor => ({ ...actor.seat, client_id: actor.clientId, claim_status: 'rejoined' });
    it.each([
        ['green_europe_scribe', 'europe'], ['green_shared_facilitator', null], ['whitecell_lead', null]
    ])('rejoins the expired %s seat through claim, retaining actor and scope', async (role, region) => {
        const actor = expiredActor(role, region), seat = rejoined(actor);
        const rpc = vi.fn(async () => ({ status: 200, data: seat }));
        expect(await rejoinExpiredSeat(actor, actor.seat.session_id, rpc)).toEqual(seat);
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith(actor, 'claim_session_role_seat', {
            requested_session_id: actor.seat.session_id, requested_role: role,
            requested_name: 'GC05 synthetic rehearsal', requested_client_id: actor.clientId, requested_timeout_seconds: 90
        });
    });
    it.each([
        { id: randomUUID() }, { participant_id: randomUUID() }, { session_id: randomUUID() },
        { role: 'blue_scribe' }, { delegation_id: 'asian_pacific' }, { green_seat_model: 'regional_pairs_v1' },
        { is_active: false }, { revoked_at: '2026-09-19T00:00:00Z' },
        { client_id: 'different-client' }, { claim_status: 'claimed' }
    ])('rejects changed or revoked identity in a rejoin receipt: %j', patch => {
        const actor = expiredActor();
        return expect(rejoinExpiredSeat(actor, actor.seat.session_id,
            async () => ({ status: 200, data: { ...rejoined(actor), ...patch } }))).rejects.toThrow('same identity and scope');
    });
    it('propagates revoked-seat rejection without fallback or modifying the actor', async () => {
        const actor = expiredActor(), prior = structuredClone(actor);
        const rpc = vi.fn(async () => ({ status: 403, data: { code: '42501', message: 'GC03_SEAT_REVOKED' } }));
        await expect(rejoinExpiredSeat(actor, actor.seat.session_id, rpc)).rejects.toThrow('403/42501');
        expect(actor).toEqual(prior);
        expect(rpc).toHaveBeenCalledTimes(1);
    });
    const sessionId = randomUUID(), stateId = randomUUID();
    const state = { status: 200, data: [{ id: stateId, session_id: sessionId, move: 1, phase: 1 }] };
    it.each([
        [{ status: 200, data: [] }, 'rls-zero-rows'],
        [{ status: 400, data: { code: '23514' } }, 'constraint-denial'],
        [{ status: 403, data: { code: '42501' } }, 'permission-denial']
    ])('accepts a direct-write denial only with readable unchanged state: %j', (response, outcome) => {
        expect(assertDirectProgressionDenied(response, state, state, sessionId)).toMatchObject({
            outcome, before: state.data[0], after: state.data[0]
        });
    });
    it.each([
        { status: 200, data: [{ move: 3, phase: 5 }] }, { status: 200, data: null },
        { status: 204, data: [] }, { status: 500, data: { code: '23514' } },
        { status: 401, data: { code: '42501' } }, { status: 400, data: { code: 'PGRST202' } }
    ])('rejects successful mutations, missing bodies and unrelated errors: %j', response => {
        expect(() => assertDirectProgressionDenied(response, state, state, sessionId)).toThrow();
    });
    it.each([
        { status: 200, data: [] }, { status: 403, data: null },
        { status: 200, data: [{ ...state.data[0], move: 3 }] },
        { status: 200, data: [{ ...state.data[0], phase: 5 }] },
        { status: 200, data: [{ ...state.data[0], session_id: randomUUID() }] },
        { status: 200, data: [{ ...state.data[0], id: randomUUID() }] }
    ])('does not pass a zero-row response without unchanged persisted state: %j', after => {
        expect(() => assertDirectProgressionDenied({ status: 200, data: [] }, state, after, sessionId)).toThrow();
        expect(() => assertDirectProgressionDenied({ status: 400, data: { code: '23514' } }, state, after, sessionId)).toThrow();
    });
    it('requires the pre-write state rather than inferring it from the response', () => {
        expect(() => assertDirectProgressionDenied({ status: 200, data: [] }, null, state, sessionId)).toThrow();
    });
    it('requires a successful read-only management probe before fixture setup', () => {
        expect(MANAGEMENT_PROBE).toBe('SELECT 1 AS gc05_management_ready;');
        expect(() => assertManagementReady({ status: 201, data: [{ gc05_management_ready: 1 }] })).not.toThrow();
        for (const response of [
            { status: 401, data: { message: 'JWT could not be decoded' } },
            { status: 500, data: [{ gc05_management_ready: 1 }] },
            { status: 201, data: [] }, { status: 201, data: [{ unrelated: 1 }] }
        ]) expect(() => assertManagementReady(response)).toThrow('No fixture setup was attempted');
    });
    it('verifies absence after rejected setup without attempting archival', async () => {
        const m = make(), send = vi.fn(async () => ({ status: 201, data: [] }));
        const result = await cleanupFixtures(m, send);
        expect(result.outcome).toBe('absent');
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toBe('cleanup-presence');
        expect(send.mock.calls[0][1]).toContain(m.fixture.sessionId);
        expect(send.mock.calls[0][1]).toContain(m.fixture.raceSessionId);
        expect(send.mock.calls[0][1]).not.toMatch(/INSERT|UPDATE|DELETE/);
    });
    it.each(['unauthorized', 'malformed', 'partial', 'foreign', 'duplicate'])('never treats %s presence as successful cleanup', async mode => {
        const m = make(), id = m.fixture.sessionId;
        const response = mode === 'unauthorized' ? { status: 401, data: [] }
            : { status: 201, data: mode === 'malformed' ? null : mode === 'partial' ? [{ id }]
                : mode === 'foreign' ? [{ id: randomUUID() }] : [{ id }, { id }] };
        const send = vi.fn(async () => response);
        await expect(cleanupFixtures(m, send)).rejects.toThrow();
        expect(send).toHaveBeenCalledTimes(1);
    });
    it('archives only the verified complete fixture set and checks both resulting rows', async () => {
        const m = make(), rows = fixtureSessions(m.fixture).map(({ id }) => ({ id, status: 'archived' }));
        const send = vi.fn(async label => ({ status: 201, data: label === 'cleanup-presence' ? rows.map(({ id }) => ({ id })) : rows }));
        expect((await cleanupFixtures(m, send)).outcome).toBe('archived');
        expect(send.mock.calls[1][1]).toBe(cleanupSql(m.fixture));
        for (const data of [[], [rows[0]], [rows[0], rows[0]]]) {
            await expect(cleanupFixtures(m, async label => ({ status: 201,
                data: label === 'cleanup-presence' ? rows : data }))).rejects.toThrow('both fixtures');
        }
    });
    it('keeps GC05 evidence separate and retains guarded archival of both fixture sessions', () => {
        const m = make();
        expect(m.stage).toBe('GC-05-orientations');
        expect(m.target).toBe('hosted-auth-rpc');
        expect(m.fixture.stage).toBe('GC-04A-foundation'); // Reused fixture format, not a foundation pass.
        const sql = seedSql(m), cleanup = cleanupSql(m.fixture);
        expect(sql.indexOf(fixtureGuard(m.fixture))).toBeLessThan(sql.indexOf('INSERT INTO public.actions'));
        expect(cleanup).toContain(fixtureGuard(m.fixture));
        expect(cleanup.match(/archive_live_demo_session/g)).toHaveLength(2);
        expect(sql + cleanup).not.toMatch(/DELETE FROM public\.(actions|sessions|session_participants)|DISABLE TRIGGER|session_replication_role/);
        const rows = fixtureSessions(m.fixture).map(({ id }) => ({ id, status: 'archived' }));
        expect(archivedComplete(rows, m.fixture)).toBe(true);
        expect(archivedComplete([rows[0], rows[0]], m.fixture)).toBe(false);
        expect(archivedComplete(rows.slice(1), m.fixture)).toBe(false);
    });
    it('rejects altered fixture provenance, duplicate IDs and injectable identifiers', () => {
        const m = make();
        for (const patch of [{ stage: 'GC-04A-foundation' }, { rfiId: m.fixture.sessionId }, { parentId: "'; DELETE FROM public.sessions;--" }]) {
            expect(() => validate({ ...m, ...patch })).toThrow();
        }
        expect(() => seedSql({ ...m, fixture: { ...m.fixture, name: 'real exercise' } })).toThrow();
    });
    it.each([
        { session_id: randomUUID() }, { delegation_id: 'asian_pacific' }, { status: 'draft' },
        { revision_number: '2; SELECT 1' }, { revision_number: 0 }, { id: "'; SELECT 1;--" }
    ])('rejects a race artifact outside the submitted fixture contract: %j', patch => {
        const m = make();
        expect(() => raceSql(m, { ...action(m), ...patch })).toThrow();
    });
    it('checks persisted ownership before returning, observes actual blocking, and verifies committed state', () => {
        const m = make(), a = action(m), sql = raceSql(m, a);
        for (const query of Object.values(sql)) {
            expect(query).toContain(fixtureGuard(m.fixture));
            expect(query).not.toMatch(/DISABLE|session_replication_role|SECURITY DEFINER/);
        }
        expect(sql.a.indexOf('GC05 race artifact mismatch')).toBeLessThan(sql.a.indexOf('SELECT public.operator_review_artifact'));
        expect(sql.a).toContain('pg_blocking_pids(peer)');
        expect(sql.b).toContain("position('green:europe' IN SQLERRM)=0");
        expect(sql.b).toContain('PERFORM public.operator_update_game_state');
        expect(sql.verify).toContain('AND move=1 AND phase=1');
        expect(sql.verify).toContain('revision_number=3 AND orientation_handoff_revision IS NULL');
        expect(sql.verify).toContain("'[\"green:europe\"]'::jsonb");
    });
    it.each([
        { connection_b: 123 }, { connection_a: 999 }, { waited_ms: 20 }, { waited_ms: 'NaN' },
        { result: 'PASS: same seat has one winner' }
    ])('rejects unrelated or insufficient race receipts: %j', changes => {
        expect(() => assertRaceEvidence(receipt('A'), receipt('B', changes))).toThrow();
    });
    it('starts both requests before awaiting and requires an independent committed receipt', async () => {
        const m = make(), pending = {}, report = {};
        const send = vi.fn(label => label === 'race-committed' ? Promise.resolve(committed) : new Promise(resolve => {
            pending[label] = resolve;
            if (pending['race-A'] && pending['race-B']) {
                pending['race-A'](receipt('A')); pending['race-B'](receipt('B'));
            }
        }));
        await verifyRace(m, action(m), send, report);
        expect(send.mock.calls.map(c => c[0])).toEqual(['race-B', 'race-A', 'race-committed']);
        expect(report.race.passed).toBe(true);
        expect(report.race.committed).toEqual(committed);
    });
    it('settles both requests and retains both failures before allowing cleanup', async () => {
        const m = make(), report = {};
        let finishA;
        const send = vi.fn(label => label === 'race-B' ? Promise.reject(new Error('B failed'))
            : new Promise(resolve => { finishA = resolve; }));
        const result = verifyRace(m, action(m), send, report);
        const assertion = expect(result).rejects.toThrow('both race requests');
        await Promise.resolve(); await Promise.resolve();
        expect(report.race.outcomes).toBeUndefined();
        finishA(receipt('A'));
        await assertion;
        expect(report.race.outcomes.a.status).toBe('fulfilled');
        expect(report.race.outcomes.b.error).toBe('B failed');
        expect(report.race.passed).toBe(false);
        expect(send).toHaveBeenCalledTimes(2);
    });
    it('does not pass contention when independent committed-state verification is absent', async () => {
        const m = make(), report = {};
        await expect(verifyRace(m, action(m), async label => label === 'race-committed'
            ? { status: 201, data: [] } : receipt(label.endsWith('A') ? 'A' : 'B'), report)).rejects.toThrow('committed race result');
        expect(report.race.passed).toBe(false);
    });
    it.each([
        { status: 200, data: [] }, { status: 500, data: { code: '42501' } },
        { status: 403, data: { code: 'PGRST202' } }, { status: 403, data: null }
    ])('does not count success, server failure or a missing RPC as authorization denial: %j', response => {
        expect(() => expectDenial(response, '42501', 'scope')).toThrow();
    });
    it('accepts the actual permission and stale-revision denial contracts', () => {
        expect(() => expectDenial({ status: 403, data: { code: '42501' } }, '42501', 'scope')).not.toThrow();
        expect(() => expectDenial({ status: 409, data: { code: 'PT409' } }, 'PT409', 'revision')).not.toThrow();
    });
});
