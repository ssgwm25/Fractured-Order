import { describe, expect, it } from 'vitest';
import { makeManifest, buildSqlFiles, isAuthorizationDenial, requirePublicKey } from '../../scripts/gc03-hosted-check.mjs';

const ref = 'gsromgrxgrwwfywaoyme';
const jwt = payload => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

describe('GC03 human-run hosted verification safeguards (no network or SQL execution)', () => {
    it('rejects a dashboard URL as the project reference', () => {
        expect(() => makeManifest(`https://supabase.com/dashboard/project/${ref}`)).toThrow('project reference');
    });

    it('uses fresh fixture identifiers and rejects SQL-bearing identifiers', () => {
        const a = makeManifest(ref), b = makeManifest(ref);
        expect(Object.values(a.sessions).every(id => !Object.values(b.sessions).includes(id))).toBe(true);
        a.sessions.api = "'; DROP TABLE sessions; --";
        expect(() => buildSqlFiles(a)).toThrow('Invalid fixture UUID');
    });

    it('requires independent overlapping connections and the specific seat-full error', () => {
        const files = buildSqlFiles(makeManifest(ref));
        expect(files['02-same-A.sql']).toContain('pg_backend_pid()=ANY(pg_blocking_pids(peer))');
        expect(files['02-same-A.sql']).toContain('GC03_NO_BLOCKED_B');
        expect(files['02-same-A.sql']).not.toContain('pg_sleep(12)');
        expect(files['02-same-B.sql']).toContain('pid<>pg_backend_pid()');
        expect(files['02-same-B.sql']).toContain('GC03_NO_CONCURRENT_A');
        expect(files['02-same-B.sql']).not.toContain('pg_stat_activity');
        expect(files['02-same-B.sql']).toContain('FROM pg_locks');
        expect(files['02-same-B.sql']).toContain('elapsed_ms < 500');
        expect(files['02-same-B.sql']).toContain("IF SQLERRM <> 'The requested role is full.");
        expect(files['02-same-B.sql']).toContain('SET LOCAL ROLE authenticated');
        expect(files['03-split-B.sql']).toContain("'green_europe_scribe'");
        expect(files['04-verify-races.sql']).toContain('ROLLBACK;');
    });

    it('gives A and B distinct markers that each peer observes, separately for each race', () => {
        const files = buildSqlFiles(makeManifest(ref));
        const markers = [];
        for (const stem of ['02-same', '03-split']) {
            const a = files[`${stem}-A.sql`], b = files[`${stem}-B.sql`];
            const aKey = a.match(/pg_advisory_xact_lock\(170309,(\d+)\)/)[1];
            const bKey = b.match(/pg_advisory_xact_lock\(170309,(\d+)\)/)[1];
            markers.push(aKey, bKey);
            expect(a).toContain(`objid=${bKey}::oid AND objsubid=2 AND granted`);
            expect(b).toContain(`objid=${aKey}::oid AND objsubid=2 AND granted`);
            for (const sql of [a, b]) {
                expect(sql).toContain("datname=current_database()");
                expect(sql).toContain("interval '20 seconds'");
            }
        }
        expect(new Set(markers).size).toBe(4);
    });

    it('archives only exact fixtures with temporary session-scoped grants and retains evidence', () => {
        const m = makeManifest(ref), sql = buildSqlFiles(m)['06-archive.sql'];
        expect(sql).toContain('Fixture identity mismatch');
        for (const id of Object.values(m.sessions)) {
            expect(sql).toContain(`public.archive_live_demo_session('${id}'::uuid)`);
            expect(sql).toContain(`session_id='${id}'`);
        }
        expect(sql.match(/INSERT INTO public.operator_grants/g)).toHaveLength(4);
        expect(sql.match(/DELETE FROM public.operator_grants/g)).toHaveLength(4);
        expect(sql).not.toMatch(/DELETE FROM public\.(sessions|participants|actions|green_roster_approvals)/);
        expect(sql).not.toContain("'gamemaster'");
        expect(sql).not.toMatch(/DISABLE TRIGGER|CREATE (?:OR REPLACE )?FUNCTION/);
    });

    it('never counts invalid tokens, missing routes, malformed inputs or server failures as isolation', () => {
        for (const response of [
            { status: 401, data: { code: '42501' } },
            { status: 404, data: { code: 'PGRST202' } },
            { status: 500, data: { code: '42501' } },
            { status: 400, data: { code: '42703', message: 'missing column' } },
            { status: 400, data: { code: '23514', message: 'unrelated check constraint' } },
            { status: 200, data: [] }
        ]) expect(isAuthorizationDenial(response)).toBe(false);
        expect(isAuthorizationDenial({ status: 403, data: { code: '42501' } })).toBe(true);
        expect(isAuthorizationDenial({ status: 400, data: { code: '23514', message: 'GC02_SCOPE_MISMATCH' } })).toBe(true);
    });

    it('rejects privileged credentials and legacy anon keys for another project', () => {
        expect(requirePublicKey(jwt({ role: 'anon', ref }), ref)).toContain('header.');
        expect(requirePublicKey('sb_publishable_fixture', ref)).toBe('sb_publishable_fixture');
        for (const key of ['sb_secret_fixture', jwt({ role: 'service_role', ref }), jwt({ role: 'authenticated', ref }),
            jwt({ role: 'anon', ref: 'abcdefghijklmnopqrst' }), 'invalid']) {
            expect(() => requirePublicKey(key, ref)).toThrow('public anon');
        }
    });
});
