-- SME Access & Handoff Workflow
--
-- Purpose:
-- 1) Add shared-code SME operator surface (econ, NI/Escalation, Diplomacy & Info,
--    TSJ, Verba) to authorize_demo_operator / seat claim contracts.
-- 2) Create sme_handoffs for TSJ + Verba external-tool queues opened when White
--    Cell marks a Blue action complete.
-- 3) Allow SME surface grants to select/update pli_adjudications (seat writes stay
--    role-gated in the client; fine-grained RLS is a follow-up).
--
-- Depends on: 2026-04-09_global_white_cell_role_contract.sql,
--             2026-06-25_industry_team_role_contract.sql,
--             2026-07-17_pli_adjudications.sql
-- Safe to reapply: CREATE OR REPLACE + DROP POLICY IF EXISTS.

BEGIN;

-- ---------------------------------------------------------------------------
-- sme_handoffs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sme_handoffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
    seat TEXT NOT NULL CHECK (seat IN ('tsj', 'verba')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT sme_handoffs_action_seat_unique UNIQUE (action_id, seat)
);

CREATE INDEX IF NOT EXISTS idx_sme_handoffs_session
    ON public.sme_handoffs(session_id);
CREATE INDEX IF NOT EXISTS idx_sme_handoffs_session_seat_status
    ON public.sme_handoffs(session_id, seat, status);

ALTER TABLE public.sme_handoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sme_handoffs_select ON public.sme_handoffs;
DROP POLICY IF EXISTS sme_handoffs_insert ON public.sme_handoffs;
DROP POLICY IF EXISTS sme_handoffs_update ON public.sme_handoffs;
DROP POLICY IF EXISTS sme_handoffs_delete ON public.sme_handoffs;

CREATE POLICY sme_handoffs_select
    ON public.sme_handoffs FOR SELECT
    USING (
        public.live_demo_can_write_session_surface(
            session_id,
            ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]
        )
        OR public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('sme', session_id)
        OR public.live_demo_has_operator_grant('whitecell', session_id)
    );

CREATE POLICY sme_handoffs_insert
    ON public.sme_handoffs FOR INSERT
    WITH CHECK (
        public.live_demo_can_write_session_surface(
            session_id,
            ARRAY['whitecell', 'gamemaster']::TEXT[]
        )
        OR public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('whitecell', session_id)
    );

CREATE POLICY sme_handoffs_update
    ON public.sme_handoffs FOR UPDATE
    USING (
        public.live_demo_can_write_session_surface(
            session_id,
            ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]
        )
        OR public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('sme', session_id)
        OR public.live_demo_has_operator_grant('whitecell', session_id)
    )
    WITH CHECK (
        status IN ('pending', 'done')
        AND (
            public.live_demo_can_write_session_surface(
                session_id,
                ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]
            )
            OR public.live_demo_has_operator_grant('gamemaster')
            OR public.live_demo_has_operator_grant('sme', session_id)
            OR public.live_demo_has_operator_grant('whitecell', session_id)
        )
    );

COMMENT ON TABLE public.sme_handoffs IS
    'External-tool handoff queues for TSJ and Verba SMEs after White Cell action-complete.';

-- ---------------------------------------------------------------------------
-- Seat limits + participant surface
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_session_role_seat_limit(requested_role TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN normalized_role ~ '^(blue|red|green|industry)_facilitator$' THEN 1
        WHEN normalized_role ~ '^(blue|red|green|industry)_scribe$' THEN 1
        WHEN normalized_role ~ '^(blue|red|green|industry)_notetaker$' THEN 2
        WHEN normalized_role ~ '^(?:(blue|red|green|industry)_)?whitecell(?:_lead)?$' THEN 1
        WHEN normalized_role ~ '^(?:(blue|red|green|industry)_)?whitecell_support$' THEN 1
        WHEN normalized_role = 'white' THEN 1
        WHEN normalized_role IN (
            'sme_econ',
            'sme_ni_escalation',
            'sme_diplomacy_information',
            'sme_tsj',
            'sme_verba'
        ) THEN 1
        ELSE NULL
    END
    FROM (
        SELECT regexp_replace(LOWER(COALESCE(requested_role, '')), '[^a-z_]+', '', 'g') AS normalized_role
    ) normalized_input
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

    IF resolved_role ~ '^(?:(blue|red|green|industry)_)?whitecell(?:_(lead|support))?$' THEN
        RETURN 'whitecell';
    END IF;

    IF resolved_role ~ '^sme_(econ|ni_escalation|diplomacy_information|tsj|verba)$' THEN
        RETURN 'sme';
    END IF;

    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- authorize_demo_operator — add SME surface (same operator code hash)
-- ---------------------------------------------------------------------------

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
    sanitized_role TEXT := regexp_replace(
        LOWER(COALESCE(requested_role, '')),
        '[^a-z_]+',
        '',
        'g'
    );
    normalized_role TEXT := CASE
        WHEN sanitized_role ~ '^(?:(blue|red|green|industry)_)?whitecell(?:_lead)?$' THEN 'whitecell_lead'
        WHEN sanitized_role ~ '^(?:(blue|red|green|industry)_)?whitecell_support$' THEN 'whitecell_support'
        WHEN sanitized_role IN (
            'sme_econ',
            'sme_ni_escalation',
            'sme_diplomacy_information',
            'sme_tsj',
            'sme_verba'
        ) THEN sanitized_role
        ELSE NULLIF(sanitized_role, '')
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

    IF normalized_surface NOT IN ('gamemaster', 'whitecell', 'sme') THEN
        RAISE EXCEPTION 'Unsupported operator surface.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_surface = 'gamemaster' THEN
        normalized_team := NULL;
        normalized_role := 'white';
        requested_session_id := NULL;
    ELSIF normalized_surface = 'whitecell' THEN
        IF requested_session_id IS NULL THEN
            RAISE EXCEPTION 'White Cell authorization requires a session.'
                USING ERRCODE = '22023';
        END IF;

        IF normalized_role NOT IN ('whitecell_lead', 'whitecell_support') THEN
            RAISE EXCEPTION 'White Cell authorization requires a supported operator role.'
                USING ERRCODE = '22023';
        END IF;

        normalized_team := NULL;

        PERFORM 1
        FROM public.sessions s
        WHERE s.id = requested_session_id
          AND s.status = 'active';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'This session is not currently joinable.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSE
        -- SME surface
        IF requested_session_id IS NULL THEN
            RAISE EXCEPTION 'SME authorization requires a session.'
                USING ERRCODE = '22023';
        END IF;

        IF normalized_role NOT IN (
            'sme_econ',
            'sme_ni_escalation',
            'sme_diplomacy_information',
            'sme_tsj',
            'sme_verba'
        ) THEN
            RAISE EXCEPTION 'SME authorization requires a supported SME role.'
                USING ERRCODE = '22023';
        END IF;

        normalized_team := NULL;

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

-- ---------------------------------------------------------------------------
-- claim_session_role_seat — require SME grant for sme_* seats
-- (Body mirrors 2026-06-25 industry contract + SME grant gate.)
-- ---------------------------------------------------------------------------

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
    current_user_id UUID;
    sanitized_requested_role TEXT;
    normalized_role TEXT;
    normalized_name TEXT;
    normalized_client_id TEXT;
    normalized_timeout_seconds INTEGER;
    normalized_team TEXT;
    role_limit INTEGER;
    active_claim_count INTEGER := 0;
    participant_row public.participants%ROWTYPE;
    seat_row public.session_participants%ROWTYPE;
    claim_status TEXT := 'claimed';
BEGIN
    current_user_id := auth.uid();
    sanitized_requested_role := regexp_replace(
        LOWER(COALESCE(requested_role, '')),
        '[^a-z_]+',
        '',
        'g'
    );
    normalized_role := CASE
        WHEN sanitized_requested_role ~ '^(?:(blue|red|green|industry)_)?whitecell(?:_lead)?$' THEN 'whitecell_lead'
        WHEN sanitized_requested_role ~ '^(?:(blue|red|green|industry)_)?whitecell_support$' THEN 'whitecell_support'
        ELSE sanitized_requested_role
    END;
    normalized_name := NULLIF(BTRIM(requested_name), '');
    normalized_client_id := NULLIF(BTRIM(requested_client_id), '');
    normalized_timeout_seconds := GREATEST(COALESCE(requested_timeout_seconds, 90), 1);
    normalized_team := CASE
        WHEN normalized_role ~ '^(blue|red|green|industry)_' THEN split_part(normalized_role, '_', 1)
        ELSE NULL
    END;
    role_limit := public.get_session_role_seat_limit(normalized_role);

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

    IF normalized_role ~ '^whitecell(_lead|_support)?$'
       AND NOT public.live_demo_has_operator_grant('whitecell', requested_session_id, NULL, normalized_role) THEN
        RAISE EXCEPTION 'White Cell seats require operator authorization.'
            USING ERRCODE = '42501';
    END IF;

    IF normalized_role ~ '^sme_(econ|ni_escalation|diplomacy_information|tsj|verba)$'
       AND NOT public.live_demo_has_operator_grant('sme', requested_session_id, NULL, normalized_role) THEN
        RAISE EXCEPTION 'SME seats require operator authorization.'
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

    SELECT *
    INTO participant_row
    FROM public.participants
    WHERE auth_user_id = current_user_id
    FOR UPDATE;

    IF FOUND THEN
        DELETE FROM public.participants
        WHERE client_id = normalized_client_id
          AND id <> participant_row.id;

        UPDATE public.participants
        SET
            client_id = normalized_client_id,
            name = COALESCE(normalized_name, name),
            role = normalized_role,
            updated_at = NOW()
        WHERE id = participant_row.id
        RETURNING *
        INTO participant_row;
    ELSE
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
        ON CONFLICT (client_id) DO UPDATE
        SET
            auth_user_id = EXCLUDED.auth_user_id,
            name = COALESCE(EXCLUDED.name, public.participants.name),
            role = EXCLUDED.role,
            updated_at = NOW()
        RETURNING *
        INTO participant_row;
    END IF;

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
            WHEN seat_row.is_active = true AND seat_row.role = normalized_role THEN 'refreshed'
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
        'team_id', normalized_team,
        'seat_limit', role_limit,
        'active_count', active_claim_count + 1,
        'claim_status', claim_status
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- PLI adjudications — allow SME surface to read/update (client still seat-gates)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS pli_adjudications_select ON public.pli_adjudications;
DROP POLICY IF EXISTS pli_adjudications_update ON public.pli_adjudications;

CREATE POLICY pli_adjudications_select
    ON public.pli_adjudications FOR SELECT
    USING (
        public.live_demo_can_write_session_surface(
            session_id,
            ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]
        )
        OR public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('sme', session_id)
        OR (
            public.live_demo_can_read_session(session_id)
            AND status IN ('approved', 'overridden')
        )
    );

CREATE POLICY pli_adjudications_update
    ON public.pli_adjudications FOR UPDATE
    USING (
        public.live_demo_can_write_session_surface(
            session_id,
            ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]
        )
        OR public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('sme', session_id)
    )
    WITH CHECK (
        status IN ('pending', 'approved', 'overridden', 'needs_human')
        AND (
            public.live_demo_can_write_session_surface(
                session_id,
                ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]
            )
            OR public.live_demo_has_operator_grant('gamemaster')
            OR public.live_demo_has_operator_grant('sme', session_id)
        )
    );

COMMIT;
