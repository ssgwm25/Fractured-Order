-- GC08 forward-only repair. Apply after September 29; no history backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
    IF to_regprocedure('public.gc03_legacy_remove(uuid,uuid)') IS NULL
        OR to_regprocedure('public.create_configured_live_session(text,text,text,text,text,uuid)') IS NULL
        OR to_regprocedure('public.green_storage_immutable()') IS NULL THEN
        RAISE EXCEPTION 'GC08_REMOVAL_PREREQUISITES_MISSING';
    END IF;
END $$;

-- Evidence, never a live seat or a source of authority. No FK to the removed
-- seat, participant or Auth user: later identity deletion must not erase it.
-- NULL snapshots/topology are retained as NULL, not reconstructed or relabeled.
CREATE TABLE public.gc08_unified_seat_removals (
    seat_id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT,
    participant_id UUID NOT NULL,
    role TEXT NOT NULL,
    delegation_id TEXT,
    session_topology_version INTEGER CHECK (session_topology_version IS NULL OR session_topology_version = 1),
    display_name_snapshot TEXT,
    joined_at TIMESTAMPTZ,
    removed_at TIMESTAMPTZ NOT NULL,
    removed_by_auth_user_id UUID NOT NULL
);
CREATE INDEX gc08_unified_seat_removals_session ON public.gc08_unified_seat_removals(session_id);
ALTER TABLE public.gc08_unified_seat_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gc08_unified_seat_removals FROM PUBLIC, anon, authenticated;
CREATE TRIGGER gc08_unified_seat_removals_immutable BEFORE UPDATE OR DELETE
    ON public.gc08_unified_seat_removals FOR EACH ROW EXECUTE FUNCTION public.green_storage_immutable();
CREATE TRIGGER gc08_unified_seat_removals_no_truncate BEFORE TRUNCATE
    ON public.gc08_unified_seat_removals FOR EACH STATEMENT EXECUTE FUNCTION public.green_storage_immutable();

-- Replace only the private legacy implementation retained by September 19.
-- The public wrapper's open-session lock and regional branch stay unchanged.
-- Keep legacy validation, grant revocation, deletion and response keys. Receipt
-- insertion and removal share one transaction: failure leaves the live seat.
CREATE OR REPLACE FUNCTION public.gc03_legacy_remove(
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
        RAISE EXCEPTION 'Browser identity is required before operator actions.' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('whitecell')) THEN
        RAISE EXCEPTION 'Game Master or White Cell authorization is required.' USING ERRCODE = '42501';
    END IF;
    IF requested_session_id IS NULL OR requested_session_participant_id IS NULL THEN
        RAISE EXCEPTION 'Session and participant seat identifiers are required.' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.sessions s WHERE s.id = requested_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found.' USING ERRCODE = 'P0002';
    END IF;
    SELECT sp.* INTO seat_row FROM public.session_participants sp
        WHERE sp.id = requested_session_participant_id AND sp.session_id = requested_session_id FOR UPDATE;
    IF seat_row.id IS NULL THEN
        RAISE EXCEPTION 'Participant seat not found for this session.' USING ERRCODE = 'P0002';
    END IF;
    SELECT p.* INTO participant_row FROM public.participants p WHERE p.id = seat_row.participant_id;

    INSERT INTO public.gc08_unified_seat_removals (
        seat_id, session_id, participant_id, role, delegation_id, session_topology_version,
        display_name_snapshot, joined_at, removed_at, removed_by_auth_user_id
    ) SELECT seat_row.id, seat_row.session_id, seat_row.participant_id, seat_row.role,
        seat_row.delegation_id, s.session_topology_version, seat_row.display_name_snapshot,
        seat_row.joined_at, removed_at, current_user_id
        FROM public.sessions s WHERE s.id = requested_session_id;

    DELETE FROM public.session_participants sp WHERE sp.id = seat_row.id;
    IF participant_row.auth_user_id IS NOT NULL THEN
        DELETE FROM public.operator_grants og
            WHERE og.auth_user_id = participant_row.auth_user_id
                AND og.surface = 'whitecell' AND og.session_id = requested_session_id;
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
        'display_name', COALESCE(seat_row.display_name_snapshot, participant_row.name, 'Unknown'),
        'client_id', participant_row.client_id,
        'removed_at', removed_at
    );
END;
$$;
REVOKE ALL ON FUNCTION public.gc03_legacy_remove(UUID, UUID) FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.gc08_unified_seat_removals IS
    'Immutable forward-only unified operator-removal receipts; not live seats or authorization. NULL snapshots remain unknown. No backfill.';
COMMENT ON FUNCTION public.gc03_legacy_remove(UUID, UUID) IS
    'Private unified removal compatibility implementation. Atomically retains the original seat-name snapshot before deleting the live seat.';
COMMIT;
