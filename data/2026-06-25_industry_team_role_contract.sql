-- Industry team role contract patch
--
-- Purpose:
-- 1) Add Industry as a first-class live-demo team in Supabase role contracts.
-- 2) Keep Industry aligned with Green for facilitator/scribe/notetaker seat claims.
-- 3) Allow White Cell to target Industry and Industry role seats in communications.
-- 4) Preserve the proposal recipient final-state lock while recognizing Industry
--    team-wide and role-scoped proposal recipients.
--
-- Apply this to already-provisioned Supabase projects after the current schema.
-- Safe to reapply: all function changes use CREATE OR REPLACE and the policy is
-- dropped before recreation.

BEGIN;

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

DROP FUNCTION IF EXISTS public.operator_send_communication(UUID, TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.operator_send_communication(
    requested_session_id UUID,
    requested_to_role TEXT,
    requested_type TEXT,
    requested_content TEXT,
    requested_title TEXT DEFAULT NULL,
    requested_linked_request_id UUID DEFAULT NULL,
    requested_metadata JSONB DEFAULT '{}'::jsonb
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
    normalized_metadata JSONB := COALESCE(requested_metadata, '{}'::jsonb);
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

    IF jsonb_typeof(normalized_metadata) <> 'object' THEN
        RAISE EXCEPTION 'Communication metadata must be a JSON object.'
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
        normalized_metadata || jsonb_build_object(
            'operator_role', participant_role,
            'operator_auth_user_id', auth.uid()
        )
    )
    RETURNING *
    INTO created_communication;

    RETURN created_communication;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_proposal_recipient_status(
    requested_communication_id UUID,
    requested_status TEXT,
    requested_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.communications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    communication_row public.communications%ROWTYPE;
    updated_communication public.communications%ROWTYPE;
    participant_role TEXT;
    participant_team TEXT;
    participant_surface TEXT;
    normalized_status TEXT := LOWER(NULLIF(BTRIM(requested_status), ''));
    normalized_metadata JSONB := COALESCE(requested_metadata, '{}'::jsonb);
    recipient_team TEXT;
    current_status TEXT;
BEGIN
    IF requested_communication_id IS NULL THEN
        RAISE EXCEPTION 'Proposal communication ID is required.'
            USING ERRCODE = '22023';
    END IF;

    IF normalized_status IS NULL OR normalized_status NOT IN ('unread', 'acknowledged', 'responded', 'declined', 'ignored') THEN
        RAISE EXCEPTION 'Unsupported proposal recipient status.'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(normalized_metadata) <> 'object' THEN
        RAISE EXCEPTION 'Proposal recipient metadata must be a JSON object.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO communication_row
    FROM public.communications c
    WHERE c.id = requested_communication_id
    FOR UPDATE;

    IF communication_row.id IS NULL THEN
        RAISE EXCEPTION 'Proposal communication not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF communication_row.type <> 'PROPOSAL_FORWARDED' THEN
        RAISE EXCEPTION 'Only forwarded proposals can update recipient state.'
            USING ERRCODE = 'P0001';
    END IF;

    participant_role := public.live_demo_participant_role(communication_row.session_id);
    participant_team := public.live_demo_participant_team(communication_row.session_id);
    participant_surface := public.live_demo_participant_surface(communication_row.session_id);

    IF auth.uid() IS NULL
       OR participant_role IS NULL
       OR participant_surface NOT IN ('facilitator', 'scribe') THEN
        RAISE EXCEPTION 'Team-lead access is required to update proposal recipient state.'
            USING ERRCODE = '42501';
    END IF;

    recipient_team := COALESCE(
        NULLIF(BTRIM(communication_row.metadata ->> 'recipient_team'), ''),
        CASE
            WHEN communication_row.to_role IN ('blue', 'red', 'green', 'industry') THEN communication_row.to_role
            WHEN communication_row.to_role ~ '^(blue|red|green|industry)_' THEN split_part(communication_row.to_role, '_', 1)
            ELSE NULL
        END
    );

    IF recipient_team IS NULL OR participant_team <> recipient_team THEN
        RAISE EXCEPTION 'Only the addressed team can update proposal recipient state.'
            USING ERRCODE = '42501';
    END IF;

    current_status := LOWER(NULLIF(BTRIM(
        COALESCE(communication_row.metadata -> 'proposal_recipient_state' ->> 'status', '')
    ), ''));

    IF current_status IN ('responded', 'declined', 'ignored') THEN
        RAISE EXCEPTION 'This proposal recipient state is already final.'
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.communications c
    SET
        metadata = COALESCE(c.metadata, '{}'::jsonb) || jsonb_build_object(
            'proposal_recipient_state',
            COALESCE(c.metadata -> 'proposal_recipient_state', '{}'::jsonb)
            || normalized_metadata
            || jsonb_build_object(
                'status', normalized_status,
                'actioned_at', NOW(),
                'participant_role', participant_role,
                'participant_team', participant_team,
                'participant_auth_user_id', auth.uid()
            )
        )
    WHERE c.id = requested_communication_id
    RETURNING *
    INTO updated_communication;

    RETURN updated_communication;
END;
$$;

DROP POLICY IF EXISTS communications_live_demo_insert ON public.communications;

CREATE POLICY communications_live_demo_insert
    ON public.communications FOR INSERT
    WITH CHECK (
        public.live_demo_can_write_session_surface(session_id, ARRAY['facilitator', 'scribe']::TEXT[])
        AND type = 'PROPOSAL_RESPONSE'
        AND LOWER(BTRIM(to_role)) = 'white_cell'
        AND LOWER(BTRIM(from_role)) = public.live_demo_participant_role(session_id)
        AND NULLIF(BTRIM(content), '') IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.communications forwarded
            WHERE forwarded.id::TEXT = NULLIF(BTRIM(communications.metadata ->> 'source_communication_id'), '')
              AND forwarded.session_id = communications.session_id
              AND forwarded.type = 'PROPOSAL_FORWARDED'
              AND COALESCE(
                  NULLIF(BTRIM(forwarded.metadata -> 'proposal_recipient_state' ->> 'status'), ''),
                  'unread'
              ) NOT IN ('responded', 'declined', 'ignored')
              AND COALESCE(
                  NULLIF(BTRIM(forwarded.metadata ->> 'recipient_team'), ''),
                  CASE
                      WHEN forwarded.to_role IN ('blue', 'red', 'green', 'industry') THEN forwarded.to_role
                      WHEN forwarded.to_role ~ '^(blue|red|green|industry)_' THEN split_part(forwarded.to_role, '_', 1)
                      ELSE NULL
                  END
              ) = public.live_demo_participant_team(communications.session_id)
        )
    );

REVOKE ALL ON FUNCTION public.claim_session_role_seat(UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_send_communication(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_proposal_recipient_status(UUID, TEXT, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_session_role_seat(UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_send_communication(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_proposal_recipient_status(UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.claim_session_role_seat(UUID, TEXT, TEXT, TEXT, INTEGER) IS 'Protected participant RPC that claims a live-demo seat, including Blue, Red, Green, and Industry team seats.';
COMMENT ON FUNCTION public.operator_send_communication(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) IS 'Protected White Cell RPC for operator-only communication writes that preserves requested metadata and supports all four team recipients.';
COMMENT ON FUNCTION public.update_proposal_recipient_status(UUID, TEXT, JSONB) IS 'Protected facilitator/scribe RPC that persists proposal recipient inbox status in communication metadata.';

COMMIT;
