import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const original = read('data/2026-09-22_gc04_session_context.sql');
const migration = read('data/2026-09-23_gc04_legacy_session_topology.sql');
const executable = sql => sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();

describe('GC04 historical NULL topology compatibility', () => {
    it('changes only response topology in both RPCs and preserves every existing authority check and grant', () => {
        const expected = original
            .replace('CREATE FUNCTION public.restore_session_seat_context', 'CREATE OR REPLACE FUNCTION public.restore_session_seat_context')
            .replaceAll("'session_topology_version', s.session_topology_version",
                "'session_topology_version', COALESCE(s.session_topology_version, 1)");
        expect(executable(migration)).toBe(executable(expected));
        expect(migration.match(/COALESCE\(s\.session_topology_version, 1\)/g)).toHaveLength(2);
        expect(executable(migration)).not.toMatch(/\b(?:UPDATE|INSERT INTO|DELETE FROM|ALTER TABLE|DROP|CREATE POLICY)\b/i);
    });

    it('provides a read-only PLENUM2026 diagnostic without manual identities or schema changes', () => {
        const sql = executable(read('tests/sql/gc04-legacy-session-editor.sql'));
        expect(sql).toMatch(/^BEGIN READ ONLY;/);
        expect(sql).toMatch(/ROLLBACK;$/);
        expect(sql).toContain("lookup_joinable_session_by_code('PLENUM2026')");
        expect(sql).toContain('gen_random_uuid()');
        expect(sql).not.toMatch(/\b(?:UPDATE|INSERT INTO|DELETE FROM|ALTER|CREATE|DROP|COMMIT)\b|REPLACE_|\\set/i);
    });
});
