import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../data/2026-09-19_green_regional_authorization.sql', import.meta.url), 'utf8');

describe('GC-03 migration dependency regressions (not SQL execution)', () => {
    it.each(['live_demo_participant_role', 'live_demo_participant_surface', 'live_demo_can_read_session', 'get_session_role_seat_limit'])(
        'preserves the policy dependency OID of %s', (name) => {
            expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${name}(`);
            expect(sql).not.toMatch(new RegExp(`ALTER FUNCTION public\\.${name}\\([^;]+RENAME`, 'i'));
        }
    );
    it('keeps the compatibility implementations private and fails on missing prerequisite policies', () => {
        expect(sql).toContain("proname LIKE 'gc03_%'");
        expect(sql).toContain('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated');
        expect(sql).toContain('DROP POLICY green_storage_boundary ON public.%I');
        expect(sql).not.toContain('DROP POLICY IF EXISTS green_storage_boundary');
    });
});
