-- ESG Simulation Platform
-- Current Build Supabase Patch
-- Apply this after data/COMPLETE_SCHEMA.sql
--
-- Purpose:
-- 1) Align the schema with the currently shipped frontend build.
-- 2) Preserve compatibility with legacy rows where practical.
-- 3) Make the current action, request, and communication flows insert/update safely.

BEGIN;

-- ============================================================================
-- 1. ACTIONS
-- ============================================================================

ALTER TABLE public.actions
    ADD COLUMN IF NOT EXISTS priority TEXT,
    ADD COLUMN IF NOT EXISTS outcome TEXT,
    ADD COLUMN IF NOT EXISTS adjudication_notes TEXT;

UPDATE public.actions
SET priority = 'NORMAL'
WHERE priority IS NULL
   OR priority NOT IN ('NORMAL', 'HIGH', 'URGENT');

UPDATE public.actions
SET outcome = NULL
WHERE outcome IS NOT NULL
  AND outcome NOT IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAIL', 'BACKFIRE');

UPDATE public.actions
SET outcome = COALESCE(outcome, adjudication->>'outcome'),
    adjudication_notes = COALESCE(
        adjudication_notes,
        adjudication->>'adjudication_notes',
        adjudication->>'notes'
    )
WHERE adjudication IS NOT NULL;

UPDATE public.actions
SET submitted_at = COALESCE(submitted_at, created_at)
WHERE status IN ('submitted', 'adjudicated')
  AND submitted_at IS NULL;

UPDATE public.actions
SET adjudicated_at = COALESCE(adjudicated_at, updated_at, created_at)
WHERE status = 'adjudicated'
  AND adjudicated_at IS NULL;

ALTER TABLE public.actions
    ALTER COLUMN priority SET DEFAULT 'NORMAL',
    ALTER COLUMN priority SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'draft';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.actions'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%priority%'
    ) THEN
        ALTER TABLE public.actions
            ADD CONSTRAINT actions_priority_check
            CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.actions'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%outcome%'
    ) THEN
        ALTER TABLE public.actions
            ADD CONSTRAINT actions_outcome_check
            CHECK (outcome IS NULL OR outcome IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAIL', 'BACKFIRE'));
    END IF;
END $$;

-- ============================================================================
-- 2. REQUESTS
-- ============================================================================

ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS response TEXT,
    ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

UPDATE public.requests
SET responded_at = COALESCE(responded_at, answered_at)
WHERE answered_at IS NOT NULL;

UPDATE public.requests
SET answered_at = COALESCE(answered_at, responded_at)
WHERE responded_at IS NOT NULL;

UPDATE public.requests r
SET response = COALESCE(r.response, c.content),
    status = CASE WHEN r.status = 'withdrawn' THEN r.status ELSE 'answered' END,
    responded_at = COALESCE(r.responded_at, c.created_at),
    answered_at = COALESCE(r.answered_at, c.created_at)
FROM public.communications c
WHERE c.linked_request_id = r.id
  AND c.content IS NOT NULL
  AND c.type IN ('rfi_response', 'RFI_RESPONSE')
  AND (
      r.response IS NULL
      OR r.responded_at IS NULL
      OR r.answered_at IS NULL
  );

UPDATE public.requests
SET response_time_seconds = GREATEST(
    EXTRACT(EPOCH FROM (COALESCE(responded_at, answered_at) - created_at))::INTEGER,
    0
)
WHERE COALESCE(responded_at, answered_at) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_request_response_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.responded_at IS NULL AND NEW.answered_at IS NOT NULL THEN
        NEW.responded_at := NEW.answered_at;
    END IF;

    IF NEW.answered_at IS NULL AND NEW.responded_at IS NOT NULL THEN
        NEW.answered_at := NEW.responded_at;
    END IF;

    IF NEW.status = 'answered' AND NEW.responded_at IS NULL AND NEW.response IS NOT NULL THEN
        NEW.responded_at := COALESCE(NEW.responded_at, NEW.answered_at, NOW());
    END IF;

    IF NEW.status = 'answered' AND NEW.answered_at IS NULL AND NEW.responded_at IS NOT NULL THEN
        NEW.answered_at := NEW.responded_at;
    END IF;

    IF NEW.responded_at IS NOT NULL AND NEW.created_at IS NOT NULL THEN
        NEW.response_time_seconds := GREATEST(
            EXTRACT(EPOCH FROM (NEW.responded_at - NEW.created_at))::INTEGER,
            0
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_request_response_fields ON public.requests;

CREATE TRIGGER sync_request_response_fields
    BEFORE INSERT OR UPDATE ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_request_response_fields();

-- ============================================================================
-- 3. COMMUNICATIONS
-- ============================================================================

ALTER TABLE public.communications
    ADD COLUMN IF NOT EXISTS metadata JSONB;

UPDATE public.communications
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

ALTER TABLE public.communications
    ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
    ALTER COLUMN metadata SET NOT NULL,
    ALTER COLUMN move SET DEFAULT 1;

UPDATE public.communications c
SET move = COALESCE(c.move, gs.move, 1)
FROM public.game_state gs
WHERE c.session_id = gs.session_id
  AND c.move IS NULL;

UPDATE public.communications
SET move = 1
WHERE move IS NULL;

ALTER TABLE public.communications
    DROP CONSTRAINT IF EXISTS communications_type_check;

DO $$
DECLARE
    constraint_row RECORD;
BEGIN
    FOR constraint_row IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.communications'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%type%'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.communications DROP CONSTRAINT %I',
            constraint_row.conname
        );
    END LOOP;
END $$;

ALTER TABLE public.communications
    ADD CONSTRAINT communications_type_check
    CHECK (
        type IN (
            'INJECT',
            'ANNOUNCEMENT',
            'GUIDANCE',
            'PROPOSAL_FORWARDED',
            'PROPOSAL_RESPONSE',
            'rfi_response',
            'RFI_RESPONSE',
            'broadcast',
            'direct',
            'system',
            'game_update',
            'message'
        )
    );

CREATE OR REPLACE FUNCTION public.set_communications_move_default()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.move IS NULL THEN
        SELECT gs.move
        INTO NEW.move
        FROM public.game_state gs
        WHERE gs.session_id = NEW.session_id;

        NEW.move := COALESCE(NEW.move, 1);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS communications_default_move ON public.communications;

CREATE TRIGGER communications_default_move
    BEFORE INSERT ON public.communications
    FOR EACH ROW
    EXECUTE FUNCTION public.set_communications_move_default();

-- Keep the legacy communication-linked request update path working.
CREATE OR REPLACE FUNCTION public.update_request_response_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.linked_request_id IS NOT NULL AND NEW.type IN ('rfi_response', 'RFI_RESPONSE') THEN
        UPDATE public.requests
        SET response = COALESCE(response, NEW.content),
            status = CASE WHEN status = 'withdrawn' THEN status ELSE 'answered' END,
            responded_at = COALESCE(responded_at, NEW.created_at),
            answered_at = COALESCE(answered_at, NEW.created_at),
            response_time_seconds = GREATEST(
                EXTRACT(EPOCH FROM (COALESCE(responded_at, NEW.created_at) - created_at))::INTEGER,
                0
            )
        WHERE id = NEW.linked_request_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_request_on_communication ON public.communications;

CREATE TRIGGER update_request_on_communication
    AFTER INSERT ON public.communications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_request_response_time();

COMMIT;
