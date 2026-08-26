-- Retire the dedicated SSG training product without deleting historical attempts.
--
-- This migration releases TRAINING2026 for normal session-code use, removes the
-- callable training RPC surface, and keeps prior anonymous attempt/progress rows
-- attached to a protected, non-live archive record.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('decommission-ssg-training'));

DROP TRIGGER IF EXISTS protect_training_template_session ON public.sessions;
DROP TRIGGER IF EXISTS protect_protected_session ON public.sessions;
DROP TRIGGER IF EXISTS prevent_training_template_game_state ON public.game_state;
DROP TRIGGER IF EXISTS prevent_training_template_participant_seat ON public.session_participants;
DROP TRIGGER IF EXISTS prevent_non_live_game_state ON public.game_state;
DROP TRIGGER IF EXISTS prevent_non_live_participant_seat ON public.session_participants;

ALTER TABLE public.sessions
    DROP CONSTRAINT IF EXISTS sessions_training_template_shape_check,
    DROP CONSTRAINT IF EXISTS sessions_retired_archive_shape_check,
    DROP CONSTRAINT IF EXISTS sessions_session_classification_check;

UPDATE public.sessions
SET name = 'Retired SSG training archive',
    status = 'archived',
    session_code = NULL,
    metadata = (
        COALESCE(metadata, '{}'::JSONB)
        - 'session_code'
        - 'experience_plugin_id'
        - 'curriculum_version'
    ) || jsonb_build_object(
        'decommissioned_feature', 'ssg-training',
        'decommissioned_at', '2026-08-26',
        'historical_records_only', true
    ),
    session_classification = 'retired_training_archive',
    is_protected = true,
    deleted_at = NULL,
    updated_at = NOW()
WHERE id = '00000000-0000-4000-8000-000000002026'::UUID
  AND session_classification = 'training_template'
  AND is_protected = true;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.sessions
        WHERE id = '00000000-0000-4000-8000-000000002026'::UUID
          AND status = 'archived'
          AND session_code IS NULL
          AND NOT (COALESCE(metadata, '{}'::JSONB) ? 'session_code')
          AND session_classification = 'retired_training_archive'
          AND is_protected = true
          AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'The retired training archive could not be verified; decommission aborted.';
    END IF;
END;
$$;

ALTER TABLE public.sessions
    ADD CONSTRAINT sessions_session_classification_check
        CHECK (session_classification IN ('live_exercise', 'retired_training_archive')),
    ADD CONSTRAINT sessions_retired_archive_shape_check CHECK (
        session_classification = 'live_exercise'
        OR (
            id = '00000000-0000-4000-8000-000000002026'::UUID
            AND session_classification = 'retired_training_archive'
            AND is_protected = true
            AND status = 'archived'
            AND session_code IS NULL
            AND NOT (COALESCE(metadata, '{}'::JSONB) ? 'session_code')
            AND deleted_at IS NULL
        )
    );

COMMENT ON COLUMN public.sessions.session_classification IS
    'Constrained session purpose. live_exercise is operational; retired_training_archive preserves decommissioned training history and is never joinable.';

CREATE OR REPLACE FUNCTION public.prevent_protected_session_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'DELETE' AND OLD.is_protected = true)
       OR (TG_OP = 'UPDATE' AND OLD.is_protected = true) THEN
        RAISE EXCEPTION 'Protected sessions cannot be changed.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP <> 'DELETE'
       AND NEW.session_classification <> 'live_exercise'
       AND NEW.is_protected IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Non-live session archives must be protected.'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER protect_protected_session
    BEFORE INSERT OR UPDATE OR DELETE ON public.sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_protected_session_mutation();

CREATE OR REPLACE FUNCTION public.prevent_non_live_session_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.sessions s
        WHERE s.id = NEW.session_id
          AND s.session_classification <> 'live_exercise'
    ) THEN
        RAISE EXCEPTION 'Non-live session archives cannot own live exercise state.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_non_live_game_state
    BEFORE INSERT OR UPDATE ON public.game_state
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_non_live_session_state();

CREATE TRIGGER prevent_non_live_participant_seat
    BEFORE INSERT OR UPDATE ON public.session_participants
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_non_live_session_state();

DROP FUNCTION IF EXISTS public.prevent_training_template_live_state();

DROP FUNCTION IF EXISTS public.start_or_resume_training_attempt(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_training_attempt_bootstrap(UUID);
DROP FUNCTION IF EXISTS public.record_training_progress_event(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_training_progress_event(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.reset_training_attempt(UUID, BIGINT);

DROP POLICY IF EXISTS training_attempts_owner_select ON public.training_attempts;
DROP POLICY IF EXISTS training_progress_events_owner_select ON public.training_progress_events;
REVOKE ALL ON public.training_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.training_progress_events FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.training_attempts IS
    'Administrator-only historical records retained after the SSG training product was decommissioned.';
COMMENT ON TABLE public.training_progress_events IS
    'Administrator-only historical progress records retained after the SSG training product was decommissioned.';

COMMIT;
