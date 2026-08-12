BEGIN;

-- Sessions with captured research evidence cannot be hard-deleted because the
-- append-only event log retains a foreign-key reference to the session. Archive
-- them instead, close active seats, and append the closure to the same evidence
-- chain.
CREATE OR REPLACE FUNCTION public.archive_live_demo_session(requested_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    grant_row public.operator_grants%ROWTYPE;
    previous_session public.sessions%ROWTYPE;
    archived_session public.sessions%ROWTYPE;
    closed_seat_count INTEGER := 0;
BEGIN
    IF current_user_id IS NULL OR NOT (
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

    SELECT *
    INTO previous_session
    FROM public.sessions
    WHERE id = requested_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found. Please refresh and try again.'
            USING ERRCODE = 'P0002';
    END IF;

    IF previous_session.status = 'archived' THEN
        RETURN jsonb_build_object(
            'archived_session_id', previous_session.id,
            'status', previous_session.status,
            'already_archived', true,
            'closed_seat_count', 0
        );
    END IF;

    SELECT og.*
    INTO grant_row
    FROM public.operator_grants og
    WHERE og.auth_user_id = current_user_id
      AND og.surface IN ('gamemaster', 'whitecell')
    ORDER BY CASE WHEN og.surface = 'gamemaster' THEN 0 ELSE 1 END,
             og.granted_at DESC
    LIMIT 1;

    UPDATE public.sessions
    SET status = 'archived',
        updated_at = NOW()
    WHERE id = requested_session_id
    RETURNING *
    INTO archived_session;

    UPDATE public.session_participants
    SET is_active = false,
        disconnected_at = COALESCE(disconnected_at, NOW()),
        left_at = COALESCE(left_at, NOW()),
        last_seen = COALESCE(last_seen, heartbeat_at, joined_at, NOW())
    WHERE session_id = requested_session_id
      AND is_active = true;

    GET DIAGNOSTICS closed_seat_count = ROW_COUNT;

    PERFORM public.record_research_event(
        requested_session_id,
        NOW(),
        NULL,
        CONCAT(grant_row.surface, '-', LEFT(grant_row.id::TEXT, 8)),
        COALESCE(grant_row.role, grant_row.surface),
        grant_row.team_id,
        NULL,
        'SESSION_CLOSED',
        'session',
        requested_session_id,
        NULL,
        NULL,
        NULL,
        NULL,
        jsonb_build_object(
            'id', previous_session.id,
            'status', previous_session.status,
            'updated_at', previous_session.updated_at
        ),
        jsonb_build_object(
            'id', archived_session.id,
            'status', archived_session.status,
            'updated_at', archived_session.updated_at
        ),
        jsonb_build_object(
            'archive_method', 'operator_rpc',
            'closed_seat_count', closed_seat_count
        ),
        NULL
    );

    RETURN jsonb_build_object(
        'archived_session_id', archived_session.id,
        'status', archived_session.status,
        'already_archived', false,
        'closed_seat_count', closed_seat_count
    );
END;
$$;

-- Keep the old RPC non-destructive during a migration-first rolling deployment.
-- Current clients call archive_live_demo_session directly.
CREATE OR REPLACE FUNCTION public.delete_live_demo_session(requested_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.archive_live_demo_session(requested_session_id);
END;
$$;

-- Archived sessions are readable evidence, not writable live sessions.
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
        )
        AND public.live_demo_can_read_session(requested_session_id)
        AND COALESCE(public.live_demo_participant_surface(requested_session_id), '') <> 'viewer'
$$;

REVOKE ALL ON FUNCTION public.archive_live_demo_session(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_live_demo_session(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_live_demo_session(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_live_demo_session(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_live_demo_session(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_live_demo_session(UUID) TO authenticated;

COMMENT ON FUNCTION public.archive_live_demo_session(UUID) IS
    'Archives a live-demo session, closes active seats, preserves dependent evidence, and appends SESSION_CLOSED to the research audit chain.';
COMMENT ON FUNCTION public.delete_live_demo_session(UUID) IS
    'Deprecated rolling-deployment compatibility wrapper. Archives the session; it never deletes session or research evidence.';
COMMENT ON FUNCTION public.live_demo_can_write_session(UUID) IS
    'Allows authenticated writes only while a readable session remains active.';

COMMIT;
