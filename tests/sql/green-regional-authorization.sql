-- Database-owner connection to a dedicated, fully migrated rehearsal database.
-- Real authenticated RLS/RPC checks; synthetic approval is rolled back.
BEGIN;
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claims = '{}';
SET LOCAL statement_timeout = '30s';
CREATE FUNCTION pg_temp.gc03_check(value BOOLEAN, label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'GC03 assertion: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.gc03_denied(statement TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    BEGIN EXECUTE statement;
    EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE '23514' OR SQLSTATE 'P0001' THEN RETURN; END;
    RAISE EXCEPTION 'Expected authorization/contract rejection: %',statement;
END $$;
CREATE TEMP TABLE gc03_ids(name TEXT PRIMARY KEY,id UUID DEFAULT gen_random_uuid());
INSERT INTO gc03_ids(name) VALUES ('regional'),('other'),('legacy'),('ap'),('eu'),('fac'),('notes'),('replacement'),('outsider'),('gm'),
    ('ap_action'),('eu_action'),('root'),('eu_root'),('blue'),('red');
GRANT SELECT ON gc03_ids TO authenticated;
CREATE FUNCTION pg_temp.gc03_id(key TEXT) RETURNS UUID LANGUAGE SQL AS $$ SELECT id FROM gc03_ids WHERE name=key $$;
CREATE FUNCTION pg_temp.gc03_identity(key TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    PERFORM set_config('request.jwt.claim.sub',pg_temp.gc03_id(key)::TEXT,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.gc03_id(key),'role','authenticated')::TEXT,true);
END $$;
INSERT INTO public.green_roster_approvals(version,snapshot,approved_by,approved_at)
    VALUES('green-roster-v2147483646','{"asian_pacific":[],"europe":[],"aliases":{},"source_references":["GC03 synthetic fixture only"]}',
        'Regression fixture, not exercise approval',NOW());
INSERT INTO public.sessions(id,name,status,session_topology_version)
    SELECT id,'GC03 synthetic '||name,'active',CASE WHEN name='legacy' THEN 1 ELSE 2 END
    FROM gc03_ids WHERE name IN ('regional','other','legacy');
UPDATE public.sessions SET green_roster_version=a.version,
    green_roster_snapshot=a.snapshot||jsonb_build_object('approved_by',a.approved_by,'approved_at',a.approved_at)
    FROM public.green_roster_approvals a WHERE a.version='green-roster-v2147483646'
        AND id IN (pg_temp.gc03_id('regional'),pg_temp.gc03_id('other'));
INSERT INTO public.game_state(session_id,move,phase) SELECT id,1,1 FROM gc03_ids WHERE name IN ('regional','other','legacy');
INSERT INTO public.operator_grants(auth_user_id,surface,role) VALUES(pg_temp.gc03_id('gm'),'gamemaster','white');

SET LOCAL ROLE authenticated;
SELECT pg_temp.gc03_identity('ap');
SELECT pg_temp.gc03_denied($q$SELECT public.claim_session_role_seat(pg_temp.gc03_id('legacy'),'green_asian_pacific_scribe','AP','gc03-ap')$q$);
SELECT pg_temp.gc03_denied($q$SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'green_scribe','AP','gc03-ap')$q$);
SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'Green_Asian_Pacific_Scribe','AP','gc03-ap');
SELECT pg_temp.gc03_check(public.green_has_capability(pg_temp.gc03_id('regional'),'draft'),'regional Scribe can draft');
SELECT pg_temp.gc03_check(NOT public.green_has_capability(pg_temp.gc03_id('regional'),'submit'),'regional Scribe cannot submit');
INSERT INTO public.actions(id,session_id,team,delegation_id,move,phase,mechanism,sector,artifact_type,proposal_recipient_team,goal)
    VALUES(pg_temp.gc03_id('ap_action'),pg_temp.gc03_id('regional'),'green','asian_pacific',1,1,'Proposal','','proposal','blue','AP private fixture');
SELECT pg_temp.gc03_denied($q$INSERT INTO public.actions(session_id,team,delegation_id,move,phase,mechanism,sector)
    VALUES(pg_temp.gc03_id('regional'),'green','europe',1,1,'fixture','')$q$);
SELECT pg_temp.gc03_denied($q$INSERT INTO public.actions(session_id,team,delegation_id,move,phase,mechanism,sector)
    VALUES(pg_temp.gc03_id('other'),'green','asian_pacific',1,1,'fixture','')$q$);
SELECT pg_temp.gc03_denied($q$UPDATE public.actions SET status='submitted' WHERE id=pg_temp.gc03_id('ap_action')$q$);
SELECT pg_temp.gc03_denied($q$SELECT public.operator_review_artifact('action',pg_temp.gc03_id('ap_action'),'complete','green',1,NULL)$q$);
SELECT pg_temp.gc03_denied($q$SELECT public.gc03_legacy_claim(pg_temp.gc03_id('regional'),'green_scribe','AP','gc03-ap',90)$q$);
SELECT pg_temp.gc03_denied($q$INSERT INTO public.requests(session_id,team,delegation_id,move,phase,query)
    VALUES(pg_temp.gc03_id('regional'),'green','asian_pacific',1,1,'Scribe cannot author RFI')$q$);

SELECT pg_temp.gc03_identity('eu');
SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'green_europe_scribe','EU','gc03-eu');
SELECT pg_temp.gc03_check((SELECT COUNT(*)=0 FROM public.actions WHERE id=pg_temp.gc03_id('ap_action')),'cross-region SELECT is empty');
WITH changed AS (UPDATE public.actions SET goal='unauthorized' WHERE id=pg_temp.gc03_id('ap_action') RETURNING id)
    SELECT pg_temp.gc03_check((SELECT COUNT(*)=0 FROM changed),'cross-region UPDATE affects zero rows');
WITH changed AS (DELETE FROM public.actions WHERE id=pg_temp.gc03_id('ap_action') RETURNING id)
    SELECT pg_temp.gc03_check((SELECT COUNT(*)=0 FROM changed),'cross-region DELETE affects zero rows');
SELECT pg_temp.gc03_check((SELECT COUNT(*)=0 FROM public.action_logs WHERE action_id=pg_temp.gc03_id('ap_action')),'audit copy does not leak AP');
INSERT INTO public.actions(id,session_id,team,delegation_id,move,phase,mechanism,sector,artifact_type,proposal_recipient_team,goal)
    VALUES(pg_temp.gc03_id('eu_action'),pg_temp.gc03_id('regional'),'green','europe',1,1,'Proposal','','proposal','blue','EU private fixture');
SELECT pg_temp.gc03_identity('outsider');
SELECT pg_temp.gc03_denied($q$SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'green_europe_scribe','Duplicate','gc03-outsider',1)$q$);
SELECT pg_temp.gc03_denied($q$SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'green_asian_pacific_facilitator','Spoof','gc03-ap')$q$);
SELECT pg_temp.gc03_check((SELECT COUNT(*)=0 FROM public.actions WHERE session_id=pg_temp.gc03_id('regional')),'cross-session outsider cannot read');

SELECT pg_temp.gc03_identity('ap');
UPDATE public.actions SET ally_contingencies='Proposal Details'||chr(10)||'Scribe Handoff: forwarded'
    WHERE id=pg_temp.gc03_id('ap_action');
SELECT pg_temp.gc03_identity('fac');
SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'green_asian_pacific_facilitator','AP facilitator','gc03-fac');
UPDATE public.actions SET status='submitted' WHERE id=pg_temp.gc03_id('ap_action');
SELECT pg_temp.gc03_check((SELECT status='submitted' FROM public.actions WHERE id=pg_temp.gc03_id('ap_action')),'semantic Facilitator submission');
INSERT INTO public.requests(session_id,team,delegation_id,move,phase,query)
    VALUES(pg_temp.gc03_id('regional'),'green','asian_pacific',1,1,'AP private RFI');
SELECT pg_temp.gc03_denied($q$INSERT INTO public.communications(session_id,move,from_role,to_role,type,content,metadata)
    VALUES(pg_temp.gc03_id('regional'),1,'green_europe_facilitator','white_cell','direct','spoof','{"source_team":"green"}')$q$);
INSERT INTO public.communications(session_id,move,from_role,to_role,type,content,metadata)
    VALUES(pg_temp.gc03_id('regional'),1,'green_asian_pacific_facilitator','white_cell','direct','AP private message','{"source_team":"green"}');
SELECT pg_temp.gc03_identity('eu');
SELECT pg_temp.gc03_check((SELECT COUNT(*)=0 FROM public.requests WHERE session_id=pg_temp.gc03_id('regional')),'RFI isolated');
SELECT pg_temp.gc03_check((SELECT COUNT(*)=0 FROM public.communications WHERE session_id=pg_temp.gc03_id('regional')),'direct text isolated');

-- Insert immutable thread roots as the database owner, not via a fabricated
-- participant decision. These are transport fixtures for authorization only.
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claims = '{}';
INSERT INTO public.communications(id,session_id,move,from_role,to_role,type,content,metadata)
    SELECT pg_temp.gc03_id('eu_root'),session_id,1,'white_cell','blue','PROPOSAL_FORWARDED','EU thread fixture',
        jsonb_build_object('source_proposal_id',id,'source_team','green','recipient_team','blue','thread_id',gen_random_uuid(),'round_number',0,'source_revision',1)
    FROM public.actions WHERE id=pg_temp.gc03_id('eu_action');
SET LOCAL ROLE authenticated;
SELECT pg_temp.gc03_identity('fac');
SELECT pg_temp.gc03_check((SELECT COUNT(*)=0 FROM public.communications WHERE id=pg_temp.gc03_id('eu_root')),'AP cannot read EU thread');
SELECT pg_temp.gc03_denied($q$SELECT public.append_proposal_thread_message(pg_temp.gc03_id('eu_root'),'spoof','negotiation_message',NULL,'retry')$q$);
SELECT pg_temp.gc03_identity('red');
SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'red_scribe','Red','gc03-red');
SELECT pg_temp.gc03_check((SELECT COUNT(*)=0 FROM public.communications WHERE id=pg_temp.gc03_id('eu_root')),'Red cannot read Blue recipient thread');
SELECT pg_temp.gc03_identity('blue');
SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'blue_scribe','Blue','gc03-blue');
SELECT pg_temp.gc03_check((SELECT COUNT(*)=1 FROM public.communications WHERE id=pg_temp.gc03_id('eu_root')),'Blue can read addressed thread');
SELECT public.append_proposal_thread_message(pg_temp.gc03_id('eu_root'),'Synthetic reply','recipient_response','negotiate','gc03-retry');
SELECT public.append_proposal_thread_message(pg_temp.gc03_id('eu_root'),'Synthetic reply','recipient_response','negotiate','gc03-retry');
SELECT pg_temp.gc03_check((SELECT COUNT(*)=1 FROM public.communications WHERE metadata->>'client_message_id'='gc03-retry'),'retry is idempotent');

SELECT pg_temp.gc03_identity('notes');
SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'green_asian_pacific_notetaker','AP notes','gc03-notes');
SELECT public.save_scoped_notetaker_data(pg_temp.gc03_id('regional'),1,1,'{}','{}','[]',0);
SELECT pg_temp.gc03_identity('gm');
SELECT pg_temp.gc03_check(NOT public.green_authorize_derived_operation(pg_temp.gc03_id('regional'),'adjudicate'),'regional privileged pipeline remains closed');
SELECT pg_temp.gc03_check(public.green_authorize_derived_operation(pg_temp.gc03_id('legacy'),'adjudicate'),'legacy operator dispatch permitted');
SELECT public.operator_remove_session_participant(pg_temp.gc03_id('regional'),
    (SELECT id FROM public.session_participants WHERE session_id=pg_temp.gc03_id('regional') AND role='green_asian_pacific_notetaker'));
SELECT pg_temp.gc03_check((SELECT COUNT(*)=1 FROM public.scoped_notetaker_data WHERE session_id=pg_temp.gc03_id('regional')),'note authorship retained after removal');
SELECT pg_temp.gc03_identity('notes');
SELECT pg_temp.gc03_check((SELECT COUNT(*)=0 FROM public.scoped_notetaker_data WHERE session_id=pg_temp.gc03_id('regional')),'revoked note access closed');
SELECT pg_temp.gc03_denied($q$SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'green_asian_pacific_notetaker','AP notes','gc03-notes')$q$);

SELECT pg_temp.gc03_identity('ap');
SELECT public.disconnect_session_role_seat(pg_temp.gc03_id('regional'),(public.green_storage_current_seat(pg_temp.gc03_id('regional'))->>'id')::UUID);
SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'green_asian_pacific_scribe','AP','gc03-ap');
-- Simulate elapsed heartbeat using owner fixtures; no trigger is disabled.
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claims = '{}';
UPDATE public.session_participants SET heartbeat_at=NOW()-INTERVAL '91 seconds'
    WHERE session_id=pg_temp.gc03_id('regional') AND role='green_asian_pacific_scribe';
SET LOCAL ROLE authenticated;
SELECT pg_temp.gc03_identity('replacement');
SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'green_asian_pacific_scribe','Replacement','gc03-replacement');
SELECT pg_temp.gc03_identity('ap');
SELECT pg_temp.gc03_denied($q$SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'green_asian_pacific_scribe','AP','gc03-ap')$q$);
SELECT pg_temp.gc03_identity('gm');
SELECT public.archive_live_demo_session(pg_temp.gc03_id('regional'));
SELECT pg_temp.gc03_check((SELECT status='archived' FROM public.sessions WHERE id=pg_temp.gc03_id('regional')),'archive retained');
SELECT pg_temp.gc03_identity('fac');
SELECT pg_temp.gc03_denied($q$SELECT public.claim_session_role_seat(pg_temp.gc03_id('regional'),'green_asian_pacific_facilitator','AP facilitator','gc03-fac')$q$);
SELECT pg_temp.gc03_identity('outsider');
SELECT public.claim_session_role_seat(pg_temp.gc03_id('legacy'),'Green_Facilitator','Legacy','gc03-outsider');
SELECT pg_temp.gc03_check(public.green_semantic_role(pg_temp.gc03_id('legacy'))='scribe','legacy inversion retained');
SELECT 'GC-03 sequential authorization assertions completed; fixtures rolled back' AS result;
ROLLBACK;
