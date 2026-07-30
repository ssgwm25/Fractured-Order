-- Industry submission permission recovery
--
-- Purpose:
-- 1) Normalize existing Industry participant seats before RLS resolves team and
--    surface ownership.
-- 2) Reassert same-team Industry Scribe inserts for actions, Strategic
--    Orientation forecasts, proposals, and RFIs.
-- 3) Allow the Industry Facilitator's legacy *_scribe seat to edit and submit
--    only Scribe-forwarded Strategic Orientation and proposal drafts.
-- 4) Keep cross-team writes, adjudication, and post-submission content changes
--    fail-closed.
--
-- Apply after:
--   data/2026-07-14_action_artifact_workflow_integrity.sql
--   data/2026-07-21_scribe_proposal_submit_policy.sql
--
-- Safe to reapply: functions are replaced, Industry rows are normalized
-- idempotently, and each policy is dropped before recreation.

BEGIN;

CREATE OR REPLACE FUNCTION public.live_demo_normalize_role(requested_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    sanitized_role TEXT := regexp_replace(
        LOWER(COALESCE(requested_role, '')),
        '[^a-z_]+',
        '',
        'g'
    );
BEGIN
    IF sanitized_role = '' THEN
        RETURN NULL;
    END IF;

    IF sanitized_role = 'white' THEN
        RETURN 'whitecell_lead';
    END IF;

    IF sanitized_role ~ '^((blue|red|green|industry)_)?whitecell(_lead)?$' THEN
        RETURN 'whitecell_lead';
    END IF;

    IF sanitized_role ~ '^((blue|red|green|industry)_)?whitecell_support$' THEN
        RETURN 'whitecell_support';
    END IF;

    RETURN sanitized_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_demo_participant_role(requested_session_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role TEXT;
BEGIN
    IF auth.uid() IS NULL OR requested_session_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT public.live_demo_normalize_role(COALESCE(sp.role, p.role))
    INTO resolved_role
    FROM public.session_participants sp
    INNER JOIN public.participants p
        ON p.id = sp.participant_id
    WHERE sp.session_id = requested_session_id
      AND sp.is_active = true
      AND p.auth_user_id = auth.uid()
    ORDER BY sp.joined_at DESC, sp.id DESC
    LIMIT 1;

    RETURN resolved_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_demo_participant_surface(requested_session_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role TEXT := public.live_demo_participant_role(requested_session_id);
BEGIN
    IF resolved_role = 'viewer' THEN
        RETURN 'viewer';
    END IF;

    IF resolved_role ~ '^(blue|red|green|industry)_facilitator$' THEN
        RETURN 'facilitator';
    END IF;

    IF resolved_role ~ '^(blue|red|green|industry)_scribe$' THEN
        RETURN 'scribe';
    END IF;

    IF resolved_role ~ '^(blue|red|green|industry)_notetaker$' THEN
        RETURN 'notetaker';
    END IF;

    IF resolved_role ~ '^whitecell(_lead|_support)?$' THEN
        RETURN 'whitecell';
    END IF;

    IF resolved_role ~ '^sme_(econ|ni_escalation|diplomacy_information|tsj|verba)$' THEN
        RETURN 'sme';
    END IF;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_demo_participant_team(requested_session_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role TEXT := public.live_demo_participant_role(requested_session_id);
BEGIN
    IF resolved_role ~ '^(blue|red|green|industry)_' THEN
        RETURN split_part(resolved_role, '_', 1);
    END IF;

    RETURN NULL;
END;
$$;

WITH normalized_industry_participants AS (
    SELECT
        p.id,
        public.live_demo_normalize_role(p.role) AS normalized_role
    FROM public.participants p
)
UPDATE public.participants p
SET
    role = normalized_industry_participants.normalized_role,
    updated_at = NOW()
FROM normalized_industry_participants
WHERE p.id = normalized_industry_participants.id
  AND normalized_industry_participants.normalized_role IN (
      'industry_facilitator',
      'industry_scribe',
      'industry_notetaker'
  )
  AND p.role IS DISTINCT FROM normalized_industry_participants.normalized_role;

WITH normalized_industry_seats AS (
    SELECT
        sp.id,
        public.live_demo_normalize_role(sp.role) AS normalized_role
    FROM public.session_participants sp
)
UPDATE public.session_participants sp
SET role = normalized_industry_seats.normalized_role
FROM normalized_industry_seats
WHERE sp.id = normalized_industry_seats.id
  AND normalized_industry_seats.normalized_role IN (
      'industry_facilitator',
      'industry_scribe',
      'industry_notetaker'
  )
  AND sp.role IS DISTINCT FROM normalized_industry_seats.normalized_role;

DROP POLICY IF EXISTS actions_industry_submission_insert ON public.actions;

CREATE POLICY actions_industry_submission_insert
    ON public.actions FOR INSERT
    WITH CHECK (
        LOWER(BTRIM(team)) = 'industry'
        AND public.live_demo_can_write_team_session(
            session_id,
            team,
            ARRAY['facilitator']::TEXT[]
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
                AND workflow_state = 'forwarded_to_facilitator'
                AND artifact_type IN (
                    'strategic_orientation_forecast',
                    'proposal'
                )
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
                AND artifact_type IN (
                    'strategic_orientation_forecast',
                    'proposal'
                )
                AND (
                    (
                        status = 'draft'
                        AND workflow_state = 'forwarded_to_facilitator'
                    )
                    OR (
                        status = 'submitted'
                        AND workflow_state = 'submitted_to_white_cell'
                    )
                )
            )
        )
    );

DROP POLICY IF EXISTS requests_industry_submission_insert ON public.requests;

CREATE POLICY requests_industry_submission_insert
    ON public.requests FOR INSERT
    WITH CHECK (
        LOWER(BTRIM(team)) = 'industry'
        AND public.live_demo_can_write_team_session(
            session_id,
            team,
            ARRAY['facilitator']::TEXT[]
        )
    );

DROP POLICY IF EXISTS requests_industry_submission_update ON public.requests;

CREATE POLICY requests_industry_submission_update
    ON public.requests FOR UPDATE
    USING (
        LOWER(BTRIM(team)) = 'industry'
        AND public.live_demo_can_write_team_session(
            session_id,
            team,
            ARRAY['facilitator']::TEXT[]
        )
    )
    WITH CHECK (
        LOWER(BTRIM(team)) = 'industry'
        AND status <> 'answered'
        AND public.live_demo_can_write_team_session(
            session_id,
            team,
            ARRAY['facilitator']::TEXT[]
        )
    );

REVOKE ALL ON FUNCTION public.live_demo_normalize_role(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_participant_role(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_participant_surface(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_participant_team(UUID) FROM PUBLIC;

COMMENT ON FUNCTION public.live_demo_normalize_role(TEXT) IS
    'Canonicalizes participant roles before live-demo RLS resolves their surface and team.';

COMMIT;
