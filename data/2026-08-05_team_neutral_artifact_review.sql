-- Fractured Order
-- Team-neutral artifact workflow and White Cell review contract
--
-- Apply after:
--   2026-07-14_action_artifact_workflow_integrity.sql
--   2026-07-17_pli_adjudications.sql
--   2026-07-29_return_action_to_blue.sql
--
-- This migration is additive. It deliberately does not UPDATE historical rows.
-- Existing returned_to_blue values remain valid and readable. New review writes
-- use returned_to_team and the richer workflow_state lifecycle while retaining
-- the legacy status values consumed by existing clients.

BEGIN;

-- ============================================================================
-- 1. TEAM-NEUTRAL WORKFLOW METADATA
-- ============================================================================

ALTER TABLE public.actions
    ADD COLUMN IF NOT EXISTS revision_number BIGINT,
    ADD COLUMN IF NOT EXISTS prior_workflow_state TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by_auth_user_id UUID,
    ADD COLUMN IF NOT EXISTS reviewed_by_role TEXT,
    ADD COLUMN IF NOT EXISTS review_notes TEXT,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Set defaults only for future rows. Historical NULL revision_number values are
-- retained so readers can identify pre-contract records without inventing a
-- revision history.
ALTER TABLE public.actions
    ALTER COLUMN revision_number SET DEFAULT 1;

ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS workflow_state TEXT,
    ADD COLUMN IF NOT EXISTS revision_number BIGINT,
    ADD COLUMN IF NOT EXISTS prior_workflow_state TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by_auth_user_id UUID,
    ADD COLUMN IF NOT EXISTS reviewed_by_role TEXT,
    ADD COLUMN IF NOT EXISTS review_notes TEXT,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Future RFIs enter the White Cell queue immediately. Existing rows remain NULL
-- and are labeled from their unchanged status by application compatibility code.
ALTER TABLE public.requests
    ALTER COLUMN workflow_state SET DEFAULT 'submitted_to_white_cell',
    ALTER COLUMN revision_number SET DEFAULT 1;

ALTER TABLE public.actions
    DROP CONSTRAINT IF EXISTS actions_workflow_state_check,
    ADD CONSTRAINT actions_workflow_state_check CHECK (
        workflow_state IN (
            'draft',
            'forwarded_to_facilitator',
            'submitted_to_white_cell',
            'returned_to_team',
            'resubmitted',
            'completed',
            -- Historical/adjacent workflow values remain compatible.
            'returned_to_blue',
            'adjudicated',
            'abandoned',
            'changes_requested',
            'rejected',
            'forwarded_to_recipient'
        )
    ),
    DROP CONSTRAINT IF EXISTS actions_workflow_status_consistency_check,
    ADD CONSTRAINT actions_workflow_status_consistency_check CHECK (
        (
            status = 'draft'
            AND workflow_state IN (
                'draft',
                'forwarded_to_facilitator',
                'returned_to_team',
                'returned_to_blue'
            )
        )
        OR (
            status = 'submitted'
            AND workflow_state IN ('submitted_to_white_cell', 'resubmitted')
        )
        OR (
            status = 'adjudicated'
            AND workflow_state IN (
                'completed',
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
                AND (workflow_state = 'completed' OR outcome IS NOT NULL)
            )
        )
    ),
    DROP CONSTRAINT IF EXISTS actions_revision_number_check,
    ADD CONSTRAINT actions_revision_number_check CHECK (
        revision_number IS NULL OR revision_number >= 1
    );

ALTER TABLE public.requests
    DROP CONSTRAINT IF EXISTS requests_workflow_state_check,
    ADD CONSTRAINT requests_workflow_state_check CHECK (
        workflow_state IS NULL
        OR workflow_state IN (
            'draft',
            'forwarded_to_facilitator',
            'submitted_to_white_cell',
            'returned_to_team',
            'resubmitted',
            'completed'
        )
    ),
    DROP CONSTRAINT IF EXISTS requests_workflow_status_consistency_check,
    ADD CONSTRAINT requests_workflow_status_consistency_check CHECK (
        -- NULL is reserved for untouched historical rows.
        workflow_state IS NULL
        OR (status = 'pending' AND workflow_state <> 'completed')
        OR (status IN ('answered', 'withdrawn') AND workflow_state = 'completed')
    ),
    DROP CONSTRAINT IF EXISTS requests_revision_number_check,
    ADD CONSTRAINT requests_revision_number_check CHECK (
        revision_number IS NULL OR revision_number >= 1
    );

CREATE TABLE IF NOT EXISTS public.artifact_workflow_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    artifact_kind TEXT NOT NULL CHECK (
        artifact_kind IN ('action', 'strategic_orientation', 'rfi')
    ),
    artifact_id UUID NOT NULL,
    artifact_type TEXT NOT NULL,
    team TEXT NOT NULL CHECK (LOWER(team) IN ('blue', 'red', 'green', 'industry')),
    decision TEXT NOT NULL CHECK (
        decision IN ('complete', 'return_to_team', 'return_for_clarification')
    ),
    revision_number BIGINT NOT NULL CHECK (revision_number >= 1),
    next_revision_number BIGINT NOT NULL CHECK (next_revision_number >= revision_number),
    prior_status TEXT NOT NULL,
    status_to TEXT NOT NULL,
    prior_workflow_state TEXT,
    workflow_state_to TEXT NOT NULL,
    reviewer_auth_user_id UUID NOT NULL,
    reviewer_role TEXT NOT NULL,
    reviewer_notes TEXT,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    prior_state JSONB NOT NULL,
    new_state JSONB NOT NULL,
    CONSTRAINT artifact_workflow_reviews_return_notes_check CHECK (
        decision = 'complete'
        OR NULLIF(BTRIM(reviewer_notes), '') IS NOT NULL
    )
);

ALTER TABLE public.artifact_workflow_reviews
    DROP CONSTRAINT IF EXISTS artifact_workflow_reviews_team_check,
    ADD CONSTRAINT artifact_workflow_reviews_team_check CHECK (
        LOWER(team) IN ('blue', 'red', 'green', 'industry')
    ),
    DROP CONSTRAINT IF EXISTS artifact_workflow_reviews_return_notes_check,
    ADD CONSTRAINT artifact_workflow_reviews_return_notes_check CHECK (
        decision = 'complete' OR NULLIF(BTRIM(reviewer_notes), '') IS NOT NULL
    );

CREATE INDEX IF NOT EXISTS idx_artifact_workflow_reviews_artifact
    ON public.artifact_workflow_reviews (artifact_kind, artifact_id, revision_number);

CREATE INDEX IF NOT EXISTS idx_artifact_workflow_reviews_session
    ON public.artifact_workflow_reviews (session_id, reviewed_at DESC);

ALTER TABLE public.artifact_workflow_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS artifact_workflow_reviews_select
    ON public.artifact_workflow_reviews;

CREATE POLICY artifact_workflow_reviews_select
    ON public.artifact_workflow_reviews FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

REVOKE ALL ON public.artifact_workflow_reviews FROM PUBLIC;
REVOKE ALL ON public.artifact_workflow_reviews FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
    ON public.artifact_workflow_reviews FROM authenticated;
GRANT SELECT ON public.artifact_workflow_reviews TO authenticated;

COMMENT ON TABLE public.artifact_workflow_reviews IS
    'Append-only White Cell artifact review transitions. Writes are owned by operator_review_artifact.';

-- ============================================================================
-- 2. ACTION WORKFLOW NORMALIZATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_action_workflow_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $normalize$
DECLARE
    server_now TIMESTAMPTZ := clock_timestamp();
    current_move INTEGER;
    current_phase INTEGER;
    resolved_role TEXT;
    inferred_artifact_type TEXT;
    core_fields_changed BOOLEAN := false;
    requested_workflow_state TEXT := NEW.workflow_state;
    returning_to_team BOOLEAN := false;
    reviewer_authorized BOOLEAN := false;
BEGIN
    resolved_role := public.live_demo_participant_role(NEW.session_id);
    reviewer_authorized := (
        auth.uid() IS NOT NULL
        AND resolved_role IS NOT NULL
        AND public.live_demo_participant_surface(NEW.session_id) = 'whitecell'
        AND public.live_demo_has_operator_grant(
            'whitecell',
            NEW.session_id,
            public.live_demo_participant_team(NEW.session_id),
            resolved_role
        )
    );

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
        NEW.revision_number := COALESCE(NEW.revision_number, 1);
        NEW.created_by_auth_user_id := COALESCE(NEW.created_by_auth_user_id, auth.uid());
        NEW.created_by_role := COALESCE(NEW.created_by_role, resolved_role);
    ELSE
        IF OLD.workflow_state = 'completed' THEN
            RAISE EXCEPTION 'Completed artifacts are immutable.'
                USING ERRCODE = '23514';
        END IF;

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

        returning_to_team := (
            OLD.status IN ('submitted', 'adjudicated')
            AND NEW.status = 'draft'
            AND requested_workflow_state IN ('returned_to_team', 'returned_to_blue')
            AND reviewer_authorized
        );

        IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
            (OLD.status = 'draft' AND NEW.status IN ('submitted', 'abandoned'))
            OR (OLD.status = 'submitted' AND NEW.status = 'adjudicated')
            OR returning_to_team
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
        NEW.completed_at := NULL;
        IF TG_OP = 'UPDATE' AND returning_to_team THEN
            NEW.workflow_state := requested_workflow_state;
            NEW.outcome := NULL;
        ELSIF TG_OP = 'UPDATE'
              AND OLD.workflow_state IN ('returned_to_team', 'returned_to_blue') THEN
            NEW.workflow_state := OLD.workflow_state;
        ELSE
            NEW.workflow_state := CASE
                WHEN LOWER(COALESCE(NEW.ally_contingencies, '')) LIKE '%scribe handoff: forwarded%'
                    THEN 'forwarded_to_facilitator'
                ELSE 'draft'
            END;
        END IF;
    ELSIF NEW.status = 'submitted' THEN
        IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'submitted' THEN
            NEW.submitted_at := server_now;
            NEW.submitted_by_auth_user_id := auth.uid();
            NEW.submitted_by_role := resolved_role;
        END IF;
        NEW.adjudicated_at := NULL;
        NEW.completed_at := NULL;
        NEW.workflow_state := CASE
            WHEN TG_OP = 'UPDATE'
                 AND OLD.workflow_state IN ('returned_to_team', 'returned_to_blue')
                THEN 'resubmitted'
            WHEN TG_OP = 'UPDATE' AND OLD.workflow_state = 'resubmitted'
                THEN 'resubmitted'
            ELSE 'submitted_to_white_cell'
        END;
    ELSIF NEW.status = 'adjudicated' THEN
        IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'adjudicated' THEN
            NEW.adjudicated_at := server_now;
        END IF;
        IF requested_workflow_state = 'completed' AND reviewer_authorized THEN
            NEW.workflow_state := 'completed';
            NEW.completed_at := COALESCE(NEW.completed_at, server_now);
            NEW.outcome := NULL;
        ELSE
            NEW.completed_at := NULL;
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
        END IF;
    ELSIF NEW.status = 'abandoned' THEN
        NEW.adjudicated_at := NULL;
        NEW.completed_at := NULL;
        NEW.workflow_state := 'abandoned';
    END IF;

    IF NEW.status IN ('submitted', 'adjudicated') AND NEW.submitted_at IS NULL THEN
        NEW.submitted_at := server_now;
    END IF;

    IF NEW.status = 'adjudicated'
       AND NEW.workflow_state <> 'completed'
       AND NEW.outcome IS NULL THEN
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
$normalize$;

CREATE OR REPLACE FUNCTION public.normalize_request_workflow_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $request_workflow$
DECLARE
    reviewer_role TEXT := public.live_demo_participant_role(NEW.session_id);
    reviewer_authorized BOOLEAN := false;
    content_changed BOOLEAN := false;
BEGIN
    reviewer_authorized := (
        auth.uid() IS NOT NULL
        AND reviewer_role IS NOT NULL
        AND public.live_demo_participant_surface(NEW.session_id) = 'whitecell'
        AND public.live_demo_has_operator_grant(
            'whitecell',
            NEW.session_id,
            public.live_demo_participant_team(NEW.session_id),
            reviewer_role
        )
    );

    IF TG_OP = 'INSERT' THEN
        NEW.workflow_state := COALESCE(NEW.workflow_state, 'submitted_to_white_cell');
        NEW.revision_number := COALESCE(NEW.revision_number, 1);
        RETURN NEW;
    END IF;

    IF OLD.status IN ('answered', 'withdrawn') OR OLD.workflow_state = 'completed' THEN
        RAISE EXCEPTION 'Completed artifacts are immutable.'
            USING ERRCODE = '23514';
    END IF;

    content_changed := ROW(
        NEW.session_id,
        NEW.move,
        NEW.phase,
        NEW.team,
        NEW.priority,
        NEW.categories,
        NEW.query
    ) IS DISTINCT FROM ROW(
        OLD.session_id,
        OLD.move,
        OLD.phase,
        OLD.team,
        OLD.priority,
        OLD.categories,
        OLD.query
    );

    IF content_changed AND NOT reviewer_authorized THEN
        IF OLD.workflow_state = 'returned_to_team' THEN
            NEW.workflow_state := 'resubmitted';
            NEW.revision_number := COALESCE(OLD.revision_number, 1);
        ELSE
            NEW.workflow_state := 'resubmitted';
            NEW.revision_number := COALESCE(OLD.revision_number, 1) + 1;
        END IF;
    ELSIF NOT reviewer_authorized AND (
        NEW.workflow_state IS DISTINCT FROM OLD.workflow_state
        OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
    ) THEN
        -- Participant clients cannot forge review transitions.
        NEW.workflow_state := OLD.workflow_state;
        NEW.revision_number := OLD.revision_number;
    END IF;

    RETURN NEW;
END;
$request_workflow$;

DROP TRIGGER IF EXISTS normalize_request_workflow_write ON public.requests;
CREATE TRIGGER normalize_request_workflow_write
    BEFORE INSERT OR UPDATE ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_request_workflow_write();

-- ============================================================================
-- 3. ONE WHITE CELL REVIEW RPC FOR ACTIONS, ORIENTATIONS, AND RFIS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.operator_review_artifact(
    requested_artifact_kind TEXT,
    requested_artifact_id UUID,
    requested_review_decision TEXT,
    requested_team TEXT,
    requested_expected_revision BIGINT,
    requested_reviewer_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $review$
DECLARE
    normalized_kind TEXT := LOWER(NULLIF(BTRIM(requested_artifact_kind), ''));
    normalized_decision TEXT := LOWER(NULLIF(BTRIM(requested_review_decision), ''));
    normalized_team TEXT := LOWER(NULLIF(BTRIM(requested_team), ''));
    normalized_notes TEXT := NULLIF(BTRIM(COALESCE(requested_reviewer_notes, '')), '');
    action_row public.actions%ROWTYPE;
    updated_action public.actions%ROWTYPE;
    request_row public.requests%ROWTYPE;
    updated_request public.requests%ROWTYPE;
    review_row public.artifact_workflow_reviews%ROWTYPE;
    reviewer_role TEXT;
    effective_workflow_state TEXT;
    effective_revision BIGINT;
    next_revision BIGINT;
    reviewed_at_value TIMESTAMPTZ := clock_timestamp();
    stored_artifact_kind TEXT;
BEGIN
    IF normalized_kind NOT IN ('action', 'strategic_orientation', 'rfi') THEN
        RAISE EXCEPTION 'Unsupported artifact kind.'
            USING ERRCODE = '22023';
    END IF;

    IF requested_artifact_id IS NULL THEN
        RAISE EXCEPTION 'Artifact ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_team NOT IN ('blue', 'red', 'green', 'industry') THEN
        RAISE EXCEPTION 'A valid submitting team is required.'
            USING ERRCODE = '22023';
    END IF;

    IF requested_expected_revision IS NULL OR requested_expected_revision < 1 THEN
        RAISE EXCEPTION 'Expected revision number is required.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_decision NOT IN ('complete', 'return_to_team', 'return_for_clarification') THEN
        RAISE EXCEPTION 'Unsupported artifact review decision.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_decision IN ('return_to_team', 'return_for_clarification')
       AND normalized_notes IS NULL THEN
        RAISE EXCEPTION 'Reviewer notes are required for every return.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_kind IN ('action', 'strategic_orientation') THEN
        SELECT *
        INTO action_row
        FROM public.actions a
        WHERE a.id = requested_artifact_id
          AND COALESCE(a.is_deleted, false) = false
        FOR UPDATE;

        IF action_row.id IS NULL THEN
            RAISE EXCEPTION 'Artifact not found.'
                USING ERRCODE = 'P0002';
        END IF;

        reviewer_role := public.live_demo_participant_role(action_row.session_id);

        IF auth.uid() IS NULL
           OR reviewer_role IS NULL
           OR public.live_demo_participant_surface(action_row.session_id) <> 'whitecell'
           OR NOT public.live_demo_has_operator_grant(
                'whitecell',
                action_row.session_id,
                public.live_demo_participant_team(action_row.session_id),
                reviewer_role
           ) THEN
            RAISE EXCEPTION 'White Cell operator authorization is required.'
                USING ERRCODE = '42501';
        END IF;

        IF LOWER(BTRIM(action_row.team)) <> normalized_team THEN
            RAISE EXCEPTION 'Requested team does not match the artifact submitting team.'
                USING ERRCODE = '42501';
        END IF;

        IF normalized_kind = 'action' AND NOT (
            action_row.artifact_type IN ('action', 'move_response')
            AND normalized_team IN ('blue', 'red')
        ) THEN
            RAISE EXCEPTION 'Only Blue or Red action artifacts can use the action review path.'
                USING ERRCODE = '22023';
        END IF;

        IF normalized_kind = 'strategic_orientation'
           AND action_row.artifact_type NOT IN (
                'strategic_orientation_selection',
                'strategic_orientation_forecast'
           ) THEN
            RAISE EXCEPTION 'Artifact kind does not match the stored Strategic Orientation type.'
                USING ERRCODE = '22023';
        END IF;

        IF normalized_decision = 'return_for_clarification' THEN
            RAISE EXCEPTION 'Action artifacts use return_to_team.'
                USING ERRCODE = '22023';
        END IF;

        IF action_row.workflow_state = 'completed' THEN
            RAISE EXCEPTION 'Completed artifacts are immutable.'
                USING ERRCODE = '23514';
        END IF;

        effective_revision := COALESCE(action_row.revision_number, 1);
        IF effective_revision <> requested_expected_revision THEN
            RAISE EXCEPTION
                'Stale artifact revision. Expected %, current %.',
                requested_expected_revision,
                effective_revision
                USING ERRCODE = '40001';
        END IF;

        IF normalized_decision = 'complete' AND (
            action_row.status <> 'submitted'
            OR action_row.workflow_state NOT IN ('submitted_to_white_cell', 'resubmitted')
        ) THEN
            RAISE EXCEPTION 'Only submitted artifacts can be completed.'
                USING ERRCODE = '23514';
        END IF;

        IF normalized_decision = 'return_to_team'
           AND action_row.status NOT IN ('submitted', 'adjudicated') THEN
            RAISE EXCEPTION 'Only submitted artifacts can be returned to their team.'
                USING ERRCODE = '23514';
        END IF;

        next_revision := CASE
            WHEN normalized_decision = 'return_to_team' THEN effective_revision + 1
            ELSE effective_revision
        END;

        UPDATE public.actions a
        SET
            status = CASE
                WHEN normalized_decision = 'complete' THEN 'adjudicated'
                ELSE 'draft'
            END,
            workflow_state = CASE
                WHEN normalized_decision = 'complete' THEN 'completed'
                ELSE 'returned_to_team'
            END,
            revision_number = next_revision,
            prior_workflow_state = action_row.workflow_state,
            reviewed_at = reviewed_at_value,
            reviewed_by_auth_user_id = auth.uid(),
            reviewed_by_role = reviewer_role,
            review_notes = normalized_notes,
            completed_at = CASE
                WHEN normalized_decision = 'complete' THEN reviewed_at_value
                ELSE NULL
            END,
            outcome = NULL,
            submitted_at = CASE
                WHEN normalized_decision = 'complete' THEN action_row.submitted_at
                ELSE NULL
            END,
            adjudicated_at = CASE
                WHEN normalized_decision = 'complete' THEN reviewed_at_value
                ELSE NULL
            END,
            adjudication_notes = normalized_notes,
            adjudication = (COALESCE(a.adjudication, '{}'::jsonb) - 'outcome')
                || jsonb_strip_nulls(jsonb_build_object(
                    'artifact_review_decision', normalized_decision,
                    'artifact_reviewed_at', reviewed_at_value,
                    'artifact_reviewed_by_role', reviewer_role,
                    'artifact_reviewed_by_auth_user_id', auth.uid(),
                    'artifact_review_notes', normalized_notes,
                    'artifact_review_revision', effective_revision,
                    'prior_status', action_row.status,
                    'prior_workflow_state', action_row.workflow_state
                ))
        WHERE a.id = action_row.id
        RETURNING *
        INTO updated_action;

        -- The existing action audit trigger intentionally skips submitted ->
        -- adjudicated because the legacy adjudication RPC writes that log. This
        -- RPC owns the equivalent completion entry so the action audit remains
        -- complete even though no outcome is created.
        IF normalized_decision = 'complete' THEN
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
                updated_action.id,
                updated_action.session_id,
                auth.uid()::TEXT,
                reviewer_role,
                auth.uid(),
                to_jsonb(action_row),
                to_jsonb(updated_action),
                action_row.status,
                updated_action.status,
                GREATEST(
                    0,
                    FLOOR(EXTRACT(EPOCH FROM (
                        updated_action.updated_at
                        - COALESCE(action_row.updated_at, action_row.created_at)
                    )))::INTEGER
                ),
                'workflow_transition',
                updated_action.artifact_type,
                action_row.workflow_state,
                updated_action.workflow_state,
                updated_action.row_version
            );
        END IF;

        IF normalized_decision = 'return_to_team'
           AND to_regclass('public.pli_adjudications') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.pli_adjudications WHERE action_id = $1'
                USING action_row.id;
        END IF;

        stored_artifact_kind := normalized_kind;

        INSERT INTO public.artifact_workflow_reviews (
            session_id,
            artifact_kind,
            artifact_id,
            artifact_type,
            team,
            decision,
            revision_number,
            next_revision_number,
            prior_status,
            status_to,
            prior_workflow_state,
            workflow_state_to,
            reviewer_auth_user_id,
            reviewer_role,
            reviewer_notes,
            reviewed_at,
            prior_state,
            new_state
        )
        VALUES (
            action_row.session_id,
            stored_artifact_kind,
            action_row.id,
            action_row.artifact_type,
            normalized_team,
            normalized_decision,
            effective_revision,
            next_revision,
            action_row.status,
            updated_action.status,
            action_row.workflow_state,
            updated_action.workflow_state,
            auth.uid(),
            reviewer_role,
            normalized_notes,
            reviewed_at_value,
            to_jsonb(action_row),
            to_jsonb(updated_action)
        )
        RETURNING *
        INTO review_row;

        RETURN jsonb_build_object(
            'artifact', to_jsonb(updated_action),
            'review', to_jsonb(review_row)
        );
    END IF;

    -- RFI clarification return path.
    IF normalized_decision <> 'return_for_clarification' THEN
        RAISE EXCEPTION 'RFIs use return_for_clarification.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO request_row
    FROM public.requests r
    WHERE r.id = requested_artifact_id
    FOR UPDATE;

    IF request_row.id IS NULL THEN
        RAISE EXCEPTION 'RFI not found.'
            USING ERRCODE = 'P0002';
    END IF;

    reviewer_role := public.live_demo_participant_role(request_row.session_id);

    IF auth.uid() IS NULL
       OR reviewer_role IS NULL
       OR public.live_demo_participant_surface(request_row.session_id) <> 'whitecell'
       OR NOT public.live_demo_has_operator_grant(
            'whitecell',
            request_row.session_id,
            public.live_demo_participant_team(request_row.session_id),
            reviewer_role
       ) THEN
        RAISE EXCEPTION 'White Cell operator authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    IF LOWER(BTRIM(request_row.team)) <> normalized_team THEN
        RAISE EXCEPTION 'Requested team does not match the RFI submitting team.'
            USING ERRCODE = '42501';
    END IF;

    effective_workflow_state := COALESCE(
        request_row.workflow_state,
        CASE
            WHEN request_row.status = 'pending' THEN 'submitted_to_white_cell'
            ELSE 'completed'
        END
    );

    IF request_row.status IN ('answered', 'withdrawn')
       OR effective_workflow_state = 'completed' THEN
        RAISE EXCEPTION 'Completed artifacts are immutable.'
            USING ERRCODE = '23514';
    END IF;

    IF effective_workflow_state NOT IN ('submitted_to_white_cell', 'resubmitted') THEN
        RAISE EXCEPTION 'Only submitted RFIs can be returned for clarification.'
            USING ERRCODE = '23514';
    END IF;

    effective_revision := COALESCE(request_row.revision_number, 1);
    IF effective_revision <> requested_expected_revision THEN
        RAISE EXCEPTION
            'Stale artifact revision. Expected %, current %.',
            requested_expected_revision,
            effective_revision
            USING ERRCODE = '40001';
    END IF;

    next_revision := effective_revision + 1;

    UPDATE public.requests r
    SET
        status = 'pending',
        workflow_state = 'returned_to_team',
        revision_number = next_revision,
        prior_workflow_state = effective_workflow_state,
        reviewed_at = reviewed_at_value,
        reviewed_by_auth_user_id = auth.uid(),
        reviewed_by_role = reviewer_role,
        review_notes = normalized_notes,
        completed_at = NULL,
        response = NULL,
        responded_at = NULL,
        answered_at = NULL,
        response_time_seconds = NULL
    WHERE r.id = request_row.id
    RETURNING *
    INTO updated_request;

    INSERT INTO public.artifact_workflow_reviews (
        session_id,
        artifact_kind,
        artifact_id,
        artifact_type,
        team,
        decision,
        revision_number,
        next_revision_number,
        prior_status,
        status_to,
        prior_workflow_state,
        workflow_state_to,
        reviewer_auth_user_id,
        reviewer_role,
        reviewer_notes,
        reviewed_at,
        prior_state,
        new_state
    )
    VALUES (
        request_row.session_id,
        'rfi',
        request_row.id,
        'rfi',
        normalized_team,
        normalized_decision,
        effective_revision,
        next_revision,
        request_row.status,
        updated_request.status,
        effective_workflow_state,
        updated_request.workflow_state,
        auth.uid(),
        reviewer_role,
        normalized_notes,
        reviewed_at_value,
        to_jsonb(request_row),
        to_jsonb(updated_request)
    )
    RETURNING *
    INTO review_row;

    RETURN jsonb_build_object(
        'artifact', to_jsonb(updated_request),
        'review', to_jsonb(review_row)
    );
END;
$review$;

REVOKE ALL ON FUNCTION public.operator_review_artifact(TEXT, UUID, TEXT, TEXT, BIGINT, TEXT)
    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_review_artifact(TEXT, UUID, TEXT, TEXT, BIGINT, TEXT)
    FROM anon;
GRANT EXECUTE ON FUNCTION public.operator_review_artifact(TEXT, UUID, TEXT, TEXT, BIGINT, TEXT)
    TO authenticated;

COMMENT ON FUNCTION public.operator_review_artifact(TEXT, UUID, TEXT, TEXT, BIGINT, TEXT) IS
    'Atomic White Cell review for Blue/Red actions, Strategic Orientations, and RFI clarification returns with optimistic revision enforcement.';

-- ============================================================================
-- 4. COMPATIBILITY WRAPPER AND RFI COMPLETION ALIGNMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.operator_return_action_to_blue(
    requested_action_id UUID,
    requested_return_notes TEXT DEFAULT NULL
)
RETURNS public.actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $legacy_return$
DECLARE
    action_row public.actions%ROWTYPE;
    review_result JSONB;
    updated_action public.actions%ROWTYPE;
BEGIN
    SELECT *
    INTO action_row
    FROM public.actions a
    WHERE a.id = requested_action_id
      AND COALESCE(a.is_deleted, false) = false;

    IF action_row.id IS NULL THEN
        RAISE EXCEPTION 'Action not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF LOWER(BTRIM(action_row.team)) <> 'blue' THEN
        RAISE EXCEPTION 'Only Blue Team actions can use the legacy return wrapper.'
            USING ERRCODE = '22023';
    END IF;

    review_result := public.operator_review_artifact(
        'action',
        action_row.id,
        'return_to_team',
        'blue',
        COALESCE(action_row.revision_number, 1),
        requested_return_notes
    );

    SELECT *
    INTO updated_action
    FROM jsonb_populate_record(NULL::public.actions, review_result -> 'artifact');

    RETURN updated_action;
END;
$legacy_return$;

REVOKE ALL ON FUNCTION public.operator_return_action_to_blue(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_return_action_to_blue(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.operator_return_action_to_blue(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.operator_return_action_to_blue(UUID, TEXT) IS
    'Legacy Blue-only compatibility wrapper over operator_review_artifact. New clients must use the team-neutral RPC.';

CREATE OR REPLACE FUNCTION public.operator_answer_request(
    requested_request_id UUID,
    requested_response TEXT,
    requested_responded_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $answer$
DECLARE
    request_row public.requests%ROWTYPE;
    updated_request public.requests%ROWTYPE;
    participant_role TEXT;
    participant_team TEXT;
    response_timestamp TIMESTAMPTZ := COALESCE(requested_responded_at, clock_timestamp());
BEGIN
    IF requested_request_id IS NULL THEN
        RAISE EXCEPTION 'Request ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(requested_response), '') IS NULL THEN
        RAISE EXCEPTION 'A response is required.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO request_row
    FROM public.requests r
    WHERE r.id = requested_request_id
    FOR UPDATE;

    IF request_row.id IS NULL THEN
        RAISE EXCEPTION 'Request not found.'
            USING ERRCODE = 'P0002';
    END IF;

    participant_role := public.live_demo_participant_role(request_row.session_id);
    participant_team := public.live_demo_participant_team(request_row.session_id);

    IF auth.uid() IS NULL
       OR participant_role IS NULL
       OR public.live_demo_participant_surface(request_row.session_id) <> 'whitecell'
       OR NOT public.live_demo_has_operator_grant(
            'whitecell',
            request_row.session_id,
            participant_team,
            participant_role
       ) THEN
        RAISE EXCEPTION 'White Cell operator authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    IF request_row.status IN ('answered', 'withdrawn')
       OR request_row.workflow_state = 'completed' THEN
        RAISE EXCEPTION 'Completed artifacts are immutable.'
            USING ERRCODE = '23514';
    END IF;

    UPDATE public.requests r
    SET
        response = NULLIF(BTRIM(requested_response), ''),
        status = 'answered',
        workflow_state = 'completed',
        revision_number = COALESCE(r.revision_number, 1),
        prior_workflow_state = COALESCE(r.workflow_state, 'submitted_to_white_cell'),
        reviewed_at = response_timestamp,
        reviewed_by_auth_user_id = auth.uid(),
        reviewed_by_role = participant_role,
        review_notes = NULL,
        completed_at = response_timestamp,
        responded_at = response_timestamp,
        answered_at = response_timestamp,
        response_time_seconds = GREATEST(
            EXTRACT(EPOCH FROM (response_timestamp - r.created_at))::INTEGER,
            0
        )
    WHERE r.id = requested_request_id
    RETURNING *
    INTO updated_request;

    INSERT INTO public.communications (
        session_id,
        move,
        from_role,
        to_role,
        type,
        title,
        content,
        client_id,
        linked_request_id,
        metadata
    )
    VALUES (
        updated_request.session_id,
        updated_request.move,
        'white_cell',
        updated_request.team,
        'rfi_response',
        'RFI Response',
        updated_request.response,
        auth.uid()::TEXT,
        updated_request.id,
        jsonb_build_object(
            'answered_by_role', participant_role,
            'answered_by_auth_user_id', auth.uid(),
            'workflow_state', 'completed',
            'revision_number', updated_request.revision_number
        )
    );

    RETURN updated_request;
END;
$answer$;

COMMENT ON COLUMN public.actions.revision_number IS
    'Submission revision reviewed by White Cell. NULL identifies untouched pre-contract rows.';
COMMENT ON COLUMN public.requests.workflow_state IS
    'Rich RFI lifecycle. NULL identifies untouched historical rows whose legacy status remains authoritative.';
COMMENT ON COLUMN public.requests.revision_number IS
    'RFI revision reviewed by White Cell. NULL identifies untouched pre-contract rows.';

COMMIT;
