-- GC-02 storage foundation. Apply after 2026-08-26_session_role_name_snapshots.sql.
-- No roster is approved by this migration. V2 browser operation remains closed
-- until GC-03 replaces the activation guard and installs regional capabilities.
-- Historical rows, revisions, snapshots and role names are not rewritten.
BEGIN;

CREATE TABLE public.green_roster_approvals (
    version TEXT PRIMARY KEY CHECK (version ~ '^green-roster-v[1-9][0-9]*$'),
    snapshot JSONB NOT NULL CHECK (
        jsonb_typeof(snapshot) = 'object'
        AND COALESCE(jsonb_typeof(snapshot -> 'asian_pacific') = 'array', false)
        AND COALESCE(jsonb_typeof(snapshot -> 'europe') = 'array', false)
        AND COALESCE(jsonb_typeof(snapshot -> 'aliases') = 'object', false)
        AND COALESCE(jsonb_typeof(snapshot -> 'source_references') = 'array', false)
    ),
    approved_by TEXT NOT NULL CHECK (BTRIM(approved_by) <> ''),
    approved_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.green_roster_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.green_roster_approvals FROM PUBLIC, anon, authenticated;

ALTER TABLE public.sessions
    ADD COLUMN session_topology_version INTEGER,
    ADD COLUMN topology_frozen_at TIMESTAMPTZ,
    ADD COLUMN green_roster_version TEXT REFERENCES public.green_roster_approvals(version),
    ADD COLUMN green_roster_snapshot JSONB;
-- Defaults affect future inserts only. NULL on old sessions is v1, not a backfill.
ALTER TABLE public.sessions ALTER COLUMN session_topology_version SET DEFAULT 1;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_green_topology_shape CHECK (
    (session_topology_version IS NULL OR session_topology_version IN (1, 2))
    AND (
        (COALESCE(session_topology_version, 1) = 1
            AND green_roster_version IS NULL AND green_roster_snapshot IS NULL)
        OR (session_topology_version = 2
            AND ((green_roster_version IS NULL AND green_roster_snapshot IS NULL)
                OR (green_roster_version IS NOT NULL AND green_roster_snapshot IS NOT NULL)))
    )
);

-- Persistent even if the last seat is disconnected or removed. Locking the
-- session row serializes topology setup against the first seat/artifact write.
CREATE TABLE public.session_topology_locks (
    session_id UUID PRIMARY KEY REFERENCES public.sessions(id) ON DELETE RESTRICT,
    frozen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.session_topology_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_topology_locks FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.green_storage_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    RAISE EXCEPTION 'GC02_IMMUTABLE_EVIDENCE' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER green_roster_approval_immutable BEFORE UPDATE OR DELETE
    ON public.green_roster_approvals FOR EACH ROW EXECUTE FUNCTION public.green_storage_immutable();
CREATE TRIGGER session_topology_lock_immutable BEFORE UPDATE OR DELETE
    ON public.session_topology_locks FOR EACH ROW EXECUTE FUNCTION public.green_storage_immutable();

CREATE FUNCTION public.green_role_delegation(requested_role TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE SET search_path = public AS $$
    SELECT delegation FROM (VALUES
        ('green_asian_pacific_facilitator', 'asian_pacific'),
        ('green_asian_pacific_scribe', 'asian_pacific'),
        ('green_asian_pacific_notetaker', 'asian_pacific'),
        ('green_europe_facilitator', 'europe'),
        ('green_europe_scribe', 'europe'),
        ('green_europe_notetaker', 'europe')
    ) roles(role, delegation) WHERE role = requested_role
$$;

CREATE FUNCTION public.green_storage_is_unified(requested_session_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = requested_session_id
        AND COALESCE(s.session_topology_version, 1) = 1)
$$;

CREATE FUNCTION public.green_storage_operator(requested_session_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT auth.uid() IS NOT NULL AND (
        public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('whitecell', requested_session_id))
$$;

CREATE FUNCTION public.green_session_has_evidence(requested_session_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE item RECORD; found_evidence BOOLEAN;
BEGIN
    FOR item IN SELECT c.table_name FROM information_schema.columns c
        JOIN information_schema.tables t USING (table_schema, table_name)
        WHERE c.table_schema = 'public' AND c.column_name = 'session_id' AND t.table_type = 'BASE TABLE'
            AND c.table_name NOT IN ('operator_grants', 'game_state')
    LOOP
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE session_id = $1)', item.table_name)
            INTO found_evidence USING requested_session_id;
        IF found_evidence THEN RETURN true; END IF;
    END LOOP;
    RETURN false;
END;
$$;

CREATE FUNCTION public.guard_session_green_topology()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE approval public.green_roster_approvals%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.topology_frozen_at IS NOT NULL THEN
        RAISE EXCEPTION 'GC02_SERVER_OWNED_FREEZE' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.topology_frozen_at IS DISTINCT FROM OLD.topology_frozen_at THEN
        IF OLD.topology_frozen_at IS NOT NULL OR NEW.topology_frozen_at IS NULL
            OR NOT EXISTS (SELECT 1 FROM public.session_topology_locks WHERE session_id = OLD.id) THEN
            RAISE EXCEPTION 'GC02_IMMUTABLE_FREEZE' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF TG_OP = 'INSERT' AND NEW.session_topology_version IS NULL THEN
        RAISE EXCEPTION 'GC02_TOPOLOGY_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND ROW(NEW.session_topology_version, NEW.green_roster_version, NEW.green_roster_snapshot)
        IS NOT DISTINCT FROM ROW(OLD.session_topology_version, OLD.green_roster_version, OLD.green_roster_snapshot) THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD.topology_frozen_at IS NOT NULL OR public.green_session_has_evidence(OLD.id)) THEN
        RAISE EXCEPTION 'GC02_TOPOLOGY_FROZEN' USING ERRCODE = '23514';
    END IF;
    IF NEW.session_topology_version IS NULL OR NEW.session_topology_version NOT IN (1, 2) THEN
        RAISE EXCEPTION 'GC02_UNKNOWN_TOPOLOGY' USING ERRCODE = '23514';
    END IF;
    IF NEW.green_roster_version IS NOT NULL THEN
        SELECT * INTO approval FROM public.green_roster_approvals WHERE version = NEW.green_roster_version;
        IF approval.version IS NULL OR NEW.green_roster_snapshot IS DISTINCT FROM (
            approval.snapshot || jsonb_build_object('approved_by', approval.approved_by, 'approved_at', approval.approved_at)
        ) THEN
            RAISE EXCEPTION 'GC02_UNAPPROVED_ROSTER' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_session_green_topology BEFORE INSERT OR UPDATE ON public.sessions
    FOR EACH ROW EXECUTE FUNCTION public.guard_session_green_topology();

-- Separate setup RPC: the old create RPC still creates unified sessions and
-- keeps its signature. Setup cannot manufacture an approval from browser JSON.
CREATE FUNCTION public.configure_session_green_topology(
    requested_session_id UUID, requested_topology_version INTEGER, requested_roster_version TEXT DEFAULT NULL
)
RETURNS public.sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.sessions%ROWTYPE; approval public.green_roster_approvals%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR NOT public.live_demo_has_operator_grant('gamemaster') THEN
        RAISE EXCEPTION 'Game Master authorization is required.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO result FROM public.sessions WHERE id = requested_session_id FOR UPDATE;
    IF result.id IS NULL OR result.status <> 'active' OR result.session_classification <> 'live_exercise'
        OR result.is_protected THEN
        RAISE EXCEPTION 'GC02_SESSION_NOT_CONFIGURABLE' USING ERRCODE = '23514';
    END IF;
    IF requested_roster_version IS NOT NULL THEN
        SELECT * INTO approval FROM public.green_roster_approvals WHERE version = requested_roster_version;
        IF approval.version IS NULL THEN
            RAISE EXCEPTION 'GC02_UNAPPROVED_ROSTER' USING ERRCODE = '23514';
        END IF;
    END IF;
    UPDATE public.sessions SET session_topology_version = requested_topology_version,
        green_roster_version = requested_roster_version,
        green_roster_snapshot = CASE WHEN approval.version IS NOT NULL THEN
            approval.snapshot || jsonb_build_object('approved_by', approval.approved_by, 'approved_at', approval.approved_at)
            ELSE NULL END
    WHERE id = requested_session_id RETURNING * INTO result;
    RETURN result;
END;
$$;

ALTER TABLE public.session_participants ADD COLUMN delegation_id TEXT;
ALTER TABLE public.actions ADD COLUMN delegation_id TEXT;
ALTER TABLE public.requests ADD COLUMN delegation_id TEXT;
ALTER TABLE public.artifact_workflow_reviews ADD COLUMN delegation_id TEXT;
ALTER TABLE public.communications
    ADD COLUMN owner_team TEXT,
    ADD COLUMN delegation_id TEXT,
    ADD COLUMN sender_delegation_id TEXT,
    ADD COLUMN recipient_delegation_id TEXT,
    ADD COLUMN recipient_scope TEXT;
ALTER TABLE public.timeline ADD COLUMN owner_team TEXT, ADD COLUMN delegation_id TEXT;

CREATE FUNCTION public.green_scope_evidence(requested_session_id UUID, requested_team TEXT, requested_delegation TEXT)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object('session_id', s.id, 'session_topology_version', COALESCE(s.session_topology_version, 1),
        'green_roster_version', s.green_roster_version, 'team', requested_team, 'delegation_id', requested_delegation)
    FROM public.sessions s WHERE s.id = requested_session_id
$$;

CREATE FUNCTION public.green_assert_scope(requested_session_id UUID, requested_team TEXT, requested_delegation TEXT)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE topology INTEGER;
BEGIN
    SELECT COALESCE(session_topology_version, 1) INTO topology FROM public.sessions WHERE id = requested_session_id;
    IF topology IS NULL THEN RAISE EXCEPTION 'GC02_SESSION_NOT_FOUND' USING ERRCODE = '23503'; END IF;
    IF topology = 2 AND requested_team = 'green' THEN
        IF requested_delegation IS NULL OR requested_delegation NOT IN ('asian_pacific', 'europe') THEN
            RAISE EXCEPTION 'GC02_GREEN_DELEGATION_REQUIRED' USING ERRCODE = '23514';
        END IF;
    ELSIF requested_delegation IS NOT NULL THEN
        RAISE EXCEPTION 'GC02_UNEXPECTED_DELEGATION' USING ERRCODE = '23514';
    END IF;
END;
$$;

-- This is a storage identity resolver, not a grant of regional capabilities.
-- It reads the active session seat, never participants.role or client metadata.
CREATE FUNCTION public.green_storage_current_seat(requested_session_id UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE WHEN COUNT(*) = 1 THEN (jsonb_agg(to_jsonb(sp)) -> 0) ELSE NULL END
    FROM public.session_participants sp JOIN public.participants p ON p.id = sp.participant_id
    JOIN public.sessions s ON s.id = sp.session_id
    WHERE sp.session_id = requested_session_id AND p.auth_user_id = auth.uid()
        AND sp.is_active IS TRUE AND sp.left_at IS NULL AND sp.disconnected_at IS NULL
        AND COALESCE(sp.heartbeat_at, sp.last_seen, sp.joined_at) >= NOW() - INTERVAL '90 seconds'
        AND s.status = 'active' AND s.session_classification = 'live_exercise' AND NOT s.is_protected
$$;

CREATE FUNCTION public.guard_green_owned_record()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE topology INTEGER; expected_delegation TEXT; seat JSONB;
BEGIN
    SELECT COALESCE(session_topology_version, 1) INTO topology FROM public.sessions WHERE id = NEW.session_id;
    IF TG_TABLE_NAME = 'session_participants' THEN
        expected_delegation := public.green_role_delegation(NEW.role);
        IF topology = 2 AND expected_delegation IS NULL AND NEW.role NOT IN (
            'blue_facilitator', 'blue_scribe', 'blue_notetaker',
            'red_facilitator', 'red_scribe', 'red_notetaker',
            'industry_facilitator', 'industry_scribe', 'industry_notetaker',
            'whitecell_lead', 'whitecell_support', 'viewer',
            'sme_econ', 'sme_ni_escalation', 'sme_diplomacy_information', 'sme_tsj', 'sme_verba') THEN
            RAISE EXCEPTION 'GC02_SEAT_SCOPE_MISMATCH' USING ERRCODE = '23514';
        END IF;
        IF expected_delegation IS NOT NULL THEN
            IF topology <> 2 OR NEW.delegation_id IS DISTINCT FROM expected_delegation THEN
                RAISE EXCEPTION 'GC02_SEAT_SCOPE_MISMATCH' USING ERRCODE = '23514';
            END IF;
        ELSIF NEW.delegation_id IS NOT NULL OR (topology = 2 AND NEW.role LIKE 'green%') THEN
            RAISE EXCEPTION 'GC02_SEAT_SCOPE_MISMATCH' USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'UPDATE' AND (NEW.session_id IS DISTINCT FROM OLD.session_id
            OR NEW.delegation_id IS DISTINCT FROM OLD.delegation_id
            OR (topology = 2 AND ROW(NEW.role, NEW.participant_id) IS DISTINCT FROM ROW(OLD.role, OLD.participant_id))) THEN
            RAISE EXCEPTION 'GC02_IMMUTABLE_OWNERSHIP' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF topology = 2 AND NEW.team NOT IN ('blue', 'red', 'green', 'industry') THEN
            RAISE EXCEPTION 'GC02_NONCANONICAL_TEAM' USING ERRCODE = '23514';
        END IF;
        PERFORM public.green_assert_scope(NEW.session_id, LOWER(BTRIM(NEW.team)), NEW.delegation_id);
        IF TG_OP = 'UPDATE' AND ROW(NEW.session_id, NEW.team, NEW.delegation_id)
            IS DISTINCT FROM ROW(OLD.session_id, OLD.team, OLD.delegation_id) THEN
            RAISE EXCEPTION 'GC02_IMMUTABLE_OWNERSHIP' USING ERRCODE = '23514';
        END IF;
        IF topology = 2 AND TG_TABLE_NAME = 'actions' THEN
            NEW.artifact_payload := NEW.artifact_payload || jsonb_build_object('ownership_scope',
                public.green_scope_evidence(NEW.session_id, NEW.team, NEW.delegation_id));
        END IF;
        IF topology = 2 AND auth.uid() IS NOT NULL AND NOT public.green_storage_operator(NEW.session_id) THEN
            seat := public.green_storage_current_seat(NEW.session_id);
            IF seat IS NULL OR public.green_role_delegation(seat ->> 'role') IS DISTINCT FROM NEW.delegation_id
                OR seat ->> 'delegation_id' IS DISTINCT FROM NEW.delegation_id THEN
                RAISE EXCEPTION 'GC02_SEAT_SCOPE_MISMATCH' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zzz_green_owned_record BEFORE INSERT OR UPDATE ON public.actions
    FOR EACH ROW EXECUTE FUNCTION public.guard_green_owned_record();
CREATE TRIGGER zzz_green_owned_record BEFORE INSERT OR UPDATE ON public.requests
    FOR EACH ROW EXECUTE FUNCTION public.guard_green_owned_record();
CREATE TRIGGER zzz_green_owned_record BEFORE INSERT OR UPDATE ON public.session_participants
    FOR EACH ROW EXECUTE FUNCTION public.guard_green_owned_record();

-- NULL means unified/non-Green. Two partial indexes avoid SQL's NULL-distinct
-- loophole without requiring PostgreSQL 15 NULLS NOT DISTINCT syntax.
CREATE UNIQUE INDEX idx_actions_one_unified_orientation ON public.actions (session_id, team)
    WHERE delegation_id IS NULL AND artifact_type IN ('strategic_orientation_selection', 'strategic_orientation_forecast')
        AND COALESCE(is_deleted, false) = false;
CREATE UNIQUE INDEX idx_actions_one_regional_orientation ON public.actions (session_id, team, delegation_id)
    WHERE delegation_id IS NOT NULL AND artifact_type IN ('strategic_orientation_selection', 'strategic_orientation_forecast')
        AND COALESCE(is_deleted, false) = false;
DROP INDEX public.idx_actions_one_orientation_per_session_team;
CREATE UNIQUE INDEX idx_green_regional_active_seat ON public.session_participants(session_id, role)
    WHERE delegation_id IS NOT NULL AND is_active IS TRUE;

-- V2 notes are physically separate per seat. No team_entries/participant_entries
-- wrapper is accepted; no JSON projection can accidentally return the other seat.
CREATE TABLE public.scoped_notetaker_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT,
    session_participant_id UUID NOT NULL REFERENCES public.session_participants(id) ON DELETE RESTRICT,
    team TEXT NOT NULL CHECK (team IN ('blue', 'red', 'green', 'industry')),
    delegation_id TEXT,
    move INTEGER NOT NULL CHECK (move BETWEEN 1 AND 3),
    phase INTEGER NOT NULL CHECK (phase BETWEEN 1 AND 5),
    dynamics_analysis JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dynamics_analysis) = 'object'),
    external_factors JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(external_factors) = 'object'),
    observation_timeline JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(observation_timeline) = 'array'),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (session_id, session_participant_id, move),
    CHECK (NOT (dynamics_analysis ?| ARRAY['team_entries', 'participant_entries'])
        AND NOT (external_factors ?| ARRAY['team_entries', 'participant_entries']))
);
ALTER TABLE public.scoped_notetaker_data ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scoped_notetaker_data FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scoped_notetaker_data TO authenticated;
CREATE POLICY scoped_notetaker_data_read ON public.scoped_notetaker_data FOR SELECT TO authenticated USING (
    public.green_storage_operator(session_id)
    OR (
        (public.green_storage_current_seat(session_id) ->> 'id') = session_participant_id::TEXT
        AND (public.green_storage_current_seat(session_id) ->> 'role') IN (
            'green_asian_pacific_notetaker', 'green_europe_notetaker',
            'blue_notetaker', 'red_notetaker', 'industry_notetaker')
    )
);

CREATE FUNCTION public.guard_scoped_notetaker_record()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seat public.session_participants%ROWTYPE; expected_team TEXT; entry JSONB;
BEGIN
    SELECT * INTO seat FROM public.session_participants WHERE id = NEW.session_participant_id;
    expected_team := CASE
        WHEN seat.role IN ('green_asian_pacific_notetaker', 'green_europe_notetaker') THEN 'green'
        WHEN seat.role = 'blue_notetaker' THEN 'blue'
        WHEN seat.role = 'red_notetaker' THEN 'red'
        WHEN seat.role = 'industry_notetaker' THEN 'industry' END;
    IF seat.id IS NULL OR seat.session_id IS DISTINCT FROM NEW.session_id OR expected_team IS NULL
        OR NEW.team IS DISTINCT FROM expected_team OR NEW.delegation_id IS DISTINCT FROM seat.delegation_id
        OR public.green_storage_is_unified(NEW.session_id) THEN
        RAISE EXCEPTION 'GC02_NOTE_SEAT_SCOPE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    PERFORM public.green_assert_scope(NEW.session_id, NEW.team, NEW.delegation_id);
    IF TG_OP = 'UPDATE' AND ROW(NEW.session_id, NEW.session_participant_id, NEW.team, NEW.delegation_id, NEW.move)
        IS DISTINCT FROM ROW(OLD.session_id, OLD.session_participant_id, OLD.team, OLD.delegation_id, OLD.move) THEN
        RAISE EXCEPTION 'GC02_IMMUTABLE_OWNERSHIP' USING ERRCODE = '23514';
    END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements(NEW.observation_timeline) LOOP
        IF jsonb_typeof(entry) <> 'object'
            OR (entry ? 'team' AND entry ->> 'team' IS DISTINCT FROM NEW.team)
            OR (entry ? 'delegation_id' AND entry ->> 'delegation_id' IS DISTINCT FROM NEW.delegation_id)
            OR (entry ? 'session_participant_id' AND entry ->> 'session_participant_id' IS DISTINCT FROM NEW.session_participant_id::TEXT)
            OR entry ?| ARRAY['team_entries', 'participant_entries'] THEN
            RAISE EXCEPTION 'GC02_NOTE_ENTRY_SCOPE_MISMATCH' USING ERRCODE = '23514';
        END IF;
    END LOOP;
    NEW.revision := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE OLD.revision + 1 END;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_scoped_notetaker_record BEFORE INSERT OR UPDATE ON public.scoped_notetaker_data
    FOR EACH ROW EXECUTE FUNCTION public.guard_scoped_notetaker_record();

-- The existing review RPC already captures to_jsonb(before/after). Derive the
-- indexed scope from the referenced row and verify both snapshots, atomically.
CREATE FUNCTION public.capture_green_review_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source JSONB; snapshot JSONB;
BEGIN
    IF NEW.artifact_kind = 'rfi' THEN
        SELECT to_jsonb(r) INTO source FROM public.requests r WHERE id = NEW.artifact_id;
    ELSE
        SELECT to_jsonb(a) INTO source FROM public.actions a WHERE id = NEW.artifact_id;
    END IF;
    IF source IS NULL OR source ->> 'session_id' IS DISTINCT FROM NEW.session_id::TEXT
        OR source ->> 'team' IS DISTINCT FROM NEW.team THEN
        RAISE EXCEPTION 'GC02_REVIEW_SOURCE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF NEW.delegation_id IS NOT NULL AND NEW.delegation_id IS DISTINCT FROM source ->> 'delegation_id' THEN
        RAISE EXCEPTION 'GC02_REVIEW_SCOPE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    NEW.delegation_id := source ->> 'delegation_id';
    FOREACH snapshot IN ARRAY ARRAY[NEW.prior_state, NEW.new_state] LOOP
        IF snapshot ->> 'id' IS DISTINCT FROM NEW.artifact_id::TEXT
            OR snapshot ->> 'session_id' IS DISTINCT FROM NEW.session_id::TEXT
            OR snapshot ->> 'team' IS DISTINCT FROM NEW.team
            OR snapshot ->> 'delegation_id' IS DISTINCT FROM NEW.delegation_id THEN
            RAISE EXCEPTION 'GC02_REVIEW_SNAPSHOT_MISMATCH' USING ERRCODE = '23514';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zzz_capture_green_review_scope BEFORE INSERT ON public.artifact_workflow_reviews
    FOR EACH ROW EXECUTE FUNCTION public.capture_green_review_scope();
CREATE TRIGGER green_review_immutable BEFORE UPDATE OR DELETE ON public.artifact_workflow_reviews
    FOR EACH ROW EXECUTE FUNCTION public.green_storage_immutable();

-- Source ownership is distinct from transport sender and current addressee.
-- In a Blue reply, owner_team/delegation still identify the originating Green
-- proposal, sender_delegation is NULL, and recipient_delegation names its owner.
CREATE FUNCTION public.capture_green_communication_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source JSONB; parent public.communications%ROWTYPE; review public.communications%ROWTYPE;
    source_id TEXT; source_team TEXT; source_delegation TEXT; sender_team TEXT;
    sender_delegation TEXT; recipient_team TEXT; recipient_delegation TEXT; audience TEXT;
    is_thread BOOLEAN; key TEXT; evidence JSONB;
BEGIN
    IF public.green_storage_is_unified(NEW.session_id) THEN
        IF NEW.delegation_id IS NOT NULL OR NEW.sender_delegation_id IS NOT NULL OR NEW.recipient_delegation_id IS NOT NULL
            OR NEW.recipient_scope IS NOT NULL OR NEW.owner_team IS NOT NULL THEN
            RAISE EXCEPTION 'GC02_UNEXPECTED_DELEGATION' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'GC02_COMMUNICATION_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    is_thread := NEW.type IN ('PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE', 'PROPOSAL_RESPONSE_REVIEW');
    source_id := NULLIF(NEW.metadata ->> 'source_proposal_id', '');
    IF (source_id IS NOT NULL AND NOT is_thread)
        OR (NEW.linked_request_id IS NOT NULL AND NEW.metadata ? 'source_action_id') THEN
        RAISE EXCEPTION 'GC02_COMMUNICATION_SOURCE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF is_thread THEN
        SELECT to_jsonb(a) INTO source FROM public.actions a
            WHERE a.id::TEXT = source_id AND a.artifact_type = 'proposal' AND NOT COALESCE(a.is_deleted, false);
    ELSIF NEW.linked_request_id IS NOT NULL THEN
        SELECT to_jsonb(r) INTO source FROM public.requests r WHERE id = NEW.linked_request_id;
    ELSIF NULLIF(NEW.metadata ->> 'source_action_id', '') IS NOT NULL THEN
        SELECT to_jsonb(a) INTO source FROM public.actions a WHERE id::TEXT = NEW.metadata ->> 'source_action_id';
    END IF;
    IF (is_thread OR NEW.linked_request_id IS NOT NULL OR NEW.metadata ? 'source_action_id')
        AND (source IS NULL OR source ->> 'session_id' IS DISTINCT FROM NEW.session_id::TEXT) THEN
        RAISE EXCEPTION 'GC02_COMMUNICATION_SOURCE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF NEW.metadata ? 'linked_request_id' AND NEW.metadata ->> 'linked_request_id' IS DISTINCT FROM NEW.linked_request_id::TEXT THEN
        RAISE EXCEPTION 'GC02_COMMUNICATION_SOURCE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF is_thread AND (NEW.linked_request_id IS NOT NULL OR NEW.metadata ? 'source_action_id') THEN
        RAISE EXCEPTION 'GC02_COMMUNICATION_SOURCE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    source_team := source ->> 'team';
    source_delegation := source ->> 'delegation_id';
    IF NEW.metadata ? 'source_communication_id' THEN
        SELECT * INTO parent FROM public.communications WHERE id::TEXT = NEW.metadata ->> 'source_communication_id';
        IF parent.id IS NULL OR parent.session_id IS DISTINCT FROM NEW.session_id
            OR parent.metadata ->> 'source_proposal_id' IS DISTINCT FROM source_id THEN
            RAISE EXCEPTION 'GC02_COMMUNICATION_SOURCE_MISMATCH' USING ERRCODE = '23514';
        END IF;
    END IF;
    sender_delegation := public.green_role_delegation(NEW.from_role);
    sender_team := CASE WHEN sender_delegation IS NOT NULL THEN 'green'
        WHEN NEW.from_role IN ('white_cell', 'whitecell', 'whitecell_lead', 'whitecell_support') THEN 'white_cell'
        WHEN NEW.from_role ~ '^(blue|red|industry)_(facilitator|scribe|notetaker)$' THEN split_part(NEW.from_role, '_', 1)
        END;
    IF sender_team IS NULL THEN RAISE EXCEPTION 'GC02_AMBIGUOUS_SENDER' USING ERRCODE = '23514'; END IF;

    IF is_thread THEN
        IF NEW.metadata ->> 'source_team' IS DISTINCT FROM source_team
            OR COALESCE(NEW.metadata ->> 'recipient_team', '') NOT IN ('blue', 'red')
            OR NULLIF(NEW.metadata ->> 'thread_id', '') IS NULL
            OR NULLIF(NEW.metadata ->> 'source_revision', '') IS NULL THEN
            RAISE EXCEPTION 'GC02_THREAD_SOURCE_MISMATCH' USING ERRCODE = '23514';
        END IF;
        IF NEW.type = 'PROPOSAL_FORWARDED' THEN
            IF (NEW.metadata ->> 'source_revision')::BIGINT IS DISTINCT FROM (source ->> 'revision_number')::BIGINT
                OR (NEW.metadata ->> 'round_number')::INTEGER IS DISTINCT FROM 0
                OR NULLIF(NEW.metadata ->> 'parent_message_id', '') IS NOT NULL
                OR sender_team <> 'white_cell' OR NEW.to_role IS DISTINCT FROM NEW.metadata ->> 'recipient_team' THEN
                RAISE EXCEPTION 'GC02_THREAD_ROOT_MISMATCH' USING ERRCODE = '23514';
            END IF;
        ELSE
            SELECT * INTO parent FROM public.communications WHERE id::TEXT = NEW.metadata ->> 'parent_message_id';
            IF parent.id IS NULL OR parent.session_id IS DISTINCT FROM NEW.session_id
                OR parent.type NOT IN ('PROPOSAL_FORWARDED', 'PROPOSAL_RESPONSE')
                OR parent.delegation_id IS DISTINCT FROM source_delegation THEN
                RAISE EXCEPTION 'GC02_THREAD_PARENT_MISMATCH' USING ERRCODE = '23514';
            END IF;
            FOREACH key IN ARRAY ARRAY['thread_id', 'recipient_team', 'source_proposal_id', 'source_revision'] LOOP
                IF NEW.metadata ->> key IS DISTINCT FROM parent.metadata ->> key THEN
                    RAISE EXCEPTION 'GC02_THREAD_PARENT_MISMATCH' USING ERRCODE = '23514';
                END IF;
            END LOOP;
            IF (NEW.metadata ->> 'round_number')::INTEGER IS DISTINCT FROM (parent.metadata ->> 'round_number')::INTEGER + 1
                OR sender_team NOT IN (source_team, NEW.metadata ->> 'recipient_team')
                OR (sender_team = 'green' AND sender_delegation IS DISTINCT FROM source_delegation) THEN
                RAISE EXCEPTION 'GC02_THREAD_SENDER_MISMATCH' USING ERRCODE = '23514';
            END IF;
            IF NEW.type = 'PROPOSAL_RESPONSE' THEN
                SELECT * INTO review FROM public.communications WHERE id::TEXT = NEW.metadata ->> 'review_request_id';
                IF review.id IS NULL OR review.session_id IS DISTINCT FROM NEW.session_id
                    OR review.type <> 'PROPOSAL_RESPONSE_REVIEW' OR review.content IS DISTINCT FROM NEW.content
                    OR review.from_role IS DISTINCT FROM NEW.from_role THEN
                    RAISE EXCEPTION 'GC02_THREAD_REVIEW_MISMATCH' USING ERRCODE = '23514';
                END IF;
                FOREACH key IN ARRAY ARRAY['thread_id', 'recipient_team', 'source_proposal_id', 'source_revision', 'parent_message_id'] LOOP
                    IF NEW.metadata ->> key IS DISTINCT FROM review.metadata ->> key THEN
                        RAISE EXCEPTION 'GC02_THREAD_REVIEW_MISMATCH' USING ERRCODE = '23514';
                    END IF;
                END LOOP;
            END IF;
        END IF;
    END IF;

    recipient_delegation := public.green_role_delegation(NEW.to_role);
    recipient_team := CASE WHEN recipient_delegation IS NOT NULL THEN 'green'
        WHEN NEW.to_role IN ('white_cell', 'all', 'blue', 'red', 'industry', 'green') THEN NEW.to_role
        WHEN NEW.to_role ~ '^(blue|red|industry)_(facilitator|scribe|notetaker)$' THEN split_part(NEW.to_role, '_', 1) END;
    IF recipient_team IS NULL THEN RAISE EXCEPTION 'GC02_AMBIGUOUS_RECIPIENT' USING ERRCODE = '23514'; END IF;
    IF recipient_team = 'green' AND recipient_delegation IS NULL THEN
        IF source_team = 'green' AND (is_thread OR NEW.linked_request_id IS NOT NULL) THEN
            recipient_delegation := source_delegation;
        ELSE
            recipient_delegation := NEW.recipient_delegation_id;
        END IF;
        audience := COALESCE(NEW.recipient_scope,
            CASE WHEN recipient_delegation IS NOT NULL THEN 'delegation' END);
        IF audience = 'both_green_delegations' THEN
            IF recipient_delegation IS NOT NULL OR sender_team <> 'white_cell' OR is_thread OR NEW.linked_request_id IS NOT NULL THEN
                RAISE EXCEPTION 'GC02_AUDIENCE_CONFLICT' USING ERRCODE = '23514';
            END IF;
        ELSIF audience IS DISTINCT FROM 'delegation' OR recipient_delegation IS NULL THEN
            RAISE EXCEPTION 'GC02_AMBIGUOUS_GREEN_RECIPIENT' USING ERRCODE = '23514';
        END IF;
    ELSE
        audience := CASE WHEN NEW.to_role = 'all' THEN 'session'
            WHEN NEW.to_role = recipient_team THEN 'team' ELSE 'role' END;
    END IF;
    IF audience <> 'both_green_delegations' THEN
        PERFORM public.green_assert_scope(NEW.session_id, recipient_team, recipient_delegation);
    END IF;
    -- Parenthesize SQL CASE expressions inside PL/pgSQL IF conditions so their
    -- inner THEN tokens cannot terminate the outer condition during parsing.
    IF NEW.recipient_scope IS NOT NULL AND NEW.recipient_scope IS DISTINCT FROM audience
        OR NEW.sender_delegation_id IS NOT NULL AND NEW.sender_delegation_id IS DISTINCT FROM sender_delegation
        OR NEW.recipient_delegation_id IS NOT NULL AND NEW.recipient_delegation_id IS DISTINCT FROM recipient_delegation
        OR NEW.delegation_id IS NOT NULL AND NEW.delegation_id IS DISTINCT FROM
            (CASE WHEN source IS NOT NULL THEN source_delegation ELSE sender_delegation END)
        OR NEW.owner_team IS NOT NULL AND NEW.owner_team IS DISTINCT FROM COALESCE(source_team, sender_team) THEN
        RAISE EXCEPTION 'GC02_COMMUNICATION_SCOPE_CONFLICT' USING ERRCODE = '23514';
    END IF;
    -- White Cell pending review stays addressed to White Cell. Thread partner
    -- metadata is not the current message audience and cannot broaden it.
    IF NEW.type = 'PROPOSAL_RESPONSE_REVIEW' AND NEW.to_role <> 'white_cell' THEN
        RAISE EXCEPTION 'GC02_REVIEW_AUDIENCE_CONFLICT' USING ERRCODE = '23514';
    END IF;
    IF is_thread AND NEW.type = 'PROPOSAL_RESPONSE' AND recipient_team IS DISTINCT FROM
        (CASE WHEN sender_team = source_team THEN NEW.metadata ->> 'recipient_team' ELSE source_team END) THEN
        RAISE EXCEPTION 'GC02_THREAD_AUDIENCE_CONFLICT' USING ERRCODE = '23514';
    END IF;
    NEW.owner_team := COALESCE(source_team, sender_team);
    NEW.delegation_id := CASE WHEN source IS NOT NULL THEN source_delegation ELSE sender_delegation END;
    NEW.sender_delegation_id := sender_delegation;
    NEW.recipient_delegation_id := recipient_delegation;
    NEW.recipient_scope := audience;
    evidence := public.green_scope_evidence(NEW.session_id, NEW.owner_team, NEW.delegation_id);
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
        'ownership_scope', evidence, 'sender_delegation_id', sender_delegation,
        'recipient_delegation_id', recipient_delegation, 'recipient_scope', audience);
    IF NEW.type = 'PROPOSAL_FORWARDED' THEN
        NEW.metadata := jsonb_set(NEW.metadata, '{proposal}', NEW.metadata -> 'proposal'
            || jsonb_build_object('ownership_scope', evidence));
    END IF;
    RETURN NEW;
END;
$$;
-- After communications_prepare_proposal_workflow: pending responses have
-- already been redirected to White Cell and snapshots already redacted.
CREATE TRIGGER zzz_capture_green_communication_scope BEFORE INSERT OR UPDATE ON public.communications
    FOR EACH ROW EXECUTE FUNCTION public.capture_green_communication_scope();

CREATE FUNCTION public.capture_green_timeline_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source JSONB; related TEXT; message public.communications%ROWTYPE; root public.communications%ROWTYPE;
BEGIN
    IF public.green_storage_is_unified(NEW.session_id) THEN
        IF NEW.delegation_id IS NOT NULL OR NEW.owner_team IS NOT NULL THEN
            RAISE EXCEPTION 'GC02_UNEXPECTED_DELEGATION' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    related := NULLIF(NEW.metadata ->> 'related_id', '');
    IF related IS NOT NULL THEN
        SELECT to_jsonb(a) INTO source FROM public.actions a WHERE id::TEXT = related;
        IF source IS NULL THEN SELECT to_jsonb(r) INTO source FROM public.requests r WHERE id::TEXT = related; END IF;
        IF source IS NULL OR source ->> 'session_id' IS DISTINCT FROM NEW.session_id::TEXT THEN
            RAISE EXCEPTION 'GC02_TIMELINE_SOURCE_MISMATCH' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.metadata ? 'communication_id' THEN
        SELECT * INTO message FROM public.communications WHERE id::TEXT = NEW.metadata ->> 'communication_id';
        IF message.id IS NULL OR message.session_id IS DISTINCT FROM NEW.session_id
            OR (related IS NOT NULL AND message.metadata ->> 'source_proposal_id' IS DISTINCT FROM related) THEN
            RAISE EXCEPTION 'GC02_TIMELINE_COMMUNICATION_MISMATCH' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.metadata ? 'thread_id' THEN
        SELECT * INTO root FROM public.communications c WHERE c.type = 'PROPOSAL_FORWARDED'
            AND c.session_id = NEW.session_id AND c.metadata ->> 'thread_id' = NEW.metadata ->> 'thread_id'
            AND c.metadata ->> 'source_proposal_id' = related
            AND c.metadata ->> 'recipient_team' = NEW.metadata ->> 'recipient_team';
        IF root.id IS NULL OR root.delegation_id IS DISTINCT FROM source ->> 'delegation_id' THEN
            RAISE EXCEPTION 'GC02_TIMELINE_THREAD_MISMATCH' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.metadata ? 'review_request_id' AND NOT EXISTS (
        SELECT 1 FROM public.communications c WHERE c.id::TEXT = NEW.metadata ->> 'review_request_id'
            AND c.session_id = NEW.session_id AND c.type = 'PROPOSAL_RESPONSE_REVIEW'
            AND c.metadata ->> 'source_proposal_id' = related
            AND c.metadata ->> 'thread_id' = NEW.metadata ->> 'thread_id'
    ) THEN
        RAISE EXCEPTION 'GC02_TIMELINE_REVIEW_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF source IS NOT NULL THEN
        IF NEW.delegation_id IS NOT NULL AND NEW.delegation_id IS DISTINCT FROM source ->> 'delegation_id'
            OR NEW.owner_team IS NOT NULL AND NEW.owner_team IS DISTINCT FROM source ->> 'team' THEN
            RAISE EXCEPTION 'GC02_TIMELINE_SCOPE_MISMATCH' USING ERRCODE = '23514';
        END IF;
        NEW.owner_team := source ->> 'team';
        NEW.delegation_id := source ->> 'delegation_id';
    ELSIF message.id IS NOT NULL THEN
        IF NEW.delegation_id IS NOT NULL AND NEW.delegation_id IS DISTINCT FROM message.delegation_id
            OR NEW.owner_team IS NOT NULL AND NEW.owner_team IS DISTINCT FROM message.owner_team THEN
            RAISE EXCEPTION 'GC02_TIMELINE_SCOPE_MISMATCH' USING ERRCODE = '23514';
        END IF;
        NEW.owner_team := message.owner_team;
        NEW.delegation_id := message.delegation_id;
    ELSE
        IF NEW.owner_team IS NOT NULL AND NEW.owner_team IS DISTINCT FROM NEW.team THEN
            RAISE EXCEPTION 'GC02_TIMELINE_SCOPE_MISMATCH' USING ERRCODE = '23514';
        END IF;
        NEW.owner_team := NEW.team;
    END IF;
    PERFORM public.green_assert_scope(NEW.session_id, NEW.owner_team, NEW.delegation_id);
    IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'GC02_TIMELINE_IMMUTABLE' USING ERRCODE = '23514'; END IF;
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('ownership_scope',
        public.green_scope_evidence(NEW.session_id, NEW.owner_team, NEW.delegation_id));
    RETURN NEW;
END;
$$;
CREATE TRIGGER zzz_capture_green_timeline_scope BEFORE INSERT OR UPDATE ON public.timeline
    FOR EACH ROW EXECUTE FUNCTION public.capture_green_timeline_scope();

CREATE FUNCTION public.guard_green_evidence_links()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source public.actions%ROWTYPE; target public.actions%ROWTYPE; request public.requests%ROWTYPE;
BEGIN
    IF TG_TABLE_NAME = 'action_relationships' THEN
        SELECT * INTO source FROM public.actions WHERE id = NEW.source_action_id;
        SELECT * INTO target FROM public.actions WHERE id = NEW.target_action_id;
        IF NEW.target_action_id IS NOT NULL AND (target.id IS NULL OR target.session_id IS DISTINCT FROM NEW.session_id) THEN
            RAISE EXCEPTION 'GC02_LINK_SESSION_MISMATCH' USING ERRCODE = '23514';
        END IF;
        IF NOT public.green_storage_is_unified(NEW.session_id) AND source.team = 'green' AND target.team = 'green'
            AND source.delegation_id IS DISTINCT FROM target.delegation_id THEN
            RAISE EXCEPTION 'GC02_LINK_SCOPE_MISMATCH' USING ERRCODE = '23514';
        END IF;
    ELSE
        SELECT * INTO source FROM public.actions WHERE id = NEW.action_id;
        IF TG_TABLE_NAME = 'rfi_action_links' THEN
            SELECT * INTO request FROM public.requests WHERE id = NEW.request_id;
            IF request.id IS NULL OR request.session_id IS DISTINCT FROM NEW.session_id THEN
                RAISE EXCEPTION 'GC02_LINK_SESSION_MISMATCH' USING ERRCODE = '23514';
            END IF;
            IF NOT public.green_storage_is_unified(NEW.session_id)
                AND ROW(source.team, source.delegation_id) IS DISTINCT FROM ROW(request.team, request.delegation_id) THEN
                RAISE EXCEPTION 'GC02_LINK_SCOPE_MISMATCH' USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;
    IF source.id IS NULL OR source.session_id IS DISTINCT FROM NEW.session_id THEN
        RAISE EXCEPTION 'GC02_LINK_SESSION_MISMATCH' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zzz_green_evidence_links BEFORE INSERT OR UPDATE ON public.action_logs
    FOR EACH ROW EXECUTE FUNCTION public.guard_green_evidence_links();
CREATE TRIGGER zzz_green_evidence_links BEFORE INSERT OR UPDATE ON public.action_relationships
    FOR EACH ROW EXECUTE FUNCTION public.guard_green_evidence_links();
CREATE TRIGGER zzz_green_evidence_links BEFORE INSERT OR UPDATE ON public.rfi_action_links
    FOR EACH ROW EXECUTE FUNCTION public.guard_green_evidence_links();

-- GC-03 must replace this explicit closure with reviewed capabilities. Checking
-- auth.uid(), rather than current_user, also closes SECURITY DEFINER RPC writes.
CREATE FUNCTION public.guard_green_storage_activation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.sessions%ROWTYPE; sid UUID;
BEGIN
    sid := CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
    SELECT * INTO s FROM public.sessions WHERE id = sid FOR UPDATE;
    IF s.id IS NULL THEN RAISE EXCEPTION 'GC02_SESSION_NOT_FOUND' USING ERRCODE = '23503'; END IF;
    IF s.session_topology_version = 2 THEN
        IF TG_TABLE_NAME = 'notetaker_data' THEN
            RAISE EXCEPTION 'GC02_SHARED_NOTES_FORBIDDEN' USING ERRCODE = '23514';
        END IF;
        IF auth.uid() IS NOT NULL OR current_setting('role', true) IN ('anon', 'authenticated') THEN
            RAISE EXCEPTION 'GC02_REGIONAL_ACTIVATION_PENDING_GC03' USING ERRCODE = '42501';
        END IF;
        IF s.green_roster_version IS NULL OR s.green_roster_snapshot IS NULL THEN
            RAISE EXCEPTION 'GC02_APPROVED_ROSTER_REQUIRED' USING ERRCODE = '23514';
        END IF;
        IF s.status <> 'active' OR s.session_classification <> 'live_exercise' OR s.is_protected THEN
            RAISE EXCEPTION 'GC02_SESSION_CLOSED' USING ERRCODE = '42501';
        END IF;
    END IF;
    IF TG_OP = 'INSERT' AND TG_TABLE_NAME <> 'game_state' THEN
        INSERT INTO public.session_topology_locks(session_id) VALUES (sid) ON CONFLICT DO NOTHING;
        -- A real session-row update also makes concurrent UPDATE statements
        -- recheck the freeze after waiting for this transaction's row lock.
        -- Legacy retirement can append its first audit event after marking the
        -- session deleted. Preserve that immutable tombstone; the lock marker
        -- still records the freeze without updating deleted/protected history.
        UPDATE public.sessions SET topology_frozen_at = clock_timestamp()
            WHERE id = sid AND topology_frozen_at IS NULL
                AND status <> 'deleted' AND NOT is_protected;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.session_id IS DISTINCT FROM OLD.session_id THEN
        RAISE EXCEPTION 'GC02_IMMUTABLE_SESSION' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

-- Explicit repository-owned session tables, including research copies. Missing
-- prerequisites abort instead of silently omitting a boundary. Do not attach
-- triggers to unrelated public tables merely because they have a session_id.
-- This closes permissive-policy OR paths; it grants no additional v1 powers.
DO $$ DECLARE item RECORD; BEGIN
    FOR item IN SELECT unnest(ARRAY[
        'game_state', 'session_participants', 'actions', 'requests', 'communications', 'timeline',
        'notetaker_data', 'artifact_workflow_reviews', 'action_logs', 'reports', 'move_completions',
        'game_state_transitions', 'participant_activity', 'data_completeness_checks',
        'action_relationships', 'rfi_action_links', 'pli_adjudications', 'sme_handoffs', 'sme_pli_packets',
        'research_audit_event_log', 'research_participant', 'research_note', 'research_draft_revision',
        'research_state_transition', 'research_action_content', 'research_proposal_content',
        'research_adjudication_content', 'research_move_response_content', 'research_rfi_content',
        'research_interaction_edge', 'research_data_quality_event', 'research_derived_participant_metrics',
        'research_derived_session_metrics', 'research_identity_map'
    ]) AS table_name
    LOOP
        EXECUTE format('CREATE TRIGGER aa_green_storage_activation BEFORE INSERT OR UPDATE OR DELETE ON public.%I
            FOR EACH ROW EXECUTE FUNCTION public.guard_green_storage_activation()', item.table_name);
        EXECUTE format('CREATE POLICY green_storage_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
            USING (public.green_storage_is_unified(session_id) OR public.green_storage_operator(session_id))
            WITH CHECK (public.green_storage_is_unified(session_id))', item.table_name);
    END LOOP;
END $$;
CREATE TRIGGER aa_green_storage_activation BEFORE INSERT OR UPDATE OR DELETE ON public.scoped_notetaker_data
    FOR EACH ROW EXECUTE FUNCTION public.guard_green_storage_activation();

-- The legacy append RPC can return a committed retry before any write trigger
-- runs. Close that SECURITY DEFINER read path as well as inserts. Retain the
-- exact prior implementation privately, including White Cell preparation.
ALTER FUNCTION public.append_proposal_thread_message(UUID, TEXT, TEXT, TEXT, TEXT)
    RENAME TO gc02_unified_append_proposal_thread_message;
REVOKE ALL ON FUNCTION public.gc02_unified_append_proposal_thread_message(UUID, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.append_proposal_thread_message(
    requested_parent_message_id UUID, requested_content TEXT, requested_message_type TEXT,
    requested_facilitator_decision TEXT DEFAULT NULL, requested_client_message_id TEXT DEFAULT NULL
)
RETURNS public.communications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid UUID;
BEGIN
    SELECT session_id INTO sid FROM public.communications WHERE id = requested_parent_message_id;
    IF sid IS NOT NULL AND NOT public.green_storage_is_unified(sid) THEN
        RAISE EXCEPTION 'GC02_REGIONAL_ACTIVATION_PENDING_GC03' USING ERRCODE = '42501';
    END IF;
    RETURN public.gc02_unified_append_proposal_thread_message(requested_parent_message_id,
        requested_content, requested_message_type, requested_facilitator_decision, requested_client_message_id);
END;
$$;

-- Exposed for the later regional UI. The activation trigger still rejects v2
-- writes in this migration, including writes inside this SECURITY DEFINER RPC.
CREATE FUNCTION public.save_scoped_notetaker_data(
    requested_session_id UUID, requested_move INTEGER, requested_phase INTEGER,
    requested_dynamics JSONB, requested_external JSONB, requested_observations JSONB,
    requested_expected_revision BIGINT
)
RETURNS public.scoped_notetaker_data LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seat JSONB; existing public.scoped_notetaker_data%ROWTYPE; result public.scoped_notetaker_data%ROWTYPE;
    team TEXT; seat_id UUID;
BEGIN
    seat := public.green_storage_current_seat(requested_session_id);
    team := CASE seat ->> 'role'
        WHEN 'green_asian_pacific_notetaker' THEN 'green'
        WHEN 'green_europe_notetaker' THEN 'green'
        WHEN 'blue_notetaker' THEN 'blue'
        WHEN 'red_notetaker' THEN 'red'
        WHEN 'industry_notetaker' THEN 'industry' END;
    IF seat IS NULL OR team IS NULL OR public.green_storage_is_unified(requested_session_id) THEN
        RAISE EXCEPTION 'GC02_ACTIVE_NOTETAKER_SEAT_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF requested_expected_revision IS NULL OR requested_expected_revision < 0 THEN
        RAISE EXCEPTION 'GC02_NOTE_REVISION_REQUIRED' USING ERRCODE = '22023';
    END IF;
    seat_id := (seat ->> 'id')::UUID;
    -- Match the global freeze-lock order before taking the per-note lock.
    PERFORM 1 FROM public.sessions WHERE id = requested_session_id FOR UPDATE;
    PERFORM pg_advisory_xact_lock(hashtextextended(requested_session_id::TEXT || ':' || seat_id::TEXT || ':' || requested_move::TEXT, 0));
    SELECT * INTO existing FROM public.scoped_notetaker_data
        WHERE session_id = requested_session_id AND session_participant_id = seat_id AND move = requested_move FOR UPDATE;
    IF COALESCE(existing.revision, 0) <> requested_expected_revision THEN
        RAISE EXCEPTION 'GC02_NOTE_REVISION_CONFLICT' USING ERRCODE = '40001';
    END IF;
    IF existing.id IS NULL THEN
        INSERT INTO public.scoped_notetaker_data(session_id, session_participant_id, team, delegation_id,
            move, phase, dynamics_analysis, external_factors, observation_timeline)
        VALUES (requested_session_id, seat_id, team, seat ->> 'delegation_id', requested_move, requested_phase,
            requested_dynamics, requested_external, requested_observations) RETURNING * INTO result;
    ELSE
        UPDATE public.scoped_notetaker_data SET phase = requested_phase, dynamics_analysis = requested_dynamics,
            external_factors = requested_external, observation_timeline = requested_observations
        WHERE id = existing.id RETURNING * INTO result;
    END IF;
    RETURN result;
END;
$$;

-- Raw preservation export, not the GC-11 publication schema. Single-statement
-- snapshot; no fallback-to-empty on errors and no reconstruction of chronology.
CREATE FUNCTION public.export_green_storage_evidence(requested_session_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
    IF NOT public.green_storage_operator(requested_session_id) THEN
        RAISE EXCEPTION 'Session operator authorization is required.' USING ERRCODE = '42501';
    END IF;
    SELECT jsonb_build_object(
        'storage_evidence_version', 'gc02-1', 'session', to_jsonb(s),
        'participants', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.session_participants p WHERE p.session_id = s.id), '[]'::jsonb),
        'actions', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.actions a WHERE a.session_id = s.id), '[]'::jsonb),
        'requests', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.requests r WHERE r.session_id = s.id), '[]'::jsonb),
        'reviews', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.reviewed_at, r.id) FROM public.artifact_workflow_reviews r WHERE r.session_id = s.id), '[]'::jsonb),
        'communications', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at, c.id) FROM public.communications c WHERE c.session_id = s.id), '[]'::jsonb),
        'timeline', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at, t.id) FROM public.timeline t WHERE t.session_id = s.id), '[]'::jsonb),
        'scoped_notetaker_data', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.move, n.id) FROM public.scoped_notetaker_data n WHERE n.session_id = s.id), '[]'::jsonb),
        'action_relationships', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.action_relationships l WHERE l.session_id = s.id), '[]'::jsonb),
        'rfi_action_links', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.rfi_action_links l WHERE l.session_id = s.id), '[]'::jsonb),
        'action_logs', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at, l.id) FROM public.action_logs l WHERE l.session_id = s.id), '[]'::jsonb),
        'research_audit_event_log', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.event_id) FROM public.research_audit_event_log e WHERE e.session_id = s.id), '[]'::jsonb)
    ) INTO result FROM public.sessions s WHERE s.id = requested_session_id AND s.session_topology_version = 2
        AND s.session_classification = 'live_exercise' AND NOT s.is_protected;
    IF result IS NULL THEN RAISE EXCEPTION 'GC02_REGIONAL_SESSION_REQUIRED' USING ERRCODE = '22023'; END IF;
    RETURN result;
END;
$$;

COMMENT ON COLUMN public.sessions.session_topology_version IS
    'NULL is historical unified; 1 is explicit unified; 2 is regional Green. GC-02 does not activate v2 browser operations.';
COMMENT ON TABLE public.green_roster_approvals IS
    'Append-only exercise-owner approvals recorded by a database administrator. No production approval is seeded by GC-02.';
COMMENT ON TABLE public.scoped_notetaker_data IS
    'V2 seat-owned notes; physically isolated rows. Legacy shared JSON remains in notetaker_data and is forbidden for v2.';

-- Function privileges are explicit. Internal trigger helpers are not RPCs.
REVOKE ALL ON FUNCTION public.green_storage_immutable(), public.guard_session_green_topology(),
    public.guard_green_owned_record(), public.guard_scoped_notetaker_record(),
    public.guard_green_storage_activation(), public.green_assert_scope(UUID, TEXT, TEXT),
    public.green_scope_evidence(UUID, TEXT, TEXT), public.green_session_has_evidence(UUID), public.capture_green_review_scope(),
    public.capture_green_communication_scope(), public.capture_green_timeline_scope(), public.guard_green_evidence_links()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.green_role_delegation(TEXT), public.green_storage_is_unified(UUID),
    public.green_storage_operator(UUID), public.green_storage_current_seat(UUID),
    public.configure_session_green_topology(UUID, INTEGER, TEXT),
    public.save_scoped_notetaker_data(UUID, INTEGER, INTEGER, JSONB, JSONB, JSONB, BIGINT),
    public.export_green_storage_evidence(UUID),
    public.append_proposal_thread_message(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.green_role_delegation(TEXT), public.green_storage_is_unified(UUID),
    public.green_storage_operator(UUID), public.green_storage_current_seat(UUID),
    public.configure_session_green_topology(UUID, INTEGER, TEXT),
    public.save_scoped_notetaker_data(UUID, INTEGER, INTEGER, JSONB, JSONB, JSONB, BIGINT),
    public.export_green_storage_evidence(UUID),
    public.append_proposal_thread_message(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
