BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- LIVE DEMO FRONTEND COMPATIBILITY PATCHES
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
SET outcome = COALESCE(outcome, adjudication->>'outcome'),
    adjudication_notes = COALESCE(
        adjudication_notes,
        adjudication->>'adjudication_notes',
        adjudication->>'notes'
    )
WHERE adjudication IS NOT NULL;

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

ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS response TEXT,
    ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

UPDATE public.requests
SET responded_at = COALESCE(responded_at, answered_at)
WHERE answered_at IS NOT NULL;

UPDATE public.requests
SET answered_at = COALESCE(answered_at, responded_at)
WHERE responded_at IS NOT NULL;

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

-- ============================================================================
-- LIVE DEMO AUTH BINDING
-- ============================================================================

ALTER TABLE public.participants
    ADD COLUMN IF NOT EXISTS auth_user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_auth_user_id
    ON public.participants(auth_user_id);

COMMENT ON COLUMN public.participants.auth_user_id IS 'Supabase auth user id for the authenticated browser identity. Client-side role strings are not authoritative.';

CREATE TABLE IF NOT EXISTS public.operator_grants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID NOT NULL,
    surface TEXT NOT NULL CHECK (surface IN ('gamemaster', 'whitecell')),
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
    team_id TEXT,
    role TEXT,
    operator_name TEXT,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_grants_auth_surface
    ON public.operator_grants(auth_user_id, surface);

CREATE INDEX IF NOT EXISTS idx_operator_grants_surface_session
    ON public.operator_grants(surface, session_id);

ALTER TABLE public.operator_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on operator_grants" ON public.operator_grants;
DROP POLICY IF EXISTS operator_grants_self_read ON public.operator_grants;

CREATE POLICY operator_grants_self_read
    ON public.operator_grants FOR SELECT
    USING (auth.uid() = auth_user_id);

DROP TRIGGER IF EXISTS update_operator_grants_updated_at ON public.operator_grants;

CREATE TRIGGER update_operator_grants_updated_at
    BEFORE UPDATE ON public.operator_grants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- LIVE DEMO SECURITY HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.live_demo_operator_code_hash()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
    SELECT NULLIF(current_setting('app.settings.live_demo_operator_code_sha256', true), '')
$$;

CREATE OR REPLACE FUNCTION public.live_demo_validate_operator_code(requested_code TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = public, extensions
AS $$
    SELECT
        requested_code IS NOT NULL
        AND public.live_demo_operator_code_hash() IS NOT NULL
        AND encode(digest(BTRIM(requested_code), 'sha256'), 'hex') = public.live_demo_operator_code_hash()
$$;

CREATE OR REPLACE FUNCTION public.live_demo_participant_role(requested_session_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role TEXT;
BEGIN
    IF auth.uid() IS NULL OR requested_session_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT sp.role
    INTO resolved_role
    FROM public.session_participants sp
    INNER JOIN public.participants p
        ON p.id = sp.participant_id
    WHERE sp.session_id = requested_session_id
      AND sp.is_active = true
      AND p.auth_user_id = auth.uid()
    ORDER BY sp.joined_at DESC, sp.id DESC
    LIMIT 1;

    RETURN resolved_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_demo_participant_surface(requested_session_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role TEXT := public.live_demo_participant_role(requested_session_id);
BEGIN
    IF resolved_role = 'viewer' THEN
        RETURN 'viewer';
    END IF;

    IF resolved_role ~ '^(blue|red|green|industry)_facilitator$' THEN
        RETURN 'facilitator';
    END IF;

    IF resolved_role ~ '^(blue|red|green|industry)_scribe$' THEN
        RETURN 'scribe';
    END IF;

    IF resolved_role ~ '^(blue|red|green|industry)_notetaker$' THEN
        RETURN 'notetaker';
    END IF;

    IF resolved_role ~ '^(blue|red|green|industry)_whitecell(_lead|_support)?$' THEN
        RETURN 'whitecell';
    END IF;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_demo_participant_team(requested_session_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_role TEXT := public.live_demo_participant_role(requested_session_id);
BEGIN
    IF resolved_role ~ '^(blue|red|green|industry)_' THEN
        RETURN split_part(resolved_role, '_', 1);
    END IF;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_demo_has_operator_grant(
    requested_surface TEXT,
    requested_session_id UUID DEFAULT NULL,
    requested_team_id TEXT DEFAULT NULL,
    requested_role TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.operator_grants og
        WHERE og.auth_user_id = auth.uid()
          AND og.surface = LOWER(BTRIM(requested_surface))
          AND (requested_session_id IS NULL OR og.session_id = requested_session_id)
          AND (requested_team_id IS NULL OR og.team_id = LOWER(BTRIM(requested_team_id)))
          AND (requested_role IS NULL OR og.role = BTRIM(requested_role))
    )
$$;

CREATE OR REPLACE FUNCTION public.live_demo_can_read_session(requested_session_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        auth.uid() IS NOT NULL
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
        public.live_demo_can_read_session(requested_session_id)
        AND COALESCE(public.live_demo_participant_surface(requested_session_id), '') <> 'viewer'
$$;

CREATE OR REPLACE FUNCTION public.live_demo_can_write_session_surface(
    requested_session_id UUID,
    allowed_surfaces TEXT[]
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        public.live_demo_can_write_session(requested_session_id)
        AND public.live_demo_participant_surface(requested_session_id) = ANY(COALESCE(allowed_surfaces, ARRAY[]::TEXT[]))
$$;

CREATE OR REPLACE FUNCTION public.live_demo_can_write_team_session(
    requested_session_id UUID,
    requested_team TEXT,
    allowed_surfaces TEXT[]
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        public.live_demo_can_write_session_surface(requested_session_id, allowed_surfaces)
        AND public.live_demo_participant_team(requested_session_id) = LOWER(BTRIM(requested_team))
$$;

-- ============================================================================
-- OPERATOR RPCS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.authorize_demo_operator(
    requested_surface TEXT,
    requested_operator_code TEXT,
    requested_session_id UUID DEFAULT NULL,
    requested_team_id TEXT DEFAULT NULL,
    requested_role TEXT DEFAULT NULL,
    requested_operator_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    normalized_surface TEXT := LOWER(BTRIM(requested_surface));
    normalized_team TEXT := LOWER(NULLIF(BTRIM(requested_team_id), ''));
    normalized_role TEXT := CASE
        WHEN requested_role ~ '^(blue|red|green|industry)_whitecell$'
            THEN regexp_replace(BTRIM(requested_role), '_whitecell$', '_whitecell_lead')
        ELSE NULLIF(BTRIM(requested_role), '')
    END;
    normalized_name TEXT := NULLIF(BTRIM(requested_operator_name), '');
    grant_row public.operator_grants%ROWTYPE;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Browser identity is required before operator authorization.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.live_demo_validate_operator_code(requested_operator_code) THEN
        RAISE EXCEPTION 'Invalid operator access code.'
            USING ERRCODE = '42501';
    END IF;

    IF normalized_surface NOT IN ('gamemaster', 'whitecell') THEN
        RAISE EXCEPTION 'Unsupported operator surface.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_surface = 'gamemaster' THEN
        normalized_team := NULL;
        normalized_role := 'white';
        requested_session_id := NULL;
    ELSE
        IF requested_session_id IS NULL THEN
            RAISE EXCEPTION 'White Cell authorization requires a session.'
                USING ERRCODE = '22023';
        END IF;

        IF normalized_team NOT IN ('blue', 'red', 'green', 'industry') THEN
            RAISE EXCEPTION 'White Cell authorization requires a supported team.'
                USING ERRCODE = '22023';
        END IF;

        IF normalized_role NOT IN (
            normalized_team || '_whitecell_lead',
            normalized_team || '_whitecell_support'
        ) THEN
            RAISE EXCEPTION 'White Cell authorization requires a supported operator role.'
                USING ERRCODE = '22023';
        END IF;

        PERFORM 1
        FROM public.sessions s
        WHERE s.id = requested_session_id
          AND s.status = 'active';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'This session is not currently joinable.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    DELETE FROM public.operator_grants og
    WHERE og.auth_user_id = current_user_id
      AND og.surface = normalized_surface;

    INSERT INTO public.operator_grants (
        auth_user_id,
        surface,
        session_id,
        team_id,
        role,
        operator_name,
        granted_at,
        updated_at
    )
    VALUES (
        current_user_id,
        normalized_surface,
        requested_session_id,
        normalized_team,
        normalized_role,
        normalized_name,
        NOW(),
        NOW()
    )
    RETURNING *
    INTO grant_row;

    RETURN jsonb_build_object(
        'id', grant_row.id,
        'surface', grant_row.surface,
        'session_id', grant_row.session_id,
        'team_id', grant_row.team_id,
        'role', grant_row.role,
        'operator_name', grant_row.operator_name,
        'granted_at', grant_row.granted_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_live_demo_session(
    requested_name TEXT,
    requested_session_code TEXT,
    requested_description TEXT DEFAULT NULL
)
RETURNS public.sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized_name TEXT := NULLIF(BTRIM(requested_name), '');
    normalized_code TEXT := UPPER(NULLIF(BTRIM(requested_session_code), ''));
    normalized_description TEXT := NULLIF(BTRIM(requested_description), '');
    created_session public.sessions%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR NOT public.live_demo_has_operator_grant('gamemaster') THEN
        RAISE EXCEPTION 'Game Master authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    IF normalized_name IS NULL THEN
        RAISE EXCEPTION 'Session name is required.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_code IS NULL THEN
        RAISE EXCEPTION 'Session code is required.'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.sessions (
        name,
        status,
        session_code,
        metadata
    )
    VALUES (
        normalized_name,
        'active',
        normalized_code,
        jsonb_build_object(
            'session_code', normalized_code,
            'description', normalized_description
        )
    )
    RETURNING *
    INTO created_session;

    INSERT INTO public.game_state (
        session_id,
        move,
        phase,
        timer_seconds,
        timer_running,
        timer_last_update
    )
    VALUES (
        created_session.id,
        1,
        1,
        5400,
        false,
        NULL
    )
    ON CONFLICT (session_id) DO NOTHING;

    RETURN created_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_live_demo_session(requested_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.live_demo_has_operator_grant('gamemaster') THEN
        RAISE EXCEPTION 'Game Master authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    IF requested_session_id IS NULL THEN
        RAISE EXCEPTION 'Session ID is required.'
            USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.sessions
    WHERE id = requested_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found. Please refresh and try again.'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
        'deleted_session_id', requested_session_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.operator_update_game_state(
    requested_session_id UUID,
    requested_move INTEGER DEFAULT NULL,
    requested_phase INTEGER DEFAULT NULL,
    requested_timer_seconds INTEGER DEFAULT NULL,
    requested_timer_running BOOLEAN DEFAULT NULL,
    requested_timer_last_update TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.game_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    participant_role TEXT := public.live_demo_participant_role(requested_session_id);
    participant_team TEXT := public.live_demo_participant_team(requested_session_id);
    existing_state public.game_state%ROWTYPE;
    updated_state public.game_state%ROWTYPE;
BEGIN
    IF requested_session_id IS NULL THEN
        RAISE EXCEPTION 'Session ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF auth.uid() IS NULL
       OR participant_role IS NULL
       OR public.live_demo_participant_surface(requested_session_id) <> 'whitecell'
       OR NOT public.live_demo_has_operator_grant('whitecell', requested_session_id, participant_team, participant_role) THEN
        RAISE EXCEPTION 'White Cell operator authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
    INTO existing_state
    FROM public.game_state gs
    WHERE gs.session_id = requested_session_id
    FOR UPDATE;

    IF existing_state.id IS NULL THEN
        RAISE EXCEPTION 'Game state not found for this session.'
            USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.game_state gs
    SET
        move = COALESCE(requested_move, gs.move),
        phase = COALESCE(requested_phase, gs.phase),
        timer_seconds = COALESCE(requested_timer_seconds, gs.timer_seconds),
        timer_running = COALESCE(requested_timer_running, gs.timer_running),
        timer_last_update = COALESCE(requested_timer_last_update, gs.timer_last_update),
        last_updated = NOW()
    WHERE gs.session_id = requested_session_id
    RETURNING *
    INTO updated_state;

    IF existing_state.move IS DISTINCT FROM updated_state.move THEN
        INSERT INTO public.game_state_transitions (
            session_id,
            transition_type,
            from_value,
            to_value,
            initiated_by_client_id,
            initiated_by_role,
            transition_reason,
            metadata
        )
        VALUES (
            requested_session_id,
            'move',
            existing_state.move,
            updated_state.move,
            auth.uid()::TEXT,
            participant_role,
            'operator_rpc',
            jsonb_build_object('surface', 'whitecell')
        );
    END IF;

    IF existing_state.phase IS DISTINCT FROM updated_state.phase THEN
        INSERT INTO public.game_state_transitions (
            session_id,
            transition_type,
            from_value,
            to_value,
            initiated_by_client_id,
            initiated_by_role,
            transition_reason,
            metadata
        )
        VALUES (
            requested_session_id,
            'phase',
            existing_state.phase,
            updated_state.phase,
            auth.uid()::TEXT,
            participant_role,
            'operator_rpc',
            jsonb_build_object('surface', 'whitecell')
        );
    END IF;

    RETURN updated_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.operator_adjudicate_action(
    requested_action_id UUID,
    requested_outcome TEXT,
    requested_adjudication_notes TEXT DEFAULT NULL,
    requested_adjudicated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    action_row public.actions%ROWTYPE;
    updated_action public.actions%ROWTYPE;
    participant_role TEXT;
    participant_team TEXT;
BEGIN
    IF requested_action_id IS NULL THEN
        RAISE EXCEPTION 'Action ID is required.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO action_row
    FROM public.actions a
    WHERE a.id = requested_action_id
      AND COALESCE(a.is_deleted, false) = false
    FOR UPDATE;

    IF action_row.id IS NULL THEN
        RAISE EXCEPTION 'Action not found.'
            USING ERRCODE = 'P0002';
    END IF;

    participant_role := public.live_demo_participant_role(action_row.session_id);
    participant_team := public.live_demo_participant_team(action_row.session_id);

    IF auth.uid() IS NULL
       OR participant_role IS NULL
       OR public.live_demo_participant_surface(action_row.session_id) <> 'whitecell'
       OR NOT public.live_demo_has_operator_grant('whitecell', action_row.session_id, participant_team, participant_role) THEN
        RAISE EXCEPTION 'White Cell operator authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    IF action_row.status <> 'submitted' THEN
        RAISE EXCEPTION 'Only submitted actions can be adjudicated.'
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.actions a
    SET
        status = 'adjudicated',
        outcome = requested_outcome,
        adjudication_notes = NULLIF(BTRIM(requested_adjudication_notes), ''),
        adjudicated_at = COALESCE(requested_adjudicated_at, NOW()),
        updated_at = NOW(),
        adjudication = COALESCE(a.adjudication, '{}'::jsonb) || jsonb_build_object(
            'outcome', requested_outcome,
            'adjudication_notes', NULLIF(BTRIM(requested_adjudication_notes), ''),
            'adjudicated_by_role', participant_role,
            'adjudicated_by_auth_user_id', auth.uid(),
            'adjudicated_at', COALESCE(requested_adjudicated_at, NOW())
        )
    WHERE a.id = requested_action_id
    RETURNING *
    INTO updated_action;

    INSERT INTO public.action_logs (
        action_id,
        session_id,
        client_id,
        changed_by_role,
        previous_state,
        new_state,
        status_from,
        status_to
    )
    VALUES (
        updated_action.id,
        updated_action.session_id,
        auth.uid()::TEXT,
        participant_role,
        to_jsonb(action_row),
        to_jsonb(updated_action),
        action_row.status,
        updated_action.status
    );

    RETURN updated_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.operator_answer_request(
    requested_request_id UUID,
    requested_response TEXT,
    requested_responded_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_row public.requests%ROWTYPE;
    updated_request public.requests%ROWTYPE;
    participant_role TEXT;
    participant_team TEXT;
    response_timestamp TIMESTAMPTZ := COALESCE(requested_responded_at, NOW());
BEGIN
    IF requested_request_id IS NULL THEN
        RAISE EXCEPTION 'Request ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(requested_response), '') IS NULL THEN
        RAISE EXCEPTION 'A response is required.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO request_row
    FROM public.requests r
    WHERE r.id = requested_request_id
    FOR UPDATE;

    IF request_row.id IS NULL THEN
        RAISE EXCEPTION 'Request not found.'
            USING ERRCODE = 'P0002';
    END IF;

    participant_role := public.live_demo_participant_role(request_row.session_id);
    participant_team := public.live_demo_participant_team(request_row.session_id);

    IF auth.uid() IS NULL
       OR participant_role IS NULL
       OR public.live_demo_participant_surface(request_row.session_id) <> 'whitecell'
       OR NOT public.live_demo_has_operator_grant('whitecell', request_row.session_id, participant_team, participant_role) THEN
        RAISE EXCEPTION 'White Cell operator authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.requests r
    SET
        response = NULLIF(BTRIM(requested_response), ''),
        status = CASE WHEN r.status = 'withdrawn' THEN r.status ELSE 'answered' END,
        responded_at = response_timestamp,
        answered_at = response_timestamp,
        response_time_seconds = GREATEST(
            EXTRACT(EPOCH FROM (response_timestamp - r.created_at))::INTEGER,
            0
        )
    WHERE r.id = requested_request_id
    RETURNING *
    INTO updated_request;

    INSERT INTO public.communications (
        session_id,
        move,
        from_role,
        to_role,
        type,
        title,
        content,
        client_id,
        linked_request_id,
        metadata
    )
    VALUES (
        updated_request.session_id,
        updated_request.move,
        'white_cell',
        updated_request.team,
        'rfi_response',
        'RFI Response',
        updated_request.response,
        auth.uid()::TEXT,
        updated_request.id,
        jsonb_build_object(
            'answered_by_role', participant_role,
            'answered_by_auth_user_id', auth.uid()
        )
    );

    RETURN updated_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.operator_send_communication(
    requested_session_id UUID,
    requested_to_role TEXT,
    requested_type TEXT,
    requested_content TEXT,
    requested_title TEXT DEFAULT NULL,
    requested_linked_request_id UUID DEFAULT NULL
)
RETURNS public.communications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    participant_role TEXT := public.live_demo_participant_role(requested_session_id);
    participant_team TEXT := public.live_demo_participant_team(requested_session_id);
    normalized_to_role TEXT := NULLIF(BTRIM(requested_to_role), '');
    normalized_type TEXT := NULLIF(BTRIM(requested_type), '');
    normalized_content TEXT := NULLIF(BTRIM(requested_content), '');
    normalized_title TEXT := NULLIF(BTRIM(requested_title), '');
    current_move INTEGER := 1;
    created_communication public.communications%ROWTYPE;
BEGIN
    IF requested_session_id IS NULL THEN
        RAISE EXCEPTION 'Session ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_to_role IS NULL OR normalized_type IS NULL OR normalized_content IS NULL THEN
        RAISE EXCEPTION 'Communication recipient, type, and content are required.'
            USING ERRCODE = '22023';
    END IF;

    IF auth.uid() IS NULL
       OR participant_role IS NULL
       OR public.live_demo_participant_surface(requested_session_id) <> 'whitecell'
       OR NOT public.live_demo_has_operator_grant('whitecell', requested_session_id, participant_team, participant_role) THEN
        RAISE EXCEPTION 'White Cell operator authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    IF normalized_to_role NOT IN (
        'all',
        'blue',
        'red',
        'green',
        'industry',
        'blue_facilitator',
        'blue_scribe',
        'red_facilitator',
        'red_scribe',
        'green_facilitator',
        'green_scribe',
        'industry_facilitator',
        'industry_scribe',
        'blue_notetaker',
        'red_notetaker',
        'green_notetaker',
        'industry_notetaker'
    ) THEN
        RAISE EXCEPTION 'White Cell communications are limited to supported live-demo recipients.'
            USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(gs.move, 1)
    INTO current_move
    FROM public.game_state gs
    WHERE gs.session_id = requested_session_id;

    INSERT INTO public.communications (
        session_id,
        move,
        from_role,
        to_role,
        type,
        title,
        content,
        client_id,
        linked_request_id,
        metadata
    )
    VALUES (
        requested_session_id,
        COALESCE(current_move, 1),
        'white_cell',
        normalized_to_role,
        normalized_type,
        normalized_title,
        normalized_content,
        auth.uid()::TEXT,
        requested_linked_request_id,
        jsonb_build_object(
            'operator_role', participant_role,
            'operator_auth_user_id', auth.uid()
        )
    )
    RETURNING *
    INTO created_communication;

    RETURN created_communication;
END;
$$;

-- ============================================================================
-- ROLE CLAIM RPC HARDENING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_session_role_seat_limit(requested_role TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN requested_role ~ '^(blue|red|green|industry)_facilitator$' THEN 1
        WHEN requested_role ~ '^(blue|red|green|industry)_scribe$' THEN 1
        WHEN requested_role ~ '^(blue|red|green|industry)_notetaker$' THEN 2
        WHEN requested_role ~ '^(blue|red|green|industry)_whitecell(_lead)?$' THEN 1
        WHEN requested_role ~ '^(blue|red|green|industry)_whitecell_support$' THEN 1
        ELSE NULL
    END
$$;

CREATE OR REPLACE FUNCTION public.release_stale_session_role_seats_internal(
    requested_session_id UUID,
    requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized_timeout_seconds INTEGER := GREATEST(COALESCE(requested_timeout_seconds, 90), 1);
    released_count INTEGER := 0;
BEGIN
    IF requested_session_id IS NULL THEN
        RAISE EXCEPTION 'Session ID is required.'
            USING ERRCODE = '22023';
    END IF;

    WITH released_rows AS (
        UPDATE public.session_participants sp
        SET
            is_active = false,
            disconnected_at = COALESCE(sp.disconnected_at, NOW()),
            left_at = COALESCE(sp.left_at, NOW()),
            last_seen = COALESCE(sp.last_seen, sp.heartbeat_at, sp.joined_at, NOW())
        WHERE sp.session_id = requested_session_id
          AND sp.is_active = true
          AND COALESCE(sp.heartbeat_at, sp.last_seen, sp.joined_at, NOW())
                < (NOW() - make_interval(secs => normalized_timeout_seconds))
        RETURNING 1
    )
    SELECT COUNT(*)
    INTO released_count
    FROM released_rows;

    RETURN COALESCE(released_count, 0);
END;
$$;

INSERT INTO public.game_state (
    session_id,
    move,
    phase,
    timer_seconds,
    timer_running,
    timer_last_update
)
SELECT
    s.id,
    1,
    1,
    5400,
    false,
    NULL
FROM public.sessions s
LEFT JOIN public.game_state gs
    ON gs.session_id = s.id
WHERE gs.session_id IS NULL
ON CONFLICT (session_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.release_stale_session_role_seats(
    requested_session_id UUID,
    requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF requested_session_id IS NULL THEN
        RAISE EXCEPTION 'Session ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF auth.uid() IS NOT NULL
       AND NOT public.live_demo_can_read_session(requested_session_id)
       AND NOT public.live_demo_has_operator_grant('whitecell', requested_session_id) THEN
        RAISE EXCEPTION 'Session access is required.'
            USING ERRCODE = '42501';
    END IF;

    RETURN public.release_stale_session_role_seats_internal(
        requested_session_id,
        requested_timeout_seconds
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_active_session_participants(
    requested_session_id UUID,
    requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS TABLE (
    id UUID,
    session_id UUID,
    participant_id UUID,
    role TEXT,
    is_active BOOLEAN,
    heartbeat_at TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    joined_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    display_name TEXT,
    client_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.live_demo_can_read_session(requested_session_id) THEN
        RAISE EXCEPTION 'Session access is required.'
            USING ERRCODE = '42501';
    END IF;

    PERFORM public.release_stale_session_role_seats(requested_session_id, requested_timeout_seconds);

    RETURN QUERY
    SELECT
        sp.id,
        sp.session_id,
        sp.participant_id,
        sp.role,
        sp.is_active,
        sp.heartbeat_at,
        sp.last_seen,
        sp.joined_at,
        sp.disconnected_at,
        COALESCE(p.name, 'Unknown') AS display_name,
        p.client_id
    FROM public.session_participants sp
    INNER JOIN public.participants p
        ON p.id = sp.participant_id
    WHERE sp.session_id = requested_session_id
      AND sp.is_active = true
    ORDER BY sp.joined_at ASC, sp.id ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_session_role_seat(
    requested_session_id UUID,
    requested_role TEXT,
    requested_name TEXT DEFAULT NULL,
    requested_client_id TEXT DEFAULT NULL,
    requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    normalized_role TEXT := CASE
        WHEN requested_role ~ '^(blue|red|green|industry)_whitecell$'
            THEN regexp_replace(BTRIM(requested_role), '_whitecell$', '_whitecell_lead')
        ELSE BTRIM(requested_role)
    END;
    normalized_name TEXT := NULLIF(BTRIM(requested_name), '');
    normalized_client_id TEXT := NULLIF(BTRIM(requested_client_id), '');
    normalized_timeout_seconds INTEGER := GREATEST(COALESCE(requested_timeout_seconds, 90), 1);
    normalized_team TEXT := CASE
        WHEN normalized_role ~ '^(blue|red|green|industry)_' THEN split_part(normalized_role, '_', 1)
        ELSE NULL
    END;
    role_limit INTEGER := public.get_session_role_seat_limit(normalized_role);
    active_claim_count INTEGER := 0;
    participant_row public.participants%ROWTYPE;
    seat_row public.session_participants%ROWTYPE;
    claim_status TEXT := 'claimed';
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Browser identity is required.'
            USING ERRCODE = '42501';
    END IF;

    IF requested_session_id IS NULL THEN
        RAISE EXCEPTION 'Session ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_role IS NULL OR normalized_role = '' THEN
        RAISE EXCEPTION 'Role is required.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_client_id IS NULL OR normalized_client_id = '' THEN
        RAISE EXCEPTION 'Client identity is required.'
            USING ERRCODE = '22023';
    END IF;

    IF role_limit IS NULL THEN
        RAISE EXCEPTION 'This role cannot be claimed in the live demo.'
            USING ERRCODE = '22023';
    END IF;

    IF public.live_demo_participant_surface(requested_session_id) = 'viewer'
       AND normalized_role <> 'viewer' THEN
        RAISE EXCEPTION 'Observers cannot escalate roles within a joined session.'
            USING ERRCODE = '42501';
    END IF;

    IF normalized_role ~ '^(blue|red|green|industry)_whitecell(_lead|_support)?$'
       AND NOT public.live_demo_has_operator_grant('whitecell', requested_session_id, normalized_team, normalized_role) THEN
        RAISE EXCEPTION 'White Cell seats require operator authorization.'
            USING ERRCODE = '42501';
    END IF;

    PERFORM 1
    FROM public.sessions s
    WHERE s.id = requested_session_id
      AND s.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'This session is not currently joinable.'
            USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(requested_session_id::TEXT || ':' || normalized_role));
    PERFORM public.release_stale_session_role_seats_internal(
        requested_session_id,
        normalized_timeout_seconds
    );

    INSERT INTO public.participants (
        auth_user_id,
        client_id,
        name,
        role,
        updated_at
    )
    VALUES (
        current_user_id,
        normalized_client_id,
        normalized_name,
        normalized_role,
        NOW()
    )
    ON CONFLICT (auth_user_id) DO UPDATE
    SET
        client_id = EXCLUDED.client_id,
        name = COALESCE(EXCLUDED.name, public.participants.name),
        role = EXCLUDED.role,
        updated_at = NOW()
    RETURNING *
    INTO participant_row;

    SELECT *
    INTO seat_row
    FROM public.session_participants sp
    WHERE sp.session_id = requested_session_id
      AND sp.participant_id = participant_row.id
    FOR UPDATE;

    SELECT COUNT(*)
    INTO active_claim_count
    FROM public.session_participants sp
    WHERE sp.session_id = requested_session_id
      AND sp.role = normalized_role
      AND sp.is_active = true
      AND (seat_row.id IS NULL OR sp.id <> seat_row.id);

    IF active_claim_count >= role_limit THEN
        RAISE EXCEPTION 'The requested role is full. Please choose another seat.'
            USING ERRCODE = 'P0001';
    END IF;

    IF seat_row.id IS NULL THEN
        INSERT INTO public.session_participants (
            session_id,
            participant_id,
            role,
            is_active,
            heartbeat_at,
            joined_at,
            last_seen,
            disconnected_at,
            left_at
        )
        VALUES (
            requested_session_id,
            participant_row.id,
            normalized_role,
            true,
            NOW(),
            NOW(),
            NOW(),
            NULL,
            NULL
        )
        RETURNING *
        INTO seat_row;
    ELSE
        claim_status := CASE
            WHEN seat_row.is_active AND seat_row.role = normalized_role THEN 'refreshed'
            WHEN seat_row.role = normalized_role THEN 'rejoined'
            ELSE 'reassigned'
        END;

        UPDATE public.session_participants sp
        SET
            role = normalized_role,
            is_active = true,
            heartbeat_at = NOW(),
            last_seen = NOW(),
            disconnected_at = NULL,
            left_at = NULL
        WHERE sp.id = seat_row.id
        RETURNING *
        INTO seat_row;
    END IF;

    RETURN jsonb_build_object(
        'id', seat_row.id,
        'session_id', seat_row.session_id,
        'participant_id', seat_row.participant_id,
        'role', seat_row.role,
        'is_active', seat_row.is_active,
        'heartbeat_at', seat_row.heartbeat_at,
        'last_seen', seat_row.last_seen,
        'joined_at', seat_row.joined_at,
        'disconnected_at', seat_row.disconnected_at,
        'display_name', COALESCE(participant_row.name, 'Unknown'),
        'client_id', participant_row.client_id,
        'seat_limit', role_limit,
        'active_count', active_claim_count + 1,
        'claim_status', claim_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_session_role_seat(
    requested_session_id UUID,
    requested_session_participant_id UUID,
    requested_client_id TEXT DEFAULT NULL,
    requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized_timeout_seconds INTEGER := GREATEST(COALESCE(requested_timeout_seconds, 90), 1);
    role_limit INTEGER;
    active_claim_count INTEGER := 0;
    seat_row public.session_participants%ROWTYPE;
    participant_row public.participants%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Browser identity is required.'
            USING ERRCODE = '42501';
    END IF;

    IF requested_session_id IS NULL OR requested_session_participant_id IS NULL THEN
        RAISE EXCEPTION 'A claimed seat is required to send heartbeats.'
            USING ERRCODE = '22023';
    END IF;

    PERFORM public.release_stale_session_role_seats_internal(
        requested_session_id,
        normalized_timeout_seconds
    );

    SELECT sp.*
    INTO seat_row
    FROM public.session_participants sp
    INNER JOIN public.participants p
        ON p.id = sp.participant_id
    WHERE sp.id = requested_session_participant_id
      AND sp.session_id = requested_session_id
      AND p.auth_user_id = auth.uid()
    FOR UPDATE;

    IF seat_row.id IS NULL THEN
        RAISE EXCEPTION 'Participant seat not found. Please rejoin the session.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT p.*
    INTO participant_row
    FROM public.participants p
    WHERE p.id = seat_row.participant_id;

    role_limit := public.get_session_role_seat_limit(seat_row.role);

    IF seat_row.is_active IS DISTINCT FROM true THEN
        SELECT COUNT(*)
        INTO active_claim_count
        FROM public.session_participants sp
        WHERE sp.session_id = requested_session_id
          AND sp.role = seat_row.role
          AND sp.is_active = true
          AND sp.id <> seat_row.id;

        IF active_claim_count >= COALESCE(role_limit, 1) THEN
            RAISE EXCEPTION 'This seat is no longer available. Please rejoin the session.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    UPDATE public.session_participants sp
    SET
        is_active = true,
        heartbeat_at = NOW(),
        last_seen = NOW(),
        disconnected_at = NULL,
        left_at = NULL
    WHERE sp.id = seat_row.id
    RETURNING *
    INTO seat_row;

    RETURN jsonb_build_object(
        'id', seat_row.id,
        'session_id', seat_row.session_id,
        'participant_id', seat_row.participant_id,
        'role', seat_row.role,
        'is_active', seat_row.is_active,
        'heartbeat_at', seat_row.heartbeat_at,
        'last_seen', seat_row.last_seen,
        'joined_at', seat_row.joined_at,
        'disconnected_at', seat_row.disconnected_at,
        'display_name', COALESCE(participant_row.name, 'Unknown'),
        'client_id', participant_row.client_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_session_role_seat(
    requested_session_id UUID,
    requested_session_participant_id UUID,
    requested_client_id TEXT DEFAULT NULL,
    requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    seat_row public.session_participants%ROWTYPE;
    participant_row public.participants%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Browser identity is required.'
            USING ERRCODE = '42501';
    END IF;

    IF requested_session_id IS NULL OR requested_session_participant_id IS NULL THEN
        RETURN NULL;
    END IF;

    PERFORM public.release_stale_session_role_seats_internal(
        requested_session_id,
        requested_timeout_seconds
    );

    SELECT sp.*
    INTO seat_row
    FROM public.session_participants sp
    INNER JOIN public.participants p
        ON p.id = sp.participant_id
    WHERE sp.id = requested_session_participant_id
      AND sp.session_id = requested_session_id
      AND p.auth_user_id = auth.uid()
    FOR UPDATE;

    IF seat_row.id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT p.*
    INTO participant_row
    FROM public.participants p
    WHERE p.id = seat_row.participant_id;

    UPDATE public.session_participants sp
    SET
        is_active = false,
        disconnected_at = NOW(),
        left_at = COALESCE(sp.left_at, NOW()),
        last_seen = COALESCE(sp.last_seen, NOW())
    WHERE sp.id = seat_row.id
    RETURNING *
    INTO seat_row;

    RETURN jsonb_build_object(
        'id', seat_row.id,
        'session_id', seat_row.session_id,
        'participant_id', seat_row.participant_id,
        'role', seat_row.role,
        'is_active', seat_row.is_active,
        'heartbeat_at', seat_row.heartbeat_at,
        'last_seen', seat_row.last_seen,
        'joined_at', seat_row.joined_at,
        'disconnected_at', seat_row.disconnected_at,
        'display_name', COALESCE(participant_row.name, 'Unknown'),
        'client_id', participant_row.client_id
    );
END;
$$;

-- ============================================================================
-- RESTRICTIVE RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Allow all operations on sessions" ON public.sessions;
DROP POLICY IF EXISTS "Allow all operations on participants" ON public.participants;
DROP POLICY IF EXISTS "Allow all operations on session_participants" ON public.session_participants;
DROP POLICY IF EXISTS "Allow all operations on game_state" ON public.game_state;
DROP POLICY IF EXISTS "Allow all operations on actions" ON public.actions;
DROP POLICY IF EXISTS "Allow all operations on action_logs" ON public.action_logs;
DROP POLICY IF EXISTS "Allow all operations on requests" ON public.requests;
DROP POLICY IF EXISTS "Allow all operations on communications" ON public.communications;
DROP POLICY IF EXISTS "Allow all operations on timeline" ON public.timeline;
DROP POLICY IF EXISTS "Allow all operations on notetaker_data" ON public.notetaker_data;
DROP POLICY IF EXISTS "Allow all operations on reports" ON public.reports;
DROP POLICY IF EXISTS "Allow all operations on move_completions" ON public.move_completions;
DROP POLICY IF EXISTS "Allow all operations on game_state_transitions" ON public.game_state_transitions;
DROP POLICY IF EXISTS "Allow all operations on participant_activity" ON public.participant_activity;
DROP POLICY IF EXISTS "Allow all operations on data_completeness_checks" ON public.data_completeness_checks;
DROP POLICY IF EXISTS "Allow all operations on action_relationships" ON public.action_relationships;
DROP POLICY IF EXISTS "Allow all operations on rfi_action_links" ON public.rfi_action_links;

DROP POLICY IF EXISTS sessions_live_demo_read ON public.sessions;
DROP POLICY IF EXISTS participants_live_demo_read ON public.participants;
DROP POLICY IF EXISTS session_participants_live_demo_read ON public.session_participants;
DROP POLICY IF EXISTS game_state_live_demo_read ON public.game_state;
DROP POLICY IF EXISTS actions_live_demo_read ON public.actions;
DROP POLICY IF EXISTS actions_live_demo_insert ON public.actions;
DROP POLICY IF EXISTS actions_live_demo_update ON public.actions;
DROP POLICY IF EXISTS action_logs_live_demo_read ON public.action_logs;
DROP POLICY IF EXISTS requests_live_demo_read ON public.requests;
DROP POLICY IF EXISTS requests_live_demo_insert ON public.requests;
DROP POLICY IF EXISTS requests_live_demo_update ON public.requests;
DROP POLICY IF EXISTS communications_live_demo_read ON public.communications;
DROP POLICY IF EXISTS timeline_live_demo_read ON public.timeline;
DROP POLICY IF EXISTS timeline_live_demo_insert ON public.timeline;
DROP POLICY IF EXISTS notetaker_data_live_demo_read ON public.notetaker_data;
DROP POLICY IF EXISTS notetaker_data_live_demo_insert ON public.notetaker_data;
DROP POLICY IF EXISTS notetaker_data_live_demo_update ON public.notetaker_data;
DROP POLICY IF EXISTS reports_live_demo_read ON public.reports;
DROP POLICY IF EXISTS reports_live_demo_insert ON public.reports;
DROP POLICY IF EXISTS move_completions_live_demo_read ON public.move_completions;
DROP POLICY IF EXISTS move_completions_live_demo_insert ON public.move_completions;
DROP POLICY IF EXISTS game_state_transitions_live_demo_read ON public.game_state_transitions;
DROP POLICY IF EXISTS participant_activity_live_demo_read ON public.participant_activity;
DROP POLICY IF EXISTS participant_activity_live_demo_insert ON public.participant_activity;
DROP POLICY IF EXISTS data_completeness_checks_live_demo_read ON public.data_completeness_checks;
DROP POLICY IF EXISTS data_completeness_checks_live_demo_insert ON public.data_completeness_checks;
DROP POLICY IF EXISTS action_relationships_live_demo_read ON public.action_relationships;
DROP POLICY IF EXISTS action_relationships_live_demo_insert ON public.action_relationships;
DROP POLICY IF EXISTS rfi_action_links_live_demo_read ON public.rfi_action_links;
DROP POLICY IF EXISTS rfi_action_links_live_demo_insert ON public.rfi_action_links;

CREATE POLICY sessions_live_demo_read
    ON public.sessions FOR SELECT
    USING (public.live_demo_can_read_session(id));

CREATE POLICY participants_live_demo_read
    ON public.participants FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            auth_user_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.session_participants sp
                WHERE sp.participant_id = participants.id
                  AND public.live_demo_can_read_session(sp.session_id)
            )
        )
    );

CREATE POLICY session_participants_live_demo_read
    ON public.session_participants FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY game_state_live_demo_read
    ON public.game_state FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY actions_live_demo_read
    ON public.actions FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY actions_live_demo_insert
    ON public.actions FOR INSERT
    WITH CHECK (
        public.live_demo_can_write_team_session(session_id, team, ARRAY['facilitator']::TEXT[])
    );

CREATE POLICY actions_live_demo_update
    ON public.actions FOR UPDATE
    USING (
        public.live_demo_can_write_team_session(session_id, team, ARRAY['facilitator']::TEXT[])
    )
    WITH CHECK (
        public.live_demo_can_write_team_session(session_id, team, ARRAY['facilitator']::TEXT[])
        AND status <> 'adjudicated'
    );

CREATE POLICY action_logs_live_demo_read
    ON public.action_logs FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY requests_live_demo_read
    ON public.requests FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY requests_live_demo_insert
    ON public.requests FOR INSERT
    WITH CHECK (
        public.live_demo_can_write_team_session(session_id, team, ARRAY['facilitator']::TEXT[])
    );

CREATE POLICY requests_live_demo_update
    ON public.requests FOR UPDATE
    USING (
        public.live_demo_can_write_team_session(session_id, team, ARRAY['facilitator']::TEXT[])
    )
    WITH CHECK (
        public.live_demo_can_write_team_session(session_id, team, ARRAY['facilitator']::TEXT[])
        AND status <> 'answered'
    );

CREATE POLICY communications_live_demo_read
    ON public.communications FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY timeline_live_demo_read
    ON public.timeline FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY timeline_live_demo_insert
    ON public.timeline FOR INSERT
    WITH CHECK (public.live_demo_can_write_session(session_id));

CREATE POLICY notetaker_data_live_demo_read
    ON public.notetaker_data FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY notetaker_data_live_demo_insert
    ON public.notetaker_data FOR INSERT
    WITH CHECK (
        public.live_demo_can_write_team_session(session_id, team, ARRAY['notetaker']::TEXT[])
    );

CREATE POLICY notetaker_data_live_demo_update
    ON public.notetaker_data FOR UPDATE
    USING (
        public.live_demo_can_write_team_session(session_id, team, ARRAY['notetaker']::TEXT[])
    )
    WITH CHECK (
        public.live_demo_can_write_team_session(session_id, team, ARRAY['notetaker']::TEXT[])
    );

CREATE POLICY reports_live_demo_read
    ON public.reports FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY reports_live_demo_insert
    ON public.reports FOR INSERT
    WITH CHECK (
        public.live_demo_can_write_session_surface(session_id, ARRAY['notetaker']::TEXT[])
    );

CREATE POLICY move_completions_live_demo_read
    ON public.move_completions FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY move_completions_live_demo_insert
    ON public.move_completions FOR INSERT
    WITH CHECK (
        public.live_demo_can_write_team_session(session_id, team, ARRAY['notetaker']::TEXT[])
    );

CREATE POLICY game_state_transitions_live_demo_read
    ON public.game_state_transitions FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY participant_activity_live_demo_read
    ON public.participant_activity FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY participant_activity_live_demo_insert
    ON public.participant_activity FOR INSERT
    WITH CHECK (public.live_demo_can_write_session(session_id));

CREATE POLICY data_completeness_checks_live_demo_read
    ON public.data_completeness_checks FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY data_completeness_checks_live_demo_insert
    ON public.data_completeness_checks FOR INSERT
    WITH CHECK (public.live_demo_can_write_session(session_id));

CREATE POLICY action_relationships_live_demo_read
    ON public.action_relationships FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY action_relationships_live_demo_insert
    ON public.action_relationships FOR INSERT
    WITH CHECK (public.live_demo_can_write_session(session_id));

CREATE POLICY rfi_action_links_live_demo_read
    ON public.rfi_action_links FOR SELECT
    USING (public.live_demo_can_read_session(session_id));

CREATE POLICY rfi_action_links_live_demo_insert
    ON public.rfi_action_links FOR INSERT
    WITH CHECK (public.live_demo_can_write_session(session_id));

-- ============================================================================
-- EXECUTE SURFACE REVIEW
-- ============================================================================

REVOKE ALL ON FUNCTION public.live_demo_operator_code_hash() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_validate_operator_code(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_participant_role(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_participant_surface(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_participant_team(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_has_operator_grant(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_can_read_session(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_can_write_session(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_can_write_session_surface(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_demo_can_write_team_session(UUID, TEXT, TEXT[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.authorize_demo_operator(TEXT, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_live_demo_session(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_live_demo_session(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_update_game_state(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_adjudicate_action(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_answer_request(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_send_communication(UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_joinable_session_by_code(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_role_seat_limit(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_stale_session_role_seats_internal(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_stale_session_role_seats(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_active_session_participants(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_session_role_seat(UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_session_role_seat(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disconnect_session_role_seat(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.authorize_demo_operator(TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_live_demo_session(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_live_demo_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_update_game_state(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_adjudicate_action(UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_answer_request(UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_send_communication(UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_joinable_session_by_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_active_session_participants(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_session_role_seat(UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_session_role_seat(UUID, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_session_role_seat(UUID, UUID, TEXT, INTEGER) TO authenticated;

COMMENT ON TABLE public.operator_grants IS 'Server-issued operator grants for Game Master and White Cell. Browser storage is not an authority boundary.';
COMMENT ON FUNCTION public.authorize_demo_operator(TEXT, TEXT, UUID, TEXT, TEXT, TEXT) IS 'Validates operator access server-side and binds the grant to auth.uid().';
COMMENT ON FUNCTION public.create_live_demo_session(TEXT, TEXT, TEXT) IS 'Protected Game Master RPC for session creation and initial game_state provisioning.';
COMMENT ON FUNCTION public.delete_live_demo_session(UUID) IS 'Protected Game Master RPC for deleting a live-demo session.';
COMMENT ON FUNCTION public.operator_update_game_state(UUID, INTEGER, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ) IS 'Protected White Cell RPC for move, phase, and timer control.';
COMMENT ON FUNCTION public.operator_adjudicate_action(UUID, TEXT, TEXT, TIMESTAMPTZ) IS 'Protected White Cell RPC for adjudication writes.';
COMMENT ON FUNCTION public.operator_answer_request(UUID, TEXT, TIMESTAMPTZ) IS 'Protected White Cell RPC for RFI responses.';
COMMENT ON FUNCTION public.operator_send_communication(UUID, TEXT, TEXT, TEXT, TEXT, UUID) IS 'Protected White Cell RPC for operator-only communication writes.';
COMMENT ON FUNCTION public.release_stale_session_role_seats_internal(UUID, INTEGER) IS 'Internal live-demo seat cleanup helper used by claim, heartbeat, and disconnect flows when session read access may not yet be available.';

COMMIT;
