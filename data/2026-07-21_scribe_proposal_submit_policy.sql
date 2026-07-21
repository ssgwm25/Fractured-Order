-- Scribe proposal draft update policy patch
--
-- Purpose:
-- 1) Allow same-team Facilitator seats (data-role-surface=scribe) to update and
--    submit scribe-forwarded draft proposals to White Cell.
-- 2) Preserve existing Blue action + Strategic Orientation scribe update rights.
-- 3) Keep adjudicated rows fail-closed.
--
-- Safe to reapply: the policy is dropped before recreation.

BEGIN;

DROP POLICY IF EXISTS actions_live_demo_update ON public.actions;

CREATE POLICY actions_live_demo_update
    ON public.actions FOR UPDATE
    USING (
        public.live_demo_can_write_team_session(session_id, team, ARRAY['facilitator']::TEXT[])
        OR (
            public.live_demo_can_write_team_session(session_id, team, ARRAY['scribe']::TEXT[])
            AND status = 'draft'
            AND LOWER(COALESCE(ally_contingencies, '')) LIKE '%scribe handoff: forwarded%'
            AND (
                LOWER(COALESCE(ally_contingencies, '')) LIKE 'blue team action details%'
                OR (
                    mechanism = 'Strategic Orientation'
                    AND LOWER(COALESCE(ally_contingencies, '')) LIKE 'strategic orientation details%'
                )
                OR (
                    mechanism = 'Proposal'
                    AND LOWER(COALESCE(ally_contingencies, '')) LIKE 'proposal details%'
                )
            )
        )
    )
    WITH CHECK (
        status <> 'adjudicated'
        AND (
            public.live_demo_can_write_team_session(session_id, team, ARRAY['facilitator']::TEXT[])
            OR (
                public.live_demo_can_write_team_session(session_id, team, ARRAY['scribe']::TEXT[])
                AND status IN ('draft', 'submitted')
                AND LOWER(COALESCE(ally_contingencies, '')) LIKE '%scribe handoff: forwarded%'
                AND (
                    LOWER(COALESCE(ally_contingencies, '')) LIKE 'blue team action details%'
                    OR (
                        mechanism = 'Strategic Orientation'
                        AND LOWER(COALESCE(ally_contingencies, '')) LIKE 'strategic orientation details%'
                    )
                    OR (
                        mechanism = 'Proposal'
                        AND LOWER(COALESCE(ally_contingencies, '')) LIKE 'proposal details%'
                    )
                )
            )
        )
    );

COMMIT;
