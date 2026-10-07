-- Canonical Industry proposal contract, numbering, visibility, and move gate.
-- Apply after 2026-10-05_green_proposal_activity_projection.sql.
-- Existing actions are not rewritten.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.is_industry_proposal(action_row public.actions)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        LOWER(BTRIM(action_row.team)) = 'industry'
        AND action_row.artifact_type = 'proposal'
        AND jsonb_typeof(action_row.artifact_payload -> 'proposal' -> 'industryTurnSheet') = 'object',
        false
    )
$$;

CREATE OR REPLACE FUNCTION public.industry_proposal_is_completed(action_row public.actions)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        action_row.workflow_state IN (
            'completed',
            'forwarded_to_recipient',
            'changes_requested',
            'rejected'
        ) OR action_row.status = 'adjudicated',
        false
    )
$$;

CREATE OR REPLACE FUNCTION public.prepare_industry_proposal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    sheet JSONB;
    requested_industry TEXT;
    requested_move INTEGER;
    requested_plan_id TEXT;
    requested_recipients JSONB;
    recipient_approvals JSONB;
    baseline public.actions%ROWTYPE;
    next_ordinal INTEGER;
BEGIN
    IF TG_OP = 'UPDATE'
       AND public.is_industry_proposal(OLD)
       AND NOT public.is_industry_proposal(NEW) THEN
        RAISE EXCEPTION 'INDUSTRY_PROPOSAL_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF NOT public.is_industry_proposal(NEW) THEN
        RETURN NEW;
    END IF;

    sheet := NEW.artifact_payload -> 'proposal' -> 'industryTurnSheet';
    requested_industry := LOWER(BTRIM(sheet ->> 'industry'));
    requested_move := COALESCE(NULLIF(sheet ->> 'move', '')::INTEGER, NEW.move);
    requested_plan_id := NULLIF(BTRIM(sheet ->> 'strategicPlanId'), '');
    requested_recipients := sheet -> 'recipientTeams';

    IF requested_industry NOT IN ('agriculture', 'biotechnology', 'telecommunications') THEN
        RAISE EXCEPTION 'INDUSTRY_PROPOSAL_INDUSTRY_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF requested_move IS DISTINCT FROM NEW.move THEN
        RAISE EXCEPTION 'INDUSTRY_PROPOSAL_MOVE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    -- Draft, forwarded, and submitted proposals share the same persisted
    -- routing minimum: at least one valid intended recipient.
    IF jsonb_typeof(requested_recipients) IS DISTINCT FROM 'array'
       OR jsonb_array_length(requested_recipients) = 0
       OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(requested_recipients) recipient(value)
            WHERE LOWER(BTRIM(recipient.value)) NOT IN ('blue', 'red')
       ) THEN
        RAISE EXCEPTION 'INDUSTRY_PROPOSAL_RECIPIENT_REQUIRED' USING ERRCODE = '23514';
    END IF;

    SELECT jsonb_agg(recipient.team ORDER BY CASE recipient.team WHEN 'blue' THEN 1 ELSE 2 END),
           jsonb_object_agg(recipient.team, '"pending_white_cell_approval"'::jsonb)
    INTO requested_recipients, recipient_approvals
    FROM (
        SELECT DISTINCT LOWER(BTRIM(value)) AS team
        FROM jsonb_array_elements_text(requested_recipients)
    ) recipient;
    sheet := jsonb_set(sheet, '{recipientTeams}', requested_recipients, true);

    IF requested_plan_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.actions plan
        WHERE plan.id::TEXT = requested_plan_id
          AND plan.session_id = NEW.session_id
          AND LOWER(BTRIM(plan.team)) = 'industry'
          AND NOT plan.is_deleted
          AND plan.artifact_type = 'strategic_orientation_forecast'
          AND jsonb_typeof(plan.artifact_payload -> 'strategic_orientation' -> 'industryStrategicPlan') = 'object'
          AND plan.artifact_payload #>> '{strategic_orientation,industryStrategicPlanVersion}' = '2'
          AND plan.artifact_payload #>> '{strategic_orientation,industryStrategicPlanParseStatus}' = 'valid'
          AND public.industry_proposal_is_completed(plan)
    ) THEN
        RAISE EXCEPTION 'INDUSTRY_STRATEGIC_PLAN_COMPLETION_REQUIRED' USING ERRCODE = '23514';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        'industry-proposal:' || NEW.session_id::TEXT || ':' || NEW.move::TEXT || ':' || requested_industry,
        0
    ));

    IF TG_OP = 'UPDATE' THEN
        IF NOT public.is_industry_proposal(OLD)
           OR OLD.session_id IS DISTINCT FROM NEW.session_id
           OR OLD.move IS DISTINCT FROM NEW.move
           OR LOWER(BTRIM(OLD.artifact_payload #>> '{proposal,industryTurnSheet,industry}'))
                IS DISTINCT FROM requested_industry THEN
            RAISE EXCEPTION 'INDUSTRY_PROPOSAL_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
        END IF;

        sheet := jsonb_set(sheet, '{proposalOrdinalForIndustryMove}',
            to_jsonb((OLD.artifact_payload #>> '{proposal,industryTurnSheet,proposalOrdinalForIndustryMove}')::INTEGER), true);
        sheet := jsonb_set(sheet, '{isFirstProposalForIndustryMove}',
            to_jsonb((OLD.artifact_payload #>> '{proposal,industryTurnSheet,isFirstProposalForIndustryMove}')::BOOLEAN), true);
        sheet := jsonb_set(sheet, '{environmentBaselineProposalId}',
            COALESCE(OLD.artifact_payload #> '{proposal,industryTurnSheet,environmentBaselineProposalId}', 'null'::jsonb), true);
        sheet := jsonb_set(sheet, '{supplyChainBaselineProposalId}',
            COALESCE(OLD.artifact_payload #> '{proposal,industryTurnSheet,supplyChainBaselineProposalId}', 'null'::jsonb), true);
    ELSE
        SELECT candidate.*
        INTO baseline
        FROM public.actions candidate
        WHERE candidate.session_id = NEW.session_id
          AND candidate.move = NEW.move
          AND NOT candidate.is_deleted
          AND public.is_industry_proposal(candidate)
          AND LOWER(BTRIM(candidate.artifact_payload #>> '{proposal,industryTurnSheet,industry}')) = requested_industry
        ORDER BY (candidate.artifact_payload #>> '{proposal,industryTurnSheet,proposalOrdinalForIndustryMove}')::INTEGER,
                 candidate.created_at,
                 candidate.id
        LIMIT 1;

        IF baseline.id IS NOT NULL AND NOT public.industry_proposal_is_completed(baseline) THEN
            RAISE EXCEPTION 'INDUSTRY_PROPOSAL_ONE_COMPLETION_REQUIRED' USING ERRCODE = '23514';
        END IF;

        SELECT COALESCE(MAX(
            (candidate.artifact_payload #>> '{proposal,industryTurnSheet,proposalOrdinalForIndustryMove}')::INTEGER
        ), 0) + 1
        INTO next_ordinal
        FROM public.actions candidate
        WHERE candidate.session_id = NEW.session_id
          AND candidate.move = NEW.move
          AND public.is_industry_proposal(candidate)
          AND LOWER(BTRIM(candidate.artifact_payload #>> '{proposal,industryTurnSheet,industry}')) = requested_industry;

        sheet := jsonb_set(sheet, '{proposalOrdinalForIndustryMove}', to_jsonb(next_ordinal), true);
        sheet := jsonb_set(sheet, '{isFirstProposalForIndustryMove}', to_jsonb(baseline.id IS NULL), true);
        sheet := jsonb_set(sheet, '{environmentBaselineProposalId}',
            to_jsonb(COALESCE(baseline.id, NEW.id)::TEXT), true);
        sheet := jsonb_set(sheet, '{supplyChainBaselineProposalId}',
            to_jsonb(COALESCE(baseline.id, NEW.id)::TEXT), true);
    END IF;

    sheet := jsonb_set(sheet, '{proposalId}', to_jsonb(NEW.id::TEXT), true);
    sheet := jsonb_set(sheet, '{sessionId}', to_jsonb(NEW.session_id::TEXT), true);
    sheet := jsonb_set(sheet, '{move}', to_jsonb(NEW.move), true);
    NEW.artifact_payload := jsonb_set(NEW.artifact_payload, '{proposal,industryTurnSheet}', sheet, true);
    NEW.artifact_payload := jsonb_set(NEW.artifact_payload, '{proposal,recipientTeams}', requested_recipients, true);
    NEW.artifact_payload := jsonb_set(NEW.artifact_payload, '{proposal,recipientTeam}', requested_recipients -> 0, true);
    NEW.artifact_payload := jsonb_set(NEW.artifact_payload, '{proposal,recipientApprovalStates}', recipient_approvals, true);
    NEW.proposal_recipient_team := LOWER(BTRIM(requested_recipients ->> 0));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS industry_proposal_prepare ON public.actions;
CREATE TRIGGER industry_proposal_prepare
    BEFORE INSERT OR UPDATE ON public.actions
    FOR EACH ROW
    EXECUTE FUNCTION public.prepare_industry_proposal();

CREATE OR REPLACE FUNCTION public.industry_proposal_move_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    completed_industries TEXT[];
    missing_industries TEXT[];
BEGIN
    IF TG_OP <> 'UPDATE' OR NEW.move <= OLD.move THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(array_agg(DISTINCT LOWER(BTRIM(
        action.artifact_payload #>> '{proposal,industryTurnSheet,industry}'
    ))), ARRAY[]::TEXT[])
    INTO completed_industries
    FROM public.actions action
    WHERE action.session_id = NEW.session_id
      AND action.move = OLD.move
      AND NOT action.is_deleted
      AND public.is_industry_proposal(action)
      AND public.industry_proposal_is_completed(action);

    SELECT COALESCE(array_agg(required.industry), ARRAY[]::TEXT[])
    INTO missing_industries
    FROM unnest(ARRAY['agriculture', 'biotechnology', 'telecommunications']) required(industry)
    WHERE required.industry <> ALL(completed_industries);

    IF cardinality(missing_industries) > 0 THEN
        RAISE EXCEPTION 'INDUSTRY_PROPOSALS_INCOMPLETE: %', missing_industries USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS industry_proposal_move_gate ON public.game_state;
CREATE TRIGGER industry_proposal_move_gate
    BEFORE UPDATE ON public.game_state
    FOR EACH ROW
    EXECUTE FUNCTION public.industry_proposal_move_gate();

CREATE OR REPLACE FUNCTION public.project_industry_proposal_communication()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    action_row public.actions%ROWTYPE;
    sheet JSONB;
    engagement JSONB;
BEGIN
    IF NEW.type <> 'PROPOSAL_FORWARDED'
       OR NULLIF(BTRIM(NEW.metadata ->> 'source_proposal_id'), '') IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO action_row
    FROM public.actions action
    WHERE action.id::TEXT = NEW.metadata ->> 'source_proposal_id'
      AND action.session_id = NEW.session_id;
    IF action_row.id IS NULL OR NOT public.is_industry_proposal(action_row) THEN
        RETURN NEW;
    END IF;

    sheet := action_row.artifact_payload #> '{proposal,industryTurnSheet}';
    sheet := sheet
        - 'recipientTeams'
        - 'facilitatorNote'
        - 'strategicPlanId'
        - 'previousMoveProposalId'
        - 'environmentBaselineProposalId'
        - 'supplyChainBaselineProposalId';
    sheet := jsonb_set(
        sheet,
        '{decision}',
        COALESCE(sheet -> 'decision', '{}'::jsonb) - 'visibility' - 'priorDecisionId',
        true
    );
    engagement := COALESCE(sheet -> 'engagement', '{}'::jsonb);
    engagement := jsonb_set(
        engagement,
        '{outbound}',
        COALESCE(engagement -> 'outbound', '{}'::jsonb) - 'linkedRecordId' - 'contact',
        true
    );
    engagement := jsonb_set(
        engagement,
        '{inbound}',
        COALESCE(engagement -> 'inbound', '{}'::jsonb) - 'linkedRecordId' - 'contact',
        true
    );
    sheet := jsonb_set(sheet, '{engagement}', engagement, true);

    NEW.metadata := jsonb_set(
        NEW.metadata,
        '{proposal,industryProposal}',
        sheet,
        true
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_project_industry_proposal_communication ON public.communications;
CREATE TRIGGER zzz_project_industry_proposal_communication
    BEFORE INSERT ON public.communications
    FOR EACH ROW
    EXECUTE FUNCTION public.project_industry_proposal_communication();

CREATE OR REPLACE FUNCTION public.industry_proposal_action_visible(requested_action_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    action_row public.actions%ROWTYPE;
    visibility TEXT;
    viewer_team TEXT;
    viewer_surface TEXT;
BEGIN
    SELECT * INTO action_row FROM public.actions WHERE id = requested_action_id;
    IF action_row.id IS NULL OR NOT public.is_industry_proposal(action_row) THEN
        RETURN true;
    END IF;

    visibility := LOWER(BTRIM(COALESCE(
        action_row.artifact_payload #>> '{proposal,industryTurnSheet,decision,visibility}',
        'private'
    )));
    IF visibility = 'public' THEN
        RETURN true;
    END IF;

    viewer_team := public.live_demo_participant_team(action_row.session_id);
    viewer_surface := public.live_demo_participant_surface(action_row.session_id);
    IF public.live_demo_has_operator_grant('gamemaster')
       OR viewer_surface = 'whitecell'
       OR viewer_team = 'industry' THEN
        RETURN true;
    END IF;
    RETURN visibility = 'confidential_blue' AND viewer_team = 'blue';
END;
$$;

DROP POLICY IF EXISTS industry_proposal_visibility ON public.actions;
CREATE POLICY industry_proposal_visibility
    ON public.actions AS RESTRICTIVE FOR SELECT TO authenticated
    USING (public.industry_proposal_action_visible(id));

DROP POLICY IF EXISTS industry_proposal_review_visibility ON public.artifact_workflow_reviews;
CREATE POLICY industry_proposal_review_visibility
    ON public.artifact_workflow_reviews AS RESTRICTIVE FOR SELECT TO authenticated
    USING (artifact_kind <> 'action' OR public.industry_proposal_action_visible(artifact_id));

DROP POLICY IF EXISTS industry_proposal_log_visibility ON public.action_logs;
CREATE POLICY industry_proposal_log_visibility
    ON public.action_logs AS RESTRICTIVE FOR SELECT TO authenticated
    USING (public.industry_proposal_action_visible(action_id));

DROP POLICY IF EXISTS industry_proposal_timeline_visibility ON public.timeline;
CREATE POLICY industry_proposal_timeline_visibility
    ON public.timeline AS RESTRICTIVE FOR SELECT TO authenticated
    USING (
        COALESCE(
            NULLIF(BTRIM(metadata ->> 'related_id'), ''),
            NULLIF(BTRIM(metadata ->> 'action_id'), ''),
            NULLIF(BTRIM(metadata ->> 'source_proposal_id'), '')
        ) IS NULL
        OR NOT EXISTS (
            SELECT 1 FROM public.actions action
            WHERE action.id::TEXT = COALESCE(
                NULLIF(BTRIM(metadata ->> 'related_id'), ''),
                NULLIF(BTRIM(metadata ->> 'action_id'), ''),
                NULLIF(BTRIM(metadata ->> 'source_proposal_id'), '')
            )
              AND NOT public.industry_proposal_action_visible(action.id)
        )
    );

DROP POLICY IF EXISTS industry_proposal_communication_visibility ON public.communications;
CREATE POLICY industry_proposal_communication_visibility
    ON public.communications AS RESTRICTIVE FOR SELECT TO authenticated
    USING (
        (
            NULLIF(BTRIM(metadata ->> 'source_proposal_id'), '') IS NULL
            OR NOT EXISTS (
                SELECT 1 FROM public.actions action
                WHERE action.id::TEXT = metadata ->> 'source_proposal_id'
                  AND NOT public.industry_proposal_action_visible(action.id)
            )
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.actions action
            WHERE public.is_industry_proposal(action)
              AND NOT public.industry_proposal_action_visible(action.id)
              AND (
                  action.artifact_payload #>> '{proposal,industryTurnSheet,engagement,outbound,linkedRecordId}' = communications.id::TEXT
                  OR action.artifact_payload #>> '{proposal,industryTurnSheet,engagement,inbound,linkedRecordId}' = communications.id::TEXT
              )
        )
    );

REVOKE ALL ON FUNCTION public.is_industry_proposal(public.actions),
    public.industry_proposal_is_completed(public.actions),
    public.prepare_industry_proposal(),
    public.industry_proposal_move_gate(),
    public.project_industry_proposal_communication(),
    public.industry_proposal_action_visible(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.industry_proposal_action_visible(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
