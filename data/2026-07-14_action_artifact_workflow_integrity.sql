-- ESG Simulation Platform
-- Action, proposal, forecast, and move-response integrity patch
--
-- Apply after:
--   2026-06-04_research_export_capture.sql
--   2026-06-25_industry_team_role_contract.sql
--   2026-06-25_scribe_action_submit_policy.sql
--   2026-06-25_participant_role_resolver_normalization.sql
--
-- This patch deliberately does not change RLS or role authorization. It adds:
--   * first-class artifact and workflow fields with deterministic legacy backfill
--   * server-owned lifecycle timestamps and valid state transitions
--   * current-game-state, artifact/team, and timestamp consistency checks
--   * uniqueness and optional idempotency constraints
--   * complete action mutation logging plus research audit events
--   * one transactional, idempotent proposal review/forward RPC

BEGIN;

-- ============================================================================
-- 1. FIRST-CLASS OPERATIONAL FIELDS
-- ============================================================================

ALTER TABLE public.actions
    ADD COLUMN IF NOT EXISTS artifact_type TEXT,
    ADD COLUMN IF NOT EXISTS workflow_state TEXT,
    ADD COLUMN IF NOT EXISTS artifact_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS forecast_targets JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS proposal_recipient_team TEXT,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS created_by_auth_user_id UUID,
    ADD COLUMN IF NOT EXISTS created_by_role TEXT,
    ADD COLUMN IF NOT EXISTS submitted_by_auth_user_id UUID,
    ADD COLUMN IF NOT EXISTS submitted_by_role TEXT,
    ADD COLUMN IF NOT EXISTS last_modified_by_auth_user_id UUID,
    ADD COLUMN IF NOT EXISTS last_modified_by_role TEXT;

ALTER TABLE public.action_logs
    ADD COLUMN IF NOT EXISTS changed_by_auth_user_id UUID,
    ADD COLUMN IF NOT EXISTS change_kind TEXT,
    ADD COLUMN IF NOT EXISTS artifact_type TEXT,
    ADD COLUMN IF NOT EXISTS workflow_state_from TEXT,
    ADD COLUMN IF NOT EXISTS workflow_state_to TEXT,
    ADD COLUMN IF NOT EXISTS row_version BIGINT;

CREATE OR REPLACE FUNCTION public.action_legacy_detail(
    requested_details TEXT,
    requested_label TEXT
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
RETURNS NULL ON NULL INPUT
SET search_path = public
AS $$
    SELECT NULLIF(
        BTRIM(
            SUBSTRING(
                requested_details
                FROM ('(?im)^' || requested_label || ':[[:space:]]*(.*)$')
            )
        ),
        ''
    )
$$;

COMMENT ON FUNCTION public.action_legacy_detail(TEXT, TEXT) IS
    'Compatibility parser for a named line in a legacy action details text block. New writes should use structured action columns.';

UPDATE public.actions
SET artifact_type = CASE
        WHEN LOWER(COALESCE(ally_contingencies, '')) LIKE 'proposal details%' THEN 'proposal'
        WHEN LOWER(COALESCE(ally_contingencies, '')) LIKE 'move response details%' THEN 'move_response'
        WHEN LOWER(COALESCE(ally_contingencies, '')) LIKE 'strategic orientation details%'
             AND LOWER(COALESCE(team, '')) = 'blue'
            THEN 'strategic_orientation_selection'
        WHEN LOWER(COALESCE(ally_contingencies, '')) LIKE 'strategic orientation details%'
            THEN 'strategic_orientation_forecast'
        ELSE 'action'
    END
WHERE artifact_type IS NULL;

UPDATE public.actions
SET proposal_recipient_team = LOWER(
        public.action_legacy_detail(ally_contingencies, 'Recipient Team')
    )
WHERE artifact_type = 'proposal'
  AND proposal_recipient_team IS NULL;

UPDATE public.actions
SET forecast_targets = jsonb_build_array(
        jsonb_build_object(
            'legacy_summary',
            public.action_legacy_detail(ally_contingencies, 'Forecast Targets')
        )
    )
WHERE artifact_type = 'strategic_orientation_forecast'
  AND forecast_targets = '[]'::jsonb
  AND public.action_legacy_detail(ally_contingencies, 'Forecast Targets') IS NOT NULL;

UPDATE public.actions
SET artifact_payload = jsonb_strip_nulls(
        jsonb_build_object(
            'mechanism', mechanism,
            'sector', sector,
            'exposure_type', exposure_type,
            'targets', targets,
            'goal', goal,
            'expected_outcomes', expected_outcomes,
            'legacy_details', ally_contingencies
        )
    )
WHERE artifact_payload = '{}'::jsonb;

UPDATE public.actions
SET workflow_state = CASE
        WHEN status = 'adjudicated' THEN
            CASE
                WHEN artifact_type = 'proposal'
                     AND adjudication ->> 'proposal_review_decision' = 'forward_to_recipient'
                    THEN 'forwarded_to_recipient'
                WHEN artifact_type = 'proposal'
                     AND adjudication ->> 'proposal_review_decision' = 'request_changes'
                    THEN 'changes_requested'
                WHEN artifact_type = 'proposal'
                     AND adjudication ->> 'proposal_review_decision' = 'reject'
                    THEN 'rejected'
                ELSE 'adjudicated'
            END
        WHEN status = 'abandoned' THEN 'abandoned'
        WHEN status = 'submitted' THEN 'submitted_to_white_cell'
        WHEN LOWER(COALESCE(ally_contingencies, '')) LIKE '%scribe handoff: forwarded%'
            THEN 'forwarded_to_facilitator'
        ELSE 'draft'
    END
WHERE workflow_state IS NULL;

UPDATE public.actions
SET submitted_at = NULL,
    adjudicated_at = NULL
WHERE status = 'draft'
  AND (submitted_at IS NOT NULL OR adjudicated_at IS NOT NULL);

UPDATE public.actions
SET adjudicated_at = NULL
WHERE status IN ('submitted', 'abandoned')
  AND adjudicated_at IS NOT NULL;

UPDATE public.actions
SET submitted_at = COALESCE(submitted_at, created_at, clock_timestamp())
WHERE status IN ('submitted', 'adjudicated')
  AND submitted_at IS NULL;

UPDATE public.actions
SET adjudicated_at = COALESCE(adjudicated_at, updated_at, submitted_at, created_at, clock_timestamp())
WHERE status = 'adjudicated'
  AND adjudicated_at IS NULL;

UPDATE public.actions
SET outcome = COALESCE(outcome, adjudication ->> 'outcome')
WHERE status = 'adjudicated'
  AND outcome IS NULL;

-- Existing malformed rows are surfaced as blockers. The migration does not
-- guess missing proposal recipients, adjudication outcomes, or duplicate intent.
DO $$
DECLARE
    invalid_ids TEXT;
BEGIN
    SELECT string_agg(id::TEXT, ', ' ORDER BY id::TEXT)
    INTO invalid_ids
    FROM public.actions
    WHERE artifact_type = 'proposal'
      AND (proposal_recipient_team IS NULL OR proposal_recipient_team NOT IN ('blue', 'red'))
      AND COALESCE(is_deleted, false) = false;

    IF invalid_ids IS NOT NULL THEN
        RAISE EXCEPTION
            'Cannot apply action integrity patch: active proposal rows require a Blue or Red recipient. Action ids: %',
            invalid_ids
            USING ERRCODE = '23514';
    END IF;

    SELECT string_agg(id::TEXT, ', ' ORDER BY id::TEXT)
    INTO invalid_ids
    FROM public.actions
    WHERE status = 'adjudicated'
      AND (outcome IS NULL OR adjudicated_at IS NULL OR submitted_at IS NULL)
      AND COALESCE(is_deleted, false) = false;

    IF invalid_ids IS NOT NULL THEN
        RAISE EXCEPTION
            'Cannot apply action integrity patch: adjudicated rows require outcome, submitted_at, and adjudicated_at. Action ids: %',
            invalid_ids
            USING ERRCODE = '23514';
    END IF;
END;
$$;

ALTER TABLE public.actions
    ALTER COLUMN artifact_type SET DEFAULT 'action',
    ALTER COLUMN artifact_type SET NOT NULL,
    ALTER COLUMN workflow_state SET DEFAULT 'draft',
    ALTER COLUMN workflow_state SET NOT NULL;

ALTER TABLE public.actions
    DROP CONSTRAINT IF EXISTS actions_artifact_type_check,
    ADD CONSTRAINT actions_artifact_type_check CHECK (
        artifact_type IN (
            'action',
            'strategic_orientation_selection',
            'strategic_orientation_forecast',
            'proposal',
            'move_response'
        )
    ),
    DROP CONSTRAINT IF EXISTS actions_workflow_state_check,
    ADD CONSTRAINT actions_workflow_state_check CHECK (
        workflow_state IN (
            'draft',
            'forwarded_to_facilitator',
            'submitted_to_white_cell',
            'adjudicated',
            'abandoned',
            'changes_requested',
            'rejected',
            'forwarded_to_recipient'
        )
    ),
    DROP CONSTRAINT IF EXISTS actions_artifact_payload_object_check,
    ADD CONSTRAINT actions_artifact_payload_object_check CHECK (
        jsonb_typeof(artifact_payload) = 'object'
    ),
    DROP CONSTRAINT IF EXISTS actions_forecast_targets_array_check,
    ADD CONSTRAINT actions_forecast_targets_array_check CHECK (
        jsonb_typeof(forecast_targets) = 'array'
    ),
    DROP CONSTRAINT IF EXISTS actions_artifact_team_check,
    ADD CONSTRAINT actions_artifact_team_check CHECK (
        COALESCE(is_deleted, false) = true
        OR (
            (artifact_type <> 'strategic_orientation_selection' OR LOWER(team) = 'blue')
            AND (
                artifact_type <> 'strategic_orientation_forecast'
                OR LOWER(team) IN ('red', 'green', 'industry')
            )
            AND (artifact_type <> 'proposal' OR LOWER(team) IN ('green', 'industry'))
            AND (artifact_type <> 'move_response' OR LOWER(team) = 'red')
        )
    ),
    DROP CONSTRAINT IF EXISTS actions_proposal_recipient_check,
    ADD CONSTRAINT actions_proposal_recipient_check CHECK (
        COALESCE(is_deleted, false) = true
        OR (
            (
                artifact_type = 'proposal'
                AND COALESCE(proposal_recipient_team IN ('blue', 'red'), false)
            )
            OR (artifact_type <> 'proposal' AND proposal_recipient_team IS NULL)
        )
    ),
    DROP CONSTRAINT IF EXISTS actions_workflow_status_consistency_check,
    ADD CONSTRAINT actions_workflow_status_consistency_check CHECK (
        (status = 'draft' AND workflow_state IN ('draft', 'forwarded_to_facilitator'))
        OR (status = 'submitted' AND workflow_state = 'submitted_to_white_cell')
        OR (
            status = 'adjudicated'
            AND workflow_state IN (
                'adjudicated',
                'changes_requested',
                'rejected',
                'forwarded_to_recipient'
            )
        )
        OR (status = 'abandoned' AND workflow_state = 'abandoned')
    ),
    DROP CONSTRAINT IF EXISTS actions_lifecycle_timestamp_check,
    ADD CONSTRAINT actions_lifecycle_timestamp_check CHECK (
        COALESCE(is_deleted, false) = true
        OR (
            (status = 'draft' AND submitted_at IS NULL AND adjudicated_at IS NULL)
            OR (status = 'abandoned' AND adjudicated_at IS NULL)
            OR (status = 'submitted' AND submitted_at IS NOT NULL AND adjudicated_at IS NULL)
            OR (
                status = 'adjudicated'
                AND submitted_at IS NOT NULL
                AND adjudicated_at IS NOT NULL
                AND outcome IS NOT NULL
            )
        )
    ),
    DROP CONSTRAINT IF EXISTS actions_row_version_check,
    ADD CONSTRAINT actions_row_version_check CHECK (row_version >= 1),
    DROP CONSTRAINT IF EXISTS actions_idempotency_key_check,
    ADD CONSTRAINT actions_idempotency_key_check CHECK (
        idempotency_key IS NULL OR BTRIM(idempotency_key) <> ''
    );

-- Fail before creating unique indexes so operators receive useful row ids.
DO $$
DECLARE
    duplicate_groups TEXT;
BEGIN
    SELECT string_agg(
        format('%s/%s => [%s]', session_id, team, action_ids),
        '; '
        ORDER BY session_id::TEXT, team
    )
    INTO duplicate_groups
    FROM (
        SELECT
            session_id,
            team,
            string_agg(id::TEXT, ', ' ORDER BY created_at, id) AS action_ids
        FROM public.actions
        WHERE artifact_type IN (
                'strategic_orientation_selection',
                'strategic_orientation_forecast'
            )
          AND COALESCE(is_deleted, false) = false
        GROUP BY session_id, team
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_groups IS NOT NULL THEN
        RAISE EXCEPTION
            'Cannot apply action integrity patch: duplicate Strategic Orientation artifacts exist: %',
            duplicate_groups
            USING ERRCODE = '23505';
    END IF;

    SELECT string_agg(source_proposal_id, ', ' ORDER BY source_proposal_id)
    INTO duplicate_groups
    FROM (
        SELECT metadata ->> 'source_proposal_id' AS source_proposal_id
        FROM public.communications
        WHERE type = 'PROPOSAL_FORWARDED'
          AND NULLIF(metadata ->> 'source_proposal_id', '') IS NOT NULL
        GROUP BY metadata ->> 'source_proposal_id'
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_groups IS NOT NULL THEN
        RAISE EXCEPTION
            'Cannot apply action integrity patch: proposals were forwarded more than once: %',
            duplicate_groups
            USING ERRCODE = '23505';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_one_orientation_per_session_team
    ON public.actions (session_id, team)
    WHERE artifact_type IN (
            'strategic_orientation_selection',
            'strategic_orientation_forecast'
        )
      AND COALESCE(is_deleted, false) = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_session_idempotency_key
    ON public.actions (session_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_communications_one_forward_per_proposal
    ON public.communications ((metadata ->> 'source_proposal_id'))
    WHERE type = 'PROPOSAL_FORWARDED'
      AND NULLIF(metadata ->> 'source_proposal_id', '') IS NOT NULL;

ALTER TABLE public.communications
    DROP CONSTRAINT IF EXISTS communications_proposal_forward_metadata_check,
    ADD CONSTRAINT communications_proposal_forward_metadata_check CHECK (
        type <> 'PROPOSAL_FORWARDED'
        OR COALESCE((
            NULLIF(metadata ->> 'source_proposal_id', '') IS NOT NULL
            AND metadata ->> 'recipient_team' IN ('blue', 'red')
            AND metadata ->> 'source_team' IN ('green', 'industry')
        ), false)
    );

CREATE INDEX IF NOT EXISTS idx_actions_session_artifact_workflow
    ON public.actions (session_id, artifact_type, workflow_state)
    WHERE COALESCE(is_deleted, false) = false;

-- ============================================================================
-- 2. SERVER-OWNED WORKFLOW NORMALIZATION AND VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_action_workflow_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    server_now TIMESTAMPTZ := clock_timestamp();
    current_move INTEGER;
    current_phase INTEGER;
    resolved_role TEXT;
    inferred_artifact_type TEXT;
    core_fields_changed BOOLEAN := false;
BEGIN
    resolved_role := public.live_demo_participant_role(NEW.session_id);

    inferred_artifact_type := CASE
        WHEN LOWER(COALESCE(NEW.ally_contingencies, '')) LIKE 'proposal details%' THEN 'proposal'
        WHEN LOWER(COALESCE(NEW.ally_contingencies, '')) LIKE 'move response details%' THEN 'move_response'
        WHEN LOWER(COALESCE(NEW.ally_contingencies, '')) LIKE 'strategic orientation details%'
             AND LOWER(COALESCE(NEW.team, '')) = 'blue'
            THEN 'strategic_orientation_selection'
        WHEN LOWER(COALESCE(NEW.ally_contingencies, '')) LIKE 'strategic orientation details%'
            THEN 'strategic_orientation_forecast'
        ELSE 'action'
    END;

    IF TG_OP = 'INSERT' AND (NEW.artifact_type IS NULL OR NEW.artifact_type = 'action') THEN
        NEW.artifact_type := inferred_artifact_type;
    ELSIF NEW.artifact_type IS NULL THEN
        NEW.artifact_type := inferred_artifact_type;
    END IF;

    IF NEW.artifact_type = 'proposal' AND NEW.proposal_recipient_team IS NULL THEN
        NEW.proposal_recipient_team := LOWER(
            public.action_legacy_detail(NEW.ally_contingencies, 'Recipient Team')
        );
    ELSIF NEW.artifact_type <> 'proposal' THEN
        NEW.proposal_recipient_team := NULL;
    END IF;

    IF NEW.artifact_type = 'strategic_orientation_forecast'
       AND COALESCE(NEW.forecast_targets, '[]'::jsonb) = '[]'::jsonb
       AND public.action_legacy_detail(NEW.ally_contingencies, 'Forecast Targets') IS NOT NULL THEN
        NEW.forecast_targets := jsonb_build_array(
            jsonb_build_object(
                'legacy_summary',
                public.action_legacy_detail(NEW.ally_contingencies, 'Forecast Targets')
            )
        );
    END IF;

    IF NEW.artifact_payload IS NULL
       OR NEW.artifact_payload = '{}'::jsonb
       OR (
            TG_OP = 'UPDATE'
            AND NEW.artifact_payload = OLD.artifact_payload
            AND ROW(
                NEW.mechanism,
                NEW.sector,
                NEW.exposure_type,
                NEW.targets,
                NEW.goal,
                NEW.expected_outcomes,
                NEW.ally_contingencies
            ) IS DISTINCT FROM ROW(
                OLD.mechanism,
                OLD.sector,
                OLD.exposure_type,
                OLD.targets,
                OLD.goal,
                OLD.expected_outcomes,
                OLD.ally_contingencies
            )
       ) THEN
        NEW.artifact_payload := jsonb_strip_nulls(
            jsonb_build_object(
                'mechanism', NEW.mechanism,
                'sector', NEW.sector,
                'exposure_type', NEW.exposure_type,
                'targets', NEW.targets,
                'goal', NEW.goal,
                'expected_outcomes', NEW.expected_outcomes,
                'legacy_details', NEW.ally_contingencies
            )
        );
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status NOT IN ('draft', 'submitted') THEN
            RAISE EXCEPTION 'New artifacts must begin in draft or submitted state.'
                USING ERRCODE = '23514';
        END IF;

        SELECT gs.move, gs.phase
        INTO current_move, current_phase
        FROM public.game_state gs
        WHERE gs.session_id = NEW.session_id;

        IF current_move IS NULL OR current_phase IS NULL THEN
            RAISE EXCEPTION 'Cannot create an artifact without initialized game state.'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.move <> current_move OR NEW.phase <> current_phase THEN
            RAISE EXCEPTION
                'Artifact move/phase %/% does not match current game state %/%.',
                NEW.move,
                NEW.phase,
                current_move,
                current_phase
                USING ERRCODE = '23514';
        END IF;

        NEW.created_at := server_now;
        NEW.updated_at := server_now;
        NEW.row_version := 1;
        NEW.created_by_auth_user_id := COALESCE(NEW.created_by_auth_user_id, auth.uid());
        NEW.created_by_role := COALESCE(NEW.created_by_role, resolved_role);
    ELSE
        core_fields_changed := ROW(
            NEW.session_id,
            NEW.move,
            NEW.phase,
            NEW.team,
            NEW.artifact_type,
            NEW.mechanism,
            NEW.sector,
            NEW.exposure_type,
            NEW.targets,
            NEW.goal,
            NEW.expected_outcomes,
            NEW.ally_contingencies
        ) IS DISTINCT FROM ROW(
            OLD.session_id,
            OLD.move,
            OLD.phase,
            OLD.team,
            OLD.artifact_type,
            OLD.mechanism,
            OLD.sector,
            OLD.exposure_type,
            OLD.targets,
            OLD.goal,
            OLD.expected_outcomes,
            OLD.ally_contingencies
        );

        IF OLD.status IN ('submitted', 'adjudicated')
           AND NEW.status = OLD.status
           AND core_fields_changed THEN
            RAISE EXCEPTION 'Submitted and adjudicated artifact content is immutable.'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
            (OLD.status = 'draft' AND NEW.status IN ('submitted', 'abandoned'))
            OR (OLD.status = 'submitted' AND NEW.status = 'adjudicated')
        ) THEN
            RAISE EXCEPTION 'Invalid action status transition: % -> %.', OLD.status, NEW.status
                USING ERRCODE = '23514';
        END IF;

        IF OLD.is_deleted = true AND NEW.is_deleted = false THEN
            RAISE EXCEPTION 'Soft-deleted artifacts cannot be restored in place.'
                USING ERRCODE = '23514';
        END IF;

        IF COALESCE(OLD.is_deleted, false) = false
           AND NEW.is_deleted = true
           AND OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Only draft artifacts can be soft deleted.'
                USING ERRCODE = '23514';
        END IF;

        NEW.updated_at := server_now;
        NEW.row_version := OLD.row_version + 1;
    END IF;

    IF NEW.is_deleted = true AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_deleted, false) = false) THEN
        NEW.deleted_at := server_now;
    END IF;

    NEW.last_modified_by_auth_user_id := auth.uid();
    NEW.last_modified_by_role := resolved_role;

    IF NEW.status = 'draft' THEN
        NEW.submitted_at := NULL;
        NEW.adjudicated_at := NULL;
        NEW.workflow_state := CASE
            WHEN LOWER(COALESCE(NEW.ally_contingencies, '')) LIKE '%scribe handoff: forwarded%'
                THEN 'forwarded_to_facilitator'
            ELSE 'draft'
        END;
    ELSIF NEW.status = 'submitted' THEN
        IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'submitted' THEN
            NEW.submitted_at := server_now;
            NEW.submitted_by_auth_user_id := auth.uid();
            NEW.submitted_by_role := resolved_role;
        END IF;
        NEW.adjudicated_at := NULL;
        NEW.workflow_state := 'submitted_to_white_cell';
    ELSIF NEW.status = 'adjudicated' THEN
        IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'adjudicated' THEN
            NEW.adjudicated_at := server_now;
        END IF;
        NEW.workflow_state := CASE
            WHEN NEW.artifact_type = 'proposal'
                 AND NEW.adjudication ->> 'proposal_review_decision' = 'forward_to_recipient'
                THEN 'forwarded_to_recipient'
            WHEN NEW.artifact_type = 'proposal'
                 AND NEW.adjudication ->> 'proposal_review_decision' = 'request_changes'
                THEN 'changes_requested'
            WHEN NEW.artifact_type = 'proposal'
                 AND NEW.adjudication ->> 'proposal_review_decision' = 'reject'
                THEN 'rejected'
            ELSE 'adjudicated'
        END;
    ELSIF NEW.status = 'abandoned' THEN
        NEW.adjudicated_at := NULL;
        NEW.workflow_state := 'abandoned';
    END IF;

    IF NEW.status IN ('submitted', 'adjudicated') AND NEW.submitted_at IS NULL THEN
        NEW.submitted_at := server_now;
    END IF;

    IF NEW.status = 'adjudicated' AND NEW.outcome IS NULL THEN
        NEW.outcome := NEW.adjudication ->> 'outcome';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'submitted' THEN
        NEW.draft_duration_seconds := GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (NEW.submitted_at - OLD.created_at)))::INTEGER
        );
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' AND NEW.status = 'adjudicated' THEN
        NEW.submission_to_adjudication_seconds := GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (NEW.adjudicated_at - OLD.submitted_at)))::INTEGER
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_action_workflow_write ON public.actions;
CREATE TRIGGER normalize_action_workflow_write
    BEFORE INSERT OR UPDATE ON public.actions
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_action_workflow_write();

COMMENT ON FUNCTION public.normalize_action_workflow_write() IS
    'Server-owned action normalization, lifecycle timestamps, state transitions, artifact classification, and current-game-state validation.';

-- ============================================================================
-- 3. COMPLETE MUTATION AUDIT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_action_workflow_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor_role TEXT := public.live_demo_participant_role(NEW.session_id);
    change_kind TEXT;
    research_event_type TEXT;
    previous_json JSONB;
    current_json JSONB;
BEGIN
    previous_json := CASE
        WHEN TG_OP = 'INSERT' THEN NULL
        ELSE to_jsonb(OLD)
            - 'created_by_auth_user_id'
            - 'submitted_by_auth_user_id'
            - 'last_modified_by_auth_user_id'
    END;
    current_json := to_jsonb(NEW)
        - 'created_by_auth_user_id'
        - 'submitted_by_auth_user_id'
        - 'last_modified_by_auth_user_id';

    change_kind := CASE
        WHEN TG_OP = 'INSERT' THEN 'created'
        WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_transition'
        WHEN OLD.workflow_state IS DISTINCT FROM NEW.workflow_state THEN 'workflow_transition'
        WHEN OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN 'soft_delete'
        ELSE 'revision'
    END;

    -- operator_adjudicate_action already writes its adjudication action_log.
    -- Every other insert/update is logged here, including draft revisions and
    -- handoff/submission transitions.
    IF NOT (
        TG_OP = 'UPDATE'
        AND OLD.status = 'submitted'
        AND NEW.status = 'adjudicated'
    ) THEN
        INSERT INTO public.action_logs (
            action_id,
            session_id,
            client_id,
            changed_by_role,
            changed_by_auth_user_id,
            previous_state,
            new_state,
            status_from,
            status_to,
            transition_duration_seconds,
            change_kind,
            artifact_type,
            workflow_state_from,
            workflow_state_to,
            row_version
        )
        VALUES (
            NEW.id,
            NEW.session_id,
            auth.uid()::TEXT,
            actor_role,
            auth.uid(),
            previous_json,
            current_json,
            CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
            NEW.status,
            CASE
                WHEN TG_OP = 'UPDATE'
                    THEN GREATEST(
                        0,
                        FLOOR(EXTRACT(EPOCH FROM (NEW.updated_at - COALESCE(OLD.updated_at, OLD.created_at))))::INTEGER
                    )
                ELSE 0
            END,
            change_kind,
            NEW.artifact_type,
            CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.workflow_state END,
            NEW.workflow_state,
            NEW.row_version
        );
    END IF;

    research_event_type := CASE
        WHEN NEW.artifact_type = 'proposal'
             AND NEW.status = 'submitted'
             AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
            THEN 'PROPOSAL_SUBMITTED'
        WHEN NEW.artifact_type = 'proposal' AND TG_OP = 'INSERT'
            THEN 'PROPOSAL_CREATED'
        WHEN NEW.artifact_type = 'proposal' AND NEW.workflow_state = 'forwarded_to_recipient'
             AND (TG_OP = 'INSERT' OR OLD.workflow_state IS DISTINCT FROM NEW.workflow_state)
            THEN 'PROPOSAL_FORWARDED'
        WHEN NEW.artifact_type = 'proposal' AND NEW.workflow_state = 'changes_requested'
             AND (TG_OP = 'INSERT' OR OLD.workflow_state IS DISTINCT FROM NEW.workflow_state)
            THEN 'PROPOSAL_CHANGES_REQUESTED'
        WHEN NEW.artifact_type = 'proposal' AND NEW.workflow_state = 'rejected'
             AND (TG_OP = 'INSERT' OR OLD.workflow_state IS DISTINCT FROM NEW.workflow_state)
            THEN 'PROPOSAL_REJECTED'
        WHEN NEW.artifact_type = 'move_response' AND NEW.status = 'submitted'
             AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
            THEN 'MOVE_RESPONSE_SUBMITTED'
        WHEN NEW.status = 'adjudicated' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
            THEN 'ACTION_ADJUDICATED'
        WHEN NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
            THEN 'ACTION_SUBMITTED'
        ELSE 'ACTION_DRAFT_SAVED'
    END;

    -- Serialize the per-session hash chain before calling record_research_event.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.session_id::TEXT, 0));

    PERFORM public.record_research_event(
        NEW.session_id,
        NEW.updated_at,
        NULL,
        NULL,
        actor_role,
        NEW.team,
        NULL,
        research_event_type,
        NEW.artifact_type,
        NEW.id,
        NEW.move,
        NULL,
        NULL,
        NULL,
        previous_json,
        current_json,
        jsonb_build_object(
            'change_kind', change_kind,
            'workflow_state', NEW.workflow_state,
            'row_version', NEW.row_version
        ),
        NEW.phase::TEXT
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_action_workflow_write ON public.actions;
CREATE TRIGGER audit_action_workflow_write
    AFTER INSERT OR UPDATE ON public.actions
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_action_workflow_write();

COMMENT ON FUNCTION public.audit_action_workflow_write() IS
    'Logs every action creation, revision, handoff, submission, soft deletion, and workflow transition; also appends a serialized research audit event.';

-- ============================================================================
-- 4. ATOMIC AND IDEMPOTENT PROPOSAL REVIEW/FORWARDING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.operator_review_proposal(
    requested_action_id UUID,
    requested_review_decision TEXT,
    requested_recipient_team TEXT DEFAULT NULL,
    requested_adjudication_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    action_row public.actions%ROWTYPE;
    updated_action public.actions%ROWTYPE;
    created_communication public.communications%ROWTYPE;
    created_review_timeline public.timeline%ROWTYPE;
    created_forward_timeline public.timeline%ROWTYPE;
    existing_communication public.communications%ROWTYPE;
    normalized_decision TEXT := LOWER(NULLIF(BTRIM(requested_review_decision), ''));
    normalized_recipient TEXT := LOWER(NULLIF(BTRIM(requested_recipient_team), ''));
    resolved_recipient TEXT;
    resolved_outcome TEXT;
    review_label TEXT;
    proposal_snapshot JSONB;
    originators_text TEXT;
    instruments_text TEXT;
BEGIN
    SELECT *
    INTO action_row
    FROM public.actions
    WHERE id = requested_action_id
      AND COALESCE(is_deleted, false) = false
    FOR UPDATE;

    IF action_row.id IS NULL THEN
        RAISE EXCEPTION 'Proposal action not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF action_row.artifact_type <> 'proposal' THEN
        RAISE EXCEPTION 'Only proposal artifacts can use operator_review_proposal.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_decision NOT IN ('forward_to_recipient', 'request_changes', 'reject') THEN
        RAISE EXCEPTION 'Unsupported proposal review decision.'
            USING ERRCODE = '22023';
    END IF;

    resolved_recipient := COALESCE(normalized_recipient, action_row.proposal_recipient_team);

    IF normalized_decision = 'forward_to_recipient'
       AND resolved_recipient NOT IN ('blue', 'red') THEN
        RAISE EXCEPTION 'Forwarded proposals require a Blue or Red recipient.'
            USING ERRCODE = '23514';
    END IF;

    IF normalized_decision = 'forward_to_recipient'
       AND action_row.proposal_recipient_team IS DISTINCT FROM resolved_recipient THEN
        RAISE EXCEPTION 'Requested proposal recipient does not match the persisted proposal recipient.'
            USING ERRCODE = '23514';
    END IF;

    -- Same-decision retries return the already committed result. Different
    -- decisions against an adjudicated proposal fail closed.
    IF action_row.status = 'adjudicated' THEN
        IF action_row.adjudication ->> 'proposal_review_decision' IS DISTINCT FROM normalized_decision THEN
            RAISE EXCEPTION 'This proposal already has a different final review decision.'
                USING ERRCODE = '23514';
        END IF;

        SELECT *
        INTO existing_communication
        FROM public.communications
        WHERE type = 'PROPOSAL_FORWARDED'
          AND metadata ->> 'source_proposal_id' = action_row.id::TEXT
        ORDER BY created_at, id
        LIMIT 1;

        RETURN jsonb_build_object(
            'action', to_jsonb(action_row),
            'communication', CASE
                WHEN existing_communication.id IS NULL THEN NULL
                ELSE to_jsonb(existing_communication)
            END,
            'timeline_events', COALESCE(
                (
                    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at, t.id)
                    FROM public.timeline t
                    WHERE t.metadata ->> 'related_id' = action_row.id::TEXT
                      AND t.type IN ('ACTION_ADJUDICATED', 'PROPOSAL_FORWARDED')
                ),
                '[]'::jsonb
            ),
            'idempotent_replay', true
        );
    END IF;

    IF action_row.status <> 'submitted' THEN
        RAISE EXCEPTION 'Only submitted proposals can be reviewed.'
            USING ERRCODE = '23514';
    END IF;

    resolved_outcome := CASE normalized_decision
        WHEN 'forward_to_recipient' THEN 'SUCCESS'
        WHEN 'request_changes' THEN 'PARTIAL_SUCCESS'
        ELSE 'FAIL'
    END;

    review_label := CASE normalized_decision
        WHEN 'forward_to_recipient' THEN format('Forwarded to %s Team', INITCAP(resolved_recipient))
        WHEN 'request_changes' THEN 'Changes requested'
        ELSE 'Rejected'
    END;

    -- Reuse the existing protected adjudication function. All following writes
    -- share this transaction; any failure rolls the adjudication back as well.
    updated_action := public.operator_adjudicate_action(
        action_row.id,
        resolved_outcome,
        requested_adjudication_notes,
        NULL
    );

    UPDATE public.actions
    SET
        proposal_recipient_team = CASE
            WHEN normalized_decision = 'forward_to_recipient' THEN resolved_recipient
            ELSE proposal_recipient_team
        END,
        adjudication = COALESCE(adjudication, '{}'::jsonb) || jsonb_build_object(
            'proposal_review_decision', normalized_decision,
            'proposal_recipient_team', resolved_recipient
        ),
        artifact_payload = COALESCE(artifact_payload, '{}'::jsonb) || jsonb_build_object(
            'proposal_review', jsonb_strip_nulls(jsonb_build_object(
                'decision', normalized_decision,
                'recipient_team', resolved_recipient,
                'reviewed_at', clock_timestamp()
            ))
        )
    WHERE id = action_row.id
    RETURNING *
    INTO updated_action;

    INSERT INTO public.timeline (
        session_id,
        move,
        phase,
        team,
        type,
        content,
        client_id,
        metadata
    )
    VALUES (
        updated_action.session_id,
        updated_action.move,
        updated_action.phase,
        'white_cell',
        'ACTION_ADJUDICATED',
        'Proposal review recorded: ' || review_label,
        auth.uid()::TEXT,
        jsonb_strip_nulls(jsonb_build_object(
            'related_id', updated_action.id,
            'role', public.live_demo_participant_role(updated_action.session_id),
            'proposal_review_decision', normalized_decision,
            'proposal_recipient_team', resolved_recipient,
            'proposal', true
        ))
    )
    RETURNING *
    INTO created_review_timeline;

    IF normalized_decision = 'forward_to_recipient' THEN
        originators_text := public.action_legacy_detail(
            updated_action.ally_contingencies,
            'Originators'
        );
        instruments_text := public.action_legacy_detail(
            updated_action.ally_contingencies,
            'Instruments'
        );

        proposal_snapshot := jsonb_strip_nulls(jsonb_build_object(
            'title', updated_action.goal,
            'originators', CASE
                WHEN originators_text IS NULL OR originators_text = 'None selected' THEN '[]'::jsonb
                ELSE to_jsonb(regexp_split_to_array(originators_text, '[[:space:]]*,[[:space:]]*'))
            END,
            'objective', public.action_legacy_detail(updated_action.ally_contingencies, 'Objective'),
            'instruments', CASE
                WHEN instruments_text IS NULL OR instruments_text = 'None selected' THEN '[]'::jsonb
                WHEN instruments_text ~ '^[[:space:]]*\[' THEN instruments_text::jsonb
                ELSE to_jsonb(regexp_split_to_array(instruments_text, '[[:space:]]*,[[:space:]]*'))
            END,
            'category', public.action_legacy_detail(updated_action.ally_contingencies, 'Category'),
            'intendedPartners', public.action_legacy_detail(updated_action.ally_contingencies, 'Intended Partners'),
            'focusSector', updated_action.sector,
            'delivery', public.action_legacy_detail(updated_action.ally_contingencies, 'Delivery'),
            'timingAndConditions', public.action_legacy_detail(updated_action.ally_contingencies, 'Timing And Conditions'),
            'expectedOutcomes', updated_action.expected_outcomes
        ));

        INSERT INTO public.communications (
            session_id,
            move,
            from_role,
            to_role,
            type,
            title,
            content,
            client_id,
            metadata
        )
        VALUES (
            updated_action.session_id,
            updated_action.move,
            'white_cell',
            resolved_recipient,
            'PROPOSAL_FORWARDED',
            updated_action.goal,
            format(
                'Forwarded %s Team proposal after White Cell review: %s',
                INITCAP(updated_action.team),
                COALESCE(NULLIF(BTRIM(updated_action.goal), ''), 'Untitled proposal')
            ),
            auth.uid()::TEXT,
            jsonb_build_object(
                'source_proposal_id', updated_action.id,
                'source_team', updated_action.team,
                'recipient_team', resolved_recipient,
                'outcome', resolved_outcome,
                'review_decision', normalized_decision,
                'review_stage', 'forwarded_to_recipient',
                'proposal', proposal_snapshot,
                'proposal_recipient_state', jsonb_build_object(
                    'status', 'unread',
                    'updated_at', clock_timestamp()
                ),
                'operator_role', public.live_demo_participant_role(updated_action.session_id),
                'operator_auth_user_id', auth.uid()
            )
        )
        RETURNING *
        INTO created_communication;

        INSERT INTO public.timeline (
            session_id,
            move,
            phase,
            team,
            type,
            content,
            client_id,
            metadata
        )
        VALUES (
            updated_action.session_id,
            updated_action.move,
            updated_action.phase,
            'white_cell',
            'PROPOSAL_FORWARDED',
            format(
                '%s Team proposal forwarded to %s Team after White Cell approval: %s',
                INITCAP(updated_action.team),
                INITCAP(resolved_recipient),
                COALESCE(NULLIF(BTRIM(updated_action.goal), ''), 'Untitled proposal')
            ),
            auth.uid()::TEXT,
            jsonb_build_object(
                'related_id', updated_action.id,
                'role', public.live_demo_participant_role(updated_action.session_id),
                'source_team', updated_action.team,
                'recipient_team', resolved_recipient,
                'outcome', resolved_outcome,
                'review_decision', normalized_decision,
                'review_stage', 'forwarded_to_recipient',
                'proposal', true
            )
        )
        RETURNING *
        INTO created_forward_timeline;
    END IF;

    RETURN jsonb_build_object(
        'action', to_jsonb(updated_action),
        'communication', CASE
            WHEN created_communication.id IS NULL THEN NULL
            ELSE to_jsonb(created_communication)
        END,
        'timeline_events', jsonb_build_array(to_jsonb(created_review_timeline))
            || CASE
                WHEN created_forward_timeline.id IS NULL THEN '[]'::jsonb
                ELSE jsonb_build_array(to_jsonb(created_forward_timeline))
            END,
        'idempotent_replay', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.operator_review_proposal(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_review_proposal(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.operator_review_proposal(UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.operator_review_proposal(UUID, TEXT, TEXT, TEXT) IS
    'Atomically and idempotently adjudicates a submitted proposal, records review timelines, and forwards approved proposals to their persisted recipient.';

COMMENT ON COLUMN public.actions.artifact_type IS
    'First-class artifact discriminator; legacy details prefixes are compatibility input only.';
COMMENT ON COLUMN public.actions.workflow_state IS
    'Operational workflow state aligned with, but more specific than, the legacy status column.';
COMMENT ON COLUMN public.actions.artifact_payload IS
    'Structured artifact snapshot. Existing text details remain during compatibility migration.';
COMMENT ON COLUMN public.actions.forecast_targets IS
    'Structured Strategic Orientation forecast targets; legacy rows retain a bounded legacy_summary entry.';
COMMENT ON COLUMN public.actions.idempotency_key IS
    'Optional caller-generated command key, unique within a session.';
COMMENT ON COLUMN public.actions.row_version IS
    'Monotonic server-managed version for optimistic concurrency and audit ordering.';

COMMIT;
