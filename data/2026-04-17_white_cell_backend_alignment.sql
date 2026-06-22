-- ESG Simulation Platform
-- White Cell backend alignment patch
--
-- Purpose:
-- 1) Give White Cell the same session-management/remove-seat abilities exposed in the UI.
-- 2) Preserve requested White Cell communication metadata instead of dropping it in the RPC.
-- 3) Persist proposal recipient status chips in backend metadata as the shared source of truth.

BEGIN;

ALTER TABLE public.communications
    DROP CONSTRAINT IF EXISTS communications_type_check;

DO $$
DECLARE
    communications_constraint_name TEXT;
BEGIN
    SELECT conname
    INTO communications_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.communications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%type IN%';

    IF communications_constraint_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE public.communications DROP CONSTRAINT %I',
            communications_constraint_name
        );
    END IF;
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
            OR public.live_demo_has_operator_grant('whitecell')
        )
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
    IF auth.uid() IS NULL OR NOT (
        public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('whitecell')
    ) THEN
        RAISE EXCEPTION 'Game Master or White Cell authorization is required.'
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
    IF auth.uid() IS NULL OR NOT (
        public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('whitecell')
    ) THEN
        RAISE EXCEPTION 'Game Master or White Cell authorization is required.'
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

CREATE OR REPLACE FUNCTION public.operator_remove_session_participant(
    requested_session_id UUID,
    requested_session_participant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    removed_at TIMESTAMPTZ := NOW();
    seat_row public.session_participants%ROWTYPE;
    participant_row public.participants%ROWTYPE;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Browser identity is required before operator actions.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT (
        public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('whitecell')
    ) THEN
        RAISE EXCEPTION 'Game Master or White Cell authorization is required.'
            USING ERRCODE = '42501';
    END IF;

    IF requested_session_id IS NULL OR requested_session_participant_id IS NULL THEN
        RAISE EXCEPTION 'Session and participant seat identifiers are required.'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.sessions s
    WHERE s.id = requested_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT sp.*
    INTO seat_row
    FROM public.session_participants sp
    WHERE sp.id = requested_session_participant_id
      AND sp.session_id = requested_session_id
    FOR UPDATE;

    IF seat_row.id IS NULL THEN
        RAISE EXCEPTION 'Participant seat not found for this session.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT p.*
    INTO participant_row
    FROM public.participants p
    WHERE p.id = seat_row.participant_id;

    DELETE FROM public.session_participants sp
    WHERE sp.id = seat_row.id;

    IF participant_row.auth_user_id IS NOT NULL THEN
        DELETE FROM public.operator_grants og
        WHERE og.auth_user_id = participant_row.auth_user_id
          AND og.surface = 'whitecell'
          AND og.session_id = requested_session_id;
    END IF;

    RETURN jsonb_build_object(
        'id', seat_row.id,
        'session_id', seat_row.session_id,
        'participant_id', seat_row.participant_id,
        'role', seat_row.role,
        'is_active', false,
        'heartbeat_at', seat_row.heartbeat_at,
        'last_seen', COALESCE(seat_row.last_seen, seat_row.heartbeat_at, seat_row.joined_at, removed_at),
        'joined_at', seat_row.joined_at,
        'disconnected_at', removed_at,
        'display_name', COALESCE(participant_row.name, 'Unknown'),
        'client_id', participant_row.client_id,
        'removed_at', removed_at
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
        'blue_facilitator',
        'blue_scribe',
        'red_facilitator',
        'red_scribe',
        'green_facilitator',
        'green_scribe',
        'blue_notetaker',
        'red_notetaker',
        'green_notetaker'
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
            WHEN communication_row.to_role IN ('blue', 'red', 'green') THEN communication_row.to_role
            WHEN communication_row.to_role ~ '^(blue|red|green)_' THEN split_part(communication_row.to_role, '_', 1)
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
                      WHEN forwarded.to_role IN ('blue', 'red', 'green') THEN forwarded.to_role
                      WHEN forwarded.to_role ~ '^(blue|red|green)_' THEN split_part(forwarded.to_role, '_', 1)
                      ELSE NULL
                  END
              ) = public.live_demo_participant_team(communications.session_id)
        )
    );

REVOKE ALL ON FUNCTION public.operator_remove_session_participant(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operator_send_communication(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_proposal_recipient_status(UUID, TEXT, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.operator_remove_session_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_send_communication(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_proposal_recipient_status(UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.operator_remove_session_participant(UUID, UUID) IS 'Protected Game Master or White Cell RPC that removes a claimed session seat and revokes linked White Cell operator access for that session.';
COMMENT ON FUNCTION public.operator_send_communication(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) IS 'Protected White Cell RPC for operator-only communication writes that preserves requested metadata.';
COMMENT ON FUNCTION public.update_proposal_recipient_status(UUID, TEXT, JSONB) IS 'Protected facilitator/scribe RPC that persists proposal recipient inbox status in communication metadata.';

COMMIT;
