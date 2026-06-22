-- ESG Simulation Platform
-- Game Master participant removal contract
--
-- Purpose:
-- 1) Give Game Master a protected way to remove a participant seat from a session.
-- 2) Make removal durable by deleting the claimed seat so heartbeat recovery cannot reclaim it.
-- 3) Revoke linked White Cell operator grants for that session when a removed seat belonged to a White Cell operator.

BEGIN;

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

    IF NOT public.live_demo_has_operator_grant('gamemaster') THEN
        RAISE EXCEPTION 'Game Master authorization is required.'
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

REVOKE ALL ON FUNCTION public.operator_remove_session_participant(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_remove_session_participant(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.operator_remove_session_participant(UUID, UUID) IS 'Protected Game Master RPC that removes a claimed session seat and revokes linked White Cell operator access for that session.';

COMMIT;
