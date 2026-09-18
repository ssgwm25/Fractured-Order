import { describe, expect, it } from 'vitest';
import { makeManifest, buildSqlFiles } from '../../scripts/gc03-hosted-check.mjs';
import { managedRaceSql, concurrentPair, assertRaceEvidence, redact } from '../../scripts/gc03-race-runner.mjs';

describe('GC03 concurrent operator runner (no network or SQL execution)', () => {
    it('starts both requests before waiting and retains failure alongside the other result', async () => {
        const started = [];
        let finishB;
        const result = await concurrentPair((side) => {
            started.push(side);
            if (side === 'B') return new Promise(resolve => { finishB = resolve; });
            finishB('B completed');
            return Promise.reject(new Error('A failed'));
        }, 'sql A', 'sql B');
        expect(started).toEqual(['B', 'A']);
        expect(result.a.status).toBe('rejected');
        expect(result.b).toEqual({ status: 'fulfilled', value: 'B completed' });
    });

    it('requires matching distinct backend IDs, lock evidence and an expected successful response', () => {
        const a = { status: 201, data: [{ receipt: { result: 'PASS: A observed B blocked on its transaction', connection_a: 11, connection_b: 22 } }] };
        const b = { status: 201, data: [{ receipt: { result: 'PASS: same seat has one winner', connection_a: 11, connection_b: 22, waited_ms: 1000 } }] };
        expect(() => assertRaceEvidence('same', a, b)).not.toThrow();
        for (const bad of [
            { status: 500, data: b.data }, { data: b.data }, { status: 201, data: [] },
            { status: 201, data: [{ receipt: { ...b.data[0].receipt, connection_b: 11 } }] },
            { status: 201, data: [{ receipt: { ...b.data[0].receipt, connection_a: 99 } }] },
            { status: 201, data: [{ receipt: { ...b.data[0].receipt, waited_ms: 1 } }] },
            { status: 201, data: [{ receipt: { ...b.data[0].receipt, result: 'A claimed; committing' } }] }
        ]) expect(() => assertRaceEvidence('same', a, bad)).toThrow();
        expect(() => assertRaceEvidence('split', a, b)).toThrow();
    });

    it('returns receipts after commit without dropping the authenticated claim or lock assertions', () => {
        const files = buildSqlFiles(makeManifest('gsromgrxgrwwfywaoyme'));
        for (const name of ['02-same-A.sql', '02-same-B.sql', '03-split-A.sql', '03-split-B.sql']) {
            const sql = managedRaceSql(files[name]);
            expect(sql).toContain('SET LOCAL ROLE authenticated;');
            expect(sql).toContain('public.claim_session_role_seat(');
            expect(sql).toContain('FROM pg_locks');
            expect(sql).toContain('COMMIT;\nWITH receipt AS MATERIALIZED');
            expect(sql).toContain("set_config('gc03.runner_receipt','',false)");
            expect(sql.match(/^COMMIT;/gm)).toHaveLength(1);
        }
        expect(() => managedRaceSql('SELECT 1;')).toThrow('Unexpected race SQL shape');
    });

    it('removes the management credential from nested evidence and error text', () => {
        const token = 'sbp_test_secret';
        const result = redact({ nested: [{ message: `bad ${token}`, harmless: 'fixture' }], failure: token }, token);
        expect(JSON.stringify(result)).not.toContain(token);
        expect(result.nested[0].harmless).toBe('fixture');
        expect(result.failure).toBe('[REDACTED]');
    });
});
