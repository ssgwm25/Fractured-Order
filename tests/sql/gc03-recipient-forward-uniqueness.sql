-- Human-run after the September 21 repair. Tests the installed index expressions
-- on an empty temporary table; no sessions, Auth users or historical rows change.
BEGIN;
SET LOCAL statement_timeout = '30s';
CREATE TEMP TABLE gc03_forward_index_probe(type TEXT, metadata JSONB) ON COMMIT DROP;
DO $$
DECLARE index_name TEXT; index_oid OID; key_sql TEXT; predicate_sql TEXT;
    caught TEXT; recipient TEXT;
BEGIN
    FOREACH index_name IN ARRAY ARRAY['communications_proposal_recipient_root_unique',
        'idx_communications_one_forward_per_proposal'] LOOP
        index_oid := to_regclass('public.' || index_name);
        IF index_oid IS NULL THEN RAISE EXCEPTION 'Missing required index: %', index_name; END IF;
        SELECT (SELECT string_agg(pg_get_indexdef(i.indexrelid,k,true), ', ' ORDER BY k)
            FROM generate_series(1,i.indnkeyatts) k), pg_get_expr(i.indpred,i.indrelid)
        INTO key_sql, predicate_sql FROM pg_index i
        WHERE i.indexrelid=index_oid AND i.indrelid='public.communications'::regclass
          AND i.indisunique AND i.indisvalid AND i.indisready;
        IF key_sql IS NULL OR predicate_sql IS NULL THEN RAISE EXCEPTION 'Invalid index: %', index_name; END IF;
        EXECUTE format('CREATE UNIQUE INDEX %I ON pg_temp.gc03_forward_index_probe (%s) WHERE %s',
            index_name,key_sql,predicate_sql);
    END LOOP;

    INSERT INTO gc03_forward_index_probe VALUES
        ('PROPOSAL_FORWARDED','{"source_proposal_id":"synthetic-modern","recipient_team":"blue","thread_id":"blue-thread"}'),
        ('PROPOSAL_FORWARDED','{"source_proposal_id":"synthetic-modern","recipient_team":"red","thread_id":"red-thread"}');
    FOREACH recipient IN ARRAY ARRAY['BLUE','red'] LOOP
        BEGIN
            INSERT INTO gc03_forward_index_probe VALUES ('PROPOSAL_FORWARDED',jsonb_build_object(
                'source_proposal_id','synthetic-modern','recipient_team',recipient,'thread_id','different-thread'));
            RAISE EXCEPTION 'Duplicate recipient forward was accepted';
        EXCEPTION WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS caught = CONSTRAINT_NAME;
            IF caught <> 'communications_proposal_recipient_root_unique' THEN RAISE EXCEPTION 'Unexpected duplicate guard: %',caught; END IF;
        END;
    END LOOP;

    INSERT INTO gc03_forward_index_probe VALUES
        ('PROPOSAL_FORWARDED','{"source_proposal_id":"synthetic-legacy","recipient_team":"blue"}');
    BEGIN
        INSERT INTO gc03_forward_index_probe VALUES
            ('PROPOSAL_FORWARDED','{"source_proposal_id":"synthetic-legacy","recipient_team":"red"}');
        RAISE EXCEPTION 'Historical proposal-wide uniqueness was lost';
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS caught = CONSTRAINT_NAME;
        IF caught <> 'idx_communications_one_forward_per_proposal' THEN RAISE EXCEPTION 'Unexpected legacy guard: %',caught; END IF;
    END;
    IF (SELECT count(*) FROM gc03_forward_index_probe) <> 3 THEN RAISE EXCEPTION 'Unexpected retained fixture count'; END IF;
END;
$$;
ROLLBACK;
SELECT 'GC03 recipient index assertions completed; temporary fixtures rolled back' AS result;
