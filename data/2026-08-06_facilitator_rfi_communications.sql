-- Facilitator RFI and direct-communication authority
--
-- The shipped route/role inversion remains intact for compatibility:
--   *_facilitator = user-facing Scribe workspace
--   *_scribe       = user-facing Facilitator workspace
--
-- Purpose:
-- 1) Move RFI creation and returned-RFI resubmission to the actual Facilitator.
-- 2) Restrict RFI reads to the submitting team plus authorized operators.
-- 3) Allow the actual Facilitator to send isolated direct text to White Cell.
-- 4) Restrict communication reads to the sender, addressed team/role, or operator.
-- 5) Reassert Industry Facilitator submission of Scribe-forwarded Strategic
--    Orientation and proposal drafts after the current workflow migrations.
--
-- Apply after data/2026-08-05_team_neutral_artifact_review.sql.

BEGIN;

DROP POLICY IF EXISTS requests_live_demo_read ON public.requests;
DROP POLICY IF EXISTS requests_live_demo_insert ON public.requests;
DROP POLICY IF EXISTS requests_live_demo_update ON public.requests;
DROP POLICY IF EXISTS requests_industry_submission_insert ON public.requests;
DROP POLICY IF EXISTS requests_industry_submission_update ON public.requests;
DROP POLICY IF EXISTS "Allow all operations on requests" ON public.requests;

CREATE POLICY requests_live_demo_read
    ON public.requests FOR SELECT
    USING (
        public.live_demo_has_operator_grant('whitecell', session_id)
        OR public.live_demo_has_operator_grant('gamemaster')
        OR (
            public.live_demo_can_read_session(session_id)
            AND LOWER(BTRIM(team)) = public.live_demo_participant_team(session_id)
        )
    );

CREATE POLICY requests_live_demo_insert
    ON public.requests FOR INSERT
    WITH CHECK (
        public.live_demo_can_write_team_session(
            session_id,
            team,
            ARRAY['scribe']::TEXT[]
        )
        AND status = 'pending'
        AND workflow_state = 'submitted_to_white_cell'
        AND NULLIF(BTRIM(query), '') IS NOT NULL
    );

CREATE POLICY requests_live_demo_update
    ON public.requests FOR UPDATE
    USING (
        public.live_demo_can_write_team_session(
            session_id,
            team,
            ARRAY['scribe']::TEXT[]
        )
        AND status = 'pending'
        AND workflow_state = 'returned_to_team'
    )
    WITH CHECK (
        public.live_demo_can_write_team_session(
            session_id,
            team,
            ARRAY['scribe']::TEXT[]
        )
        AND status = 'pending'
        AND workflow_state IN ('returned_to_team', 'resubmitted')
        AND NULLIF(BTRIM(query), '') IS NOT NULL
    );

DROP POLICY IF EXISTS communications_live_demo_read ON public.communications;
DROP POLICY IF EXISTS communications_live_demo_insert ON public.communications;
DROP POLICY IF EXISTS "Allow all operations on communications" ON public.communications;

CREATE POLICY communications_live_demo_read
    ON public.communications FOR SELECT
    USING (
        public.live_demo_has_operator_grant('whitecell', session_id)
        OR public.live_demo_has_operator_grant('gamemaster')
        OR (
            public.live_demo_can_read_session(session_id)
            AND (
                LOWER(BTRIM(from_role)) = public.live_demo_participant_role(session_id)
                OR (
                    type = 'PROPOSAL_FORWARDED'
                    AND LOWER(BTRIM(COALESCE(metadata ->> 'source_team', ''))) = public.live_demo_participant_team(session_id)
                )
                OR (
                    LOWER(BTRIM(from_role)) IN ('white_cell', 'whitecell', 'whitecell_lead', 'whitecell_support')
                    AND (
                        LOWER(BTRIM(to_role)) = 'all'
                        OR LOWER(BTRIM(to_role)) = public.live_demo_participant_team(session_id)
                        OR LOWER(BTRIM(to_role)) = public.live_demo_participant_role(session_id)
                        OR LOWER(BTRIM(COALESCE(metadata ->> 'recipient_team', ''))) = public.live_demo_participant_team(session_id)
                        OR LOWER(BTRIM(COALESCE(metadata ->> 'recipient_role', ''))) = public.live_demo_participant_role(session_id)
                    )
                )
            )
        )
    );

CREATE POLICY communications_live_demo_insert
    ON public.communications FOR INSERT
    WITH CHECK (
        (
            public.live_demo_can_write_session_surface(session_id, ARRAY['scribe']::TEXT[])
            AND LOWER(BTRIM(type)) = 'direct'
            AND LOWER(BTRIM(to_role)) = 'white_cell'
            AND LOWER(BTRIM(from_role)) = public.live_demo_participant_role(session_id)
            AND LOWER(BTRIM(COALESCE(metadata ->> 'source_team', ''))) = public.live_demo_participant_team(session_id)
            AND NULLIF(BTRIM(content), '') IS NOT NULL
        )
        OR (
            public.live_demo_can_write_session_surface(session_id, ARRAY['facilitator', 'scribe']::TEXT[])
            AND type = 'PROPOSAL_RESPONSE'
            AND LOWER(BTRIM(to_role)) = 'white_cell'
            AND LOWER(BTRIM(from_role)) = public.live_demo_participant_role(session_id)
            AND NULLIF(BTRIM(content), '') IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public.communications forwarded
                WHERE forwarded.id::TEXT = NULLIF(BTRIM(communications.metadata ->> 'source_communication_id'), '')
                  AND forwarded.session_id = communications.session_id
                  AND forwarded.type = 'PROPOSAL_FORWARDED'
                  AND COALESCE(
                      NULLIF(BTRIM(forwarded.metadata -> 'proposal_recipient_state' ->> 'status'), ''),
                      'unread'
                  ) NOT IN ('responded', 'declined', 'ignored')
                  AND COALESCE(
                      NULLIF(BTRIM(forwarded.metadata ->> 'recipient_team'), ''),
                      CASE
                          WHEN forwarded.to_role IN ('blue', 'red', 'green', 'industry') THEN forwarded.to_role
                          WHEN forwarded.to_role ~ '^(blue|red|green|industry)_' THEN split_part(forwarded.to_role, '_', 1)
                          ELSE NULL
                      END
                  ) = public.live_demo_participant_team(communications.session_id)
            )
        )
    );

DROP POLICY IF EXISTS actions_industry_submission_update ON public.actions;

CREATE POLICY actions_industry_submission_update
    ON public.actions FOR UPDATE
    USING (
        LOWER(BTRIM(team)) = 'industry'
        AND (
            public.live_demo_can_write_team_session(
                session_id,
                team,
                ARRAY['facilitator']::TEXT[]
            )
            OR (
                public.live_demo_can_write_team_session(
                    session_id,
                    team,
                    ARRAY['scribe']::TEXT[]
                )
                AND status = 'draft'
                AND workflow_state IN ('forwarded_to_facilitator', 'returned_to_team')
                AND artifact_type IN ('strategic_orientation_forecast', 'proposal')
            )
        )
    )
    WITH CHECK (
        LOWER(BTRIM(team)) = 'industry'
        AND status <> 'adjudicated'
        AND (
            public.live_demo_can_write_team_session(
                session_id,
                team,
                ARRAY['facilitator']::TEXT[]
            )
            OR (
                public.live_demo_can_write_team_session(
                    session_id,
                    team,
                    ARRAY['scribe']::TEXT[]
                )
                AND artifact_type IN ('strategic_orientation_forecast', 'proposal')
                AND (
                    (status = 'draft' AND workflow_state IN ('forwarded_to_facilitator', 'returned_to_team'))
                    OR (status = 'submitted' AND workflow_state IN ('submitted_to_white_cell', 'resubmitted'))
                )
            )
        )
    );

CREATE OR REPLACE FUNCTION public.guard_facilitator_request_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $request_guard$
DECLARE
    is_white_cell_operator BOOLEAN := false;
BEGIN
    is_white_cell_operator := (
        public.live_demo_participant_surface(NEW.session_id) = 'whitecell'
        AND public.live_demo_has_operator_grant(
            'whitecell',
            NEW.session_id,
            public.live_demo_participant_team(NEW.session_id),
            public.live_demo_participant_role(NEW.session_id)
        )
    );

    IF is_white_cell_operator THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'pending'
           OR NEW.workflow_state <> 'submitted_to_white_cell'
           OR COALESCE(NEW.revision_number, 1) <> 1
           OR NEW.response IS NOT NULL
           OR NEW.responded_by IS NOT NULL
           OR NEW.responded_at IS NOT NULL
           OR NEW.answered_at IS NOT NULL
           OR NEW.response_time_seconds IS NOT NULL
           OR NEW.prior_workflow_state IS NOT NULL
           OR NEW.reviewed_at IS NOT NULL
           OR NEW.reviewed_by_auth_user_id IS NOT NULL
           OR NEW.reviewed_by_role IS NOT NULL
           OR NEW.review_notes IS NOT NULL
           OR NEW.completed_at IS NOT NULL THEN
            RAISE EXCEPTION 'New RFIs must begin as an unanswered Facilitator submission.'
                USING ERRCODE = '23514';
        END IF;

        NEW.priority := 'NORMAL';
        RETURN NEW;
    END IF;

    IF ROW(
        NEW.session_id,
        NEW.team,
        NEW.client_id,
        NEW.move,
        NEW.phase,
        NEW.created_at,
        NEW.priority,
        NEW.status,
        NEW.response,
        NEW.responded_by,
        NEW.responded_at,
        NEW.answered_at,
        NEW.response_time_seconds,
        NEW.prior_workflow_state,
        NEW.reviewed_at,
        NEW.reviewed_by_auth_user_id,
        NEW.reviewed_by_role,
        NEW.review_notes,
        NEW.completed_at
    ) IS DISTINCT FROM ROW(
        OLD.session_id,
        OLD.team,
        OLD.client_id,
        OLD.move,
        OLD.phase,
        OLD.created_at,
        OLD.priority,
        OLD.status,
        OLD.response,
        OLD.responded_by,
        OLD.responded_at,
        OLD.answered_at,
        OLD.response_time_seconds,
        OLD.prior_workflow_state,
        OLD.reviewed_at,
        OLD.reviewed_by_auth_user_id,
        OLD.reviewed_by_role,
        OLD.review_notes,
        OLD.completed_at
    ) THEN
        RAISE EXCEPTION 'Facilitators may only revise RFI question and category content.'
            USING ERRCODE = '23514';
    END IF;

    IF OLD.workflow_state <> 'returned_to_team'
       OR NEW.workflow_state <> 'resubmitted'
       OR NEW.revision_number <> OLD.revision_number
       OR ROW(NEW.query, NEW.categories) IS NOT DISTINCT FROM ROW(OLD.query, OLD.categories) THEN
        RAISE EXCEPTION 'Only a returned RFI may be revised and resubmitted in place.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$request_guard$;

DROP TRIGGER IF EXISTS zz_guard_facilitator_request_write ON public.requests;
CREATE TRIGGER zz_guard_facilitator_request_write
    BEFORE INSERT OR UPDATE ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_facilitator_request_write();

COMMIT;
