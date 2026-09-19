-- GC-05 only. Apply after September 24, including the September 20/21 repairs.
-- No historical backfill, roster approval, proposal/RFI authority or seat changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.actions ADD COLUMN orientation_handoff_revision BIGINT;

CREATE FUNCTION public.gc05_orientation(a JSONB)
RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE SET search_path = public AS $$
    SELECT COALESCE(a->>'artifact_type' IN ('strategic_orientation_selection','strategic_orientation_forecast')
        AND a->>'ally_contingencies' LIKE 'Strategic Orientation Details%', false)
$$;

-- Called before and after workflow normalization. Only server-generated submit
-- bookkeeping may differ; all content, ownership, review evidence and handoff
-- revision remain immutable for the shared Facilitator.
CREATE FUNCTION public.gc05_shared_submission(prior JSONB, item JSONB)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(public.green_session_seat_model((prior->>'session_id')::UUID)='shared_facilitator_v1'
        AND public.green_storage_current_seat((prior->>'session_id')::UUID)->>'role'='green_shared_facilitator'
        AND public.gc05_orientation(prior) AND public.gc05_orientation(item)
        AND prior->>'team'='green' AND prior->>'delegation_id' IN ('asian_pacific','europe')
        AND NOT COALESCE((prior->>'is_deleted')::BOOLEAN,false)
        AND prior->>'status'='draft' AND item->>'status'='submitted'
        AND prior->>'workflow_state' IN ('forwarded_to_facilitator','returned_to_team')
        AND prior->>'orientation_handoff_revision'=prior->>'revision_number'
        AND (prior - ARRAY['status','submitted_at','submitted_by_auth_user_id','submitted_by_role',
            'updated_at','row_version','last_modified_by_auth_user_id','last_modified_by_role',
            'workflow_state','draft_duration_seconds'])
          = (item - ARRAY['status','submitted_at','submitted_by_auth_user_id','submitted_by_role',
            'updated_at','row_version','last_modified_by_auth_user_id','last_modified_by_role',
            'workflow_state','draft_duration_seconds']), false)
$$;

-- Patch exact GC-04A sites in place: retain OIDs, ACLs and all unrelated branches.
-- Drift fails installation instead of overwriting a later permission stage.
DO $patch$
DECLARE d TEXT; old TEXT; replacement TEXT;
BEGIN
    d := pg_get_functiondef('public.guard_green_owned_record()'::regprocedure);
    old := 'IF seat IS NULL OR public.green_role_delegation(seat ->> ''role'') IS DISTINCT FROM NEW.delegation_id';
    replacement := 'IF TG_TABLE_NAME=''actions'' AND TG_OP=''UPDATE'' AND public.gc05_shared_submission(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
            ' || old;
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC05_OWNERSHIP_FUNCTION_DRIFT'; END IF;
    EXECUTE replace(d,old,replacement);

    d := pg_get_functiondef('public.guard_green_authority()'::regprocedure);
    old := 'allowed := false; -- Read-only foundation; GC-06/07 own mutation contracts.';
    replacement := $body$allowed := TG_TABLE_NAME='actions' AND TG_OP='UPDATE'
            AND public.gc05_shared_submission(prior,item);
        -- Existing AFTER triggers capture the authorized orientation atomically.
        -- This does not grant browser writes to logs, research or timeline.
        IF TG_OP='INSERT' AND pg_trigger_depth()>1 THEN
            IF TG_TABLE_NAME='action_logs' THEN
                allowed := EXISTS (SELECT 1 FROM public.actions a WHERE a.id::TEXT=item->>'action_id'
                    AND a.session_id=sid AND public.gc05_orientation(to_jsonb(a))
                    AND a.submitted_by_auth_user_id=auth.uid() AND a.status='submitted');
            ELSIF TG_TABLE_NAME LIKE 'research_%' THEN
                allowed := true;
            END IF;
        END IF;$body$;
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC05_AUTHORITY_FUNCTION_DRIFT'; END IF;
    EXECUTE replace(d,old,replacement);

    d := pg_get_functiondef('public.green_can_read_record(text,jsonb)'::regprocedure);
    old := 'IF seat->>''role''=''green_shared_facilitator'' THEN';
    replacement := old || $body$
        IF table_name='artifact_workflow_reviews' THEN
            SELECT to_jsonb(a) INTO linked FROM public.actions a
                WHERE a.id::TEXT=record->>'artifact_id' AND a.session_id=sid
                    AND a.team=record->>'team' AND a.delegation_id=record->>'delegation_id';
            RETURN COALESCE(record->>'artifact_kind'='strategic_orientation'
                AND record->>'artifact_type'=linked->>'artifact_type'
                AND (record->>'next_revision_number')::BIGINT <= (linked->>'revision_number')::BIGINT
                AND public.gc05_orientation(linked) AND public.green_can_read_record('actions',linked),false);
        END IF;
        IF table_name='actions' AND public.gc05_orientation(record)
            AND record->>'team'='green' AND record->>'delegation_id' IN ('asian_pacific','europe')
            AND record->>'workflow_state' IN ('returned_to_team','resubmitted') THEN RETURN true; END IF;
        IF table_name='action_logs' THEN
            SELECT to_jsonb(a) INTO linked FROM public.actions a
                WHERE a.id::TEXT=record->>'action_id' AND a.session_id=sid;
            RETURN COALESCE(public.gc05_orientation(linked)
                AND public.green_can_read_record('actions',linked),false);
        END IF;
$body$;
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC05_READ_FUNCTION_DRIFT'; END IF;
    EXECUTE replace(d,old,replacement);
END $patch$;

-- Regional orientation mutations use version-bound RPCs, including for paired
-- seats. RLS still allows existing non-orientation operations unchanged.
CREATE POLICY gc05_orientation_rpc_only ON public.actions AS RESTRICTIVE FOR ALL TO authenticated
    USING (true)
    WITH CHECK (public.green_storage_is_unified(session_id) OR public.green_storage_operator(session_id)
        OR team<>'green' OR NOT public.gc05_orientation(to_jsonb(actions)));

CREATE FUNCTION public.gc05_orientation_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid UUID; seat JSONB; is_orientation BOOLEAN;
BEGIN
    sid := CASE WHEN TG_OP='DELETE' THEN OLD.session_id ELSE NEW.session_id END;
    -- Serialize qualification changes with every phase/move gate check.
    PERFORM 1 FROM public.sessions WHERE id=sid FOR UPDATE;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    is_orientation := public.gc05_orientation(to_jsonb(NEW));
    IF TG_OP='UPDATE' AND NOT public.green_storage_is_unified(sid)
        AND (public.gc05_orientation(to_jsonb(OLD)) OR is_orientation)
        AND (OLD.artifact_type IS DISTINCT FROM NEW.artifact_type
            OR public.gc05_orientation(to_jsonb(OLD)) IS DISTINCT FROM is_orientation) THEN
        RAISE EXCEPTION 'GC05_ORIENTATION_TYPE_IMMUTABLE' USING ERRCODE='42501';
    END IF;
    IF NOT is_orientation OR public.green_storage_is_unified(sid) THEN RETURN NEW; END IF;
    IF TG_OP='INSERT' AND EXISTS (SELECT 1 FROM public.actions a WHERE a.session_id=sid
        AND a.team=NEW.team AND a.delegation_id IS NOT DISTINCT FROM NEW.delegation_id
        AND NOT a.is_deleted AND public.gc05_orientation(to_jsonb(a))) THEN
        RAISE EXCEPTION 'GC05_DUPLICATE_ORIENTATION' USING ERRCODE='23505';
    END IF;
    seat := public.green_storage_current_seat(sid);
    IF TG_OP='UPDATE' AND NEW.workflow_state='returned_to_team' AND OLD.status<>'draft' THEN
        NEW.orientation_handoff_revision := NULL;
    ELSIF NEW.status='draft' AND public.green_has_capability(sid,'draft')
        AND public.green_owns_scope(sid,NEW.team,NEW.delegation_id) THEN
        NEW.orientation_handoff_revision := CASE WHEN
            public.action_legacy_detail(NEW.ally_contingencies,'Scribe Handoff')='Forwarded'
            THEN NEW.revision_number ELSE NULL END;
    ELSIF TG_OP='UPDATE' THEN
        NEW.orientation_handoff_revision := OLD.orientation_handoff_revision;
    END IF;
    RETURN NEW;
END $$;
-- Canonicalization and normalization precede this, authority follows it.
CREATE TRIGGER zzz_gc05_orientation_guard BEFORE INSERT OR UPDATE OR DELETE ON public.actions
    FOR EACH ROW EXECUTE FUNCTION public.gc05_orientation_guard();

CREATE FUNCTION public.handoff_regional_orientation(requested_session_id UUID, requested_delegation_id TEXT,
    requested_action_id UUID, requested_expected_revision BIGINT, requested_expected_row_version BIGINT,
    requested_details TEXT, requested_goal TEXT)
RETURNS public.actions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE seat JSONB; a public.actions%ROWTYPE; own JSONB; forecasts JSONB;
BEGIN
    PERFORM public.green_require_open_session(requested_session_id);
    seat := public.green_storage_current_seat(requested_session_id);
    IF seat IS NULL OR public.green_storage_is_unified(requested_session_id)
        OR requested_delegation_id NOT IN ('asian_pacific','europe') OR requested_delegation_id IS NULL
        OR seat->>'role' IS DISTINCT FROM 'green_'||requested_delegation_id||'_scribe'
        OR seat->>'delegation_id' IS DISTINCT FROM requested_delegation_id THEN
        RAISE EXCEPTION 'GC05_ORIENTATION_SCOPE_DENIED' USING ERRCODE='42501';
    END IF;
    -- Preserve the platform v2 catalogue and Green narrative contract.
    own := public.action_legacy_detail(requested_details,'Own Orientation')::JSONB;
    forecasts := public.action_legacy_detail(requested_details,'Forecast Targets')::JSONB;
    IF COALESCE(requested_details LIKE 'Strategic Orientation Details%',false) IS NOT TRUE
        OR public.action_legacy_detail(requested_details,'Team') IS DISTINCT FROM 'green'
        OR public.action_legacy_detail(requested_details,'Contract Version') IS DISTINCT FROM '2'
        OR public.action_legacy_detail(requested_details,'Period') IS DISTINCT FROM 'pre_move_1'
        OR public.action_legacy_detail(requested_details,'Artifact Type') IS DISTINCT FROM 'orientation_and_forecast'
        OR public.action_legacy_detail(requested_details,'Scribe Handoff') IS DISTINCT FROM 'Forwarded'
        OR COALESCE(own->>'id' IN ('pressure','stabilization','reframe'),false) IS NOT TRUE
        OR jsonb_typeof(forecasts) IS DISTINCT FROM 'array' OR jsonb_array_length(forecasts)<>1
        OR forecasts->0->>'key' IS DISTINCT FROM 'blue'
        OR COALESCE(forecasts->0->>'orientation' IN ('pressure','stabilization','reframe'),false) IS NOT TRUE
        OR NULLIF(BTRIM(public.action_legacy_detail(requested_details,'Strategy Description')),'') IS NULL THEN
        RAISE EXCEPTION 'GC05_ORIENTATION_DETAILS_REQUIRED' USING ERRCODE='23514';
    END IF;
    IF requested_action_id IS NULL THEN
        IF requested_expected_revision IS NOT NULL OR requested_expected_row_version IS NOT NULL THEN
            RAISE EXCEPTION 'GC05_NEW_ORIENTATION_VERSION' USING ERRCODE='PT409';
        END IF;
        INSERT INTO public.actions(session_id,team,delegation_id,move,phase,mechanism,sector,
            exposure_type,goal,expected_outcomes,ally_contingencies,status,artifact_type)
        VALUES(requested_session_id,'green',requested_delegation_id,1,1,'Strategic Orientation','',
            'pre_move_1',requested_goal,own->>'tag',requested_details,'draft','strategic_orientation_forecast')
        RETURNING * INTO a;
    ELSE
        SELECT * INTO a FROM public.actions WHERE id=requested_action_id FOR UPDATE;
        IF a.id IS NULL OR a.session_id IS DISTINCT FROM requested_session_id OR a.team<>'green'
            OR a.delegation_id IS DISTINCT FROM requested_delegation_id OR a.is_deleted
            OR NOT public.gc05_orientation(to_jsonb(a)) THEN
            RAISE EXCEPTION 'GC05_ORIENTATION_SCOPE_DENIED' USING ERRCODE='42501';
        END IF;
        IF a.revision_number IS DISTINCT FROM requested_expected_revision
            OR a.row_version IS DISTINCT FROM requested_expected_row_version THEN
            RAISE EXCEPTION 'GC05_STALE_ORIENTATION_REVISION' USING ERRCODE='PT409';
        END IF;
        IF a.status<>'draft' OR a.workflow_state NOT IN ('draft','returned_to_team') THEN
            RAISE EXCEPTION 'GC05_ORIENTATION_HANDOFF_STATE' USING ERRCODE='23514';
        END IF;
        UPDATE public.actions SET goal=requested_goal,expected_outcomes=own->>'tag',
            ally_contingencies=requested_details WHERE id=a.id RETURNING * INTO a;
    END IF;
    RETURN a;
END $$;

CREATE FUNCTION public.submit_regional_orientation(requested_session_id UUID, requested_delegation_id TEXT,
    requested_action_id UUID, requested_expected_revision BIGINT, requested_expected_row_version BIGINT)
RETURNS public.actions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE seat JSONB; a public.actions%ROWTYPE;
BEGIN
    PERFORM public.green_require_open_session(requested_session_id);
    seat := public.green_storage_current_seat(requested_session_id);
    IF seat IS NULL OR public.green_storage_is_unified(requested_session_id)
        OR requested_delegation_id NOT IN ('asian_pacific','europe') OR requested_delegation_id IS NULL
        OR NOT (seat->>'role'='green_shared_facilitator'
            AND public.green_session_seat_model(requested_session_id)='shared_facilitator_v1'
            OR seat->>'role'='green_'||requested_delegation_id||'_facilitator'
            AND seat->>'delegation_id'=requested_delegation_id) THEN
        RAISE EXCEPTION 'GC05_ORIENTATION_SCOPE_DENIED' USING ERRCODE='42501';
    END IF;
    SELECT * INTO a FROM public.actions WHERE id=requested_action_id FOR UPDATE;
    IF a.id IS NULL OR a.session_id IS DISTINCT FROM requested_session_id OR a.team<>'green'
        OR a.delegation_id IS DISTINCT FROM requested_delegation_id OR a.is_deleted
        OR NOT public.gc05_orientation(to_jsonb(a)) THEN
        RAISE EXCEPTION 'GC05_ORIENTATION_SCOPE_DENIED' USING ERRCODE='42501';
    END IF;
    IF a.revision_number IS DISTINCT FROM requested_expected_revision
        OR a.row_version IS DISTINCT FROM requested_expected_row_version THEN
        RAISE EXCEPTION 'GC05_STALE_ORIENTATION_REVISION' USING ERRCODE='PT409';
    END IF;
    IF a.status<>'draft' OR a.workflow_state NOT IN ('forwarded_to_facilitator','returned_to_team')
        OR (a.orientation_handoff_revision IS DISTINCT FROM a.revision_number AND NOT (
            public.green_session_seat_model(requested_session_id)='regional_pairs_v1'
            AND a.orientation_handoff_revision IS NULL AND a.revision_number=1
            AND a.workflow_state='forwarded_to_facilitator')) THEN
        RAISE EXCEPTION 'GC05_ORIENTATION_HANDOFF_REQUIRED' USING ERRCODE='23514';
    END IF;
    UPDATE public.actions SET status='submitted' WHERE id=a.id RETURNING * INTO a;
    RETURN a;
END $$;

CREATE FUNCTION public.gc05_orientation_completion(sid UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE required TEXT[]; submitted TEXT[]; missing TEXT[];
BEGIN
    IF NOT EXISTS(SELECT 1 FROM public.sessions WHERE id=sid) THEN
        RAISE EXCEPTION 'GC05_SESSION_NOT_FOUND' USING ERRCODE='23503';
    END IF;
    required := CASE WHEN public.green_storage_is_unified(sid) THEN ARRAY['blue','green','red','industry']
        ELSE ARRAY['blue','green:asian_pacific','green:europe','red','industry'] END;
    SELECT COALESCE(array_agg(DISTINCT CASE WHEN a.team='green' AND NOT public.green_storage_is_unified(sid)
        THEN 'green:'||a.delegation_id ELSE a.team END),ARRAY[]::TEXT[]) INTO submitted
    FROM public.actions a WHERE a.session_id=sid AND NOT a.is_deleted
        AND a.status IN ('submitted','adjudicated') AND a.ally_contingencies LIKE 'Strategic Orientation Details%';
    SELECT COALESCE(array_agg(t),ARRAY[]::TEXT[]) INTO missing FROM unnest(required) t WHERE NOT t=ANY(submitted);
    RETURN jsonb_build_object('complete',cardinality(missing)=0,'requiredTeams',required,
        'submittedTeams',ARRAY(SELECT t FROM unnest(required) t WHERE t=ANY(submitted)),'missingTeams',missing);
END $$;

CREATE FUNCTION public.get_orientation_completion(requested_session_id UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.live_demo_can_read_session(requested_session_id) THEN
        RAISE EXCEPTION 'GC05_SESSION_ACCESS_REQUIRED' USING ERRCODE='42501';
    END IF;
    RETURN public.gc05_orientation_completion(requested_session_id);
END $$;

CREATE FUNCTION public.gc05_game_state_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE completion JSONB;
BEGIN
    IF TG_OP='UPDATE' AND ROW(NEW.session_id,NEW.move,NEW.phase) IS NOT DISTINCT FROM ROW(OLD.session_id,OLD.move,OLD.phase) THEN RETURN NEW; END IF;
    IF NEW.move=1 AND NEW.phase=1 THEN RETURN NEW; END IF;
    PERFORM 1 FROM public.sessions WHERE id=NEW.session_id FOR UPDATE;
    completion := public.gc05_orientation_completion(NEW.session_id);
    IF (completion->>'complete')::BOOLEAN IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Strategic Orientation submissions missing: %',completion->'missingTeams' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER gc05_game_state_gate BEFORE INSERT OR UPDATE ON public.game_state
    FOR EACH ROW EXECUTE FUNCTION public.gc05_game_state_gate();

REVOKE ALL ON FUNCTION public.gc05_orientation(JSONB),public.gc05_shared_submission(JSONB,JSONB),
    public.gc05_orientation_guard(),public.gc05_orientation_completion(UUID),public.gc05_game_state_gate(),
    public.handoff_regional_orientation(UUID,TEXT,UUID,BIGINT,BIGINT,TEXT,TEXT),
    public.submit_regional_orientation(UUID,TEXT,UUID,BIGINT,BIGINT),public.get_orientation_completion(UUID)
    FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gc05_orientation(JSONB),
    public.handoff_regional_orientation(UUID,TEXT,UUID,BIGINT,BIGINT,TEXT,TEXT),
    public.submit_regional_orientation(UUID,TEXT,UUID,BIGINT,BIGINT),public.get_orientation_completion(UUID) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
