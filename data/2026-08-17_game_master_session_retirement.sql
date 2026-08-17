BEGIN;

-- "Delete" is an operator-facing retirement state, not a physical row delete.
-- Session and research evidence remain addressable for audit/replay while the
-- retired session leaves both active and archived management lists.
ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.sessions
    DROP CONSTRAINT IF EXISTS sessions_status_check;

ALTER TABLE public.sessions
    ADD CONSTRAINT sessions_status_check
    CHECK (status IN ('active', 'archived', 'deleted'));

ALTER TABLE public.research_audit_event_log
    DROP CONSTRAINT IF EXISTS research_audit_event_log_event_type_chk;

ALTER TABLE public.research_audit_event_log
    ADD CONSTRAINT research_audit_event_log_event_type_chk CHECK (
        event_type IN (
            'SESSION_CREATED','SESSION_CONFIG_UPDATED','SESSION_CLOSED','SESSION_DELETED',
            'GAME_STATE_INITIALIZED','GAME_STATE_UPDATED','MOVE_ADVANCED',
            'SEAT_CLAIMED','SEAT_RELEASED','SEAT_REASSIGNED',
            'OPERATOR_AUTHORIZED','GRANT_ISSUED','GRANT_REVOKED',
            'ACTION_DRAFT_SAVED','ACTION_SUBMITTED','ACTION_ADJUDICATED',
            'PROPOSAL_CREATED','PROPOSAL_SUBMITTED','PROPOSAL_FORWARDED',
            'PROPOSAL_CHANGES_REQUESTED','PROPOSAL_REJECTED',
            'PROPOSAL_ACKNOWLEDGED','PROPOSAL_DECLINED','PROPOSAL_IGNORED','PROPOSAL_RESPONDED',
            'MOVE_RESPONSE_SUBMITTED',
            'RFI_RAISED','RFI_ANSWERED',
            'COMMUNICATION_SENT',
            'NOTE_CREATED','NOTE_EDITED','NOTE_DELETED',
            'PARTICIPANT_DISCONNECTED','PARTICIPANT_RECONNECTED','STALE_SEAT_RELEASED','HEARTBEAT_TIMEOUT'
        )
    );

CREATE OR REPLACE FUNCTION public.prevent_deleted_session_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.status = 'deleted' THEN
        RAISE EXCEPTION 'Deleted sessions are immutable.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_deleted_sessions ON public.sessions;
CREATE TRIGGER protect_deleted_sessions
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_deleted_session_mutation();

CREATE OR REPLACE FUNCTION public.delete_live_demo_session(requested_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    grant_row public.operator_grants%ROWTYPE;
    previous_session public.sessions%ROWTYPE;
    deleted_session public.sessions%ROWTYPE;
BEGIN
    IF current_user_id IS NULL OR NOT public.live_demo_has_operator_grant('gamemaster') THEN
        RAISE EXCEPTION 'Game Master authorization is required.'
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

    IF previous_session.status = 'deleted' THEN
        RETURN jsonb_build_object(
            'deleted_session_id', previous_session.id,
            'status', previous_session.status,
            'already_deleted', true,
            'deleted_at', previous_session.deleted_at
        );
    END IF;

    IF previous_session.status <> 'archived' THEN
        RAISE EXCEPTION 'Archive the session before deleting it.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT og.*
    INTO grant_row
    FROM public.operator_grants og
    WHERE og.auth_user_id = current_user_id
      AND og.surface = 'gamemaster'
    ORDER BY og.granted_at DESC
    LIMIT 1;

    UPDATE public.sessions
    SET status = 'deleted',
        deleted_at = NOW(),
        updated_at = NOW()
    WHERE id = requested_session_id
    RETURNING *
    INTO deleted_session;

    PERFORM public.record_research_event(
        requested_session_id,
        NOW(),
        NULL,
        CONCAT('gamemaster-', LEFT(grant_row.id::TEXT, 8)),
        COALESCE(grant_row.role, grant_row.surface),
        grant_row.team_id,
        NULL,
        'SESSION_DELETED',
        'session',
        requested_session_id,
        NULL,
        NULL,
        NULL,
        NULL,
        jsonb_build_object(
            'id', previous_session.id,
            'status', previous_session.status,
            'updated_at', previous_session.updated_at,
            'deleted_at', previous_session.deleted_at
        ),
        jsonb_build_object(
            'id', deleted_session.id,
            'status', deleted_session.status,
            'updated_at', deleted_session.updated_at,
            'deleted_at', deleted_session.deleted_at
        ),
        jsonb_build_object(
            'delete_method', 'operator_soft_delete',
            'evidence_retained', true
        ),
        NULL
    );

    RETURN jsonb_build_object(
        'deleted_session_id', deleted_session.id,
        'status', deleted_session.status,
        'already_deleted', false,
        'deleted_at', deleted_session.deleted_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_live_demo_session(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_live_demo_session(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_live_demo_session(UUID) TO authenticated;

COMMENT ON COLUMN public.sessions.deleted_at IS
    'Game Master retirement timestamp. Deleted sessions remain stored for audit and research replay.';
COMMENT ON FUNCTION public.prevent_deleted_session_mutation() IS
    'Prevents a deleted session tombstone from being changed or reactivated.';
COMMENT ON FUNCTION public.delete_live_demo_session(UUID) IS
    'Game Master-only soft delete for an archived session. Marks it deleted and appends SESSION_DELETED without removing dependent evidence.';

COMMIT;
