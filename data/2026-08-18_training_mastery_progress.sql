-- Prompt 10: revision-safe, idempotent mastery progress and attempt-scoped reset.
-- This migration stores bounded event metadata only. Learner answers, narration,
-- transcripts, and training fixture bodies remain browser-memory data.

BEGIN;

ALTER TABLE public.training_attempts
    ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0
        CHECK (revision >= 0);

ALTER TABLE public.training_progress_events
    ADD COLUMN IF NOT EXISTS event_key TEXT;

UPDATE public.training_progress_events
SET event_key = 'legacy.' || id::TEXT
WHERE event_key IS NULL;

ALTER TABLE public.training_progress_events
    ALTER COLUMN event_key SET NOT NULL;
ALTER TABLE public.training_progress_events
    ALTER COLUMN event_key SET DEFAULT ('server.' || gen_random_uuid()::TEXT);

ALTER TABLE public.training_progress_events
    DROP CONSTRAINT IF EXISTS training_progress_events_event_key_check;
ALTER TABLE public.training_progress_events
    ADD CONSTRAINT training_progress_events_event_key_check
        CHECK (event_key ~ '^[a-z0-9][a-z0-9._-]{0,159}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_training_progress_events_attempt_event_key
    ON public.training_progress_events (attempt_id, event_key);

CREATE OR REPLACE FUNCTION public.get_training_attempt_bootstrap(
    requested_attempt_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    attempt_row public.training_attempts%ROWTYPE;
    training_template public.sessions%ROWTYPE;
    completed_steps JSONB;
    mastered_steps JSONB;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Training access unavailable.' USING ERRCODE = '42501';
    END IF;

    SELECT ta.* INTO attempt_row
    FROM public.training_attempts ta
    WHERE ta.id = requested_attempt_id
      AND ta.auth_user_id = current_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Training access unavailable.' USING ERRCODE = 'P0001';
    END IF;

    SELECT s.* INTO training_template
    FROM public.sessions s
    WHERE s.id = attempt_row.template_session_id
      AND s.session_code = 'TRAINING2026'
      AND s.status = 'active'
      AND s.session_classification = 'training_template'
      AND s.is_protected = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Training access unavailable.' USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(jsonb_agg(steps.step_id ORDER BY steps.step_id), '[]'::JSONB)
    INTO completed_steps
    FROM (
        SELECT DISTINCT tpe.step_id
        FROM public.training_progress_events tpe
        WHERE tpe.attempt_id = attempt_row.id
          AND tpe.auth_user_id = current_user_id
          AND tpe.step_id IS NOT NULL
          AND tpe.event_type IN ('step_completed', 'mastery_passed')
    ) steps;

    SELECT COALESCE(jsonb_agg(steps.step_id ORDER BY steps.step_id), '[]'::JSONB)
    INTO mastered_steps
    FROM (
        SELECT DISTINCT tpe.step_id
        FROM public.training_progress_events tpe
        WHERE tpe.attempt_id = attempt_row.id
          AND tpe.auth_user_id = current_user_id
          AND tpe.step_id IS NOT NULL
          AND tpe.event_type = 'mastery_passed'
    ) steps;

    RETURN jsonb_build_object(
        'attempt_id', attempt_row.id,
        'template_session_id', training_template.id,
        'curriculum_version', attempt_row.curriculum_version,
        'profile_id', attempt_row.team || '.' || attempt_row.semantic_role,
        'semantic_role', attempt_row.semantic_role,
        'team', attempt_row.team,
        'status', attempt_row.status,
        'current_step_id', attempt_row.current_step_id,
        'attempt_revision', attempt_row.revision,
        'completed_step_ids', completed_steps,
        'mastered_step_ids', mastered_steps,
        'resumed', true,
        'session_classification', training_template.session_classification,
        'is_protected', training_template.is_protected,
        'experience_plugin_id', 'ssg-training'
    );
END;
$$;

DROP FUNCTION IF EXISTS public.record_training_progress_event(UUID, TEXT, TEXT, TEXT);

CREATE FUNCTION public.record_training_progress_event(
    requested_attempt_id UUID,
    requested_event_type TEXT,
    requested_step_id TEXT DEFAULT NULL,
    requested_result_code TEXT DEFAULT NULL,
    requested_event_key TEXT DEFAULT NULL,
    requested_expected_revision BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    normalized_event_type TEXT := LOWER(BTRIM(requested_event_type));
    normalized_step_id TEXT := NULLIF(BTRIM(requested_step_id), '');
    normalized_result_code TEXT := NULLIF(LOWER(BTRIM(requested_result_code)), '');
    normalized_event_key TEXT := LOWER(BTRIM(requested_event_key));
    attempt_row public.training_attempts%ROWTYPE;
    created_event public.training_progress_events%ROWTYPE;
    next_revision BIGINT;
    completed_steps JSONB;
    mastered_steps JSONB;
BEGIN
    IF current_user_id IS NULL OR requested_attempt_id IS NULL THEN
        RAISE EXCEPTION 'Training attempt not found.' USING ERRCODE = 'P0002';
    END IF;

    IF normalized_event_type IS NULL OR normalized_event_type NOT IN (
        'step_started', 'step_completed', 'mastery_passed', 'mastery_failed',
        'attempt_completed', 'media_degraded', 'role_switched'
    ) OR normalized_event_key IS NULL
      OR normalized_event_key !~ '^[a-z0-9][a-z0-9._-]{0,159}$'
      OR (normalized_step_id IS NOT NULL AND normalized_step_id !~ '^[a-z0-9][a-z0-9._-]{0,95}$')
      OR (normalized_result_code IS NOT NULL AND normalized_result_code NOT IN (
          'passed', 'failed', 'completed', 'skipped', 'degraded'
      )) THEN
        RAISE EXCEPTION 'Unsupported training progress event.' USING ERRCODE = '22023';
    END IF;

    SELECT ta.* INTO attempt_row
    FROM public.training_attempts ta
    WHERE ta.id = requested_attempt_id
      AND ta.auth_user_id = current_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Training attempt not found.' USING ERRCODE = 'P0002';
    END IF;

    IF normalized_step_id IS NOT NULL AND normalized_step_id NOT IN (
        'training.v1.' || attempt_row.semantic_role || '.' || attempt_row.team || '.orient',
        'training.v1.' || attempt_row.semantic_role || '.' || attempt_row.team || '.show',
        'training.v1.' || attempt_row.semantic_role || '.' || attempt_row.team || '.guide',
        'training.v1.' || attempt_row.semantic_role || '.' || attempt_row.team || '.practice',
        'training.v1.' || attempt_row.semantic_role || '.' || attempt_row.team || '.respond',
        'training.v1.' || attempt_row.semantic_role || '.' || attempt_row.team || '.retrieve',
        'training.v1.' || attempt_row.semantic_role || '.' || attempt_row.team || '.reflect'
    ) THEN
        RAISE EXCEPTION 'Unsupported training progress step.' USING ERRCODE = '22023';
    END IF;

    SELECT tpe.* INTO created_event
    FROM public.training_progress_events tpe
    WHERE tpe.attempt_id = attempt_row.id
      AND tpe.auth_user_id = current_user_id
      AND tpe.event_key = normalized_event_key;

    IF FOUND THEN
        RETURN public.get_training_attempt_bootstrap(attempt_row.id) || jsonb_build_object(
            'event_id', created_event.id,
            'event_type', created_event.event_type,
            'step_id', created_event.step_id,
            'result_code', created_event.result_code,
            'created_at', created_event.created_at,
            'idempotent', true
        );
    END IF;

    IF attempt_row.status <> 'in_progress'
       AND NOT (attempt_row.status = 'completed' AND normalized_event_type = 'role_switched') THEN
        RAISE EXCEPTION 'Training attempt is not writable.' USING ERRCODE = 'P0001';
    END IF;

    IF requested_expected_revision IS NULL OR requested_expected_revision <> attempt_row.revision THEN
        RAISE EXCEPTION 'A newer training attempt revision exists. Refresh before retrying.'
            USING ERRCODE = '40001';
    END IF;

    IF normalized_event_type = 'attempt_completed' AND (
        SELECT COUNT(DISTINCT tpe.step_id)
        FROM public.training_progress_events tpe
        WHERE tpe.attempt_id = attempt_row.id
          AND tpe.auth_user_id = current_user_id
          AND tpe.event_type = 'mastery_passed'
    ) <> 7 THEN
        RAISE EXCEPTION 'Every curriculum step must be mastered before completion.'
            USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.training_progress_events (
        attempt_id, auth_user_id, curriculum_version, semantic_role, team,
        event_type, step_id, result_code, event_key
    ) VALUES (
        attempt_row.id, current_user_id, attempt_row.curriculum_version,
        attempt_row.semantic_role, attempt_row.team, normalized_event_type,
        normalized_step_id, normalized_result_code, normalized_event_key
    ) RETURNING * INTO created_event;

    next_revision := attempt_row.revision + 1;
    UPDATE public.training_attempts ta
    SET current_step_id = COALESCE(normalized_step_id, ta.current_step_id),
        status = CASE WHEN normalized_event_type = 'attempt_completed' THEN 'completed' ELSE ta.status END,
        completed_at = CASE WHEN normalized_event_type = 'attempt_completed' THEN NOW() ELSE ta.completed_at END,
        revision = next_revision,
        updated_at = NOW()
    WHERE ta.id = attempt_row.id AND ta.auth_user_id = current_user_id;

    SELECT COALESCE(jsonb_agg(steps.step_id ORDER BY steps.step_id), '[]'::JSONB)
    INTO completed_steps
    FROM (
        SELECT DISTINCT tpe.step_id
        FROM public.training_progress_events tpe
        WHERE tpe.attempt_id = attempt_row.id AND tpe.auth_user_id = current_user_id
          AND tpe.step_id IS NOT NULL
          AND tpe.event_type IN ('step_completed', 'mastery_passed')
    ) steps;

    SELECT COALESCE(jsonb_agg(steps.step_id ORDER BY steps.step_id), '[]'::JSONB)
    INTO mastered_steps
    FROM (
        SELECT DISTINCT tpe.step_id
        FROM public.training_progress_events tpe
        WHERE tpe.attempt_id = attempt_row.id AND tpe.auth_user_id = current_user_id
          AND tpe.step_id IS NOT NULL AND tpe.event_type = 'mastery_passed'
    ) steps;

    RETURN jsonb_build_object(
        'event_id', created_event.id,
        'attempt_id', attempt_row.id,
        'event_type', created_event.event_type,
        'step_id', created_event.step_id,
        'result_code', created_event.result_code,
        'created_at', created_event.created_at,
        'attempt_revision', next_revision,
        'attempt_status', CASE WHEN normalized_event_type = 'attempt_completed' THEN 'completed' ELSE attempt_row.status END,
        'current_step_id', COALESCE(normalized_step_id, attempt_row.current_step_id),
        'completed_step_ids', completed_steps,
        'mastered_step_ids', mastered_steps,
        'idempotent', false
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_training_attempt(
    requested_attempt_id UUID,
    requested_expected_revision BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    attempt_row public.training_attempts%ROWTYPE;
    new_attempt public.training_attempts%ROWTYPE;
BEGIN
    IF current_user_id IS NULL OR requested_attempt_id IS NULL THEN
        RAISE EXCEPTION 'Training attempt not found.' USING ERRCODE = 'P0002';
    END IF;

    SELECT ta.* INTO attempt_row
    FROM public.training_attempts ta
    WHERE ta.id = requested_attempt_id AND ta.auth_user_id = current_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Training attempt not found.' USING ERRCODE = 'P0002';
    END IF;
    IF requested_expected_revision IS NULL OR requested_expected_revision <> attempt_row.revision THEN
        RAISE EXCEPTION 'A newer training attempt revision exists. Refresh before retrying.'
            USING ERRCODE = '40001';
    END IF;
    IF attempt_row.status NOT IN ('in_progress', 'completed') THEN
        RAISE EXCEPTION 'Training attempt cannot be reset.' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.training_progress_events (
        attempt_id, auth_user_id, curriculum_version, semantic_role, team,
        event_type, result_code, event_key
    ) VALUES (
        attempt_row.id, current_user_id, attempt_row.curriculum_version,
        attempt_row.semantic_role, attempt_row.team, 'attempt_reset', 'completed',
        'attempt_reset.' || (attempt_row.revision + 1)::TEXT
    );

    UPDATE public.training_attempts
    SET status = 'reset', completed_at = NULL, current_step_id = NULL,
        revision = revision + 1, updated_at = NOW()
    WHERE id = attempt_row.id AND auth_user_id = current_user_id;

    INSERT INTO public.training_attempts (
        auth_user_id, template_session_id, curriculum_version, semantic_role, team
    ) VALUES (
        current_user_id, attempt_row.template_session_id, attempt_row.curriculum_version,
        attempt_row.semantic_role, attempt_row.team
    ) RETURNING * INTO new_attempt;

    INSERT INTO public.training_progress_events (
        attempt_id, auth_user_id, curriculum_version, semantic_role, team,
        event_type, event_key
    ) VALUES (
        new_attempt.id, current_user_id, new_attempt.curriculum_version,
        new_attempt.semantic_role, new_attempt.team, 'attempt_started', 'attempt_started'
    );

    RETURN public.get_training_attempt_bootstrap(new_attempt.id) || jsonb_build_object('resumed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.record_training_progress_event(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_training_attempt(UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_training_progress_event(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_training_attempt(UUID, BIGINT) TO authenticated;

COMMENT ON FUNCTION public.record_training_progress_event(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) IS
    'Owner-scoped, idempotent training progress write with compare-and-swap revision protection and bounded metadata.';
COMMENT ON FUNCTION public.reset_training_attempt(UUID, BIGINT) IS
    'Atomically retires only the caller-owned selected attempt and creates a pristine attempt for the same semantic profile.';

COMMIT;
