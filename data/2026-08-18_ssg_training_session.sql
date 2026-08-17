-- SSG self-guided training session and learner-attempt isolation contract
--
-- This migration creates one permanent TRAINING2026 template. The template is
-- not a live exercise: it never owns participant seats, game state, Realtime
-- subscriptions, or research evidence. Learner state is owned by auth.uid().

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS session_classification TEXT NOT NULL DEFAULT 'live_exercise',
    ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.sessions
    DROP CONSTRAINT IF EXISTS sessions_session_classification_check,
    DROP CONSTRAINT IF EXISTS sessions_training_template_shape_check;

ALTER TABLE public.sessions
    ADD CONSTRAINT sessions_session_classification_check
        CHECK (session_classification IN ('live_exercise', 'training_template')),
    ADD CONSTRAINT sessions_training_template_shape_check CHECK (
        session_classification = 'live_exercise'
        OR (
            id = '00000000-0000-4000-8000-000000002026'::UUID
            AND is_protected = true
            AND status = 'active'
            AND session_code = 'TRAINING2026'
            AND deleted_at IS NULL
        )
    );

COMMENT ON COLUMN public.sessions.session_classification IS
    'Constrained session purpose. live_exercise participates in seats/game state/research; training_template does not.';
COMMENT ON COLUMN public.sessions.is_protected IS
    'Database-enforced immutability flag. Protected rows cannot be updated or deleted through any mutation path.';

-- A reapplication must be able to repair the one known template row. Dropping
-- this migration-owned trigger is safe inside the transaction; it is recreated
-- before commit. A conflicting live row is never relabelled as training.
DROP TRIGGER IF EXISTS protect_training_template_session ON public.sessions;

DO $$
DECLARE
    training_template_id CONSTANT UUID := '00000000-0000-4000-8000-000000002026'::UUID;
    conflicting_session_id UUID;
BEGIN
    SELECT s.id
    INTO conflicting_session_id
    FROM public.sessions s
    WHERE UPPER(COALESCE(NULLIF(BTRIM(s.session_code), ''), BTRIM(s.metadata->>'session_code'))) = 'TRAINING2026'
      AND s.id <> training_template_id
    LIMIT 1;

    IF conflicting_session_id IS NOT NULL THEN
        RAISE EXCEPTION 'TRAINING2026 is already assigned to a different session; refusing to relabel live evidence.'
            USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.sessions s
        WHERE s.id = training_template_id
          AND UPPER(COALESCE(NULLIF(BTRIM(s.session_code), ''), BTRIM(s.metadata->>'session_code')))
              IS DISTINCT FROM 'TRAINING2026'
    ) THEN
        RAISE EXCEPTION 'The reserved TRAINING2026 template identifier is already in use.'
            USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.sessions (
        id,
        name,
        status,
        session_code,
        metadata,
        session_classification,
        is_protected,
        deleted_at
    )
    VALUES (
        training_template_id,
        'SSG TRAINING2026 Template',
        'active',
        'TRAINING2026',
        jsonb_build_object(
            'session_code', 'TRAINING2026',
            'description', 'Protected self-guided training template; not live exercise evidence.',
            'curriculum_version', '1.0'
        ),
        'training_template',
        true,
        NULL
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        status = EXCLUDED.status,
        session_code = EXCLUDED.session_code,
        metadata = COALESCE(public.sessions.metadata, '{}'::JSONB) || EXCLUDED.metadata,
        session_classification = EXCLUDED.session_classification,
        is_protected = EXCLUDED.is_protected,
        deleted_at = NULL,
        updated_at = NOW();
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.game_state gs
        WHERE gs.session_id = '00000000-0000-4000-8000-000000002026'::UUID
    ) OR EXISTS (
        SELECT 1
        FROM public.session_participants sp
        WHERE sp.session_id = '00000000-0000-4000-8000-000000002026'::UUID
    ) THEN
        RAISE EXCEPTION 'TRAINING2026 contains live state; preserve it and perform a reviewed forward repair.'
            USING ERRCODE = 'P0001';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_protected_session_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.is_protected = true THEN
        RAISE EXCEPTION 'Protected sessions cannot be deleted.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.is_protected = true THEN
        RAISE EXCEPTION 'Protected sessions cannot be changed.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP <> 'DELETE'
       AND NEW.session_classification = 'training_template'
       AND NEW.is_protected IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Training templates must be protected.'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER protect_training_template_session
    BEFORE INSERT OR UPDATE OR DELETE ON public.sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_protected_session_mutation();

-- Defense in depth: even a caller that learns the template UUID cannot attach
-- a live seat or game_state row to it.
CREATE OR REPLACE FUNCTION public.prevent_training_template_live_state()
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
          AND s.session_classification = 'training_template'
          AND s.is_protected = true
    ) THEN
        RAISE EXCEPTION 'Training templates cannot own live exercise state.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_training_template_game_state ON public.game_state;
CREATE TRIGGER prevent_training_template_game_state
    BEFORE INSERT OR UPDATE ON public.game_state
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_training_template_live_state();

DROP TRIGGER IF EXISTS prevent_training_template_participant_seat ON public.session_participants;
CREATE TRIGGER prevent_training_template_participant_seat
    BEFORE INSERT OR UPDATE ON public.session_participants
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_training_template_live_state();

-- All existing live-table RLS policies route through these helpers. Requiring
-- the explicit live classification keeps an accidental live persistence call
-- from treating the training template as a readable or writable exercise.
CREATE OR REPLACE FUNCTION public.live_demo_can_read_session(requested_session_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.sessions s
            WHERE s.id = requested_session_id
              AND s.session_classification = 'live_exercise'
              AND s.is_protected = false
        )
        AND (
            EXISTS (
                SELECT 1
                FROM public.session_participants sp
                INNER JOIN public.participants p
                    ON p.id = sp.participant_id
                WHERE sp.session_id = requested_session_id
                  AND sp.is_active = true
                  AND p.auth_user_id = auth.uid()
            )
            OR public.live_demo_has_operator_grant('gamemaster')
            OR public.live_demo_has_operator_grant('whitecell')
        )
$$;

CREATE OR REPLACE FUNCTION public.live_demo_can_write_session(requested_session_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1
            FROM public.sessions s
            WHERE s.id = requested_session_id
              AND s.status = 'active'
              AND s.session_classification = 'live_exercise'
              AND s.is_protected = false
        )
        AND public.live_demo_can_read_session(requested_session_id)
        AND COALESCE(public.live_demo_participant_surface(requested_session_id), '') <> 'viewer'
$$;

CREATE TABLE IF NOT EXISTS public.training_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID NOT NULL,
    template_session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT,
    curriculum_version TEXT NOT NULL DEFAULT '1.0'
        CHECK (curriculum_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
    semantic_role TEXT NOT NULL CHECK (semantic_role IN ('scribe', 'facilitator', 'notetaker')),
    team TEXT NOT NULL CHECK (team IN ('blue', 'red', 'green', 'industry')),
    status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'completed', 'reset')),
    current_step_id TEXT CHECK (
        current_step_id IS NULL OR current_step_id ~ '^[a-z0-9][a-z0-9._-]{0,95}$'
    ),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_resumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT training_attempts_completion_shape_check CHECK (
        (status = 'completed' AND completed_at IS NOT NULL)
        OR (status <> 'completed' AND completed_at IS NULL)
    ),
    CONSTRAINT training_attempts_owner_profile_unique
        UNIQUE (id, auth_user_id, curriculum_version, semantic_role, team)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_training_attempts_one_in_progress_profile
    ON public.training_attempts (
        auth_user_id,
        template_session_id,
        curriculum_version,
        semantic_role,
        team
    )
    WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_training_attempts_owner_updated
    ON public.training_attempts (auth_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.training_progress_events (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    attempt_id UUID NOT NULL,
    auth_user_id UUID NOT NULL,
    curriculum_version TEXT NOT NULL,
    semantic_role TEXT NOT NULL,
    team TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'attempt_started',
        'attempt_resumed',
        'step_started',
        'step_completed',
        'mastery_passed',
        'mastery_failed',
        'attempt_completed',
        'attempt_reset',
        'media_degraded',
        'role_switched'
    )),
    step_id TEXT CHECK (step_id IS NULL OR step_id ~ '^[a-z0-9][a-z0-9._-]{0,95}$'),
    result_code TEXT CHECK (
        result_code IS NULL
        OR result_code IN ('passed', 'failed', 'completed', 'skipped', 'degraded')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT training_progress_events_attempt_owner_fk FOREIGN KEY (
        attempt_id,
        auth_user_id,
        curriculum_version,
        semantic_role,
        team
    ) REFERENCES public.training_attempts (
        id,
        auth_user_id,
        curriculum_version,
        semantic_role,
        team
    ) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_training_progress_events_attempt_order
    ON public.training_progress_events (attempt_id, id);

COMMENT ON TABLE public.training_attempts IS
    'Anonymous-auth learner attempts. Ownership is auth.uid(); the shared training code is not identity verification.';
COMMENT ON TABLE public.training_progress_events IS
    'Bounded, content-free training progress evidence. Never stores learner answers, narration, transcripts, or dummy artifact bodies.';

CREATE OR REPLACE FUNCTION public.enforce_training_progress_event_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (
        SELECT COUNT(*)
        FROM public.training_progress_events tpe
        WHERE tpe.attempt_id = NEW.attempt_id
          AND tpe.auth_user_id = NEW.auth_user_id
    ) >= 500 THEN
        RAISE EXCEPTION 'Training progress event limit reached.'
            USING ERRCODE = '54000';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bound_training_progress_events ON public.training_progress_events;
CREATE TRIGGER bound_training_progress_events
    BEFORE INSERT ON public.training_progress_events
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_training_progress_event_limit();

ALTER TABLE public.training_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_progress_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_attempts_owner_select ON public.training_attempts;
CREATE POLICY training_attempts_owner_select
    ON public.training_attempts FOR SELECT
    USING (auth.uid() IS NOT NULL AND auth_user_id = auth.uid());

DROP POLICY IF EXISTS training_progress_events_owner_select ON public.training_progress_events;
CREATE POLICY training_progress_events_owner_select
    ON public.training_progress_events FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND auth_user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.training_attempts ta
            WHERE ta.id = training_progress_events.attempt_id
              AND ta.auth_user_id = auth.uid()
        )
    );

REVOKE ALL ON public.training_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.training_progress_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.training_attempts TO authenticated;
GRANT SELECT ON public.training_progress_events TO authenticated;

CREATE OR REPLACE FUNCTION public.start_or_resume_training_attempt(
    requested_code TEXT,
    requested_semantic_role TEXT,
    requested_team TEXT,
    requested_curriculum_version TEXT DEFAULT '1.0'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    normalized_role TEXT := LOWER(BTRIM(requested_semantic_role));
    normalized_team TEXT := LOWER(BTRIM(requested_team));
    normalized_curriculum_version TEXT := BTRIM(requested_curriculum_version);
    training_template public.sessions%ROWTYPE;
    attempt_row public.training_attempts%ROWTYPE;
    resumed BOOLEAN := false;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Training access unavailable.'
            USING ERRCODE = '42501';
    END IF;

    -- Exact shared-code validation intentionally does not imply verified identity.
    IF BTRIM(COALESCE(requested_code, '')) <> 'TRAINING2026' THEN
        RAISE EXCEPTION 'Training access unavailable.'
            USING ERRCODE = 'P0001';
    END IF;

    IF normalized_role IS NULL
       OR normalized_role NOT IN ('scribe', 'facilitator', 'notetaker')
       OR normalized_team IS NULL
       OR normalized_team NOT IN ('blue', 'red', 'green', 'industry')
       OR normalized_curriculum_version IS NULL
       OR normalized_curriculum_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$' THEN
        RAISE EXCEPTION 'Unsupported training profile.'
            USING ERRCODE = '22023';
    END IF;

    SELECT s.*
    INTO training_template
    FROM public.sessions s
    WHERE s.id = '00000000-0000-4000-8000-000000002026'::UUID
      AND s.session_code = 'TRAINING2026'
      AND s.status = 'active'
      AND s.session_classification = 'training_template'
      AND s.is_protected = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Training access unavailable.'
            USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(
        current_user_id::TEXT || ':' || normalized_curriculum_version || ':' || normalized_team || ':' || normalized_role
    ));

    SELECT ta.*
    INTO attempt_row
    FROM public.training_attempts ta
    WHERE ta.auth_user_id = current_user_id
      AND ta.template_session_id = training_template.id
      AND ta.curriculum_version = normalized_curriculum_version
      AND ta.semantic_role = normalized_role
      AND ta.team = normalized_team
      AND ta.status = 'in_progress'
    ORDER BY ta.started_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        resumed := true;
        UPDATE public.training_attempts ta
        SET last_resumed_at = NOW(),
            updated_at = NOW()
        WHERE ta.id = attempt_row.id
          AND ta.auth_user_id = current_user_id
        RETURNING ta.*
        INTO attempt_row;
    ELSE
        INSERT INTO public.training_attempts (
            auth_user_id,
            template_session_id,
            curriculum_version,
            semantic_role,
            team
        )
        VALUES (
            current_user_id,
            training_template.id,
            normalized_curriculum_version,
            normalized_role,
            normalized_team
        )
        RETURNING *
        INTO attempt_row;
    END IF;

    INSERT INTO public.training_progress_events (
        attempt_id,
        auth_user_id,
        curriculum_version,
        semantic_role,
        team,
        event_type
    )
    VALUES (
        attempt_row.id,
        current_user_id,
        attempt_row.curriculum_version,
        attempt_row.semantic_role,
        attempt_row.team,
        CASE WHEN resumed THEN 'attempt_resumed' ELSE 'attempt_started' END
    );

    RETURN jsonb_build_object(
        'attempt_id', attempt_row.id,
        'template_session_id', training_template.id,
        'curriculum_version', attempt_row.curriculum_version,
        'profile_id', attempt_row.team || '.' || attempt_row.semantic_role,
        'semantic_role', attempt_row.semantic_role,
        'team', attempt_row.team,
        'status', attempt_row.status,
        'current_step_id', attempt_row.current_step_id,
        'resumed', resumed,
        'session_classification', training_template.session_classification,
        'is_protected', training_template.is_protected,
        'experience_plugin_id', 'ssg-training'
    );
END;
$$;

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
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Training access unavailable.'
            USING ERRCODE = '42501';
    END IF;

    SELECT ta.*
    INTO attempt_row
    FROM public.training_attempts ta
    WHERE ta.id = requested_attempt_id
      AND ta.auth_user_id = current_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Training access unavailable.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT s.*
    INTO training_template
    FROM public.sessions s
    WHERE s.id = attempt_row.template_session_id
      AND s.session_code = 'TRAINING2026'
      AND s.status = 'active'
      AND s.session_classification = 'training_template'
      AND s.is_protected = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Training access unavailable.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
        'attempt_id', attempt_row.id,
        'template_session_id', training_template.id,
        'curriculum_version', attempt_row.curriculum_version,
        'profile_id', attempt_row.team || '.' || attempt_row.semantic_role,
        'semantic_role', attempt_row.semantic_role,
        'team', attempt_row.team,
        'status', attempt_row.status,
        'current_step_id', attempt_row.current_step_id,
        'resumed', true,
        'session_classification', training_template.session_classification,
        'is_protected', training_template.is_protected,
        'experience_plugin_id', 'ssg-training'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_training_progress_event(
    requested_attempt_id UUID,
    requested_event_type TEXT,
    requested_step_id TEXT DEFAULT NULL,
    requested_result_code TEXT DEFAULT NULL
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
    attempt_row public.training_attempts%ROWTYPE;
    created_event public.training_progress_events%ROWTYPE;
BEGIN
    IF current_user_id IS NULL OR requested_attempt_id IS NULL THEN
        RAISE EXCEPTION 'Training attempt not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF normalized_event_type IS NULL OR normalized_event_type NOT IN (
        'step_started', 'step_completed', 'mastery_passed', 'mastery_failed',
        'attempt_completed', 'attempt_reset', 'media_degraded', 'role_switched'
    ) OR (normalized_step_id IS NOT NULL AND normalized_step_id !~ '^[a-z0-9][a-z0-9._-]{0,95}$')
      OR (normalized_result_code IS NOT NULL AND normalized_result_code NOT IN (
          'passed', 'failed', 'completed', 'skipped', 'degraded'
      )) THEN
        RAISE EXCEPTION 'Unsupported training progress event.'
            USING ERRCODE = '22023';
    END IF;

    SELECT ta.*
    INTO attempt_row
    FROM public.training_attempts ta
    WHERE ta.id = requested_attempt_id
      AND ta.auth_user_id = current_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Training attempt not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF attempt_row.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Training attempt is not writable.'
            USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.training_progress_events (
        attempt_id,
        auth_user_id,
        curriculum_version,
        semantic_role,
        team,
        event_type,
        step_id,
        result_code
    )
    VALUES (
        attempt_row.id,
        current_user_id,
        attempt_row.curriculum_version,
        attempt_row.semantic_role,
        attempt_row.team,
        normalized_event_type,
        normalized_step_id,
        normalized_result_code
    )
    RETURNING *
    INTO created_event;

    UPDATE public.training_attempts ta
    SET current_step_id = COALESCE(normalized_step_id, ta.current_step_id),
        status = CASE
            WHEN normalized_event_type = 'attempt_completed' THEN 'completed'
            WHEN normalized_event_type = 'attempt_reset' THEN 'reset'
            ELSE ta.status
        END,
        completed_at = CASE
            WHEN normalized_event_type = 'attempt_completed' THEN NOW()
            ELSE NULL
        END,
        updated_at = NOW()
    WHERE ta.id = attempt_row.id
      AND ta.auth_user_id = current_user_id;

    RETURN jsonb_build_object(
        'event_id', created_event.id,
        'attempt_id', created_event.attempt_id,
        'event_type', created_event.event_type,
        'step_id', created_event.step_id,
        'result_code', created_event.result_code,
        'created_at', created_event.created_at
    );
END;
$$;

-- Preserve the public live-join RPC while explicitly excluding training.
CREATE OR REPLACE FUNCTION public.lookup_joinable_session_by_code(requested_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized_code TEXT := UPPER(BTRIM(requested_code));
    session_row RECORD;
BEGIN
    IF normalized_code IS NULL OR normalized_code = '' THEN
        RAISE EXCEPTION 'Session code is required.'
            USING ERRCODE = '22023';
    END IF;

    SELECT
        s.id,
        s.name,
        s.status,
        COALESCE(NULLIF(BTRIM(s.session_code), ''), UPPER(BTRIM(s.metadata->>'session_code'))) AS resolved_session_code
    INTO session_row
    FROM public.sessions s
    WHERE COALESCE(NULLIF(UPPER(BTRIM(s.session_code)), ''), UPPER(BTRIM(s.metadata->>'session_code'))) = normalized_code
      AND s.session_classification = 'live_exercise'
      AND s.is_protected = false
    ORDER BY
        CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
        s.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found. Please check the code and try again.'
            USING ERRCODE = 'P0002';
    END IF;

    IF session_row.status <> 'active' THEN
        RAISE EXCEPTION 'This session is not currently joinable.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
        'id', session_row.id,
        'name', session_row.name,
        'session_code', session_row.resolved_session_code,
        'status', session_row.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.start_or_resume_training_attempt(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_training_attempt_bootstrap(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_training_progress_event(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lookup_joinable_session_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_or_resume_training_attempt(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_attempt_bootstrap(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_training_progress_event(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_joinable_session_by_code(TEXT) TO authenticated;

COMMENT ON FUNCTION public.prevent_protected_session_mutation() IS
    'Fail-closed database guard for archive, soft-delete, rename, recode, reclassification, update, and hard-delete of protected sessions.';
COMMENT ON FUNCTION public.prevent_training_template_live_state() IS
    'Prevents protected training templates from acquiring participant seats or game state.';
COMMENT ON FUNCTION public.live_demo_can_read_session(UUID) IS
    'Allows live exercise reads only; protected training templates never enter live RLS surfaces.';
COMMENT ON FUNCTION public.live_demo_can_write_session(UUID) IS
    'Allows writes only to active, unprotected live exercises readable by the caller.';
COMMENT ON FUNCTION public.start_or_resume_training_attempt(TEXT, TEXT, TEXT, TEXT) IS
    'Validates exact TRAINING2026 access and starts or resumes only auth.uid() owned attempt state for one of 12 semantic profiles.';
COMMENT ON FUNCTION public.get_training_attempt_bootstrap(UUID) IS
    'Revalidates an auth.uid() owned attempt and returns protected session-experience metadata for client route activation.';
COMMENT ON FUNCTION public.record_training_progress_event(UUID, TEXT, TEXT, TEXT) IS
    'Appends a bounded content-free event only when both attempt ID and auth.uid() match.';

COMMIT;
