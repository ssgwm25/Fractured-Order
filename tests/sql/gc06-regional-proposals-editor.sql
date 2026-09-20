-- Run the ENTIRE file after September 26 and the September 27 thread-order repair.
-- Submit BEGIN through the final ROLLBACK together in one Run, as postgres.
-- One server-side block creates and consumes temporary fixtures; errors name the stage.
-- Keep RLS enabled. Synthetic JWT identities do not prove hosted Auth or concurrency.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='10s';
RESET ROLE;
SET LOCAL request.jwt.claim.sub='';
SET LOCAL request.jwt.claims='{}';
SET LOCAL gc06.rehearsal_result='';

DO $gc06_suite$
DECLARE
    gc06_stage TEXT := 'fixture_tables';
    gc06_report JSONB;
    gc06_error_state TEXT;
    gc06_error_message TEXT;
    gc06_error_context TEXT;
BEGIN
CREATE TEMP TABLE gc06_sessions AS
SELECT gen_random_uuid() AS id, model,
    'green-roster-v'||(extract(epoch FROM clock_timestamp())*1000000)::BIGINT::TEXT||floor(random()*1000000000)::BIGINT::TEXT AS roster
FROM (VALUES ('shared'),('pairs'),('unified')) m(model);
CREATE TEMP TABLE gc06_actors AS
SELECT s.id AS sid, s.model, r.role, r.delegation, gen_random_uuid() AS auth_id
FROM pg_temp.gc06_sessions s CROSS JOIN (VALUES
    ('green_asian_pacific_scribe','asian_pacific'),('green_europe_scribe','europe'),
    ('green_shared_facilitator',NULL),('green_asian_pacific_facilitator','asian_pacific'),
    ('green_europe_facilitator','europe'),('blue_scribe',NULL),('red_scribe',NULL),('whitecell_lead',NULL)) r(role,delegation)
WHERE s.model<>'unified' AND (s.model='shared' AND r.role NOT LIKE '%_facilitator' OR s.model='shared' AND r.role='green_shared_facilitator'
    OR s.model='pairs' AND r.role<>'green_shared_facilitator')
UNION ALL
SELECT s.id,s.model,r.role,NULL::TEXT,gen_random_uuid()
FROM pg_temp.gc06_sessions s CROSS JOIN (VALUES ('green_facilitator'),('green_scribe'),('whitecell_lead'),('blue_scribe')) r(role)
WHERE s.model='unified';
CREATE TEMP TABLE gc06_results(label TEXT PRIMARY KEY);
GRANT SELECT ON pg_temp.gc06_sessions,pg_temp.gc06_actors TO authenticated;
GRANT INSERT ON pg_temp.gc06_results TO authenticated;

gc06_stage := 'fixture_helpers';
CREATE FUNCTION pg_temp.identity(actor UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    PERFORM set_config('request.jwt.claim.sub',COALESCE(actor::TEXT,''),true);
    PERFORM set_config('request.jwt.claims',CASE WHEN actor IS NULL THEN '{}'
        ELSE jsonb_build_object('sub',actor,'role','authenticated')::TEXT END,true);
END $$;
CREATE FUNCTION pg_temp.check_true(ok BOOLEAN,label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'GC06 assertion failed: %',label; END IF;
    INSERT INTO pg_temp.gc06_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.denied(statement TEXT,code TEXT,label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    BEGIN EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        IF NOT SQLSTATE=ANY(string_to_array(code,',')) THEN RAISE; END IF;
        PERFORM pg_temp.check_true(true,label); RETURN;
    END;
    RAISE EXCEPTION 'GC06 expected rejection: %',label;
END $$;
CREATE FUNCTION pg_temp.details(narrative TEXT DEFAULT 'Synthetic strategy only') RETURNS TEXT LANGUAGE SQL AS $$
    SELECT 'Strategic Orientation Details'||chr(10)||'Contract Version: 2'||chr(10)||'Period: pre_move_1'||chr(10)
        ||'Artifact Type: orientation_and_forecast'||chr(10)||'Team: green'||chr(10)
        ||'Own Orientation: {"id":"pressure","label":"Pressure","tag":"Focus on affecting PRC GDP growth"}'||chr(10)
        ||'Forecast Targets: [{"key":"blue","orientation":"pressure"}]'||chr(10)
        ||'Strategy Description: '||narrative||chr(10)||'Scribe Handoff: Forwarded'
$$;

gc06_stage := 'fixture_sessions';
INSERT INTO public.green_roster_approvals(version,snapshot,approved_by,approved_at)
SELECT roster,'{"asian_pacific":["ROK","Japan","ASEAN"],"europe":["UK","France","EU"],"aliases":{"South Korea":"ROK"},"source_references":["GC06 rollback-only synthetic rehearsal"]}'::JSONB,
    'Synthetic fixture, not exercise approval',NOW() FROM pg_temp.gc06_sessions WHERE model<>'unified';
INSERT INTO public.sessions(id,name,status,session_topology_version)
SELECT id,'GC06 synthetic '||id,'active',CASE WHEN model='unified' THEN 1 ELSE 2 END FROM pg_temp.gc06_sessions;
UPDATE public.sessions s SET green_seat_model=CASE WHEN f.model='shared' THEN 'shared_facilitator_v1' END,
    green_roster_version=r.version,green_roster_snapshot=r.snapshot||jsonb_build_object('approved_by',r.approved_by,'approved_at',r.approved_at)
FROM pg_temp.gc06_sessions f JOIN public.green_roster_approvals r ON r.version=f.roster WHERE s.id=f.id;
INSERT INTO public.game_state(session_id,move,phase) SELECT id,1,1 FROM pg_temp.gc06_sessions;
INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id)
SELECT auth_id,'whitecell',role,sid FROM pg_temp.gc06_actors WHERE role='whitecell_lead';

gc06_stage := 'seat_claims';
DO $$ DECLARE actor RECORD; BEGIN
    FOR actor IN SELECT * FROM pg_temp.gc06_actors LOOP
        PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
        PERFORM public.claim_session_role_seat(actor.sid,actor.role,'GC06 synthetic','gc06-'||actor.auth_id,90);
        RESET ROLE;
    END LOOP;
    PERFORM pg_temp.identity(NULL);
END $$;


gc06_stage := 'proposal_helpers';
CREATE TEMP TABLE gc06_proposals(sid UUID, delegation TEXT, record JSONB, root_blue JSONB, root_red JSONB, PRIMARY KEY(sid,delegation));
GRANT SELECT,INSERT,UPDATE ON pg_temp.gc06_proposals TO authenticated;
CREATE FUNCTION pg_temp.proposal_payload(region TEXT, handoff TEXT DEFAULT 'Draft', origin TEXT DEFAULT NULL) RETURNS JSONB LANGUAGE SQL AS $$
    SELECT jsonb_build_object('goal','GC06 synthetic '||region,'expected_outcomes','Synthetic outcomes only','sector','Agriculture',
        'ally_contingencies','Proposal Details'||chr(10)||'Originators: '||to_jsonb(ARRAY[COALESCE(origin,CASE region WHEN 'europe' THEN 'UK' ELSE 'ROK' END)])::TEXT
        ||chr(10)||'Objective: Synthetic objective'||chr(10)||'Intended Partners: Blue and Red'
        ||chr(10)||'Recipient Teams: ["blue","red"]'||chr(10)||'Focus Sectors: ["Agriculture"]'
        ||chr(10)||'Supply Chain Focus Decision: No'||chr(10)||'Supply Chain Areas: []'
        ||chr(10)||'Timing And Conditions: Synthetic timing and conditions'||chr(10)||'Scribe Handoff: '||handoff)
$$;
CREATE FUNCTION pg_temp.write_proposal(sid UUID,region TEXT,op TEXT,a JSONB DEFAULT NULL,origin TEXT DEFAULT NULL)
RETURNS public.actions LANGUAGE SQL AS $$
    SELECT public.write_regional_proposal(sid,region,(a->>'id')::UUID,(a->>'revision_number')::BIGINT,(a->>'row_version')::BIGINT,op,
        CASE WHEN op='submit' THEN '{}'::JSONB ELSE pg_temp.proposal_payload(region,CASE WHEN op='save' THEN 'Draft' ELSE 'Forwarded' END,origin) END,'parallel-key')
$$;

gc06_stage := 'unified_handoff_and_thread';
-- Historical unified role inversion and direct proposal handoff remain intact.
DO $$ DECLARE sid UUID; actor RECORD; a public.actions; review JSONB; root JSONB; pending public.communications; released JSONB; reply public.communications; BEGIN
 SELECT id INTO sid FROM pg_temp.gc06_sessions WHERE model='unified';
 SELECT * INTO actor FROM pg_temp.gc06_actors WHERE model='unified' AND role='green_facilitator';
 PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
 -- The legacy scalar recipient is still required alongside the full recipient list.
 INSERT INTO public.actions(session_id,team,move,phase,mechanism,sector,goal,expected_outcomes,ally_contingencies,artifact_type,proposal_recipient_team)
 VALUES(sid,'green',1,1,'Proposal','Agriculture','GC06 synthetic unified proposal','Synthetic outcomes',
    pg_temp.proposal_payload('europe','Forwarded')->>'ally_contingencies','proposal','blue') RETURNING * INTO a;
 PERFORM pg_temp.check_true(a.proposal_recipient_team='blue'
    AND a.artifact_payload#>'{proposal,recipientTeams}'='["blue","red"]'::JSONB,
    'unified scalar recipient and both intended recipients preserved');
 RESET ROLE;
 SELECT * INTO actor FROM pg_temp.gc06_actors WHERE model='unified' AND role='green_scribe';
 PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
 UPDATE public.actions SET status='submitted' WHERE id=a.id RETURNING * INTO a;
 PERFORM pg_temp.check_true(a.delegation_id IS NULL AND a.workflow_state='submitted_to_white_cell','unified original role handoff');
 RESET ROLE;
 SELECT * INTO actor FROM pg_temp.gc06_actors WHERE model='unified' AND role='whitecell_lead';
 PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
 review := public.operator_review_artifact('action',a.id,'return_to_team','green',1,'Synthetic legacy correction');
 PERFORM pg_temp.check_true(review#>>'{artifact,delegation_id}' IS NULL AND review#>>'{artifact,revision_number}'='2','unified return never relabeled');
 RESET ROLE;
 SELECT * INTO actor FROM pg_temp.gc06_actors WHERE model='unified' AND role='green_facilitator';
 PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
 UPDATE public.actions SET goal='GC06 synthetic unified correction' WHERE id=a.id;
 RESET ROLE;
 SELECT * INTO actor FROM pg_temp.gc06_actors WHERE model='unified' AND role='green_scribe';
 PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
 UPDATE public.actions SET status='submitted' WHERE id=a.id RETURNING * INTO a;
 PERFORM pg_temp.check_true(a.workflow_state='resubmitted' AND a.revision_number=2 AND a.delegation_id IS NULL,'unified correction resubmission');
 RESET ROLE;
 SELECT * INTO actor FROM pg_temp.gc06_actors WHERE model='unified' AND role='whitecell_lead';
 PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
 root := public.operator_review_proposal(a.id,'forward_to_recipient','blue',NULL,2)->'communication';
 RESET ROLE;
 SELECT * INTO actor FROM pg_temp.gc06_actors WHERE model='unified' AND role='blue_scribe';
 PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
 pending := public.append_proposal_thread_message((root->>'id')::UUID,'Synthetic legacy Blue terms','negotiation_message',NULL,'unified-blue-first');
 PERFORM pg_temp.denied(format('SELECT public.append_proposal_thread_message(%L,''pending duplicate'',''negotiation_message'',NULL,''unified-blue-duplicate'')',
    root->>'id'),'PT409','unified pending review blocks new key');
 RESET ROLE;
 SELECT * INTO actor FROM pg_temp.gc06_actors WHERE model='unified' AND role='whitecell_lead';
 PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
 released := public.operator_forward_proposal_response(pending.id);
 RESET ROLE;
 SELECT * INTO actor FROM pg_temp.gc06_actors WHERE model='unified' AND role='green_scribe';
 PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
 reply := public.append_proposal_thread_message((released#>>'{communication,id}')::UUID,'Synthetic legacy Green terms','negotiation_message',NULL,'unified-green-followup');
 PERFORM pg_temp.check_true(reply.metadata->>'round_number'='2' AND reply.delegation_id IS NULL,
    'unified released round followup without relabeling');
 RESET ROLE; PERFORM pg_temp.identity(NULL);
END $$;

gc06_stage := 'regional_drafts';
-- Two independent drafts per model; the same client key must not collide.
DO $$ DECLARE actor RECORD; a public.actions%ROWTYPE; again public.actions%ROWTYPE; BEGIN
 FOR actor IN SELECT * FROM pg_temp.gc06_actors WHERE role IN ('green_asian_pacific_scribe','green_europe_scribe') LOOP
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    a := pg_temp.write_proposal(actor.sid,actor.delegation,'save');
    again := pg_temp.write_proposal(actor.sid,actor.delegation,'save');
    PERFORM pg_temp.check_true(a.id=again.id AND a.delegation_id=actor.delegation AND a.workflow_state='draft',actor.model||actor.role||' scoped retry');
    PERFORM pg_temp.denied(format('SELECT pg_temp.write_proposal(%L,%L,''save'',NULL,%L)',actor.sid,actor.delegation,
        CASE actor.delegation WHEN 'europe' THEN 'ROK' ELSE 'UK' END),'23514',actor.model||actor.role||' invalid originator');
    PERFORM pg_temp.denied(format('UPDATE public.actions SET status=''submitted'' WHERE id=%L',a.id),'42501',actor.model||actor.role||' direct submit denied');
    PERFORM pg_temp.denied(format('SELECT public.write_regional_proposal(%L,%L,%L,1,1,''save'',%L::JSONB,NULL)',
        actor.sid,actor.delegation,a.id,(pg_temp.proposal_payload(actor.delegation)||'{"delegation_id":"forged"}'::JSONB)::TEXT),
        '42501',actor.model||actor.role||' forged owner payload denied');
    INSERT INTO pg_temp.gc06_proposals VALUES(actor.sid,actor.delegation,to_jsonb(a),NULL,NULL);
    RESET ROLE;
 END LOOP;
 PERFORM pg_temp.identity(NULL);
 PERFORM pg_temp.check_true((SELECT count(DISTINCT record->>'id')=4 FROM pg_temp.gc06_proposals),'parallel region identities');
END $$;

gc06_stage := 'shared_scope_denials';
-- No shared access to unforwarded drafts; no generic submit, RFI, direct or note permission.
DO $$ DECLARE actor RECORD; p RECORD; a public.actions%ROWTYPE; BEGIN
 SELECT * INTO actor FROM pg_temp.gc06_actors WHERE role='green_shared_facilitator';
 SELECT * INTO p FROM pg_temp.gc06_proposals WHERE sid=actor.sid AND delegation='europe';
 PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
 PERFORM pg_temp.check_true((SELECT count(*)=0 FROM public.actions WHERE session_id=actor.sid),'shared private draft read denied');
 PERFORM pg_temp.denied(format('SELECT pg_temp.write_proposal(%L,''europe'',''edit'',%L::JSONB)',actor.sid,p.record::TEXT),'23514','unforwarded edit denied');
 PERFORM pg_temp.denied(format('INSERT INTO public.requests(session_id,team,delegation_id,query) VALUES(%L,''green'',''europe'',''denied'')',actor.sid),'42501','shared RFI denied');
 PERFORM pg_temp.denied(format('INSERT INTO public.communications(session_id,from_role,to_role,type,content) VALUES(%L,''green_shared_facilitator'',''white_cell'',''direct'',''denied'')',actor.sid),'42501,23514','shared direct denied');
 PERFORM pg_temp.check_true((SELECT count(*)=0 FROM public.scoped_notetaker_data WHERE session_id=actor.sid),'private note read denied');
 PERFORM pg_temp.check_true(NOT public.green_has_capability(actor.sid,'submit') AND NOT public.green_has_capability(actor.sid,'thread'),'generic capabilities remain closed');
 RESET ROLE; PERFORM pg_temp.identity(NULL);
END $$;

gc06_stage := 'regional_handoffs';
DO $$ DECLARE p RECORD; actor RECORD; fac RECORD; a public.actions%ROWTYPE; submitted public.actions%ROWTYPE; prior_snapshot JSONB; permitted_snapshot JSONB; BEGIN
 FOR p IN SELECT * FROM pg_temp.gc06_proposals LOOP
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role='green_'||p.delegation||'_scribe';
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    a := pg_temp.write_proposal(p.sid,p.delegation,'forward',p.record);
    PERFORM pg_temp.check_true(a.proposal_handoff_revision=1 AND a.workflow_state='forwarded_to_facilitator',actor.model||p.delegation||' handoff');
    RESET ROLE;
    SELECT * INTO fac FROM pg_temp.gc06_actors WHERE sid=p.sid AND role IN ('green_shared_facilitator','green_'||p.delegation||'_facilitator');
    PERFORM pg_temp.identity(fac.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT pg_temp.write_proposal(%L,%L,''submit'',%L::JSONB)',p.sid,
        CASE p.delegation WHEN 'europe' THEN 'asian_pacific' ELSE 'europe' END,to_jsonb(a)::TEXT),'42501',actor.model||p.delegation||' wrong region handoff');
    IF fac.role='green_shared_facilitator' THEN
        -- The owner invokes the private predicate with the same authenticated
        -- seat. No grants are widened; these JSON fixtures are never persisted.
        RESET ROLE;
        prior_snapshot := jsonb_set(to_jsonb(a),'{artifact_payload,proposal_recipient_reviews}',
            '{"blue":{"status":"pending_white_cell_approval"}}'::JSONB);
        permitted_snapshot := jsonb_set(prior_snapshot,'{artifact_payload,proposal,title}','"Synthetic permitted edit"'::JSONB);
        PERFORM pg_temp.check_true(public.gc06_shared_change(prior_snapshot,permitted_snapshot),
            actor.model||p.delegation||' proposal content change permitted');
        PERFORM pg_temp.check_true(NOT public.gc06_shared_change(prior_snapshot,
            jsonb_set(permitted_snapshot,'{artifact_payload,proposal_recipient_reviews,blue,status}','"approved_forwarded"'::JSONB)),
            actor.model||p.delegation||' sibling approval change denied');
        SET LOCAL ROLE authenticated;
    END IF;
    a := pg_temp.write_proposal(p.sid,p.delegation,'edit',to_jsonb(a));
    PERFORM pg_temp.denied(format('SELECT pg_temp.write_proposal(%L,%L,''submit'',%L::JSONB)',p.sid,p.delegation,p.record::TEXT),'PT409',actor.model||p.delegation||' stale revision');
    submitted := pg_temp.write_proposal(p.sid,p.delegation,'submit',to_jsonb(a));
    PERFORM pg_temp.check_true(submitted.status='submitted' AND submitted.delegation_id=p.delegation,actor.model||p.delegation||' submit');
    PERFORM pg_temp.denied(format('SELECT pg_temp.write_proposal(%L,%L,''submit'',%L::JSONB)',p.sid,p.delegation,to_jsonb(submitted)::TEXT),'23514',actor.model||p.delegation||' double submit');
    UPDATE pg_temp.gc06_proposals SET record=to_jsonb(submitted) WHERE sid=p.sid AND delegation=p.delegation;
    RESET ROLE;
 END LOOP;
 PERFORM pg_temp.identity(NULL);
END $$;

gc06_stage := 'return_correction_resubmission';
-- Return after one approval, preserving that approval and requiring a new root.
DO $$ DECLARE p RECORD; actor RECORD; result JSONB; old_root JSONB; corrected public.actions%ROWTYPE; BEGIN
 FOR p IN SELECT * FROM pg_temp.gc06_proposals LOOP
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role='whitecell_lead';
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    result := public.operator_review_proposal((p.record->>'id')::UUID,'forward_to_recipient','blue',NULL,1);
    old_root := result->'communication';
    result := public.operator_review_artifact('action',(p.record->>'id')::UUID,'return_to_team','green',1,'Synthetic correction');
    PERFORM pg_temp.check_true(result#>>'{artifact,delegation_id}'=p.delegation AND result#>>'{artifact,revision_number}'='2'
        AND result#>>'{artifact,proposal_handoff_revision}' IS NULL,actor.model||p.delegation||' return revision');
    UPDATE pg_temp.gc06_proposals SET record=result->'artifact' WHERE sid=p.sid AND delegation=p.delegation;
    RESET ROLE;
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role='green_'||CASE p.delegation WHEN 'europe' THEN 'asian_pacific' ELSE 'europe' END||'_scribe';
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.artifact_workflow_reviews WHERE artifact_id=(p.record->>'id')::UUID),actor.model||p.delegation||' other Scribe return hidden');
    PERFORM pg_temp.denied(format('SELECT pg_temp.write_proposal(%L,%L,''forward'',%L::JSONB)',p.sid,p.delegation,(result->'artifact')::TEXT),'42501',actor.model||p.delegation||' other Scribe correction denied');
    RESET ROLE;
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role IN ('green_shared_facilitator','green_'||p.delegation||'_facilitator');
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.check_true(EXISTS(SELECT 1 FROM public.artifact_workflow_reviews WHERE artifact_id=(p.record->>'id')::UUID),actor.model||p.delegation||' Facilitator return visible');
    PERFORM pg_temp.denied(format('SELECT pg_temp.write_proposal(%L,%L,''submit'',%L::JSONB)',p.sid,p.delegation,(result->'artifact')::TEXT),'23514',actor.model||p.delegation||' rehandoff required');
    RESET ROLE;
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role='green_'||p.delegation||'_scribe';
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    corrected := pg_temp.write_proposal(p.sid,p.delegation,'forward',result->'artifact');
    RESET ROLE;
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role IN ('green_shared_facilitator','green_'||p.delegation||'_facilitator');
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    corrected := pg_temp.write_proposal(p.sid,p.delegation,'submit',to_jsonb(corrected));
    PERFORM pg_temp.check_true(corrected.workflow_state='resubmitted' AND corrected.revision_number=2,actor.model||p.delegation||' corrected resubmission');
    RESET ROLE;
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role='blue_scribe';
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT public.append_proposal_thread_message(%L,''stale'',''negotiation_message'',NULL,''old'')',old_root->>'id'),'42501',actor.model||p.delegation||' old revision thread denied');
    RESET ROLE;
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role='whitecell_lead';
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    result := public.operator_review_proposal(corrected.id,'forward_to_recipient','blue',NULL,2);
    PERFORM pg_temp.check_true(result#>>'{communication,id}'<>old_root->>'id',actor.model||p.delegation||' fresh Blue approval');
    UPDATE pg_temp.gc06_proposals SET root_blue=result->'communication' WHERE sid=p.sid AND delegation=p.delegation;
    result := public.operator_review_proposal(corrected.id,'forward_to_recipient','red',NULL,2);
    PERFORM pg_temp.check_true(result#>>'{action,workflow_state}'='completed',actor.model||p.delegation||' separate Red approval completes');
    UPDATE pg_temp.gc06_proposals SET root_red=result->'communication',record=result->'action' WHERE sid=p.sid AND delegation=p.delegation;
    RESET ROLE;
 END LOOP;
 PERFORM pg_temp.identity(NULL);
END $$;

gc06_stage := 'recipient_threads';
DO $$ DECLARE p RECORD; actor RECORD; pending public.communications%ROWTYPE; released JSONB; reply public.communications%ROWTYPE; forged_field TEXT; forged JSONB; BEGIN
 FOR p IN SELECT * FROM pg_temp.gc06_proposals LOOP
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role='blue_scribe';
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT public.append_proposal_thread_message(%L,''escape'',''negotiation_message'',NULL,''same'')',p.root_red->>'id'),'42501',actor.model||p.delegation||' wrong recipient thread denied');
    pending := public.append_proposal_thread_message((p.root_blue->>'id')::UUID,'Synthetic Blue terms','negotiation_message',NULL,'same');
    PERFORM pg_temp.check_true(pending.type='PROPOSAL_RESPONSE_REVIEW',actor.model||p.delegation||' pending WC review');
    PERFORM pg_temp.denied(format('SELECT public.append_proposal_thread_message(%L,''duplicate pending'',''negotiation_message'',NULL,''different-key'')',
        p.root_blue->>'id'),'PT409',actor.model||p.delegation||' pending review blocks new key');
    PERFORM pg_temp.check_true((public.append_proposal_thread_message((p.root_blue->>'id')::UUID,'Synthetic Blue terms','negotiation_message',NULL,'same')).id=pending.id,actor.model||p.delegation||' thread retry');
    RESET ROLE;
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role='whitecell_lead';
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    released := public.operator_forward_proposal_response(pending.id);
    PERFORM pg_temp.check_true(released#>>'{communication,delegation_id}'=p.delegation,actor.model||p.delegation||' response owner routing');
    RESET ROLE;
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role IN ('green_shared_facilitator','green_'||p.delegation||'_facilitator');
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.check_true(EXISTS(SELECT 1 FROM public.communications WHERE id=(released#>>'{communication,id}')::UUID),actor.model||p.delegation||' Facilitator response visible');
    reply := public.append_proposal_thread_message((released#>>'{communication,id}')::UUID,'Synthetic Green followup','negotiation_message',NULL,'same');
    PERFORM pg_temp.check_true(reply.sender_delegation_id=p.delegation,actor.model||p.delegation||' followup delegation');
    PERFORM pg_temp.check_true(reply.metadata->>'round_number'='2' AND reply.metadata->>'parent_message_id'=released#>>'{communication,id}',
        actor.model||p.delegation||' released response is next parent');
    PERFORM pg_temp.check_true((public.append_proposal_thread_message((released#>>'{communication,id}')::UUID,
        'Synthetic Green followup','negotiation_message',NULL,'same')).id=reply.id,actor.model||p.delegation||' followup retry');
    PERFORM pg_temp.denied(format('SELECT public.append_proposal_thread_message(%L,''duplicate followup'',''negotiation_message'',NULL,''different-followup'')',
        released#>>'{communication,id}'),'PT409',actor.model||p.delegation||' unreviewed followup blocks new key');
    FOREACH forged_field IN ARRAY ARRAY['source_proposal_id','source_team','recipient_team','thread_id','source_revision'] LOOP
        forged := reply.metadata||jsonb_build_object(forged_field,CASE forged_field WHEN 'source_proposal_id' THEN gen_random_uuid()::TEXT
            WHEN 'source_team' THEN 'industry' WHEN 'recipient_team' THEN 'red' WHEN 'source_revision' THEN '999' ELSE gen_random_uuid()::TEXT END);
        PERFORM pg_temp.denied(format('INSERT INTO public.communications(session_id,from_role,to_role,type,content,metadata) VALUES(%L,%L,''white_cell'',''PROPOSAL_RESPONSE_REVIEW'',''forged'',%L::JSONB)',
            p.sid,actor.role,forged::TEXT),'42501,23514','direct forged '||forged_field||actor.model||p.delegation);
    END LOOP;
    RESET ROLE;
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role='blue_scribe';
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT public.append_proposal_thread_message(%L,''stale parent'',''negotiation_message'',NULL,''stale-key'')',
        p.root_blue->>'id'),'PT409',actor.model||p.delegation||' stale root still denied');
    RESET ROLE;
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role='green_'||p.delegation||'_scribe';
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.check_true(EXISTS(SELECT 1 FROM public.communications WHERE id=(released#>>'{communication,id}')::UUID),actor.model||p.delegation||' originating Scribe sees released response');
    RESET ROLE;
    SELECT * INTO actor FROM pg_temp.gc06_actors WHERE sid=p.sid AND role='green_'||CASE p.delegation WHEN 'europe' THEN 'asian_pacific' ELSE 'europe' END||'_scribe';
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.communications WHERE id=(released#>>'{communication,id}')::UUID),actor.model||p.delegation||' other Scribe cannot read response');
    RESET ROLE;
 END LOOP;
 PERFORM pg_temp.identity(NULL);
END $$;


gc06_stage := 'orientation_compatibility';
DO $$ DECLARE actor RECORD; fac RECORD; orientation public.actions%ROWTYPE; BEGIN
 FOR actor IN SELECT * FROM pg_temp.gc06_actors WHERE role IN ('green_asian_pacific_scribe','green_europe_scribe') LOOP
    PERFORM pg_temp.identity(actor.auth_id); SET LOCAL ROLE authenticated;
    orientation := public.handoff_regional_orientation(actor.sid,actor.delegation,NULL,NULL,NULL,pg_temp.details(),'GC06 orientation regression');
    RESET ROLE;
    SELECT * INTO fac FROM pg_temp.gc06_actors WHERE sid=actor.sid AND role IN ('green_shared_facilitator','green_'||actor.delegation||'_facilitator');
    PERFORM pg_temp.identity(fac.auth_id); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.denied(format('SELECT pg_temp.write_proposal(%L,%L,''submit'',%L::JSONB)',actor.sid,actor.delegation,to_jsonb(orientation)::TEXT),
        '42501',actor.model||actor.delegation||' orientation cannot use proposal authority');
    orientation := public.submit_regional_orientation(actor.sid,actor.delegation,orientation.id,orientation.revision_number,orientation.row_version);
    PERFORM pg_temp.check_true(orientation.status='submitted',actor.model||actor.delegation||' GC05 submission preserved');
    RESET ROLE;
 END LOOP;
 PERFORM pg_temp.identity(NULL);
END $$;

gc06_stage := 'report';
SELECT jsonb_build_object('suite','GC06','assertions',count(*),
    'results',jsonb_agg(jsonb_build_object('label',label,'result','PASS') ORDER BY label))
INTO gc06_report FROM pg_temp.gc06_results;
PERFORM set_config('gc06.rehearsal_result',gc06_report::TEXT,true);
EXCEPTION WHEN OTHERS THEN
    -- All fixture writes roll back before rethrowing; include context in MESSAGE
    -- because SQL Editor may omit the separate DETAIL and CONTEXT fields.
    GET STACKED DIAGNOSTICS gc06_error_state=RETURNED_SQLSTATE,
        gc06_error_message=MESSAGE_TEXT, gc06_error_context=PG_EXCEPTION_CONTEXT;
    RAISE EXCEPTION USING ERRCODE=gc06_error_state,
        MESSAGE=format('GC06 stage=%s SQLSTATE=%s: %s | context: %s',
            gc06_stage,gc06_error_state,gc06_error_message,gc06_error_context);
END $gc06_suite$;

-- Rendering reads a transaction-local report, not a temporary relation.
-- Missing or empty reports are failures; ROLLBACK clears fixtures and report.
WITH report AS (
    SELECT NULLIF(current_setting('gc06.rehearsal_result',true),'')::JSONB AS value
)
SELECT COALESCE(value->>'suite','GC06') AS suite,
    (value->>'assertions')::INTEGER AS assertions,
    entry->>'label' AS label, entry->>'result' AS result
FROM report CROSS JOIN LATERAL jsonb_array_elements(CASE
    WHEN (value->>'assertions')::INTEGER > 0 THEN value->'results'
    ELSE '[{"label":"GC06 runner did not produce a report","result":"FAIL"}]'::JSONB
END) AS checks(entry);
ROLLBACK;
