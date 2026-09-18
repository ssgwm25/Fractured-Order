-- Forward-only GC-03 repair: stale application revisions are terminal HTTP 409
-- conflicts, not PostgreSQL serialization failures eligible for server retries.
-- Prerequisite: 2026-09-19_green_regional_authorization.sql. No row changes.
-- Patch the installed implementations so later authorization wrappers, owners,
-- ACLs, signatures and SECURITY DEFINER settings remain intact.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $repair$
DECLARE
    target RECORD;
    original RECORD;
    replacement TEXT;
    before_definition TEXT;
    old_count INTEGER;
    terminal_count INTEGER;
BEGIN
    IF to_regprocedure('public.green_has_capability(uuid,text)') IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'session_participants' AND column_name = 'revoked_at') THEN
        RAISE EXCEPTION 'GC03_TERMINAL_CONFLICT_PREREQUISITE_MISSING';
    END IF;

    FOR target IN SELECT * FROM (VALUES
        ('public.save_scoped_notetaker_data(uuid,integer,integer,jsonb,jsonb,jsonb,bigint)', 1),
        ('public.operator_review_artifact(text,uuid,text,text,bigint,text)', 2),
        ('public.operator_review_proposal(uuid,text,text,text,integer)', 1),
        ('public.gc02_unified_append_proposal_thread_message(uuid,text,text,text,text)', 1),
        ('public.operator_forward_proposal_response(uuid)', 1)
    ) AS targets(signature, expected_sites)
    LOOP
        SELECT p.oid, p.proowner, p.proacl, p.proconfig, p.prosecdef
          INTO original FROM pg_proc p WHERE p.oid = to_regprocedure(target.signature);
        IF NOT FOUND OR NOT original.prosecdef THEN
            RAISE EXCEPTION 'GC03_TERMINAL_CONFLICT_FUNCTION_DRIFT: %', target.signature;
        END IF;
        before_definition := pg_get_functiondef(original.oid);
        old_count := (length(before_definition) - length(replace(before_definition, 'ERRCODE = ''40001''', '')))
            / length('ERRCODE = ''40001''');
        terminal_count := (length(before_definition) - length(replace(before_definition, 'ERRCODE = ''PT409''', '')))
            / length('ERRCODE = ''PT409''');
        -- Allow a fully repaired installation, but reject partial/unexpected drift.
        IF NOT ((old_count = target.expected_sites AND terminal_count = 0)
            OR (old_count = 0 AND terminal_count = target.expected_sites)) THEN
            RAISE EXCEPTION 'GC03_TERMINAL_CONFLICT_SITE_DRIFT: %', target.signature;
        END IF;
        replacement := replace(before_definition, 'ERRCODE = ''40001''', 'ERRCODE = ''PT409''');
        IF old_count > 0 THEN EXECUTE replacement; END IF;
        IF pg_get_functiondef(original.oid) IS DISTINCT FROM replacement
           OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = original.oid
               AND p.proowner = original.proowner AND p.proacl IS NOT DISTINCT FROM original.proacl
               AND p.proconfig IS NOT DISTINCT FROM original.proconfig AND p.prosecdef = original.prosecdef) THEN
            RAISE EXCEPTION 'GC03_TERMINAL_CONFLICT_METADATA_DRIFT: %', target.signature;
        END IF;
    END LOOP;
    IF has_function_privilege('anon', 'public.gc02_unified_append_proposal_thread_message(uuid,text,text,text,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.gc02_unified_append_proposal_thread_message(uuid,text,text,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'GC03_TERMINAL_CONFLICT_PRIVATE_RPC_EXPOSED';
    END IF;
END;
$repair$;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Five rows: terminal_conflict_sites 1, 1, 2, 1, 1 in name order; no retry codes.
SELECT p.proname AS function_name,
    (length(d.definition) - length(replace(d.definition, 'ERRCODE = ''PT409''', '')))
        / length('ERRCODE = ''PT409''') AS terminal_conflict_sites,
    position('ERRCODE = ''40001''' IN d.definition) = 0 AS no_application_retry_code
FROM pg_proc p
CROSS JOIN LATERAL (SELECT pg_get_functiondef(p.oid) AS definition) d
WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN (
    'save_scoped_notetaker_data', 'operator_review_artifact', 'operator_review_proposal',
    'gc02_unified_append_proposal_thread_message', 'operator_forward_proposal_response')
ORDER BY p.proname;
