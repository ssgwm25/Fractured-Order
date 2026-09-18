-- GC-04. Apply after GC-02, GC-03 and the September 20/21 conflict fixes.
BEGIN;

CREATE OR REPLACE FUNCTION public.lookup_joinable_session_by_code(requested_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.sessions%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
    IF NULLIF(BTRIM(requested_code), '') IS NULL THEN
        RAISE EXCEPTION 'Session code is required.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO s FROM public.sessions
    WHERE COALESCE(NULLIF(UPPER(BTRIM(session_code)), ''), UPPER(BTRIM(metadata->>'session_code'))) = UPPER(BTRIM(requested_code))
        AND session_classification = 'live_exercise' AND NOT is_protected
    ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at DESC LIMIT 1;
    IF s.id IS NULL THEN RAISE EXCEPTION 'Session not found. Check the code and retry.' USING ERRCODE = 'P0002'; END IF;
    IF s.status <> 'active' THEN RAISE EXCEPTION 'This session is not currently joinable.' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('id', s.id, 'name', s.name, 'status', s.status,
        'session_code', COALESCE(NULLIF(BTRIM(s.session_code), ''), UPPER(BTRIM(s.metadata->>'session_code'))),
        'session_topology_version', s.session_topology_version);
END $$;

-- No requested role/delegation: recovery can only reclaim the authenticated
-- identity's existing seat. GC-03 locking, capacity and tombstones still apply.
CREATE FUNCTION public.restore_session_seat_context(requested_session_id UUID, requested_session_participant_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seat public.session_participants%ROWTYPE; p public.participants%ROWTYPE;
    restored JSONB; s public.sessions%ROWTYPE;
BEGIN
    PERFORM public.green_require_open_session(requested_session_id);
    SELECT * INTO p FROM public.participants WHERE auth_user_id = auth.uid();
    SELECT * INTO seat FROM public.session_participants
        WHERE id = requested_session_participant_id AND session_id = requested_session_id AND participant_id = p.id;
    IF seat.id IS NULL OR seat.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'GC04_INVALID_SESSION_SEAT' USING ERRCODE = '42501';
    END IF;
    IF (SELECT COUNT(*) FROM public.session_participants
        WHERE session_id = requested_session_id AND participant_id = p.id) <> 1 THEN
        RAISE EXCEPTION 'GC04_AMBIGUOUS_SESSION_SEAT' USING ERRCODE = '42501';
    END IF;
    restored := public.claim_session_role_seat(requested_session_id, seat.role, NULL, p.client_id, 90);
    IF restored->>'id' IS DISTINCT FROM seat.id::TEXT THEN
        RAISE EXCEPTION 'GC04_SEAT_CHANGED' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO s FROM public.sessions WHERE id = requested_session_id;
    RETURN jsonb_build_object('seat', restored, 'session', jsonb_build_object(
        'id', s.id, 'name', s.name, 'status', s.status, 'session_code', s.session_code,
        'session_topology_version', s.session_topology_version));
END $$;

REVOKE ALL ON FUNCTION public.lookup_joinable_session_by_code(TEXT),
    public.restore_session_seat_context(UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_joinable_session_by_code(TEXT),
    public.restore_session_seat_context(UUID,UUID) TO authenticated;
COMMIT;
