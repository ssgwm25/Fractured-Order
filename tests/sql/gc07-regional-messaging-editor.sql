-- Run the entire file as postgres after September 28, with RLS enabled.
-- Synthetic identities and rollback only; this is not hosted Auth evidence.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='10s';
RESET ROLE;
SET LOCAL request.jwt.claim.sub='';
SET LOCAL request.jwt.claims='{}';
SET LOCAL gc07.rehearsal_result='';
DO $gc07_suite$
DECLARE stage TEXT := 'setup'; report JSONB; error_state TEXT; error_message TEXT; error_context TEXT;
BEGIN
CREATE TEMP TABLE gc07_sessions AS SELECT gen_random_uuid() id,model,
    'green-roster-v'||(extract(epoch FROM clock_timestamp())*1000000)::BIGINT||floor(random()*1000000000)::BIGINT roster
    FROM (VALUES('shared'),('pairs'),('legacy')) m(model);
CREATE TEMP TABLE gc07_actors AS SELECT s.id sid,s.model,r.role,r.region,gen_random_uuid() auth_id
    FROM pg_temp.gc07_sessions s CROSS JOIN (VALUES
        ('green_shared_facilitator',NULL),('green_asian_pacific_facilitator','asian_pacific'),('green_europe_facilitator','europe'),
        ('green_asian_pacific_scribe','asian_pacific'),('green_europe_scribe','europe'),('whitecell_lead',NULL),('blue_scribe',NULL)) r(role,region)
    WHERE s.model='shared' AND r.role NOT IN ('green_asian_pacific_facilitator','green_europe_facilitator')
        OR s.model='pairs' AND r.role<>'green_shared_facilitator'
    UNION ALL SELECT s.id,s.model,r.role,NULL::TEXT,gen_random_uuid() FROM pg_temp.gc07_sessions s
        CROSS JOIN (VALUES('green_scribe'),('green_facilitator'),('whitecell_lead')) r(role) WHERE s.model='legacy';
CREATE TEMP TABLE gc07_results(label TEXT PRIMARY KEY);
CREATE TEMP TABLE gc07_records(sid UUID,region TEXT,id UUID,PRIMARY KEY(sid,region));
GRANT SELECT ON pg_temp.gc07_sessions,pg_temp.gc07_actors TO authenticated;
GRANT SELECT,INSERT,UPDATE ON pg_temp.gc07_records TO authenticated;
GRANT INSERT ON pg_temp.gc07_results TO authenticated;
CREATE FUNCTION pg_temp.identity(actor UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    PERFORM set_config('request.jwt.claim.sub',COALESCE(actor::TEXT,''),true);
    PERFORM set_config('request.jwt.claims',CASE WHEN actor IS NULL THEN '{}' ELSE jsonb_build_object('sub',actor,'role','authenticated')::TEXT END,true);
END $$;
CREATE FUNCTION pg_temp.check_true(ok BOOLEAN,label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'GC07 assertion failed: %',label; END IF;
    INSERT INTO pg_temp.gc07_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.denied(statement TEXT,codes TEXT,label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    BEGIN EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        IF NOT SQLSTATE=ANY(string_to_array(codes,',')) THEN RAISE; END IF;
        PERFORM pg_temp.check_true(true,label); RETURN;
    END;
    RAISE EXCEPTION 'GC07 expected rejection: %',label;
END $$;
INSERT INTO public.green_roster_approvals(version,snapshot,approved_by,approved_at)
    SELECT roster,'{"asian_pacific":["ROK","Japan","ASEAN"],"europe":["UK","France","EU"],"aliases":{"South Korea":"ROK"},"source_references":["GC07 rollback-only synthetic fixture"]}'::JSONB,
        'Synthetic fixture, not operational approval',NOW() FROM pg_temp.gc07_sessions WHERE model<>'legacy';
INSERT INTO public.sessions(id,name,status,session_topology_version)
    SELECT id,'GC07 synthetic '||id,'active',CASE WHEN model='legacy' THEN 1 ELSE 2 END FROM pg_temp.gc07_sessions;
UPDATE public.sessions s SET green_seat_model=CASE WHEN f.model='shared' THEN 'shared_facilitator_v1' END,
    green_roster_version=r.version,green_roster_snapshot=r.snapshot||jsonb_build_object('approved_by',r.approved_by,'approved_at',r.approved_at)
    FROM pg_temp.gc07_sessions f JOIN public.green_roster_approvals r ON r.version=f.roster WHERE s.id=f.id;
INSERT INTO public.game_state(session_id,move,phase) SELECT id,1,1 FROM pg_temp.gc07_sessions;
INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id)
    SELECT auth_id,'whitecell',role,sid FROM pg_temp.gc07_actors WHERE role='whitecell_lead';
DO $$ DECLARE a RECORD; BEGIN
    FOR a IN SELECT * FROM pg_temp.gc07_actors LOOP
        PERFORM pg_temp.identity(a.auth_id); SET LOCAL ROLE authenticated;
        PERFORM public.claim_session_role_seat(a.sid,a.role,'GC07 synthetic','gc07-'||a.auth_id,90);
        RESET ROLE;
    END LOOP;
    PERFORM pg_temp.identity(NULL);
END $$;

stage := 'regional_cycles';
DO $$ DECLARE s RECORD; gc07_region TEXT; fac UUID; wc UUID; r public.requests; again public.requests; c public.communications; review JSONB; BEGIN
    FOR s IN SELECT * FROM pg_temp.gc07_sessions WHERE model<>'legacy' LOOP
        SELECT actor.auth_id INTO wc FROM pg_temp.gc07_actors actor WHERE actor.sid=s.id AND actor.role='whitecell_lead';
        FOREACH gc07_region IN ARRAY ARRAY['asian_pacific','europe'] LOOP
            SELECT actor.auth_id INTO fac FROM pg_temp.gc07_actors actor WHERE actor.sid=s.id AND actor.role=CASE WHEN s.model='shared' THEN 'green_shared_facilitator' ELSE 'green_'||gc07_region||'_facilitator' END;
            PERFORM pg_temp.identity(fac); SET LOCAL ROLE authenticated;
            r := public.write_regional_rfi(s.id,gc07_region,NULL,NULL,'Synthetic regional question?',ARRAY['Other'],'same-key');
            again := public.write_regional_rfi(s.id,gc07_region,NULL,NULL,'Synthetic regional question?',ARRAY['Other'],'same-key');
            PERFORM pg_temp.check_true(r.id=again.id AND r.delegation_id=gc07_region AND r.revision_number=1,s.model||gc07_region||' scoped retry');
            INSERT INTO pg_temp.gc07_records VALUES(s.id,gc07_region,r.id);
            PERFORM pg_temp.denied(format('SELECT public.write_regional_rfi(%L,NULL,NULL,NULL,''Synthetic question'',ARRAY[''Other''],''bad'')',s.id),'42501',s.model||gc07_region||' missing scope');
            PERFORM pg_temp.denied(format('SELECT public.write_regional_rfi(%L,%L,NULL,NULL,''Synthetic question'',ARRAY[''Other''],''foreign'')',
                (SELECT id FROM pg_temp.gc07_sessions WHERE model='legacy'),gc07_region),'42501',s.model||gc07_region||' foreign session denied');
            PERFORM pg_temp.denied(format('SELECT public.send_regional_direct_message(%L,''invalid_region'',''Denied'',''invalid'')',s.id),'42501',s.model||gc07_region||' invalid region denied');
            c := public.send_regional_direct_message(s.id,gc07_region,'Synthetic private coordination','same-key');
            PERFORM pg_temp.check_true(c.delegation_id=gc07_region AND c.owner_team='green' AND c.to_role='white_cell',s.model||gc07_region||' direct owner');
            PERFORM pg_temp.check_true(c.id=(public.send_regional_direct_message(s.id,gc07_region,'Synthetic private coordination','same-key')).id,s.model||gc07_region||' direct retry');
            PERFORM pg_temp.denied(format('INSERT INTO public.requests(session_id,team,delegation_id,query) VALUES(%L,''green'',%L,''Synthetic forged insert'')',s.id,gc07_region),'42501',s.model||gc07_region||' direct table denied');
            RESET ROLE;
            PERFORM pg_temp.identity(wc); SET LOCAL ROLE authenticated;
            review := public.operator_review_artifact('rfi',r.id,'return_for_clarification','green',1,'Synthetic clarification');
            PERFORM pg_temp.check_true(review#>>'{artifact,revision_number}'='2' AND review#>>'{artifact,delegation_id}'=gc07_region,s.model||gc07_region||' return revision owner');
            PERFORM pg_temp.denied(format('SELECT public.operator_answer_regional_rfi(%L,%L,%L,2,''Synthetic answer'')',s.id,gc07_region,r.id),'23514',s.model||gc07_region||' returned answer denied');
            RESET ROLE;
            PERFORM pg_temp.identity(fac); SET LOCAL ROLE authenticated;
            PERFORM pg_temp.check_true(EXISTS(SELECT 1 FROM public.artifact_workflow_reviews WHERE artifact_id=r.id),s.model||gc07_region||' review readable');
            PERFORM pg_temp.denied(format('SELECT public.write_regional_rfi(%L,%L,%L,2,''Synthetic wrong owner question'',ARRAY[''Other''],NULL)',
                s.id,CASE WHEN gc07_region='europe' THEN 'asian_pacific' ELSE 'europe' END,r.id),'42501',s.model||gc07_region||' owner change RPC denied');
            PERFORM pg_temp.denied(format('UPDATE public.requests SET delegation_id=%L WHERE id=%L',
                CASE WHEN gc07_region='europe' THEN 'asian_pacific' ELSE 'europe' END,r.id),'42501,23514',s.model||gc07_region||' owner change table denied');
            PERFORM pg_temp.denied(format('SELECT public.write_regional_rfi(%L,%L,%L,1,''Synthetic corrected question'',ARRAY[''Other''],NULL)',s.id,gc07_region,r.id),'PT409',s.model||gc07_region||' stale correction denied');
            again := public.write_regional_rfi(s.id,gc07_region,r.id,2,'Synthetic corrected question?',ARRAY['Other'],NULL);
            PERFORM pg_temp.check_true(again.id=r.id AND again.revision_number=2 AND again.workflow_state='resubmitted',s.model||gc07_region||' same artifact resubmitted');
            RESET ROLE;
            PERFORM pg_temp.identity(wc); SET LOCAL ROLE authenticated;
            PERFORM pg_temp.denied(format('SELECT public.operator_answer_request(%L,''Synthetic answer'',NULL)',r.id),'42501',s.model||gc07_region||' legacy answer bypass denied');
            PERFORM pg_temp.denied(format('SELECT public.operator_answer_regional_rfi(%L,%L,%L,1,''Synthetic answer'')',s.id,gc07_region,r.id),'PT409',s.model||gc07_region||' stale answer denied');
            again := public.operator_answer_regional_rfi(s.id,gc07_region,r.id,2,'Synthetic answer');
            PERFORM pg_temp.check_true(again.workflow_state='completed' AND EXISTS(SELECT 1 FROM public.communications WHERE linked_request_id=r.id
                AND delegation_id=gc07_region AND recipient_delegation_id=gc07_region AND recipient_scope='delegation'),s.model||gc07_region||' scoped answer');
            RESET ROLE;
        END LOOP;
    END LOOP;
    PERFORM pg_temp.identity(NULL);
END $$;

stage := 'audience_and_scribe_isolation';
DO $$ DECLARE s RECORD; a RECORD; c public.communications; BEGIN
    FOR s IN SELECT * FROM pg_temp.gc07_sessions WHERE model<>'legacy' LOOP
        SELECT * INTO a FROM pg_temp.gc07_actors WHERE sid=s.id AND role='whitecell_lead';
        PERFORM pg_temp.identity(a.auth_id); SET LOCAL ROLE authenticated;
        c := public.operator_send_communication(s.id,'green','GUIDANCE','Synthetic both-region update',NULL,NULL,'{"recipient_scope":"team","recipient_team":"green"}');
        PERFORM pg_temp.check_true(c.recipient_scope='both_green_delegations' AND c.metadata->'resolved_delivery_audience'='["asian_pacific","europe"]'::JSONB,s.model||' both audience persisted');
        PERFORM public.operator_send_communication(s.id,'green_europe','GUIDANCE','Synthetic European journal',NULL,NULL,'{"content_kind":"TRIBE_STREET_JOURNAL"}');
        PERFORM public.operator_send_communication(s.id,'green_asian_pacific_scribe','GUIDANCE','Synthetic individual role',NULL,NULL,'{"recipient_team":"green"}');
        IF s.model='shared' THEN
            PERFORM public.operator_send_communication(s.id,'green_shared_facilitator','GUIDANCE','Synthetic deck assignment');
        END IF;
        PERFORM pg_temp.denied(format('SELECT public.operator_send_communication(%L,''green'',''GUIDANCE'',''Synthetic invalid audience'',NULL,NULL,''{"recipient_role":"green_europe_scribe"}''::jsonb)',s.id),'23514',s.model||' broad metadata denied');
        RESET ROLE;
        FOR a IN SELECT * FROM pg_temp.gc07_actors WHERE sid=s.id AND role IN ('green_asian_pacific_scribe','green_europe_scribe') LOOP
            PERFORM pg_temp.identity(a.auth_id); SET LOCAL ROLE authenticated;
            PERFORM pg_temp.check_true((SELECT count(*) FROM public.requests WHERE session_id=s.id)=1
                AND NOT EXISTS(SELECT 1 FROM public.requests WHERE session_id=s.id AND delegation_id<>a.region),s.model||a.region||' only own RFI');
            PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.communications WHERE session_id=s.id AND type='direct'),s.model||a.region||' private direct absent');
            PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.communications WHERE session_id=s.id AND recipient_scope='role' AND to_role<>a.role),s.model||a.region||' individual role isolation');
            PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.communications WHERE session_id=s.id AND recipient_scope='delegation' AND recipient_delegation_id<>a.region),s.model||a.region||' delegation isolation');
            PERFORM pg_temp.denied(format('SELECT public.write_regional_rfi(%L,%L,NULL,NULL,''Synthetic denied question'',ARRAY[''Other''],''denied'')',s.id,a.region),'42501',s.model||a.region||' Scribe write denied');
            PERFORM pg_temp.denied(format('SELECT public.send_regional_direct_message(%L,%L,''Denied'',''denied'')',s.id,a.region),'42501',s.model||a.region||' Scribe message denied');
            RESET ROLE;
        END LOOP;
    END LOOP;
    PERFORM pg_temp.identity(NULL);
END $$;

stage := 'revocation_and_legacy';
DO $$ DECLARE a RECORD; r public.requests; BEGIN
    SELECT * INTO a FROM pg_temp.gc07_actors WHERE role='green_shared_facilitator';
    UPDATE public.session_participants SET heartbeat_at=NOW()-INTERVAL '5 minutes' WHERE session_id=a.sid AND role=a.role;
    PERFORM pg_temp.identity(a.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.requests WHERE session_id=a.sid),'stale shared reads empty');
    PERFORM pg_temp.denied(format('SELECT public.send_regional_direct_message(%L,''europe'',''Denied'',''stale'')',a.sid),'42501','stale shared send denied');
    RESET ROLE; PERFORM pg_temp.identity(NULL);
    UPDATE public.session_participants SET heartbeat_at=NOW(),revoked_at=NOW(),is_active=false WHERE session_id=a.sid AND role=a.role;
    PERFORM pg_temp.identity(a.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT public.write_regional_rfi(%L,''europe'',NULL,NULL,''Synthetic revoked question'',ARRAY[''Other''],''revoked'')',a.sid),'42501','revoked shared write denied');
    RESET ROLE;
    PERFORM pg_temp.identity(NULL);
    SELECT * INTO a FROM pg_temp.gc07_actors WHERE model='shared' AND role='whitecell_lead';
    UPDATE public.session_participants SET heartbeat_at=NOW()-INTERVAL '5 minutes' WHERE session_id=a.sid AND role=a.role;
    PERFORM pg_temp.identity(a.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT public.operator_send_communication(%L,''green'',''GUIDANCE'',''Denied stale reviewer'')',a.sid),'42501','stale reviewer send denied');
    RESET ROLE;
    SELECT * INTO a FROM pg_temp.gc07_actors WHERE model='legacy' AND role='green_scribe';
    PERFORM pg_temp.identity(a.auth_id); SET LOCAL ROLE authenticated;
    INSERT INTO public.requests(session_id,team,query,categories,move,phase) VALUES(a.sid,'green','Synthetic unified question',ARRAY['Other'],1,1) RETURNING * INTO r;
    PERFORM pg_temp.check_true(r.delegation_id IS NULL,'unified original identity');
    RESET ROLE;
    SELECT * INTO a FROM pg_temp.gc07_actors WHERE model='legacy' AND role='whitecell_lead';
    PERFORM pg_temp.identity(a.auth_id); SET LOCAL ROLE authenticated;
    r := public.operator_answer_request(r.id,'Synthetic unified answer');
    PERFORM pg_temp.check_true(r.delegation_id IS NULL AND r.status='answered','unified legacy answer');
    RESET ROLE; PERFORM pg_temp.identity(NULL);
END $$;
PERFORM pg_temp.check_true(position('gc05_shared_submission' IN pg_get_functiondef('public.guard_green_authority()'::regprocedure))>0
    AND position('gc06_shared_change' IN pg_get_functiondef('public.guard_green_authority()'::regprocedure))>0,'GC05 GC06 guards retained');
PERFORM pg_temp.check_true(NOT has_function_privilege('authenticated','public.gc07_legacy_answer_request(uuid,text,timestamp with time zone)','EXECUTE'),'private legacy helper closed');
SELECT jsonb_build_object('result','PASS','assertions',count(*),'checks',jsonb_agg(label ORDER BY label)) INTO report FROM pg_temp.gc07_results;
PERFORM set_config('gc07.rehearsal_result',report::TEXT,true);
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_message=MESSAGE_TEXT,error_context=PG_EXCEPTION_CONTEXT;
    RAISE EXCEPTION USING ERRCODE=error_state,MESSAGE=format('GC07 stage=%s SQLSTATE=%s: %s | context: %s',stage,error_state,error_message,error_context);
END $gc07_suite$;
SELECT CASE WHEN (value->>'assertions')::INTEGER>0 THEN value ELSE '{"result":"FAIL","reason":"No assertions"}'::JSONB END AS gc07_result
FROM (SELECT COALESCE(NULLIF(current_setting('gc07.rehearsal_result',true),''),'{}')::JSONB value) report;
ROLLBACK;
