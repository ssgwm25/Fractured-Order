-- Allow White Cell Lead to return submitted/adjudicated Blue actions to draft
-- (workflow_state = returned_to_blue) and clear linked PLI adjudications.

ALTER TABLE public.actions
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
            'forwarded_to_recipient',
            'returned_to_blue'
        )
    );

ALTER TABLE public.actions
    DROP CONSTRAINT IF EXISTS actions_workflow_status_consistency_check,
    ADD CONSTRAINT actions_workflow_status_consistency_check CHECK (
        (status = 'draft' AND workflow_state IN ('draft', 'forwarded_to_facilitator', 'returned_to_blue'))
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
    );

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
    returning_to_blue BOOLEAN := false;
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

        returning_to_blue := (
            OLD.status IN ('submitted', 'adjudicated')
            AND NEW.status = 'draft'
        );

        IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
            (OLD.status = 'draft' AND NEW.status IN ('submitted', 'abandoned'))
            OR (OLD.status = 'submitted' AND NEW.status = 'adjudicated')
            OR returning_to_blue
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
        IF TG_OP = 'UPDATE' AND OLD.status IN ('submitted', 'adjudicated') THEN
            NEW.workflow_state := 'returned_to_blue';
            NEW.outcome := NULL;
        ELSIF TG_OP = 'UPDATE' AND OLD.workflow_state = 'returned_to_blue' THEN
            NEW.workflow_state := 'returned_to_blue';
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
$normalize$;

CREATE OR REPLACE FUNCTION public.operator_return_action_to_blue(
    requested_action_id UUID,
    requested_return_notes TEXT DEFAULT NULL
)
RETURNS public.actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $return$
DECLARE
    action_row public.actions%ROWTYPE;
    updated_action public.actions%ROWTYPE;
    participant_role TEXT;
    participant_team TEXT;
    return_notes TEXT := NULLIF(BTRIM(COALESCE(requested_return_notes, '')), '');
BEGIN
    IF requested_action_id IS NULL THEN
        RAISE EXCEPTION 'Action ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF return_notes IS NULL THEN
        RAISE EXCEPTION 'Return notes are required.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO action_row
    FROM public.actions a
    WHERE a.id = requested_action_id
      AND COALESCE(a.is_deleted, false) = false
    FOR UPDATE;

    IF action_row.id IS NULL THEN
        RAISE EXCEPTION 'Action not found.'
            USING ERRCODE = 'P0002';
    END IF;

    participant_role := public.live_demo_participant_role(action_row.session_id);
    participant_team := public.live_demo_participant_team(action_row.session_id);

    IF auth.uid() IS NULL
       OR participant_role IS NULL
       OR public.live_demo_participant_surface(action_row.session_id) <> 'whitecell'
       OR NOT public.live_demo_has_operator_grant('whitecell', action_row.session_id, participant_team, participant_role) THEN
        RAISE EXCEPTION 'White Cell operator authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    IF LOWER(COALESCE(action_row.team, '')) <> 'blue' THEN
        RAISE EXCEPTION 'Only Blue Team actions can be returned to Blue.'
            USING ERRCODE = 'P0001';
    END IF;

    IF action_row.artifact_type IN (
        'strategic_orientation_selection',
        'strategic_orientation_forecast',
        'proposal',
        'move_response'
    ) THEN
        RAISE EXCEPTION 'This artifact type cannot be returned to Blue via this path.'
            USING ERRCODE = 'P0001';
    END IF;

    IF action_row.status NOT IN ('submitted', 'adjudicated') THEN
        RAISE EXCEPTION 'Only submitted or adjudicated actions can be returned to Blue.'
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.actions a
    SET
        status = 'draft',
        outcome = NULL,
        adjudicated_at = NULL,
        submitted_at = NULL,
        adjudication_notes = 'Returned to Blue: ' || return_notes,
        adjudication = COALESCE(a.adjudication, '{}'::jsonb) || jsonb_build_object(
            'returned_to_blue', true,
            'returned_at', NOW(),
            'returned_by_role', participant_role,
            'returned_by_auth_user_id', auth.uid(),
            'return_notes', return_notes,
            'prior_status', action_row.status,
            'prior_outcome', action_row.outcome
        ),
        updated_at = NOW()
    WHERE a.id = requested_action_id
    RETURNING *
    INTO updated_action;

    DELETE FROM public.pli_adjudications p
    WHERE p.action_id = requested_action_id;

    INSERT INTO public.action_logs (
        action_id,
        session_id,
        client_id,
        changed_by_role,
        previous_state,
        new_state,
        status_from,
        status_to
    )
    VALUES (
        updated_action.id,
        updated_action.session_id,
        auth.uid()::TEXT,
        participant_role,
        to_jsonb(action_row),
        to_jsonb(updated_action),
        action_row.status,
        updated_action.status
    );

    RETURN updated_action;
END;
$return$;

REVOKE ALL ON FUNCTION public.operator_return_action_to_blue(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_return_action_to_blue(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.operator_return_action_to_blue(UUID, TEXT) IS
    'White Cell Lead/Support RPC: reopen a Blue action as draft (returned_to_blue) and delete linked PLI rows.';
