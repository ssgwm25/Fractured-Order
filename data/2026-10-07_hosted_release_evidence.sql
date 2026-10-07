-- Fractured Order hosted release evidence contract
--
-- Installs only after the current critical RPC, trigger, and RLS boundaries
-- are present. The public function returns non-secret release identity only;
-- the protected runtime-config table remains unreadable to browser roles.

BEGIN;

DO $$
DECLARE
    relation_name TEXT;
BEGIN
    FOREACH relation_name IN ARRAY ARRAY[
        'sessions',
        'session_participants',
        'game_state',
        'actions',
        'requests',
        'communications',
        'timeline',
        'notetaker_data',
        'artifact_workflow_reviews',
        'live_demo_runtime_config'
    ] LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_class relation
            JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname = relation_name
              AND relation.relkind IN ('r', 'p')
              AND relation.relrowsecurity
        ) THEN
            RAISE EXCEPTION 'FWC08_RLS_PREREQUISITE_MISSING: public.%', relation_name
                USING ERRCODE = '55000';
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname ILIKE '%Allow all operations%'
    ) THEN
        RAISE EXCEPTION 'FWC08_BROAD_RLS_POLICY_PRESENT'
            USING ERRCODE = '55000';
    END IF;

    IF to_regprocedure('public.operator_update_game_state(uuid,integer,integer,integer,boolean,timestamp with time zone,jsonb,jsonb)') IS NULL
       OR to_regprocedure('public.operator_review_artifact(text,uuid,text,text,bigint,text)') IS NULL
       OR to_regprocedure('public.operator_review_proposal(uuid,text,text,text,integer)') IS NULL
       OR to_regprocedure('public.append_proposal_thread_message(uuid,text,text,text,text)') IS NULL THEN
        RAISE EXCEPTION 'FWC08_REQUIRED_RPC_SIGNATURE_MISSING'
            USING ERRCODE = '55000';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        WHERE trigger_row.tgrelid = 'public.game_state'::regclass
          AND trigger_row.tgname = 'industry_proposal_move_gate'
          AND trigger_row.tgenabled <> 'D'
          AND NOT trigger_row.tgisinternal
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        WHERE trigger_row.tgrelid = 'public.actions'::regclass
          AND trigger_row.tgname = 'industry_proposal_prepare'
          AND trigger_row.tgenabled <> 'D'
          AND NOT trigger_row.tgisinternal
    ) THEN
        RAISE EXCEPTION 'FWC08_INDUSTRY_TRIGGER_PREREQUISITE_MISSING'
            USING ERRCODE = '55000';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname IN (
              'actions_industry_submission_update',
              'artifact_workflow_reviews_select',
              'industry_proposal_visibility',
              'industry_proposal_review_visibility',
              'industry_proposal_communication_visibility'
          )
    ) <> 5 THEN
        RAISE EXCEPTION 'FWC08_REQUIRED_RLS_POLICY_MISSING'
            USING ERRCODE = '55000';
    END IF;
END;
$$;

INSERT INTO public.live_demo_runtime_config (config_key, config_value, updated_at)
VALUES
    ('migration_state', '2026-10-07_hosted_release_evidence', NOW()),
    ('migration_count', '66', NOW()),
    ('migration_ledger_sha256', 'ae7324d4833872fbc4ed0a8da1850a834adcede56b0ea263475ee5d602b8f895', NOW())
ON CONFLICT (config_key) DO UPDATE
SET config_value = EXCLUDED.config_value,
    updated_at = EXCLUDED.updated_at;

CREATE OR REPLACE FUNCTION public.live_demo_release_evidence()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT jsonb_build_object(
        'migrationState', MAX(config_value) FILTER (WHERE config_key = 'migration_state'),
        'migrationCount', COALESCE(
            MAX(config_value) FILTER (WHERE config_key = 'migration_count'),
            '0'
        )::INTEGER,
        'migrationLedgerSha256', MAX(config_value) FILTER (WHERE config_key = 'migration_ledger_sha256'),
        'softwareBuildHash', MAX(
            CASE
                WHEN BTRIM(config_value) ~ '^[0-9A-Fa-f]{40}$' THEN LOWER(BTRIM(config_value))
                ELSE NULL
            END
        ) FILTER (WHERE config_key = 'software_build_hash')
    )
    FROM public.live_demo_runtime_config
$$;

REVOKE ALL ON FUNCTION public.live_demo_release_evidence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_release_evidence() FROM anon;
GRANT EXECUTE ON FUNCTION public.live_demo_release_evidence() TO authenticated;

COMMIT;
