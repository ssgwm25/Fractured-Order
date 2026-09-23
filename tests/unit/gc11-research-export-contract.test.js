import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
    new URL('../../data/2026-10-01_gc11_research_export_context.sql', import.meta.url),
    'utf8'
);

describe('GC-11 research export SQL contract', () => {
    it('exports raw topology, roster, model, and removed-seat history without joining PLI', () => {
        expect(migration).toContain('session_row.session_topology_version');
        expect(migration).toContain('session_row.green_roster_version');
        expect(migration).toContain('session_row.green_roster_snapshot');
        expect(migration).toContain("'persisted_green_seat_model', session_row.green_seat_model");
        expect(migration).toContain("'unified_seat_removals'");
        expect(migration).toContain("'pli_included', false");
        expect(migration).not.toMatch(/(?:FROM|JOIN)\s+public\.(?:pli_adjudications|sme_pli_packets)/i);
        expect(migration).not.toMatch(/UPDATE\s+public\.sessions/i);
    });

    it('implements the documented compatibility mapping and flags unknown combinations', () => {
        expect(migration).toContain("THEN 'unified_v1'");
        expect(migration).toContain("THEN 'regional_pairs_v1'");
        expect(migration).toContain("THEN 'shared_facilitator_v1'");
        expect(migration).toContain("ELSE 'unknown'");
        expect(migration).toContain("model_status := 'unknown_combination'");
    });

    it('keeps the projection operator-only', () => {
        expect(migration).toContain("public.live_demo_has_operator_grant('gamemaster')");
        expect(migration).toContain("public.live_demo_has_operator_grant('whitecell')");
        expect(migration).toContain('REVOKE ALL ON FUNCTION public.export_gc11_research_context(UUID)');
        expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.export_gc11_research_context(UUID)');
    });
});
