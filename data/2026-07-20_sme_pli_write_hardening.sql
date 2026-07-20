-- SME PLI write hardening
--
-- Purpose:
-- 1) Deny White Cell UPDATE on pli_adjudications (Lead views finalized seats
--    read-only; SME consoles own Approve / Override).
-- 2) Allow SME grants (and Game Master break-glass) to UPDATE pli_adjudications.
-- 3) Tighten sme_handoffs UPDATE so acknowledge is SME-grant scoped (insert
--    remains White Cell / Game Master for action-complete open).
--
-- Depends on: 2026-07-20_sme_handoffs.sql
-- Safe to reapply: DROP POLICY IF EXISTS + CREATE POLICY.

BEGIN;

DROP POLICY IF EXISTS pli_adjudications_select ON public.pli_adjudications;
DROP POLICY IF EXISTS pli_adjudications_update ON public.pli_adjudications;

-- Operators (WC / SME / GM) and teams (finalized aggregate only) can read.
CREATE POLICY pli_adjudications_select
    ON public.pli_adjudications FOR SELECT
    USING (
        public.live_demo_can_write_session_surface(
            session_id,
            ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]
        )
        OR public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('sme', session_id)
        OR public.live_demo_has_operator_grant('whitecell', session_id)
        OR (
            public.live_demo_can_read_session(session_id)
            AND status IN ('approved', 'overridden')
        )
    );

-- Writes: SME surface grant or Game Master only — not White Cell.
CREATE POLICY pli_adjudications_update
    ON public.pli_adjudications FOR UPDATE
    USING (
        public.live_demo_can_write_session_surface(
            session_id,
            ARRAY['sme', 'gamemaster']::TEXT[]
        )
        OR public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('sme', session_id)
    )
    WITH CHECK (
        status IN ('pending', 'approved', 'overridden', 'needs_human')
        AND (
            public.live_demo_can_write_session_surface(
                session_id,
                ARRAY['sme', 'gamemaster']::TEXT[]
            )
            OR public.live_demo_has_operator_grant('gamemaster')
            OR public.live_demo_has_operator_grant('sme', session_id)
        )
    );

DROP POLICY IF EXISTS sme_handoffs_update ON public.sme_handoffs;

-- Acknowledge / status updates: SME grant (or GM). White Cell may still INSERT.
CREATE POLICY sme_handoffs_update
    ON public.sme_handoffs FOR UPDATE
    USING (
        public.live_demo_can_write_session_surface(
            session_id,
            ARRAY['sme', 'gamemaster']::TEXT[]
        )
        OR public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('sme', session_id)
    )
    WITH CHECK (
        status IN ('pending', 'done')
        AND (
            public.live_demo_can_write_session_surface(
                session_id,
                ARRAY['sme', 'gamemaster']::TEXT[]
            )
            OR public.live_demo_has_operator_grant('gamemaster')
            OR public.live_demo_has_operator_grant('sme', session_id)
        )
    );

COMMIT;
