-- PLI regional dispatch + SME realtime. Apply after 2026-10-01_gc11_research_export_context.sql.
--
-- Purpose:
-- 1) Let White Cell action-complete dispatch the PLI Adjudication workflow for
--    regional (topology 2) sessions. GC-03 closed `green_authorize_derived_operation`
--    to unified sessions pending scoped PLI inputs; run_pli already routes Green
--    Asia-Pacific / Europe proposals, so the topology gate only added hours of lag
--    (cron backup) between an accepted action and the SME queue.
--    Every other guard is retained: authenticated caller, live_exercise, not
--    protected, active status for adjudicate, and a Game Master or matching
--    White Cell operator grant.
-- 2) Publish pli_adjudications, sme_handoffs and sme_pli_packets on the
--    supabase_realtime publication so SME consoles refresh on change instead of
--    waiting for the poll interval. Existing RLS still filters every event.
--
-- Safe to reapply: CREATE OR REPLACE + publication membership guard.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
    IF to_regprocedure('public.green_authorize_derived_operation(uuid,text)') IS NULL
        OR NOT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'live_demo_has_operator_grant'
        ) THEN
        RAISE EXCEPTION 'PLI_REGIONAL_DISPATCH_PREREQUISITES_MISSING';
    END IF;
END $$;

-- Regional PLI dispatch: drop only the topology-v1 (green_storage_is_unified) requirement.
CREATE OR REPLACE FUNCTION public.green_authorize_derived_operation(requested_session_id UUID, requested_operation TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT auth.uid() IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.sessions WHERE id=requested_session_id
            AND session_classification='live_exercise' AND NOT is_protected
            AND (requested_operation='adjudicate' AND status='active'
                OR requested_operation='narrative' AND status IN ('active','archived')))
        AND (public.live_demo_has_operator_grant('gamemaster')
            OR public.live_demo_has_operator_grant('whitecell',requested_session_id))
$$;
REVOKE ALL ON FUNCTION public.green_authorize_derived_operation(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.green_authorize_derived_operation(UUID,TEXT) TO authenticated;

COMMENT ON FUNCTION public.green_authorize_derived_operation(UUID,TEXT) IS
    'Server-side gate for PLI Edge Function dispatch. Unified and regional live sessions; Game Master or matching White Cell grant required.';

-- SME realtime: PLI seat rows, action-narrative handoffs and approved PLI packets.
DO $$
DECLARE item TEXT;
BEGIN
    FOREACH item IN ARRAY ARRAY['pli_adjudications', 'sme_handoffs', 'sme_pli_packets'] LOOP
        IF to_regclass(format('public.%I', item)) IS NULL THEN
            CONTINUE;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = item
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', item);
        END IF;
    END LOOP;
END $$;

COMMIT;
