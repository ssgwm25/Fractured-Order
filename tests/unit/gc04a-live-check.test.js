import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { manifest, setupSql, cleanupSql, fixtureGuard, fixtureSessions, archivedComplete, appUrl,
    SHARED_ROLES, AUTOMATED_CHECKS, SHARED_VIEW_CHECK, automatedComplete } from '../../scripts/gc04-live-contract.mjs';
import { raceSql, verifySharedRace } from '../../scripts/gc04a-live-race.mjs';
import { inspectDeployment } from '../../scripts/gc04-live-preflight.mjs';
import { readFileSync } from 'node:fs';

const make = () => manifest('abcdefghijklmnopqrst', 'https://example.test/Fractured-Order/', randomUUID(), { shared: true });
const receipt = (side, changes = {}) => ({ status: 200, data: [{ receipt: {
    result: side === 'A' ? 'PASS: A observed B blocked on its transaction' : 'PASS: same seat has one winner',
    connection_a: 111, connection_b: 222, waited_ms: 1000, ...changes
} }] });
const committed = { status: 200, data: [{ result: 'GC04A committed shared seat count is one' }] };

describe('GC04A live verification containment and evidence', () => {
    it.each([false, true])('keeps one operator grant per identity/surface through setup and archival (shared=%s)', shared => {
        const m = manifest('abcdefghijklmnopqrst', 'https://example.test/Fractured-Order/', randomUUID(), { shared });
        const insert = id => `INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id)
VALUES('${m.operatorId}','whitecell','whitecell_lead','${id}');`;
        const setupGrants = setupSql(m).match(/INSERT INTO public\.operator_grants\b[^;]+;/g);
        expect(setupGrants).toEqual([insert(m.sessionId)]);

        // Check the full grant lifecycle, including cleanup retries after an archive.
        // The installed index excludes session_id: simultaneous per-session grants fail.
        const cleanup = cleanupSql(m), ids = fixtureSessions(m).map(({ id }) => `'${id}'`).join(',');
        const operations = cleanup.match(/(?:INSERT INTO|DELETE FROM) public\.operator_grants\b[^;]+;|PERFORM public\.archive_live_demo_session\([^;]+;/g);
        expect(operations).toEqual([
            `DELETE FROM public.operator_grants WHERE auth_user_id='${m.operatorId}' AND surface='whitecell'
AND session_id IN (${ids}) AND role='whitecell_lead' AND team_id IS NULL;`,
            ...fixtureSessions(m).flatMap(({ id }) => [insert(id),
                `PERFORM public.archive_live_demo_session('${id}'::uuid);`,
                `DELETE FROM public.operator_grants WHERE auth_user_id='${m.operatorId}' AND surface='whitecell'
AND session_id='${id}' AND role='whitecell_lead' AND team_id IS NULL;`
            ])
        ]);
        for (const { id } of fixtureSessions(m)) {
            expect(cleanup).toContain(`IF EXISTS(SELECT 1 FROM public.sessions WHERE id='${id}' AND status='active')`);
        }
        expect(cleanup.trimStart().startsWith('BEGIN;')).toBe(true);
        expect(cleanup.match(/COMMIT;/g)).toHaveLength(1);
        expect(cleanup.lastIndexOf('DELETE FROM public.operator_grants')).toBeLessThan(cleanup.indexOf('COMMIT;'));
    });
    it.each([false, true])('guards fixture ownership and unrelated operator authority before cleanup (shared=%s)', shared => {
        const m = manifest('abcdefghijklmnopqrst', 'https://example.test/Fractured-Order/', randomUUID(), { shared });
        const cleanup = cleanupSql(m), ids = fixtureSessions(m).map(({ id }) => `'${id}'`).join(',');
        expect(cleanup).toContain(`WHERE auth_user_id='${m.operatorId}' AND surface='whitecell'
AND (session_id IS NULL OR session_id NOT IN (${ids})
OR role IS DISTINCT FROM 'whitecell_lead' OR team_id IS NOT NULL)`);
        const guardEnd = cleanup.indexOf('GC04 operator grant mismatch');
        expect(guardEnd).toBeGreaterThan(cleanup.indexOf(fixtureGuard(m)) + fixtureGuard(m).length);
        expect(guardEnd).toBeLessThan(cleanup.indexOf('DELETE FROM public.operator_grants'));
        expect(guardEnd).toBeLessThan(cleanup.indexOf('INSERT INTO public.operator_grants'));
        expect(setupSql(m) + cleanup).not.toMatch(/ON CONFLICT|(?:DROP|ALTER)\s+(?:INDEX|TABLE)|DISABLE TRIGGER/i);
    });
    it('generates distinct shared browser/race fixtures and archives both without deleting history', () => {
        const m = make(), setup = setupSql(m), cleanup = cleanupSql(m);
        expect(m.version).toBe(2);
        expect(m.stage).toBe('GC-04A-foundation');
        expect(SHARED_ROLES.map(r => r.role)).toEqual(['green_asian_pacific_scribe', 'green_europe_scribe', 'green_shared_facilitator']);
        expect(setup).toContain("green_seat_model='shared_facilitator_v1'");
        expect(setup).toContain('not exercise approval');
        for (const id of [m.sessionId, m.raceSessionId, ...Object.values(m.forwarded)]) expect(setup).toContain(id);
        expect(cleanup).toContain(fixtureGuard(m));
        expect(cleanup.match(/archive_live_demo_session/g)).toHaveLength(2);
        expect(cleanup).not.toMatch(/DELETE FROM public\.(sessions|actions|participants|session_participants|green_roster_approvals)/);
        const rows = fixtureSessions(m).map(({ id }) => ({ id, status: 'archived' }));
        expect(archivedComplete(rows, m)).toBe(true);
        expect(archivedComplete(rows.slice(1), m)).toBe(false);
        expect(archivedComplete([rows[0], rows[0]], m)).toBe(false);
        expect(() => cleanupSql({ ...m, raceSessionId: m.sessionId })).toThrow();
        expect(() => setupSql({ ...m, greenSeatModel: 'regional_pairs_v1' })).toThrow();
        expect(() => raceSql({ ...m, raceUsers: [randomUUID(), "'; SELECT 1; --"] })).toThrow();
    });
    it('allows both build bases in shared mode without weakening legacy URL rules', () => {
        for (const path of ['/', '/Fractured-Order/']) {
            expect(appUrl(`https://example.test${path}`, { shared: true })).toBe(`https://example.test${path}`);
            const m = manifest('abcdefghijklmnopqrst', `http://127.0.0.1:4174${path}`, randomUUID(), { local: true, shared: true });
            expect(cleanupSql(m)).toContain(m.raceSessionId);
        }
        expect(() => appUrl('https://example.test/')).toThrow();
        for (const url of ['http://example.test/', 'https://user:secret@example.test/', 'https://example.test/?role=green_scribe']) {
            expect(() => appUrl(url, { shared: true })).toThrow();
        }
    });
    it('rejects a pre-GC04A landing page in shared preflight', async () => {
        const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
        const send = markup => vi.fn(async () => ({ status: 200, text: async () => markup }));
        expect((await inspectDeployment('https://example.test/', send(html), { shared: true })).passed).toBe(true);
        const old = html.replaceAll('data-role-label', 'data-old-label');
        expect((await inspectDeployment('https://example.test/', send(old), { shared: true })).passed).toBe(false);
    });
    it('requires all three browser matrices and shared view evidence; old four-seat output cannot pass', () => {
        const rows = SHARED_ROLES.flatMap(({ role }) => AUTOMATED_CHECKS.map(label => ({ role, label, at: 'synthetic timestamp' })));
        expect(automatedComplete(rows, { shared: true })).toBe(false);
        rows.push({ role: 'green_shared_facilitator', label: SHARED_VIEW_CHECK, at: 'synthetic timestamp' });
        expect(rows).toHaveLength(16);
        expect(automatedComplete(rows, { shared: true })).toBe(true);
        expect(automatedComplete(rows)).toBe(false);
        expect(automatedComplete([...rows.slice(1), rows[1]], { shared: true })).toBe(false);
    });
    it('builds bounded distinct-connection SQL with live block observation and committed verification', () => {
        const m = make(), sql = raceSql(m);
        expect(sql.a).toContain('pg_blocking_pids(peer)');
        expect(sql.a).toContain('pid<>pg_backend_pid()');
        expect(sql.b).toContain("SQLERRM <> 'The requested role is full. Please choose another seat.'");
        expect(sql.b).toContain('elapsed_ms<500');
        expect(sql.verify).toContain("sp.role='green_shared_facilitator' AND sp.delegation_id IS NULL");
        for (const value of Object.values(sql)) {
            expect(value).toContain(fixtureGuard(m));
            expect(value).not.toMatch(/REPLACE_|DISABLE TRIGGER|session_replication_role/);
        }
    });
    it('starts both independent requests before awaiting either, then verifies committed state', async () => {
        const report = {}, pending = {};
        const send = vi.fn(label => {
            if (label === 'race-committed-count') return Promise.resolve(committed);
            return new Promise(resolve => {
                pending[label] = resolve;
                if (pending['race-A'] && pending['race-B']) {
                    pending['race-A'](receipt('A')); pending['race-B'](receipt('B'));
                }
            });
        });
        await verifySharedRace(make(), send, report);
        expect(send).toHaveBeenCalledTimes(3);
        expect(report.race.passed).toBe(true);
        expect(report.race.committed).toEqual(committed);
    });
    it.each([{ connection_b: 111 }, { waited_ms: 0 }, { connection_a: 333 }])('rejects insufficient contention evidence %j', async change => {
        const report = {};
        await expect(verifySharedRace(make(), async label => receipt(label === 'race-A' ? 'A' : 'B', label === 'race-B' ? change : {}), report)).rejects.toThrow();
        expect(report.race.passed).toBe(false);
        expect(Object.keys(report.race.outcomes)).toEqual(['a', 'b']);
    });
    it('retains both outcomes on failure and never accepts an unverified commit', async () => {
        const failed = {};
        await expect(verifySharedRace(make(), async label => {
            if (label === 'race-A') throw new Error('synthetic connection failure');
            return receipt('B');
        }, failed)).rejects.toThrow('both race requests');
        expect(failed.race.outcomes.a.status).toBe('rejected');
        expect(failed.race.outcomes.b.status).toBe('fulfilled');
        const uncommitted = {};
        await expect(verifySharedRace(make(), async label => label === 'race-committed-count'
            ? { status: 200, data: [] } : receipt(label === 'race-A' ? 'A' : 'B'), uncommitted)).rejects.toThrow('postcondition');
        expect(uncommitted.race.passed).toBe(false);
    });
});
