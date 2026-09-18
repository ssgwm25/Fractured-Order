-- GC-03. Apply once, after 2026-09-18_green_regional_storage.sql.
-- No roster approval or historical role/data rewrite is performed here.
BEGIN;

ALTER TABLE public.session_participants ADD COLUMN revoked_at TIMESTAMPTZ;

-- Retain the deployed compatibility implementations privately. Browser callers
-- cannot bypass the new wrappers by invoking one of these names as an RPC.
ALTER FUNCTION public.claim_session_role_seat(UUID,TEXT,TEXT,TEXT,INTEGER) RENAME TO gc03_legacy_claim;
ALTER FUNCTION public.heartbeat_session_role_seat(UUID,UUID,TEXT,INTEGER) RENAME TO gc03_legacy_heartbeat;
ALTER FUNCTION public.disconnect_session_role_seat(UUID,UUID,TEXT,INTEGER) RENAME TO gc03_legacy_disconnect;
ALTER FUNCTION public.operator_remove_session_participant(UUID,UUID) RENAME TO gc03_legacy_remove;
ALTER FUNCTION public.release_stale_session_role_seats_internal(UUID,INTEGER) RENAME TO gc03_legacy_release;

-- Policy expressions retain function OIDs across renames. Copy these helper
-- bodies, then replace their originals IN PLACE so existing policies resolve
-- the new authority checks and keep their intended EXECUTE dependency.
DO $$ DECLARE item RECORD; BEGIN
    FOR item IN SELECT * FROM (VALUES
        ('live_demo_participant_role','uuid','gc03_legacy_role'),
        ('live_demo_participant_surface','uuid','gc03_legacy_surface'),
        ('live_demo_can_read_session','uuid','gc03_legacy_read_session'),
        ('get_session_role_seat_limit','text','gc03_legacy_seat_limit')
    ) names(original_name,argument_type,copy_name) LOOP
        EXECUTE replace(pg_get_functiondef(to_regprocedure(format('public.%I(%s)',item.original_name,item.argument_type))),
            'FUNCTION public.'||item.original_name||'(', 'FUNCTION public.'||item.copy_name||'(');
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.green_storage_current_seat(requested_session_id UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE WHEN COUNT(*) = 1 THEN jsonb_agg(to_jsonb(sp))->0 ELSE NULL END
    FROM public.session_participants sp JOIN public.participants p ON p.id = sp.participant_id
    JOIN public.sessions s ON s.id = sp.session_id
    WHERE sp.session_id = requested_session_id AND p.auth_user_id = auth.uid()
        AND sp.is_active AND sp.revoked_at IS NULL AND sp.left_at IS NULL AND sp.disconnected_at IS NULL
        AND COALESCE(sp.heartbeat_at, sp.last_seen, sp.joined_at) >= NOW() - INTERVAL '90 seconds'
        AND s.status = 'active' AND s.session_classification = 'live_exercise' AND NOT s.is_protected
        AND sp.delegation_id IS NOT DISTINCT FROM public.green_role_delegation(public.live_demo_normalize_role(sp.role))
$$;

CREATE OR REPLACE FUNCTION public.live_demo_participant_role(requested_session_id UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE WHEN public.green_storage_is_unified(requested_session_id)
        THEN public.gc03_legacy_role(requested_session_id)
        ELSE public.live_demo_normalize_role(public.green_storage_current_seat(requested_session_id)->>'role') END
$$;

-- The surface is a compatibility adapter for existing workflow guards, NOT the
-- semantic role. Legacy *_facilitator means Scribe; new regional names are literal.
CREATE OR REPLACE FUNCTION public.live_demo_participant_surface(requested_session_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r TEXT := public.live_demo_participant_role(requested_session_id);
BEGIN
    IF public.green_role_delegation(r) IS NOT NULL THEN
        RETURN CASE WHEN r LIKE '%_facilitator' THEN 'scribe'
            WHEN r LIKE '%_scribe' THEN 'facilitator' ELSE 'notetaker' END;
    END IF;
    RETURN public.gc03_legacy_surface(requested_session_id);
END $$;

CREATE FUNCTION public.green_semantic_role(requested_session_id UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE public.live_demo_participant_surface(requested_session_id)
        WHEN 'facilitator' THEN 'scribe' WHEN 'scribe' THEN 'facilitator'
        ELSE public.live_demo_participant_surface(requested_session_id) END
$$;

CREATE FUNCTION public.green_has_capability(requested_session_id UUID, requested_capability TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(public.green_storage_current_seat(requested_session_id) IS NOT NULL AND
        CASE requested_capability
            WHEN 'draft' THEN public.green_semantic_role(requested_session_id) = 'scribe'
            WHEN 'submit' THEN public.green_semantic_role(requested_session_id) = 'facilitator'
            WHEN 'rfi' THEN public.green_semantic_role(requested_session_id) = 'facilitator'
            WHEN 'direct' THEN public.green_semantic_role(requested_session_id) = 'facilitator'
            WHEN 'thread' THEN public.green_semantic_role(requested_session_id) = 'facilitator'
            WHEN 'notes' THEN public.green_semantic_role(requested_session_id) = 'notetaker'
            ELSE false END, false)
$$;

CREATE OR REPLACE FUNCTION public.live_demo_can_read_session(requested_session_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE WHEN public.green_storage_is_unified(requested_session_id)
        THEN public.gc03_legacy_read_session(requested_session_id)
        ELSE public.green_storage_current_seat(requested_session_id) IS NOT NULL
            OR public.green_storage_operator(requested_session_id) END
$$;

CREATE OR REPLACE FUNCTION public.get_session_role_seat_limit(requested_role TEXT)
RETURNS INTEGER LANGUAGE SQL IMMUTABLE SET search_path = public AS $$
    SELECT CASE WHEN public.green_role_delegation(public.live_demo_normalize_role(requested_role)) IS NOT NULL
        THEN 1 ELSE public.gc03_legacy_seat_limit(requested_role) END
$$;

CREATE FUNCTION public.green_require_open_session(requested_session_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- All seat operations take the same lock order as the topology freeze.
    PERFORM 1 FROM public.sessions WHERE id = requested_session_id AND status = 'active'
        AND session_classification = 'live_exercise' AND NOT is_protected FOR UPDATE;
    IF NOT FOUND OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'This session is not currently joinable.' USING ERRCODE = '42501';
    END IF;
END $$;

CREATE FUNCTION public.release_stale_session_role_seats_internal(
    requested_session_id UUID, requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN public.gc03_legacy_release(requested_session_id,
        CASE WHEN public.green_storage_is_unified(requested_session_id) THEN requested_timeout_seconds ELSE 90 END);
END $$;

CREATE FUNCTION public.claim_session_role_seat(
    requested_session_id UUID, requested_role TEXT, requested_name TEXT DEFAULT NULL,
    requested_client_id TEXT DEFAULT NULL, requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r TEXT := public.live_demo_normalize_role(requested_role); d TEXT;
    p public.participants%ROWTYPE; seat public.session_participants%ROWTYPE;
    capacity INTEGER; occupied INTEGER; claim_state TEXT := 'claimed';
BEGIN
    PERFORM public.green_require_open_session(requested_session_id);
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
    IF capacity IS NULL OR (r LIKE 'green%' AND d IS NULL) THEN
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
        'seat_limit',capacity,'active_count',occupied+1,'claim_status',claim_state);
END $$;

CREATE FUNCTION public.heartbeat_session_role_seat(
    requested_session_id UUID, requested_session_participant_id UUID,
    requested_client_id TEXT DEFAULT NULL, requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seat JSONB;
BEGIN
    PERFORM public.green_require_open_session(requested_session_id);
    IF public.green_storage_is_unified(requested_session_id) THEN
        RETURN public.gc03_legacy_heartbeat(requested_session_id,requested_session_participant_id,requested_client_id,requested_timeout_seconds);
    END IF;
    seat := public.green_storage_current_seat(requested_session_id);
    IF seat IS NULL OR seat->>'id' IS DISTINCT FROM requested_session_participant_id::TEXT THEN
        RAISE EXCEPTION 'GC03_SEAT_REJOIN_REQUIRED' USING ERRCODE = '42501';
    END IF;
    UPDATE public.session_participants SET heartbeat_at=NOW(),last_seen=NOW() WHERE id=requested_session_participant_id;
    RETURN seat || jsonb_build_object('heartbeat_at',NOW(),'last_seen',NOW());
END $$;

CREATE FUNCTION public.disconnect_session_role_seat(
    requested_session_id UUID, requested_session_participant_id UUID,
    requested_client_id TEXT DEFAULT NULL, requested_timeout_seconds INTEGER DEFAULT 90
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.green_require_open_session(requested_session_id);
    RETURN public.gc03_legacy_disconnect(requested_session_id,requested_session_participant_id,requested_client_id,
        CASE WHEN public.green_storage_is_unified(requested_session_id) THEN requested_timeout_seconds ELSE 90 END);
END $$;

CREATE FUNCTION public.operator_remove_session_participant(requested_session_id UUID,requested_session_participant_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seat public.session_participants%ROWTYPE;
BEGIN
    PERFORM public.green_require_open_session(requested_session_id);
    IF public.green_storage_is_unified(requested_session_id) THEN
        RETURN public.gc03_legacy_remove(requested_session_id,requested_session_participant_id);
    END IF;
    IF NOT public.green_storage_operator(requested_session_id) THEN
        RAISE EXCEPTION 'Session operator authorization is required.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.session_participants SET is_active=false,revoked_at=COALESCE(revoked_at,clock_timestamp()),
        left_at=COALESCE(left_at,NOW()),disconnected_at=COALESCE(disconnected_at,NOW())
        WHERE id=requested_session_participant_id AND session_id=requested_session_id RETURNING * INTO seat;
    IF seat.id IS NULL THEN RAISE EXCEPTION 'Participant seat not found for this session.' USING ERRCODE = 'P0002'; END IF;
    DELETE FROM public.operator_grants WHERE session_id=requested_session_id AND surface IN ('whitecell','sme')
        AND auth_user_id IN (SELECT auth_user_id FROM public.participants WHERE id=seat.participant_id);
    RETURN to_jsonb(seat) || jsonb_build_object('removed_at',seat.revoked_at,'display_name',seat.display_name_snapshot);
END $$;

CREATE FUNCTION public.green_owns_scope(sid UUID, team TEXT, delegation TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(public.green_storage_current_seat(sid) IS NOT NULL
        AND public.live_demo_participant_team(sid) = team
        AND public.green_storage_current_seat(sid)->>'delegation_id' IS NOT DISTINCT FROM delegation, false)
$$;

CREATE FUNCTION public.green_can_read_record(table_name TEXT, record JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE sid UUID := (record->>'session_id')::UUID; seat JSONB; team TEXT; semantic TEXT; linked JSONB;
BEGIN
    IF public.green_storage_is_unified(sid) THEN RETURN true; END IF;
    IF public.green_storage_operator(sid) THEN RETURN true; END IF;
    seat := public.green_storage_current_seat(sid);
    IF seat IS NULL THEN RETURN false; END IF;
    team := public.live_demo_participant_team(sid);
    semantic := public.green_semantic_role(sid);
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

-- Replace the staging trigger without weakening topology/roster/freeze checks.
CREATE OR REPLACE FUNCTION public.guard_green_storage_activation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.sessions%ROWTYPE; sid UUID;
BEGIN
    sid := CASE WHEN TG_OP='DELETE' THEN OLD.session_id ELSE NEW.session_id END;
    SELECT * INTO s FROM public.sessions WHERE id=sid FOR UPDATE;
    IF s.id IS NULL THEN RAISE EXCEPTION 'GC02_SESSION_NOT_FOUND' USING ERRCODE='23503'; END IF;
    IF s.session_topology_version=2 THEN
        IF TG_TABLE_NAME='notetaker_data' THEN RAISE EXCEPTION 'GC02_SHARED_NOTES_FORBIDDEN' USING ERRCODE='23514'; END IF;
        IF s.green_roster_version IS NULL OR s.green_roster_snapshot IS NULL THEN
            RAISE EXCEPTION 'GC02_APPROVED_ROSTER_REQUIRED' USING ERRCODE='23514';
        END IF;
        IF s.session_classification<>'live_exercise' OR s.is_protected THEN
            RAISE EXCEPTION 'GC02_SESSION_CLOSED' USING ERRCODE='42501';
        END IF;
        IF s.status<>'active' AND NOT (
            public.green_storage_operator(sid) AND (
                TG_TABLE_NAME='session_participants' AND TG_OP='UPDATE'
                    AND COALESCE((to_jsonb(NEW)->>'is_active')::BOOLEAN,true)=false
                OR TG_TABLE_NAME='research_audit_event_log' AND TG_OP='INSERT'
                    AND to_jsonb(NEW)->>'event_type' IN ('SESSION_CLOSED','SESSION_DELETED')
                    AND to_jsonb(NEW)->>'entity_id'=sid::TEXT)) THEN
            RAISE EXCEPTION 'GC02_SESSION_CLOSED' USING ERRCODE='42501';
        END IF;
    END IF;
    IF TG_OP='INSERT' AND TG_TABLE_NAME<>'game_state' THEN
        INSERT INTO public.session_topology_locks(session_id) VALUES(sid) ON CONFLICT DO NOTHING;
        UPDATE public.sessions SET topology_frozen_at=clock_timestamp()
            WHERE id=sid AND topology_frozen_at IS NULL AND status<>'deleted' AND NOT is_protected;
    END IF;
    IF TG_OP='UPDATE' AND NEW.session_id IS DISTINCT FROM OLD.session_id THEN
        RAISE EXCEPTION 'GC02_IMMUTABLE_SESSION' USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION public.guard_green_authority()
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

CREATE FUNCTION public.guard_green_session_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF OLD.session_topology_version=2 AND NEW.status IS DISTINCT FROM OLD.status
        AND NOT public.green_storage_operator(OLD.id) THEN
        RAISE EXCEPTION 'Session operator authorization is required.' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER green_session_lifecycle BEFORE UPDATE OF status ON public.sessions
    FOR EACH ROW EXECUTE FUNCTION public.guard_green_session_lifecycle();

-- Intersect EVERY policy on the GC-02 inventory, including permissive Industry,
-- session-wide timeline, research and SME policies. No OR policy can bypass it.
DO $$ DECLARE item RECORD; BEGIN
    FOR item IN SELECT unnest(ARRAY[
        'game_state','session_participants','actions','requests','communications','timeline',
        'notetaker_data','artifact_workflow_reviews','action_logs','reports','move_completions',
        'game_state_transitions','participant_activity','data_completeness_checks','action_relationships',
        'rfi_action_links','pli_adjudications','sme_handoffs','sme_pli_packets','research_audit_event_log',
        'research_participant','research_note','research_draft_revision','research_state_transition',
        'research_action_content','research_proposal_content','research_adjudication_content',
        'research_move_response_content','research_rfi_content','research_interaction_edge',
        'research_data_quality_event','research_derived_participant_metrics','research_derived_session_metrics',
        'research_identity_map'
    ]) AS tablename LOOP
        -- No IF EXISTS: an incomplete prerequisite inventory must abort.
        EXECUTE format('DROP POLICY green_storage_boundary ON public.%I',item.tablename);
        EXECUTE format('CREATE POLICY green_storage_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
            USING (public.green_can_read_record(%L,to_jsonb(%I)))
            WITH CHECK (public.green_can_read_record(%L,to_jsonb(%I)))',
            item.tablename,item.tablename,item.tablename,item.tablename,item.tablename);
        EXECUTE format('CREATE TRIGGER zzzz_green_authority BEFORE INSERT OR UPDATE OR DELETE ON public.%I
            FOR EACH ROW EXECUTE FUNCTION public.guard_green_authority()',item.tablename);
    END LOOP;
END $$;
CREATE TRIGGER zzzz_green_authority BEFORE INSERT OR UPDATE OR DELETE ON public.scoped_notetaker_data
    FOR EACH ROW EXECUTE FUNCTION public.guard_green_authority();

-- This derived table has note_id rather than session_id. Resolve its parent;
-- it must not become an unscoped copy of otherwise private note contents.
CREATE POLICY green_note_revision_boundary ON public.research_note_revision AS RESTRICTIVE FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.research_note n WHERE n.note_id=research_note_revision.note_id
        AND public.green_can_read_record('research_note',to_jsonb(n))))
    WITH CHECK (EXISTS (SELECT 1 FROM public.research_note n WHERE n.note_id=research_note_revision.note_id
        AND public.green_can_read_record('research_note',to_jsonb(n))));

-- Seat lifecycle is RPC-only even if a permissive table-write policy is later
-- added. SECURITY DEFINER seat RPCs bypass RLS, not their lifecycle guards.
CREATE POLICY green_seat_rpc_insert ON public.session_participants AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.green_storage_is_unified(session_id));
CREATE POLICY green_seat_rpc_update ON public.session_participants AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (public.green_storage_is_unified(session_id)) WITH CHECK (public.green_storage_is_unified(session_id));
CREATE POLICY green_seat_rpc_delete ON public.session_participants AS RESTRICTIVE FOR DELETE TO authenticated
    USING (public.green_storage_is_unified(session_id));

-- Regional Facilitator update rights are expressed by workflow state, avoiding
-- reliance on the legacy free-text handoff marker. The restrictive gate and
-- mutation trigger still intersect this permissive policy.
CREATE POLICY green_regional_action_update ON public.actions FOR UPDATE TO authenticated
    USING (NOT public.green_storage_is_unified(session_id) AND public.green_has_capability(session_id,'submit')
        AND public.green_owns_scope(session_id,team,delegation_id) AND status='draft'
        AND workflow_state IN ('forwarded_to_facilitator','returned_to_team'))
    WITH CHECK (NOT public.green_storage_is_unified(session_id) AND public.green_has_capability(session_id,'submit')
        AND public.green_owns_scope(session_id,team,delegation_id) AND status IN ('draft','submitted'));

CREATE OR REPLACE FUNCTION public.append_proposal_thread_message(
    requested_parent_message_id UUID, requested_content TEXT, requested_message_type TEXT,
    requested_facilitator_decision TEXT DEFAULT NULL, requested_client_message_id TEXT DEFAULT NULL
)
RETURNS public.communications LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent public.communications%ROWTYPE; retry public.communications%ROWTYPE;
BEGIN
    SELECT * INTO parent FROM public.communications WHERE id=requested_parent_message_id;
    IF parent.id IS NULL THEN RAISE EXCEPTION 'Proposal thread parent message not found.' USING ERRCODE='P0002'; END IF;
    IF NOT public.green_storage_is_unified(parent.session_id) THEN
        PERFORM public.green_require_open_session(parent.session_id);
        IF public.green_has_capability(parent.session_id,'thread') IS DISTINCT FROM true
            OR public.green_can_read_record('communications',to_jsonb(parent)) IS DISTINCT FROM true THEN
            RAISE EXCEPTION 'GC03_THREAD_SCOPE_DENIED' USING ERRCODE='42501';
        END IF;
        SELECT * INTO retry FROM public.communications WHERE metadata->>'client_message_id'=NULLIF(BTRIM(requested_client_message_id),'');
        IF retry.id IS NOT NULL AND (retry.session_id IS DISTINCT FROM parent.session_id
            OR public.green_can_read_record('communications',to_jsonb(retry)) IS DISTINCT FROM true
            OR retry.from_role IS DISTINCT FROM public.live_demo_participant_role(parent.session_id)) THEN
            RAISE EXCEPTION 'GC03_THREAD_SCOPE_DENIED' USING ERRCODE='42501';
        END IF;
    END IF;
    RETURN public.gc02_unified_append_proposal_thread_message(requested_parent_message_id,requested_content,
        requested_message_type,requested_facilitator_decision,requested_client_message_id);
END $$;

-- Regional PLI inputs/attribution are a later contract. Never dispatch a
-- privileged whole-session pipeline from a caller-supplied regional session ID.
CREATE FUNCTION public.green_authorize_derived_operation(requested_session_id UUID, requested_operation TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT auth.uid() IS NOT NULL AND public.green_storage_is_unified(requested_session_id)
        AND EXISTS (SELECT 1 FROM public.sessions WHERE id=requested_session_id
            AND session_classification='live_exercise' AND NOT is_protected
            AND (requested_operation='adjudicate' AND status='active'
                OR requested_operation='narrative' AND status IN ('active','archived')))
        AND (public.live_demo_has_operator_grant('gamemaster')
            OR public.live_demo_has_operator_grant('whitecell',requested_session_id))
$$;
REVOKE ALL ON FUNCTION public.green_authorize_derived_operation(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.green_authorize_derived_operation(UUID,TEXT) TO authenticated;

-- Default EXECUTE is PUBLIC in PostgreSQL. Explicitly close every new helper
-- and retained implementation, then expose only the intended API/policy helpers.
DO $$ DECLARE f RECORD; BEGIN
    FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
        AND (proname LIKE 'gc03_%' OR proname IN ('green_semantic_role','green_has_capability','green_require_open_session',
            'green_owns_scope','green_can_read_record','guard_green_authority','guard_green_session_lifecycle','live_demo_participant_role',
            'live_demo_participant_surface','live_demo_can_read_session','get_session_role_seat_limit',
            'claim_session_role_seat','heartbeat_session_role_seat','disconnect_session_role_seat',
            'operator_remove_session_participant','release_stale_session_role_seats_internal')) LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.claim_session_role_seat(UUID,TEXT,TEXT,TEXT,INTEGER),
    public.heartbeat_session_role_seat(UUID,UUID,TEXT,INTEGER),public.disconnect_session_role_seat(UUID,UUID,TEXT,INTEGER),
    public.operator_remove_session_participant(UUID,UUID),public.green_semantic_role(UUID),public.green_has_capability(UUID,TEXT),
    public.green_owns_scope(UUID,TEXT,TEXT),public.green_can_read_record(TEXT,JSONB),
    public.live_demo_participant_role(UUID),public.live_demo_participant_surface(UUID),public.live_demo_can_read_session(UUID)
    TO authenticated;
COMMIT;
