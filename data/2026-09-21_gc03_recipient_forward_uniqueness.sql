-- Required GC-03 dependency: the July proposal-wide index blocks the second
-- recipient supported by the August thread RPC. No historical rows are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.communications IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE old_index RECORD;
BEGIN
    SELECT i.*, pg_get_expr(i.indexprs, i.indrelid) AS expressions,
        pg_get_expr(i.indpred, i.indrelid) AS predicate
    INTO old_index FROM pg_index i
    WHERE i.indexrelid = to_regclass('public.idx_communications_one_forward_per_proposal');
    IF NOT FOUND THEN RAISE EXCEPTION 'GC03_FORWARD_INDEX_MISSING'; END IF;
    IF old_index.indrelid <> 'public.communications'::regclass
       OR NOT old_index.indisunique OR NOT old_index.indisvalid
       OR old_index.indnatts <> 1
       OR regexp_replace(old_index.expressions, '[[:space:]()]', '', 'g') IS DISTINCT FROM
           'metadata->>''source_proposal_id''::text'
       OR regexp_replace(old_index.predicate, '[[:space:]()]', '', 'g') IS DISTINCT FROM
           'type=''PROPOSAL_FORWARDED''::textANDNULLIFmetadata->>''source_proposal_id''::text,''''::textISNOTNULL' THEN
        RAISE EXCEPTION 'GC03_FORWARD_INDEX_DRIFT: inspect installed indexes before repair';
    END IF;
    IF to_regprocedure('public.gc02_unified_append_proposal_thread_message(uuid,text,text,text,text)') IS NULL THEN
        RAISE EXCEPTION 'GC03_FORWARD_THREAD_PREREQUISITE_MISSING';
    END IF;
END;
$$;

-- Install the replacement first. Unexpected duplicate evidence aborts without
-- deleting, relabelling or deduplicating any message.
CREATE UNIQUE INDEX communications_proposal_recipient_root_unique
    ON public.communications (
        (metadata ->> 'source_proposal_id'),
        (LOWER(metadata ->> 'recipient_team'))
    )
    WHERE type = 'PROPOSAL_FORWARDED'
      AND NULLIF(metadata ->> 'source_proposal_id', '') IS NOT NULL;

DROP INDEX public.idx_communications_one_forward_per_proposal;
-- Retain proposal-wide uniqueness for historical messages without a thread.
CREATE UNIQUE INDEX idx_communications_one_forward_per_proposal
    ON public.communications ((metadata ->> 'source_proposal_id'))
    WHERE type = 'PROPOSAL_FORWARDED'
      AND NULLIF(metadata ->> 'source_proposal_id', '') IS NOT NULL
      AND NULLIF(BTRIM(metadata ->> 'thread_id'), '') IS NULL;
COMMIT;

SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'communications'
  AND indexname IN ('communications_proposal_recipient_root_unique',
      'idx_communications_one_forward_per_proposal')
ORDER BY indexname;
