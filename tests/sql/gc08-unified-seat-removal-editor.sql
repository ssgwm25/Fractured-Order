-- Human-run, postgres SQL Editor, after September 30. Synthetic and rollback-only.
-- Simulated JWT claims exercise installed SQL; this is not browser Auth evidence.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claims = '{}';
SET LOCAL gc08_removal.result = '';
DO $suite$
DECLARE
    gm UUID := gen_random_uuid(); outsider UUID := gen_random_uuid(); actor UUID; replacement UUID;
    sid UUID; foreign_sid UUID; role_name TEXT; topology CONSTANT INTEGER := 1; seat JSONB; next_seat JSONB;
    removed JSONB; original public.session_participants%ROWTYPE; receipt JSONB;
    label TEXT; n INTEGER; capacity INTEGER; row_count_before BIGINT;
    roster TEXT := 'green-roster-v'||(extract(epoch FROM clock_timestamp())*1000000)::BIGINT;
    model TEXT;
BEGIN
    CREATE TEMP TABLE gc08_removal_checks(label TEXT PRIMARY KEY);
    GRANT INSERT ON pg_temp.gc08_removal_checks TO authenticated;
    CREATE FUNCTION pg_temp.removal_check(ok BOOLEAN,label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
        IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'GC08 removal assertion failed: %',label; END IF;
        INSERT INTO pg_temp.gc08_removal_checks VALUES(label);
    END $$;
    CREATE FUNCTION pg_temp.removal_identity(id UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
        PERFORM set_config('request.jwt.claim.sub',id::TEXT,true);
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::TEXT,true);
    END $$;
    CREATE FUNCTION pg_temp.removal_denied(statement TEXT,code TEXT,label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
        BEGIN EXECUTE statement;
        EXCEPTION WHEN OTHERS THEN
            IF SQLSTATE<>code THEN RAISE; END IF;
            PERFORM pg_temp.removal_check(true,label); RETURN;
        END;
        RAISE EXCEPTION 'Expected denied removal operation: %',label;
    END $$;
    INSERT INTO public.operator_grants(auth_user_id,surface,role) VALUES(gm,'gamemaster','white');
    INSERT INTO public.sessions(name,status,session_topology_version)
        VALUES('GC08 rollback-only foreign fixture','active',1) RETURNING id INTO foreign_sid;
    SELECT count(*) INTO row_count_before FROM public.gc08_unified_seat_removals;
    PERFORM pg_temp.removal_check((SELECT relrowsecurity FROM pg_class WHERE oid='public.gc08_unified_seat_removals'::regclass), 'receipt table retains RLS');
    PERFORM pg_temp.removal_check(NOT has_table_privilege('authenticated','public.gc08_unified_seat_removals','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
        AND NOT has_table_privilege('anon','public.gc08_unified_seat_removals','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'receipt table has no browser grants');
    PERFORM pg_temp.removal_check(NOT has_function_privilege('authenticated','public.gc03_legacy_remove(uuid,uuid)','EXECUTE')
        AND NOT has_function_privilege('anon','public.gc03_legacy_remove(uuid,uuid)','EXECUTE'), 'legacy helper remains private');

    -- Current creation guards reject new NULL topology. Historical NULL
    -- preservation is covered by the mock; do not disable installed guards or
    -- mutate a historical session to manufacture that fixture here.
      FOREACH role_name IN ARRAY ARRAY['green_facilitator','green_scribe','whitecell_lead'] LOOP
        actor := gen_random_uuid(); label := COALESCE(topology::TEXT,'NULL')||'/'||role_name;
        RESET ROLE; PERFORM pg_temp.removal_identity(gm);
        INSERT INTO public.sessions(name,status,session_topology_version)
            VALUES('GC08 removal synthetic '||label,'active',topology) RETURNING id INTO sid;
        INSERT INTO public.game_state(session_id,move,phase) VALUES(sid,1,1);
        IF role_name='whitecell_lead' THEN
            INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id) VALUES(actor,'whitecell',role_name,sid);
        END IF;
        capacity := public.get_session_role_seat_limit(role_name);
        PERFORM pg_temp.removal_identity(actor); SET LOCAL ROLE authenticated;
        seat := public.claim_session_role_seat(sid,role_name,'Original '||label,actor::TEXT,90);
        PERFORM pg_temp.removal_check(public.claim_session_role_seat(sid,role_name,NULL,actor::TEXT,90)->>'id'=seat->>'id',label||' refresh preserves identity');
        RESET ROLE;
        SELECT * INTO original FROM public.session_participants WHERE id=(seat->>'id')::UUID;
        UPDATE public.participants SET name='Later mutable participant name' WHERE id=original.participant_id;
        PERFORM pg_temp.removal_identity(outsider); SET LOCAL ROLE authenticated;
        PERFORM pg_temp.removal_denied(format('SELECT public.operator_remove_session_participant(%L,%L)',sid,original.id),'42501',label||' unauthorized removal denied');
        PERFORM pg_temp.removal_denied(format('SELECT public.gc03_legacy_remove(%L,%L)',sid,original.id),'42501',label||' private bypass denied');
        RESET ROLE;
        PERFORM pg_temp.removal_check(EXISTS(SELECT 1 FROM public.session_participants WHERE id=original.id)
            AND NOT EXISTS(SELECT 1 FROM public.gc08_unified_seat_removals WHERE seat_id=original.id),label||' denied removal is atomic');
        PERFORM pg_temp.removal_identity(gm); SET LOCAL ROLE authenticated;
        PERFORM pg_temp.removal_denied(format('SELECT public.operator_remove_session_participant(%L,%L)',foreign_sid,original.id),'P0002',label||' wrong session denied');
        removed := public.operator_remove_session_participant(sid,original.id);
        PERFORM pg_temp.removal_check(removed ?& ARRAY['id','session_id','participant_id','role','is_active','heartbeat_at','last_seen','joined_at','disconnected_at','display_name','client_id','removed_at']
            AND removed - ARRAY['id','session_id','participant_id','role','is_active','heartbeat_at','last_seen','joined_at','disconnected_at','display_name','client_id','removed_at']='{}'::JSONB
            AND removed->>'display_name'=original.display_name_snapshot AND removed->>'id'=original.id::TEXT AND removed->>'is_active'='false',label||' legacy response shape and frozen name');
        PERFORM pg_temp.removal_denied(format('SELECT public.operator_remove_session_participant(%L,%L)',sid,original.id),'P0002',label||' retry does not duplicate history');
        RESET ROLE;
        SELECT to_jsonb(r) INTO receipt FROM public.gc08_unified_seat_removals r WHERE seat_id=original.id;
        PERFORM pg_temp.removal_check(receipt->>'display_name_snapshot'=original.display_name_snapshot
            AND receipt->>'role'=role_name AND receipt->>'participant_id'=original.participant_id::TEXT
            AND receipt->>'removed_by_auth_user_id'=gm::TEXT
            AND (receipt->>'session_topology_version')::INTEGER IS NOT DISTINCT FROM topology
            AND (receipt->>'removed_at')::TIMESTAMPTZ=(removed->>'removed_at')::TIMESTAMPTZ
            AND NOT EXISTS(SELECT 1 FROM public.session_participants WHERE id=original.id),label||' exact immutable receipt replaces live seat');
        IF role_name='whitecell_lead' THEN
            PERFORM pg_temp.removal_check(NOT EXISTS(SELECT 1 FROM public.operator_grants WHERE auth_user_id=actor AND surface='whitecell' AND session_id=sid),label||' White Cell grant revoked');
        END IF;
        PERFORM pg_temp.removal_identity(actor); SET LOCAL ROLE authenticated;
        PERFORM pg_temp.removal_denied(format('SELECT public.restore_session_seat_context(%L,%L)',sid,original.id),'42501',label||' removed ID cannot restore');
        -- Unified heartbeat delegates to the legacy helper: a deleted seat is
        -- P0002, unlike restore or a revoked regional seat (42501).
        PERFORM pg_temp.removal_denied(format('SELECT public.heartbeat_session_role_seat(%L,%L,%L,90)',sid,original.id,actor::TEXT),'P0002',label||' removed ID cannot heartbeat');
        PERFORM pg_temp.removal_denied('SELECT * FROM public.gc08_unified_seat_removals','42501',label||' private history read denied');
        PERFORM pg_temp.removal_denied(format('UPDATE public.gc08_unified_seat_removals SET display_name_snapshot=''Forged'' WHERE seat_id=%L',original.id),'42501',label||' browser history rewrite denied');
        IF role_name='whitecell_lead' THEN
            PERFORM pg_temp.removal_denied(format('SELECT public.claim_session_role_seat(%L,%L,''Denied'',%L,90)',sid,role_name,actor::TEXT),'42501',label||' removed White Cell cannot reclaim without grant');
        END IF;
        RESET ROLE;
        PERFORM pg_temp.removal_denied(format('UPDATE public.gc08_unified_seat_removals SET display_name_snapshot=''Forged'' WHERE seat_id=%L',original.id),'23514',label||' privileged receipt update rejected');
        PERFORM pg_temp.removal_denied(format('DELETE FROM public.gc08_unified_seat_removals WHERE seat_id=%L',original.id),'23514',label||' privileged receipt delete rejected');

        -- Legacy normal join remains possible; a removal receipt is never a
        -- lease. Green can join afresh; White Cell needs a newly granted user.
        replacement := CASE WHEN role_name='whitecell_lead' THEN gen_random_uuid() ELSE actor END;
        IF role_name='whitecell_lead' THEN
            INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id) VALUES(replacement,'whitecell',role_name,sid);
        END IF;
        PERFORM pg_temp.removal_identity(replacement); SET LOCAL ROLE authenticated;
        next_seat := public.claim_session_role_seat(sid,role_name,'Replacement',replacement::TEXT,90);
        PERFORM pg_temp.removal_check(next_seat->>'id'<>original.id::TEXT,label||' released capacity yields a new seat ID');
        PERFORM public.disconnect_session_role_seat(sid,(next_seat->>'id')::UUID,replacement::TEXT,90);
        PERFORM pg_temp.removal_check(public.restore_session_seat_context(sid,(next_seat->>'id')::UUID)->'seat'->>'id'=next_seat->>'id',label||' ordinary disconnected rejoin keeps new identity');
        RESET ROLE;
        FOR n IN 2..capacity LOOP
            replacement := gen_random_uuid();
            IF role_name='whitecell_lead' THEN INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id) VALUES(replacement,'whitecell',role_name,sid); END IF;
            PERFORM pg_temp.removal_identity(replacement); SET LOCAL ROLE authenticated;
            PERFORM public.claim_session_role_seat(sid,role_name,'Capacity fixture',replacement::TEXT,90);
            RESET ROLE;
        END LOOP;
        replacement := gen_random_uuid();
        IF role_name='whitecell_lead' THEN INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id) VALUES(replacement,'whitecell',role_name,sid); END IF;
        PERFORM pg_temp.removal_identity(replacement); SET LOCAL ROLE authenticated;
        PERFORM pg_temp.removal_denied(format('SELECT public.claim_session_role_seat(%L,%L,''Full'',%L,90)',sid,role_name,replacement::TEXT),'P0001',label||' capacity remains enforced');
        RESET ROLE; PERFORM pg_temp.removal_identity(gm); SET LOCAL ROLE authenticated;
        PERFORM public.archive_live_demo_session(sid);
        RESET ROLE;
        PERFORM pg_temp.removal_check((SELECT to_jsonb(r)=receipt FROM public.gc08_unified_seat_removals r WHERE seat_id=original.id)
            AND (SELECT session_topology_version IS NOT DISTINCT FROM topology FROM public.sessions WHERE id=sid),label||' archive preserves receipt and topology');
      END LOOP;

    -- Inject a receipt write collision in an owner-created synthetic fixture.
    -- The public RPC must leave both the live seat and grant unchanged.
    INSERT INTO public.sessions(name,status,session_topology_version) VALUES('GC08 atomic failure fixture','active',1) RETURNING id INTO sid;
    actor := gen_random_uuid();
    INSERT INTO public.operator_grants(auth_user_id,surface,role,session_id) VALUES(actor,'whitecell','whitecell_lead',sid);
    PERFORM pg_temp.removal_identity(actor); SET LOCAL ROLE authenticated;
    seat := public.claim_session_role_seat(sid,'whitecell_lead','Atomic fixture',actor::TEXT,90);
    RESET ROLE;
    INSERT INTO public.gc08_unified_seat_removals(seat_id,session_id,participant_id,role,display_name_snapshot,removed_at,removed_by_auth_user_id)
        VALUES((seat->>'id')::UUID,sid,(seat->>'participant_id')::UUID,'whitecell_lead','Existing synthetic receipt',NOW(),gm);
    PERFORM pg_temp.removal_identity(gm); SET LOCAL ROLE authenticated;
    PERFORM pg_temp.removal_denied(format('SELECT public.operator_remove_session_participant(%L,%L)',sid,seat->>'id'),'23505','receipt failure aborts removal');
    RESET ROLE;
    PERFORM pg_temp.removal_check(EXISTS(SELECT 1 FROM public.session_participants WHERE id=(seat->>'id')::UUID AND is_active)
        AND EXISTS(SELECT 1 FROM public.operator_grants WHERE auth_user_id=actor AND session_id=sid)
        AND (SELECT display_name_snapshot='Existing synthetic receipt' FROM public.gc08_unified_seat_removals WHERE seat_id=(seat->>'id')::UUID),'failed receipt retains seat grant and old evidence');
    PERFORM pg_temp.removal_denied('TRUNCATE public.gc08_unified_seat_removals','23514','receipt truncate denied');

    INSERT INTO public.green_roster_approvals(version,snapshot,approved_by,approved_at) VALUES(roster,
        '{"asian_pacific":["ROK","Japan","ASEAN"],"europe":["UK","France","EU"],"aliases":{"South Korea":"ROK"},"source_references":["GC08 rollback-only removal fixture; not exercise approval"]}',
        'GC08 rollback-only synthetic fixture; not exercise approval',NOW());
    FOREACH model IN ARRAY ARRAY['paired','shared'] LOOP
        PERFORM pg_temp.removal_identity(gm);
        INSERT INTO public.sessions(name,status,session_topology_version) VALUES('GC08 regional removal '||model,'active',1) RETURNING id INTO sid;
        SET LOCAL ROLE authenticated;
        IF model='paired' THEN PERFORM public.configure_session_green_topology(sid,2,roster); role_name:='green_europe_scribe';
        ELSE PERFORM public.configure_session_green_shared_facilitator(sid,roster); role_name:='green_shared_facilitator'; END IF;
        RESET ROLE; actor:=gen_random_uuid(); PERFORM pg_temp.removal_identity(actor); SET LOCAL ROLE authenticated;
        seat:=public.claim_session_role_seat(sid,role_name,'Regional retained name',actor::TEXT,90);
        RESET ROLE; PERFORM pg_temp.removal_identity(gm); SET LOCAL ROLE authenticated;
        PERFORM public.operator_remove_session_participant(sid,(seat->>'id')::UUID);
        RESET ROLE;
        PERFORM pg_temp.removal_check(EXISTS(SELECT 1 FROM public.session_participants WHERE id=(seat->>'id')::UUID AND revoked_at IS NOT NULL AND NOT is_active AND display_name_snapshot='Regional retained name')
            AND NOT EXISTS(SELECT 1 FROM public.gc08_unified_seat_removals WHERE session_id=sid),model||' regional tombstone unchanged');
        PERFORM pg_temp.removal_identity(actor); SET LOCAL ROLE authenticated;
        PERFORM pg_temp.removal_denied(format('SELECT public.claim_session_role_seat(%L,%L,''Denied'',%L,90)',sid,role_name,actor::TEXT),'42501',model||' revoked regional claim remains denied');
        PERFORM pg_temp.removal_denied(format('SELECT public.heartbeat_session_role_seat(%L,%L,%L,90)',sid,seat->>'id',actor::TEXT),'42501',model||' revoked regional heartbeat remains denied');
        RESET ROLE;
    END LOOP;
    PERFORM pg_temp.removal_check((SELECT count(*) FROM public.gc08_unified_seat_removals)=row_count_before+4,'only three removals and one deliberate collision fixture recorded');
    PERFORM set_config('gc08_removal.result',jsonb_build_object('result','PASS','assertions',(SELECT count(*) FROM pg_temp.gc08_removal_checks),
        'checks',(SELECT jsonb_agg(c.label ORDER BY c.label) FROM pg_temp.gc08_removal_checks c))::TEXT,true);
END $suite$;
SELECT COALESCE(NULLIF(current_setting('gc08_removal.result',true),'')::JSONB,'{"result":"FAIL","reason":"missing report"}'::JSONB) AS gc08_removal_result;
ROLLBACK;
