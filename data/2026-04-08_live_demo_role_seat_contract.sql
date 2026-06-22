-- ESG Simulation Platform
-- Live demo role seat contract
--
-- Purpose:
-- 1) Replace browser-side seat prechecks with atomic server-side seat claims.
-- 2) Align stale-seat cleanup, heartbeat, and disconnect semantics around one timeout.
-- 3) Split White Cell into explicit lead/support seats and backfill legacy rows.

BEGIN;

UPDATE public.participants
SET role = regexp_replace(role, '_whitecell$', '_whitecell_lead'),
    updated_at = NOW()
WHERE role ~ '^(blue|red|green)_whitecell$';

UPDATE public.session_participants
SET role = regexp_replace(role, '_whitecell$', '_whitecell_lead')
WHERE role ~ '^(blue|red|green)_whitecell$';

COMMENT ON COLUMN public.session_participants.role IS 'Claimed live-demo seat role. White Cell operator seats use explicit *_whitecell_lead and *_whitecell_support roles.';

CREATE OR REPLACE FUNCTION public.get_session_role_seat_limit(requested_role TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN requested_role ~ '^(blue|red|green)_facilitator$' THEN 1
        WHEN requested_role ~ '^(blue|red|green)_scribe$' THEN 1
        WHEN requested_role ~ '^(blue|red|green)_notetaker$' THEN 2
        WHEN requested_role ~ '^(blue|red|green)_whitecell(_lead)?$' THEN 1
        WHEN requested_role ~ '^(blue|red|green)_whitecell_support$' THEN 1
        WHEN requested_role = 'white' THEN 1
        ELSE NULL
    END
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
    normalized_role TEXT := CASE
        WHEN requested_role ~ '^(blue|red|green)_whitecell$'
            THEN regexp_replace(BTRIM(requested_role), '_whitecell$', '_whitecell_lead')
        ELSE BTRIM(requested_role)
    END;
    normalized_name TEXT := NULLIF(BTRIM(requested_name), '');
    normalized_client_id TEXT := NULLIF(BTRIM(requested_client_id), '');
    normalized_timeout_seconds INTEGER := GREATEST(COALESCE(requested_timeout_seconds, 90), 1);
    role_limit INTEGER := public.get_session_role_seat_limit(normalized_role);
    active_claim_count INTEGER := 0;
    participant_row public.participants%ROWTYPE;
    seat_row public.session_participants%ROWTYPE;
    claim_status TEXT := 'claimed';
BEGIN
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

    PERFORM 1
    FROM public.sessions s
    WHERE s.id = requested_session_id
      AND s.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'This session is not currently joinable.'
            USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(requested_session_id::TEXT || ':' || normalized_role));
    PERFORM public.release_stale_session_role_seats(requested_session_id, normalized_timeout_seconds);

    INSERT INTO public.participants (
        client_id,
        name,
        role,
        updated_at
    )
    VALUES (
        normalized_client_id,
        normalized_name,
        normalized_role,
        NOW()
    )
    ON CONFLICT (client_id) DO UPDATE
    SET
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

        claim_status := 'claimed';
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
    normalized_client_id TEXT := NULLIF(BTRIM(requested_client_id), '');
    normalized_timeout_seconds INTEGER := GREATEST(COALESCE(requested_timeout_seconds, 90), 1);
    role_limit INTEGER;
    active_claim_count INTEGER := 0;
    seat_row public.session_participants%ROWTYPE;
    participant_row public.participants%ROWTYPE;
BEGIN
    IF requested_session_id IS NULL OR requested_session_participant_id IS NULL THEN
        RAISE EXCEPTION 'A claimed seat is required to send heartbeats.'
            USING ERRCODE = '22023';
    END IF;

    PERFORM public.release_stale_session_role_seats(requested_session_id, normalized_timeout_seconds);

    SELECT sp.*
    INTO seat_row
    FROM public.session_participants sp
    WHERE sp.id = requested_session_participant_id
      AND sp.session_id = requested_session_id
      AND EXISTS (
          SELECT 1
          FROM public.participants p
          WHERE p.id = sp.participant_id
            AND (normalized_client_id IS NULL OR p.client_id = normalized_client_id)
      )
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
    normalized_client_id TEXT := NULLIF(BTRIM(requested_client_id), '');
    seat_row public.session_participants%ROWTYPE;
    participant_row public.participants%ROWTYPE;
BEGIN
    IF requested_session_id IS NULL OR requested_session_participant_id IS NULL THEN
        RETURN NULL;
    END IF;

    PERFORM public.release_stale_session_role_seats(requested_session_id, requested_timeout_seconds);

    SELECT sp.*
    INTO seat_row
    FROM public.session_participants sp
    WHERE sp.id = requested_session_participant_id
      AND sp.session_id = requested_session_id
      AND EXISTS (
          SELECT 1
          FROM public.participants p
          WHERE p.id = sp.participant_id
            AND (normalized_client_id IS NULL OR p.client_id = normalized_client_id)
      )
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

REVOKE ALL ON FUNCTION public.get_session_role_seat_limit(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_stale_session_role_seats(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_active_session_participants(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_session_role_seat(UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_session_role_seat(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disconnect_session_role_seat(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_session_role_seat_limit(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_session_role_seats(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_active_session_participants(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_session_role_seat(UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_session_role_seat(UUID, UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_session_role_seat(UUID, UUID, TEXT, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_session_role_seat_limit(TEXT) IS 'Live-demo seat limit lookup for public participant and White Cell seat claims.';
COMMENT ON FUNCTION public.release_stale_session_role_seats(UUID, INTEGER) IS 'Marks stale session seats inactive so claims and participant counts use the same timeout contract.';
COMMENT ON FUNCTION public.list_active_session_participants(UUID, INTEGER) IS 'Returns active participants after stale seat cleanup using the live-demo timeout contract.';
COMMENT ON FUNCTION public.claim_session_role_seat(UUID, TEXT, TEXT, TEXT, INTEGER) IS 'Atomic live-demo seat claim RPC. Uses an advisory lock per session-role to prevent claim races.';
COMMENT ON FUNCTION public.heartbeat_session_role_seat(UUID, UUID, TEXT, INTEGER) IS 'Updates a claimed live-demo seat heartbeat and only reactivates inactive seats when capacity still exists.';
COMMENT ON FUNCTION public.disconnect_session_role_seat(UUID, UUID, TEXT, INTEGER) IS 'Explicit disconnect RPC for claimed live-demo seats. Supports keepalive fetch calls during page exit.';

COMMIT;
