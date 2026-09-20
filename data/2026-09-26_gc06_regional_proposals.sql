-- GC-06. Apply after GC-05 and all September 20/21 repairs. No history backfill.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

ALTER TABLE public.actions ADD COLUMN proposal_handoff_revision BIGINT;

CREATE FUNCTION public.gc06_proposal(a JSONB) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE SET search_path=public AS $$
    SELECT COALESCE(a->>'artifact_type'='proposal' AND a->>'team'='green'
        AND a->>'delegation_id' IN ('asian_pacific','europe')
        AND a->>'ally_contingencies' LIKE 'Proposal Details%',false)
$$;

CREATE FUNCTION public.get_regional_proposal_roster(requested_session_id UUID, requested_delegation_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE seat JSONB := public.green_storage_current_seat(requested_session_id); snapshot JSONB;
BEGIN
    IF seat IS NULL OR public.green_storage_is_unified(requested_session_id)
        OR requested_delegation_id IS NULL OR requested_delegation_id NOT IN ('asian_pacific','europe')
        OR NOT (seat->>'role'='green_shared_facilitator'
            OR seat->>'role' IN ('green_'||requested_delegation_id||'_scribe','green_'||requested_delegation_id||'_facilitator')) THEN
        RAISE EXCEPTION 'GC06_ROSTER_SCOPE_DENIED' USING ERRCODE='42501';
    END IF;
    SELECT green_roster_snapshot INTO snapshot FROM public.sessions WHERE id=requested_session_id;
    IF jsonb_typeof(snapshot->requested_delegation_id) IS DISTINCT FROM 'array'
        OR jsonb_array_length(snapshot->requested_delegation_id)=0 THEN
        RAISE EXCEPTION 'GC06_APPROVED_SESSION_ROSTER_REQUIRED' USING ERRCODE='23514';
    END IF;
    RETURN jsonb_build_object('members',snapshot->requested_delegation_id,'aliases',snapshot->'aliases');
END $$;

-- This predicate grants only updates of an already persisted, handed-off proposal.
-- The general submit/thread/RFI/direct capability flags remain unchanged.
CREATE FUNCTION public.gc06_shared_change(prior JSONB,item JSONB) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT COALESCE(public.green_storage_current_seat((prior->>'session_id')::UUID)->>'role'='green_shared_facilitator'
        AND public.gc06_proposal(prior) AND public.gc06_proposal(item)
        AND NOT (prior->>'is_deleted')::BOOLEAN
        AND prior->>'status'='draft' AND item->>'status' IN ('draft','submitted')
        AND prior->>'workflow_state' IN ('forwarded_to_facilitator','returned_to_team')
        AND (item->>'status'='draft' OR prior->>'proposal_handoff_revision'=prior->>'revision_number')
        AND (prior - ARRAY['goal','sector','expected_outcomes','ally_contingencies','artifact_payload','proposal_recipient_team',
            'status','submitted_at','submitted_by_auth_user_id','submitted_by_role','updated_at','row_version',
            'last_modified_by_auth_user_id','last_modified_by_role','workflow_state','draft_duration_seconds'])
          = (item - ARRAY['goal','sector','expected_outcomes','ally_contingencies','artifact_payload','proposal_recipient_team',
            'status','submitted_at','submitted_by_auth_user_id','submitted_by_role','updated_at','row_version',
            'last_modified_by_auth_user_id','last_modified_by_role','workflow_state','draft_duration_seconds'])
        -- Extract JSONB before removing its key; subtraction binds before ->.
        AND ((prior->'artifact_payload') - 'proposal'::TEXT) = ((item->'artifact_payload') - 'proposal'::TEXT),false)
$$;

CREATE POLICY gc06_proposal_rpc_only ON public.actions AS RESTRICTIVE FOR ALL TO authenticated
    USING (true) WITH CHECK (public.green_storage_is_unified(session_id) OR public.green_storage_operator(session_id)
        OR team<>'green' OR artifact_type<>'proposal');

CREATE FUNCTION public.gc06_proposal_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF public.green_storage_is_unified(NEW.session_id) THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND (OLD.artifact_type='proposal' OR NEW.artifact_type='proposal')
        AND (OLD.artifact_type IS DISTINCT FROM NEW.artifact_type
            OR public.gc06_proposal(to_jsonb(OLD)) IS DISTINCT FROM public.gc06_proposal(to_jsonb(NEW))) THEN
        RAISE EXCEPTION 'GC06_PROPOSAL_TYPE_IMMUTABLE' USING ERRCODE='42501';
    END IF;
    IF public.gc06_proposal(to_jsonb(NEW)) AND TG_OP='UPDATE'
        AND OLD.status<>'draft' AND NEW.status='draft' THEN
        NEW.proposal_handoff_revision := NULL;
        NEW.artifact_payload := jsonb_set(NEW.artifact_payload,'{proposal_recipient_review_history}',
            COALESCE(OLD.artifact_payload->'proposal_recipient_review_history','{}'::JSONB)
            || jsonb_build_object(OLD.revision_number::TEXT,COALESCE(OLD.artifact_payload->'proposal_recipient_reviews','{}'::JSONB)))
            || jsonb_build_object('proposal_recipient_reviews','{}'::JSONB);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER zzz_gc06_proposal_guard BEFORE INSERT OR UPDATE ON public.actions
    FOR EACH ROW EXECUTE FUNCTION public.gc06_proposal_guard();

CREATE FUNCTION public.write_regional_proposal(requested_session_id UUID, requested_delegation_id TEXT,
    requested_action_id UUID, requested_expected_revision BIGINT, requested_expected_row_version BIGINT,
    requested_operation TEXT, requested_payload JSONB, requested_client_key TEXT)
RETURNS public.actions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE seat JSONB; a public.actions%ROWTYPE; roster JSONB; details TEXT; origins JSONB;
    recipients JSONB; sectors JSONB; areas JSONB; handoff TEXT; key TEXT; scribe BOOLEAN; facilitator BOOLEAN;
    game public.game_state%ROWTYPE; p JSONB; field TEXT;
BEGIN
    PERFORM public.green_require_open_session(requested_session_id); -- session lock serializes retries
    seat := public.green_storage_current_seat(requested_session_id);
    roster := public.get_regional_proposal_roster(requested_session_id,requested_delegation_id);
    scribe := seat->>'role'='green_'||requested_delegation_id||'_scribe';
    facilitator := seat->>'role' IN ('green_shared_facilitator','green_'||requested_delegation_id||'_facilitator');
    IF requested_operation IS NULL OR NOT COALESCE(
        scribe AND requested_operation IN ('save','forward') OR facilitator AND requested_operation IN ('edit','submit'),false) THEN
        RAISE EXCEPTION 'GC06_PROPOSAL_SCOPE_DENIED' USING ERRCODE='42501';
    END IF;
    IF requested_action_id IS NOT NULL THEN
        SELECT * INTO a FROM public.actions WHERE id=requested_action_id FOR UPDATE;
        IF a.id IS NULL OR a.session_id IS DISTINCT FROM requested_session_id
            OR a.delegation_id IS DISTINCT FROM requested_delegation_id OR a.is_deleted OR NOT public.gc06_proposal(to_jsonb(a)) THEN
            RAISE EXCEPTION 'GC06_PROPOSAL_SCOPE_DENIED' USING ERRCODE='42501';
        END IF;
        IF a.revision_number IS DISTINCT FROM requested_expected_revision OR a.row_version IS DISTINCT FROM requested_expected_row_version THEN
            RAISE EXCEPTION 'GC06_STALE_PROPOSAL_REVISION' USING ERRCODE='PT409';
        END IF;
        IF a.status<>'draft' OR NOT (scribe AND a.workflow_state IN ('draft','returned_to_team')
            OR facilitator AND a.workflow_state IN ('forwarded_to_facilitator','returned_to_team')) THEN
            RAISE EXCEPTION 'GC06_PROPOSAL_STATE_DENIED' USING ERRCODE='23514';
        END IF;
    ELSIF NOT scribe OR requested_expected_revision IS NOT NULL OR requested_expected_row_version IS NOT NULL THEN
        RAISE EXCEPTION 'GC06_NEW_PROPOSAL_SCOPE_DENIED' USING ERRCODE='42501';
    END IF;
    IF requested_operation='submit' THEN
        IF requested_payload IS DISTINCT FROM '{}'::JSONB THEN RAISE EXCEPTION 'GC06_PROPOSAL_FIELDS_DENIED' USING ERRCODE='42501'; END IF;
        IF a.proposal_handoff_revision IS DISTINCT FROM a.revision_number AND NOT (
            public.green_session_seat_model(a.session_id)='regional_pairs_v1'
            AND a.proposal_handoff_revision IS NULL AND a.revision_number=1 AND a.workflow_state='forwarded_to_facilitator') THEN
            RAISE EXCEPTION 'GC06_SCRIBE_HANDOFF_REQUIRED' USING ERRCODE='23514';
        END IF;
        UPDATE public.actions SET status='submitted' WHERE id=a.id RETURNING * INTO a;
        RETURN a;
    END IF;
    IF requested_payload IS NULL OR jsonb_typeof(requested_payload)<>'object'
        OR (requested_payload - ARRAY['goal','sector','expected_outcomes','ally_contingencies'])<>'{}'::JSONB THEN
        RAISE EXCEPTION 'GC06_PROPOSAL_FIELDS_DENIED' USING ERRCODE='42501';
    END IF;
    details := requested_payload->>'ally_contingencies';
    handoff := public.action_legacy_detail(details,'Scribe Handoff');
    IF details NOT LIKE 'Proposal Details%' OR details IS NULL OR handoff IS DISTINCT FROM
        (CASE WHEN requested_operation='forward' OR requested_operation='edit' THEN 'Forwarded' ELSE 'Draft' END) THEN
        RAISE EXCEPTION 'GC06_PROPOSAL_DETAILS_REQUIRED' USING ERRCODE='23514';
    END IF;
    origins := public.proposal_detail_jsonb_list(NULL,details,'Originators');
    recipients := public.proposal_detail_jsonb_list(NULL,details,'Recipient Teams');
    sectors := public.proposal_detail_jsonb_list(NULL,details,'Focus Sectors');
    areas := public.proposal_detail_jsonb_list(NULL,details,'Supply Chain Areas');
    IF jsonb_array_length(origins)=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(origins) x(value)
        WHERE value IS NULL OR NOT (roster->'members' ? COALESCE(roster->'aliases'->>value,value))) THEN
        RAISE EXCEPTION 'GC06_INVALID_ORIGINATOR' USING ERRCODE='23514';
    END IF;
    IF jsonb_array_length(recipients)=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(recipients) x(value) WHERE value IS NULL OR value NOT IN ('blue','red'))
        OR jsonb_array_length(sectors)=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(sectors) x(value) WHERE NULLIF(BTRIM(value),'') IS NULL) OR NULLIF(BTRIM(requested_payload->>'goal'),'') IS NULL
        OR NULLIF(BTRIM(requested_payload->>'expected_outcomes'),'') IS NULL
        OR COALESCE(public.action_legacy_detail(details,'Supply Chain Focus Decision'),'') NOT IN ('Yes','No')
        OR public.action_legacy_detail(details,'Supply Chain Focus Decision')='Yes' AND (jsonb_array_length(areas)=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(areas) x(value) WHERE NULLIF(BTRIM(value),'') IS NULL)) THEN
        RAISE EXCEPTION 'GC06_PROPOSAL_DETAILS_REQUIRED' USING ERRCODE='23514';
    END IF;
    FOREACH field IN ARRAY ARRAY['Objective','Intended Partners','Timing And Conditions'] LOOP
        IF NULLIF(BTRIM(public.action_legacy_detail(details,field)),'') IS NULL THEN
            RAISE EXCEPTION 'GC06_PROPOSAL_DETAILS_REQUIRED: %',field USING ERRCODE='23514';
        END IF;
    END LOOP;
    -- Legacy text remains the complete field record. The structured projection is
    -- generated here; browser payloads cannot mint approvals or ownership evidence.
    p := jsonb_build_object('title',requested_payload->>'goal','expectedOutcomes',requested_payload->>'expected_outcomes','legacy_details',details,'originators',origins,'recipientTeams',recipients,'focusSectors',sectors,
        'objective',public.action_legacy_detail(details,'Objective'),'intendedPartners',public.action_legacy_detail(details,'Intended Partners'),
        'timingAndConditions',public.action_legacy_detail(details,'Timing And Conditions'),
        'supplyChainFocusDecision',public.action_legacy_detail(details,'Supply Chain Focus Decision'),'supplyChainAreas',areas);
    IF a.id IS NULL THEN
        IF NULLIF(BTRIM(requested_client_key),'') IS NULL THEN RAISE EXCEPTION 'GC06_CLIENT_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
        key := 'gc06:'||requested_delegation_id||':'||(seat->>'id');
        key := key||':'||requested_client_key;
        SELECT * INTO a FROM public.actions WHERE session_id=requested_session_id AND idempotency_key=key;
        IF a.id IS NOT NULL THEN
            IF a.delegation_id IS DISTINCT FROM requested_delegation_id OR NOT public.gc06_proposal(to_jsonb(a))
                OR a.goal IS DISTINCT FROM requested_payload->>'goal' OR a.ally_contingencies IS DISTINCT FROM details
                OR a.expected_outcomes IS DISTINCT FROM requested_payload->>'expected_outcomes' THEN
                RAISE EXCEPTION 'GC06_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';
            END IF;
            RETURN a;
        END IF;
        SELECT * INTO game FROM public.game_state WHERE session_id=requested_session_id;
        INSERT INTO public.actions(session_id,team,delegation_id,move,phase,mechanism,sector,goal,expected_outcomes,
            ally_contingencies,status,artifact_type,artifact_payload,proposal_recipient_team,idempotency_key,proposal_handoff_revision)
        VALUES(requested_session_id,'green',requested_delegation_id,game.move,game.phase,'Proposal',sectors->>0,
            requested_payload->>'goal',requested_payload->>'expected_outcomes',details,'draft','proposal',jsonb_build_object('proposal',p),
            recipients->>0,key,CASE WHEN requested_operation='forward' THEN 1 END) RETURNING * INTO a;
    ELSE
        UPDATE public.actions SET goal=requested_payload->>'goal',sector=sectors->>0,
            expected_outcomes=requested_payload->>'expected_outcomes',ally_contingencies=details,
            artifact_payload=artifact_payload||jsonb_build_object('proposal',p),proposal_recipient_team=recipients->>0,
            proposal_handoff_revision=CASE WHEN scribe THEN CASE WHEN requested_operation='forward' THEN revision_number END ELSE proposal_handoff_revision END
        WHERE id=a.id RETURNING * INTO a;
    END IF;
    RETURN a;
END $$;

-- Validate persisted source and approval root, not caller metadata or a selected view.
-- Historical threads remain readable; new rounds require the approved current revision.
CREATE FUNCTION public.gc06_thread_source(item JSONB, require_current BOOLEAN DEFAULT false) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT EXISTS (SELECT 1 FROM public.actions a JOIN public.communications root
        ON root.session_id=a.session_id AND root.type='PROPOSAL_FORWARDED'
        AND root.metadata->>'source_proposal_id'=a.id::TEXT
        AND root.metadata->>'thread_id'=item#>>'{metadata,thread_id}'
        AND root.metadata->>'recipient_team'=item#>>'{metadata,recipient_team}'
        AND root.metadata->>'source_revision'=item#>>'{metadata,source_revision}'
        WHERE a.id::TEXT=item#>>'{metadata,source_proposal_id}' AND a.session_id::TEXT=item->>'session_id'
        AND a.artifact_type='proposal' AND NOT a.is_deleted
        AND a.team=item#>>'{metadata,source_team}' AND a.team=item->>'owner_team'
        AND a.delegation_id IS NOT DISTINCT FROM item->>'delegation_id'
        AND root.delegation_id IS NOT DISTINCT FROM a.delegation_id
        AND (NOT require_current OR (a.status IN ('submitted','adjudicated')
            AND a.revision_number::TEXT=item#>>'{metadata,source_revision}'
            AND a.artifact_payload#>>ARRAY['proposal_recipient_reviews',item#>>'{metadata,recipient_team}','thread_id']=root.metadata->>'thread_id')))
$$;

DO $patch$
DECLARE d TEXT; old TEXT; replacement TEXT;
BEGIN
    d := pg_get_functiondef('public.guard_green_owned_record()'::regprocedure);
    old := 'public.gc05_shared_submission(to_jsonb(OLD),to_jsonb(NEW))';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC06_OWNERSHIP_DRIFT'; END IF;
    EXECUTE replace(d,old,'(public.gc05_shared_submission(to_jsonb(OLD),to_jsonb(NEW)) OR public.gc06_shared_change(to_jsonb(OLD),to_jsonb(NEW)))');
    d := pg_get_functiondef('public.guard_green_authority()'::regprocedure);
    old := 'AND public.gc05_shared_submission(prior,item);';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC06_AUTHORITY_DRIFT'; END IF;
    d := replace(d,old,$body$AND (public.gc05_shared_submission(prior,item) OR public.gc06_shared_change(prior,item));
        IF TG_TABLE_NAME='communications' AND TG_OP='INSERT' THEN
            allowed := item->>'type'='PROPOSAL_RESPONSE_REVIEW' AND item->>'from_role'=seat->>'role'
                AND item->>'owner_team'='green' AND public.gc06_thread_source(item,true);
        END IF;$body$);
    old := 'AND public.gc05_orientation(to_jsonb(a))';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC06_AUDIT_DRIFT'; END IF;
    d := replace(d,old,'AND (public.gc05_orientation(to_jsonb(a)) OR public.gc06_proposal(to_jsonb(a)))');
    d := replace(d,'AND a.submitted_by_auth_user_id=auth.uid() AND a.status=''submitted''',
        'AND (a.submitted_by_auth_user_id=auth.uid() AND a.status=''submitted'' OR public.gc06_proposal(to_jsonb(a)) AND a.last_modified_by_auth_user_id=auth.uid())');
    EXECUTE d;
    d := pg_get_functiondef('public.green_can_read_record(text,jsonb)'::regprocedure);
    old := 'IF seat->>''role''=''green_shared_facilitator'' THEN';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC06_READ_DRIFT'; END IF;
    EXECUTE replace(d,old,old||$body$
        IF table_name='actions' AND public.gc06_proposal(record)
            AND record->>'workflow_state' IN ('returned_to_team','resubmitted') THEN RETURN true; END IF;
        IF table_name='communications' AND record->>'type' IN ('PROPOSAL_FORWARDED','PROPOSAL_RESPONSE','PROPOSAL_RESPONSE_REVIEW') THEN
            RETURN COALESCE(record->>'owner_team'='green' AND public.gc06_thread_source(record)
                AND (record->>'type'<>'PROPOSAL_RESPONSE_REVIEW' OR record->>'from_role'=seat->>'role'),false);
        END IF;
        IF table_name IN ('artifact_workflow_reviews','action_logs') THEN
            SELECT to_jsonb(a) INTO linked FROM public.actions a
                WHERE a.id::TEXT=COALESCE(record->>'artifact_id',record->>'action_id') AND a.session_id=sid;
            IF public.gc06_proposal(linked) THEN RETURN public.green_can_read_record('actions',linked)
                AND (table_name='action_logs' OR record->>'team'=linked->>'team'
                    AND record->>'delegation_id'=linked->>'delegation_id'); END IF;
        END IF;
$body$);
    -- Shared sender scope is inherited from the persisted proposal, never a view.
    d := pg_get_functiondef('public.capture_green_communication_scope()'::regprocedure);
    old := 'sender_team := CASE WHEN sender_delegation IS NOT NULL THEN ''green''';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC06_SENDER_DRIFT'; END IF;
    EXECUTE replace(d,old,$body$IF NEW.from_role='green_shared_facilitator' AND is_thread
        AND public.green_session_seat_model(NEW.session_id)='shared_facilitator_v1' AND source_team='green' THEN
        sender_delegation := source_delegation;
    END IF;
    sender_team := CASE WHEN sender_delegation IS NOT NULL THEN 'green'$body$);
END $patch$;

CREATE OR REPLACE FUNCTION public.append_proposal_thread_message(requested_parent_message_id UUID,
    requested_content TEXT, requested_message_type TEXT, requested_facilitator_decision TEXT DEFAULT NULL,
    requested_client_message_id TEXT DEFAULT NULL)
RETURNS public.communications LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent public.communications%ROWTYPE; seat JSONB; key TEXT := requested_client_message_id;
BEGIN
    SELECT * INTO parent FROM public.communications WHERE id=requested_parent_message_id;
    IF parent.id IS NULL THEN RAISE EXCEPTION 'Proposal thread parent message not found.' USING ERRCODE='P0002'; END IF;
    IF NOT public.green_storage_is_unified(parent.session_id) THEN
        PERFORM public.green_require_open_session(parent.session_id);
        seat := public.green_storage_current_seat(parent.session_id);
        IF seat IS NULL OR public.gc06_thread_source(to_jsonb(parent),true) IS DISTINCT FROM true
            OR public.green_can_read_record('communications',to_jsonb(parent)) IS DISTINCT FROM true
            OR NOT (public.green_has_capability(parent.session_id,'thread') OR seat->>'role'='green_shared_facilitator' AND parent.owner_team='green') THEN
            RAISE EXCEPTION 'GC06_THREAD_SCOPE_DENIED' USING ERRCODE='42501';
        END IF;
        IF NULLIF(BTRIM(key),'') IS NOT NULL THEN
            key := 'gc06:'||parent.session_id||':'||(seat->>'id')||':'||(parent.metadata->>'thread_id')||':'||key;
        END IF;
    END IF;
    RETURN public.gc02_unified_append_proposal_thread_message(requested_parent_message_id,requested_content,
        requested_message_type,requested_facilitator_decision,key);
END $$;

-- The operator response-forward RPC must also reject a stale/replaced approval
-- before its SECURITY DEFINER insert. Existing immutable root/review/parent checks
-- and terminal PT409 codes stay in place.
DO $$ DECLARE d TEXT; old TEXT; BEGIN
    d := pg_get_functiondef('public.operator_forward_proposal_response(uuid)'::regprocedure);
    old := 'IF NULLIF(BTRIM(review_row.content), '''') IS NULL';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC06_RESPONSE_FORWARD_DRIFT'; END IF;
    EXECUTE replace(d,old,$body$IF NOT public.green_storage_is_unified(review_row.session_id) THEN
        PERFORM public.green_require_open_session(review_row.session_id);
        IF public.green_storage_current_seat(review_row.session_id)->>'role' NOT IN ('whitecell_lead','whitecell_support')
            OR public.green_storage_current_seat(review_row.session_id) IS NULL
            OR public.gc06_thread_source(to_jsonb(review_row),true) IS DISTINCT FROM true THEN
            RAISE EXCEPTION 'GC06_RESPONSE_FORWARD_DENIED' USING ERRCODE='42501';
        END IF;
    END IF;
    IF NULLIF(BTRIM(review_row.content), '') IS NULL$body$);
END $$;

-- Keep a single lock order for every regional proposal mutation: session, then
-- artifact/thread row. This also serializes approval/return with participant writes.
DO $$ DECLARE d TEXT; target TEXT; prelude TEXT; BEGIN
    FOREACH target IN ARRAY ARRAY[
        'public.operator_review_proposal(uuid,text,text,text,integer)',
        'public.operator_review_artifact(text,uuid,text,text,bigint,text)',
        'public.operator_forward_proposal_response(uuid)'] LOOP
        d := pg_get_functiondef(target::regprocedure);
        IF target LIKE '%operator_review_proposal%' THEN
            prelude := 'PERFORM public.green_require_open_session(a.session_id) FROM public.actions a WHERE a.id=requested_action_id AND a.artifact_type=''proposal'' AND NOT public.green_storage_is_unified(a.session_id);';
        ELSIF target LIKE '%operator_review_artifact%' THEN
            prelude := $body$PERFORM public.green_require_open_session(a.session_id) FROM public.actions a WHERE a.id=requested_artifact_id AND a.artifact_type='proposal' AND NOT public.green_storage_is_unified(a.session_id);
IF EXISTS (SELECT 1 FROM public.actions a WHERE a.id=requested_artifact_id AND a.artifact_type='proposal' AND NOT public.green_storage_is_unified(a.session_id)
    AND (public.green_storage_current_seat(a.session_id) IS NULL
        OR public.green_storage_current_seat(a.session_id)->>'role' NOT IN ('whitecell_lead','whitecell_support')
        OR requested_expected_revision IS NULL)) THEN
    RAISE EXCEPTION 'GC06_ACTIVE_REVIEWER_AND_REVISION_REQUIRED' USING ERRCODE='42501';
END IF;$body$;
        ELSE
            prelude := 'PERFORM public.green_require_open_session(c.session_id) FROM public.communications c WHERE c.id=requested_review_communication_id AND NOT public.green_storage_is_unified(c.session_id);';
        END IF;
        IF position('BEGIN' IN d)=0 THEN RAISE EXCEPTION 'GC06_LOCK_ORDER_DRIFT: %',target; END IF;
        -- First BEGIN only; retain all nested exception blocks and ACLs.
        d := overlay(d placing 'BEGIN'||chr(10)||prelude||chr(10) from position('BEGIN' IN d) for length('BEGIN'));
        EXECUTE d;
    END LOOP;
END $$;

-- A returned, partially approved proposal needs fresh independent approvals.
-- Old roots remain immutable and retain their own revision and thread IDs.
DROP INDEX public.communications_proposal_recipient_root_unique;
CREATE UNIQUE INDEX communications_proposal_recipient_root_unique ON public.communications
    ((metadata->>'source_proposal_id'),(LOWER(metadata->>'recipient_team')),
        (CASE WHEN delegation_id IS NOT NULL THEN metadata->>'source_revision' ELSE 'legacy' END))
    WHERE type='PROPOSAL_FORWARDED' AND NULLIF(metadata->>'source_proposal_id','') IS NOT NULL;
DO $$ DECLARE d TEXT; old TEXT; BEGIN
    d := pg_get_functiondef('public.operator_review_proposal(uuid,text,text,text,integer)'::regprocedure);
    old := 'reviewer_role := COALESCE(';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC06_REVIEWER_DRIFT'; END IF;
    d := replace(d,old,$body$IF NOT public.green_storage_is_unified(action_row.session_id) AND (
        public.green_storage_current_seat(action_row.session_id) IS NULL
        OR public.green_storage_current_seat(action_row.session_id)->>'role' NOT IN ('whitecell_lead','whitecell_support')
        OR requested_expected_revision IS NULL) THEN
        RAISE EXCEPTION 'GC06_ACTIVE_REVIEWER_AND_REVISION_REQUIRED' USING ERRCODE='42501';
    END IF;
    reviewer_role := COALESCE($body$);
    old := 'AND metadata ->> ''source_proposal_id'' = action_row.id::TEXT';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC06_APPROVAL_LOOKUP_DRIFT'; END IF;
    d := replace(d,old,old||' AND (action_row.delegation_id IS NULL OR metadata->>''source_revision''=action_row.revision_number::TEXT)');
    old := 'AND metadata ->> ''source_proposal_id'' = updated_action.id::TEXT';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC06_APPROVAL_COUNT_DRIFT'; END IF;
    d := replace(d,old,old||' AND (updated_action.delegation_id IS NULL OR metadata->>''source_revision''=updated_action.revision_number::TEXT)');
    EXECUTE d;
END $$;

REVOKE ALL ON FUNCTION public.gc06_proposal(JSONB),public.gc06_shared_change(JSONB,JSONB),public.gc06_proposal_guard(),
    public.gc06_thread_source(JSONB,BOOLEAN),public.get_regional_proposal_roster(UUID,TEXT),
    public.write_regional_proposal(UUID,TEXT,UUID,BIGINT,BIGINT,TEXT,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_regional_proposal_roster(UUID,TEXT),
    public.write_regional_proposal(UUID,TEXT,UUID,BIGINT,BIGINT,TEXT,JSONB,TEXT) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
