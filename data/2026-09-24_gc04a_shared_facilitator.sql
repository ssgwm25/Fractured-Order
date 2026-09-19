-- GC-04A. Apply once after 2026-09-23_gc04_legacy_session_topology.sql.
-- Also requires GC-03 September 20/21 repairs. No historical rows are updated.
-- Topology 2 still means two artifact owners. The independent, versioned seat
-- model changes staffing only; a shared seat never owns a third delegation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.sessions ADD COLUMN green_seat_model TEXT;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_green_seat_model_shape CHECK (
    green_seat_model IS NULL OR
    (green_seat_model = 'shared_facilitator_v1' AND session_topology_version IS NOT NULL
        AND session_topology_version = 2 AND green_roster_version IS NOT NULL
        AND green_roster_snapshot IS NOT NULL)
);

CREATE FUNCTION public.green_session_seat_model(sid UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(green_seat_model, CASE WHEN session_topology_version=2
        THEN 'regional_pairs_v1' ELSE 'unified_v1' END) FROM public.sessions WHERE id=sid
$$;

CREATE FUNCTION public.green_seat_model_allows_role(sid UUID, requested_role TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(CASE
        WHEN requested_role='green_shared_facilitator'
            THEN public.green_session_seat_model(sid)='shared_facilitator_v1'
        WHEN public.green_session_seat_model(sid)='shared_facilitator_v1'
            AND requested_role IN ('green_asian_pacific_facilitator','green_europe_facilitator') THEN false
        ELSE true END, false)
$$;

CREATE FUNCTION public.guard_green_seat_model()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP='UPDATE' AND NEW.green_seat_model IS NOT DISTINCT FROM OLD.green_seat_model THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND (OLD.topology_frozen_at IS NOT NULL OR public.green_session_has_evidence(OLD.id)) THEN
        RAISE EXCEPTION 'GC04A_SEAT_MODEL_FROZEN' USING ERRCODE='23514';
    END IF;
    -- Owner-only synthetic fixtures may set it; every browser requires GM.
    IF NEW.green_seat_model IS NOT NULL OR TG_OP='UPDATE' THEN
        IF (auth.uid() IS NOT NULL OR current_setting('role',true) IN ('anon','authenticated'))
            AND (auth.uid() IS NULL OR NOT public.live_demo_has_operator_grant('gamemaster')) THEN
            RAISE EXCEPTION 'Game Master authorization is required.' USING ERRCODE='42501';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER guard_green_seat_model BEFORE INSERT OR UPDATE ON public.sessions
    FOR EACH ROW EXECUTE FUNCTION public.guard_green_seat_model();

-- GC-08 will call this from creation UI. An approval ID is required; browser
-- JSON cannot manufacture a roster. Both writes and first claims serialize on
-- the same session row, and the entire RPC rolls back if either write fails.
CREATE FUNCTION public.configure_session_green_shared_facilitator(sid UUID, roster_version TEXT)
RETURNS public.sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.sessions%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR NOT public.live_demo_has_operator_grant('gamemaster') THEN
        RAISE EXCEPTION 'Game Master authorization is required.' USING ERRCODE='42501';
    END IF;
    PERFORM public.green_require_open_session(sid);
    IF roster_version IS NULL THEN RAISE EXCEPTION 'GC02_APPROVED_ROSTER_REQUIRED' USING ERRCODE='23514'; END IF;
    IF EXISTS (SELECT 1 FROM public.sessions WHERE id=sid AND topology_frozen_at IS NOT NULL)
        OR public.green_session_has_evidence(sid) THEN
        RAISE EXCEPTION 'GC04A_SEAT_MODEL_FROZEN' USING ERRCODE='23514';
    END IF;
    PERFORM public.configure_session_green_topology(sid,2,roster_version);
    UPDATE public.sessions SET green_seat_model='shared_facilitator_v1' WHERE id=sid RETURNING * INTO result;
    RETURN result;
END $$;

CREATE UNIQUE INDEX idx_green_shared_active_seat ON public.session_participants(session_id)
    WHERE role='green_shared_facilitator' AND is_active IS TRUE;

-- Replacements below retain original function OIDs/ACLs and existing policy
-- intersections. GC-03 terminal conflicts and recipient indexes are untouched.

CREATE OR REPLACE FUNCTION public.green_storage_current_seat(requested_session_id UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE WHEN COUNT(*) = 1 THEN jsonb_agg(to_jsonb(sp))->0 ELSE NULL END
    FROM public.session_participants sp JOIN public.participants p ON p.id = sp.participant_id
    JOIN public.sessions s ON s.id = sp.session_id
    WHERE sp.session_id = requested_session_id AND p.auth_user_id = auth.uid()
        AND public.green_seat_model_allows_role(sp.session_id,sp.role) AND sp.is_active AND sp.revoked_at IS NULL AND sp.left_at IS NULL AND sp.disconnected_at IS NULL
        AND COALESCE(sp.heartbeat_at, sp.last_seen, sp.joined_at) >= NOW() - INTERVAL '90 seconds'
        AND s.status = 'active' AND s.session_classification = 'live_exercise' AND NOT s.is_protected
        AND sp.delegation_id IS NOT DISTINCT FROM public.green_role_delegation(public.live_demo_normalize_role(sp.role))
$$;

CREATE OR REPLACE FUNCTION public.live_demo_participant_surface(requested_session_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r TEXT := public.live_demo_participant_role(requested_session_id);
BEGIN
    IF r='green_shared_facilitator' THEN RETURN 'scribe'; END IF;
    IF public.green_role_delegation(r) IS NOT NULL THEN
        RETURN CASE WHEN r LIKE '%_facilitator' THEN 'scribe'
            WHEN r LIKE '%_scribe' THEN 'facilitator' ELSE 'notetaker' END;
    END IF;
    RETURN public.gc03_legacy_surface(requested_session_id);
END $$;

CREATE OR REPLACE FUNCTION public.get_session_role_seat_limit(requested_role TEXT)
RETURNS INTEGER LANGUAGE SQL IMMUTABLE SET search_path = public AS $$
    SELECT CASE WHEN public.live_demo_normalize_role(requested_role)='green_shared_facilitator' THEN 1
        WHEN public.green_role_delegation(public.live_demo_normalize_role(requested_role)) IS NOT NULL
        THEN 1 ELSE public.gc03_legacy_seat_limit(requested_role) END
$$;

CREATE OR REPLACE FUNCTION public.claim_session_role_seat(
    requested_session_id UUID, requested_role TEXT, requested_name TEXT DEFAULT NULL,
    requested_client_id TEXT DEFAULT NULL, requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r TEXT := public.live_demo_normalize_role(requested_role); d TEXT;
    p public.participants%ROWTYPE; seat public.session_participants%ROWTYPE;
    capacity INTEGER; occupied INTEGER; claim_state TEXT := 'claimed';
BEGIN
    PERFORM public.green_require_open_session(requested_session_id);
    IF public.green_seat_model_allows_role(requested_session_id,r) IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'GC04A_SEAT_MODEL_ROLE_MISMATCH' USING ERRCODE='42501';
    END IF;
    d := public.green_role_delegation(r);
    IF public.green_storage_is_unified(requested_session_id) THEN
        IF d IS NOT NULL THEN RAISE EXCEPTION 'GC03_TOPOLOGY_ROLE_MISMATCH' USING ERRCODE = '42501'; END IF;
        -- Even compatibility claims may never steal a participant via client_id.
        IF EXISTS (SELECT 1 FROM public.participants WHERE client_id = BTRIM(requested_client_id)
            AND auth_user_id IS DISTINCT FROM auth.uid()) THEN
            RAISE EXCEPTION 'GC03_CLIENT_IDENTITY_CONFLICT' USING ERRCODE = '42501';
        END IF;
        RETURN public.gc03_legacy_claim(requested_session_id, r, requested_name, requested_client_id, requested_timeout_seconds);
    END IF;
    capacity := public.get_session_role_seat_limit(r);
    IF capacity IS NULL OR (r LIKE 'green%' AND d IS NULL AND r<>'green_shared_facilitator') THEN
        RAISE EXCEPTION 'GC03_TOPOLOGY_ROLE_MISMATCH' USING ERRCODE = '42501';
    END IF;
    IF r LIKE 'whitecell%' AND NOT public.live_demo_has_operator_grant('whitecell', requested_session_id, NULL, r)
        OR r LIKE 'sme_%' AND NOT public.live_demo_has_operator_grant('sme', requested_session_id, NULL, r) THEN
        RAISE EXCEPTION 'Operator authorization is required.' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(BTRIM(requested_client_id), '') IS NULL THEN
        RAISE EXCEPTION 'Client identity is required.' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(requested_session_id::TEXT || ':' || r, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::TEXT, 0));
    SELECT * INTO p FROM public.participants WHERE auth_user_id = auth.uid() FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.participants WHERE client_id = BTRIM(requested_client_id)
        AND auth_user_id IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'GC03_CLIENT_IDENTITY_CONFLICT' USING ERRCODE = '42501';
    END IF;
    IF p.id IS NULL THEN
        INSERT INTO public.participants(auth_user_id,client_id,name,role)
            VALUES(auth.uid(),BTRIM(requested_client_id),NULLIF(BTRIM(requested_name),''),r) RETURNING * INTO p;
    ELSE
        UPDATE public.participants SET name=COALESCE(NULLIF(BTRIM(requested_name),''),name),
            client_id=BTRIM(requested_client_id),role=r,updated_at=NOW() WHERE id=p.id RETURNING * INTO p;
    END IF;
    SELECT * INTO seat FROM public.session_participants WHERE session_id = requested_session_id AND participant_id = p.id FOR UPDATE;
    IF seat.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'GC03_SEAT_REVOKED' USING ERRCODE = '42501'; END IF;
    IF seat.id IS NOT NULL AND seat.role IS DISTINCT FROM r THEN
        RAISE EXCEPTION 'GC03_SEAT_ROLE_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    PERFORM public.release_stale_session_role_seats_internal(requested_session_id, 90);
    SELECT COUNT(*) INTO occupied FROM public.session_participants
        WHERE session_id = requested_session_id AND role = r AND is_active AND id IS DISTINCT FROM seat.id;
    IF occupied >= capacity THEN RAISE EXCEPTION 'The requested role is full. Please choose another seat.' USING ERRCODE = 'P0001'; END IF;
    -- Replacement permanently invalidates earlier inactive leases. They remain
    -- present for note authorship and display-name evidence.
    UPDATE public.session_participants SET revoked_at = clock_timestamp()
        WHERE session_id = requested_session_id AND role = r AND NOT is_active
            AND id IS DISTINCT FROM seat.id AND revoked_at IS NULL;
    IF seat.id IS NULL THEN
        INSERT INTO public.session_participants(session_id,participant_id,role,delegation_id,is_active,heartbeat_at,last_seen)
            VALUES(requested_session_id,p.id,r,d,true,NOW(),NOW()) RETURNING * INTO seat;
    ELSE
        claim_state := CASE WHEN seat.is_active AND seat.heartbeat_at >= NOW()-INTERVAL '90 seconds' THEN 'refreshed' ELSE 'rejoined' END;
        UPDATE public.session_participants SET is_active=true,heartbeat_at=NOW(),last_seen=NOW(),left_at=NULL,disconnected_at=NULL
            WHERE id=seat.id RETURNING * INTO seat;
    END IF;
    RETURN to_jsonb(seat) || jsonb_build_object('display_name',seat.display_name_snapshot,'client_id',p.client_id,
        'seat_limit',capacity,'active_count',occupied+1,'claim_status',claim_state,
        'green_seat_model',public.green_session_seat_model(requested_session_id));
END $$;

CREATE OR REPLACE FUNCTION public.guard_green_owned_record()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE topology INTEGER; expected_delegation TEXT; seat JSONB;
BEGIN
    SELECT COALESCE(session_topology_version, 1) INTO topology FROM public.sessions WHERE id = NEW.session_id;
    IF TG_TABLE_NAME = 'session_participants' THEN
        IF public.green_seat_model_allows_role(NEW.session_id,NEW.role) IS DISTINCT FROM true THEN
            RAISE EXCEPTION 'GC04A_SEAT_MODEL_ROLE_MISMATCH' USING ERRCODE='42501';
        END IF;
        expected_delegation := public.green_role_delegation(NEW.role);
        IF topology = 2 AND expected_delegation IS NULL AND NEW.role NOT IN (
            'blue_facilitator', 'blue_scribe', 'blue_notetaker',
            'red_facilitator', 'red_scribe', 'red_notetaker',
            'industry_facilitator', 'industry_scribe', 'industry_notetaker',
            'whitecell_lead', 'whitecell_support', 'viewer', 'green_shared_facilitator',
            'sme_econ', 'sme_ni_escalation', 'sme_diplomacy_information', 'sme_tsj', 'sme_verba') THEN
            RAISE EXCEPTION 'GC02_SEAT_SCOPE_MISMATCH' USING ERRCODE = '23514';
        END IF;
        IF expected_delegation IS NOT NULL THEN
            IF topology <> 2 OR NEW.delegation_id IS DISTINCT FROM expected_delegation THEN
                RAISE EXCEPTION 'GC02_SEAT_SCOPE_MISMATCH' USING ERRCODE = '23514';
            END IF;
        ELSIF NEW.delegation_id IS NOT NULL OR (topology = 2 AND NEW.role LIKE 'green%' AND NEW.role<>'green_shared_facilitator') THEN
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

CREATE OR REPLACE FUNCTION public.green_has_capability(requested_session_id UUID, requested_capability TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(public.green_storage_current_seat(requested_session_id) IS NOT NULL AND
        public.green_storage_current_seat(requested_session_id)->>'role'<>'green_shared_facilitator' AND
        CASE requested_capability
            WHEN 'draft' THEN public.green_semantic_role(requested_session_id) = 'scribe'
            WHEN 'submit' THEN public.green_semantic_role(requested_session_id) = 'facilitator'
            WHEN 'rfi' THEN public.green_semantic_role(requested_session_id) = 'facilitator'
            WHEN 'direct' THEN public.green_semantic_role(requested_session_id) = 'facilitator'
            WHEN 'thread' THEN public.green_semantic_role(requested_session_id) = 'facilitator'
            WHEN 'notes' THEN public.green_semantic_role(requested_session_id) = 'notetaker'
            ELSE false END, false)
$$;

CREATE OR REPLACE FUNCTION public.green_owns_scope(sid UUID, team TEXT, delegation TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(public.green_storage_current_seat(sid) IS NOT NULL
        AND public.green_storage_current_seat(sid)->>'role'<>'green_shared_facilitator'
        AND public.live_demo_participant_team(sid) = team
        AND public.green_storage_current_seat(sid)->>'delegation_id' IS NOT DISTINCT FROM delegation, false)
$$;

CREATE OR REPLACE FUNCTION public.green_can_read_record(table_name TEXT, record JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE sid UUID := (record->>'session_id')::UUID; seat JSONB; team TEXT; semantic TEXT; linked JSONB;
BEGIN
    IF public.green_storage_is_unified(sid) THEN RETURN true; END IF;
    IF public.green_storage_operator(sid) THEN RETURN true; END IF;
    seat := public.green_storage_current_seat(sid);
    IF seat IS NULL THEN RETURN false; END IF;
    team := public.live_demo_participant_team(sid);
    semantic := public.green_semantic_role(sid);
    -- Shared read authority is explicit and state-bounded, never team-wide.
    -- Drafts, returned drafts, notes and recipient threads remain private.
    IF seat->>'role'='green_shared_facilitator' THEN
        RETURN COALESCE(CASE
            WHEN table_name IN ('session_participants','game_state') THEN true
            WHEN table_name='actions' THEN record->>'team'='green'
                AND record->>'delegation_id' IN ('asian_pacific','europe')
                AND record->>'workflow_state' IN ('forwarded_to_facilitator','submitted_to_white_cell','completed')
            WHEN table_name='communications' THEN record->>'from_role'='white_cell'
                AND record->>'type' NOT IN ('PROPOSAL_FORWARDED','PROPOSAL_RESPONSE','PROPOSAL_RESPONSE_REVIEW')
                AND (record->>'to_role'='green_shared_facilitator'
                    OR record->>'recipient_scope' IN ('session','both_green_delegations'))
            ELSE false END, false);
    END IF;
    CASE table_name
    WHEN 'session_participants', 'game_state' THEN RETURN true;
    WHEN 'actions' THEN
        RETURN public.green_owns_scope(sid,record->>'team',record->>'delegation_id')
            AND (semantic IN ('scribe','facilitator') OR semantic='notetaker' AND record->>'workflow_state'='completed');
    WHEN 'requests' THEN RETURN public.green_owns_scope(sid,record->>'team',record->>'delegation_id');
    WHEN 'scoped_notetaker_data' THEN RETURN semantic='notetaker' AND record->>'session_participant_id'=seat->>'id';
    WHEN 'communications' THEN
        IF record->>'type' IN ('PROPOSAL_FORWARDED','PROPOSAL_RESPONSE','PROPOSAL_RESPONSE_REVIEW') THEN
            IF semantic NOT IN ('scribe','facilitator') THEN RETURN false; END IF;
            IF record->>'type'='PROPOSAL_RESPONSE_REVIEW' THEN RETURN record->>'from_role'=seat->>'role'; END IF;
            RETURN public.green_owns_scope(sid,record->>'owner_team',record->>'delegation_id')
                OR team = record#>>'{metadata,recipient_team}' AND team IN ('blue','red');
        END IF;
        RETURN record->>'from_role'=seat->>'role' OR
            record->>'from_role' IN ('white_cell','whitecell','whitecell_lead','whitecell_support') AND (
                record->>'recipient_scope'='session'
                OR record->>'recipient_scope'='both_green_delegations' AND team='green'
                OR record->>'recipient_scope'='role' AND record->>'to_role'=seat->>'role'
                OR record->>'recipient_scope'='delegation' AND team='green' AND record->>'recipient_delegation_id'=seat->>'delegation_id'
                OR record->>'recipient_scope'='team' AND record->>'to_role'=team AND team<>'green');
    WHEN 'timeline' THEN
        IF record#>>'{metadata,communication_id}' IS NOT NULL THEN
            SELECT to_jsonb(c) INTO linked FROM public.communications c WHERE id::TEXT=record#>>'{metadata,communication_id}' AND session_id=sid;
            RETURN linked IS NOT NULL AND public.green_can_read_record('communications',linked);
        END IF;
        RETURN public.green_owns_scope(sid,record->>'owner_team',record->>'delegation_id') AND semantic IN ('scribe','facilitator');
    WHEN 'artifact_workflow_reviews' THEN
        RETURN public.green_owns_scope(sid,record->>'team',record->>'delegation_id') AND semantic IN ('scribe','facilitator');
    WHEN 'action_logs', 'action_relationships', 'rfi_action_links' THEN
        SELECT to_jsonb(a) INTO linked FROM public.actions a
            WHERE a.id::TEXT=COALESCE(record->>'action_id',record->>'source_action_id') AND a.session_id=sid;
        IF linked IS NULL OR NOT public.green_can_read_record('actions',linked) THEN RETURN false; END IF;
        IF table_name='action_relationships' AND record->>'target_action_id' IS NOT NULL THEN
            SELECT to_jsonb(a) INTO linked FROM public.actions a WHERE id::TEXT=record->>'target_action_id' AND session_id=sid;
            RETURN linked IS NOT NULL AND public.green_can_read_record('actions',linked);
        ELSIF table_name='rfi_action_links' THEN
            SELECT to_jsonb(r) INTO linked FROM public.requests r WHERE id::TEXT=record->>'request_id' AND session_id=sid;
            RETURN linked IS NOT NULL AND public.green_can_read_record('requests',linked);
        END IF;
        RETURN true;
    ELSE RETURN false; -- Shared JSON, research copies and unscoped derived data stay operator-only.
    END CASE;
END $$;

CREATE OR REPLACE FUNCTION public.guard_green_authority()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item JSONB; prior JSONB; sid UUID; seat JSONB; semantic TEXT; allowed BOOLEAN := false;
BEGIN
    item := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    prior := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
    sid := (item->>'session_id')::UUID;
    IF public.green_storage_is_unified(sid) THEN
        IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END IF;
    -- Database-owner fixtures are distinct from an unauthenticated browser.
    IF auth.uid() IS NULL AND current_setting('role',true) NOT IN ('anon','authenticated') THEN
        IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END IF;
    IF auth.uid() IS NULL OR TG_OP='DELETE' THEN
        RAISE EXCEPTION 'GC03_SCOPE_DENIED' USING ERRCODE='42501';
    END IF;
    seat := public.green_storage_current_seat(sid);
    semantic := public.green_semantic_role(sid);
    IF TG_TABLE_NAME='session_participants' THEN
        -- No browser table-write policy exists; only the serialized seat RPCs
        -- and internal fixed-timeout cleanup can reach this branch.
        allowed := true;
        IF TG_OP='UPDATE' AND OLD.revoked_at IS NOT NULL AND
            (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.is_active) THEN
            RAISE EXCEPTION 'GC03_SEAT_REVOKED' USING ERRCODE='42501';
        END IF;
    ELSIF public.green_storage_operator(sid) THEN
        allowed := true; -- Existing RPCs still require their exact review grant.
    ELSIF seat->>'role'='green_shared_facilitator' THEN
        allowed := false; -- Read-only foundation; GC-06/07 own mutation contracts.
    ELSIF TG_TABLE_NAME LIKE 'research_%' AND pg_trigger_depth()>1 THEN
        allowed := true; -- Server audit capture of an already authorized write.
    ELSIF TG_TABLE_NAME='actions' THEN
        allowed := public.green_owns_scope(sid,NEW.team,NEW.delegation_id)
            AND (TG_OP='INSERT' AND public.green_has_capability(sid,'draft') AND NEW.status='draft'
                OR TG_OP='UPDATE' AND OLD.status='draft' AND (
                    public.green_has_capability(sid,'draft') AND OLD.workflow_state IN ('draft','returned_to_team') AND NEW.status='draft'
                    OR public.green_has_capability(sid,'submit') AND OLD.workflow_state IN ('forwarded_to_facilitator','returned_to_team')
                        AND NEW.status IN ('draft','submitted')));
        IF TG_OP='INSERT' THEN
            NEW.created_by_auth_user_id := auth.uid(); NEW.created_by_role := seat->>'role';
        ELSE
            NEW.created_by_auth_user_id := OLD.created_by_auth_user_id; NEW.created_by_role := OLD.created_by_role;
        END IF;
        IF TG_OP='INSERT' AND (NEW.outcome IS NOT NULL OR NEW.adjudication IS NOT NULL OR NEW.adjudication_notes IS NOT NULL)
            OR TG_OP='UPDATE' AND ROW(NEW.outcome,NEW.adjudication,NEW.adjudication_notes)
                IS DISTINCT FROM ROW(OLD.outcome,OLD.adjudication,OLD.adjudication_notes) THEN allowed := false; END IF;
        IF COALESCE(NEW.revision_number,1) IS DISTINCT FROM COALESCE((prior->>'revision_number')::BIGINT,1)
            OR NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by_auth_user_id IS NOT NULL
            OR NEW.reviewed_by_role IS NOT NULL OR NEW.review_notes IS NOT NULL THEN
            -- Returned artifacts retain their server review evidence unchanged.
            IF TG_OP='INSERT' OR ROW(NEW.reviewed_at,NEW.reviewed_by_auth_user_id,NEW.reviewed_by_role,NEW.review_notes,NEW.revision_number)
                IS DISTINCT FROM ROW(OLD.reviewed_at,OLD.reviewed_by_auth_user_id,OLD.reviewed_by_role,OLD.review_notes,OLD.revision_number) THEN
                allowed := false;
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME='requests' THEN
        allowed := public.green_owns_scope(sid,NEW.team,NEW.delegation_id) AND public.green_has_capability(sid,'rfi');
    ELSIF TG_TABLE_NAME='communications' THEN
        allowed := NEW.from_role=seat->>'role' AND NEW.sender_delegation_id IS NOT DISTINCT FROM seat->>'delegation_id'
            AND (NEW.type='direct' AND NEW.to_role='white_cell' AND public.green_has_capability(sid,'direct')
                    AND NEW.linked_request_id IS NULL
                    AND NOT (NEW.metadata ?| ARRAY['source_proposal_id','source_action_id','source_communication_id','linked_request_id'])
                    AND public.green_owns_scope(sid,NEW.owner_team,NEW.delegation_id)
                OR NEW.type='PROPOSAL_RESPONSE_REVIEW' AND public.green_has_capability(sid,'thread'));
    ELSIF TG_TABLE_NAME='scoped_notetaker_data' THEN
        allowed := NEW.session_participant_id::TEXT=seat->>'id' AND public.green_has_capability(sid,'notes');
    ELSIF TG_TABLE_NAME IN ('timeline','action_logs','action_relationships','rfi_action_links') THEN
        allowed := semantic IN ('scribe','facilitator') AND public.green_can_read_record(TG_TABLE_NAME,item);
    END IF;
    IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'GC03_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
    RETURN NEW;
END $$;

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
        'green_seat_model', public.green_session_seat_model(s.id),
        'session_topology_version', COALESCE(s.session_topology_version, 1));
END $$;

CREATE OR REPLACE FUNCTION public.restore_session_seat_context(requested_session_id UUID, requested_session_participant_id UUID)
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
        'green_seat_model', public.green_session_seat_model(s.id),
        'session_topology_version', COALESCE(s.session_topology_version, 1)));
END $$;

REVOKE ALL ON FUNCTION public.green_session_seat_model(UUID),
    public.green_seat_model_allows_role(UUID,TEXT), public.guard_green_seat_model(),
    public.configure_session_green_shared_facilitator(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_session_green_shared_facilitator(UUID,TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
