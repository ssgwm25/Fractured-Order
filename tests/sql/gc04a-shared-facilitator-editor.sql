-- Paste this ENTIRE file into Supabase SQL Editor and run as postgres.
-- No parameters, existing seats, Auth accounts or manual UUID lookup required.
-- Run against the migrated rehearsal project. All synthetic fixtures roll back.
-- Empty roster fixture follows the GC-03 SQL suite; it is NOT exercise approval.
-- Tests database authority with simulated JWT claims, not hosted token issuance.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '10s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claims = '{}';

DO $$ BEGIN
    IF to_regprocedure('public.configure_session_green_shared_facilitator(uuid,text)') IS NULL THEN
        RAISE EXCEPTION 'GC04A prerequisite missing: install 2026-09-24_gc04a_shared_facilitator.sql';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.restore_session_seat_context(uuid,uuid)', 'EXECUTE')
        OR has_function_privilege('anon', 'public.restore_session_seat_context(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'GC04A restore RPC grants are incorrect';
    END IF;
END $$;

CREATE TEMP TABLE gc04a_run AS SELECT gen_random_uuid() AS session_id,
    gen_random_uuid() AS other_session_id,
    'GC04A-' || upper(gen_random_uuid()::TEXT) AS session_code,
    'green-roster-v' || (extract(epoch FROM clock_timestamp()) * 1000000)::BIGINT::TEXT
        || floor(random() * 1000000000)::BIGINT::TEXT AS roster_version;
CREATE TEMP TABLE gc04a_actors (
    role TEXT PRIMARY KEY, delegation TEXT, semantic_role TEXT NOT NULL,
    workspace TEXT NOT NULL, auth_id UUID NOT NULL DEFAULT gen_random_uuid(),
    seat_id UUID, participant_id UUID
);
INSERT INTO gc04a_actors(role, delegation, semantic_role, workspace) VALUES
    ('green_asian_pacific_scribe', 'asian_pacific', 'scribe', 'facilitator'),

    ('green_europe_scribe', 'europe', 'scribe', 'facilitator'),
    ('green_shared_facilitator', NULL, 'facilitator', 'scribe');
CREATE TEMP TABLE gc04a_results(role TEXT, assertion TEXT, PRIMARY KEY(role, assertion));
GRANT SELECT ON gc04a_run, gc04a_actors TO authenticated;
GRANT INSERT ON gc04a_results TO authenticated;

CREATE FUNCTION pg_temp.gc04a_identity(identity_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    PERFORM set_config('request.jwt.claim.sub', COALESCE(identity_id::TEXT, ''), true);
    PERFORM set_config('request.jwt.claims', CASE WHEN identity_id IS NULL THEN '{}'
        ELSE jsonb_build_object('sub', identity_id, 'role', 'authenticated')::TEXT END, true);
END $$;
CREATE FUNCTION pg_temp.gc04a_check(ok BOOLEAN, actor_role TEXT, label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    IF ok IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'GC04A failed [%]: %', actor_role, label;
    END IF;
    INSERT INTO gc04a_results VALUES(actor_role, label);
END $$;
CREATE FUNCTION pg_temp.gc04a_restored(result JSONB, actor gc04a_actors, expected_session UUID)
RETURNS BOOLEAN LANGUAGE SQL AS $$
    SELECT result->'seat'->>'id' = (actor).seat_id::TEXT
        AND result->'seat'->>'participant_id' = (actor).participant_id::TEXT
        AND result->'seat'->>'session_id' = expected_session::TEXT
        AND result->'seat'->>'role' = (actor).role
        AND (result->'seat'->>'delegation_id' IS NOT DISTINCT FROM (actor).delegation)
        AND result->'seat'->>'is_active' = 'true'
        AND result->'seat'->>'revoked_at' IS NULL
        AND result->'session'->>'id' = expected_session::TEXT
        AND result->'session'->>'session_topology_version' = '2' AND result->'session'->>'green_seat_model' = 'shared_facilitator_v1'
        AND result->'session'->>'status' = 'active'
$$;

-- New, uncommitted fixtures only. Never select or mutate an existing exercise.
INSERT INTO public.green_roster_approvals(version, snapshot, approved_by, approved_at)
SELECT roster_version,
    '{"asian_pacific":[],"europe":[],"aliases":{},"source_references":["GC04A rolled-back synthetic SQL fixture only"]}'::JSONB,
    'Regression fixture, not exercise approval', NOW() FROM gc04a_run;
INSERT INTO public.sessions(id, name, status, session_topology_version, session_code)
SELECT session_id, 'GC04A synthetic ' || session_id, 'active', 2, session_code FROM gc04a_run
UNION ALL
SELECT other_session_id, 'GC04A synthetic ' || other_session_id, 'active', 2, NULL FROM gc04a_run;
UPDATE public.sessions s SET green_seat_model = CASE WHEN s.id = r.session_id THEN 'shared_facilitator_v1' ELSE NULL END, green_roster_version = a.version,
    green_roster_snapshot = a.snapshot || jsonb_build_object('approved_by', a.approved_by, 'approved_at', a.approved_at)
FROM gc04a_run r JOIN public.green_roster_approvals a ON a.version = r.roster_version
WHERE s.id IN (r.session_id, r.other_session_id);
INSERT INTO public.game_state(session_id, move, phase)
SELECT session_id, 1, 1 FROM gc04a_run UNION ALL SELECT other_session_id, 1, 1 FROM gc04a_run;

DO $$ DECLARE actor gc04a_actors; run gc04a_run; seat JSONB;
BEGIN
    SELECT * INTO STRICT run FROM gc04a_run;
    FOR actor IN SELECT * FROM gc04a_actors ORDER BY role LOOP
        PERFORM pg_temp.gc04a_identity(actor.auth_id);
        SET LOCAL ROLE authenticated;
        seat := public.claim_session_role_seat(run.session_id, actor.role,
            'GC04A synthetic ' || actor.role, 'gc04a-' || actor.auth_id, 90);
        PERFORM pg_temp.gc04a_check(seat->>'role' = actor.role
            AND (seat->>'delegation_id' IS NOT DISTINCT FROM actor.delegation) AND seat->>'is_active' = 'true'
            AND seat->>'id' IS NOT NULL AND seat->>'participant_id' IS NOT NULL,
            actor.role, 'join');
        RESET ROLE;
        UPDATE gc04a_actors SET seat_id = (seat->>'id')::UUID,
            participant_id = (seat->>'participant_id')::UUID WHERE role = actor.role;
    END LOOP;
    PERFORM pg_temp.gc04a_identity(NULL);
END $$;

CREATE TEMP TABLE gc04a_artifacts AS
SELECT gen_random_uuid() AS id, delegation, forwarded
FROM (VALUES ('asian_pacific'),('europe')) d(delegation)
CROSS JOIN (VALUES (true),(false)) f(forwarded);
GRANT SELECT ON gc04a_artifacts TO authenticated;

CREATE FUNCTION pg_temp.gc04a_denied(statement TEXT, expected_code TEXT, label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE <> expected_code THEN RAISE; END IF;
        PERFORM pg_temp.gc04a_check(true,'boundary',label);
        RETURN;
    END;
    RAISE EXCEPTION 'GC04A expected denial: %',label;
END $$;

-- Exercise installed action triggers and RLS with each Scribe's JWT identity.
-- These synthetic transport records are never retained as participant decisions.
DO $$ DECLARE actor gc04a_actors; run gc04a_run; affected INTEGER;
BEGIN
    SELECT * INTO STRICT run FROM gc04a_run;
    FOR actor IN SELECT * FROM gc04a_actors WHERE delegation IS NOT NULL LOOP
        PERFORM pg_temp.gc04a_identity(actor.auth_id);
        SET LOCAL ROLE authenticated;
        INSERT INTO public.actions(id,session_id,team,delegation_id,move,phase,mechanism,sector,artifact_type,proposal_recipient_team,goal)
            SELECT id,run.session_id,'green',delegation,1,1,'Proposal','','proposal','blue','GC04A synthetic transport fixture'
            FROM gc04a_artifacts WHERE delegation=actor.delegation;
        UPDATE public.actions SET ally_contingencies='Proposal Details'||chr(10)||'Scribe Handoff: forwarded'
            WHERE id IN (SELECT id FROM gc04a_artifacts WHERE delegation=actor.delegation AND forwarded);
        RESET ROLE;
        PERFORM pg_temp.gc04a_identity(NULL);
    END LOOP;
    FOR actor IN SELECT * FROM gc04a_actors LOOP
        PERFORM pg_temp.gc04a_identity(actor.auth_id);
        SET LOCAL ROLE authenticated;
        PERFORM pg_temp.gc04a_check((SELECT count(*)=2 FROM public.actions WHERE session_id=run.session_id),
            'boundary',actor.role||' exact RLS row count');
        IF actor.delegation IS NOT NULL THEN
            PERFORM pg_temp.gc04a_check(NOT EXISTS (SELECT 1 FROM public.actions WHERE session_id=run.session_id
                AND delegation_id<>actor.delegation),'boundary',actor.role||' other region hidden');
            PERFORM pg_temp.gc04a_denied(format(
                'INSERT INTO public.actions(session_id,team,delegation_id,move,phase,mechanism,sector) VALUES(%L,''green'',%L,1,1,''fixture'','''')',
                run.session_id,CASE WHEN actor.delegation='europe' THEN 'asian_pacific' ELSE 'europe' END),
                '42501',actor.role||' cross-region insert denied');
        ELSE
            PERFORM pg_temp.gc04a_check(NOT EXISTS (SELECT 1 FROM public.actions WHERE session_id=run.session_id
                AND workflow_state<>'forwarded_to_facilitator'),'boundary','shared drafts hidden');
            PERFORM pg_temp.gc04a_check(NOT public.green_has_capability(run.session_id,'submit')
                AND NOT public.green_has_capability(run.session_id,'rfi') AND NOT public.green_has_capability(run.session_id,'thread'),
                'boundary','deferred capabilities closed');
            PERFORM pg_temp.gc04a_check(NOT public.green_can_read_record('actions',jsonb_build_object(
                'session_id',run.session_id,'team','green','delegation_id','europe','workflow_state','returned_to_team'))
                AND NOT public.green_can_read_record('scoped_notetaker_data',jsonb_build_object('session_id',run.session_id))
                AND NOT public.green_can_read_record('communications',jsonb_build_object('session_id',run.session_id,
                    'type','PROPOSAL_FORWARDED','from_role','white_cell','to_role','green_shared_facilitator')),
                'boundary','returned drafts notes and recipient threads denied');
            BEGIN
                UPDATE public.actions SET goal='must not persist' WHERE session_id=run.session_id;
                GET DIAGNOSTICS affected = ROW_COUNT;
            EXCEPTION WHEN insufficient_privilege THEN affected := 0;
            END;
            PERFORM pg_temp.gc04a_check(affected=0,'boundary','shared UPDATE cannot affect records');
            PERFORM pg_temp.gc04a_denied(format(
                'INSERT INTO public.requests(session_id,team,delegation_id,move,phase,query) VALUES(%L,''green'',''europe'',1,1,''must not persist'')',
                run.session_id),'42501','shared RFI insert denied');
            PERFORM pg_temp.gc04a_denied(format('SELECT public.configure_session_green_shared_facilitator(%L,%L)',
                run.other_session_id,run.roster_version),'42501','participant cannot configure model');
        END IF;
        RESET ROLE;
        PERFORM pg_temp.gc04a_identity(NULL);
    END LOOP;

    -- A different user cannot take a second shared seat or claim either retired
    -- regional Facilitator role in the new model. Old four-seat session rejects
    -- the new shared identifier, independently of any browser parameters.
    PERFORM pg_temp.gc04a_identity(gen_random_uuid());
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.gc04a_denied(format('SELECT public.claim_session_role_seat(%L,''green_shared_facilitator'',''Synthetic contender'',%L)',
        run.session_id,'gc04a-contender-'||gen_random_uuid()),'P0001','single shared seat full');
    PERFORM pg_temp.gc04a_denied(format('SELECT public.claim_session_role_seat(%L,''green_asian_pacific_facilitator'',NULL,%L)',
        run.session_id,'gc04a-ap-'||gen_random_uuid()),'42501','regional AP Facilitator denied in shared model');
    PERFORM pg_temp.gc04a_denied(format('SELECT public.claim_session_role_seat(%L,''green_europe_facilitator'',NULL,%L)',
        run.session_id,'gc04a-eu-'||gen_random_uuid()),'42501','regional Europe Facilitator denied in shared model');
    PERFORM pg_temp.gc04a_denied(format('SELECT public.claim_session_role_seat(%L,''green_shared_facilitator'',NULL,%L)',
        run.other_session_id,'gc04a-old-'||gen_random_uuid()),'42501','shared role denied in old model');
    RESET ROLE;
    PERFORM pg_temp.gc04a_identity(NULL);
    PERFORM pg_temp.gc04a_denied(format('UPDATE public.sessions SET green_seat_model=NULL WHERE id=%L',run.session_id),
        '23514','model frozen after seat and evidence');
END $$;

DO $$ DECLARE actor gc04a_actors; run gc04a_run; result JSONB; foreign_seat UUID; denied BOOLEAN;
BEGIN
    SELECT * INTO STRICT run FROM gc04a_run;
    FOR actor IN SELECT * FROM gc04a_actors ORDER BY role LOOP
        -- Another occupied seat belonging to a different authenticated identity.
        SELECT seat_id INTO STRICT foreign_seat FROM gc04a_actors
            WHERE role <> actor.role ORDER BY role LIMIT 1;
        PERFORM pg_temp.gc04a_identity(actor.auth_id);
        SET LOCAL ROLE authenticated;
        result := public.lookup_joinable_session_by_code(run.session_code);
        PERFORM pg_temp.gc04a_check(result->>'id' = run.session_id::TEXT
            AND result->>'session_topology_version' = '2' AND result->>'green_seat_model' = 'shared_facilitator_v1', actor.role, 'lookup topology');
        result := public.restore_session_seat_context(run.session_id, actor.seat_id);
        PERFORM pg_temp.gc04a_check(pg_temp.gc04a_restored(result, actor, run.session_id), actor.role, 'restore identity');
        PERFORM pg_temp.gc04a_check(public.green_semantic_role(run.session_id) = actor.semantic_role
            AND public.live_demo_participant_surface(run.session_id) = actor.workspace,
            actor.role, 'legacy workspace mapping');
        denied := false;
        BEGIN
            PERFORM public.restore_session_seat_context(run.session_id, foreign_seat);
        EXCEPTION WHEN insufficient_privilege THEN
            IF SQLERRM <> 'GC04_INVALID_SESSION_SEAT' THEN RAISE; END IF;
            denied := true;
        END;
        PERFORM pg_temp.gc04a_check(denied, actor.role, 'foreign seat denied');
        denied := false;
        BEGIN
            PERFORM public.restore_session_seat_context(run.other_session_id, actor.seat_id);
        EXCEPTION WHEN insufficient_privilege THEN
            IF SQLERRM <> 'GC04_INVALID_SESSION_SEAT' THEN RAISE; END IF;
            denied := true;
        END;
        PERFORM pg_temp.gc04a_check(denied, actor.role, 'wrong session denied');
        PERFORM public.disconnect_session_role_seat(run.session_id, actor.seat_id, 'gc04a-' || actor.auth_id, 90);
        result := public.restore_session_seat_context(run.session_id, actor.seat_id);
        PERFORM pg_temp.gc04a_check(pg_temp.gc04a_restored(result, actor, run.session_id), actor.role, 'disconnected rejoin');
        RESET ROLE;
        PERFORM pg_temp.gc04a_identity(NULL);
        UPDATE public.session_participants SET heartbeat_at = NOW() - INTERVAL '91 seconds',
            last_seen = NOW() - INTERVAL '91 seconds'
            WHERE id = actor.seat_id AND session_id = run.session_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'GC04A synthetic lease missing'; END IF;
        PERFORM pg_temp.gc04a_identity(actor.auth_id);
        SET LOCAL ROLE authenticated;
        result := public.restore_session_seat_context(run.session_id, actor.seat_id);
        PERFORM pg_temp.gc04a_check(pg_temp.gc04a_restored(result, actor, run.session_id), actor.role, 'stale rejoin');
        RESET ROLE;
        PERFORM pg_temp.gc04a_identity(NULL);
    END LOOP;

    -- Revoke only after every foreign-seat check; revoked foreign fixtures could
    -- otherwise hide an ownership defect. Only this run's new rows are touched.
    FOR actor IN SELECT * FROM gc04a_actors ORDER BY role LOOP
        UPDATE public.session_participants SET revoked_at = NOW(), is_active = false
            WHERE id = actor.seat_id AND session_id = run.session_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'GC04A synthetic revocation seat missing'; END IF;
        PERFORM pg_temp.gc04a_identity(actor.auth_id);
        SET LOCAL ROLE authenticated;
        denied := false;
        BEGIN
            PERFORM public.restore_session_seat_context(run.session_id, actor.seat_id);
        EXCEPTION WHEN insufficient_privilege THEN
            IF SQLERRM <> 'GC04_INVALID_SESSION_SEAT' THEN RAISE; END IF;
            denied := true;
        END;
        PERFORM pg_temp.gc04a_check(denied, actor.role, 'revoked seat denied');
        RESET ROLE;
        PERFORM pg_temp.gc04a_identity(NULL);
    END LOOP;
    IF (SELECT count(*) FROM gc04a_results WHERE role LIKE 'green_%') <> 27 THEN
        RAISE EXCEPTION 'GC04A incomplete matrix: expected 27 actor assertions';
    END IF;
END $$;

DO $$ DECLARE run gc04a_run; gm UUID := gen_random_uuid(); fresh UUID := gen_random_uuid(); result public.sessions;
BEGIN
    SELECT * INTO STRICT run FROM gc04a_run;
    INSERT INTO public.sessions(id,name,status,session_topology_version) VALUES(fresh,'GC04A setup fixture','active',1);
    INSERT INTO public.operator_grants(auth_user_id,surface,role) VALUES(gm,'gamemaster','white');
    PERFORM pg_temp.gc04a_identity(gm);
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.gc04a_denied(format('SELECT public.configure_session_green_shared_facilitator(%L,NULL)',fresh),
        '23514','missing approval rejected');
    PERFORM pg_temp.gc04a_denied(format('SELECT public.configure_session_green_shared_facilitator(%L,''not-approved'')',fresh),
        '23514','unknown approval rejected');
    SELECT * INTO result FROM public.configure_session_green_shared_facilitator(fresh,run.roster_version);
    PERFORM pg_temp.gc04a_check(result.green_seat_model='shared_facilitator_v1'
        AND result.session_topology_version=2 AND result.green_roster_version=run.roster_version,
        'boundary','GM configures fresh approved model atomically');
    RESET ROLE;
    PERFORM pg_temp.gc04a_identity(NULL);
    PERFORM pg_temp.gc04a_denied(format('UPDATE public.sessions SET green_seat_model=NULL WHERE id=%L',run.session_id),
        '23514','model remains frozen after revocation');
END $$;

SELECT role, 'PASS' AS status, count(*) AS assertions_passed,
    string_agg(assertion, ', ' ORDER BY assertion) AS checks
FROM gc04a_results GROUP BY role ORDER BY role;
ROLLBACK;
