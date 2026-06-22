-- Seat claim role input normalization patch
--
-- Purpose:
-- 1) Make live-demo seat claims resilient to hidden whitespace and zero-width characters.
-- 2) Keep the seat-limit helper and claim RPC on the same canonical role normalization contract.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_session_role_seat_limit(requested_role TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN normalized_role ~ '^(blue|red|green)_facilitator$' THEN 1
        WHEN normalized_role ~ '^(blue|red|green)_scribe$' THEN 1
        WHEN normalized_role ~ '^(blue|red|green)_notetaker$' THEN 2
        WHEN normalized_role ~ '^(?:(blue|red|green)_)?whitecell(?:_lead)?$' THEN 1
        WHEN normalized_role ~ '^(?:(blue|red|green)_)?whitecell_support$' THEN 1
        WHEN normalized_role = 'white' THEN 1
        ELSE NULL
    END
    FROM (
        SELECT regexp_replace(LOWER(COALESCE(requested_role, '')), '[^a-z_]+', '', 'g') AS normalized_role
    ) normalized_input
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
        WHEN sanitized_requested_role ~ '^(?:(blue|red|green)_)?whitecell(?:_lead)?$' THEN 'whitecell_lead'
        WHEN sanitized_requested_role ~ '^(?:(blue|red|green)_)?whitecell_support$' THEN 'whitecell_support'
        ELSE sanitized_requested_role
    END;
    normalized_name := NULLIF(BTRIM(requested_name), '');
    normalized_client_id := NULLIF(BTRIM(requested_client_id), '');
    normalized_timeout_seconds := GREATEST(COALESCE(requested_timeout_seconds, 90), 1);
    normalized_team := CASE
        WHEN normalized_role ~ '^(blue|red|green)_' THEN split_part(normalized_role, '_', 1)
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
    ON CONFLICT (client_id) DO UPDATE
    SET
        auth_user_id = EXCLUDED.auth_user_id,
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

COMMIT;
