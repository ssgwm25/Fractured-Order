-- Preserve the display name submitted for each session-role seat.
--
-- participants.name is a browser-identity attribute and can change when the
-- same anonymous identity joins another session or role. Evidence and operator
-- rosters must instead render the immutable name captured by the seat.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('session-role-name-snapshots'));

ALTER TABLE public.session_participants
    ADD COLUMN IF NOT EXISTS display_name_snapshot TEXT;

UPDATE public.session_participants sp
SET display_name_snapshot = NULLIF(BTRIM(p.name), '')
FROM public.participants p
WHERE p.id = sp.participant_id
  AND sp.display_name_snapshot IS NULL;

COMMENT ON COLUMN public.session_participants.display_name_snapshot IS
    'Immutable display name captured when this participant first claimed this session-role seat. Historical rosters must prefer this value over mutable participants.name.';

CREATE OR REPLACE FUNCTION public.capture_session_role_display_name_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    resolved_name TEXT;
    should_capture BOOLEAN := false;
BEGIN
    IF TG_OP = 'INSERT' THEN
        should_capture := true;
    ELSIF TG_OP = 'UPDATE' THEN
        should_capture := NEW.participant_id IS DISTINCT FROM OLD.participant_id
            OR NEW.role IS DISTINCT FROM OLD.role
            OR OLD.display_name_snapshot IS NULL;
    END IF;

    IF should_capture THEN
        SELECT NULLIF(BTRIM(p.name), '')
        INTO resolved_name
        FROM public.participants p
        WHERE p.id = NEW.participant_id;

        NEW.display_name_snapshot := COALESCE(
            resolved_name,
            NEW.display_name_snapshot,
            'Unknown'
        );
    ELSIF TG_OP = 'UPDATE'
          AND NEW.display_name_snapshot IS DISTINCT FROM OLD.display_name_snapshot THEN
        RAISE EXCEPTION 'Session-role display-name snapshots are immutable.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_session_role_display_name_snapshot
    ON public.session_participants;
CREATE TRIGGER capture_session_role_display_name_snapshot
    BEFORE INSERT OR UPDATE ON public.session_participants
    FOR EACH ROW
    EXECUTE FUNCTION public.capture_session_role_display_name_snapshot();

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
    IF NOT public.live_demo_can_read_session(requested_session_id) THEN
        RAISE EXCEPTION 'Session access is required.'
            USING ERRCODE = '42501';
    END IF;

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
        COALESCE(sp.display_name_snapshot, p.name, 'Unknown') AS display_name,
        p.client_id
    FROM public.session_participants sp
    INNER JOIN public.participants p
        ON p.id = sp.participant_id
    WHERE sp.session_id = requested_session_id
      AND sp.is_active = true
    ORDER BY sp.joined_at ASC, sp.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_session_role_display_name_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_active_session_participants(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_session_participants(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.capture_session_role_display_name_snapshot() IS
    'Captures and protects the display name associated with a session-role seat.';
COMMENT ON FUNCTION public.list_active_session_participants(UUID, INTEGER) IS
    'Returns active participants using the immutable session-role display-name snapshot after stale seat cleanup.';

COMMIT;
