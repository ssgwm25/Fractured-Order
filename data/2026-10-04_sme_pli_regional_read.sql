-- SME PLI read on regional sessions. Apply after 2026-10-03_sme_instant_action_delivery.sql.
--
-- Symptom: White Cell Lead sees Macro "awaiting SME" while the Econ console is blank.
-- Cause: topology-2 `green_storage_boundary` is RESTRICTIVE and uses
-- `green_can_read_record`. That helper treats White Cell / Game Master as
-- operators, then returns false for anyone without a Green seat. SME grants
-- are not Green seats, so pli_adjudications / sme_handoffs / sme_pli_packets
-- were invisible to every SME on regional sessions. Unified sessions were
-- unaffected (the helper returns true before the operator check).
--
-- Fix: allow a matching SME operator grant to read those three tables only.
-- Do not add SME to green_storage_operator (that would bypass unrelated
-- regional write guards).
--
-- Safe to reapply: skips if the SME PLI grant clause is already present.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
    definition TEXT;
    old_clause TEXT := 'IF public.green_storage_operator(sid) THEN RETURN true; END IF;';
    new_clause TEXT := $body$IF public.green_storage_operator(sid) THEN RETURN true; END IF;
    IF table_name IN ('pli_adjudications', 'sme_handoffs', 'sme_pli_packets')
        AND public.live_demo_has_operator_grant('sme', sid) THEN
        RETURN true;
    END IF;$body$;
BEGIN
    IF to_regprocedure('public.green_can_read_record(text,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'SME_PLI_READ_PREREQUISITES_MISSING';
    END IF;

    definition := replace(pg_get_functiondef('public.green_can_read_record(text,jsonb)'::regprocedure), E'\r', '');
    IF position('sme_pli_packets' IN definition) > 0
        AND position('live_demo_has_operator_grant(''sme''' IN definition) > 0 THEN
        RETURN;
    END IF;
    IF position(old_clause IN definition) = 0 THEN
        RAISE EXCEPTION 'SME_PLI_READ_DRIFT';
    END IF;
    EXECUTE replace(definition, old_clause, new_clause);
END $$;

COMMIT;
