-- Scribe action submission policy patch
--
-- Purpose:
-- 1) Allow same-team Scribes to submit facilitator-forwarded draft actions and
--    Strategic Orientation artifacts to White Cell.
-- 2) Keep facilitator ownership of draft creation/editing.
-- 3) Keep adjudicated rows fail-closed.
--
-- Apply this to already-provisioned Supabase projects after the live-demo RLS
-- hardening migrations. Safe to reapply: the policy is dropped before
-- recreation.

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
                )
            )
        )
    );

COMMIT;
