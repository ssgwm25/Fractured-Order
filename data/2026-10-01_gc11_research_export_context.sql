-- GC-11. Apply after 2026-09-30_gc08_unified_seat_removal_history.sql.
-- This is an operator-only evidence projection. It does not expose or join the
-- independent PLI subsystem and it does not rewrite historical rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
    IF to_regclass('public.gc08_unified_seat_removals') IS NULL
        OR to_regprocedure('public.live_demo_has_operator_grant(text,uuid,text,text)') IS NULL THEN
        RAISE EXCEPTION 'GC11_EXPORT_PREREQUISITES_MISSING';
    END IF;
END $$;

CREATE FUNCTION public.export_gc11_research_context(requested_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    session_row public.sessions%ROWTYPE;
    effective_model TEXT;
    model_status TEXT := 'recognized';
BEGIN
    IF auth.uid() IS NULL OR NOT (
        public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('whitecell')
    ) THEN
        RAISE EXCEPTION 'GC11_OPERATOR_REQUIRED' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO session_row
    FROM public.sessions
    WHERE id = requested_session_id;

    IF session_row.id IS NULL THEN
        RAISE EXCEPTION 'GC11_SESSION_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    effective_model := CASE
        WHEN session_row.green_seat_model IS NULL
            AND session_row.session_topology_version IS NULL THEN 'unified_v1'
        WHEN session_row.green_seat_model IS NULL
            AND session_row.session_topology_version = 1 THEN 'unified_v1'
        WHEN session_row.green_seat_model IS NULL
            AND session_row.session_topology_version = 2 THEN 'regional_pairs_v1'
        WHEN session_row.green_seat_model = 'shared_facilitator_v1'
            AND session_row.session_topology_version = 2 THEN 'shared_facilitator_v1'
        ELSE 'unknown'
    END;
    IF effective_model = 'unknown' THEN model_status := 'unknown_combination'; END IF;

    RETURN jsonb_build_object(
        'session_id', session_row.id,
        'session_topology_version', session_row.session_topology_version,
        'green_roster_version', session_row.green_roster_version,
        'green_roster_snapshot', session_row.green_roster_snapshot,
        'persisted_green_seat_model', session_row.green_seat_model,
        'effective_green_seat_model', effective_model,
        'effective_green_seat_model_is_derived', session_row.green_seat_model IS NULL,
        'model_status', model_status,
        'unified_seat_removals', COALESCE((
            SELECT jsonb_agg(to_jsonb(removal) ORDER BY removal.removed_at, removal.seat_id)
            FROM public.gc08_unified_seat_removals removal
            WHERE removal.session_id = requested_session_id
        ), '[]'::JSONB),
        'pli_included', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.export_gc11_research_context(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_gc11_research_context(UUID)
    TO authenticated;
COMMENT ON FUNCTION public.export_gc11_research_context(UUID) IS
    'Operator-only GC-11 topology, staffing, roster and removed-seat evidence. PLI data is intentionally excluded.';
NOTIFY pgrst, 'reload schema';
COMMIT;
