-- PLI FO 2.0: stamp Plenum timer progress onto actions at submit time.
-- Apply in Supabase SQL editor after the pli_adjudications migration.
--
-- DEFERRED: wire Fractured-Order database.submitAction to populate these columns
-- when Plenum is finalized and PLI is integrated into the live delivery platform.
-- Until then PLI falls back to live game_state timer / within-move ordinal spacing.
-- See plenum/INTEGRATION.md → "Deferred — wire on Plenum / Fractured-Order integration".
--
-- These columns let run_pli.py / submission_timing.py recover the diegetic
-- submission_month even after game_state.move has advanced.

ALTER TABLE public.actions
    ADD COLUMN IF NOT EXISTS timer_seconds_at_submit DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS timer_allocation_at_submit DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS submission_month TEXT,
    ADD COLUMN IF NOT EXISTS game_month TEXT;

COMMENT ON COLUMN public.actions.timer_seconds_at_submit IS
    'PLI FO 2.0: remaining move timer seconds captured when the action was submitted';
COMMENT ON COLUMN public.actions.timer_allocation_at_submit IS
    'PLI FO 2.0: move timer allocation seconds at submit (denominator for elapsed fraction)';
COMMENT ON COLUMN public.actions.submission_month IS
    'Optional explicit YYYY-MM diegetic month; when set, PLI prefers it over timer grounding';
COMMENT ON COLUMN public.actions.game_month IS
    'Alias for submission_month used by some Plenum builds';
