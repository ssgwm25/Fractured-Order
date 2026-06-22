-- ESG Simulation Platform
-- Global White Cell role contract
--
-- Purpose:
-- 1) Collapse legacy team-scoped White Cell seats into a single platform-wide lead/support pair.
-- 2) Preserve legacy role strings by normalizing them into whitecell_lead / whitecell_support.
-- 3) Keep the live operator authorization and seat-claim RPCs aligned with the shipped frontend.
-- 4) Preserve the public participant join contract introduced in the facilitator join access fix.

BEGIN;

UPDATE public.participants
SET role = CASE
        WHEN role ~ '^(?:(blue|red|green)_)?whitecell(?:_lead)?$' THEN 'whitecell_lead'
        WHEN role ~ '^(?:(blue|red|green)_)?whitecell_support$' THEN 'whitecell_support'
        ELSE role
    END,
    updated_at = NOW()
WHERE role ~ '^(?:(blue|red|green)_)?whitecell(?:_(lead|support))?$';

UPDATE public.session_participants
SET role = CASE
        WHEN role ~ '^(?:(blue|red|green)_)?whitecell(?:_lead)?$' THEN 'whitecell_lead'
        WHEN role ~ '^(?:(blue|red|green)_)?whitecell_support$' THEN 'whitecell_support'
        ELSE role
    END
WHERE role ~ '^(?:(blue|red|green)_)?whitecell(?:_(lead|support))?$';

UPDATE public.operator_grants
SET role = CASE
        WHEN role ~ '^(?:(blue|red|green)_)?whitecell(?:_lead)?$' THEN 'whitecell_lead'
        WHEN role ~ '^(?:(blue|red|green)_)?whitecell_support$' THEN 'whitecell_support'
        ELSE role
    END,
    team_id = NULL,
    updated_at = NOW()
WHERE surface = 'whitecell'
   OR role ~ '^(?:(blue|red|green)_)?whitecell(?:_(lead|support))?$';

WITH ranked_white_cell_seats AS (
    SELECT
        sp.id,
        ROW_NUMBER() OVER (
            PARTITION BY sp.session_id, sp.role
            ORDER BY COALESCE(sp.heartbeat_at, sp.last_seen, sp.joined_at, NOW()) DESC, sp.id DESC
        ) AS seat_rank
    FROM public.session_participants sp
    WHERE sp.is_active = true
      AND sp.role IN ('whitecell_lead', 'whitecell_support')
)
UPDATE public.session_participants sp
SET
    is_active = false,
    disconnected_at = COALESCE(sp.disconnected_at, NOW()),
    left_at = COALESCE(sp.left_at, NOW()),
    last_seen = COALESCE(sp.last_seen, sp.heartbeat_at, sp.joined_at, NOW())
FROM ranked_white_cell_seats ranked
WHERE sp.id = ranked.id
  AND ranked.seat_rank > 1;

COMMENT ON COLUMN public.session_participants.role IS 'Claimed live-demo seat role. White Cell operator seats use the global whitecell_lead and whitecell_support roles.';

CREATE OR REPLACE FUNCTION public.get_session_role_seat_limit(requested_role TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN requested_role ~ '^(blue|red|green)_facilitator$' THEN 1
        WHEN requested_role ~ '^(blue|red|green)_scribe$' THEN 1
        WHEN requested_role ~ '^(blue|red|green)_notetaker$' THEN 2
        WHEN requested_role ~ '^(?:(blue|red|green)_)?whitecell(?:_lead)?$' THEN 1
        WHEN requested_role ~ '^(?:(blue|red|green)_)?whitecell_support$' THEN 1
        WHEN requested_role = 'white' THEN 1
        ELSE NULL
    END
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

    IF resolved_role ~ '^(blue|red|green)_facilitator$' THEN
        RETURN 'facilitator';
    END IF;

    IF resolved_role ~ '^(blue|red|green)_scribe$' THEN
        RETURN 'scribe';
    END IF;

    IF resolved_role ~ '^(blue|red|green)_notetaker$' THEN
        RETURN 'notetaker';
    END IF;

    IF resolved_role ~ '^(?:(blue|red|green)_)?whitecell(?:_(lead|support))?$' THEN
        RETURN 'whitecell';
    END IF;

    RETURN NULL;
END;
$$;

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
        WHEN COALESCE(BTRIM(requested_role), '') ~ '^(?:(blue|red|green)_)?whitecell(?:_lead)?$' THEN 'whitecell_lead'
        WHEN COALESCE(BTRIM(requested_role), '') ~ '^(?:(blue|red|green)_)?whitecell_support$' THEN 'whitecell_support'
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
        WHEN COALESCE(BTRIM(requested_role), '') ~ '^(?:(blue|red|green)_)?whitecell(?:_lead)?$' THEN 'whitecell_lead'
        WHEN COALESCE(BTRIM(requested_role), '') ~ '^(?:(blue|red|green)_)?whitecell_support$' THEN 'whitecell_support'
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
