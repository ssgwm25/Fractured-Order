-- ESG Simulation Platform
-- Facilitator join session-access fix
--
-- Purpose:
-- 1) Preserve the hardened session access checks on protected participant RPCs.
-- 2) Allow first-time public seat claims to release stale seats inside the claim RPC.
-- 3) Remove the false `Session access is required.` failure during facilitator/scribe/notetaker joins.

BEGIN;

DROP FUNCTION IF EXISTS public.release_stale_session_role_seats(UUID, INTEGER, BOOLEAN);

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
        WHEN requested_role ~ '^(blue|red|green)_whitecell$'
            THEN regexp_replace(BTRIM(requested_role), '_whitecell$', '_whitecell_lead')
        ELSE BTRIM(requested_role)
    END;
    normalized_name TEXT := NULLIF(BTRIM(requested_name), '');
    normalized_client_id TEXT := NULLIF(BTRIM(requested_client_id), '');
    normalized_timeout_seconds INTEGER := GREATEST(COALESCE(requested_timeout_seconds, 90), 1);
    normalized_team TEXT := CASE
        WHEN normalized_role ~ '^(blue|red|green)_' THEN split_part(normalized_role, '_', 1)
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

    IF normalized_role ~ '^(blue|red|green)_whitecell(_lead|_support)?$'
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

REVOKE ALL ON FUNCTION public.release_stale_session_role_seats_internal(UUID, INTEGER) FROM PUBLIC;

COMMENT ON FUNCTION public.release_stale_session_role_seats_internal(UUID, INTEGER) IS 'Internal live-demo seat cleanup helper used by claim, heartbeat, and disconnect flows when session read access may not yet be available.';

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

COMMIT;
