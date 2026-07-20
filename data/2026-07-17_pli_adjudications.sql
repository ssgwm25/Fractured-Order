-- PLI adjudications table (multi-track)
--
-- Purpose:
-- 1) Store the full multi-track trace produced by pli/run_pli.py:
--    macro (economic), National Interest, Glasl escalation, Diplomacy index,
--    and Information brief — matching adjudicate_router offline records.
-- 2) Give three White Cell SME seats independent Approve / Override surfaces:
--    macro, diplomacy_information, national_interest_escalation.
-- 3) Let teams read finalized adjudications for their own session only.
--
-- Writes of new rows come exclusively from the GitHub Actions workflow using
-- the service-role key (which bypasses RLS). Browser clients can only review.
--
-- Depends on: 2026-04-08_live_demo_rls_hardening.sql helper functions
-- (live_demo_can_read_session, live_demo_can_write_session_surface,
-- live_demo_has_operator_grant). Safe to reapply: policies are dropped
-- before recreation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pli_adjudications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_id UUID NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,

    -- Full multi-track trace (JSONB), typically:
    --   record.tracks.{macro,national_interest,glasl,diplomacy,information,routing}
    --   record.track_statuses
    --   record.agent / worksheet / adjudication (macro aliases for UI)
    --   record.submission_month / submission_timing / session_stack
    record JSONB NOT NULL,
    codebook_version TEXT NOT NULL,

    -- Aggregate pipeline status (pending until all active SME seats finalize)
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'overridden', 'needs_human')),
    sme_reviewer TEXT,
    reviewed_at TIMESTAMPTZ,
    override_value JSONB,
    override_rationale TEXT,

    -- Per-seat review state (three SME seats). Shape:
    -- {
    --   "macro": { "status", "sme_reviewer", "reviewed_at", "override_value", "override_rationale" },
    --   "diplomacy_information": { ... },
    --   "national_interest_escalation": { ... }
    -- }
    -- Seat status: pending | approved | overridden | needs_human | skipped
    seat_reviews JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT pli_override_requires_rationale CHECK (
        status <> 'overridden'
        OR (override_value IS NOT NULL AND COALESCE(BTRIM(override_rationale), '') <> '')
    )
);

-- Additive upgrade if an earlier macro-only table already exists
ALTER TABLE public.pli_adjudications
    ADD COLUMN IF NOT EXISTS seat_reviews JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pli_adjudications_action
    ON public.pli_adjudications(action_id);
CREATE INDEX IF NOT EXISTS idx_pli_adjudications_session
    ON public.pli_adjudications(session_id);
CREATE INDEX IF NOT EXISTS idx_pli_adjudications_status
    ON public.pli_adjudications(status);

ALTER TABLE public.pli_adjudications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pli_adjudications_select ON public.pli_adjudications;
DROP POLICY IF EXISTS pli_adjudications_update ON public.pli_adjudications;
DROP POLICY IF EXISTS pli_adjudications_insert ON public.pli_adjudications;
DROP POLICY IF EXISTS pli_adjudications_delete ON public.pli_adjudications;

-- Operators see all rows; teams see only aggregate-finalized records.
CREATE POLICY pli_adjudications_select
    ON public.pli_adjudications FOR SELECT
    USING (
        public.live_demo_can_write_session_surface(session_id, ARRAY['whitecell', 'gamemaster']::TEXT[])
        OR public.live_demo_has_operator_grant('gamemaster')
        OR (
            public.live_demo_can_read_session(session_id)
            AND status IN ('approved', 'overridden')
        )
    );

CREATE POLICY pli_adjudications_update
    ON public.pli_adjudications FOR UPDATE
    USING (
        public.live_demo_can_write_session_surface(session_id, ARRAY['whitecell', 'gamemaster']::TEXT[])
        OR public.live_demo_has_operator_grant('gamemaster')
    )
    WITH CHECK (
        status IN ('pending', 'approved', 'overridden', 'needs_human')
        AND (
            public.live_demo_can_write_session_surface(session_id, ARRAY['whitecell', 'gamemaster']::TEXT[])
            OR public.live_demo_has_operator_grant('gamemaster')
        )
    );

COMMENT ON TABLE public.pli_adjudications IS
    'PLI multi-track adjudication records: macro / NI / Glasl / Diplomacy / Information traces pending SME seat approval in White Cell.';
COMMENT ON COLUMN public.pli_adjudications.record IS
    'Full multi-track trace (tracks.*, agent attempts, macro worksheet aliases, timing, session stack).';
COMMENT ON COLUMN public.pli_adjudications.seat_reviews IS
    'Per-SME-seat review state: macro, diplomacy_information, national_interest_escalation.';
COMMENT ON COLUMN public.pli_adjudications.override_value IS
    'Legacy top-level override payload; prefer seat_reviews.*.override_value for multi-seat reviews.';

COMMIT;
