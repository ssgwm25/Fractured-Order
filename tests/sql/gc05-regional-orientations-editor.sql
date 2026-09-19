-- Run the ENTIRE file as postgres in the migrated Supabase SQL Editor.
-- Real RPC/RLS assertions use synthetic authenticated identities; fixtures roll back.
-- One server-side block owns fixture creation and use. Errors include their stage.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='10s';
RESET ROLE;
SET LOCAL request.jwt.claim.sub='';
SET LOCAL request.jwt.claims='{}';
SET LOCAL gc05.rehearsal_result='';

DO $gc05_suite$
DECLARE
    gc05_stage TEXT := 'fixture_tables';
    gc05_report JSONB;
    gc05_error_state TEXT;
    gc05_error_message TEXT;
    gc05_error_context TEXT;
BEGIN
CREATE TEMP TABLE gc05_sessions AS
SELECT gen_random_uuid() AS id, model,
    'green-roster-v'||(extract(epoch FROM clock_timestamp())*1000000)::BIGINT::TEXT||floor(random()*1000000000)::BIGINT::TEXT AS roster
FROM (VALUES ('shared'),('pairs'),('unified')) m(model);
CREATE TEMP TABLE gc05_actors AS
SELECT s.id AS sid, s.model, r.role, r.delegation, gen_random_uuid() AS auth_id
FROM pg_temp.gc05_sessions s CROSS JOIN (VALUES
    ('green_asian_pacific_scribe','asian_pacific'),('green_europe_scribe','europe'),
    ('green_shared_facilitator',NULL),('green_asian_pacific_facilitator','asian_pacific'),
    ('green_europe_facilitator','europe'),('whitecell_lead',NULL)) r(role,delegation)
WHERE s.model<>'unified' AND (s.model='shared' AND r.role NOT LIKE '%_facilitator' OR s.model='shared' AND r.role='green_shared_facilitator'
    OR s.model='pairs' AND r.role<>'green_shared_facilitator');
CREATE TEMP TABLE gc05_results(label TEXT PRIMARY KEY);
CREATE TEMP TABLE gc05_records(sid UUID, delegation TEXT, id UUID, revision BIGINT, version BIGINT, PRIMARY KEY(sid,delegation));
GRANT SELECT ON pg_temp.gc05_sessions,pg_temp.gc05_actors TO authenticated;
GRANT SELECT,INSERT,UPDATE ON pg_temp.gc05_records TO authenticated;
GRANT INSERT ON pg_temp.gc05_results TO authenticated;

gc05_stage := 'fixture_helpers';
CREATE FUNCTION pg_temp.identity(actor UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    PERFORM set_config('request.jwt.claim.sub',COALESCE(actor::TEXT,''),true);
    PERFORM set_config('request.jwt.claims',CASE WHEN actor IS NULL THEN '{}'
        ELSE jsonb_build_object('sub',actor,'role','authenticated')::TEXT END,true);
END $$;
CREATE FUNCTION pg_temp.check_true(ok BOOLEAN,label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'GC05 assertion failed: %',label; END IF;
    INSERT INTO pg_temp.gc05_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.denied(statement TEXT,code TEXT,label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    BEGIN EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        IF NOT SQLSTATE=ANY(string_to_array(code,',')) THEN RAISE; END IF;
        PERFORM pg_temp.check_true(true,label); RETURN;
    END;
    RAISE EXCEPTION 'GC05 expected rejection: %',label;
END $$;
CREATE FUNCTION pg_temp.details(narrative TEXT DEFAULT 'Synthetic strategy only') RETURNS TEXT LANGUAGE SQL AS $$
    SELECT 'Strategic Orientation Details'||chr(10)||'Contract Version: 2'||chr(10)||'Period: pre_move_1'||chr(10)
        ||'Artifact Type: orientation_and_forecast'||chr(10)||'Team: green'||chr(10)
        ||'Own Orientation: {"id":"pressure","label":"Pressure","tag":"Focus on affecting PRC GDP growth"}'||chr(10)
        ||'Forecast Targets: [{"key":"blue","orientation":"pressure"}]'||chr(10)
        ||'Strategy Description: '||narrative||chr(10)||'Scribe Handoff: Forwarded'
$$;

gc05_stage := 'fixture_sessions';
INSERT INTO public.green_roster_approvals(version,snapshot,approved_by,approved_at)
SELECT roster,'{"asian_pacific":[],"europe":[],"aliases":{},"source_references":["GC05 rollback-only synthetic rehearsal"]}'::JSONB,
    'Synthetic fixture, not exercise approval',NOW() FROM pg_temp.gc05_sessions WHERE model<>'unified';
INSERT INTO public.sessions(id,name,status,session_topology_version)
SELECT id,'GC05 synthetic '||id,'active',CASE WHEN model='unified' THEN 1 ELSE 2 END FROM pg_temp.gc05_sessions;
UPDATE public.sessions s SET green_seat_model=CASE WHEN f.model='shared' THEN 'shared_facilitator_v1' END,
    green_roster_version=r.version,green_roster_snapshot=r.snapshot||jsonb_build_object('approved_by',r.approved_by,'approved_at',r.approved_at)
FROM pg_temp.gc05_sessions f JOIN public.green_roster_approvals r ON r.version=f.roster WHERE s.id=f.id;
INSERT INTO public.game_state(session_id,move,phase) SELECT id,1,1 FROM pg_temp.gc05_sessions;
INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id)
SELECT auth_id,'whitecell',role,sid FROM pg_temp.gc05_actors WHERE role='whitecell_lead';

gc05_stage := 'seat_claims';
DO $$ DECLARE actor RECORD; BEGIN
    FOR actor IN SELECT * FROM pg_temp.gc05_actors LOOP
        PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
        PERFORM public.claim_session_role_seat(actor.sid,actor.role,'GC05 synthetic','gc05-'||actor.auth_id,90);
        RESET ROLE;
    END LOOP;
    PERFORM pg_temp.identity(NULL);
END $$;

gc05_stage := 'qualifying_fixtures';
-- Qualifying status stays submitted, without White Cell approval. Seed only
-- other teams, and unified compatibility history, as database-owner fixtures.
INSERT INTO public.actions(session_id,team,move,phase,mechanism,sector,goal,ally_contingencies,status)
SELECT s.id,t.team,1,1,'Strategic Orientation','','GC05 synthetic transport',
    'Strategic Orientation Details'||chr(10)||'Team: '||t.team,'submitted'
FROM pg_temp.gc05_sessions s CROSS JOIN (VALUES ('blue'),('red'),('industry'),('green')) t(team)
WHERE t.team<>'green' OR s.model='unified';
gc05_stage := 'unified_completion';
DO $$ DECLARE sid UUID; BEGIN
    SELECT id INTO sid FROM pg_temp.gc05_sessions WHERE model='unified';
    PERFORM pg_temp.check_true((public.gc05_orientation_completion(sid)->>'complete')::BOOLEAN,'unified four-team completion');
    UPDATE public.game_state SET phase=2 WHERE session_id=sid;
END $$;

gc05_stage := 'scribe_handoffs';
DO $$ DECLARE actor RECORD; a public.actions%ROWTYPE; BEGIN
    FOR actor IN SELECT * FROM pg_temp.gc05_actors WHERE role LIKE '%_scribe' LOOP
        PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
        PERFORM pg_temp.denied(format('INSERT INTO public.actions(session_id,team,delegation_id,move,phase,mechanism,sector,goal,ally_contingencies,status) VALUES(%L,''green'',%L,1,1,''Strategic Orientation'','''',''denied'',%L,''draft'')',
            actor.sid,actor.delegation,pg_temp.details()),'42501',actor.model||actor.role||' direct handoff denied');
        a := public.handoff_regional_orientation(actor.sid,actor.delegation,NULL,NULL,NULL,pg_temp.details(),'GC05 synthetic orientation');
        INSERT INTO pg_temp.gc05_records VALUES(actor.sid,actor.delegation,a.id,a.revision_number,a.row_version);
        PERFORM pg_temp.check_true(a.orientation_handoff_revision=1 AND a.workflow_state='forwarded_to_facilitator',actor.model||actor.role||' handoff');
        PERFORM pg_temp.denied(format('SELECT public.handoff_regional_orientation(%L,%L,NULL,NULL,NULL,%L,%L)',
            actor.sid,actor.delegation,pg_temp.details(),'duplicate'),'23505',actor.model||actor.role||' duplicate');
        PERFORM pg_temp.denied(format('SELECT public.handoff_regional_orientation(%L,%L,%L,1,1,%L,%L)',
            actor.sid,CASE actor.delegation WHEN 'europe' THEN 'asian_pacific' ELSE 'europe' END,a.id,pg_temp.details(),'spoof'),
            '42501',actor.model||actor.role||' wrong region');
        RESET ROLE;
    END LOOP;
    PERFORM pg_temp.identity(NULL);
END $$;

gc05_stage := 'private_fixtures';
-- Unrelated drafts/returned proposals must stay inaccessible to shared seats.
INSERT INTO public.actions(session_id,team,delegation_id,move,phase,mechanism,sector,goal,artifact_type,proposal_recipient_team)
SELECT id,'green','europe',1,1,'Proposal','','GC05 private proposal','proposal','blue' FROM pg_temp.gc05_sessions WHERE model='shared';
INSERT INTO public.communications(session_id,move,from_role,to_role,type,content)
SELECT id,1,'white_cell','all','ANNOUNCEMENT','GC05 synthetic parent' FROM pg_temp.gc05_sessions WHERE model='shared';
INSERT INTO public.requests(session_id,team,delegation_id,move,phase,query)
SELECT id,'green','europe',1,1,'GC05 private RFI' FROM pg_temp.gc05_sessions WHERE model='shared';

gc05_stage := 'submissions_and_gate';
DO $$ DECLARE s RECORD; actor RECORD; r RECORD; a public.actions%ROWTYPE; affected INTEGER; BEGIN
    FOR s IN SELECT * FROM pg_temp.gc05_sessions WHERE model<>'unified' LOOP
        FOR r IN SELECT * FROM pg_temp.gc05_records WHERE sid=s.id ORDER BY delegation LOOP
            SELECT * INTO actor FROM pg_temp.gc05_actors WHERE sid=s.id AND role=CASE WHEN s.model='shared'
                THEN 'green_shared_facilitator' ELSE 'green_'||r.delegation||'_facilitator' END;
            PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
            PERFORM pg_temp.denied(format('SELECT public.submit_regional_orientation(%L,%L,%L,99,%s)',s.id,r.delegation,r.id,r.version),
                'PT409',s.model||r.delegation||' stale revision');
            PERFORM pg_temp.denied(format('SELECT public.submit_regional_orientation(%L,%L,%L,1,99)',s.id,r.delegation,r.id),
                'PT409',s.model||r.delegation||' stale row version');
            IF s.model='shared' THEN
                PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.actions WHERE session_id=s.id AND goal='GC05 private proposal'),
                    r.delegation||' private proposal hidden');
                -- Direct UPDATE may be invisible under RLS; either rejection or
                -- zero affected rows is required, never a successful mutation.
                BEGIN
                    UPDATE public.actions SET status='submitted' WHERE id=r.id;
                    GET DIAGNOSTICS affected=ROW_COUNT;
                    PERFORM pg_temp.check_true(affected=0,r.delegation||' direct table submit denied');
                EXCEPTION WHEN insufficient_privilege THEN
                    PERFORM pg_temp.check_true(true,r.delegation||' direct table submit denied');
                END;
            END IF;
            a := public.submit_regional_orientation(s.id,r.delegation,r.id,r.revision,r.version);
            UPDATE pg_temp.gc05_records SET version=a.row_version WHERE id=a.id;
            PERFORM pg_temp.check_true(a.status='submitted' AND a.submitted_by_role=actor.role,s.model||r.delegation||' independent submit');
            PERFORM pg_temp.check_true(EXISTS(SELECT 1 FROM public.action_logs WHERE action_id=a.id),s.model||r.delegation||' audit revision readable');
            PERFORM pg_temp.denied(format('SELECT public.submit_regional_orientation(%L,%L,%L,%s,%s)',s.id,r.delegation,a.id,a.revision_number,a.row_version),
                '23514',s.model||r.delegation||' duplicate submit');
            RESET ROLE; PERFORM pg_temp.identity(NULL);
            IF r.delegation='asian_pacific' THEN
                PERFORM pg_temp.check_true(public.gc05_orientation_completion(s.id)->'missingTeams'='["green:europe"]'::JSONB,s.model||' exact missing Europe');
                PERFORM pg_temp.denied(format('UPDATE public.game_state SET phase=2 WHERE session_id=%L',s.id),'23514',s.model||' direct phase gate');
                PERFORM pg_temp.denied(format('UPDATE public.game_state SET move=3,phase=5 WHERE session_id=%L',s.id),'23514',s.model||' direct move jump gate');
                PERFORM pg_temp.denied(format('INSERT INTO public.game_state(session_id,move,phase) VALUES(%L,2,1)',s.id),'23514',s.model||' initial move jump gate');
            END IF;
        END LOOP;
        PERFORM pg_temp.check_true((public.gc05_orientation_completion(s.id)->>'complete')::BOOLEAN,s.model||' five submitted qualify');
    END LOOP;
END $$;

gc05_stage := 'return_correction_resubmission';
DO $$ DECLARE s RECORD; r RECORD; wc RECORD; actor RECORD; a public.actions%ROWTYPE; result JSONB; BEGIN
    FOR s IN SELECT * FROM pg_temp.gc05_sessions WHERE model<>'unified' LOOP
        SELECT * INTO wc FROM pg_temp.gc05_actors WHERE sid=s.id AND role='whitecell_lead';
        FOR r IN SELECT * FROM pg_temp.gc05_records WHERE sid=s.id ORDER BY delegation LOOP
            PERFORM pg_temp.identity(wc.auth_id); SET LOCAL ROLE authenticated;
            result := public.operator_review_artifact('strategic_orientation',r.id,'return_to_team','green',1,'Synthetic correction requested');
            PERFORM pg_temp.check_true(result->'artifact'->>'delegation_id'=r.delegation,s.model||r.delegation||' return preserves owner');
            PERFORM pg_temp.check_true(public.get_orientation_completion(s.id)->'missingTeams'=jsonb_build_array('green:'||r.delegation),
                s.model||r.delegation||' return identifies exact missing owner');
            PERFORM pg_temp.denied(format('SELECT public.operator_update_game_state(%L,2,1)',s.id),'23514',s.model||r.delegation||' control RPC gate after return');
            RESET ROLE; PERFORM pg_temp.identity(NULL);
            SELECT * INTO a FROM public.actions WHERE id=r.id;
            SELECT * INTO actor FROM pg_temp.gc05_actors WHERE sid=s.id AND role=CASE WHEN s.model='shared'
                THEN 'green_shared_facilitator' ELSE 'green_'||r.delegation||'_facilitator' END;
            PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
            PERFORM pg_temp.check_true(EXISTS(SELECT 1 FROM public.artifact_workflow_reviews WHERE artifact_id=r.id AND revision_number=1),s.model||r.delegation||' relevant review readable');
            PERFORM pg_temp.denied(format('SELECT public.submit_regional_orientation(%L,%L,%L,%s,%s)',s.id,r.delegation,a.id,a.revision_number,a.row_version),
                '23514',s.model||r.delegation||' new Scribe handoff required');
            RESET ROLE;
            SELECT * INTO actor FROM pg_temp.gc05_actors WHERE sid=s.id AND role='green_'||r.delegation||'_scribe';
            PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
            PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.actions WHERE session_id=s.id AND delegation_id<>r.delegation),s.model||r.delegation||' Scribe isolation');
            PERFORM pg_temp.denied(format('SELECT public.handoff_regional_orientation(%L,%L,%L,1,%s,%L,%L)',s.id,r.delegation,a.id,a.row_version,pg_temp.details(),'stale correction'),
                'PT409',s.model||r.delegation||' stale corrected handoff denied');
            a := public.handoff_regional_orientation(s.id,r.delegation,a.id,a.revision_number,a.row_version,pg_temp.details('Synthetic corrected strategy'),'GC05 corrected orientation');
            RESET ROLE;
            SELECT * INTO actor FROM pg_temp.gc05_actors WHERE sid=s.id AND role=CASE WHEN s.model='shared'
                THEN 'green_shared_facilitator' ELSE 'green_'||r.delegation||'_facilitator' END;
            PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
            a := public.submit_regional_orientation(s.id,r.delegation,a.id,a.revision_number,a.row_version);
            PERFORM pg_temp.check_true(a.workflow_state='resubmitted' AND a.revision_number=2,s.model||r.delegation||' corrected resubmit');
            RESET ROLE; PERFORM pg_temp.identity(NULL);
            PERFORM pg_temp.check_true((public.gc05_orientation_completion(s.id)->>'complete')::BOOLEAN,s.model||r.delegation||' gate restored');
        END LOOP;
        PERFORM pg_temp.identity(wc.auth_id); SET LOCAL ROLE authenticated;
        PERFORM public.operator_update_game_state(s.id,2,1);
        RESET ROLE; PERFORM pg_temp.identity(NULL);
    END LOOP;
END $$;

gc05_stage := 'scope_and_seat_denials';
DO $$ DECLARE v_sid UUID; other UUID; actor RECORD; scribe RECORD; r RECORD; proposal UUID; rfi UUID; seat UUID; scribe_seat UUID; BEGIN
    SELECT id INTO v_sid FROM pg_temp.gc05_sessions WHERE model='shared';
    SELECT id INTO other FROM pg_temp.gc05_sessions WHERE model='pairs';
    SELECT * INTO actor FROM pg_temp.gc05_actors WHERE pg_temp.gc05_actors.sid=v_sid AND role='green_shared_facilitator';
    SELECT * INTO scribe FROM pg_temp.gc05_actors WHERE pg_temp.gc05_actors.sid=v_sid AND role='green_europe_scribe';
    SELECT * INTO r FROM pg_temp.gc05_records WHERE pg_temp.gc05_records.sid=v_sid AND delegation='europe';
    SELECT id INTO proposal FROM public.actions WHERE session_id=v_sid AND goal='GC05 private proposal';
    SELECT id INTO rfi FROM public.requests WHERE session_id=v_sid AND query='GC05 private RFI';
    SELECT sp.id INTO seat FROM public.session_participants sp JOIN public.participants p ON p.id=sp.participant_id WHERE p.auth_user_id=actor.auth_id;
    SELECT sp.id INTO scribe_seat FROM public.session_participants sp JOIN public.participants p ON p.id=sp.participant_id WHERE p.auth_user_id=scribe.auth_id;
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT public.submit_regional_orientation(%L,%L,%L,2,5)',other,'europe',r.id),'42501','wrong session');
    PERFORM pg_temp.denied(format('SELECT public.submit_regional_orientation(%L,%L,%L,2,5)',v_sid,'asian_pacific',r.id),'42501','shared wrong region');
    PERFORM pg_temp.denied(format('SELECT public.submit_regional_orientation(%L,%L,%L,1,1)',v_sid,'europe',proposal),'42501','proposal through submit path');
    PERFORM pg_temp.denied(format('SELECT public.submit_regional_orientation(%L,%L,%L,1,1)',v_sid,'europe',rfi),'42501','RFI ID through submit path');
    PERFORM pg_temp.denied(format('SELECT public.handoff_regional_orientation(%L,%L,NULL,NULL,NULL,%L,%L)',v_sid,'europe',pg_temp.details(),'spoof'),'42501','shared cannot author');
    PERFORM pg_temp.denied(format('INSERT INTO public.requests(session_id,team,delegation_id,query) VALUES(%L,''green'',''europe'',''denied'')',v_sid),'42501','shared RFI denied');
    PERFORM pg_temp.denied(format('INSERT INTO public.communications(session_id,move,from_role,to_role,type,content) VALUES(%L,1,''green_shared_facilitator'',''white_cell'',''direct'',''denied'')',v_sid),
        '42501,23514','shared direct message denied');
    PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.requests WHERE id=rfi),'shared private RFI read denied');
    PERFORM pg_temp.denied(format('SELECT public.append_proposal_thread_message(%L,''denied'',''PROPOSAL_RESPONSE_REVIEW'',NULL,NULL)',
        (SELECT id FROM public.communications WHERE session_id=v_sid AND content='GC05 synthetic parent')),'42501','shared thread denied');
    RESET ROLE;
    PERFORM pg_temp.identity(scribe.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT public.handoff_regional_orientation(%L,%L,%L,1,1,%L,%L)',v_sid,'europe',proposal,pg_temp.details(),'spoof'),'42501','proposal through handoff path');
    PERFORM pg_temp.denied(format('SELECT public.handoff_regional_orientation(%L,%L,NULL,NULL,NULL,%L,%L)',v_sid,'europe','RFI Details','spoof'),'23514','RFI through handoff path');
    RESET ROLE; PERFORM pg_temp.identity(NULL);
    UPDATE public.session_participants SET heartbeat_at=NOW()-INTERVAL '91 seconds',last_seen=NOW()-INTERVAL '91 seconds' WHERE id=seat;
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT public.submit_regional_orientation(%L,%L,%L,2,5)',v_sid,'europe',r.id),'42501','stale seat denied');
    RESET ROLE; PERFORM pg_temp.identity(NULL);
    UPDATE public.session_participants SET revoked_at=NOW(),is_active=false WHERE id=seat;
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT public.submit_regional_orientation(%L,%L,%L,2,5)',v_sid,'europe',r.id),'42501','revoked seat denied');
    RESET ROLE; PERFORM pg_temp.identity(NULL);
    UPDATE public.session_participants SET heartbeat_at=NOW()-INTERVAL '91 seconds',last_seen=NOW()-INTERVAL '91 seconds' WHERE id=scribe_seat;
    PERFORM pg_temp.identity(scribe.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT public.handoff_regional_orientation(%L,%L,%L,2,5,%L,%L)',v_sid,'europe',r.id,pg_temp.details(),'denied'),
        '42501','stale Scribe handoff denied');
    RESET ROLE; PERFORM pg_temp.identity(NULL);
    UPDATE public.session_participants SET revoked_at=NOW(),is_active=false WHERE id=scribe_seat;
    PERFORM pg_temp.identity(scribe.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT public.handoff_regional_orientation(%L,%L,%L,2,5,%L,%L)',v_sid,'europe',r.id,pg_temp.details(),'denied'),
        '42501','revoked Scribe handoff denied');
    RESET ROLE; PERFORM pg_temp.identity(NULL);
END $$;

gc05_stage := 'report';
SELECT jsonb_build_object('suite','GC05','assertions',count(*),
    'results',jsonb_agg(jsonb_build_object('label',label,'result','PASS') ORDER BY label))
INTO gc05_report FROM pg_temp.gc05_results;
PERFORM set_config('gc05.rehearsal_result',gc05_report::TEXT,true);
EXCEPTION WHEN OTHERS THEN
    -- The exception block rolls back every fixture write before rethrowing.
    -- Put context in MESSAGE because the editor may omit DETAIL and CONTEXT.
    GET STACKED DIAGNOSTICS gc05_error_state=RETURNED_SQLSTATE,
        gc05_error_message=MESSAGE_TEXT, gc05_error_context=PG_EXCEPTION_CONTEXT;
    RAISE EXCEPTION USING ERRCODE=gc05_error_state,
        MESSAGE=format('GC05 stage=%s SQLSTATE=%s: %s | context: %s',
            gc05_stage,gc05_error_state,gc05_error_message,gc05_error_context);
END $gc05_suite$;

-- Result rendering has no temporary-relation dependency. The transaction-local
-- report is cleared by ROLLBACK, and a missing report is explicitly a failure.
WITH report AS (
    SELECT NULLIF(current_setting('gc05.rehearsal_result',true),'')::JSONB AS value
)
SELECT COALESCE(value->>'suite','GC05') AS suite,
    (value->>'assertions')::INTEGER AS assertions,
    entry->>'label' AS label, entry->>'result' AS result
FROM report CROSS JOIN LATERAL jsonb_array_elements(COALESCE(value->'results',
    '[{"label":"GC05 runner did not produce a report","result":"FAIL"}]'::JSONB)) AS checks(entry);
ROLLBACK;
