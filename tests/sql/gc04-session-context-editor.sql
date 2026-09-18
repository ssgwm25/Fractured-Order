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
    IF to_regprocedure('public.restore_session_seat_context(uuid,uuid)') IS NULL THEN
        RAISE EXCEPTION 'GC04 prerequisite missing: install 2026-09-22_gc04_session_context.sql';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.restore_session_seat_context(uuid,uuid)', 'EXECUTE')
        OR has_function_privilege('anon', 'public.restore_session_seat_context(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'GC04 restore RPC grants are incorrect';
    END IF;
END $$;

CREATE TEMP TABLE gc04_run AS SELECT gen_random_uuid() AS session_id,
    gen_random_uuid() AS other_session_id,
    'GC04-' || upper(gen_random_uuid()::TEXT) AS session_code,
    'green-roster-v' || (extract(epoch FROM clock_timestamp()) * 1000000)::BIGINT::TEXT
        || floor(random() * 1000000000)::BIGINT::TEXT AS roster_version;
CREATE TEMP TABLE gc04_actors (
    role TEXT PRIMARY KEY, delegation TEXT NOT NULL, semantic_role TEXT NOT NULL,
    workspace TEXT NOT NULL, auth_id UUID NOT NULL DEFAULT gen_random_uuid(),
    seat_id UUID, participant_id UUID
);
INSERT INTO gc04_actors(role, delegation, semantic_role, workspace) VALUES
    ('green_asian_pacific_scribe', 'asian_pacific', 'scribe', 'facilitator'),
    ('green_asian_pacific_facilitator', 'asian_pacific', 'facilitator', 'scribe'),
    ('green_europe_scribe', 'europe', 'scribe', 'facilitator'),
    ('green_europe_facilitator', 'europe', 'facilitator', 'scribe');
CREATE TEMP TABLE gc04_results(role TEXT, assertion TEXT, PRIMARY KEY(role, assertion));
GRANT SELECT ON gc04_run, gc04_actors TO authenticated;
GRANT INSERT ON gc04_results TO authenticated;

CREATE FUNCTION pg_temp.gc04_identity(identity_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    PERFORM set_config('request.jwt.claim.sub', COALESCE(identity_id::TEXT, ''), true);
    PERFORM set_config('request.jwt.claims', CASE WHEN identity_id IS NULL THEN '{}'
        ELSE jsonb_build_object('sub', identity_id, 'role', 'authenticated')::TEXT END, true);
END $$;
CREATE FUNCTION pg_temp.gc04_check(ok BOOLEAN, actor_role TEXT, label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
    IF ok IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'GC04 failed [%]: %', actor_role, label;
    END IF;
    INSERT INTO gc04_results VALUES(actor_role, label);
END $$;
CREATE FUNCTION pg_temp.gc04_restored(result JSONB, actor gc04_actors, expected_session UUID)
RETURNS BOOLEAN LANGUAGE SQL AS $$
    SELECT result->'seat'->>'id' = (actor).seat_id::TEXT
        AND result->'seat'->>'participant_id' = (actor).participant_id::TEXT
        AND result->'seat'->>'session_id' = expected_session::TEXT
        AND result->'seat'->>'role' = (actor).role
        AND result->'seat'->>'delegation_id' = (actor).delegation
        AND result->'seat'->>'is_active' = 'true'
        AND result->'seat'->>'revoked_at' IS NULL
        AND result->'session'->>'id' = expected_session::TEXT
        AND result->'session'->>'session_topology_version' = '2'
        AND result->'session'->>'status' = 'active'
$$;

-- New, uncommitted fixtures only. Never select or mutate an existing exercise.
INSERT INTO public.green_roster_approvals(version, snapshot, approved_by, approved_at)
SELECT roster_version,
    '{"asian_pacific":[],"europe":[],"aliases":{},"source_references":["GC04 rolled-back synthetic SQL fixture only"]}'::JSONB,
    'Regression fixture, not exercise approval', NOW() FROM gc04_run;
INSERT INTO public.sessions(id, name, status, session_topology_version, session_code)
SELECT session_id, 'GC04 synthetic ' || session_id, 'active', 2, session_code FROM gc04_run
UNION ALL
SELECT other_session_id, 'GC04 synthetic ' || other_session_id, 'active', 2, NULL FROM gc04_run;
UPDATE public.sessions s SET green_roster_version = a.version,
    green_roster_snapshot = a.snapshot || jsonb_build_object('approved_by', a.approved_by, 'approved_at', a.approved_at)
FROM gc04_run r JOIN public.green_roster_approvals a ON a.version = r.roster_version
WHERE s.id IN (r.session_id, r.other_session_id);
INSERT INTO public.game_state(session_id, move, phase)
SELECT session_id, 1, 1 FROM gc04_run UNION ALL SELECT other_session_id, 1, 1 FROM gc04_run;

DO $$ DECLARE actor gc04_actors; run gc04_run; seat JSONB;
BEGIN
    SELECT * INTO STRICT run FROM gc04_run;
    FOR actor IN SELECT * FROM gc04_actors ORDER BY role LOOP
        PERFORM pg_temp.gc04_identity(actor.auth_id);
        SET LOCAL ROLE authenticated;
        seat := public.claim_session_role_seat(run.session_id, actor.role,
            'GC04 synthetic ' || actor.role, 'gc04-' || actor.auth_id, 90);
        PERFORM pg_temp.gc04_check(seat->>'role' = actor.role
            AND seat->>'delegation_id' = actor.delegation AND seat->>'is_active' = 'true'
            AND seat->>'id' IS NOT NULL AND seat->>'participant_id' IS NOT NULL,
            actor.role, 'join');
        RESET ROLE;
        UPDATE gc04_actors SET seat_id = (seat->>'id')::UUID,
            participant_id = (seat->>'participant_id')::UUID WHERE role = actor.role;
    END LOOP;
    PERFORM pg_temp.gc04_identity(NULL);
END $$;

DO $$ DECLARE actor gc04_actors; run gc04_run; result JSONB; foreign_seat UUID; denied BOOLEAN;
BEGIN
    SELECT * INTO STRICT run FROM gc04_run;
    FOR actor IN SELECT * FROM gc04_actors ORDER BY role LOOP
        -- An occupied seat from the other region, belonging to another identity.
        SELECT seat_id INTO STRICT foreign_seat FROM gc04_actors
            WHERE delegation <> actor.delegation AND semantic_role = actor.semantic_role;
        PERFORM pg_temp.gc04_identity(actor.auth_id);
        SET LOCAL ROLE authenticated;
        result := public.lookup_joinable_session_by_code(run.session_code);
        PERFORM pg_temp.gc04_check(result->>'id' = run.session_id::TEXT
            AND result->>'session_topology_version' = '2', actor.role, 'lookup topology');
        result := public.restore_session_seat_context(run.session_id, actor.seat_id);
        PERFORM pg_temp.gc04_check(pg_temp.gc04_restored(result, actor, run.session_id), actor.role, 'restore identity');
        PERFORM pg_temp.gc04_check(public.green_semantic_role(run.session_id) = actor.semantic_role
            AND public.live_demo_participant_surface(run.session_id) = actor.workspace,
            actor.role, 'legacy workspace mapping');
        denied := false;
        BEGIN
            PERFORM public.restore_session_seat_context(run.session_id, foreign_seat);
        EXCEPTION WHEN insufficient_privilege THEN
            IF SQLERRM <> 'GC04_INVALID_SESSION_SEAT' THEN RAISE; END IF;
            denied := true;
        END;
        PERFORM pg_temp.gc04_check(denied, actor.role, 'foreign seat denied');
        denied := false;
        BEGIN
            PERFORM public.restore_session_seat_context(run.other_session_id, actor.seat_id);
        EXCEPTION WHEN insufficient_privilege THEN
            IF SQLERRM <> 'GC04_INVALID_SESSION_SEAT' THEN RAISE; END IF;
            denied := true;
        END;
        PERFORM pg_temp.gc04_check(denied, actor.role, 'wrong session denied');
        PERFORM public.disconnect_session_role_seat(run.session_id, actor.seat_id, 'gc04-' || actor.auth_id, 90);
        result := public.restore_session_seat_context(run.session_id, actor.seat_id);
        PERFORM pg_temp.gc04_check(pg_temp.gc04_restored(result, actor, run.session_id), actor.role, 'disconnected rejoin');
        RESET ROLE;
        PERFORM pg_temp.gc04_identity(NULL);
        UPDATE public.session_participants SET heartbeat_at = NOW() - INTERVAL '91 seconds',
            last_seen = NOW() - INTERVAL '91 seconds'
            WHERE id = actor.seat_id AND session_id = run.session_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'GC04 synthetic lease missing'; END IF;
        PERFORM pg_temp.gc04_identity(actor.auth_id);
        SET LOCAL ROLE authenticated;
        result := public.restore_session_seat_context(run.session_id, actor.seat_id);
        PERFORM pg_temp.gc04_check(pg_temp.gc04_restored(result, actor, run.session_id), actor.role, 'stale rejoin');
        RESET ROLE;
        PERFORM pg_temp.gc04_identity(NULL);
    END LOOP;

    -- Revoke only after every foreign-seat check; revoked foreign fixtures could
    -- otherwise hide an ownership defect. Only this run's new rows are touched.
    FOR actor IN SELECT * FROM gc04_actors ORDER BY role LOOP
        UPDATE public.session_participants SET revoked_at = NOW(), is_active = false
            WHERE id = actor.seat_id AND session_id = run.session_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'GC04 synthetic revocation seat missing'; END IF;
        PERFORM pg_temp.gc04_identity(actor.auth_id);
        SET LOCAL ROLE authenticated;
        denied := false;
        BEGIN
            PERFORM public.restore_session_seat_context(run.session_id, actor.seat_id);
        EXCEPTION WHEN insufficient_privilege THEN
            IF SQLERRM <> 'GC04_INVALID_SESSION_SEAT' THEN RAISE; END IF;
            denied := true;
        END;
        PERFORM pg_temp.gc04_check(denied, actor.role, 'revoked seat denied');
        RESET ROLE;
        PERFORM pg_temp.gc04_identity(NULL);
    END LOOP;
    IF (SELECT count(*) FROM gc04_results) <> 36 THEN
        RAISE EXCEPTION 'GC04 incomplete matrix: expected 36 assertions';
    END IF;
END $$;

SELECT role, 'PASS' AS status, count(*) AS assertions_passed,
    string_agg(assertion, ', ' ORDER BY assertion) AS checks
FROM gc04_results GROUP BY role ORDER BY role;
ROLLBACK;
