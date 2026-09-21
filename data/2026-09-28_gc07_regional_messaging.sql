-- GC-07, after September 27. Additive; no historical records are rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE FUNCTION public.gc07_facilitates(sid UUID, region TEXT) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT COALESCE(NOT public.green_storage_is_unified(sid) AND region IN ('asian_pacific','europe')
        AND public.green_storage_current_seat(sid)->>'role' IN ('green_shared_facilitator','green_'||region||'_facilitator'),false)
$$;

ALTER TABLE public.requests ADD COLUMN gc07_client_key TEXT;
CREATE UNIQUE INDEX gc07_request_retry ON public.requests(session_id,gc07_client_key) WHERE gc07_client_key IS NOT NULL;
ALTER TABLE public.communications ADD COLUMN gc07_client_key TEXT;
CREATE UNIQUE INDEX gc07_direct_retry ON public.communications(session_id,gc07_client_key) WHERE gc07_client_key IS NOT NULL;

-- Regional Green uses the revision-bound RPC. Older unified table writes retain
-- their original policies. No browser can bypass the RPC with a supplied role.
CREATE POLICY gc07_request_rpc_only ON public.requests AS RESTRICTIVE FOR ALL TO authenticated
    USING (true) WITH CHECK (public.green_storage_is_unified(session_id) OR team<>'green');
CREATE POLICY gc07_direct_rpc_only ON public.communications AS RESTRICTIVE FOR ALL TO authenticated
    USING (true) WITH CHECK (public.green_storage_is_unified(session_id) OR type<>'direct' OR from_role NOT LIKE 'green_%');

CREATE FUNCTION public.write_regional_rfi(requested_session_id UUID, requested_delegation_id TEXT,
    requested_request_id UUID, requested_expected_revision BIGINT, requested_query TEXT,
    requested_categories TEXT[], requested_client_key TEXT)
RETURNS public.requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.requests%ROWTYPE; seat JSONB; game public.game_state%ROWTYPE; key TEXT;
BEGIN
    PERFORM public.green_require_open_session(requested_session_id);
    IF NOT public.gc07_facilitates(requested_session_id,requested_delegation_id) THEN
        RAISE EXCEPTION 'GC07_RFI_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
    seat := public.green_storage_current_seat(requested_session_id);
    IF length(btrim(COALESCE(requested_query,''))) NOT BETWEEN 10 AND 2000
        OR COALESCE(cardinality(requested_categories),0)=0
        OR EXISTS(SELECT 1 FROM unnest(requested_categories) c WHERE NULLIF(btrim(c),'') IS NULL) THEN
        RAISE EXCEPTION 'GC07_RFI_CONTENT_REQUIRED' USING ERRCODE='22023'; END IF;
    IF requested_request_id IS NOT NULL THEN
        SELECT * INTO r FROM public.requests WHERE id=requested_request_id FOR UPDATE;
        IF r.id IS NULL OR r.session_id IS DISTINCT FROM requested_session_id OR r.team<>'green'
            OR r.delegation_id IS DISTINCT FROM requested_delegation_id THEN
            RAISE EXCEPTION 'GC07_RFI_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
        IF r.revision_number IS DISTINCT FROM requested_expected_revision THEN
            RAISE EXCEPTION 'GC07_STALE_RFI_REVISION' USING ERRCODE='PT409'; END IF;
        IF r.status<>'pending' OR r.workflow_state<>'returned_to_team'
            OR (r.query IS NOT DISTINCT FROM btrim(requested_query) AND r.categories IS NOT DISTINCT FROM requested_categories) THEN
            RAISE EXCEPTION 'GC07_RFI_STATE_DENIED' USING ERRCODE='23514'; END IF;
        UPDATE public.requests SET query=btrim(requested_query),categories=requested_categories WHERE id=r.id RETURNING * INTO r;
    ELSE
        IF requested_expected_revision IS NOT NULL OR NULLIF(btrim(requested_client_key),'') IS NULL THEN
            RAISE EXCEPTION 'GC07_NEW_RFI_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
        key := 'gc07:'||requested_delegation_id||':'||(seat->>'id')||':'||requested_client_key;
        SELECT * INTO r FROM public.requests WHERE session_id=requested_session_id AND gc07_client_key=key;
        IF r.id IS NOT NULL THEN
            IF r.query IS DISTINCT FROM btrim(requested_query) OR r.categories IS DISTINCT FROM requested_categories THEN
                RAISE EXCEPTION 'GC07_RETRY_CONFLICT' USING ERRCODE='PT409'; END IF;
            RETURN r;
        END IF;
        SELECT * INTO game FROM public.game_state WHERE session_id=requested_session_id;
        INSERT INTO public.requests(session_id,team,delegation_id,query,categories,move,phase,client_id,status,gc07_client_key)
        VALUES(requested_session_id,'green',requested_delegation_id,btrim(requested_query),requested_categories,
            game.move,game.phase,auth.uid()::TEXT,'pending',key) RETURNING * INTO r;
    END IF;
    INSERT INTO public.timeline(session_id,type,team,move,phase,content,metadata)
    VALUES(r.session_id,CASE WHEN requested_request_id IS NULL THEN 'RFI_CREATED' ELSE 'RFI_RESUBMITTED' END,
        'green',r.move,r.phase,'Green regional RFI submitted',jsonb_build_object('related_id',r.id,'revision_number',r.revision_number));
    RETURN r;
END $$;

CREATE FUNCTION public.send_regional_direct_message(requested_session_id UUID,requested_delegation_id TEXT,
    requested_content TEXT,requested_client_key TEXT)
RETURNS public.communications LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.communications%ROWTYPE; seat JSONB; key TEXT; current_phase INTEGER;
BEGIN
    PERFORM public.green_require_open_session(requested_session_id);
    IF NOT public.gc07_facilitates(requested_session_id,requested_delegation_id) THEN
        RAISE EXCEPTION 'GC07_DIRECT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
    IF length(btrim(COALESCE(requested_content,''))) NOT BETWEEN 1 AND 2000 OR NULLIF(btrim(requested_client_key),'') IS NULL THEN
        RAISE EXCEPTION 'GC07_DIRECT_CONTENT_REQUIRED' USING ERRCODE='22023'; END IF;
    seat := public.green_storage_current_seat(requested_session_id);
    key := 'gc07:'||requested_delegation_id||':'||(seat->>'id')||':'||requested_client_key;
    SELECT * INTO c FROM public.communications WHERE session_id=requested_session_id AND gc07_client_key=key;
    IF c.id IS NOT NULL THEN
        IF c.content IS DISTINCT FROM btrim(requested_content) THEN RAISE EXCEPTION 'GC07_RETRY_CONFLICT' USING ERRCODE='PT409'; END IF;
        RETURN c;
    END IF;
    INSERT INTO public.communications(session_id,move,from_role,to_role,type,content,delegation_id,sender_delegation_id,metadata,gc07_client_key)
    SELECT requested_session_id,g.move,seat->>'role','white_cell','direct',btrim(requested_content),
        requested_delegation_id,requested_delegation_id,jsonb_build_object('source_team','green'),key
    FROM public.game_state g WHERE g.session_id=requested_session_id RETURNING * INTO c;
    IF c.id IS NULL THEN RAISE EXCEPTION 'GC07_GAME_STATE_REQUIRED' USING ERRCODE='23514'; END IF;
    SELECT phase INTO current_phase FROM public.game_state WHERE session_id=c.session_id;
    INSERT INTO public.timeline(session_id,type,team,move,phase,content,metadata)
    VALUES(c.session_id,'DIRECT_COMMUNICATION_SENT','green',c.move,current_phase,'Green Facilitator messaged White Cell',jsonb_build_object('communication_id',c.id));
    RETURN c;
END $$;

-- Preserve GC-05/06 definitions and OIDs; install fails closed on source drift.
DO $patch$
DECLARE d TEXT; old TEXT;
BEGIN
    d := pg_get_functiondef('public.guard_green_owned_record()'::regprocedure);
    old := 'IF seat IS NULL OR public.green_role_delegation(seat ->> ''role'') IS DISTINCT FROM NEW.delegation_id';
    IF position('gc06_shared_change' IN d)=0 OR position(old IN d)=0 THEN RAISE EXCEPTION 'GC07_OWNERSHIP_DRIFT'; END IF;
    EXECUTE replace(d,old,'IF TG_TABLE_NAME=''requests'' AND NEW.team=''green'' AND public.gc07_facilitates(NEW.session_id,NEW.delegation_id) THEN RETURN NEW; END IF; '||old);

    d := pg_get_functiondef('public.guard_green_authority()'::regprocedure);
    old := 'IF TG_TABLE_NAME=''communications'' AND TG_OP=''INSERT'' THEN';
    IF position('gc06_shared_change' IN d)=0 OR position(old IN d)=0 THEN RAISE EXCEPTION 'GC07_AUTHORITY_DRIFT'; END IF;
    d := replace(d,old,$body$IF TG_TABLE_NAME='requests' THEN
            allowed := item->>'team'='green' AND public.gc07_facilitates(sid,item->>'delegation_id');
        END IF;
        IF TG_TABLE_NAME='timeline' AND TG_OP='INSERT' THEN
            allowed := public.green_can_read_record('timeline',item);
        END IF;
        IF TG_TABLE_NAME='communications' AND TG_OP='INSERT' AND item->>'type'='direct' THEN
            allowed := item->>'from_role'=seat->>'role' AND item->>'to_role'='white_cell'
                AND item->>'owner_team'='green' AND item->>'linked_request_id' IS NULL
                AND NOT ((item->'metadata') ?| ARRAY['source_proposal_id','source_action_id','source_communication_id','linked_request_id'])
                AND public.gc07_facilitates(sid,item->>'delegation_id');
        END IF;
        IF TG_TABLE_NAME='communications' AND TG_OP='INSERT' AND item->>'type'<>'direct' THEN$body$);
    EXECUTE d;

    d := pg_get_functiondef('public.green_can_read_record(text,jsonb)'::regprocedure);
    old := 'IF seat->>''role''=''green_shared_facilitator'' THEN';
    IF position('gc06_thread_source' IN d)=0 OR position(old IN d)=0 THEN RAISE EXCEPTION 'GC07_READ_DRIFT'; END IF;
    EXECUTE replace(d,old,old||$body$
        IF table_name='requests' THEN RETURN record->>'team'='green' AND record->>'delegation_id' IN ('asian_pacific','europe'); END IF;
        IF table_name='artifact_workflow_reviews' AND record->>'artifact_kind'='rfi' THEN
            SELECT to_jsonb(r) INTO linked FROM public.requests r WHERE r.id::TEXT=record->>'artifact_id' AND r.session_id=sid;
            RETURN COALESCE(linked->>'team'=record->>'team' AND linked->>'delegation_id'=record->>'delegation_id'
                AND public.green_can_read_record('requests',linked),false);
        END IF;
        IF table_name='timeline' THEN
            IF record#>>'{metadata,communication_id}' IS NOT NULL THEN
                SELECT to_jsonb(c) INTO linked FROM public.communications c WHERE c.id::TEXT=record#>>'{metadata,communication_id}' AND c.session_id=sid;
                RETURN COALESCE(public.green_can_read_record('communications',linked),false);
            END IF;
            SELECT to_jsonb(r) INTO linked FROM public.requests r WHERE r.id::TEXT=record#>>'{metadata,related_id}' AND r.session_id=sid;
            RETURN COALESCE(public.green_can_read_record('requests',linked),false);
        END IF;
        IF table_name='communications' AND record->>'type' NOT IN ('PROPOSAL_FORWARDED','PROPOSAL_RESPONSE','PROPOSAL_RESPONSE_REVIEW') THEN
            RETURN record->>'from_role'=seat->>'role' OR record->>'from_role'='white_cell' AND (
                record->>'recipient_scope' IN ('session','both_green_delegations')
                OR record->>'recipient_scope'='role' AND record->>'to_role'=seat->>'role'
                OR record->>'recipient_scope'='delegation' AND record->>'recipient_delegation_id' IN ('asian_pacific','europe'));
        END IF;
$body$);
END $patch$;

-- Resolve operator audiences before the existing capture trigger. A linked RFI
-- always retains its persisted owner. Thread logic remains exclusively GC-06.
CREATE FUNCTION public.gc07_message_audience() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.requests%ROWTYPE; region TEXT; scope TEXT; target TEXT;
BEGIN
    IF public.green_storage_is_unified(NEW.session_id) OR NEW.type IN ('PROPOSAL_FORWARDED','PROPOSAL_RESPONSE','PROPOSAL_RESPONSE_REVIEW') THEN RETURN NEW; END IF;
    IF NEW.from_role='green_shared_facilitator' THEN
        IF NEW.type<>'direct' OR NEW.to_role<>'white_cell' OR NOT public.gc07_facilitates(NEW.session_id,NEW.delegation_id) THEN
            RAISE EXCEPTION 'GC07_DIRECT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
    END IF;
    IF NEW.from_role NOT IN ('white_cell','whitecell','whitecell_lead','whitecell_support') THEN RETURN NEW; END IF;
    IF (auth.uid() IS NOT NULL OR current_setting('role',true) IN ('anon','authenticated'))
        AND (public.green_storage_current_seat(NEW.session_id) IS NULL
            OR public.green_storage_current_seat(NEW.session_id)->>'role' NOT IN ('whitecell_lead','whitecell_support')) THEN
        RAISE EXCEPTION 'GC07_ACTIVE_REVIEWER_REQUIRED' USING ERRCODE='42501'; END IF;
    target := NEW.to_role;
    IF NEW.linked_request_id IS NOT NULL THEN
        SELECT * INTO r FROM public.requests WHERE id=NEW.linked_request_id AND session_id=NEW.session_id;
        IF r.id IS NULL OR target IS DISTINCT FROM r.team THEN RAISE EXCEPTION 'GC07_RFI_AUDIENCE_CONFLICT' USING ERRCODE='23514'; END IF;
        region := r.delegation_id;
        scope := CASE WHEN region IS NULL THEN 'team' ELSE 'delegation' END;
    ELSIF target IN ('green_asian_pacific','green_europe') THEN
        region := substring(target FROM 7); scope := 'delegation'; NEW.to_role := 'green';
    ELSIF target='green' THEN
        scope := 'both_green_delegations';
    ELSIF target='all' THEN scope := 'session';
    ELSIF target IN ('blue','red','industry') THEN scope := 'team';
    ELSE
        scope := 'role'; region := public.green_role_delegation(target);
        IF target LIKE 'green_%' AND (NOT public.green_seat_model_allows_role(NEW.session_id,target)
            OR (region IS NULL AND target<>'green_shared_facilitator')) THEN
            RAISE EXCEPTION 'GC07_RECIPIENT_MODEL_MISMATCH' USING ERRCODE='42501'; END IF;
    END IF;
    -- Legacy Green action-notification requests mean both, but narrower metadata
    -- can never be silently converted to a broad Green announcement.
    IF NEW.metadata->>'recipient_scope' IS NOT NULL AND NEW.metadata->>'recipient_scope' IS DISTINCT FROM scope
        AND NOT (NEW.metadata->>'recipient_scope'='team' AND scope='both_green_delegations')
        AND NOT (NEW.metadata->>'recipient_scope'='all' AND scope='session')
        AND NOT (NEW.linked_request_id IS NOT NULL AND NEW.metadata->>'recipient_scope'='team') THEN
        RAISE EXCEPTION 'GC07_AUDIENCE_METADATA_CONFLICT' USING ERRCODE='23514'; END IF;
    IF (NEW.metadata->>'recipient_role' IS NOT NULL AND (scope<>'role' OR NEW.metadata->>'recipient_role' IS DISTINCT FROM target))
        OR (NEW.metadata->>'recipient_delegation_id' IS NOT NULL AND NEW.metadata->>'recipient_delegation_id' IS DISTINCT FROM region)
        OR (NEW.recipient_delegation_id IS NOT NULL AND NEW.recipient_delegation_id IS DISTINCT FROM region)
        OR (NEW.recipient_scope IS NOT NULL AND NEW.recipient_scope IS DISTINCT FROM scope)
        OR (NEW.metadata->>'recipient' IS NOT NULL AND NEW.metadata->>'recipient' IS DISTINCT FROM target) THEN
        RAISE EXCEPTION 'GC07_AUDIENCE_METADATA_CONFLICT' USING ERRCODE='23514'; END IF;
    IF NEW.metadata->>'recipient_team' IS NOT NULL AND NEW.metadata->>'recipient_team' IS DISTINCT FROM
        (CASE WHEN target LIKE 'green%' THEN 'green' WHEN scope='team' THEN target
            WHEN scope='role' THEN split_part(target,'_',1) END) THEN
        RAISE EXCEPTION 'GC07_AUDIENCE_METADATA_CONFLICT' USING ERRCODE='23514'; END IF;
    NEW.recipient_scope := scope; NEW.recipient_delegation_id := region;
    NEW.metadata := COALESCE(NEW.metadata,'{}') || jsonb_build_object('recipient',target,'recipient_scope',scope,
        'recipient_role',CASE WHEN scope='role' THEN target END,'recipient_delegation_id',region,
        'recipient_team',CASE WHEN target LIKE 'green%' THEN 'green' WHEN scope='team' THEN target WHEN scope='role' THEN split_part(target,'_',1) END,
        'resolved_delivery_audience',CASE WHEN scope='both_green_delegations' THEN jsonb_build_array('asian_pacific','europe')
            WHEN scope='role' THEN jsonb_build_array(target)
            WHEN region IS NOT NULL THEN jsonb_build_array(region) ELSE jsonb_build_array(target) END);
    RETURN NEW;
END $$;
CREATE TRIGGER zzy_gc07_message_audience BEFORE INSERT ON public.communications FOR EACH ROW EXECUTE FUNCTION public.gc07_message_audience();

DO $patch$
DECLARE d TEXT; old TEXT;
BEGIN
    d := pg_get_functiondef('public.capture_green_communication_scope()'::regprocedure);
    old := 'sender_team := CASE WHEN sender_delegation IS NOT NULL THEN ''green''';
    IF position(old IN d)=0 OR position('green_shared_facilitator' IN d)=0 THEN RAISE EXCEPTION 'GC07_CAPTURE_DRIFT'; END IF;
    d := replace(d,old,'IF NEW.from_role=''green_shared_facilitator'' AND NEW.type=''direct'' THEN sender_delegation := NEW.delegation_id; END IF; '||old);
    old := 'WHEN NEW.to_role IN (''white_cell'', ''all'', ''blue'', ''red'', ''industry'', ''green'') THEN NEW.to_role';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC07_RECIPIENT_DRIFT'; END IF;
    d := replace(d,old,'WHEN NEW.to_role=''green_shared_facilitator'' THEN ''green'' '||old);
    old := 'IF recipient_team = ''green'' AND recipient_delegation IS NULL THEN';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC07_RECIPIENT_SCOPE_DRIFT'; END IF;
    d := replace(d,old,'IF NEW.to_role=''green_shared_facilitator'' THEN audience := ''role''; ELS'||old);
    IF position('IF audience <> ''both_green_delegations'' THEN' IN d)=0 THEN RAISE EXCEPTION 'GC07_RECIPIENT_ASSERT_DRIFT'; END IF;
    d := replace(d,'IF audience <> ''both_green_delegations'' THEN','IF audience <> ''both_green_delegations'' AND NEW.to_role<>''green_shared_facilitator'' THEN');
    EXECUTE d;
    d := pg_get_functiondef('public.operator_send_communication(uuid,text,text,text,text,uuid,jsonb)'::regprocedure);
    old := 'IF normalized_to_role NOT IN (';
    IF position(old IN d)=0 THEN RAISE EXCEPTION 'GC07_OPERATOR_SEND_DRIFT'; END IF;
    EXECUTE replace(d,old,$body$IF NOT (NOT public.green_storage_is_unified(requested_session_id) AND normalized_to_role IN (
        'green_asian_pacific','green_europe','green_shared_facilitator',
        'green_asian_pacific_scribe','green_europe_scribe','green_asian_pacific_facilitator','green_europe_facilitator',
        'green_asian_pacific_notetaker','green_europe_notetaker')) AND normalized_to_role NOT IN ($body$);
END $patch$;

-- The legacy answer signature remains available only for legacy/non-Green RFIs.
ALTER FUNCTION public.operator_answer_request(UUID,TEXT,TIMESTAMPTZ) RENAME TO gc07_legacy_answer_request;
REVOKE ALL ON FUNCTION public.gc07_legacy_answer_request(UUID,TEXT,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.operator_answer_request(requested_request_id UUID,requested_response TEXT,requested_responded_at TIMESTAMPTZ DEFAULT NULL)
RETURNS public.requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF EXISTS(SELECT 1 FROM public.requests r WHERE r.id=requested_request_id AND r.team='green' AND NOT public.green_storage_is_unified(r.session_id)) THEN
        RAISE EXCEPTION 'GC07_EXPECTED_RFI_REVISION_REQUIRED' USING ERRCODE='42501'; END IF;
    RETURN public.gc07_legacy_answer_request(requested_request_id,requested_response,requested_responded_at);
END $$;
CREATE FUNCTION public.operator_answer_regional_rfi(requested_session_id UUID,requested_delegation_id TEXT,
    requested_request_id UUID,requested_expected_revision BIGINT,requested_response TEXT)
RETURNS public.requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.requests%ROWTYPE;
BEGIN
    PERFORM public.green_require_open_session(requested_session_id);
    IF public.green_storage_current_seat(requested_session_id)->>'role' NOT IN ('whitecell_lead','whitecell_support')
        OR public.green_storage_current_seat(requested_session_id) IS NULL THEN
        RAISE EXCEPTION 'GC07_ACTIVE_REVIEWER_REQUIRED' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.requests WHERE id=requested_request_id FOR UPDATE;
    IF r.id IS NULL OR r.session_id IS DISTINCT FROM requested_session_id OR r.team<>'green'
        OR requested_delegation_id IS NULL OR r.delegation_id IS DISTINCT FROM requested_delegation_id THEN
        RAISE EXCEPTION 'GC07_RFI_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
    IF r.revision_number IS DISTINCT FROM requested_expected_revision THEN RAISE EXCEPTION 'GC07_STALE_RFI_REVISION' USING ERRCODE='PT409'; END IF;
    IF r.status<>'pending' OR r.workflow_state NOT IN ('submitted_to_white_cell','resubmitted') THEN
        RAISE EXCEPTION 'GC07_RFI_STATE_DENIED' USING ERRCODE='23514'; END IF;
    RETURN public.gc07_legacy_answer_request(r.id,requested_response,clock_timestamp());
END $$;

DO $$ DECLARE d TEXT; prelude TEXT; BEGIN
    d := pg_get_functiondef('public.operator_review_artifact(text,uuid,text,text,bigint,text)'::regprocedure);
    prelude := $body$
    IF requested_artifact_kind='rfi' THEN
        PERFORM public.green_require_open_session(r.session_id) FROM public.requests r WHERE r.id=requested_artifact_id AND r.team='green' AND NOT public.green_storage_is_unified(r.session_id);
        IF EXISTS(SELECT 1 FROM public.requests r WHERE r.id=requested_artifact_id AND r.team='green' AND NOT public.green_storage_is_unified(r.session_id)
            AND (public.green_storage_current_seat(r.session_id) IS NULL OR public.green_storage_current_seat(r.session_id)->>'role' NOT IN ('whitecell_lead','whitecell_support')
                OR requested_expected_revision IS NULL)) THEN RAISE EXCEPTION 'GC07_ACTIVE_REVIEWER_AND_REVISION_REQUIRED' USING ERRCODE='42501'; END IF;
    END IF;
    $body$;
    IF position('GC06_ACTIVE_REVIEWER_AND_REVISION_REQUIRED' IN d)=0 THEN RAISE EXCEPTION 'GC07_REVIEW_DRIFT'; END IF;
    EXECUTE overlay(d placing 'BEGIN'||prelude from position('BEGIN' IN d) for length('BEGIN'));
END $$;

REVOKE ALL ON FUNCTION public.gc07_facilitates(UUID,TEXT),public.gc07_message_audience(),
    public.write_regional_rfi(UUID,TEXT,UUID,BIGINT,TEXT,TEXT[],TEXT),public.send_regional_direct_message(UUID,TEXT,TEXT,TEXT),
    public.operator_answer_request(UUID,TEXT,TIMESTAMPTZ),public.operator_answer_regional_rfi(UUID,TEXT,UUID,BIGINT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.write_regional_rfi(UUID,TEXT,UUID,BIGINT,TEXT,TEXT[],TEXT),
    public.send_regional_direct_message(UUID,TEXT,TEXT,TEXT),public.operator_answer_request(UUID,TEXT,TIMESTAMPTZ),
    public.operator_answer_regional_rfi(UUID,TEXT,UUID,BIGINT,TEXT) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
