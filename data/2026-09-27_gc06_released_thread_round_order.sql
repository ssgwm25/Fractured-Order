-- GC-06 forward-only repair after September 26. No row/history changes.
-- White Cell review and released response share a round number. A released
-- response must outrank its review, even when timestamps tie or IDs sort later.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $repair$
DECLARE original RECORD; before_definition TEXT; replacement TEXT;
    old_order TEXT := 'ORDER BY (metadata ->> ''round_number'')::INTEGER DESC, created_at DESC, id DESC';
    new_order TEXT := 'ORDER BY (metadata ->> ''round_number'')::INTEGER DESC,
        CASE WHEN type = ''PROPOSAL_RESPONSE'' THEN 0 ELSE 1 END ASC,
        created_at DESC, id DESC';
    old_count INTEGER; new_count INTEGER;
BEGIN
    IF to_regprocedure('public.gc06_thread_source(jsonb,boolean)') IS NULL
        OR to_regprocedure('public.write_regional_proposal(uuid,text,uuid,bigint,bigint,text,jsonb,text)') IS NULL THEN
        RAISE EXCEPTION 'GC06_THREAD_ORDER_PREREQUISITE_MISSING';
    END IF;
    SELECT p.oid,p.proowner,p.proacl,p.proconfig,p.prosecdef INTO original
    FROM pg_proc p WHERE p.oid=to_regprocedure('public.gc02_unified_append_proposal_thread_message(uuid,text,text,text,text)');
    IF NOT FOUND OR NOT original.prosecdef THEN RAISE EXCEPTION 'GC06_THREAD_ORDER_FUNCTION_DRIFT'; END IF;
    before_definition := pg_get_functiondef(original.oid);
    old_count := (length(before_definition)-length(replace(before_definition,old_order,'')))/length(old_order);
    new_count := (length(before_definition)-length(replace(before_definition,new_order,'')))/length(new_order);
    IF NOT ((old_count=1 AND new_count=0) OR (old_count=0 AND new_count=1))
        OR position('ERRCODE = ''PT409''' IN before_definition)=0
        OR position('IF latest_row.id IS DISTINCT FROM parent_row.id THEN' IN before_definition)=0 THEN
        RAISE EXCEPTION 'GC06_THREAD_ORDER_SITE_DRIFT';
    END IF;
    -- Keep pending higher rounds in the query: they still prevent a second
    -- response before review. Same-key retries still resolve before this check.
    replacement := replace(before_definition,old_order,new_order);
    IF old_count=1 THEN EXECUTE replacement; END IF;
    IF pg_get_functiondef(original.oid) IS DISTINCT FROM replacement
        OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=original.oid
            AND p.proowner=original.proowner AND p.proacl IS NOT DISTINCT FROM original.proacl
            AND p.proconfig IS NOT DISTINCT FROM original.proconfig AND p.prosecdef=original.prosecdef)
        OR has_function_privilege('anon',original.oid,'EXECUTE')
        OR has_function_privilege('authenticated',original.oid,'EXECUTE') THEN
        RAISE EXCEPTION 'GC06_THREAD_ORDER_METADATA_DRIFT';
    END IF;
END;
$repair$;
NOTIFY pgrst,'reload schema';
COMMIT;
