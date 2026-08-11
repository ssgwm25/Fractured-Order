-- Repair the requests row shape required by the Facilitator RFI guard.
-- Apply after data/2026-08-06_proposal_recipient_threads.sql.
--
-- Some provisioned databases received response/responded_at from the April
-- hardening migration but never received responded_by. The August Facilitator
-- guard reads NEW.responded_by on every insert, so those databases reject a
-- valid new RFI before RLS can complete the write.

BEGIN;

ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS responded_by TEXT;

COMMENT ON COLUMN public.requests.responded_by IS
    'Responder identifier for answered RFIs; NULL until White Cell records an answer.';

COMMIT;
