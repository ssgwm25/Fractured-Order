-- Entire file, postgres SQL Editor, after September 29. Synthetic, rollback only.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='10s';
RESET ROLE;
SET LOCAL request.jwt.claim.sub='';
SET LOCAL request.jwt.claims='{}';
SET LOCAL gc08.result='';
DO $suite$
DECLARE gm UUID := gen_random_uuid(); actor UUID := gen_random_uuid(); other UUID := gen_random_uuid();
    key UUID := gen_random_uuid(); s public.sessions; again public.sessions; old_session public.sessions;
    r TEXT := 'green-roster-v'||(extract(epoch FROM clock_timestamp())*1000000)::BIGINT;
    code TEXT := 'GC08'||replace(gen_random_uuid()::TEXT,'-',''); snapshot JSONB; seat JSONB;
BEGIN
    CREATE TEMP TABLE gc08_checks(label TEXT PRIMARY KEY);
    GRANT INSERT ON pg_temp.gc08_checks TO authenticated;
    CREATE FUNCTION pg_temp.gc08_check(ok BOOLEAN,label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
        IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'GC08 assertion failed: %',label; END IF;
        INSERT INTO pg_temp.gc08_checks VALUES(label);
    END $$;
    CREATE FUNCTION pg_temp.gc08_identity(id UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
        PERFORM set_config('request.jwt.claim.sub',id::TEXT,true);
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::TEXT,true);
    END $$;
    CREATE FUNCTION pg_temp.gc08_denied(statement TEXT,code TEXT,label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
        BEGIN EXECUTE statement;
        EXCEPTION WHEN OTHERS THEN
            IF SQLSTATE<>code THEN RAISE; END IF;
            PERFORM pg_temp.gc08_check(true,label); RETURN;
        END;
        RAISE EXCEPTION 'GC08 expected denial: %',label;
    END $$;
    snapshot := '{"asian_pacific":["ROK","Japan","ASEAN"],"europe":["UK","France","EU"],"aliases":{"South Korea":"ROK"},"source_references":["GC08 rollback-only synthetic fixture, not exercise approval"]}'::JSONB;
    INSERT INTO public.green_roster_approvals VALUES(r,snapshot,'GC08 synthetic approval',NOW());
    INSERT INTO public.green_roster_approvals VALUES(r||'1',snapshot||'{"europe":[]}'::JSONB,'GC08 empty fixture',NOW());
    INSERT INTO public.operator_grants(auth_user_id,surface,role) VALUES(gm,'gamemaster','white');
    PERFORM pg_temp.gc08_identity(actor); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.gc08_denied('SELECT public.list_approved_green_rosters()','42501','roster read requires GM');
    PERFORM pg_temp.gc08_denied('SELECT * FROM public.green_roster_approvals','42501','registry has no direct browser access');
    PERFORM pg_temp.gc08_denied('SELECT * FROM public.gc08_session_creations','42501','receipts have no direct browser access');
    PERFORM pg_temp.gc08_denied(format('SELECT public.create_configured_live_session(''Denied'',%L,NULL,''shared_facilitator_v1'',%L,%L)',code,r,key),
        '42501','direct create requires GM');
    RESET ROLE;
    PERFORM pg_temp.gc08_identity(gm); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.gc08_check(EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_approved_green_rosters()) x WHERE x->>'version'=r),'approved roster listed');
    PERFORM pg_temp.gc08_check(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_approved_green_rosters()) x WHERE x->>'version'=r||'1'),'empty fixture excluded');
    PERFORM pg_temp.gc08_denied(format('SELECT public.create_configured_live_session(''Missing'',%L,NULL,''shared_facilitator_v1'',NULL,%L)',code,key),'23514','missing roster rejected');
    PERFORM pg_temp.gc08_denied(format('SELECT public.create_configured_live_session(''Forged'',%L,NULL,''shared_facilitator_v1'',''forged'',%L)',code,key),'23514','forged roster rejected');
    PERFORM pg_temp.gc08_denied(format('SELECT public.create_configured_live_session(''Empty'',%L,NULL,''shared_facilitator_v1'',%L,%L)',code,r||'1',key),'23514','empty roster rejected');
    PERFORM pg_temp.gc08_check(NOT EXISTS(SELECT 1 FROM public.sessions WHERE session_code=code),'failed setup leaves no session');
    s := public.create_configured_live_session('GC08 synthetic',code,NULL,'shared_facilitator_v1',r,key);
    again := public.create_configured_live_session('GC08 synthetic',code,NULL,'shared_facilitator_v1',r,key);
    PERFORM pg_temp.gc08_check(s.id=again.id,'lost response retry identity');
    PERFORM pg_temp.gc08_check(s.session_topology_version=2 AND s.green_seat_model='shared_facilitator_v1','explicit independent model');
    PERFORM pg_temp.gc08_check(s.green_roster_snapshot - ARRAY['approved_by','approved_at']=snapshot,'exact frozen membership snapshot');
    PERFORM pg_temp.gc08_check(s.green_roster_snapshot->>'approved_by'='GC08 synthetic approval','approval provenance bound');
    PERFORM pg_temp.gc08_check((SELECT COUNT(*)=1 FROM public.game_state WHERE session_id=s.id),'one global clock');
    PERFORM pg_temp.gc08_denied(format('SELECT public.create_configured_live_session(''GC08 synthetic'',%L,NULL,''unified_v1'',NULL,%L)',code,key),'PT409','retry cannot downgrade');
    old_session := public.create_live_demo_session('GC08 legacy client',code||'U',NULL);
    PERFORM pg_temp.gc08_check(old_session.session_topology_version=1 AND old_session.green_seat_model IS NULL,'legacy signature unified');
    RESET ROLE;
    PERFORM pg_temp.gc08_identity(actor); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.gc08_check(public.lookup_joinable_session_by_code(code)->>'green_seat_model'='shared_facilitator_v1','normal lookup confirmed model');
    seat := public.claim_session_role_seat(s.id,'green_shared_facilitator','GC08 retained name',actor::TEXT,90);
    PERFORM pg_temp.gc08_check(seat->>'role'='green_shared_facilitator' AND seat->>'delegation_id' IS NULL,'shared seat not regional owner');
    RESET ROLE;
    PERFORM pg_temp.gc08_identity(other); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.gc08_denied(format('SELECT public.claim_session_role_seat(%L,''green_shared_facilitator'',''Denied'',%L,90)',s.id,other::TEXT),'P0001','shared capacity one');
    PERFORM pg_temp.gc08_denied(format('SELECT public.claim_session_role_seat(%L,''green_europe_facilitator'',''Denied'',%L,90)',s.id,other::TEXT),'42501','no extra Facilitator');
    RESET ROLE;
    PERFORM pg_temp.gc08_identity(gm); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.gc08_denied(format('SELECT public.configure_session_green_shared_facilitator(%L,%L)',s.id,r),'23514','occupied setup frozen');
    PERFORM public.archive_live_demo_session(s.id);
    again := public.create_configured_live_session('GC08 synthetic',code,NULL,'shared_facilitator_v1',r,key);
    PERFORM pg_temp.gc08_check(again.status='archived','recovery never reactivates');
    RESET ROLE;
    PERFORM pg_temp.gc08_check(EXISTS(SELECT 1 FROM public.session_participants WHERE id=(seat->>'id')::UUID AND display_name_snapshot='GC08 retained name'),'archive preserves name snapshot');
    PERFORM set_config('gc08.result',jsonb_build_object('result','PASS','assertions',(SELECT COUNT(*) FROM pg_temp.gc08_checks),
        'checks',(SELECT jsonb_agg(label ORDER BY label) FROM pg_temp.gc08_checks))::TEXT,true);
END $suite$;
SELECT COALESCE(NULLIF(current_setting('gc08.result',true),'')::JSONB,'{"result":"FAIL","reason":"missing report"}'::JSONB) gc08_result;
ROLLBACK;
