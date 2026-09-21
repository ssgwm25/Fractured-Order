import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../data/2026-09-28_gc07_regional_messaging.sql');
const suite = read('../sql/gc07-regional-messaging-editor.sql');

describe('GC07 migration and SQL harness contracts (not SQL execution evidence)', () => {
    it('keeps the regional loop variable distinct from actor and record region columns', () => {
        const match = suite.match(/stage := 'regional_cycles';([\s\S]*?)stage := 'audience_and_scribe_isolation';/);
        expect(match).not.toBeNull();
        const cycle = match[1];
        expect(cycle).toContain("FOREACH gc07_region IN ARRAY ARRAY['asian_pacific','europe']");
        expect(cycle).toContain("actor.role=CASE WHEN s.model='shared' THEN 'green_shared_facilitator' ELSE 'green_'||gc07_region||'_facilitator' END");
        expect(cycle).toContain('public.write_regional_rfi(s.id,gc07_region,');
        expect(cycle).toContain('recipient_delegation_id=gc07_region');
        // Ignore diagnostic string literals; bare region would collide with
        // gc07_actors.region or gc07_records.region in these SQL statements.
        expect(cycle.replace(/'(?:[^']|'')*'/g, '')).not.toMatch(/\bregion\b/);
        expect(suite).not.toMatch(/#variable_conflict|plpgsql\.variable_conflict/i);
    });

    it('supplies every required roster snapshot field using the existing approved membership and alias', () => {
        const match = suite.match(/INSERT INTO public\.green_roster_approvals\(version,snapshot,approved_by,approved_at\)\s+SELECT roster,'([^']+)'::JSONB/);
        expect(match).not.toBeNull();
        const snapshot = JSON.parse(match[1]);
        const { roster } = JSON.parse(read('../../docs/architecture/green-regional-contract.json'));
        expect(snapshot.asian_pacific).toEqual(roster.approved_members.asian_pacific);
        expect(snapshot.europe).toEqual(roster.approved_members.europe);
        expect(snapshot.aliases).toEqual(roster.aliases);
        expect(Array.isArray(snapshot.source_references)).toBe(true);
        expect(snapshot.source_references.length).toBeGreaterThan(0);
        expect(snapshot.source_references.every((reference) => typeof reference === 'string' && reference.trim())).toBe(true);
    });

    it('keeps region and revision authority server-derived with private helpers and additive history', () => {
        expect(migration).toContain('public.green_storage_current_seat(sid)');
        expect(migration).toContain('r.revision_number IS DISTINCT FROM requested_expected_revision');
        expect(migration).toContain('r.delegation_id IS DISTINCT FROM requested_delegation_id');
        expect(migration).toContain('AS RESTRICTIVE FOR ALL TO authenticated');
        expect(migration).toContain('REVOKE ALL ON FUNCTION public.gc07_legacy_answer_request(UUID,TEXT,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated');
        expect(migration).toContain('GC07_OWNERSHIP_DRIFT');
        expect(migration).toContain("position('gc06_shared_change' IN d)");
        expect(migration).not.toMatch(/DROP\s+(?:COLUMN|TABLE|POLICY)|DISABLE\s+(?:TRIGGER|ROW)/i);
    });
    it('runs synthetic authenticated assertions in one rollback block without replacing controls', () => {
        const executable = suite.replace(/--[^\n]*/g, '');
        const block = executable.match(/DO \$gc07_suite\$([\s\S]*?)\$gc07_suite\$;/);
        expect(block).not.toBeNull();
        expect(executable.trim()).toMatch(/^BEGIN;/);
        expect(executable.trim()).toMatch(/ROLLBACK;$/);
        expect(executable).not.toMatch(/\bCOMMIT\b|\bDISABLE\b|SECURITY\s+DEFINER|session_replication_role/i);
        expect(block[1]).toContain('SET LOCAL ROLE authenticated;');
        expect(block[1]).toContain('GET STACKED DIAGNOSTICS');
        for (const rpc of ['write_regional_rfi', 'send_regional_direct_message', 'operator_review_artifact', 'operator_answer_regional_rfi', 'operator_send_communication']) {
            expect(block[1]).toContain(`public.${rpc}(`);
        }
        expect(executable.replace(block[0], '')).not.toContain('pg_temp.');
        expect(executable).toContain('"result":"FAIL"');
    });
});
