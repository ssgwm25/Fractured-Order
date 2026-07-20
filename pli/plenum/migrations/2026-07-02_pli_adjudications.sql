-- PLI adjudications table
--
-- Purpose:
-- 1) Store the full trace record produced by the PLI pipeline (pli/run_pli.py):
--    agent worksheet with rule citations, deterministic engine output
--    (Implementation/Fit scores, per-indicator six-year trend deltas), and
--    the codebook version used.
-- 2) Give White Cell an Approve / Override review surface. Nothing becomes
--    the adjudication of record without SME sign-off; overrides require a
--    rationale.
-- 3) Let teams read APPROVED adjudications for their own session only.
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

    -- Full trace record (JSONB):
    --   record.agent            { model, attempts[] }
    --   record.worksheet        agent worksheet: classification + rule citation,
    --                           precedent tier + statutory citations, modifiers,
    --                           fit band/score/rationale
    --   record.adjudication     engine output: implementation, fit, trend
    --                           (per-indicator baseline/deltas/post_action/verdict)
    --   record.needs_human_reason  present when status = 'needs_human'
    record JSONB NOT NULL,
    codebook_version TEXT NOT NULL,

    -- Review lifecycle
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'overridden', 'needs_human')),
    sme_reviewer TEXT,
    reviewed_at TIMESTAMPTZ,
    -- Override payload: replacement scores / deltas in the same shape as
    -- record.adjudication. Required (with rationale) when status = 'overridden'.
    override_value JSONB,
    override_rationale TEXT,

    CONSTRAINT pli_override_requires_rationale CHECK (
        status <> 'overridden'
        OR (override_value IS NOT NULL AND COALESCE(BTRIM(override_rationale), '') <> '')
    )
);

-- One live adjudication per action; reruns replace via ON CONFLICT in the
-- pipeline or land as needs_human after SME deletion.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pli_adjudications_action
    ON public.pli_adjudications(action_id);
CREATE INDEX IF NOT EXISTS idx_pli_adjudications_session
    ON public.pli_adjudications(session_id);
CREATE INDEX IF NOT EXISTS idx_pli_adjudications_status
    ON public.pli_adjudications(status);

ALTER TABLE public.pli_adjudications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS pli_adjudications_select ON public.pli_adjudications;
DROP POLICY IF EXISTS pli_adjudications_update ON public.pli_adjudications;
DROP POLICY IF EXISTS pli_adjudications_insert ON public.pli_adjudications;
DROP POLICY IF EXISTS pli_adjudications_delete ON public.pli_adjudications;

-- Read: White Cell and Game Master operators see everything in sessions they
-- can read; team participants see only APPROVED / OVERRIDDEN records for
-- their session (the adjudication of record, not the pending queue).
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

-- Review: only White Cell / Game Master surfaces may approve or override.
-- Fail-closed on the write side: the row must stay in a review status and
-- overrides must carry a rationale (table CHECK constraint).
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

-- No browser INSERT/DELETE policies on purpose: new rows are written only by
-- the pipeline through the service-role key, which bypasses RLS. Browsers
-- cannot mint or destroy adjudication records.

COMMENT ON TABLE public.pli_adjudications IS
    'PLI (Petrihos Lever Index) adjudication records: full traceable chain from agent worksheet to trend-line deltas, pending SME approval in the White Cell interface.';
COMMENT ON COLUMN public.pli_adjudications.record IS
    'Full trace: agent attempts, worksheet with rule/statute citations, deterministic engine adjudication (scores + per-indicator six-year deltas).';
COMMENT ON COLUMN public.pli_adjudications.override_value IS
    'SME replacement adjudication (same shape as record.adjudication). Becomes the adjudication of record when status = overridden.';

COMMIT;
